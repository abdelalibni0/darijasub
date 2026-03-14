"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  parseSrt,
  segmentsToSrt,
  segmentsToVtt,
  downloadText,
  secondsToDisplay,
  displayToSeconds,
  secondsToDuration,
  type EditorSegment,
} from "@/lib/srt-parse";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DisplaySegment extends EditorSegment {
  startDisplay: string;
  endDisplay: string;
}

function toDisplay(seg: EditorSegment): DisplaySegment {
  return {
    ...seg,
    startDisplay: secondsToDisplay(seg.startSeconds),
    endDisplay:   secondsToDisplay(seg.endSeconds),
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const [segments, setSegments]   = useState<DisplaySegment[]>([]);
  const [audioUrl, setAudioUrl]   = useState<string | null>(null);
  const [filename, setFilename]   = useState("subtitles");
  const [loaded, setLoaded]       = useState(false);
  const [notFound, setNotFound]   = useState(false);

  // Audio player state
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [activeId, setActiveId]       = useState<number | null>(null);

  const audioRef       = useRef<HTMLAudioElement>(null);
  const segRefs        = useRef<Map<number, HTMLDivElement>>(new Map());
  const userSeekingRef = useRef(false);

  // Chunk popover state
  const [chunkOpen, setChunkOpen]       = useState(false);
  const [chunkSize, setChunkSize]       = useState(3);
  const [chunkMode, setChunkMode]       = useState<"words" | "chars">("words");
  const chunkPopoverRef = useRef<HTMLDivElement>(null);

  // Close chunk popover on outside click
  useEffect(() => {
    if (!chunkOpen) return;
    const handler = (e: MouseEvent) => {
      if (chunkPopoverRef.current && !chunkPopoverRef.current.contains(e.target as Node)) {
        setChunkOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [chunkOpen]);

  // ── Load from localStorage ─────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem("darijasub_editor");
      if (!raw) { setNotFound(true); setLoaded(true); return; }
      const data = JSON.parse(raw) as { srtText: string; audioUrl?: string; filename?: string };
      const parsed = parseSrt(data.srtText);
      if (!parsed.length) { setNotFound(true); setLoaded(true); return; }
      setSegments(parsed.map(toDisplay));
      if (data.audioUrl) setAudioUrl(data.audioUrl);
      if (data.filename) setFilename(data.filename.replace(/\.[^/.]+$/, ""));
    } catch {
      setNotFound(true);
    }
    setLoaded(true);
  }, []);

  // ── Audio time tracking ────────────────────────────────────────────────────

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setCurrentTime(t);
    const active = segments.find((s) => t >= s.startSeconds && t < s.endSeconds);
    const newId = active?.id ?? null;
    setActiveId((prev) => {
      if (prev !== newId && newId !== null && !userSeekingRef.current) {
        segRefs.current.get(newId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      userSeekingRef.current = false;
      return newId;
    });
  }, [segments]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [handleTimeUpdate]);

  // ── Player controls ────────────────────────────────────────────────────────

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else              audio.pause();
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    userSeekingRef.current = true;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  // ── Segment editing ────────────────────────────────────────────────────────

  const updateText = (id: number, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  };

  const updateTimeDisplay = (id: number, field: "startDisplay" | "endDisplay", value: string) => {
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const seconds = displayToSeconds(value);
        return field === "startDisplay"
          ? { ...s, startDisplay: value, startSeconds: seconds }
          : { ...s, endDisplay: value, endSeconds: seconds };
      })
    );
  };

  const deleteSegment = (id: number) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Chunking ───────────────────────────────────────────────────────────────

  const applyChunking = () => {
    const result: DisplaySegment[] = [];
    let newId = 1;

    for (const seg of segments) {
      const totalDuration = seg.endSeconds - seg.startSeconds;
      if (totalDuration <= 0) { result.push({ ...seg, id: newId++ }); continue; }

      // Split text into units (words or char groups)
      const units: string[] =
        chunkMode === "words"
          ? seg.text.trim().split(/\s+/).filter(Boolean)
          : (() => {
              const chars = seg.text.trim();
              const chunks: string[] = [];
              for (let i = 0; i < chars.length; i += chunkSize) {
                chunks.push(chars.slice(i, i + chunkSize).trim());
              }
              return chunks.filter(Boolean);
            })();

      if (units.length === 0) { result.push({ ...seg, id: newId++ }); continue; }

      // Group units into chunks of chunkSize (for word mode)
      const chunks: string[] = chunkMode === "words"
        ? (() => {
            const out: string[] = [];
            for (let i = 0; i < units.length; i += chunkSize) {
              out.push(units.slice(i, i + chunkSize).join(" "));
            }
            return out;
          })()
        : units;

      if (chunks.length === 1) { result.push({ ...seg, id: newId++ }); continue; }

      // Distribute timestamps proportionally by unit count in each chunk
      const unitCounts = chunks.map((c) =>
        chunkMode === "words" ? c.split(/\s+/).length : c.length
      );
      const totalUnits = unitCounts.reduce((a, b) => a + b, 0);

      let elapsed = seg.startSeconds;
      for (let i = 0; i < chunks.length; i++) {
        const proportion = unitCounts[i] / totalUnits;
        const chunkDuration = totalDuration * proportion;
        const start = elapsed;
        const end   = i === chunks.length - 1 ? seg.endSeconds : elapsed + chunkDuration;
        elapsed = end;
        result.push(toDisplay({
          id: newId++,
          index: newId - 1,
          startSeconds: start,
          endSeconds: end,
          text: chunks[i],
        }));
      }
    }

    setSegments(result);
    setChunkOpen(false);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportSrt = () => downloadText(segmentsToSrt(segments), `${filename}.srt`);
  const exportVtt = () => downloadText(segmentsToVtt(segments), `${filename}.vtt`);

  // ── States ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen text-white/40 text-sm">
        Loading editor…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-white/50 text-sm">No subtitle data found. Generate subtitles first.</p>
        <Link href="/dashboard" className="btn-primary px-5 py-2.5 text-sm rounded-xl inline-block">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/8"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <span className="text-white/20 shrink-0">|</span>
          <span className="text-white/70 text-sm font-medium truncate">{filename}</span>
          <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 shrink-0">
            {segments.length} segments
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">

          {/* ── Chunk button + popover ─────────────────────────────────────── */}
          <div ref={chunkPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setChunkOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{
                background: chunkOpen ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.04)",
                borderColor: chunkOpen ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
                color: chunkOpen ? "#d8b4fe" : "rgba(255,255,255,0.65)",
              }}
            >
              {/* scissors icon */}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="6" cy="6" r="3" strokeWidth={2}/>
                <circle cx="6" cy="18" r="3" strokeWidth={2}/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>
              </svg>
              <span className="hidden sm:inline">Chunk</span>
            </button>

            {chunkOpen && (
              <div
                className="absolute right-0 top-full mt-2 rounded-xl border border-white/10 shadow-2xl p-4 w-64"
                style={{ background: "linear-gradient(160deg,#1c0b35 0%,#110620 100%)", zIndex: 200 }}
              >
                <p className="text-white/80 text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="3" strokeWidth={2}/><circle cx="6" cy="18" r="3" strokeWidth={2}/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>
                  </svg>
                  Chunk Words
                </p>

                {/* Split mode toggle */}
                <div className="mb-4">
                  <p className="text-white/40 text-xs mb-1.5">Split mode</p>
                  <div className="flex rounded-lg overflow-hidden border border-white/10 p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                    {(["words", "chars"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setChunkMode(m)}
                        className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: chunkMode === m ? "rgba(147,51,234,0.5)" : "transparent",
                          color: chunkMode === m ? "#f3e8ff" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {m === "words" ? "By Words" : "By Characters"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chunk size slider */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white/40 text-xs">
                      {chunkMode === "words" ? "Words per chunk" : "Chars per chunk"}
                    </p>
                    <span className="text-purple-300 text-xs font-bold tabular-nums w-5 text-right">
                      {chunkSize}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={chunkMode === "words" ? 6 : 20}
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(90deg,#7c3aed ${((chunkSize - 1) / ((chunkMode === "words" ? 6 : 20) - 1)) * 100}%,rgba(255,255,255,0.1) 0%)`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-white/20 text-xs">1</span>
                    <span className="text-white/20 text-xs">{chunkMode === "words" ? 6 : 20}</span>
                  </div>
                </div>

                {/* Preview hint */}
                <p className="text-white/25 text-xs mb-3 leading-relaxed">
                  Each segment&apos;s text will be split into groups of{" "}
                  <span className="text-purple-300/70">{chunkSize} {chunkMode === "words" ? "words" : "characters"}</span>.
                  Timestamps are distributed proportionally.
                </p>

                {/* Apply button */}
                <button
                  type="button"
                  onClick={applyChunking}
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: "linear-gradient(90deg,#7c3aed,#9333ea)",
                    color: "#fff",
                    boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
                  }}
                >
                  Apply Chunking
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={exportSrt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-white/70 hover:text-white border border-white/10 hover:border-white/25"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Export</span> SRT
          </button>
          <button
            type="button"
            onClick={exportVtt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
            style={{ background: "rgba(147,51,234,0.1)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Export</span> VTT
          </button>
        </div>
      </header>

      {/* ── Segment list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {segments.map((seg, i) => {
          const isActive = seg.id === activeId;
          return (
            <div
              key={seg.id}
              ref={(el) => {
                if (el) segRefs.current.set(seg.id, el);
                else    segRefs.current.delete(seg.id);
              }}
              className="rounded-xl border transition-all duration-150"
              style={{
                background: isActive
                  ? "linear-gradient(135deg,rgba(147,51,234,0.15) 0%,rgba(109,40,217,0.06) 100%)"
                  : "rgba(255,255,255,0.025)",
                borderColor: isActive
                  ? "rgba(168,85,247,0.45)"
                  : "rgba(255,255,255,0.07)",
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                {/* Segment number — click to seek */}
                <button
                  type="button"
                  onClick={() => seekTo(seg.startSeconds)}
                  title="Click to seek"
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: isActive ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "#e9d5ff" : "rgba(255,255,255,0.3)",
                    border: isActive ? "1px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {i + 1}
                </button>

                {/* Time inputs */}
                <TimeInput
                  value={seg.startDisplay}
                  onChange={(v) => updateTimeDisplay(seg.id, "startDisplay", v)}
                  onCommit={() => seekTo(seg.startSeconds)}
                />
                <span className="text-white/20 text-xs">→</span>
                <TimeInput
                  value={seg.endDisplay}
                  onChange={(v) => updateTimeDisplay(seg.id, "endDisplay", v)}
                  onCommit={() => seekTo(seg.endSeconds)}
                />

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => deleteSegment(seg.id)}
                  title="Delete segment"
                  className="ml-auto shrink-0 w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Text area */}
              <div className="px-3 pb-2.5">
                <textarea
                  value={seg.text}
                  onChange={(e) => updateText(seg.id, e.target.value)}
                  rows={Math.max(1, seg.text.split("\n").length)}
                  dir="auto"
                  className="w-full resize-none text-sm outline-none rounded-lg px-3 py-2 leading-relaxed transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: isActive ? "#f3e8ff" : "rgba(255,255,255,0.85)",
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(168,85,247,0.35)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                />
              </div>
            </div>
          );
        })}

        {segments.length === 0 && (
          <p className="text-center text-white/25 text-sm py-16">
            All segments deleted. Use Export SRT/VTT above to save, or go back to regenerate.
          </p>
        )}
      </div>

      {/* ── Audio player ───────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-5 py-3 border-t border-white/8"
        style={{ background: "rgba(8,4,18,0.97)" }}
      >
        {audioUrl ? (
          <>
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            <div className="flex items-center gap-3">
              {/* Play / pause */}
              <button
                type="button"
                onClick={togglePlay}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{
                  background: "rgba(147,51,234,0.3)",
                  border: "1px solid rgba(168,85,247,0.4)",
                }}
              >
                {isPlaying ? (
                  <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Current time */}
              <span className="shrink-0 text-xs font-mono w-9 text-right text-white/50">
                {secondsToDuration(currentTime)}
              </span>

              {/* Progress bar */}
              <div
                className="flex-1 relative h-2 rounded-full cursor-pointer overflow-hidden"
                style={{ background: "rgba(255,255,255,0.08)" }}
                onClick={handleProgressClick}
              >
                {/* Fill */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg,#7c3aed,#a855f7)",
                    transition: "width 0.1s linear",
                  }}
                />
                {/* Segment tick marks */}
                {duration > 0 && segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="absolute inset-y-0 w-px"
                    style={{
                      left: `${(seg.startSeconds / duration) * 100}%`,
                      background: "rgba(216,180,254,0.4)",
                    }}
                  />
                ))}
              </div>

              {/* Duration */}
              <span className="shrink-0 text-xs font-mono w-9 text-white/30">
                {secondsToDuration(duration)}
              </span>
            </div>

            {/* Active segment text preview */}
            {activeId !== null && (() => {
              const seg = segments.find((s) => s.id === activeId);
              return seg ? (
                <p className="mt-1.5 text-center text-xs text-purple-300/60 truncate px-12">
                  {seg.text.replace(/\n/g, " ")}
                </p>
              ) : null;
            })()}
          </>
        ) : (
          <p className="text-center text-white/25 text-xs py-1">
            No audio available — open the editor from the Generate page to enable playback
          </p>
        )}
      </div>

    </div>
  );
}

// ── TimeInput component ────────────────────────────────────────────────────────

function TimeInput({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
      spellCheck={false}
      className="w-24 text-xs font-mono text-center rounded-md px-2 py-1 outline-none transition-colors"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        color: "rgba(255,255,255,0.65)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "rgba(168,85,247,0.5)";
        e.currentTarget.style.color = "#fff";
        e.currentTarget.select();
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
        e.currentTarget.style.color = "rgba(255,255,255,0.65)";
      }}
    />
  );
}
