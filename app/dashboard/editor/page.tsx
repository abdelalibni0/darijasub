"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  parseSrt,
  parseVtt,
  segmentsToSrt,
  segmentsToVtt,
  downloadText,
  secondsToDisplay,
  displayToSeconds,
  secondsToDuration,
  type EditorSegment,
} from "@/lib/srt-parse";
import { LANGUAGES, type Language } from "@/lib/languages";
import SchedulerModal from "@/components/SchedulerModal";

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

// ── Filler Word Remover ────────────────────────────────────────────────────────

interface FillerWord { word: string; lang: "EN" | "FR" | "AR" }

const FILLER_WORDS: FillerWord[] = [
  // English
  { word: "uhh",       lang: "EN" }, { word: "umm",      lang: "EN" },
  { word: "uh",        lang: "EN" }, { word: "um",       lang: "EN" },
  { word: "like",      lang: "EN" }, { word: "you know", lang: "EN" },
  { word: "basically", lang: "EN" }, { word: "literally", lang: "EN" },
  { word: "actually",  lang: "EN" }, { word: "right",    lang: "EN" },
  { word: "so",        lang: "EN" }, { word: "well",     lang: "EN" },
  // French
  { word: "euh",   lang: "FR" }, { word: "ben",   lang: "FR" },
  { word: "bah",   lang: "FR" }, { word: "voilà", lang: "FR" },
  { word: "genre", lang: "FR" }, { word: "quoi",  lang: "FR" },
  // Darija / Arabic
  { word: "يعني",  lang: "AR" }, { word: "واش",   lang: "AR" },
  { word: "هاك",   lang: "AR" }, { word: "ولا",   lang: "AR" },
  { word: "كيفاش", lang: "AR" }, { word: "هههه",  lang: "AR" },
  { word: "آآآ",   lang: "AR" }, { word: "اممم",  lang: "AR" },
];

