import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface InputSegment {
  startSeconds: number;
  text: string;
}

interface Chapter {
  time:  string; // "M:SS"
  title: string;
}

function secondsToTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const { segments }: { segments: InputSegment[] } = await request.json();

    if (!segments?.length) {
      return NextResponse.json({ error: "No segments provided" }, { status: 400 });
    }

    // Build a condensed transcript for Claude (timestamp + text per line)
    const transcript = segments
      .map((s) => `[${secondsToTimestamp(s.startSeconds)}] ${s.text.replace(/\n/g, " ")}`)
      .join("\n");

    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content:
          `You are analyzing a video transcript to generate YouTube chapter timestamps.\n\n` +
          `Identify 5–8 natural topic changes in the transcript below.\n` +
          `Rules:\n` +
          `- The first chapter MUST start at 0:00.\n` +
          `- Choose timestamps that align exactly with a line in the transcript (use those timestamps verbatim).\n` +
          `- Keep titles concise — 3 to 5 words maximum.\n` +
          `- Return ONLY a raw JSON array. No markdown, no explanation, no code fences.\n` +
          `- Format: [{"time":"0:00","title":"Introduction"}, ...]\n\n` +
          `Transcript:\n${transcript}`,
      }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response from Claude");

    let chapters: Chapter[];
    try {
      const cleaned = raw.text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      chapters = JSON.parse(cleaned);
    } catch {
      throw new Error("Claude returned invalid JSON for chapters");
    }

    // Ensure first chapter is at 0:00
    if (!chapters.length || chapters[0].time !== "0:00") {
      chapters = [{ time: "0:00", title: "Introduction" }, ...chapters];
    }

    return NextResponse.json({ chapters });
  } catch (err) {
    console.error("[/api/auto-chapters]", err);
    const message = err instanceof Error ? err.message : "Failed to generate chapters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
