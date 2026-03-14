import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, EXPORT_BUCKET } from "@/lib/supabase/admin";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 60;

const PLATFORMS: Record<string, { w: number; h: number }> = {
  youtube:          { w: 1920, h: 1080 },
  tiktok:           { w: 1080, h: 1920 },
  instagram_reels:  { w: 1080, h: 1920 },
  instagram_square: { w: 1080, h: 1080 },
};

const QUALITY_SCALE: Record<string, number> = { high: 1, medium: 720 / 1080, fast: 480 / 1080 };
const QUALITY_CRF:   Record<string, number> = { high: 18, medium: 23, fast: 28 };

export async function POST(request: NextRequest) {
  const id         = randomUUID();
  const inputPath  = path.join("/tmp", `${id}-input`);
  const assPath    = path.join("/tmp", `${id}-subs.ass`);
  const outputPath = path.join("/tmp", `${id}-output.mp4`);
  let storagePath: string | null = null;

  const cleanup = async () => {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(assPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  };

  try {
    const body = await request.json();
    storagePath             = body.storagePath as string;
    const assContent: string = body.assContent;
    const platform: string   = body.platform ?? "youtube";
    const quality: string    = body.quality  ?? "medium";

    if (!storagePath || !assContent) {
      return NextResponse.json({ error: "storagePath and assContent are required" }, { status: 400 });
    }

    // Validate ASS content has actual subtitle events
    const dialogueLines = assContent.split("\n").filter((l) => l.startsWith("Dialogue:"));
    console.log(`[/api/export-video] ASS received: ${assContent.length} chars, ${dialogueLines.length} dialogue events`);
    if (dialogueLines.length === 0) {
      return NextResponse.json({ error: "No subtitle content found — ASS file has no dialogue events" }, { status: 400 });
    }

    // Compute output dimensions
    const plat  = PLATFORMS[platform] ?? PLATFORMS.youtube;
    const scale = QUALITY_SCALE[quality] ?? QUALITY_SCALE.medium;
    let outW = Math.round(plat.w * scale);
    let outH = Math.round(plat.h * scale);
    if (outW % 2 !== 0) outW--;
    if (outH % 2 !== 0) outH--;
    const crf = QUALITY_CRF[quality] ?? QUALITY_CRF.medium;

    // Download source video from Supabase
    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .download(storagePath);
    if (dlErr || !blob) {
      throw new Error(dlErr?.message ?? "Failed to download source video from storage");
    }

    const videoBuffer = Buffer.from(await blob.arrayBuffer());
    console.log(`[/api/export-video] Video downloaded: ${videoBuffer.byteLength} bytes`);
    await writeFile(inputPath, videoBuffer);

    await writeFile(assPath, assContent, "utf8");
    const { size: assFileSize } = await import("fs/promises").then(({ stat }) => stat(assPath));
    console.log(`[/api/export-video] ASS written to ${assPath}: ${assFileSize} bytes`);

    // Build video filter
    const vf =
      `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,` +
      `ass=${assPath.replace(/\\/g, "/")}`;

    console.log(`[/api/export-video] Running ffmpeg: ${outW}x${outH} crf=${crf} platform=${platform}`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-vf",     vf,
          "-c:v",    "libx264",
          "-crf",    String(crf),
          "-preset", "ultrafast",
          "-c:a",    "aac",
          "-b:a",    "128k",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("end", () => { console.log("[/api/export-video] ffmpeg done"); resolve(); })
        .on("error", (err, _stdout, stderr) => {
          console.error("[/api/export-video] ffmpeg error:", err.message);
          console.error("[/api/export-video] stderr:", stderr);
          reject(new Error(`ffmpeg: ${err.message}`));
        })
        .run();
    });

    const outBuffer = await readFile(outputPath);
    await cleanup();

    // Delete source video from Supabase
    await admin.storage.from(EXPORT_BUCKET).remove([storagePath]).catch(() => {});

    return new NextResponse(outBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="export.mp4"`,
        "Content-Length": String(outBuffer.byteLength),
      },
    });
  } catch (err) {
    await cleanup();
    // Best-effort cleanup of Supabase file
    if (storagePath) {
      const admin = createAdminClient();
      await admin.storage.from(EXPORT_BUCKET).remove([storagePath]).catch(() => {});
    }
    console.error("[/api/export-video]", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
