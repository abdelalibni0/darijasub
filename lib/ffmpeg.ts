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

/**
 * If the file is already a Whisper-compatible format, returns it as-is.
 * Otherwise converts to MP3 via ffmpeg using /tmp for temp storage.
 *
 * Returns the File to send to Whisper and a cleanup function to call when done.
 */
export async function ensureWhisperCompatible(
  blob: Blob,
  originalName: string
): Promise<{ file: File; cleanup: () => Promise<void> }> {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";

  if (WHISPER_NATIVE.has(ext)) {
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
