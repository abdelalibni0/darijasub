import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEPARATOR = "|||";

const SYSTEM_TO_ARABIZI =
  "You are an expert in Moroccan Darija. Convert the given Arabic script Darija text to Arabizi (Latin alphabet transliteration used by Moroccan youth). Rules: use numbers for Arabic sounds (3=ع, 7=ح, 9=ق, 2=ء), keep it natural and how Moroccans actually type on phones. Return ONLY the converted text, nothing else.";

const SYSTEM_TO_ARABIC =
  "You are an expert in Moroccan Darija. Convert the given Arabizi (Latin) Darija text back to Arabic script. Return ONLY the converted text, nothing else.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body.text as string | undefined;
    const direction = body.direction as "to_arabizi" | "to_arabic" | undefined;

    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (direction !== "to_arabizi" && direction !== "to_arabic") {
      return NextResponse.json(
        { error: "direction must be 'to_arabizi' or 'to_arabic'" },
        { status: 400 }
      );
    }

    const systemPrompt = direction === "to_arabizi" ? SYSTEM_TO_ARABIZI : SYSTEM_TO_ARABIC;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    // Preserve the separator structure — Claude should pass it through,
    // but clean extra whitespace around each segment.
    const lines = raw.text.split(SEPARATOR).map((s) => s.trim());

    return NextResponse.json({ result: lines.join(SEPARATOR) });
  } catch (error) {
    console.error("[/api/arabizi]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
