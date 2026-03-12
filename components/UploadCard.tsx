"use client";

import { useState, useRef } from "react";
import { LANGUAGES } from "@/lib/languages";

type Status = "idle" | "uploading" | "transcribing" | "translating" | "done" | "error";

const STATUS_MESSAGES: Record<Status, string> = {
  idle: "",
  uploading: "Uploading file...",
  transcribing: "Transcribing with Whisper AI...",
  translating: "Translating with Claude...",
  done: "Done! Your SRT file is ready.",
  error: "",
};

export default function UploadCard() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("darija-ma");
  const [targetLang, setTargetLang] = useState("fr");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState("subtitles.srt");
  const inputRef = useRef<HTMLInputElement>(null);

  const isSameLang = sourceLang === targetLang;
  const isProcessing = ["uploading", "transcribing", "translating"].includes(status);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — Whisper API limit

  const validateAndSetFile = (f: File) => {
    resetResult();
    if (f.size > MAX_FILE_SIZE) {
      setError(`File is ${formatBytes(f.size)} — Whisper's limit is 25 MB. Please compress or trim the file first.`);
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

  const resetResult = () => {
    setStatus("idle");
    setError(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  };

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleSubmit = async () => {
    if (!file) return;
    resetResult();

    try {
      setStatus("uploading");
      const form = new FormData();
      form.append("file", file);
      form.append("sourceLang", sourceLang);
      form.append("targetLang", targetLang);

      setStatus("transcribing");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }

      // If translating, optimistically show translating state
      // (the API handles it server-side; we show the state before response arrives)
      if (!isSameLang) setStatus("translating");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Derive filename from Content-Disposition header if present
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `subtitles_${targetLang}.srt`;

      setDownloadUrl(url);
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
          accept="video/*,audio/*"
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
            <p className="text-sm text-white/40 mt-1">{file?.name}</p>
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
            <p className="text-sm text-white/40 mt-1">or click to browse — MP4, MOV, MP3, WAV, M4A supported</p>
            <p className="text-xs text-white/25 mt-3">Max 25 MB (Whisper limit)</p>
          </div>
        )}
      </div>

      {/* Language selectors */}
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Source language <span className="text-white/30 font-normal">(spoken in video)</span>
          </label>
          <select
            value={sourceLang}
            onChange={(e) => { setSourceLang(e.target.value); resetResult(); }}
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

        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Target language <span className="text-white/30 font-normal">(subtitle output)</span>
          </label>
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
      </div>

      {/* Same-language notice */}
      {isSameLang && (
        <p className="mt-3 text-xs text-purple-300/70 flex items-center gap-1.5">
          <span>ℹ️</span>
          Same source and target — subtitles will be transcribed without translation.
        </p>
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
