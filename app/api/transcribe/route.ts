import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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

export const maxDuration = 300; // 5 min timeout for large files

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sourceLangValue = formData.get("sourceLang") as string | null;
    const targetLangValue = formData.get("targetLang") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!sourceLangValue || !targetLangValue) {
      return NextResponse.json(
        { error: "sourceLang and targetLang are required" },
        { status: 400 }
      );
    }

    const sourceLang = getLanguage(sourceLangValue);
    const targetLang = getLanguage(targetLangValue);

    // ── Step 1: Transcribe with Whisper ──────────────────────────────────────
    const whisperPrompt = getWhisperPrompt(sourceLangValue);

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: sourceLang.whisperCode,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      ...(whisperPrompt ? { prompt: whisperPrompt } : {}),
    });

    if (
      !transcription.segments ||
      transcription.segments.length === 0
    ) {
      return NextResponse.json(
        { error: "No speech detected in the file" },
        { status: 422 }
      );
    }

    let segments = whisperSegmentsToSrt(transcription.segments);

    // ── Step 2: Translate with Claude (skip if same language) ────────────────
    const isSameLanguage = sourceLangValue === targetLangValue;

    if (!isSameLanguage) {
      segments = await translateSegments(segments, sourceLang, targetLang);
    }

    // ── Step 3: Build and return SRT ─────────────────────────────────────────
    const srtContent = segmentsToSrtString(segments);
    const filename = `${file.name.replace(/\.[^/.]+$/, "")}_${targetLang.value}.srt`;

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
  }
}

// ── Translation helper ────────────────────────────────────────────────────────

async function translateSegments(
  segments: SrtSegment[],
  sourceLang: ReturnType<typeof getLanguage>,
  targetLang: ReturnType<typeof getLanguage>
): Promise<SrtSegment[]> {
  const systemPrompt = getTranslationPrompt(sourceLang, targetLang);

  // Send segments in batches of 100 to stay within token limits
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
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const rawContent = message.content[0];
    if (rawContent.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let parsed: Array<{ index: number; text: string }>;
    try {
      // Strip any accidental markdown code fences
      const cleaned = rawContent.text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Claude returned invalid JSON for translation batch");
    }

    // Merge translated text back with original timing
    for (const seg of batch) {
      const translatedSeg = parsed.find((p) => p.index === seg.index);
      translated.push({
        ...seg,
        text: translatedSeg?.text ?? seg.text,
      });
    }
  }

  return translated;
}
