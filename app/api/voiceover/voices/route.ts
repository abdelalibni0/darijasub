// Production deployment - ElevenLabs key updated
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    console.log("[voiceover/voices] API key present:", !!apiKey);
    if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });

    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error ${res.status}: ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json() as { voices: unknown[] };
    return NextResponse.json({ voices: data.voices });
  } catch (err) {
    console.error("[/api/voiceover/voices]", err);
    const message = err instanceof Error ? err.message : "Failed to fetch voices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
