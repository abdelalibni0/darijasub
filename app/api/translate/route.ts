import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getLanguage, getTranslationPrompt } from "@/lib/languages";
import { segmentsToSrtString, type SrtSegment } from "@/lib/srt";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const body                             = await request.json();
    const segments: SrtSegment[]           = body.segments ?? [];
    const targetLangValue: string          = body.targetLang;
    const detectedLanguage: string         = body.detectedLanguage ?? "arabic";

    if (!segments.length) {
      return NextResponse.json({ error: "No segments provided" }, { status: 400 });
    }
    if (!targetLangValue) {
      return NextResponse.json({ error: "targetLang is required" }, { status: 400 });
    }

    const targetLang   = getLanguage(targetLangValue);
    const systemPrompt = getTranslationPrompt(detectedLanguage, targetLang);
    const BATCH_SIZE   = 100;
    const translated: SrtSegment[] = [];

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      const input = batch.map((s) => ({ index: s.index, text: s.text }));

      const message = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 4096,
        system:     systemPrompt,
        messages: [
          { role: "user", content: JSON.stringify(input) + "\n\nYOUR RESPONSE MUST START WITH [ AND END WITH ]. DO NOT write anything before [. DO NOT write anything after ]. NO markdown. NO code fences. NO explanation. ONLY the raw JSON array." },
        ],
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
        throw new Error("Claude returned invalid JSON for translation batch");
      }

      for (const seg of batch) {
        const translatedSeg = parsed.find((p) => p.index === seg.index);
        translated.push({ ...seg, text: translatedSeg?.text ?? seg.text });
      }
    }

    const srtContent = segmentsToSrtString(translated);

    return new NextResponse(srtContent, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[/api/translate]", err);
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
