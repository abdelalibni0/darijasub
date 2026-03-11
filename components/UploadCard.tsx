"use client";

import { useState, useRef } from "react";

const languageOptions = [
  { value: "darija-ma", label: "Moroccan Darija" },
  { value: "darija-dz", label: "Algerian Darija" },
];

const outputOptions = [
  { value: "darija-latin", label: "Darija (Latin script)" },
  { value: "darija-arabic", label: "Darija (Arabic script)" },
  { value: "french", label: "French" },
  { value: "english", label: "English" },
  { value: "msa", label: "MSA (Fusha)" },
];

export default function UploadCard() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("darija-ma");
  const [outputLang, setOutputLang] = useState("french");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card p-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragging
            ? "border-purple-500 bg-purple-500/10"
            : file
            ? "border-purple-500/40 bg-purple-500/5"
            : "border-white/15 hover:border-purple-500/40 hover:bg-white/3"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {file ? (
          <div>
            <div className="text-4xl mb-3">🎬</div>
            <p className="font-semibold text-white">{file.name}</p>
            <p className="text-sm text-white/40 mt-1">{formatBytes(file.size)}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">⬆️</div>
            <p className="font-semibold text-white">Drop your video or audio here</p>
            <p className="text-sm text-white/40 mt-1">or click to browse — MP4, MOV, MP3, WAV supported</p>
            <p className="text-xs text-white/25 mt-3">Max 500 MB · Up to 3 hours</p>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">Source dialect</label>
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="input-field"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">Output language</label>
          <select
            value={outputLang}
            onChange={(e) => setOutputLang(e.target.value)}
            className="input-field"
          >
            {outputOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit */}
      <button
        disabled={!file}
        className={`mt-5 w-full btn-primary flex items-center justify-center gap-2 ${!file ? "opacity-40 cursor-not-allowed hover:scale-100" : ""}`}
      >
        <span>Generate subtitles</span>
        <span>→</span>
      </button>
    </div>
  );
}
