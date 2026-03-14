import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient, UPLOAD_BUCKET } from "@/lib/supabase/admin";
import { ensureWhisperCompatible } from "@/lib/ffmpeg";
import {
  getLanguage,
  getTranslationPrompt,
  whisperNameToCode,
} from "@/lib/languages";
import {
  mergeShortSegments,
  whisperSegmentsToSrt,
  segmentsToSrtString,
  type SrtSegment,
} from "@/lib/srt";

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    const { file: audioFile, cleanup: cleanupTempFiles } =
      await ensureWhisperCompatible(blob, originalName);

    // ── Step 3: Transcribe with Whisper (auto-detect language) ────────────────
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    } as Parameters<typeof openai.audio.transcriptions.create>[0]);

    await cleanupTempFiles();

    if (!transcription.segments || transcription.segments.length === 0) {
      return NextResponse.json(
        { error: "No speech detected in the file" },
        { status: 422 }
      );
    }

    // Whisper returns a full language name e.g. "arabic", "french", "english"
    const detectedLanguage = transcription.language ?? "unknown";

    const rawSegments = mergeShortSegments(transcription.segments);
    let segments = whisperSegmentsToSrt(rawSegments);

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
      messages: [{ role: "user", content: JSON.stringify(input) }],
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
