"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LANGUAGES, formatDetectedLanguage, type Language } from "@/lib/languages";
import ProgressSteps from "./ProgressSteps";

// ── Language picker data ───────────────────────────────────────────────────────

const FLAGS: Record<string, string> = {
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

type LangGroup = "Arabic Dialects" | "Popular" | "Asian" | "Other";

const ARABIC_DIALECTS = new Set(["darija-ma","darija-dz","tunisian_darija","arabic_egyptian","arabic_levantine","arabic_gulf","msa"]);
const POPULAR         = new Set(["en","fr","es","de","it","pt","nl","tr"]);
const ASIAN           = new Set(["ja","ko","zh","zh-TW","hi","id","vi","th"]);

function langGroup(value: string): LangGroup {
  if (ARABIC_DIALECTS.has(value)) return "Arabic Dialects";
  if (POPULAR.has(value))         return "Popular";
  if (ASIAN.has(value))           return "Asian";
  return "Other";
}

const GROUP_ORDER: LangGroup[] = ["Arabic Dialects", "Popular", "Asian", "Other"];
const GROUP_ICONS: Record<LangGroup, string> = {
  "Arabic Dialects": "🌙", "Popular": "⭐", "Asian": "🌏", "Other": "🌐",
};

const GROUPED = GROUP_ORDER.reduce<Record<LangGroup, Language[]>>(
  (acc, g) => ({ ...acc, [g]: LANGUAGES.filter((l) => langGroup(l.value) === g) }),
  {} as Record<LangGroup, Language[]>
);

// ── Types ──────────────────────────────────────────────────────────────────────

type Status       = "idle" | "uploading" | "transcribing" | "translating" | "done" | "error";
type Mode         = "transcribe" | "translate";
type CompressState = "idle" | "loading_engine" | "compressing" | "done";

const MAX_FILE_SIZE  = 25 * 1024 * 1024;
const AUDIO_EXTS     = [".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"];
const FFMPEG_CDN     = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

function getSteps(mode: Mode) {
  return mode === "translate"
    ? [
        { label: "Uploading file",       icon: "upload" as const },
        { label: "Transcribing audio",   icon: "mic"    as const },
        { label: "Translating subtitles",icon: "globe"  as const },
        { label: "Ready to download",    icon: "check"  as const },
      ]
    : [
        { label: "Uploading file",     icon: "upload" as const },
        { label: "Transcribing audio", icon: "mic"    as const },
        { label: "Ready to download",  icon: "check"  as const },
      ];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function UploadCard() {
  const router = useRouter();

  // Core state
  const [dragging, setDragging]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);       // file used for upload (may be compressed)
  const [originalFile, setOriginalFile] = useState<File | null>(null);       // original full-quality file
  const [mode, setMode]                 = useState<Mode>("translate");
  const [targetLang, setTargetLang]     = useState("en");
  const [status, setStatus]             = useState<Status>("idle");
  const [error, setError]               = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl]   = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState("subtitles.srt");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [stepIndex, setStepIndex]       = useState(0);
  const [progress, setProgress]         = useState(0);

  // Compression state
  const [compressState, setCompressState]     = useState<CompressState>("idle");
  const [compressProgress, setCompressProgress] = useState(0);
  const [compressInfo, setCompressInfo]       = useState<{ origMb: string; finalMb: string } | null>(null);

  // Language picker state
  const [langOpen, setLangOpen]   = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const langRef       = useRef<HTMLDivElement>(null);
  const langSearchRef = useRef<HTMLInputElement>(null);

  const inputRef            = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef           = useRef<any>(null);

  const isCompressing = compressState === "loading_engine" || compressState === "compressing";
  const isProcessing  = ["uploading", "transcribing", "translating"].includes(status);
  const showProgress  = isProcessing || status === "done";

  const steps    = getSteps(mode);
  const statuses = steps.map((_, i) =>
    i < stepIndex ? ("done" as const) : i === stepIndex ? ("active" as const) : ("pending" as const)
  );

  const selectedLang = LANGUAGES.find((l) => l.value === targetLang);
  const selectedFlag = selectedLang ? (FLAGS[selectedLang.value] ?? "🌐") : "🌐";

  // ── Language picker effects ───────────────────────────────────────────────────

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
        setLangQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  useEffect(() => {
    if (langOpen) setTimeout(() => langSearchRef.current?.focus(), 30);
  }, [langOpen]);

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLangOpen(false); setLangQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [langOpen]);

  const filteredLangs = langQuery.trim()
    ? LANGUAGES.filter((l) =>
        l.label.toLowerCase().includes(langQuery.toLowerCase()) ||
        l.promptName.toLowerCase().includes(langQuery.toLowerCase())
      )
    : null;

  const pickLang = (value: string) => {
    setTargetLang(value);
    setLangOpen(false);
    setLangQuery("");
    resetResult();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const stopProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startSlowFill = (from: number, to: number) => {
    stopProgressInterval();
    setProgress(from);
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= to) { stopProgressInterval(); return to; }
        return prev + 0.3;
      });
    }, 300);
  };

  const resetResult = () => {
    stopProgressInterval();
    setStatus("idle");
    setError(null);
    setDetectedLang(null);
    setStepIndex(0);
    setProgress(0);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const clearFile = () => {
    setFile(null);
    setOriginalFile(null);
    setCompressState("idle");
    setCompressProgress(0);
    setCompressInfo(null);
    resetResult();
  };

  // ── Compression ───────────────────────────────────────────────────────────────

  const compressFile = async (f: File) => {
    const isAudio = AUDIO_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));

    try {
      // Load engine (cached after first use)
      setCompressState("loading_engine");
      setCompressProgress(0);

      if (!ffmpegRef.current) {
        const { FFmpeg }   = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const ffmpeg = new FFmpeg();
        await ffmpeg.load({
          coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`,   "text/javascript"),
          wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, "application/wasm"),
        });
        ffmpegRef.current = ffmpeg;
      }

      const ffmpeg = ffmpegRef.current;
      setCompressState("compressing");

      const { fetchFile } = await import("@ffmpeg/util");

      const ext    = f.name.match(/\.[^/.]+$/)?.[0] ?? "";
      const inName = `input${ext}`;
      const outName = isAudio ? "output.mp3" : "output.mp4";

      const progressHandler = ({ progress: p }: { progress: number }) => {
        if (Number.isFinite(p) && p >= 0) setCompressProgress(Math.round(p * 100));
      };
      ffmpeg.on("progress", progressHandler);

      await ffmpeg.writeFile(inName, await fetchFile(f));

      if (isAudio) {
        await ffmpeg.exec([
          "-i", inName,
          "-c:a", "libmp3lame",
          "-b:a", "128k",
          "-map_metadata", "-1",
          outName,
        ]);
      } else {
        await ffmpeg.exec([
          "-i", inName,
          "-c:v", "libx264",
          "-crf", "28",
          "-preset", "ultrafast",
          "-c:a", "aac",
          "-b:a", "64k",
          "-map_metadata", "-1",
          outName,
        ]);
      }

      ffmpeg.off("progress", progressHandler);

      const data = await ffmpeg.readFile(outName) as Uint8Array;
      const ab   = new ArrayBuffer(data.byteLength);
      new Uint8Array(ab).set(data);

      const mimeType     = isAudio ? "audio/mpeg" : "video/mp4";
      const outFilename  = f.name.replace(/\.[^/.]+$/, isAudio ? ".mp3" : ".mp4");
      const compressed   = new File([ab], outFilename, { type: mimeType });

      for (const name of [inName, outName]) {
        try { await ffmpeg.deleteFile(name); } catch { /* ignore */ }
      }

      setCompressInfo({
        origMb:  (f.size           / 1024 / 1024).toFixed(1),
        finalMb: (compressed.size  / 1024 / 1024).toFixed(1),
      });
      setCompressProgress(100);
      setCompressState("done");
      setFile(compressed);

    } catch {
      // Compression failed — show a normal error
      setCompressState("idle");
      setError(`File is ${formatBytes(f.size)} — auto-compression failed. Please trim the file to under 25 MB and try again.`);
      setStatus("error");
    }
  };

  // ── File selection ────────────────────────────────────────────────────────────

  const validateAndSetFile = (f: File) => {
    clearFile();

    if (f.size > MAX_FILE_SIZE) {
      // Auto-compress instead of blocking with an error
      setOriginalFile(f);
      compressFile(f);
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = e.target.files?.[0];
    if (sel) validateAndSetFile(sel);
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!file) return;
    resetResult();

    try {
      setStepIndex(0); setProgress(5); setStatus("uploading");

      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to get upload URL");
      }
      const { token, storagePath } = await urlRes.json();
      setProgress(12);

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("temp-uploads")
        .uploadToSignedUrl(storagePath, token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw new Error(uploadError.message);

      setStepIndex(1); setProgress(25); setStatus("transcribing");
      startSlowFill(25, 70);

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          mode,
          targetLang: mode === "translate" ? targetLang : undefined,
          originalName: file.name,
        }),
      });
      stopProgressInterval();

      if (!transcribeRes.ok) {
        const body = await transcribeRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${transcribeRes.status}`);
      }

      if (mode === "translate") {
        setStepIndex(2); setProgress(75); setStatus("translating");
        startSlowFill(75, 92);
        await new Promise((r) => setTimeout(r, 400));
        stopProgressInterval();
      }

      const detected = transcribeRes.headers.get("X-Detected-Language");
      if (detected) setDetectedLang(formatDetectedLanguage(detected));

      const srtText          = await transcribeRes.text();
      const downloadBlob     = new Blob([srtText], { type: "text/plain;charset=utf-8" });
      const downloadObjectUrl = URL.createObjectURL(downloadBlob);

      const disposition = transcribeRes.headers.get("Content-Disposition") ?? "";
      const match       = disposition.match(/filename="([^"]+)"/);
      const filename    = match?.[1] ?? `subtitles_${mode === "translate" ? targetLang : "transcribed"}.srt`;

      // Store SRT + audio URL in localStorage.
      // Use the ORIGINAL file (full quality) for editor playback & video export.
      try {
        const editorFile     = originalFile ?? file;
        const audioObjectUrl = URL.createObjectURL(editorFile);
        localStorage.setItem("darijasub_editor", JSON.stringify({
          srtText,
          audioUrl: audioObjectUrl,
          filename: editorFile.name,
        }));
      } catch {
        // localStorage unavailable
      }

      setDownloadUrl(downloadObjectUrl);
      setDownloadFilename(filename);
      setStepIndex(steps.length);
      setProgress(100);
      setStatus("done");
    } catch (err) {
      stopProgressInterval();
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="card p-6">

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && !showProgress && !isCompressing && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
          isProcessing || isCompressing ? "border-purple-500/30 bg-purple-500/5 cursor-default"
          : dragging                   ? "border-purple-500 bg-purple-500/10 cursor-pointer"
          : (file || originalFile)     ? "border-purple-500/40 bg-purple-500/5 cursor-pointer"
          : "border-white/15 hover:border-purple-500/40 hover:bg-white/3 cursor-pointer"
        }`}
      >
        <input ref={inputRef} type="file" className="hidden"
          accept="video/mp4,video/quicktime,video/mov,video/x-msvideo,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp4,.mov,.avi,.webm,.mp3,.m4a,.wav,.ogg"
          onChange={handleFileChange}
        />

        {isProcessing ? (
          <p className="font-semibold text-white/60 text-sm">{file?.name}</p>

        ) : status === "done" && downloadUrl ? (
          <div>
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-white">Subtitles ready!</p>
            {detectedLang && (
              <span className="inline-flex items-center gap-1.5 mt-2 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                Detected: {detectedLang}
              </span>
            )}
            <p className="text-sm text-white/40 mt-2">{originalFile?.name ?? file?.name}</p>
            <button onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors">
              Start over
            </button>
          </div>

        ) : originalFile && isCompressing ? (
          // During compression: show original file info with spinner
          <div>
            <div className="text-4xl mb-3">⚙️</div>
            <p className="font-semibold text-white">{originalFile.name}</p>
            <p className="text-sm text-white/40 mt-1">{formatBytes(originalFile.size)}</p>
          </div>

        ) : file ? (
          <div>
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-semibold text-white">{originalFile?.name ?? file.name}</p>
            <p className="text-sm text-white/40 mt-1">
              {compressState === "done"
                ? `Compressed — ${formatBytes(file.size)}`
                : formatBytes(file.size)}
            </p>
            <button onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors">
              Remove file
            </button>
          </div>

        ) : (
          <div>
            <div className="text-4xl mb-3">⬆️</div>
            <p className="font-semibold text-white">Drop your video or audio here</p>
            <p className="text-sm text-white/40 mt-1">Language detected automatically — MP4, MOV, MP3, WAV, M4A supported</p>
            <p className="text-xs text-white/25 mt-3">Files over 25 MB are compressed automatically</p>
          </div>
        )}
      </div>

      {/* ── Compression progress ─────────────────────────────────────────────── */}
      {compressState !== "idle" && (
        <div className="mt-4 rounded-xl border px-4 py-3"
          style={{
            background: "rgba(109,40,217,0.08)",
            borderColor: compressState === "done" ? "rgba(34,197,94,0.3)" : "rgba(147,51,234,0.25)",
          }}>

          {compressState === "loading_engine" && (
            <div className="flex items-center gap-2.5">
              <svg className="animate-spin w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-white/70">Preparing compression engine…</span>
            </div>
          )}

          {(compressState === "compressing" || compressState === "done") && (
            <>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className={compressState === "done" ? "text-green-400 font-medium" : "text-white/60"}>
                  {compressState === "done"
                    ? `Compressed: ${compressInfo?.origMb} MB → ${compressInfo?.finalMb} MB ✅`
                    : "Compressing file — this may take a minute…"}
                </span>
                <span className={`tabular-nums font-mono ${compressState === "done" ? "text-green-400" : "text-purple-300"}`}>
                  {compressProgress}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${compressProgress}%`,
                    background: compressState === "done"
                      ? "linear-gradient(90deg,#22c55e,#16a34a)"
                      : "linear-gradient(90deg,#7c3aed,#9333ea)",
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Mode toggle */}
      <div className="mt-5">
        <div className="flex rounded-xl overflow-hidden border border-white/10 p-1 bg-white/5">
          {(["transcribe", "translate"] as Mode[]).map((m) => (
            <button key={m} type="button"
              onClick={() => { setMode(m); resetResult(); }}
              disabled={isProcessing || isCompressing}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed ${
                mode === m ? "bg-purple-600 text-white shadow shadow-purple-900/40" : "text-white/50 hover:text-white/80"
              }`}
            >
              {m === "transcribe" ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Transcribe only
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  Translate to
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Language picker — custom div-based dropdown, no <select> ── */}
      {mode === "translate" && (
        <div ref={langRef} className="mt-3 relative">

          {/* Trigger button */}
          <button
            type="button"
            disabled={isProcessing || isCompressing}
            onClick={() => { if (!isProcessing && !isCompressing) setLangOpen((o) => !o); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderColor: langOpen ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.15)",
            }}
          >
            <span className="text-2xl leading-none">{selectedFlag}</span>
            <span className="flex-1 text-left text-white text-sm font-medium">
              {selectedLang?.label ?? "Select language"}
            </span>
            <svg
              className="w-4 h-4 text-white/40 shrink-0 transition-transform duration-200"
              style={{ transform: langOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown panel */}
          {langOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
              style={{
                zIndex: 100,
                background: "linear-gradient(160deg, #1c0b35 0%, #130720 100%)",
              }}
            >
              {/* Search */}
              <div className="p-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={langSearchRef}
                    type="text"
                    placeholder="Search languages..."
                    value={langQuery}
                    onChange={(e) => setLangQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm text-white placeholder-white/30 rounded-lg outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>
              </div>

              {/* Language list */}
              <div className="overflow-y-auto" style={{ maxHeight: "280px" }}>
                {filteredLangs ? (
                  filteredLangs.length === 0 ? (
                    <p className="text-center text-white/30 text-sm py-6">No languages found</p>
                  ) : (
                    <div className="p-2 grid grid-cols-2 gap-1">
                      {filteredLangs.map((lang) => (
                        <LangOption key={lang.value} lang={lang} flag={FLAGS[lang.value] ?? "🌐"}
                          selected={lang.value === targetLang} onSelect={pickLang} />
                      ))}
                    </div>
                  )
                ) : (
                  GROUP_ORDER.map((group) => {
                    const langs = GROUPED[group];
                    if (!langs.length) return null;
                    return (
                      <div key={group}>
                        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
                          <span className="text-xs">{GROUP_ICONS[group]}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: "rgba(255,255,255,0.35)" }}>
                            {group}
                          </span>
                        </div>
                        <div className="px-2 pb-1 grid grid-cols-2 gap-1">
                          {langs.map((lang) => (
                            <LangOption key={lang.value} lang={lang} flag={FLAGS[lang.value] ?? "🌐"}
                              selected={lang.value === targetLang} onSelect={pickLang} />
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
      )}

      {/* Error */}
      {status === "error" && error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Progress steps */}
      {showProgress && (
        <div className="mt-5 p-4 rounded-xl border border-white/8" style={{ background: "rgba(255,255,255,0.02)" }}>
          <ProgressSteps steps={steps} statuses={statuses} progress={progress} />
        </div>
      )}

      {/* Generate button */}
      {!showProgress && (
        <div className="mt-5">
          <button type="button" onClick={handleSubmit}
            disabled={!file || isProcessing || isCompressing}
            className={`w-full btn-primary flex items-center justify-center gap-2 ${
              !file || isProcessing || isCompressing ? "opacity-40 cursor-not-allowed hover:scale-100" : ""
            }`}
          >
            {isCompressing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Compressing…
              </>
            ) : (
              <>
                <span>Generate subtitles</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Download + Open Editor */}
      {status === "done" && downloadUrl && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <a href={downloadUrl} download={downloadFilename}
              className="flex-1 btn-primary flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download SRT
            </a>
            <button type="button"
              onClick={() => router.push("/dashboard/editor")}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400/60"
              style={{ background: "rgba(147,51,234,0.12)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Open Editor
            </button>
          </div>
          <button type="button" onClick={clearFile}
            className="text-xs text-white/30 hover:text-white/60 transition-colors py-1">
            Start over
          </button>
        </div>
      )}

    </div>
  );
}

// ── LangOption ─────────────────────────────────────────────────────────────────

function LangOption({
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
        background:   selected ? "rgba(147,51,234,0.35)" : "transparent",
        border:       selected ? "1px solid rgba(168,85,247,0.5)" : "1px solid transparent",
        color:        selected ? "#fff" : "rgba(255,255,255,0.65)",
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
