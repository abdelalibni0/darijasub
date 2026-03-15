import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId } = await request.json();

    if (!text?.trim())   return NextResponse.json({ error: "text is required" },    { status: 400 });
    if (!voiceId?.trim()) return NextResponse.json({ error: "voiceId is required" }, { status: 400 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method:  "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[voiceover] ElevenLabs error:", res.status, errText);
      return NextResponse.json(
        { error: `ElevenLabs error ${res.status}: ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type":        "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voiceover.mp3"',
        "Content-Length":      String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[/api/voiceover]", err);
    const message = err instanceof Error ? err.message : "Voiceover generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
