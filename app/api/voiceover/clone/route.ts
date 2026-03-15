import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 });

    const formData = await request.formData();
    const name = formData.get("name") as string | null;
    const file = formData.get("file") as File | null;

    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!file)         return NextResponse.json({ error: "audio file is required" }, { status: 400 });

    // ElevenLabs expects multipart/form-data with "name" and "files" fields
    const elevenForm = new FormData();
    elevenForm.append("name", name.trim());
    elevenForm.append("files", file, file.name);

    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method:  "POST",
      headers: { "xi-api-key": apiKey },
      body:    elevenForm,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error ${res.status}: ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json() as { voice_id: string };
    return NextResponse.json({ voice_id: data.voice_id });
  } catch (err) {
    console.error("[/api/voiceover/clone]", err);
    const message = err instanceof Error ? err.message : "Voice cloning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
