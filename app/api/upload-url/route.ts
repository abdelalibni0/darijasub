import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, ensureBucket, UPLOAD_BUCKET } from "@/lib/supabase/admin";

const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime", // .mov (macOS/iOS)
  "video/mov",       // .mov (alternate)
  "video/x-msvideo",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",       // .m4a (standard)
  "audio/x-m4a",    // .m4a (Apple/iTunes)
  "audio/m4a",      // .m4a (alternate)
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

const ALLOWED_EXTENSIONS = new Set([
  "mp4", "mov", "avi", "webm", "mp3", "m4a", "wav", "ogg",
]);

export async function POST(request: NextRequest) {
  try {
    const { filename, mimeType } = await request.json();
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Allowed: mp4, mov, avi, webm, mp3, m4a, wav, ogg` },
        { status: 415 }
      );
    }
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported MIME type "${mimeType}".` },
        { status: 415 }
      );
    }

    await ensureBucket();

    // Unique path — no auth dependency, collision-safe
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(UPLOAD_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create signed upload URL");
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
    });
  } catch (err) {
    console.error("[/api/upload-url]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
