import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, ensureBucket, UPLOAD_BUCKET } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    await ensureBucket();

    // Unique path — no auth dependency, collision-safe
    const ext = filename.split(".").pop() ?? "bin";
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
