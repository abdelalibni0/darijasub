"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { LANGUAGES, formatDetectedLanguage } from "@/lib/languages";

type Status = "idle" | "uploading" | "transcribing" | "translating" | "done" | "error";

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  uploading: "Uploading to storage...",
  transcribing: "Transcribing — detecting language...",
  translating: "Translating with Claude...",
  done: "Done! Your SRT file is ready.",
  error: "",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

type Mode = "transcribe" | "translate";

export default function UploadCard() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("translate");
  const [targetLang, setTargetLang] = useState("en");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState("subtitles.srt");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isProcessing = ["uploading", "transcribing", "translating"].includes(status);

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const resetResult = () => {
    setStatus("idle");
    setError(null);
    setDetectedLang(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const validateAndSetFile = (f: File) => {
    resetResult();
    if (f.size > MAX_FILE_SIZE) {
      setError(
        `File is ${formatBytes(f.size)} — Whisper's limit is 25 MB. Please compress or trim the file first.`
      );
      setStatus("error");
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
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleSubmit = async () => {
    if (!file) return;
    resetResult();

    try {
      // ── Step 1: Get a signed upload URL ──────────────────────────────────
      setStatus("uploading");
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

      // ── Step 2: Upload directly to Supabase (bypasses Vercel limit) ───────
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("temp-uploads")
        .uploadToSignedUrl(storagePath, token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw new Error(uploadError.message);

      // ── Step 3: Transcribe (+ optionally translate) ───────────────────────
      setStatus("transcribing");

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

      if (!transcribeRes.ok) {
        const body = await transcribeRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${transcribeRes.status}`);
      }

      // Read detected language from response header
      const detected = transcribeRes.headers.get("X-Detected-Language");
      if (detected) setDetectedLang(formatDetectedLanguage(detected));

      const blob = await transcribeRes.blob();
      const downloadObjectUrl = URL.createObjectURL(blob);

      const disposition = transcribeRes.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `subtitles_${mode === "translate" ? targetLang : "transcribed"}.srt`;

      setDownloadUrl(downloadObjectUrl);
      setDownloadFilename(filename);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <div className="card p-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
          isProcessing
            ? "border-purple-500/30 bg-purple-500/5 cursor-default"
            : dragging
            ? "border-purple-500 bg-purple-500/10 cursor-pointer"
            : file
            ? "border-purple-500/40 bg-purple-500/5 cursor-pointer"
            : "border-white/15 hover:border-purple-500/40 hover:bg-white/3 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/mov,video/x-msvideo,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp4,.mov,.avi,.webm,.mp3,.m4a,.wav,.ogg"
          className="hidden"
          onChange={handleFileChange}
        />

        {isProcessing ? (
          <div>
            <div className="flex items-center justify-center mb-3">
              <svg className="animate-spin w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="font-semibold text-white">{STATUS_MESSAGES[status]}</p>
            <p className="text-sm text-white/40 mt-1">{file?.name}</p>
          </div>
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
            <p className="text-sm text-white/40 mt-2">{file?.name}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); resetResult(); }}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Start over
            </button>
          </div>
        ) : file ? (
          <div>
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-semibold text-white">{file.name}</p>
            <p className="text-sm text-white/40 mt-1">{formatBytes(file.size)}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); resetResult(); }}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">⬆️</div>
            <p className="font-semibold text-white">Drop your video or audio here</p>
            <p className="text-sm text-white/40 mt-1">Language detected automatically — MP4, MOV, MP3, WAV, M4A supported</p>
            <p className="text-xs text-white/25 mt-3">Max 25 MB (Whisper limit)</p>
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="mt-5">
        <div className="flex rounded-xl overflow-hidden border border-white/10 p-1 bg-white/5">
          {(["transcribe", "translate"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); resetResult(); }}
              disabled={isProcessing}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed ${
                mode === m
                  ? "bg-purple-600 text-white shadow shadow-purple-900/40"
                  : "text-white/50 hover:text-white/80"
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

      {/* Target language dropdown — only shown in translate mode */}
      {mode === "translate" && (
        <div className="mt-3">
          <select
            value={targetLang}
            onChange={(e) => { setTargetLang(e.target.value); resetResult(); }}
            disabled={isProcessing}
            className="input-field disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value} className="bg-gray-900">
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {status === "error" && error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={!file || isProcessing}
          className={`flex-1 btn-primary flex items-center justify-center gap-2 ${
            !file || isProcessing ? "opacity-40 cursor-not-allowed hover:scale-100" : ""
          }`}
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {STATUS_MESSAGES[status]}
            </>
          ) : (
            <>
              <span>Generate subtitles</span>
              <span>→</span>
            </>
          )}
        </button>

        {status === "done" && downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadFilename}
            className="btn-primary flex items-center justify-center gap-2 px-5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download SRT
          </a>
        )}
      </div>
    </div>
  );
}
