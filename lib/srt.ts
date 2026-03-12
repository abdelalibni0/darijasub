export interface SrtSegment {
  index: number;
  start: string;
  end: string;
  text: string;
}

/** Convert seconds to SRT timestamp format: HH:MM:SS,mmm */
function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

/** Build SrtSegment array from Whisper verbose_json response segments */
export function whisperSegmentsToSrt(
  segments: Array<{ id: number; start: number; end: number; text: string }>
): SrtSegment[] {
  return segments.map((seg, i) => ({
    index: i + 1,
    start: secondsToTimestamp(seg.start),
    end: secondsToTimestamp(seg.end),
    text: seg.text.trim(),
  }));
}

/** Serialize SrtSegment array to SRT file string */
export function segmentsToSrtString(segments: SrtSegment[]): string {
  return segments
    .map(
      (seg) =>
        `${seg.index}\n${seg.start} --> ${seg.end}\n${seg.text}`
    )
    .join("\n\n");
}
