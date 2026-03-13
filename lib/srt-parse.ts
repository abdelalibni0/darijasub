// Client-safe SRT / VTT utilities for the subtitle editor

export interface EditorSegment {
  id: number;
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

// ── Time conversion ────────────────────────────────────────────────────────────

/** "HH:MM:SS,mmm" (SRT) → seconds */
export function srtTimeToSeconds(t: string): number {
  const normalized = t.trim().replace(",", ".");
  const parts = normalized.split(":");
  const s = Number(parts.pop() ?? "0");
  const m = Number(parts.pop() ?? "0");
  const h = Number(parts.pop() ?? "0");
  return h * 3600 + m * 60 + s;
}

/** seconds → "HH:MM:SS,mmm" (SRT export) */
export function secondsToSrtTime(sec: number): string {
  const n = Math.max(0, sec);
  const h  = Math.floor(n / 3600);
  const m  = Math.floor((n % 3600) / 60);
  const s  = Math.floor(n % 60);
  const ms = Math.round((n % 1) * 1000);
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "," +
    String(ms).padStart(3, "0")
  );
}

/** seconds → "HH:MM:SS.mmm" (VTT export) */
export function secondsToVttTime(sec: number): string {
  return secondsToSrtTime(sec).replace(",", ".");
}

/** seconds → "MM:SS.mmm" (editor display) */
export function secondsToDisplay(sec: number): string {
  const n = Math.max(0, sec);
  const m  = Math.floor(n / 60);
  const s  = Math.floor(n % 60);
  const ms = Math.round((n % 1) * 1000);
  return (
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." +
    String(ms).padStart(3, "0")
  );
}

/** "MM:SS.mmm" (or "HH:MM:SS.mmm") → seconds (lenient parse) */
export function displayToSeconds(t: string): number {
  const dotIdx = t.lastIndexOf(".");
  let main  = t;
  let msStr = "000";
  if (dotIdx >= 0) {
    main  = t.slice(0, dotIdx);
    msStr = t.slice(dotIdx + 1).padEnd(3, "0").slice(0, 3);
  }
  const parts = main.split(":");
  const s = Number(parts.pop() ?? "0") || 0;
  const m = Number(parts.pop() ?? "0") || 0;
  const h = Number(parts.pop() ?? "0") || 0;
  return h * 3600 + m * 60 + s + Number(msStr) / 1000;
}

/** Human-readable duration "M:SS" */
export function secondsToDuration(sec: number): string {
  const n = Math.max(0, sec);
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Parsers ────────────────────────────────────────────────────────────────────

/** Parse SRT text → EditorSegment[] */
export function parseSrt(srtText: string): EditorSegment[] {
  const blocks = srtText.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const segments: EditorSegment[] = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;
    const timeLine = lines[1];
    const arrowIdx = timeLine.indexOf("-->");
    if (arrowIdx === -1) continue;
    const startStr = timeLine.slice(0, arrowIdx).trim();
    const endStr   = timeLine.slice(arrowIdx + 3).trim();
    segments.push({
      id: index,
      index,
      startSeconds: srtTimeToSeconds(startStr),
      endSeconds:   srtTimeToSeconds(endStr),
      text: lines.slice(2).join("\n"),
    });
  }
  return segments;
}

// ── Exporters ──────────────────────────────────────────────────────────────────

export function segmentsToSrt(segments: EditorSegment[]): string {
  return segments
    .map((seg, i) =>
      `${i + 1}\n` +
      `${secondsToSrtTime(seg.startSeconds)} --> ${secondsToSrtTime(seg.endSeconds)}\n` +
      seg.text
    )
    .join("\n\n") + "\n";
}

export function segmentsToVtt(segments: EditorSegment[]): string {
  const lines = ["WEBVTT", ""];
  segments.forEach((seg, i) => {
    lines.push(String(i + 1));
    lines.push(`${secondsToVttTime(seg.startSeconds)} --> ${secondsToVttTime(seg.endSeconds)}`);
    lines.push(seg.text);
    lines.push("");
  });
  return lines.join("\n");
}

export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
