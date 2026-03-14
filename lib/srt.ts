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

type RawSegment = { id: number; start: number; end: number; text: string };

/**
 * Merge one-word / sub-second Whisper segments into natural phrase groups.
 *
 * Rules (applied greedily left-to-right):
 * - Merge current into next if current has < 3 words OR duration < 1.5 s
 * - Stop merging when combined segment reaches 7 s OR 12 words
 */
export function mergeShortSegments(segments: RawSegment[]): RawSegment[] {
  if (segments.length === 0) return segments;

  const MIN_WORDS    = 3;
  const MIN_DURATION = 1.5;
  const MAX_WORDS    = 12;
  const MAX_DURATION = 7;

  const merged: RawSegment[] = [];
  let current = { ...segments[0], text: segments[0].text.trim() };

  for (let i = 1; i < segments.length; i++) {
    const next         = segments[i];
    const words        = current.text.split(/\s+/).filter(Boolean).length;
    const duration     = current.end - current.start;
    const tooShort     = words < MIN_WORDS || duration < MIN_DURATION;
    const wouldExceed  =
      words + next.text.split(/\s+/).filter(Boolean).length > MAX_WORDS ||
      next.end - current.start > MAX_DURATION;

    if (tooShort && !wouldExceed) {
      // Absorb next into current
      current = {
        id:    current.id,
        start: current.start,
        end:   next.end,
        text:  (current.text + " " + next.text.trim()).trim(),
      };
    } else {
      merged.push(current);
      current = { ...next, text: next.text.trim() };
    }
  }
  merged.push(current);
  return merged;
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
