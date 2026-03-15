import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });

    const { voice_id } = await request.json() as { voice_id?: string };
    if (!voice_id?.trim()) return NextResponse.json({ error: "voice_id is required" }, { status: 400 });

    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voice_id}`, {
      method:  "DELETE",
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error ${res.status}: ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/voiceover/clone/delete]", err);
    const message = err instanceof Error ? err.message : "Failed to delete voice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
