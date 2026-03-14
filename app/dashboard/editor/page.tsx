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

// ── SubStyle ───────────────────────────────────────────────────────────────────

interface SubStyle {
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  textColor: string;
  bgColor: string;
  bgOpacity: number;    // 0–100
  strokeColor: string;
  strokeWidth: number;  // 0–5
  position: string;
}

const DEFAULT_STYLE: SubStyle = {
  fontSize: 24,
  fontFamily: "Inter",
  bold: false,
  italic: false,
  textColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 0,
  strokeColor: "#000000",
  strokeWidth: 0,
  position: "bottom-center",
};

const FONT_OPTIONS = ["Inter", "Roboto", "Arial", "Georgia", "Courier New", "Impact"];

const POSITION_GRID = [
  ["top-left",    "top-center",    "top-right"],
  ["middle-left", "middle-center", "middle-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  "top-left":      { top: "8%",  left: "5%" },
  "top-center":    { top: "8%",  left: "50%", transform: "translateX(-50%)" },
  "top-right":     { top: "8%",  right: "5%" },
  "middle-left":   { top: "50%", left: "5%",  transform: "translateY(-50%)" },
  "middle-center": { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
  "middle-right":  { top: "50%", right: "5%", transform: "translateY(-50%)" },
  "bottom-left":   { bottom: "8%", left: "5%" },
  "bottom-center": { bottom: "8%", left: "50%", transform: "translateX(-50%)" },
  "bottom-right":  { bottom: "8%", right: "5%" },
};

function hexToRgba(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

function loadStyle(): SubStyle {
  try {
    const raw = localStorage.getItem("darijasub_style");
    if (raw) return { ...DEFAULT_STYLE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_STYLE };
}

// ── DisplaySegment ─────────────────────────────────────────────────────────────

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

  // Audio player
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [activeId, setActiveId]       = useState<number | null>(null);

  // Chunk popover
  const [chunkOpen, setChunkOpen] = useState(false);
  const [chunkSize, setChunkSize] = useState(3);
  const [chunkMode, setChunkMode] = useState<"words" | "chars">("words");
  const chunkPopoverRef = useRef<HTMLDivElement>(null);

  // Style panel
  const [styleOpen, setStyleOpen]             = useState(false);
  const [subStyle, setSubStyle]               = useState<SubStyle>(DEFAULT_STYLE);
  const [customFontLoaded, setCustomFontLoaded] = useState(false);

  const audioRef       = useRef<HTMLAudioElement>(null);
  const segRefs        = useRef<Map<number, HTMLDivElement>>(new Map());
  const userSeekingRef = useRef(false);

  // ── Load from localStorage ─────────────────────────────────────────────────

  useEffect(() => {
    setSubStyle(loadStyle());
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

  // Persist style
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("darijasub_style", JSON.stringify(subStyle)); } catch { /* ignore */ }
  }, [subStyle, loaded]);

  // Close chunk popover on outside click
  useEffect(() => {
    if (!chunkOpen) return;
    const h = (e: MouseEvent) => {
      if (chunkPopoverRef.current && !chunkPopoverRef.current.contains(e.target as Node))
        setChunkOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [chunkOpen]);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setCurrentTime(t);
    const active = segments.find((s) => t >= s.startSeconds && t < s.endSeconds);
    const newId = active?.id ?? null;
    setActiveId((prev) => {
      if (prev !== newId && newId !== null && !userSeekingRef.current)
        segRefs.current.get(newId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play(); else audio.pause();
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
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  // ── Segment editing ────────────────────────────────────────────────────────

  const updateText = (id: number, text: string) =>
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));

  const updateTimeDisplay = (id: number, field: "startDisplay" | "endDisplay", value: string) =>
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const sec = displayToSeconds(value);
        return field === "startDisplay"
          ? { ...s, startDisplay: value, startSeconds: sec }
          : { ...s, endDisplay: value, endSeconds: sec };
      })
    );

  const deleteSegment = (id: number) =>
    setSegments((prev) => prev.filter((s) => s.id !== id));

  // ── Chunking ───────────────────────────────────────────────────────────────

  const applyChunking = () => {
    const result: DisplaySegment[] = [];
    let newId = 1;
    for (const seg of segments) {
      const dur = seg.endSeconds - seg.startSeconds;
      if (dur <= 0) { result.push({ ...seg, id: newId++ }); continue; }
      const units: string[] =
        chunkMode === "words"
          ? seg.text.trim().split(/\s+/).filter(Boolean)
          : Array.from({ length: Math.ceil(seg.text.trim().length / chunkSize) }, (_, i) =>
              seg.text.trim().slice(i * chunkSize, (i + 1) * chunkSize).trim()
            ).filter(Boolean);
      if (!units.length) { result.push({ ...seg, id: newId++ }); continue; }
      const chunks: string[] =
        chunkMode === "words"
          ? Array.from({ length: Math.ceil(units.length / chunkSize) }, (_, i) =>
              units.slice(i * chunkSize, (i + 1) * chunkSize).join(" ")
            )
          : units;
      if (chunks.length === 1) { result.push({ ...seg, id: newId++ }); continue; }
      const counts = chunks.map((c) =>
        chunkMode === "words" ? c.split(/\s+/).length : c.length
      );
      const total = counts.reduce((a, b) => a + b, 0);
      let elapsed = seg.startSeconds;
      for (let i = 0; i < chunks.length; i++) {
        const end = i === chunks.length - 1
          ? seg.endSeconds
          : elapsed + dur * (counts[i] / total);
        result.push(toDisplay({ id: newId, index: newId, startSeconds: elapsed, endSeconds: end, text: chunks[i] }));
        newId++;
        elapsed = end;
      }
    }
    setSegments(result);
    setChunkOpen(false);
  };

  // ── Font upload ────────────────────────────────────────────────────────────

  const handleFontUpload = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const font = new FontFace("Custom Font", buffer);
      await font.load();
      document.fonts.add(font);
      setCustomFontLoaded(true);
      setSubStyle((prev) => ({ ...prev, fontFamily: "Custom Font" }));
    } catch {
      alert("Could not load font file. Make sure it is a valid .ttf, .otf, or .woff file.");
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportSrt = () => downloadText(segmentsToSrt(segments), `${filename}.srt`);
  const exportVtt = () => downloadText(segmentsToVtt(segments), `${filename}.vtt`);

  // ── Loading / not found states ─────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/8"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard"
            className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm shrink-0">
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

          {/* Chunk popover */}
          <div ref={chunkPopoverRef} className="relative">
            <button type="button" onClick={() => setChunkOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{
                background: chunkOpen ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.04)",
                borderColor: chunkOpen ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
                color: chunkOpen ? "#d8b4fe" : "rgba(255,255,255,0.65)",
              }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="6" cy="6" r="3" strokeWidth={2}/><circle cx="6" cy="18" r="3" strokeWidth={2}/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>
              </svg>
              <span className="hidden sm:inline">Chunk</span>
            </button>
            {chunkOpen && (
              <div className="absolute right-0 top-full mt-2 rounded-xl border border-white/10 shadow-2xl p-4 w-64"
                style={{ background: "linear-gradient(160deg,#1c0b35 0%,#110620 100%)", zIndex: 200 }}>
                <p className="text-white/80 text-xs font-semibold mb-3">✂️ Chunk Words</p>
                <div className="mb-4">
                  <p className="text-white/40 text-xs mb-1.5">Split mode</p>
                  <div className="flex rounded-lg overflow-hidden border border-white/10 p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                    {(["words", "chars"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setChunkMode(m)}
                        className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{ background: chunkMode === m ? "rgba(147,51,234,0.5)" : "transparent", color: chunkMode === m ? "#f3e8ff" : "rgba(255,255,255,0.4)" }}>
                        {m === "words" ? "By Words" : "By Characters"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white/40 text-xs">{chunkMode === "words" ? "Words per chunk" : "Chars per chunk"}</p>
                    <span className="text-purple-300 text-xs font-bold tabular-nums">{chunkSize}</span>
                  </div>
                  <input type="range" min={1} max={chunkMode === "words" ? 6 : 20} value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(90deg,#7c3aed ${((chunkSize-1)/((chunkMode==="words"?6:20)-1))*100}%,rgba(255,255,255,0.1) 0%)` }} />
                  <div className="flex justify-between mt-1">
                    <span className="text-white/20 text-xs">1</span>
                    <span className="text-white/20 text-xs">{chunkMode === "words" ? 6 : 20}</span>
                  </div>
                </div>
                <p className="text-white/25 text-xs mb-3 leading-relaxed">
                  Split into groups of <span className="text-purple-300/70">{chunkSize} {chunkMode === "words" ? "words" : "chars"}</span>. Timestamps distributed proportionally.
                </p>
                <button type="button" onClick={applyChunking}
                  className="w-full py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
                  Apply Chunking
                </button>
              </div>
            )}
          </div>

          {/* Style panel toggle */}
          <button type="button" onClick={() => setStyleOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: styleOpen ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.04)",
              borderColor: styleOpen ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
              color: styleOpen ? "#d8b4fe" : "rgba(255,255,255,0.65)",
            }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="hidden sm:inline">Style</span>
          </button>

          {/* Export buttons */}
          <button type="button" onClick={exportSrt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-white/70 hover:text-white border border-white/10 hover:border-white/25"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Export</span> SRT
          </button>
          <button type="button" onClick={exportVtt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
            style={{ background: "rgba(147,51,234,0.1)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Export</span> VTT
          </button>
        </div>
      </header>

      {/* ── Content row (segments + optional style panel) ───────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Segment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {segments.map((seg, i) => {
            const isActive = seg.id === activeId;
            return (
              <div key={seg.id}
                ref={(el) => { if (el) segRefs.current.set(seg.id, el); else segRefs.current.delete(seg.id); }}
                className="rounded-xl border transition-all duration-150"
                style={{
                  background: isActive ? "linear-gradient(135deg,rgba(147,51,234,0.15) 0%,rgba(109,40,217,0.06) 100%)" : "rgba(255,255,255,0.025)",
                  borderColor: isActive ? "rgba(168,85,247,0.45)" : "rgba(255,255,255,0.07)",
                }}>
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                  <button type="button" onClick={() => seekTo(seg.startSeconds)} title="Click to seek"
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: isActive ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "#e9d5ff" : "rgba(255,255,255,0.3)",
                      border: isActive ? "1px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    }}>
                    {i + 1}
                  </button>
                  <TimeInput value={seg.startDisplay} onChange={(v) => updateTimeDisplay(seg.id, "startDisplay", v)} onCommit={() => seekTo(seg.startSeconds)} />
                  <span className="text-white/20 text-xs">→</span>
                  <TimeInput value={seg.endDisplay} onChange={(v) => updateTimeDisplay(seg.id, "endDisplay", v)} onCommit={() => seekTo(seg.endSeconds)} />
                  <button type="button" onClick={() => deleteSegment(seg.id)} title="Delete segment"
                    className="ml-auto shrink-0 w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-3 pb-2.5">
                  <textarea value={seg.text} onChange={(e) => updateText(seg.id, e.target.value)}
                    rows={Math.max(1, seg.text.split("\n").length)} dir="auto"
                    className="w-full resize-none text-sm outline-none rounded-lg px-3 py-2 leading-relaxed transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                      color: isActive ? "#f3e8ff" : "rgba(255,255,255,0.85)", fontFamily: "inherit",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.35)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }} />
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

        {/* Style panel */}
        {styleOpen && (
          <StylePanel
            style={subStyle}
            onChange={setSubStyle}
            onClose={() => setStyleOpen(false)}
            customFontLoaded={customFontLoaded}
            onFontUpload={handleFontUpload}
          />
        )}
      </div>

      {/* ── Audio player ───────────────────────────────────────────────────── */}
      <div className="shrink-0 px-5 py-3 border-t border-white/8" style={{ background: "rgba(8,4,18,0.97)" }}>
        {audioUrl ? (
          <>
            <audio ref={audioRef} src={audioUrl} preload="metadata"
              onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)} />
            <div className="flex items-center gap-3">
              <button type="button" onClick={togglePlay}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{ background: "rgba(147,51,234,0.3)", border: "1px solid rgba(168,85,247,0.4)" }}>
                {isPlaying ? (
                  <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <span className="shrink-0 text-xs font-mono w-9 text-right text-white/50">{secondsToDuration(currentTime)}</span>
              <div className="flex-1 relative h-2 rounded-full cursor-pointer overflow-hidden"
                style={{ background: "rgba(255,255,255,0.08)" }} onClick={handleProgressClick}>
                <div className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#7c3aed,#a855f7)", transition: "width 0.1s linear" }} />
                {duration > 0 && segments.map((seg) => (
                  <div key={seg.id} className="absolute inset-y-0 w-px"
                    style={{ left: `${(seg.startSeconds / duration) * 100}%`, background: "rgba(216,180,254,0.4)" }} />
                ))}
              </div>
              <span className="shrink-0 text-xs font-mono w-9 text-white/30">{secondsToDuration(duration)}</span>
            </div>
            {activeId !== null && (() => {
              const seg = segments.find((s) => s.id === activeId);
              return seg ? <p className="mt-1.5 text-center text-xs text-purple-300/60 truncate px-12">{seg.text.replace(/\n/g, " ")}</p> : null;
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

// ── TimeInput ──────────────────────────────────────────────────────────────────

function TimeInput({ value, onChange, onCommit }: { value: string; onChange: (v: string) => void; onCommit: () => void }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      spellCheck={false}
      className="w-24 text-xs font-mono text-center rounded-md px-2 py-1 outline-none transition-colors"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.65)" }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.5)"; e.currentTarget.style.color = "#fff"; e.currentTarget.select(); }}
      onBlurCapture={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }} />
  );
}

// ── StylePanel ─────────────────────────────────────────────────────────────────

function StylePanel({
  style, onChange, onClose, customFontLoaded, onFontUpload,
}: {
  style: SubStyle;
  onChange: (s: SubStyle) => void;
  onClose: () => void;
  customFontLoaded: boolean;
  onFontUpload: (f: File) => void;
}) {
  const fontUploadRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SubStyle>(key: K, val: SubStyle[K]) => onChange({ ...style, [key]: val });

  const fontList = customFontLoaded ? [...FONT_OPTIONS, "Custom Font"] : FONT_OPTIONS;

  // Preview text style (font size capped so it fits the preview box)
  const previewSize = Math.min(style.fontSize, 26);
  const textAlign: React.CSSProperties["textAlign"] =
    style.position.includes("left") ? "left" : style.position.includes("right") ? "right" : "center";

  const previewTextStyle: React.CSSProperties = {
    fontSize: `${previewSize}px`,
    fontFamily: style.fontFamily,
    fontWeight: style.bold ? "bold" : "normal",
    fontStyle: style.italic ? "italic" : "normal",
    color: style.textColor,
    backgroundColor: style.bgOpacity > 0 ? hexToRgba(style.bgColor, style.bgOpacity) : "transparent",
    WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
    padding: style.bgOpacity > 0 ? "1px 6px" : undefined,
    display: "inline-block",
    lineHeight: 1.4,
    maxWidth: "90%",
    textAlign,
  };

  const posStyle = POSITION_STYLES[style.position] ?? POSITION_STYLES["bottom-center"];

  return (
    <div className="shrink-0 w-72 flex flex-col border-l border-white/8 overflow-hidden"
      style={{ background: "rgba(12,6,24,0.98)" }}>

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <span className="text-white/80 text-xs font-semibold flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Subtitle Style
        </span>
        <button type="button" onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/80 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">

        {/* ── FONT ──────────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Font</SectionLabel>

          {/* Font size */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/45 text-xs">Size</span>
              <span className="text-purple-300 text-xs font-bold tabular-nums">{style.fontSize}px</span>
            </div>
            <input type="range" min={12} max={72} value={style.fontSize}
              onChange={(e) => set("fontSize", Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(90deg,#7c3aed ${((style.fontSize-12)/60)*100}%,rgba(255,255,255,0.1) 0%)` }} />
            <div className="flex justify-between mt-1">
              <span className="text-white/20 text-xs">12</span>
              <span className="text-white/20 text-xs">72</span>
            </div>
          </div>

          {/* Font family */}
          <div className="mb-3">
            <span className="text-white/45 text-xs block mb-1.5">Family</span>
            <div className="grid grid-cols-2 gap-1">
              {fontList.map((f) => (
                <button key={f} type="button" onClick={() => set("fontFamily", f)}
                  className="px-2 py-1.5 rounded-lg text-xs text-left transition-all truncate"
                  style={{
                    fontFamily: f,
                    background: style.fontFamily === f ? "rgba(147,51,234,0.35)" : "rgba(255,255,255,0.04)",
                    border: style.fontFamily === f ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
                    color: style.fontFamily === f ? "#f3e8ff" : "rgba(255,255,255,0.6)",
                  }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Upload custom font */}
          <div className="mb-3">
            <input ref={fontUploadRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFontUpload(f); }} />
            <button type="button" onClick={() => fontUploadRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {customFontLoaded ? "Replace custom font" : "Upload custom font (.ttf / .otf / .woff)"}
            </button>
          </div>

          {/* Bold + Italic */}
          <div className="flex gap-2">
            {([["bold", "B", "font-bold"], ["italic", "I", "italic"]] as const).map(([key, label, cls]) => (
              <button key={key} type="button" onClick={() => set(key, !style[key])}
                className={`flex-1 py-2 rounded-lg text-sm transition-all ${cls}`}
                style={{
                  background: style[key] ? "rgba(147,51,234,0.35)" : "rgba(255,255,255,0.04)",
                  border: style[key] ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.1)",
                  color: style[key] ? "#f3e8ff" : "rgba(255,255,255,0.5)",
                }}>
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ── COLOR ─────────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Color</SectionLabel>

          {/* Text color */}
          <ColorRow label="Text" color={style.textColor} onChange={(c) => set("textColor", c)} />

          {/* Background color + opacity */}
          <div className="mb-3">
            <ColorRow label="Background" color={style.bgColor} onChange={(c) => set("bgColor", c)} />
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/30 text-xs">Opacity</span>
                <span className="text-white/50 text-xs tabular-nums">{style.bgOpacity}%</span>
              </div>
              <input type="range" min={0} max={100} value={style.bgOpacity}
                onChange={(e) => set("bgOpacity", Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(90deg,#7c3aed ${style.bgOpacity}%,rgba(255,255,255,0.1) 0%)` }} />
            </div>
          </div>

          {/* Stroke color + width */}
          <div>
            <ColorRow label="Outline" color={style.strokeColor} onChange={(c) => set("strokeColor", c)} />
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/30 text-xs">Width</span>
                <span className="text-white/50 text-xs tabular-nums">{style.strokeWidth}px</span>
              </div>
              <input type="range" min={0} max={5} step={0.5} value={style.strokeWidth}
                onChange={(e) => set("strokeWidth", Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(90deg,#7c3aed ${(style.strokeWidth/5)*100}%,rgba(255,255,255,0.1) 0%)` }} />
              <div className="flex justify-between mt-1">
                <span className="text-white/20 text-xs">0</span>
                <span className="text-white/20 text-xs">5</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── POSITION ──────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Position</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {POSITION_GRID.flat().map((pos) => {
              const isSelected = style.position === pos;
              return (
                <button key={pos} type="button" onClick={() => set("position", pos)}
                  title={pos.replace("-", " ")}
                  className="h-10 rounded-lg flex items-center justify-center transition-all"
                  style={{
                    background: isSelected ? "rgba(147,51,234,0.4)" : "rgba(255,255,255,0.04)",
                    border: isSelected ? "1px solid rgba(168,85,247,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  }}>
                  <PosIcon position={pos} active={isSelected} />
                </button>
              );
            })}
          </div>
        </section>

        {/* ── PREVIEW ───────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Preview</SectionLabel>
          <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "16/9", background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Subtle grid to hint at video frame */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px)", backgroundSize: "20% 20%" }} />
            <div className="absolute" style={posStyle}>
              <div dir="auto" style={previewTextStyle}>
                واش نبدأو
              </div>
              <div dir="ltr" style={{ ...previewTextStyle, display: "block", textAlign }}>
                Welcome friends
              </div>
            </div>
          </div>
          <p className="text-white/20 text-xs mt-1.5 text-center">Live preview • actual size may differ</p>
        </section>

      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">{children}</span>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

function ColorRow({ label, color, onChange }: { label: string; color: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-white/45 text-xs">{label}</span>
      <label className="relative cursor-pointer flex items-center gap-2">
        <span className="text-white/30 text-xs font-mono">{color}</span>
        <div className="w-7 h-7 rounded-lg border border-white/15 overflow-hidden relative"
          style={{ background: color }}>
          <input type="color" value={color} onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </div>
      </label>
    </div>
  );
}

function PosIcon({ position, active }: { position: string; active: boolean }) {
  const dotColor = active ? "#d8b4fe" : "rgba(255,255,255,0.25)";
  const row = position.startsWith("top") ? 0 : position.startsWith("middle") ? 1 : 2;
  const col = position.endsWith("left") ? 0 : position.endsWith("right") ? 2 : 1;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      {[0,1,2].map((r) => [0,1,2].map((c) => (
        <circle key={`${r}-${c}`} cx={5 + c * 7} cy={5 + r * 7} r={2}
          fill={r === row && c === col ? dotColor : "rgba(255,255,255,0.12)"} />
      )))}
    </svg>
  );
}
