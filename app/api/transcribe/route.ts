import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient, UPLOAD_BUCKET } from "@/lib/supabase/admin";
import { ensureWhisperCompatible } from "@/lib/ffmpeg";
import {
  getLanguage,
  getWhisperPrompt,
  getTranslationPrompt,
} from "@/lib/languages";
import {
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
    const sourceLangValue = body.sourceLang as string | null;
    const targetLangValue = body.targetLang as string | null;
    const originalName = (body.originalName as string | null) ?? "audio.mp4";

    if (!storagePath || !sourceLangValue || !targetLangValue) {
      return NextResponse.json(
        { error: "storagePath, sourceLang, and targetLang are required" },
        { status: 400 }
      );
    }

    const sourceLang = getLanguage(sourceLangValue);
    const targetLang = getLanguage(targetLangValue);
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

    // ── Step 3: Transcribe with Whisper ───────────────────────────────────────
    const whisperPrompt = getWhisperPrompt(sourceLangValue);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: sourceLang.whisperCode,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      ...(whisperPrompt ? { prompt: whisperPrompt } : {}),
    });

    await cleanupTempFiles();

    if (!transcription.segments || transcription.segments.length === 0) {
      return NextResponse.json(
        { error: "No speech detected in the file" },
        { status: 422 }
      );
    }

    let segments = whisperSegmentsToSrt(transcription.segments);

    // ── Step 3: Translate with Claude (skip if same language) ─────────────────
    if (sourceLangValue !== targetLangValue) {
      segments = await translateSegments(segments, sourceLang, targetLang);
    }

    // ── Step 4: Build and return SRT ──────────────────────────────────────────
    const srtContent = segmentsToSrtString(segments);
    const baseName = originalName.replace(/\.[^/.]+$/, "");
    const filename = `${baseName}_${targetLang.value}.srt`;

    return new NextResponse(srtContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Segment-Count": String(segments.length),
      },
    });
  } catch (error) {
    console.error("[/api/transcribe]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // ── Always clean up the file from storage ─────────────────────────────────
    if (storagePath) {
      const admin = createAdminClient();
      await admin.storage.from(UPLOAD_BUCKET).remove([storagePath]);
    }
  }
}

// ── Translation helper ─────────────────────────────────────────────────────────

async function translateSegments(
  segments: SrtSegment[],
  sourceLang: ReturnType<typeof getLanguage>,
  targetLang: ReturnType<typeof getLanguage>
): Promise<SrtSegment[]> {
  const systemPrompt = getTranslationPrompt(sourceLang, targetLang);
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
        { role: "user", content: JSON.stringify(input) },
        // Prefill forces Claude to start mid-JSON-array — it cannot output any preamble
        { role: "assistant", content: "[" },
      ],
    });

    const rawContent = message.content[0];
    if (rawContent.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let parsed: Array<{ index: number; text: string }>;
    try {
      // Prepend the "[" we used as prefill since it's not included in the response
      parsed = JSON.parse("[" + rawContent.text);
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
