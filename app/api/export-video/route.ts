import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, EXPORT_BUCKET } from "@/lib/supabase/admin";
import { writeFile, readFile, unlink, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

const PLATFORMS: Record<string, { w: number; h: number }> = {
  youtube:          { w: 1920, h: 1080 },
  tiktok:           { w: 1080, h: 1920 },
  instagram_reels:  { w: 1080, h: 1920 },
  instagram_square: { w: 1080, h: 1080 },
};

const QUALITY_SCALE:  Record<string, number> = { high: 720 / 1080, medium: 720 / 1080, fast: 480 / 1080 };
const QUALITY_CRF:    Record<string, number> = { high: 23,          medium: 26,          fast: 28 };
const QUALITY_PRESET: Record<string, string> = { high: "fast",      medium: "veryfast",  fast: "ultrafast" };

interface SubtitleInput {
  start: number;
  end:   number;
  text:  string;
}

/**
 * Escape text for ffmpeg drawtext filter.
 * Order matters — backslash must be first to avoid double-escaping.
 */
function escapeDrawtext(raw: string): string {
  return raw
    .replace(/\\/g,  "\\\\")     // 1. \ → \\ (must be first)
    .replace(/'/g,   "\u2019")   // 2. ' → ' (right apostrophe — avoids shell quoting issues)
    .replace(/:/g,   "\\:")      // 3. : → \:
    .replace(/%/g,   "\\%")      // 4. % → \%
    .replace(/\[/g,  "\\[")      // 5. [ → \[
    .replace(/\]/g,  "\\]")      // 6. ] → \]
    .replace(/,/g,   "\\,")      // 7. , → \, (comma separates filter options)
    .replace(/[\r\n]+/g, " ")    // 8. newlines → space
    .trim();
}

/**
 * Build a chained drawtext filter from subtitle segments.
 * Each subtitle is rendered only during its time window via enable='between(t,s,e)'.
 */
function buildDrawtextFilter(subs: SubtitleInput[], fontFile: string, fontSize: number): string {
  return subs.map(sub => {
    const text = escapeDrawtext(sub.text);
    const s    = sub.start.toFixed(3);
    const e    = sub.end.toFixed(3);
    return (
      `drawtext=text='${text}'` +
      `:fontfile=${fontFile}` +
      `:fontsize=${fontSize}` +
      `:fontcolor=white` +
      `:x=(w-text_w)/2` +
      `:y=h-80` +
      `:box=1` +
      `:boxcolor=black@0.6` +
      `:boxborderw=8` +
      `:enable='between(t,${s},${e})'`
    );
  }).join(",");
}

export async function POST(request: NextRequest) {
  const id         = randomUUID();
  const inputPath  = path.join("/tmp", `${id}-input`);
  const outputPath = path.join("/tmp", `${id}-output.mp4`);
  let storagePath: string | null = null;

  const cleanup = async () => {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  };

  try {
    const body = await request.json();
    storagePath                    = body.storagePath as string;
    const segments: SubtitleInput[] = body.segments ?? [];
    const platform: string          = body.platform ?? "youtube";
    const quality: string           = body.quality  ?? "medium";

    if (!storagePath) {
      return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
    }
    if (!segments.length) {
      return NextResponse.json({ error: "No subtitle segments provided" }, { status: 400 });
    }

    console.log(`[export-video] ${segments.length} segments, platform=${platform}, quality=${quality}`);

    // Compute output dimensions
    const plat   = PLATFORMS[platform] ?? PLATFORMS.youtube;
    const scale  = QUALITY_SCALE[quality]  ?? QUALITY_SCALE.medium;
    const crf    = QUALITY_CRF[quality]    ?? QUALITY_CRF.medium;
    const preset = QUALITY_PRESET[quality] ?? QUALITY_PRESET.medium;
    let outW = Math.round(plat.w * scale);
    let outH = Math.round(plat.h * scale);
    if (outW % 2 !== 0) outW--;
    if (outH % 2 !== 0) outH--;

    // Download source video from Supabase
    const admin = createAdminClient();
    console.log(`[export-video] Downloading storagePath="${storagePath}" from bucket="${EXPORT_BUCKET}"`);
    const { data: blob, error: dlErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .download(storagePath);
    if (dlErr || !blob) {
      console.error(`[export-video] Download failed for path="${storagePath}":`, dlErr?.message);
      throw new Error("Video file not found in storage. Please try re-uploading your video.");
    }

    const videoBuffer = Buffer.from(await blob.arrayBuffer());
    console.log(`[export-video] Video downloaded: ${videoBuffer.byteLength} bytes`);
    await writeFile(inputPath, videoBuffer);

    // Copy NotoSansArabic into /tmp — always writable on Vercel
    const srcFont = path.join(process.cwd(), "public", "fonts", "NotoSansArabic.ttf");
    const tmpFont = "/tmp/NotoSansArabic.ttf";
    if (!existsSync(tmpFont)) {
      await copyFile(srcFont, tmpFont);
    }
    console.log("[export-video] font in /tmp:", existsSync(tmpFont));

    // Build drawtext filter (same approach confirmed working by test-export)
    const fontSize = Math.max(24, Math.round(outH * 0.055));

    let drawtextChain: string;
    try {
      drawtextChain = buildDrawtextFilter(segments, tmpFont, fontSize);
    } catch (buildErr) {
      console.error("[export-video] drawtext build error:", buildErr);
      throw new Error(`Failed to build subtitle filter: ${buildErr instanceof Error ? buildErr.message : buildErr}`);
    }

    const vf =
      `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,` +
      drawtextChain;

    console.log("[export-video] drawtext sample:", drawtextChain.substring(0, 300));
    console.log(`[export-video] Running ffmpeg: ${outW}x${outH} fontsize=${fontSize} crf=${crf} preset=${preset}`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-vf",       vf,
          "-c:v",      "libx264",
          "-crf",      String(crf),
          "-preset",   preset,
          "-tune",     "fastdecode",
          "-threads",  "0",
          "-c:a",      "aac",
          "-b:a",      "128k",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("stderr", (line) => console.log("[ffmpeg stderr]", line))
        .on("end", () => { console.log("[export-video] ffmpeg done"); resolve(); })
        .on("error", (err, _stdout, stderr) => {
          console.error("[export-video] ffmpeg error:", err.message);
          console.error("[export-video] stderr:", stderr);
          reject(new Error(`ffmpeg: ${err.message}`));
        })
        .run();
    });

    const outBuffer = await readFile(outputPath);
    console.log("[export-video] output size:", outBuffer.byteLength);
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
    if (storagePath) {
      const admin = createAdminClient();
      await admin.storage.from(EXPORT_BUCKET).remove([storagePath]).catch(() => {});
    }
    console.error("[export-video]", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
