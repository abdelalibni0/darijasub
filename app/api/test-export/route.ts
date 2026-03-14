import { NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 120;

export async function GET() {
  const id         = randomUUID();
  const outputPath = path.join("/tmp", `${id}-test.mp4`);

  try {
    console.log("[test-export] ffmpeg path:", ffmpegInstaller.path);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input("color=c=blue:size=640x360:duration=5")
        .inputOptions(["-f", "lavfi"])
        .outputOptions([
          "-vf",     "drawtext=text='SUBTITLE TEST 123':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-80:box=1:boxcolor=black@0.5",
          "-c:v",    "libx264",
          "-preset", "ultrafast",
          "-crf",    "28",
          "-pix_fmt","yuv420p",
        ])
        .output(outputPath)
        .on("stderr", (line) => console.log("[test-export stderr]", line))
        .on("end", () => { console.log("[test-export] done"); resolve(); })
        .on("error", (err, _stdout, stderr) => {
          console.error("[test-export] error:", err.message);
          console.error("[test-export] stderr:", stderr);
          reject(new Error(`ffmpeg: ${err.message}`));
        })
        .run();
    });

    const buf = await readFile(outputPath);
    console.log("[test-export] output size:", buf.byteLength);
    await unlink(outputPath).catch(() => {});

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="test-export.mp4"',
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (err) {
    await unlink(outputPath).catch(() => {});
    console.error("[test-export]", err);
    const message = err instanceof Error ? err.message : "Test export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
