import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CaptionSuggestions {
  title: string;
  description: string;
  hashtags: string[];
  bestTimeToPost: string;
  hookComment: string;
}

const PLATFORM_NOTES: Record<string, string> = {
  youtube: "YouTube: title max 100 chars (SEO-optimised, include searchable keywords), description 300-600 chars with natural keywords, 10-15 hashtags. Best time framed around weekday evenings.",
  tiktok:  "TikTok: punchy title max 60 chars (hook the viewer in 3 words), short 1-2 sentence description, 8-12 trending/niche hashtags. Best time framed around lunch or evening.",
  instagram: "Instagram: engaging title/caption with emojis, 200-400 char description with line breaks and emojis, 20-30 hashtags mixing popular and niche. Best time framed around morning or evening.",
  facebook: "Facebook: conversational title, 200-500 char description that invites discussion, 5-8 relevant hashtags. Best time framed around lunch or early evening.",
  snapchat: "Snapchat: very short punchy title (max 40 chars), brief 1-sentence description, 5-8 trending hashtags. Best time framed around evenings or weekends.",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subtitleText = (body.subtitleText as string | null) ?? "";
    const platform     = (body.platform     as string | null) ?? "youtube";
    const language     = (body.language     as string | null) ?? "english";

    if (!subtitleText.trim()) {
      return NextResponse.json({ error: "subtitleText is required" }, { status: 400 });
    }

    const platformNote = PLATFORM_NOTES[platform.toLowerCase()] ?? PLATFORM_NOTES.youtube;
    const langNote     = language.toLowerCase() === "english"
      ? "Write all suggestions in English."
      : "Write all suggestions in the same language as the subtitle text.";

    const systemPrompt =
      `You are an expert social media strategist who helps content creators maximise reach and engagement.\n` +
      `${langNote}\n` +
      `${platformNote}\n\n` +
      `YOUR RESPONSE MUST BE A SINGLE RAW JSON OBJECT AND NOTHING ELSE.\n` +
      `Do not write any text before "{". Do not write any text after "}".\n` +
      `Do not use markdown. Do not use code fences. Do not explain anything.\n` +
      `The very first character of your response must be "{" and the very last must be "}".\n\n` +
      `Output format:\n` +
      `{\n` +
      `  "title": "<platform-optimised video title>",\n` +
      `  "description": "<caption / description body>",\n` +
      `  "hashtags": ["#tag1", "#tag2", ...],\n` +
      `  "bestTimeToPost": "<specific day(s) and time window, e.g. Tuesday–Thursday, 6–9 PM EST>",\n` +
      `  "hookComment": "<one punchy sentence to pin as the first comment to boost engagement>"\n` +
      `}`;

    const userMessage =
      `Here is the subtitle text from the video:\n\n` +
      `---\n${subtitleText.slice(0, 6000)}\n---\n\n` +
      `Generate optimised ${platform} content for this video.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response type from Claude");

    let suggestions: CaptionSuggestions;
    try {
      const cleaned = raw.text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      throw new Error("Claude returned invalid JSON for caption suggestions");
    }

    return NextResponse.json(suggestions);
  } catch (err) {
    console.error("[/api/suggest-captions]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
