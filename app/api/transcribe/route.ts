import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient, UPLOAD_BUCKET } from "@/lib/supabase/admin";
import { ensureWhisperCompatible } from "@/lib/ffmpeg";
import {
  getLanguage,
  getTranslationPrompt,
  whisperNameToCode,
} from "@/lib/languages";
import {
  wordsToSegments,
  segmentsToSrtString,
  type SrtSegment,
  type WordTimestamp,
} from "@/lib/srt";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  let storagePath: string | null = null;

  try {
    const body = await request.json();
    storagePath = body.storagePath as string | null;
    const mode = (body.mode as string | null) ?? "translate";
    const targetLangValue = body.targetLang as string | null;
    const originalName = (body.originalName as string | null) ?? "audio.mp4";

    if (!storagePath) {
      return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
    }
    if (mode === "translate" && !targetLangValue) {
      return NextResponse.json({ error: "targetLang is required in translate mode" }, { status: 400 });
    }

    const targetLang = mode === "translate" ? getLanguage(targetLangValue!) : null;
    const admin = createAdminClient();

    // ── Step 1: Download file from Supabase Storage ───────────────────────────
    const { data: blob, error: downloadError } = await admin.storage
      .from(UPLOAD_BUCKET)
      .download(storagePath);

    if (downloadError || !blob) {
      throw new Error(downloadError?.message ?? "Failed to download file from storage");
    }

    // ── Step 2: Convert to Whisper-compatible format if needed (e.g. .mov → mp3)
    const { file: rawAudioFile, cleanup: cleanupTempFiles } =
      await ensureWhisperCompatible(blob, originalName);

    // ── Step 3: Voice isolation ───────────────────────────────────────────────
    let audioFile = rawAudioFile;
    try {
      const isolationForm = new FormData();
      isolationForm.append("audio", rawAudioFile, rawAudioFile.name);

      const isolationRes = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        body: isolationForm,
      });

      if (isolationRes.ok) {
        const isolatedBuffer = await isolationRes.arrayBuffer();
        audioFile = new File([isolatedBuffer], rawAudioFile.name, { type: "audio/mpeg" });
        console.log("[/api/transcribe] voice isolation applied");
      } else {
        const errText = await isolationRes.text();
        console.warn(`[/api/transcribe] voice isolation failed (${isolationRes.status}): ${errText} — using original audio`);
      }
    } catch (isolationErr) {
      console.warn("[/api/transcribe] voice isolation error — using original audio:", isolationErr);
    }

    // ── Step 4: Transcribe with ElevenLabs Scribe ────────────────────────────
    const elevenForm = new FormData();
    elevenForm.append("file", audioFile, audioFile.name);
    elevenForm.append("model_id", "scribe_v1");
    elevenForm.append("language_code", "ar");
    elevenForm.append("timestamps_granularity", "word");

    const scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: elevenForm,
    });

    await cleanupTempFiles();

    if (!scribeRes.ok) {
      const errText = await scribeRes.text();
      throw new Error(`ElevenLabs Scribe error ${scribeRes.status}: ${errText}`);
    }

    const scribeData = await scribeRes.json() as {
      language_code?: string;
      text?: string;
      words?: Array<{ text: string; type: string; start: number; end: number }>;
    };

    const wordTokens: WordTimestamp[] = (scribeData.words ?? [])
      .filter((w) => w.type === "word")
      .map((w) => ({ word: w.text, start: w.start, end: w.end }));

    let segments = wordsToSegments(wordTokens);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No speech detected in the file" },
        { status: 422 }
      );
    }

    // Force Arabic since we pass language_code: "ar"; use full name for downstream logic
    const detectedLanguage = "arabic";

    // ── Step 4: Translate with Claude — only in translate mode ────────────────
    if (mode === "translate" && targetLang) {
      const detectedCode = whisperNameToCode(detectedLanguage);
      const isSameLanguage = detectedCode === targetLang.whisperCode;
      if (!isSameLanguage) {
        segments = await translateSegments(segments, detectedLanguage, targetLang);
      }
    }

    // ── Step 5: Build and return SRT ──────────────────────────────────────────
    const srtContent = segmentsToSrtString(segments);
    const baseName = originalName.replace(/\.[^/.]+$/, "");
    const suffix = mode === "translate" && targetLang ? targetLang.value : "transcribed";
    const filename = `${baseName}_${suffix}.srt`;

    return new NextResponse(srtContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Detected-Language": detectedLanguage,
        "X-Segment-Count": String(segments.length),
      },
    });
  } catch (error) {
    console.error("[/api/transcribe]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (storagePath) {
      const admin = createAdminClient();
      await admin.storage.from(UPLOAD_BUCKET).remove([storagePath]);
    }
  }
}

// ── Translation helper ─────────────────────────────────────────────────────────

async function translateSegments(
  segments: SrtSegment[],
  detectedLanguage: string,
  targetLang: ReturnType<typeof getLanguage>
): Promise<SrtSegment[]> {
  const systemPrompt = getTranslationPrompt(detectedLanguage, targetLang);
  const BATCH_SIZE = 100;
  const translated: SrtSegment[] = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const input = batch.map((s) => ({ index: s.index, text: s.text }));

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: "user", content: JSON.stringify(input) + "\n\nYOUR RESPONSE MUST START WITH [ AND END WITH ]. DO NOT write anything before [. DO NOT write anything after ]. NO markdown. NO code fences. NO explanation. ONLY the raw JSON array." },
      ],
    });

    const rawContent = message.content[0];
    if (rawContent.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let parsed: Array<{ index: number; text: string }>;
    try {
      const cleaned = rawContent.text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Claude returned invalid JSON for translation batch");
    }

    for (const seg of batch) {
      const translatedSeg = parsed.find((p) => p.index === seg.index);
      translated.push({ ...seg, text: translatedSeg?.text ?? seg.text });
    }
  }

  return translated;
}
