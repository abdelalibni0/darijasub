import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Formats Whisper accepts natively.
 * https://platform.openai.com/docs/guides/speech-to-text
 */
const WHISPER_NATIVE = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Ensures the file is both a Whisper-compatible format AND under 25 MB.
 * - Wrong format → convert to MP3 via server ffmpeg
 * - Right format but > 25 MB → extract audio track as 128k MP3 via server ffmpeg
 * - Right format and ≤ 25 MB → return as-is (no ffmpeg needed)
 */
export async function ensureWhisperCompatible(
  blob: Blob,
  originalName: string
): Promise<{ file: File; cleanup: () => Promise<void> }> {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";

  // Already compatible and small enough — skip ffmpeg entirely
  if (WHISPER_NATIVE.has(ext) && blob.size <= WHISPER_MAX_BYTES) {
    return {
      file: new File([blob], originalName, { type: blob.type || "application/octet-stream" }),
      cleanup: async () => {},
    };
  }

  // Convert to MP3 using ffmpeg
  const id = randomUUID();
  const inputPath = path.join("/tmp", `${id}-input.${ext}`);
  const outputPath = path.join("/tmp", `${id}-output.mp3`);

  const cleanup = async () => {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  };

  try {
    await writeFile(inputPath, Buffer.from(await blob.arrayBuffer()));

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`ffmpeg conversion failed: ${err.message}`)))
        .run();
    });

    const mp3Buffer = await readFile(outputPath);
    const mp3Name = originalName.replace(/\.[^/.]+$/, "") + ".mp3";

    return {
      file: new File([mp3Buffer], mp3Name, { type: "audio/mpeg" }),
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
