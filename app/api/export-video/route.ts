import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, EXPORT_BUCKET } from "@/lib/supabase/admin";
import { writeFile, readFile, unlink, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300; // Vercel Pro — up to 5 minutes for ffmpeg encoding

const PLATFORMS: Record<string, { w: number; h: number }> = {
  youtube:          { w: 1920, h: 1080 },
  tiktok:           { w: 1080, h: 1920 },
  instagram_reels:  { w: 1080, h: 1920 },
  instagram_square: { w: 1080, h: 1080 },
};

// Output dimensions per quality level
const QUALITY_SCALE: Record<string, number> = { high: 720 / 1080, medium: 720 / 1080, fast: 480 / 1080 };
const QUALITY_CRF:   Record<string, number> = { high: 23,          medium: 26,          fast: 28 };
const QUALITY_PRESET: Record<string, string> = { high: "fast",     medium: "veryfast",  fast: "ultrafast" };

/**
 * Patches the client-generated ASS content so it renders reliably on the server:
 *
 * 1. PlayRes → 640×360 (standard reference resolution; libass scales to output)
 * 2. Fontname → NotoSansArabic (only font guaranteed in /tmp)
 * 3. Fontsize → max(user value, 20) at PlayRes 640×360 — never tiny
 * 4. BorderStyle=1, Outline=2, Shadow=1 — black border + drop shadow so
 *    white text is readable on ANY background (light or dark)
 */
function patchAss(assContent: string): string {
  let patched = assContent;

  // BUG 1 part A — normalise PlayRes so font size 20 is always readable
  patched = patched
    .replace(/^PlayResX:.*$/m, "PlayResX: 640")
    .replace(/^PlayResY:.*$/m, "PlayResY: 360");

  // Add PlayRes if entirely absent (safety net)
  if (!/^PlayResX:/m.test(patched)) {
    patched = patched.replace("[Script Info]", "[Script Info]\nPlayResX: 640\nPlayResY: 360");
  }

  // BUG 1 + 2 + 3 — patch the Style line
  patched = patched.replace(/^(Style:[^\n]+)$/m, (line) => {
    const parts = line.split(",");
    // ASS Style CSV fields (0-indexed):
    // 0:  "Style: Default"
    // 1:  Fontname
    // 2:  Fontsize
    // 3:  PrimaryColour   4: SecondaryColour  5: OutlineColour  6: BackColour
    // 7:  Bold  8: Italic  9: Underline  10: StrikeOut
    // 11: ScaleX  12: ScaleY  13: Spacing  14: Angle
    // 15: BorderStyle  16: Outline  17: Shadow
    // 18: Alignment  19: MarginL  20: MarginR  21: MarginV  22: Encoding

    // BUG 2 — font name
    parts[1] = "NotoSansArabic";

    // BUG 1 — minimum font size 20 (at PlayRes 640×360)
    const currentSize = parseInt(parts[2], 10);
    parts[2] = String(!isNaN(currentSize) && currentSize > 20 ? currentSize : 20);

    // BUG 3 — outline + shadow so text is visible on any background
    parts[15] = "1"; // BorderStyle: outline & shadow mode
    parts[16] = "2"; // Outline width in pixels
    parts[17] = "1"; // Shadow depth

    return parts.join(",");
  });

  return patched;
}

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
    storagePath              = body.storagePath as string;
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
    const crf    = QUALITY_CRF[quality]    ?? QUALITY_CRF.medium;
    const preset = QUALITY_PRESET[quality] ?? QUALITY_PRESET.medium;

    // Download source video from Supabase
    const admin = createAdminClient();
    console.log(`[/api/export-video] Downloading storagePath="${storagePath}" from bucket="${EXPORT_BUCKET}"`);
    const { data: blob, error: dlErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .download(storagePath);
    if (dlErr || !blob) {
      console.error(`[/api/export-video] Download failed for path="${storagePath}":`, dlErr?.message);
      throw new Error("Video file not found in storage. Please try re-uploading your video.");
    }

    const videoBuffer = Buffer.from(await blob.arrayBuffer());
    console.log(`[/api/export-video] Video downloaded: ${videoBuffer.byteLength} bytes`);
    await writeFile(inputPath, videoBuffer);

    // BUG FIX: Copy NotoSansArabic into /tmp — /tmp is always writable on Vercel,
    // unlike process.cwd()/public/fonts which may not be on the Lambda filesystem.
    const srcFont = path.join(process.cwd(), "public", "fonts", "NotoSansArabic.ttf");
    const tmpFont = "/tmp/NotoSansArabic.ttf";
    if (!existsSync(tmpFont)) {
      await copyFile(srcFont, tmpFont);
    }
    console.log("[export-video] font copied to /tmp:", existsSync(tmpFont));

    // Patch ASS: fix PlayRes, font name, font size, outline, shadow
    const assPatched = patchAss(assContent);
    const styleLineString = assPatched.split("\n").find(l => l.startsWith("Style:")) ?? "(not found)";
    console.log("[export-video] ASS Style line:", styleLineString);
    console.log("[export-video] ASS first Dialogue:", assPatched.split("\n").find(l => l.startsWith("Dialogue:")) ?? "(none)");
    // Log full ASS content for deep diagnosis
    console.log("[export-video] FULL ASS CONTENT:\n" + assPatched);

    await writeFile(assPath, assPatched, "utf8");
    const { size: assFileSize } = await import("fs/promises").then(({ stat }) => stat(assPath));
    console.log(`[/api/export-video] ASS written to ${assPath}: ${assFileSize} bytes`);

    // Use subtitles= filter (behaves differently to ass= on some ffmpeg builds)
    // fontsdir=/tmp — NotoSansArabic.ttf is there
    const assArg = `${assPath}:fontsdir=/tmp`;
    const vf =
      `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
      `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,` +
      `subtitles=${assArg}`;

    console.log(`[/api/export-video] Running ffmpeg: ${outW}x${outH} crf=${crf} preset=${preset} platform=${platform}`);
    console.log(`[/api/export-video] vf: ${vf}`);

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
        .on("end", () => { console.log("[/api/export-video] ffmpeg done"); resolve(); })
        .on("error", (err, _stdout, stderr) => {
          console.error("[/api/export-video] ffmpeg error:", err.message);
          console.error("[/api/export-video] stderr:", stderr);
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
    console.error("[/api/export-video]", err);
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