function removeFillerWord(text: string, word: string): string {
  const isArabic = /[\u0600-\u06FF]/.test(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = isArabic
    ? new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g")
    : new RegExp(`\\b${escaped}\\b`, "gi");
  return text.replace(re, " ").replace(/\s{2,}/g, " ").trim();
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
  // Style panel
  const [styleOpen, setStyleOpen]               = useState(false);
  const [subStyle, setSubStyle]                 = useState<SubStyle>(DEFAULT_STYLE);
  const [customFontLoaded, setCustomFontLoaded] = useState(false);

  // AI Captions modal
  const [captionsOpen, setCaptionsOpen] = useState(false);

  // Multi-language export modal
  const [multiExportOpen, setMultiExportOpen] = useState(false);

  // AI Voiceover modal
  const [voiceoverOpen, setVoiceoverOpen] = useState(false);

  // Auto-chapters modal
  const [chaptersOpen, setChaptersOpen]   = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);

  // Video export modal
  const [videoExportOpen, setVideoExportOpen]     = useState(false);
  const [rawFilename, setRawFilename]             = useState<string | null>(null);
  const [videoStoragePath, setVideoStoragePath]   = useState<string | null>(null);
  const [videoUploadReady, setVideoUploadReady]   = useState(false);

  // Arabizi / Arabic script toggle
  const [scriptMode, setScriptMode]               = useState<"arabic" | "arabizi">("arabic");
  const [arabiziConverting, setArabiziConverting] = useState(false);
  // Map of segment id → original Arabic text, so toggling back is free
  const arabicOriginalRef = useRef<Map<number, string>>(new Map());

  // Clean (filler word remover) popover
  const [cleanOpen, setCleanOpen]       = useState(false);
  const [checkedFillers, setCheckedFillers] = useState<Set<string>>(
    () => new Set(FILLER_WORDS.map((f) => f.word))
  );
  const [customFiller, setCustomFiller] = useState("");
  const [cleanPreview, setCleanPreview] = useState<{ counts: [string, number][]; affected: number } | null>(null);

  // Toolbar refs
  const chunkBtnRef   = useRef<HTMLButtonElement>(null);
  const cleanBtnRef   = useRef<HTMLButtonElement>(null);
  const chunkPanelRef = useRef<HTMLDivElement>(null);
  const cleanPanelRef = useRef<HTMLDivElement>(null);
  const [chunkPos, setChunkPos] = useState<{ top: number; right: number } | null>(null);
  const [cleanPos, setCleanPos] = useState<{ top: number; left: number } | null>(null);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);

  const audioRef       = useRef<HTMLAudioElement>(null);
  const segRefs        = useRef<Map<number, HTMLDivElement>>(new Map());
  const userSeekingRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Load from localStorage ─────────────────────────────────────────────────

  useEffect(() => {
    setSubStyle(loadStyle());
    try {
      const raw = localStorage.getItem("darijasub_editor");
      if (!raw) { setNotFound(true); setLoaded(true); return; }
      const data = JSON.parse(raw) as { srtText?: string; audioUrl?: string; filename?: string };
      const srtText = data.srtText ?? "";
      if (!srtText.trim()) { setNotFound(true); setLoaded(true); return; }
      const parsed = parseSrt(srtText);
      if (!parsed.length) { setNotFound(true); setLoaded(true); return; }
      setSegments(parsed.map(toDisplay));
      if (data.audioUrl) setAudioUrl(data.audioUrl);
      if (data.filename) {
        setFilename(data.filename.replace(/\.[^/.]+$/, ""));
        setRawFilename(data.filename);
      }
      const vsp = localStorage.getItem("darijasub_video_url");
      if (vsp) setVideoStoragePath(vsp);
      setVideoUploadReady(localStorage.getItem("darijasub_upload_ready") === "true");
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

  // Close popovers on outside click
  useEffect(() => {
    if (!chunkOpen && !cleanOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chunkOpen && !chunkBtnRef.current?.contains(t) && !chunkPanelRef.current?.contains(t))
        setChunkOpen(false);
      if (cleanOpen && !cleanBtnRef.current?.contains(t) && !cleanPanelRef.current?.contains(t))
        setCleanOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [chunkOpen, cleanOpen]);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
    if (!segments.length) return;

    if (chunkMode === "words") {
      // Pool ALL words across ALL segments, then redistribute into chunkSize-word groups.
      // This means chunkSize=3 will merge short segments together if needed, making
      // every chunk size produce a visible result regardless of individual segment length.
      const wordItems: { word: string; start: number; end: number }[] = [];
      for (const seg of segments) {
        const words = seg.text.trim().split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        const dur = seg.endSeconds - seg.startSeconds;
        for (let i = 0; i < words.length; i++) {
          wordItems.push({
            word:  words[i],
            start: seg.startSeconds + (i / words.length) * dur,
            end:   seg.startSeconds + ((i + 1) / words.length) * dur,
          });
        }
      }
      if (!wordItems.length) return;

      const result: DisplaySegment[] = [];
      let newId = 1;
      for (let i = 0; i < wordItems.length; i += chunkSize) {
        const chunk = wordItems.slice(i, i + chunkSize);
        result.push(toDisplay({
          id: newId, index: newId,
          startSeconds: chunk[0].start,
          endSeconds:   chunk[chunk.length - 1].end,
          text:         chunk.map((w) => w.word).join(" "),
        }));
        newId++;
      }
      setSegments(result);

    } else {
      // Chars mode: split within each segment by character count.
      const result: DisplaySegment[] = [];
      let newId = 1;
      for (const seg of segments) {
        const dur = seg.endSeconds - seg.startSeconds;
        if (dur <= 0) { result.push({ ...seg, id: newId++ }); continue; }
        const text = seg.text.trim();
        const units = Array.from(
          { length: Math.ceil(text.length / chunkSize) },
          (_, i) => text.slice(i * chunkSize, (i + 1) * chunkSize).trim()
        ).filter(Boolean);
        if (units.length <= 1) { result.push({ ...seg, id: newId++ }); continue; }
        const total = units.reduce((a, u) => a + u.length, 0);
        let elapsed = seg.startSeconds;
        for (let i = 0; i < units.length; i++) {
          const end = i === units.length - 1
            ? seg.endSeconds
            : elapsed + dur * (units[i].length / total);
          result.push(toDisplay({ id: newId, index: newId, startSeconds: elapsed, endSeconds: end, text: units[i] }));
          newId++;
          elapsed = end;
        }
      }
      setSegments(result);
    }

    setChunkOpen(false);
  };

  // ── Filler word remover ─────────────────────────────────────────────────────

  const computeCleanPreview = () => {
    const allWords = [
      ...Array.from(checkedFillers),
      ...customFiller.split(",").map((s) => s.trim()).filter(Boolean),
    ];
    const counts = new Map<string, number>();
    const affectedSet = new Set<number>();
    for (const seg of segments) {
      for (const word of allWords) {
        const isArabic = /[\u0600-\u06FF]/.test(word);
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = isArabic
          ? new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g")
          : new RegExp(`\\b${escaped}\\b`, "gi");
        const matches = seg.text.match(re);
        if (matches && matches.length > 0) {
          counts.set(word, (counts.get(word) ?? 0) + matches.length);
          affectedSet.add(seg.id);
        }
      }
    }
    setCleanPreview({
      counts:   Array.from(counts.entries()).filter(([, n]) => n > 0),
      affected: affectedSet.size,
    });
  };

  const applyClean = () => {
    const allWords = [
      ...Array.from(checkedFillers),
      ...customFiller.split(",").map((s) => s.trim()).filter(Boolean),
    ];
    let changedCount = 0;
    const next = segments
      .map((seg) => {
        let text = seg.text;
        for (const word of allWords) text = removeFillerWord(text, word);
        if (text !== seg.text) changedCount++;
        return { ...seg, text };
      })
      .filter((seg) => seg.text.trim().length > 0);
    setSegments(next);
    setCleanPreview(null);
    setCleanOpen(false);
    setToast(`Removed fillers from ${changedCount} segment${changedCount !== 1 ? "s" : ""}`);
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

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!importInputRef.current) return;
    importInputRef.current.value = ""; // reset so same file can be re-imported
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const isVtt    = file.name.toLowerCase().endsWith(".vtt");
      const parsed   = isVtt ? parseVtt(text) : parseSrt(text);
      if (!parsed.length) {
        setToast("No subtitle segments found in file");
        return;
      }
      const withDisplay = parsed.map(toDisplay);
      setSegments(withDisplay);
      // Persist so the editor survives a refresh
      try {
        const existing = JSON.parse(localStorage.getItem("darijasub_editor") ?? "{}");
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const srtText  = isVtt
          ? text // store original; re-parsed on reload
          : text;
        localStorage.setItem("darijasub_editor", JSON.stringify({
          ...existing,
          srtText,
          filename: file.name,
        }));
        setFilename(baseName);
      } catch { /* ignore */ }
      setToast(`Loaded ${parsed.length} segments from ${file.name}`);
    };
    reader.readAsText(file);
  };

  // ── Arabizi toggle ─────────────────────────────────────────────────────────

  const toggleScript = async () => {
    if (arabiziConverting || segments.length === 0) return;

    if (scriptMode === "arabizi") {
      // Restore originals immediately — no API needed
      setSegments((prev) =>
        prev.map((s) => {
          const orig = arabicOriginalRef.current.get(s.id);
          return orig !== undefined ? { ...s, text: orig } : s;
        })
      );
      setScriptMode("arabic");
      return;
    }

    // Convert arabic → arabizi
    setArabiziConverting(true);
    try {
      const SEPARATOR = "|||";
      const texts = segments.map((s) => s.text);
      const joined = texts.join(SEPARATOR);

      const res = await fetch("/api/arabizi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: joined, direction: "to_arabizi" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Arabizi conversion failed");
      }

      const { result } = await res.json() as { result: string };
      const converted = result.split(SEPARATOR);

      // Save originals and apply converted texts
      const origMap = arabicOriginalRef.current;
      setSegments((prev) =>
        prev.map((s, i) => {
          origMap.set(s.id, s.text);
          const newText = converted[i]?.trim();
          return newText ? { ...s, text: newText } : s;
        })
      );
      setScriptMode("arabizi");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Arabizi conversion failed");
    } finally {
      setArabiziConverting(false);
    }
  };

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

      {/* ── Header (two-row) ────────────────────────────────────────────────── */}
      <header className="shrink-0 flex flex-col border-b border-white/8">

        {/* ROW 1 — Navigation & Export */}
        <div className="flex items-center gap-3 px-5 py-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
          <Link href="/dashboard"
            className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <span className="text-white/20 shrink-0">|</span>
          <span className="text-white/70 text-sm font-medium truncate min-w-0">{filename}</span>
          <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 shrink-0">
            {segments.length} segments
          </span>

          <div className="ml-auto flex items-center gap-1 shrink-0">
            {/* Hidden file input */}
            <input
              ref={importInputRef}
              type="file"
              accept=".srt,.vtt"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Import SRT/VTT */}
            <button type="button" onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.8)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import SRT
            </button>

            <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />

            {/* Export Video */}
            <button type="button" onClick={() => setVideoExportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Video
            </button>

            {/* Multi Export */}
            <button type="button" onClick={() => setMultiExportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{ background: "rgba(147,51,234,0.15)", borderColor: "rgba(168,85,247,0.4)", color: "#d8b4fe" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              Multi
            </button>

            {/* SRT */}
            <button type="button" onClick={exportSrt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-white/70 hover:text-white border border-white/10 hover:border-white/25"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              SRT
            </button>

            {/* VTT */}
            <button type="button" onClick={exportVtt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
              style={{ background: "rgba(147,51,234,0.1)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              VTT
            </button>

            <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />

            {/* Schedule */}
            <button type="button" onClick={() => setSchedulerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={{ background: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.35)", color: "#93c5fd" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule
            </button>
          </div>
        </div>

        {/* ROW 2 — Tools */}
        <div className="flex items-center gap-2 px-5 py-2" style={{ background: "rgba(0,0,0,0.18)" }}>

          {/* Chunk */}
          <button ref={chunkBtnRef} type="button"
            onClick={() => {
              const r = chunkBtnRef.current?.getBoundingClientRect();
              if (r) setChunkPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
              setChunkOpen((o) => !o); setCleanOpen(false);
            }}
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
            Chunk
          </button>

          {/* Clean */}
          <button ref={cleanBtnRef} type="button"
            onClick={() => {
              const r = cleanBtnRef.current?.getBoundingClientRect();
              if (r) setCleanPos({ top: r.bottom + 8, left: r.left });
              setCleanOpen((o) => !o); setChunkOpen(false);
              setCleanPreview(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: cleanOpen ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.04)",
              borderColor: cleanOpen ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
              color: cleanOpen ? "#d8b4fe" : "rgba(255,255,255,0.65)",
            }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
            ✂️ Clean
          </button>

          {/* Voiceover */}
          <button type="button" onClick={() => setVoiceoverOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Voiceover
          </button>

          {/* Script toggle */}
          <button type="button" disabled={arabiziConverting}
            onClick={() => { if (!arabiziConverting) toggleScript(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: scriptMode === "arabizi" ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.04)",
              borderColor: scriptMode === "arabizi" ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
              color: scriptMode === "arabizi" ? "#d8b4fe" : "rgba(255,255,255,0.65)",
              opacity: arabiziConverting ? 0.6 : 1,
              cursor: arabiziConverting ? "not-allowed" : "pointer",
            }}>
            {arabiziConverting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <span className="font-bold" style={{ fontFamily: "serif" }}>ع/A</span>
            )}
            {arabiziConverting ? "Converting…" : scriptMode === "arabizi" ? "Arabic" : "Arabizi"}
          </button>

          {/* AI Captions */}
          <button type="button" onClick={() => setCaptionsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Captions
          </button>

          {/* Chapters */}
          <button type="button" onClick={() => setChaptersOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h7" />
            </svg>
            Chapters
          </button>

          {/* Style */}
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
            Style
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

      {/* ── AI Captions modal ──────────────────────────────────────────────── */}
      {captionsOpen && (
        <CaptionsModal
          segments={segments}
          onClose={() => setCaptionsOpen(false)}
        />
      )}

      {/* ── Video Export modal ──────────────────────────────────────────────── */}
      {videoExportOpen && (
        <VideoExportModal
          segments={segments}
          style={subStyle}
          audioUrl={audioUrl}
          rawFilename={rawFilename}
          videoStoragePath={videoStoragePath}
          videoUploadReady={videoUploadReady}
          onClose={() => setVideoExportOpen(false)}
        />
      )}

      {/* ── Multi Export modal ──────────────────────────────────────────────── */}
      {multiExportOpen && (
        <MultiExportModal
          segments={segments}
          filename={filename}
          onClose={() => setMultiExportOpen(false)}
        />
      )}

      {/* ── Voiceover modal ────────────────────────────────────────────────── */}
      {voiceoverOpen && (
        <VoiceoverModal
          segments={segments}
          onClose={() => setVoiceoverOpen(false)}
        />
      )}

      {/* ── Auto-chapters modal ─────────────────────────────────────────────── */}
      {chaptersOpen && (
        <ChaptersModal
          segments={segments}
          filename={filename}
          onClose={() => setChaptersOpen(false)}
        />
      )}

      {/* ── Scheduler modal ──────────────────────────────────────────────────── */}
      {schedulerOpen && (
        <SchedulerModal
          onClose={() => setSchedulerOpen(false)}
          initialCaption={segments.map((s) => s.text).join(" ")}
        />
      )}

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

      {/* ── Chunk popover (position:fixed — escapes all overflow contexts) ──── */}
      {chunkOpen && chunkPos && (
        <div ref={chunkPanelRef}
          className="rounded-xl border border-white/10 shadow-2xl p-4 w-64"
          style={{ position: "fixed", top: chunkPos.top, right: chunkPos.right, zIndex: 9999,
            background: "linear-gradient(160deg,#1c0b35 0%,#110620 100%)" }}>
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

      {/* ── Clean popover (position:fixed) ──────────────────────────────────── */}
      {cleanOpen && cleanPos && (
        <div ref={cleanPanelRef}
          className="rounded-xl border border-white/10 shadow-2xl p-4 w-80 max-h-[80vh] overflow-y-auto"
          style={{ position: "fixed", top: cleanPos.top, left: cleanPos.left, zIndex: 9999,
            background: "linear-gradient(160deg,#1c0b35 0%,#110620 100%)" }}>
          <p className="text-white/80 text-xs font-semibold mb-3">Remove Filler Words</p>

          {(["EN", "FR", "AR"] as const).map((lang) => (
            <div key={lang} className="mb-3">
              <p className="text-white/30 text-xs mb-1.5 uppercase tracking-wider">
                {lang === "EN" ? "English" : lang === "FR" ? "French" : "Darija / Arabic"}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {FILLER_WORDS.filter((f) => f.lang === lang).map((f) => (
                  <label key={f.word} className="flex items-center gap-1 cursor-pointer select-none"
                    style={{ color: checkedFillers.has(f.word) ? "#d8b4fe" : "rgba(255,255,255,0.35)" }}>
                    <input type="checkbox" checked={checkedFillers.has(f.word)}
                      onChange={(e) => {
                        setCheckedFillers((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(f.word); else next.delete(f.word);
                          return next;
                        });
                        setCleanPreview(null);
                      }}
                      className="accent-purple-500 w-3 h-3" />
                    <span className="text-xs" dir={lang === "AR" ? "rtl" : "ltr"}>{f.word}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="mb-3">
            <p className="text-white/30 text-xs mb-1.5 uppercase tracking-wider">Custom (comma-separated)</p>
            <input type="text" value={customFiller}
              onChange={(e) => { setCustomFiller(e.target.value); setCleanPreview(null); }}
              placeholder="e.g. literally, tbh, wlah"
              className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none placeholder:text-white/20"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }} />
          </div>

          {cleanPreview && (
            <div className="mb-3 p-2.5 rounded-lg text-xs"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
              {cleanPreview.counts.length === 0 ? (
                <p className="text-white/50">No fillers found in current segments.</p>
              ) : (
                <>
                  <p className="text-purple-300 font-semibold mb-1">
                    {cleanPreview.affected} segment{cleanPreview.affected !== 1 ? "s" : ""} affected
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-white/60">
                    {cleanPreview.counts.map(([word, n]) => (
                      <span key={word}>"{word}" ×{n}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {!cleanPreview ? (
            <button type="button" onClick={computeCleanPreview}
              className="w-full py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
              Remove Fillers
            </button>
          ) : cleanPreview.counts.length === 0 ? (
            <button type="button" onClick={() => setCleanPreview(null)}
              className="w-full py-2 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
              Close
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setCleanPreview(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                Cancel
              </button>
              <button type="button" onClick={applyClean}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
                Confirm & Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Toast notification ──────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl pointer-events-none"
          style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", zIndex: 9999, boxShadow: "0 8px 32px rgba(124,58,237,0.5)" }}>
          ✅ {toast}
        </div>
      )}
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

// ── Subtitle Templates ─────────────────────────────────────────────────────────

type TemplateCategory = "Trending" | "Glow" | "Classic" | "Arabic" | "Aesthetic";
const TEMPLATE_CATEGORIES: TemplateCategory[] = ["Trending", "Glow", "Classic", "Arabic", "Aesthetic"];
interface SubTemplate { name: string; style: SubStyle; }

const SUBTITLE_TEMPLATES: Record<TemplateCategory, SubTemplate[]> = {
  Trending: [
    { name: "TikTok Viral", style: { fontSize: 28, fontFamily: "Impact",  bold: false, italic: false, textColor: "#ffffff", bgColor: "#000000", bgOpacity: 0,   strokeColor: "#000000", strokeWidth: 3,   position: "bottom-center" } },
    { name: "Bold Yellow",  style: { fontSize: 28, fontFamily: "Impact",  bold: false, italic: false, textColor: "#FFE500", bgColor: "#000000", bgOpacity: 0,   strokeColor: "#000000", strokeWidth: 3,   position: "bottom-center" } },
    { name: "Clean White",  style: { fontSize: 22, fontFamily: "Roboto",  bold: false, italic: false, textColor: "#ffffff", bgColor: "#000000", bgOpacity: 0,   strokeColor: "#000000", strokeWidth: 2,   position: "bottom-center" } },
  ],
  Glow: [
    { name: "Neon Green",  style: { fontSize: 24, fontFamily: "Inter", bold: true, italic: false, textColor: "#00FF87", bgColor: "#000000", bgOpacity: 0, strokeColor: "#00FF87", strokeWidth: 1, position: "bottom-center" } },
    { name: "Gold Glow",   style: { fontSize: 24, fontFamily: "Inter", bold: true, italic: false, textColor: "#FFD700", bgColor: "#000000", bgOpacity: 0, strokeColor: "#FFD700", strokeWidth: 1, position: "bottom-center" } },
    { name: "Purple Haze", style: { fontSize: 24, fontFamily: "Inter", bold: true, italic: false, textColor: "#BF5FFF", bgColor: "#000000", bgOpacity: 0, strokeColor: "#BF5FFF", strokeWidth: 1, position: "bottom-center" } },
  ],
  Classic: [
    { name: "Netflix", style: { fontSize: 22, fontFamily: "Georgia", bold: false, italic: false, textColor: "#ffffff", bgColor: "#000000", bgOpacity: 75,  strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
    { name: "Cinema",  style: { fontSize: 20, fontFamily: "Georgia", bold: false, italic: true,  textColor: "#ffffff", bgColor: "#000000", bgOpacity: 85,  strokeColor: "#000000", strokeWidth: 0, position: "middle-center" } },
    { name: "BBC",     style: { fontSize: 20, fontFamily: "Arial",   bold: true,  italic: false, textColor: "#ffffff", bgColor: "#FFE500", bgOpacity: 100, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
  ],
  Arabic: [
    { name: "Arabic Gold",   style: { fontSize: 26, fontFamily: "Inter",  bold: false, italic: false, textColor: "#FFD700", bgColor: "#1a1a1a", bgOpacity: 85, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
    { name: "Darija Street", style: { fontSize: 28, fontFamily: "Impact", bold: false, italic: false, textColor: "#ffffff", bgColor: "#6B2FD9", bgOpacity: 85, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
    { name: "Maghreb",       style: { fontSize: 24, fontFamily: "Inter",  bold: false, italic: false, textColor: "#ffffff", bgColor: "#2D6A2D", bgOpacity: 80, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
  ],
  Aesthetic: [
    { name: "Soft Pink",   style: { fontSize: 20, fontFamily: "Georgia", bold: false, italic: true,  textColor: "#ffffff", bgColor: "#FF6B9D", bgOpacity: 50, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
    { name: "Minimal",     style: { fontSize: 20, fontFamily: "Inter",   bold: false, italic: false, textColor: "#ffffff", bgColor: "#000000", bgOpacity: 0,  strokeColor: "#000000", strokeWidth: 1, position: "bottom-center" } },
    { name: "Pastel Blue", style: { fontSize: 22, fontFamily: "Inter",   bold: false, italic: false, textColor: "#ffffff", bgColor: "#4A90D9", bgOpacity: 60, strokeColor: "#000000", strokeWidth: 0, position: "bottom-center" } },
  ],
};

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
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("Trending");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

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

        {/* ── TEMPLATES ─────────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Templates</SectionLabel>

          {/* Category tabs — wrap to avoid horizontal scroll */}
          <div className="flex flex-wrap gap-1 mb-3">
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: activeCategory === cat ? "rgba(147,51,234,0.4)" : "rgba(255,255,255,0.06)",
                  border:     activeCategory === cat ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color:      activeCategory === cat ? "#e9d5ff" : "rgba(255,255,255,0.45)",
                }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Template cards — horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
            {SUBTITLE_TEMPLATES[activeCategory].map((tmpl) => {
              const key = `${activeCategory}:${tmpl.name}`;
              const isActive = selectedTemplate === key;
              const cardTextStyle: React.CSSProperties = {
                fontFamily:     tmpl.style.fontFamily,
                fontWeight:     tmpl.style.bold   ? "bold"   : "normal",
                fontStyle:      tmpl.style.italic ? "italic" : "normal",
                fontSize:       "9px",
                color:          tmpl.style.textColor,
                backgroundColor: tmpl.style.bgOpacity > 0
                  ? hexToRgba(tmpl.style.bgColor, tmpl.style.bgOpacity)
                  : "transparent",
                WebkitTextStroke: tmpl.style.strokeWidth > 0
                  ? `${Math.min(tmpl.style.strokeWidth * 0.3, 0.8)}px ${tmpl.style.strokeColor}`
                  : undefined,
                padding:    tmpl.style.bgOpacity > 0 ? "0 3px" : undefined,
                lineHeight: 1.3,
                display:    "inline-block",
                textAlign:  "center",
                whiteSpace: "nowrap",
                maxWidth:   "72px",
                overflow:   "hidden",
                textOverflow: "ellipsis",
              };
              return (
                <button key={key} type="button"
                  onClick={() => { onChange(tmpl.style); setSelectedTemplate(key); }}
                  className="shrink-0 flex flex-col items-center gap-1.5 transition-all">
                  {/* Card preview — 80×60 like CapCut */}
                  <div className="rounded-lg overflow-hidden relative"
                    style={{
                      width: 80, height: 60,
                      background: "linear-gradient(160deg,#1a1230 0%,#0a0814 100%)",
                      border:     isActive ? "2px solid #a855f7" : "1px solid rgba(255,255,255,0.12)",
                      boxShadow:  isActive ? "0 0 8px rgba(168,85,247,0.4)" : "none",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}>
                    {/* Faint grid texture */}
                    <div className="absolute inset-0 opacity-5"
                      style={{
                        backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.3) 1px,transparent 1px)",
                        backgroundSize: "25% 25%",
                      }} />
                    {/* Subtitle text anchored to bottom */}
                    <div className="absolute bottom-2 inset-x-0 flex justify-center px-1">
                      <span style={cardTextStyle}>واش نبدأو</span>
                    </div>
                  </div>
                  {/* Template name */}
                  <span style={{
                    fontSize:  "9px",
                    color:     isActive ? "#d8b4fe" : "rgba(255,255,255,0.4)",
                    textAlign: "center",
                    lineHeight: 1.2,
                    maxWidth:  "78px",
                    wordBreak: "break-word",
                    transition: "color 0.15s",
                  }}>
                    {tmpl.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

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
            <ColorRow label="Background" color={style.bgColor} onChange={(c) => {
              // Auto-enable opacity so the color change is immediately visible
              onChange({ ...style, bgColor: c, bgOpacity: style.bgOpacity === 0 ? 60 : style.bgOpacity });
            }} />
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
            <ColorRow label="Outline" color={style.strokeColor} onChange={(c) => {
              // Auto-enable width so the color change is immediately visible
              onChange({ ...style, strokeColor: c, strokeWidth: style.strokeWidth === 0 ? 2 : style.strokeWidth });
            }} />
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

// ── Language picker data (for CaptionsModal) ───────────────────────────────────

const CAPTION_FLAGS: Record<string, string> = {
  "darija-ma": "🇲🇦", "darija-dz": "🇩🇿", "tunisian_darija": "🇹🇳",
  "arabic_egyptian": "🇪🇬", "arabic_levantine": "🇱🇧", "arabic_gulf": "🇸🇦", "msa": "🌍",
  "en": "🇬🇧", "fr": "🇫🇷", "es": "🇪🇸", "de": "🇩🇪", "it": "🇮🇹",
  "pt": "🇵🇹", "nl": "🇳🇱", "tr": "🇹🇷", "ru": "🇷🇺", "uk": "🇺🇦",
  "pl": "🇵🇱", "ro": "🇷🇴", "hu": "🇭🇺", "cs": "🇨🇿", "sk": "🇸🇰",
  "bg": "🇧🇬", "sr": "🇷🇸", "hr": "🇭🇷", "el": "🇬🇷", "fi": "🇫🇮",
  "sv": "🇸🇪", "no": "🇳🇴", "da": "🇩🇰", "ja": "🇯🇵", "ko": "🇰🇷",
  "zh": "🇨🇳", "zh-TW": "🇹🇼", "hi": "🇮🇳", "ur": "🇵🇰", "bn": "🇧🇩",
  "id": "🇮🇩", "ms": "🇲🇾", "tl": "🇵🇭", "th": "🇹🇭", "vi": "🇻🇳",
  "he": "🇮🇱", "fa": "🇮🇷", "ku": "🏳️", "sw": "🇰🇪", "ha": "🇳🇬", "am": "🇪🇹",
};

type CaptionLangGroup = "Arabic Dialects" | "Popular" | "Asian" | "Other";
const CAP_ARABIC  = new Set(["darija-ma","darija-dz","tunisian_darija","arabic_egyptian","arabic_levantine","arabic_gulf","msa"]);
const CAP_POPULAR = new Set(["en","fr","es","de","it","pt","nl","tr"]);
const CAP_ASIAN   = new Set(["ja","ko","zh","zh-TW","hi","id","vi","th"]);
function captionLangGroup(v: string): CaptionLangGroup {
  if (CAP_ARABIC.has(v))  return "Arabic Dialects";
  if (CAP_POPULAR.has(v)) return "Popular";
  if (CAP_ASIAN.has(v))   return "Asian";
  return "Other";
}
const CAPTION_GROUP_ORDER: CaptionLangGroup[] = ["Arabic Dialects", "Popular", "Asian", "Other"];
const CAPTION_GROUP_ICONS: Record<CaptionLangGroup, string> = {
  "Arabic Dialects": "🌙", "Popular": "⭐", "Asian": "🌏", "Other": "🌐",
};
const CAPTION_GROUPED = CAPTION_GROUP_ORDER.reduce<Record<CaptionLangGroup, Language[]>>(
  (acc, g) => ({ ...acc, [g]: LANGUAGES.filter((l) => captionLangGroup(l.value) === g) }),
  {} as Record<CaptionLangGroup, Language[]>
);

// ── CaptionsModal ──────────────────────────────────────────────────────────────

interface CaptionSuggestions {
  title: string;
  description: string;
  hashtags: string[];
  bestTimeToPost: string;
  hookComment: string;
}

const PLATFORMS = [
  { id: "youtube",   label: "YouTube",   emoji: "▶️" },
  { id: "tiktok",    label: "TikTok",    emoji: "🎵" },
  { id: "instagram", label: "Instagram", emoji: "📸" },
  { id: "facebook",  label: "Facebook",  emoji: "👥" },
  { id: "snapchat",  label: "Snapchat",  emoji: "👻" },
];

function CaptionsModal({
  segments,
  onClose,
}: {
  segments: DisplaySegment[];
  onClose: () => void;
}) {
  const [platform, setPlatform]               = useState("youtube");
  const [captionLang, setCaptionLang]         = useState("en");
  const [captionLangOpen, setCaptionLangOpen] = useState(false);
  const [captionLangQuery, setCaptionLangQuery] = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [result, setResult]                   = useState<CaptionSuggestions | null>(null);
  const [copied, setCopied]                   = useState<string | null>(null);

  const backdropRef        = useRef<HTMLDivElement>(null);
  const captionLangRef     = useRef<HTMLDivElement>(null);
  const captionLangSearchRef = useRef<HTMLInputElement>(null);

  const selectedCaptionLang = LANGUAGES.find((l) => l.value === captionLang);
  const filteredCaptionLangs = captionLangQuery.trim()
    ? LANGUAGES.filter((l) =>
        l.label.toLowerCase().includes(captionLangQuery.toLowerCase()) ||
        l.promptName.toLowerCase().includes(captionLangQuery.toLowerCase())
      )
    : null;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!captionLangOpen) return;
    const h = (e: MouseEvent) => {
      if (captionLangRef.current && !captionLangRef.current.contains(e.target as Node)) {
        setCaptionLangOpen(false);
        setCaptionLangQuery("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [captionLangOpen]);

  useEffect(() => {
    if (captionLangOpen) setTimeout(() => captionLangSearchRef.current?.focus(), 30);
  }, [captionLangOpen]);

  const handleGenerate = async () => {
    const subtitleText = segments.map((s) => s.text).join("\n");
    if (!subtitleText.trim()) { setError("No subtitle text to analyse."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/suggest-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleText, platform, language: selectedCaptionLang?.promptName ?? "English" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data as CaptionSuggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-lg flex flex-col rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0518 100%)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-white font-semibold text-sm">AI Caption Suggestions</span>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Platform selector */}
          <div>
            <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">Platform</p>
            <div className="flex gap-2 flex-wrap">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: platform === p.id ? "rgba(147,51,234,0.35)" : "rgba(255,255,255,0.05)",
                    border: platform === p.id ? "1px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    color: platform === p.id ? "#f3e8ff" : "rgba(255,255,255,0.55)",
                  }}>
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language selector */}
          <div>
            <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">Output language</p>
            <div ref={captionLangRef} className="relative">
              {/* Trigger */}
              <button
                type="button"
                onClick={() => setCaptionLangOpen((o) => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: captionLangOpen ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.15)",
                }}
              >
                <span className="text-2xl leading-none">{CAPTION_FLAGS[captionLang] ?? "🌐"}</span>
                <span className="flex-1 text-left text-white text-sm font-medium">
                  {selectedCaptionLang?.label ?? "Select language"}
                </span>
                <svg
                  className="w-4 h-4 text-white/40 shrink-0 transition-transform duration-200"
                  style={{ transform: captionLangOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown */}
              {captionLangOpen && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
                  style={{ zIndex: 200, background: "linear-gradient(160deg, #1c0b35 0%, #130720 100%)" }}
                >
                  {/* Search */}
                  <div className="p-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        ref={captionLangSearchRef}
                        type="text"
                        placeholder="Search languages..."
                        value={captionLangQuery}
                        onChange={(e) => setCaptionLangQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 rounded-lg outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto" style={{ maxHeight: "220px" }}>
                    {filteredCaptionLangs ? (
                      filteredCaptionLangs.length === 0 ? (
                        <p className="text-center text-white/30 text-sm py-6">No languages found</p>
                      ) : (
                        <div className="p-2 grid grid-cols-2 gap-1">
                          {filteredCaptionLangs.map((lang) => (
                            <CaptionLangOption key={lang.value} lang={lang} flag={CAPTION_FLAGS[lang.value] ?? "🌐"}
                              selected={lang.value === captionLang}
                              onSelect={(v) => { setCaptionLang(v); setCaptionLangOpen(false); setCaptionLangQuery(""); }} />
                          ))}
                        </div>
                      )
                    ) : (
                      CAPTION_GROUP_ORDER.map((group) => {
                        const langs = CAPTION_GROUPED[group];
                        if (!langs.length) return null;
                        return (
                          <div key={group}>
                            <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
                              <span className="text-xs">{CAPTION_GROUP_ICONS[group]}</span>
                              <span className="text-xs font-semibold uppercase tracking-wider"
                                style={{ color: "rgba(255,255,255,0.35)" }}>
                                {group}
                              </span>
                            </div>
                            <div className="px-2 pb-1 grid grid-cols-2 gap-1">
                              {langs.map((lang) => (
                                <CaptionLangOption key={lang.value} lang={lang} flag={CAPTION_FLAGS[lang.value] ?? "🌐"}
                                  selected={lang.value === captionLang}
                                  onSelect={(v) => { setCaptionLang(v); setCaptionLangOpen(false); setCaptionLangQuery(""); }} />
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Generate button */}
          <button type="button" onClick={handleGenerate} disabled={loading}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}>
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <ResultCard label="📌 Title" value={result.title} copyKey="title" copied={copied} onCopy={copyText} />
              <ResultCard label="📝 Description" value={result.description} copyKey="description" copied={copied} onCopy={copyText} multiline />
              <ResultCard
                label="🏷️ Hashtags"
                value={result.hashtags.join(" ")}
                copyKey="hashtags"
                copied={copied}
                onCopy={copyText}
                renderValue={
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.hashtags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full text-purple-300"
                        style={{ background: "rgba(147,51,234,0.2)", border: "1px solid rgba(168,85,247,0.25)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                }
              />
              <ResultCard label="🕐 Best time to post" value={result.bestTimeToPost} copyKey="time" copied={copied} onCopy={copyText} />
              <ResultCard label="💬 First comment hook" value={result.hookComment} copyKey="hook" copied={copied} onCopy={copyText} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptionLangOption({
  lang, flag, selected, onSelect,
}: {
  lang: Language; flag: string; selected: boolean; onSelect: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(lang.value)}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-100 w-full"
      style={{
        background: selected ? "rgba(147,51,234,0.35)" : "transparent",
        border:     selected ? "1px solid rgba(168,85,247,0.5)" : "1px solid transparent",
        color:      selected ? "#fff" : "rgba(255,255,255,0.65)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)";
        }
      }}
    >
      <span className="text-lg leading-none shrink-0">{flag}</span>
      <span className="text-xs font-medium leading-tight">{lang.label}</span>
      {selected && (
        <svg className="w-3 h-3 ml-auto shrink-0 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

function ResultCard({
  label, value, copyKey, copied, onCopy, multiline, renderValue,
}: {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  multiline?: boolean;
  renderValue?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-white/50 text-xs font-semibold">{label}</span>
        <button type="button" onClick={() => onCopy(value, copyKey)}
          className="shrink-0 flex items-center gap-1 text-xs transition-all rounded-md px-2 py-0.5"
          style={{
            background: copied === copyKey ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
            color: copied === copyKey ? "#86efac" : "rgba(255,255,255,0.4)",
            border: copied === copyKey ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}>
          {copied === copyKey ? (
            <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> Copied</>
          ) : (
            <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy</>
          )}
        </button>
      </div>
      {renderValue ?? (
        <p className={`text-white/85 text-sm mt-1.5 leading-relaxed ${multiline ? "whitespace-pre-wrap" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}

// ── VideoExportModal ────────────────────────────────────────────────────────────

const EXPORT_PLATFORMS = [
  { id: "youtube",          label: "YouTube",          aspect: "16:9", emoji: "▶️", w: 1920, h: 1080 },
  { id: "tiktok",           label: "TikTok",           aspect: "9:16", emoji: "🎵", w: 1080, h: 1920 },
  { id: "instagram_reels",  label: "Instagram Reels",  aspect: "9:16", emoji: "📸", w: 1080, h: 1920 },
  { id: "instagram_square", label: "Instagram Square", aspect: "1:1",  emoji: "⬜", w: 1080, h: 1080 },
];

const EXPORT_QUALITIES = [
  { id: "high",   label: "High",   sub: "1080p", crf: 18 },
  { id: "medium", label: "Medium", sub: "720p",  crf: 23 },
  { id: "fast",   label: "Fast",   sub: "480p",  crf: 28 },
];

const QUALITY_SCALE: Record<string, number> = { high: 1, medium: 720 / 1080, fast: 480 / 1080 };

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"];

function generateASS(
  segments: DisplaySegment[],
  style: SubStyle,
  playResX: number,
  playResY: number,
): string {
  const alignMap: Record<string, number> = {
    "top-left": 7,    "top-center": 8,    "top-right": 9,
    "middle-left": 4, "middle-center": 5, "middle-right": 6,
    "bottom-left": 1, "bottom-center": 2, "bottom-right": 3,
  };
  const alignment = alignMap[style.position] ?? 2;

  // Hex + alpha → ASS &HAABBGGRR (alpha 0 = opaque)
  const hexToAss = (hex: string, alphaPct = 0): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = Math.round((alphaPct / 100) * 255);
    const h2 = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `&H${h2(a)}${h2(b)}${h2(g)}${h2(r)}`;
  };

  const scaledSize  = Math.round(style.fontSize * (playResY / 1080));
  const primary     = hexToAss(style.textColor, 0);
  const outline     = hexToAss(style.strokeColor, 0);
  const back        = hexToAss(style.bgColor, 100 - style.bgOpacity);
  const borderStyle = style.bgOpacity > 0 ? 3 : 1;
  const outlineW    = borderStyle === 1 ? style.strokeWidth : 0;
  const bold        = style.bold ? -1 : 0;
  const italic      = style.italic ? -1 : 0;
  const marginV     = Math.round(playResY * 0.05);

  const toTime = (s: number) => {
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = Math.floor(s % 60);
    const cs = Math.round((s % 1) * 100);
    return `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
  };

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontFamily},${scaledSize},${primary},&H000000FF,${outline},${back},${bold},${italic},0,0,100,100,0,0,${borderStyle},${outlineW},0,${alignment},10,10,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = segments
    .map(seg => `Dialogue: 0,${toTime(seg.startSeconds)},${toTime(seg.endSeconds)},Default,,0,0,0,,${seg.text.replace(/\n/g, "\\N")}`)
    .join("\n");

  return `${header}\n${events}\n`;
}

function VideoExportModal({
  segments,
  style,
  audioUrl,
  rawFilename,
  videoStoragePath: initialStoragePath,
  videoUploadReady,
  onClose,
}: {
  segments: DisplaySegment[];
  style: SubStyle;
  audioUrl: string | null;
  rawFilename: string | null;
  videoStoragePath: string | null;
  videoUploadReady: boolean;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState("youtube");
  const [quality, setQuality]   = useState("medium");
  const [phase, setPhase]       = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError]       = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  const isAudioOnly = rawFilename
    ? AUDIO_EXTENSIONS.some(ext => rawFilename.toLowerCase().endsWith(ext))
    : false;

  const plat = EXPORT_PLATFORMS.find(p => p.id === platform)!;
  const busy = phase === "uploading" || phase === "processing";

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, busy]);

  // Helper: upload the video blob to export-uploads, returns the new storagePath
  const uploadVideoBlob = async (): Promise<string> => {
    if (!audioUrl) throw new Error("No video available to upload.");

    // Blob URLs are session-only — verify it's still readable before trying to upload
    if (audioUrl.startsWith("blob:")) {
      try {
        const probe = await fetch(audioUrl, { method: "HEAD" }).catch(() => null);
        if (!probe || !probe.ok) {
          throw new Error("Please re-upload your video — the session has expired");
        }
      } catch (probeErr) {
        const msg = probeErr instanceof Error ? probeErr.message : String(probeErr);
        if (msg.includes("session has expired")) throw probeErr;
        throw new Error("Please re-upload your video — the session has expired");
      }
    }

    // Fetch the blob with a 60-second timeout
    const blobController = new AbortController();
    const blobTimer = setTimeout(() => blobController.abort(), 60_000);
    let videoBlob: Blob;
    try {
      const blobRes = await fetch(audioUrl, { signal: blobController.signal });
      if (!blobRes.ok) throw new Error(`Could not read video file (status ${blobRes.status})`);
      videoBlob = await blobRes.blob();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[upload] Failed to read video blob:", msg);
      if ((err as { name?: string }).name === "AbortError")
        throw new Error("Reading video file timed out — file may be too large");
      throw new Error(`Could not read video file: ${msg}`);
    } finally {
      clearTimeout(blobTimer);
    }

    const filename = rawFilename ?? "video.mp4";
    console.log(`[upload] Starting video upload, blob size: ${videoBlob.size} bytes`);

    // Get a signed Supabase upload URL
    const urlRes = await fetch("/api/upload-export-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, mimeType: videoBlob.type }),
    });
    if (!urlRes.ok) {
      const e = await urlRes.json().catch(() => ({}));
      throw new Error(e.error ?? "Failed to get upload URL from server");
    }
    const { signedUrl, storagePath: newPath } = await urlRes.json();

    // Upload to Supabase with a 60-second timeout, retry once on failure
    const doUpload = async (): Promise<Response> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        return await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": videoBlob.type || "application/octet-stream" },
          body: videoBlob,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let uploadRes: Response;
    try {
      uploadRes = await doUpload();
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      console.warn(`[upload] First attempt failed (${msg}), retrying…`);
      try {
        uploadRes = await doUpload();
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error("[upload] Failed:", retryMsg);
        if ((retryErr as { name?: string }).name === "AbortError")
          throw new Error("Upload timed out — check your internet connection and try again");
        throw new Error(`Upload failed: ${retryMsg}`);
      }
    }

    if (!uploadRes.ok) {
      const detail = await uploadRes.text().catch(() => "");
      console.error(`[upload] Upload failed: HTTP ${uploadRes.status} — ${detail}`);
      throw new Error(`Upload failed (HTTP ${uploadRes.status})${detail ? ": " + detail.slice(0, 120) : ""}`);
    }

    // Persist the new path so subsequent exports reuse it
    localStorage.setItem("darijasub_video_url", newPath);
    localStorage.setItem("darijasub_upload_ready", "true");

    console.log(`[upload] Upload complete, storage path: ${newPath}`);
    return newPath;
  };

  const handleExport = async () => {
    if (!initialStoragePath && !audioUrl) {
      setError("No video source available.");
      return;
    }

    setError(null);
    setProgress(0);

    try {
      let storagePath = initialStoragePath;

      // ── Step 1: Validate / upload ────────────────────────────────────────
      if (storagePath && videoUploadReady) {
        // Cached path exists and was flagged as successfully uploaded — verify it's
        // still in Supabase before trusting it (files get deleted after export).
        setPhase("uploading");
        setStatusText("Preparing video…");
        setProgress(5);

        const checkRes = await fetch(`/api/check-video?path=${encodeURIComponent(storagePath)}`);
        const { exists } = await checkRes.json().catch(() => ({ exists: false }));

        if (!exists) {
          // File is gone (was deleted after a previous export, or upload was incomplete)
          setStatusText("Re-uploading video…");
          storagePath = await uploadVideoBlob();
        }
        setProgress(20);
      } else {
        // No valid cached path — upload now
        setPhase("uploading");
        setStatusText("Uploading video…");
        setProgress(5);
        storagePath = await uploadVideoBlob();
        setProgress(40);
      }

      // ── Step 2: Process on server ────────────────────────────────────────
      setPhase("processing");
      setStatusText("Burning subtitles…");
      setProgress(50);

      const exportRes = await fetch("/api/export-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          segments: segments.map(s => ({ start: s.startSeconds, end: s.endSeconds, text: s.text })),
          platform,
          quality,
          style: {
            fontColor:         style.textColor,
            backgroundColor:   style.bgColor,
            backgroundOpacity: style.bgOpacity / 100,
            outlineColor:      style.strokeColor,
            outlineWidth:      style.strokeWidth,
            fontFamily:        style.fontFamily,
            fontSize:          style.fontSize,
            position:          style.position,
          },
        }),
      });

      if (!exportRes.ok) {
        const e = await exportRes.json().catch(() => ({}));
        throw new Error(e.error ?? "Server export failed");
      }

      // ── Step 3: Download result ──────────────────────────────────────────
      setStatusText("Preparing download…");
      setProgress(97);

      const outBlob = await exportRes.blob();
      const dlUrl   = URL.createObjectURL(outBlob);
      const dlName  = `${(rawFilename ?? "video").replace(/\.[^/.]+$/, "")}_${platform}_${quality}.mp4`;

      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = dlName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 2000);

      // File was consumed by the server (it deletes after processing) — mark as gone
      localStorage.setItem("darijasub_upload_ready", "false");

      setProgress(100);
      setStatusText("Download started!");
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setPhase("error");
    }
  };

  // Preview bg with opacity
  const prevBgR = parseInt(style.bgColor.slice(1, 3), 16);
  const prevBgG = parseInt(style.bgColor.slice(3, 5), 16);
  const prevBgB = parseInt(style.bgColor.slice(5, 7), 16);
  const prevBgCss = style.bgOpacity > 0
    ? `rgba(${prevBgR},${prevBgG},${prevBgB},${style.bgOpacity / 100})`
    : "transparent";

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === backdropRef.current && !busy) onClose(); }}
    >
      <div
        className="w-full max-w-md flex flex-col rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0518 100%)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-white font-semibold text-sm">Export Video</span>
          </div>
          {!busy && (
            <button type="button" onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Audio-only warning */}
          {isAudioOnly && (
            <div className="rounded-xl px-4 py-3 text-sm text-yellow-300 flex items-start gap-2"
              style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)" }}>
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Video export requires a video file. Please upload an MP4 or MOV file.</span>
            </div>
          )}

          {/* Platform selector */}
          <div>
            <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">Platform</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_PLATFORMS.map((p) => (
                <button key={p.id} type="button" disabled={busy}
                  onClick={() => setPlatform(p.id)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                  style={{
                    background: platform === p.id ? "rgba(147,51,234,0.35)" : "rgba(255,255,255,0.05)",
                    border: platform === p.id ? "1px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    color: platform === p.id ? "#f3e8ff" : "rgba(255,255,255,0.55)",
                  }}>
                  <span className="text-base">{p.emoji}</span>
                  <div>
                    <div className="text-xs font-semibold leading-tight">{p.label}</div>
                    <div className="text-xs opacity-55">{p.aspect}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quality selector */}
          <div>
            <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">Quality</p>
            <div className="flex gap-2">
              {EXPORT_QUALITIES.map((q) => (
                <button key={q.id} type="button" disabled={busy}
                  onClick={() => setQuality(q.id)}
                  className="flex-1 flex flex-col items-center py-2.5 px-2 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: quality === q.id ? "rgba(147,51,234,0.35)" : "rgba(255,255,255,0.05)",
                    border: quality === q.id ? "1px solid rgba(168,85,247,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    color: quality === q.id ? "#f3e8ff" : "rgba(255,255,255,0.55)",
                  }}>
                  <span className="font-semibold">{q.label}</span>
                  <span className="opacity-55">{q.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle style preview */}
          <div>
            <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">Subtitle Preview</p>
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                background: "#0a0a0a",
                aspectRatio: `${plat.w} / ${plat.h}`,
                maxHeight: "200px",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* Background scene hint */}
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              {/* Subtitle */}
              <div
                className="absolute"
                style={{
                  ...POSITION_STYLES[style.position],
                  fontSize: `${Math.max(9, style.fontSize * 0.3)}px`,
                  fontFamily: style.fontFamily,
                  fontWeight: style.bold ? "bold" : "normal",
                  fontStyle: style.italic ? "italic" : "normal",
                  color: style.textColor,
                  background: prevBgCss,
                  padding: style.bgOpacity > 0 ? "2px 6px" : "0",
                  borderRadius: style.bgOpacity > 0 ? "3px" : "0",
                  WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth * 0.3}px ${style.strokeColor}` : undefined,
                  textAlign: style.position.includes("center") ? "center" : style.position.includes("right") ? "right" : "left",
                  maxWidth: "90%",
                  whiteSpace: "nowrap",
                }}
              >
                مرحبا | Hello World
              </div>
            </div>
          </div>

          {/* Progress */}
          {phase !== "idle" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">{statusText}</span>
                <span className="text-purple-300 tabular-nums font-mono">{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: phase === "done"
                      ? "linear-gradient(90deg,#22c55e,#16a34a)"
                      : "linear-gradient(90deg,#7c3aed,#9333ea)",
                  }}
                />
              </div>
              {phase === "done" && (
                <p className="text-green-400 text-xs text-center">✓ Export complete! Check your downloads folder.</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-300"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {error}
            </div>
          )}

          {/* Export button */}
          {!isAudioOnly && phase !== "done" && (
            <button type="button" onClick={handleExport} disabled={busy}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}>
              {busy ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {phase === "uploading" ? "Uploading…" : "Processing…"}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Video
                </>
              )}
            </button>
          )}

          {/* Post-export actions */}
          {phase === "done" && (
            <div className="flex gap-2">
              <button type="button"
                onClick={() => { setPhase("idle"); setProgress(0); setStatusText(""); setError(null); }}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white border border-white/10 transition-all"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                Export Another
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MultiExportModal ────────────────────────────────────────────────────────────

const MULTI_EXPORT_LANGUAGES = [
  { value: "fr",        flag: "🇫🇷", label: "French" },
  { value: "en",        flag: "🇬🇧", label: "English" },
  { value: "es",        flag: "🇪🇸", label: "Spanish" },
  { value: "de",        flag: "🇩🇪", label: "German" },
  { value: "msa",       flag: "🇸🇦", label: "Arabic (MSA)" },
  { value: "darija-ma", flag: "🇲🇦", label: "Moroccan Darija" },
  { value: "darija-dz", flag: "🇩🇿", label: "Algerian Darija" },
  { value: "it",        flag: "🇮🇹", label: "Italian" },
  { value: "nl",        flag: "🇳🇱", label: "Dutch" },
  { value: "pt",        flag: "🇵🇹", label: "Portuguese" },
  { value: "ru",        flag: "🇷🇺", label: "Russian" },
  { value: "tr",        flag: "🇹🇷", label: "Turkish" },
];

const MAX_LANGUAGES = 6;

/** seconds → "HH:MM:SS,mmm" for SRT */
function toSrtTime(sec: number): string {
  const n  = Math.max(0, sec);
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

function buildSrt(segments: { start: number; end: number; text: string }[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${toSrtTime(seg.start)} --> ${toSrtTime(seg.end)}\n${seg.text}`)
    .join("\n\n") + "\n";
}

function MultiExportModal({
  segments,
  filename,
  onClose,
}: {
  segments: DisplaySegment[];
  filename: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["fr", "en"]));
  const [phase, setPhase]       = useState<"idle" | "translating" | "done" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const [error, setError]       = useState<string | null>(null);

  const busy = phase === "translating";

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, busy]);

  // Close on backdrop click
  const backdropRef = useRef<HTMLDivElement>(null);

  const toggleLang = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        if (next.size >= MAX_LANGUAGES) return prev; // enforce limit
        next.add(value);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0) return;
    setPhase("translating");
    setError(null);

    const langs     = Array.from(selected);
    const srcLang   = typeof window !== "undefined"
      ? (localStorage.getItem("darijasub_detected_language") ?? "unknown")
      : "unknown";

    setStatusText(`Translating to ${langs.length} language${langs.length > 1 ? "s" : ""}…`);

    try {
      const apiSegments = segments.map((s) => ({ start: s.startSeconds, end: s.endSeconds, text: s.text }));

      const res = await fetch("/api/multi-export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ segments: apiSegments, languages: langs, sourceLanguage: srcLang }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const { results } = await res.json() as {
        results: { language: string; languageName: string; segments: { start: number; end: number; text: string }[] }[];
      };

      setStatusText("Building ZIP…");

      // Dynamic import of JSZip (client only)
      const JSZip = (await import("jszip")).default;
      const zip   = new JSZip();

      // Combined reference file
      let combined = "";

      for (const r of results) {
        const srtContent = buildSrt(r.segments);
        const safeName   = r.languageName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        zip.file(`subtitles_${safeName}.srt`, srtContent);
        combined += `=== ${r.languageName.toUpperCase()} ===\n\n${srtContent}\n\n`;
      }

      zip.file("subtitles_all.txt", combined.trim());

      const blob    = await zip.generateAsync({ type: "blob" });
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement("a");
      a.href        = url;
      a.download    = `darijasub_subtitles_${filename || "export"}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setPhase("done");
      setStatusText(`✅ Downloaded ${results.length} language${results.length > 1 ? "s" : ""} as ZIP`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setPhase("error");
    }
  };

  return (
    <div ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === backdropRef.current && !busy) onClose(); }}>

      <div className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0619 100%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-base font-bold text-white">Export in Multiple Languages</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Translate &amp; download all as a ZIP file
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Language grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Select Languages</p>
              <span className="text-xs text-white/30">{selected.size}/{MAX_LANGUAGES} selected</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MULTI_EXPORT_LANGUAGES.map((lang) => {
                const checked  = selected.has(lang.value);
                const disabled = !checked && selected.size >= MAX_LANGUAGES;
                return (
                  <button key={lang.value} type="button"
                    onClick={() => toggleLang(lang.value)}
                    disabled={disabled || busy}
                    className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-center transition-all"
                    style={{
                      background:   checked ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.03)",
                      borderColor:  checked ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.08)",
                      opacity:      (disabled || busy) ? 0.4 : 1,
                      cursor:       (disabled || busy) ? "not-allowed" : "pointer",
                    }}>
                    <span className="text-xl leading-none">{lang.flag}</span>
                    <span className="text-xs leading-tight"
                      style={{ color: checked ? "#d8b4fe" : "rgba(255,255,255,0.5)" }}>
                      {lang.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-white/25 mt-2">Max {MAX_LANGUAGES} languages at once. Claude translates all in parallel.</p>
          </div>

          {/* Progress / status */}
          {phase === "translating" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <svg className="w-4 h-4 animate-spin shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm text-purple-300">{statusText}</span>
            </div>
          )}

          {phase === "done" && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#86efac" }}>
              {statusText}
            </div>
          )}

          {phase === "error" && error && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white border border-white/10 transition-all disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              {phase === "done" ? "Close" : "Cancel"}
            </button>

            {phase !== "done" && (
              <button type="button" onClick={handleExport}
                disabled={busy || selected.size === 0}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff",
                  boxShadow: busy ? "none" : "0 4px 14px rgba(124,58,237,0.35)" }}>
                {busy ? "Translating…" : `Export ${selected.size} Language${selected.size !== 1 ? "s" : ""} as ZIP`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VoiceoverModal ──────────────────────────────────────────────────────────────

interface ElevenLabsVoice {
  voice_id:    string;
  name:        string;
  preview_url: string;
  labels:      Record<string, string>;
  category?:   string;
}

function VoiceoverModal({
  segments,
  onClose,
}: {
  segments: DisplaySegment[];
  onClose:  () => void;
}) {
  const [voices, setVoices]           = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [text, setText]               = useState(() => segments.map((s) => s.text).join(" "));
  const [phase, setPhase]             = useState<"idle" | "generating" | "done" | "error">("idle");
  const [genError, setGenError]       = useState<string | null>(null);
  const [audioUrl, setAudioUrl]       = useState<string | null>(null);
  const previewAudioRef               = useRef<HTMLAudioElement | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const backdropRef                   = useRef<HTMLDivElement>(null);
  const busy                          = phase === "generating";

  // Clone tab state
  const [tab, setTab]               = useState<"select" | "clone">("select");
  const [cloneFile, setCloneFile]   = useState<File | null>(null);
  const [cloneName, setCloneName]   = useState("");
  const [clonePhase, setClonePhase] = useState<"idle" | "cloning" | "done" | "error">("idle");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneFileRef                = useRef<HTMLInputElement>(null);

  // Fetch voices on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/voiceover/voices");
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? `Error ${res.status}`);
        }
        const { voices: list } = await res.json() as { voices: ElevenLabsVoice[] };
        setVoices(list);
        if (list.length > 0) setSelectedVoice(list[0].voice_id);
      } catch (err) {
        setVoicesError(err instanceof Error ? err.message : "Failed to load voices");
      } finally {
        setVoicesLoading(false);
      }
    })();
  }, []);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, busy]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const playPreview = (voice: ElevenLabsVoice) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (playingPreview === voice.voice_id) {
      setPlayingPreview(null);
      return;
    }
    const audio = new Audio(voice.preview_url);
    previewAudioRef.current = audio;
    setPlayingPreview(voice.voice_id);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingPreview(null);
  };

  const generate = async () => {
    if (!selectedVoice || !text.trim()) return;
    setPhase("generating");
    setGenError(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }

    try {
      const res = await fetch("/api/voiceover", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: text.trim(), voiceId: selectedVoice }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      setPhase("done");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
      setPhase("error");
    }
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a  = document.createElement("a");
    a.href   = audioUrl;
    a.download = "voiceover.mp3";
    a.click();
  };

  const reset = () => {
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setPhase("idle");
    setGenError(null);
  };

  const cloneVoice = async () => {
    if (!cloneFile || !cloneName.trim()) return;
    setClonePhase("cloning");
    setCloneError(null);
    try {
      const form = new FormData();
      form.append("name", cloneName.trim());
      form.append("file", cloneFile);
      const res = await fetch("/api/voiceover/clone", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Server error ${res.status}`);
      }
      const { voice_id } = await res.json() as { voice_id: string };
      // Re-fetch voices to get the cloned voice's full details
      const vRes = await fetch("/api/voiceover/voices");
      if (vRes.ok) {
        const { voices: list } = await vRes.json() as { voices: ElevenLabsVoice[] };
        setVoices(list);
      }
      setSelectedVoice(voice_id);
      setTab("select");
      setClonePhase("idle");
      setCloneName("");
      setCloneFile(null);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Cloning failed");
      setClonePhase("error");
    }
  };

  const deleteVoice = async (voiceId: string) => {
    try {
      const res = await fetch("/api/voiceover/clone/delete", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ voice_id: voiceId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      setVoices((prev) => prev.filter((v) => v.voice_id !== voiceId));
      if (selectedVoice === voiceId) {
        const next = voices.find((v) => v.voice_id !== voiceId);
        setSelectedVoice(next?.voice_id ?? null);
      }
    } catch (err) {
      console.error("Delete voice failed:", err);
    }
  };

  return (
    <div ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === backdropRef.current && !busy) onClose(); }}>

      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0619 100%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">🎙️ AI Voiceover</h2>
            <p className="text-xs text-white/40 mt-0.5">Generate a voiceover in any language using AI voices</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Voice picker — tabbed */}
          <div>
            {/* Tab row */}
            <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(["select", "clone"] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background:  tab === t ? "rgba(147,51,234,0.35)" : "transparent",
                    color:       tab === t ? "#e9d5ff" : "rgba(255,255,255,0.45)",
                    border:      tab === t ? "1px solid rgba(168,85,247,0.4)" : "1px solid transparent",
                  }}>
                  {t === "select" ? "Select Voice" : "Clone a Voice"}
                </button>
              ))}
            </div>

            {/* ── SELECT tab ── */}
            {tab === "select" && (
              <>
                {voicesLoading && (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-16 rounded-xl animate-pulse"
                        style={{ background: "rgba(255,255,255,0.05)" }} />
                    ))}
                  </div>
                )}

                {voicesError && (
                  <div className="px-4 py-3 rounded-xl text-sm"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                    {voicesError}
                  </div>
                )}

                {!voicesLoading && !voicesError && (
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {voices.map((voice) => {
                      const active   = selectedVoice === voice.voice_id;
                      const preview  = playingPreview === voice.voice_id;
                      const isCloned = voice.category === "cloned";
                      const accent   = voice.labels?.accent ?? voice.labels?.language ?? "";
                      const gender   = voice.labels?.gender ?? "";
                      const desc     = [accent, gender].filter(Boolean).join(" · ");
                      return (
                        <div key={voice.voice_id}
                          onClick={() => setSelectedVoice(voice.voice_id)}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all"
                          style={{
                            background:  active ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.03)",
                            borderColor: active ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.08)",
                          }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate"
                                style={{ color: active ? "#e9d5ff" : "rgba(255,255,255,0.85)" }}>
                                {voice.name}
                              </span>
                              {isCloned && (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: "rgba(168,85,247,0.2)", color: "#c4b5fd", border: "1px solid rgba(168,85,247,0.3)" }}>
                                  clone
                                </span>
                              )}
                            </div>
                            {desc && (
                              <div className="text-xs mt-0.5 truncate capitalize"
                                style={{ color: active ? "#c4b5fd" : "rgba(255,255,255,0.35)" }}>
                                {desc}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {voice.preview_url && (
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); playPreview(voice); }}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{
                                  background:  preview ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.08)",
                                  border:      "1px solid " + (preview ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.1)"),
                                  color:       preview ? "#e9d5ff" : "rgba(255,255,255,0.5)",
                                }}
                                title={preview ? "Stop preview" : "Play preview"}>
                                {preview ? (
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                )}
                              </button>
                            )}
                            {isCloned && (
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); deleteVoice(voice.voice_id); }}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{
                                  background: "rgba(239,68,68,0.1)",
                                  border:     "1px solid rgba(239,68,68,0.25)",
                                  color:      "rgba(252,165,165,0.7)",
                                }}
                                title="Delete cloned voice">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── CLONE tab ── */}
            {tab === "clone" && (
              <div className="space-y-4">
                {/* File upload */}
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Audio Sample</p>
                  <input ref={cloneFileRef} type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 10 * 1024 * 1024) { setCloneError("File must be under 10 MB"); return; }
                      setCloneFile(f);
                      setCloneError(null);
                    }} />
                  <button type="button"
                    onClick={() => cloneFileRef.current?.click()}
                    className="w-full py-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all"
                    style={{
                      borderColor: cloneFile ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.12)",
                      background:  cloneFile ? "rgba(147,51,234,0.08)" : "rgba(255,255,255,0.02)",
                    }}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      style={{ color: cloneFile ? "#c4b5fd" : "rgba(255,255,255,0.3)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <span className="text-xs" style={{ color: cloneFile ? "#c4b5fd" : "rgba(255,255,255,0.4)" }}>
                      {cloneFile ? cloneFile.name : "Click to upload MP3, WAV, or M4A (max 10 MB)"}
                    </span>
                    {cloneFile && (
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {(cloneFile.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    )}
                  </button>
                </div>

                {/* Voice name */}
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Voice Name</p>
                  <input
                    type="text"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="e.g. My Voice Clone"
                    className="w-full text-sm outline-none rounded-xl px-4 py-3 transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border:     "1px solid rgba(255,255,255,0.1)",
                      color:      "rgba(255,255,255,0.85)",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                </div>

                {/* Clone error */}
                {cloneError && (
                  <div className="px-4 py-3 rounded-xl text-sm"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                    {cloneError}
                  </div>
                )}

                {/* Cloning spinner */}
                {clonePhase === "cloning" && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <svg className="w-4 h-4 animate-spin shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-sm text-purple-300">Cloning voice… this may take a moment</span>
                  </div>
                )}

                {/* Clone button */}
                <button type="button"
                  onClick={cloneVoice}
                  disabled={!cloneFile || !cloneName.trim() || clonePhase === "cloning"}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff",
                    boxShadow: clonePhase === "cloning" ? "none" : "0 4px 14px rgba(124,58,237,0.35)" }}>
                  {clonePhase === "cloning" ? "Cloning…" : "🧬 Clone Voice"}
                </button>
              </div>
            )}
          </div>

          {/* Text area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Voiceover Text</p>
              <span className="text-xs text-white/25">{text.length} chars</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              disabled={busy}
              placeholder="Text to convert to speech…"
              className="w-full resize-none text-sm outline-none rounded-xl px-4 py-3 leading-relaxed transition-colors disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.1)",
                color:      "rgba(255,255,255,0.85)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
          </div>

          {/* Generating state */}
          {phase === "generating" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <svg className="w-4 h-4 animate-spin shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm text-purple-300">Generating voiceover…</span>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && genError && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
              {genError}
            </div>
          )}

          {/* Done: audio player + actions */}
          {phase === "done" && audioUrl && (
            <div className="space-y-3 p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Generated Audio</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={audioUrl} className="w-full" style={{ accentColor: "#9333ea" }} />
              <div className="flex gap-2">
                <button type="button" onClick={downloadAudio}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff",
                    boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  ⬇️ Download Audio
                </button>
                <button type="button" onClick={reset}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-white/60 hover:text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  🔄 Regenerate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white border border-white/10 transition-all disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            Close
          </button>
          {phase !== "done" && (
            <button type="button" onClick={generate}
              disabled={busy || !selectedVoice || !text.trim() || voicesLoading}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff",
                boxShadow: busy ? "none" : "0 4px 14px rgba(124,58,237,0.35)" }}>
              {busy ? "Generating…" : "🎙️ Generate Voiceover"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ChaptersModal ───────────────────────────────────────────────────────────────

interface Chapter { time: string; title: string }

function ChaptersModal({
  segments,
  filename,
  onClose,
}: {
  segments: DisplaySegment[];
  filename: string;
  onClose: () => void;
}) {
  const [phase, setPhase]       = useState<"idle" | "loading" | "done" | "error">("idle");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const backdropRef             = useRef<HTMLDivElement>(null);

  const chaptersText = chapters.map((c) => `${c.time} ${c.title}`).join("\n");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Auto-generate on open
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setPhase("loading");
    setError(null);
    setChapters([]);
    try {
      const apiSegments = segments.map((s) => ({ startSeconds: s.startSeconds, text: s.text }));
      const res = await fetch("/api/auto-chapters", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ segments: apiSegments }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const { chapters: list } = await res.json() as { chapters: Chapter[] };
      setChapters(list);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate chapters");
      setPhase("error");
    }
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(chaptersText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTxt = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([chaptersText], { type: "text/plain" }));
    a.download = `${filename || "chapters"}_chapters.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}>

      <div className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0619 100%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-base font-bold text-white">📑 Auto Chapters</h2>
            <p className="text-xs text-white/40 mt-0.5">YouTube timestamp chapters generated by AI</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {phase === "loading" && (
            <div className="flex items-center gap-3 px-4 py-5 rounded-xl justify-center"
              style={{ background: "rgba(147,51,234,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <svg className="w-5 h-5 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-sm text-purple-300">Analyzing transcript for chapter breaks…</span>
            </div>
          )}

          {phase === "error" && error && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
              {error}
            </div>
          )}

          {phase === "done" && (
            <>
              {/* Chapters list */}
              <div className="space-y-1 rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                {chapters.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5"
                    style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)" }}>
                    <span className="text-sm font-mono font-bold shrink-0"
                      style={{ color: "#a78bfa", minWidth: "3.5rem" }}>
                      {c.time}
                    </span>
                    <span className="text-sm text-white/85">{c.title}</span>
                  </div>
                ))}
              </div>

              {/* Plain-text preview (for easy copy) */}
              <div className="relative">
                <textarea readOnly value={chaptersText} rows={Math.min(chapters.length, 8)}
                  className="w-full resize-none text-xs font-mono rounded-xl px-3 py-2.5 outline-none"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-2">
          {phase === "done" ? (
            <>
              <button type="button" onClick={copyAll}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: copied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                  border: "1px solid " + (copied ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"),
                  color: copied ? "#86efac" : "rgba(255,255,255,0.8)" }}>
                {copied ? "✓ Copied!" : "Copy All"}
              </button>
              <button type="button" onClick={downloadTxt}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff",
                  boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download .txt
              </button>
              <button type="button" onClick={generate}
                className="px-4 py-2.5 rounded-xl text-sm border border-white/10 text-white/50 hover:text-white transition-all"
                style={{ background: "rgba(255,255,255,0.04)" }}
                title="Regenerate">
                🔄
              </button>
            </>
          ) : phase === "error" ? (
            <>
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-white/60 hover:text-white transition-all"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                Close
              </button>
              <button type="button" onClick={generate}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff" }}>
                Try Again
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/10 text-white/60"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
