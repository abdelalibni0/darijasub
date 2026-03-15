import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getLanguage, getTranslationPrompt, whisperNameToCode } from "@/lib/languages";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface InputSegment {
  start: number;
  end:   number;
  text:  string;
}

interface OutputResult {
  language:     string;
  languageName: string;
  segments:     InputSegment[];
}

async function translateSegments(
  segments:       InputSegment[],
  sourceLanguage: string,
  targetLangValue: string,
): Promise<InputSegment[]> {
  const targetLang   = getLanguage(targetLangValue);
  const systemPrompt = getTranslationPrompt(sourceLanguage, targetLang);
  const BATCH_SIZE   = 100;
  const results: InputSegment[] = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const input = batch.map((s, j) => ({ index: i + j + 1, text: s.text }));

    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   [{ role: "user", content: JSON.stringify(input) }],
    });

    const rawContent = message.content[0];
    if (rawContent.type !== "text") throw new Error("Unexpected response from Claude");

    let parsed: Array<{ index: number; text: string }>;
    try {
      const cleaned = rawContent.text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Claude returned invalid JSON for language "${targetLangValue}"`);
    }

    for (let j = 0; j < batch.length; j++) {
      const seg           = batch[j];
      const translatedSeg = parsed.find((p) => p.index === i + j + 1);
      results.push({ start: seg.start, end: seg.end, text: translatedSeg?.text ?? seg.text });
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const segments: InputSegment[] = body.segments ?? [];
    const languages: string[]      = body.languages ?? [];
    const sourceLanguage: string   = body.sourceLanguage ?? "unknown";

    if (!segments.length)  return NextResponse.json({ error: "No segments provided" },  { status: 400 });
    if (!languages.length) return NextResponse.json({ error: "No languages specified" }, { status: 400 });

    const sourceWhisperCode = whisperNameToCode(sourceLanguage);

    console.log(`[multi-export] ${segments.length} segments → ${languages.join(", ")} (source: ${sourceLanguage})`);

    // Run all translations in parallel
    const results = await Promise.all(
      languages.map(async (langValue): Promise<OutputResult> => {
        const lang   = getLanguage(langValue);
        const isSame = lang.whisperCode === sourceWhisperCode;

        const translatedSegments = isSame
          ? segments
          : await translateSegments(segments, sourceLanguage, langValue);

        console.log(`[multi-export] ${langValue} done (${isSame ? "source=target, copied" : "translated"})`);

        return { language: langValue, languageName: lang.label, segments: translatedSegments };
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/multi-export]", err);
    const message = err instanceof Error ? err.message : "Multi-export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
