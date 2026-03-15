"use client";

import { useState, useRef } from "react";

export interface ScheduledPost {
  id: string;
  platform: string;
  scheduled_at: string;
  caption: string | null;
  hashtags: string | null;
  video_url: string | null;
  status: string;
  created_at: string;
}

const PLATFORMS = [
  { id: "tiktok",         label: "TikTok",      emoji: "🎵", bg: "rgba(255,0,80,0.15)",   border: "rgba(255,0,80,0.4)"   },
  { id: "instagram",      label: "Instagram",   emoji: "📸", bg: "rgba(225,48,108,0.15)", border: "rgba(225,48,108,0.4)" },
  { id: "facebook",       label: "Facebook",    emoji: "📘", bg: "rgba(24,119,242,0.15)", border: "rgba(24,119,242,0.4)" },
  { id: "youtube",        label: "YouTube",     emoji: "▶️", bg: "rgba(255,0,0,0.12)",    border: "rgba(255,0,0,0.35)"   },
  { id: "youtube_shorts", label: "YT Shorts",   emoji: "📱", bg: "rgba(255,0,0,0.12)",    border: "rgba(255,0,0,0.35)"   },
  { id: "x",              label: "X",           emoji: "𝕏",  bg: "rgba(255,255,255,0.06)",border: "rgba(255,255,255,0.2)" },
];

function defaultDateTime() {
  const now = new Date();
  const next = new Date(now.getTime() + 3600_000);
  const date = now.toISOString().slice(0, 10);
  const time = `${String(next.getHours()).padStart(2, "0")}:00`;
  return { date, time };
}

export default function SchedulerModal({
  onClose,
  onScheduled,
  initialCaption = "",
  initialHashtags = "",
  projectId,
}: {
  onClose: () => void;
  onScheduled?: (post: ScheduledPost) => void;
  initialCaption?: string;
  initialHashtags?: string;
  projectId?: string;
}) {
  const { date: defDate, time: defTime } = defaultDateTime();

  const [platform,   setPlatform]   = useState("instagram");
  const [date,       setDate]       = useState(defDate);
  const [time,       setTime]       = useState(defTime);
  const [caption,    setCaption]    = useState(initialCaption);
  const [hashtags,   setHashtags]   = useState(initialHashtags);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const backdropRef                 = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    if (!platform || !date || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const scheduled_at = new Date(`${date}T${time}`).toISOString();
      const res = await fetch("/api/scheduler", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          platform,
          scheduled_at,
          caption:    caption.trim() || null,
          hashtags:   hashtags.trim() || null,
          project_id: projectId ?? null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const { post } = await res.json() as { post: ScheduledPost };
      onScheduled?.(post);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule post");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlatform = PLATFORMS.find((p) => p.id === platform)!;

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border:     "1px solid rgba(255,255,255,0.1)",
    color:      "rgba(255,255,255,0.85)",
    borderRadius: "0.75rem",
    padding: "0.625rem 1rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === backdropRef.current && !submitting) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(160deg,#1a0a2e 0%,#0f0619 100%)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">📅 Schedule Post</h2>
            <p className="text-xs text-white/40 mt-0.5">Schedule your video to social media</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Platform selector */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Platform</p>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => {
                const active = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all"
                    style={{
                      background:  active ? p.bg  : "rgba(255,255,255,0.03)",
                      borderColor: active ? p.border : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <span className="text-xl leading-none">{p.emoji}</span>
                    <span className="text-xs font-medium" style={{ color: active ? "#e9d5ff" : "rgba(255,255,255,0.5)" }}>
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + Time */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Schedule Date &amp; Time</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Date</label>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                  onFocus={(e)  => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
                  onBlur={(e)   => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                  onFocus={(e)  => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
                  onBlur={(e)   => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                />
              </div>
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Caption</p>
              <span className="text-xs text-white/25">{caption.length} chars</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              disabled={submitting}
              placeholder={`Write your ${selectedPlatform.label} caption…`}
              className="w-full resize-none text-sm outline-none leading-relaxed transition-colors disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.1)",
                color:      "rgba(255,255,255,0.85)",
                borderRadius: "0.75rem",
                padding: "0.75rem 1rem",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
          </div>

          {/* Hashtags */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Hashtags</p>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              disabled={submitting}
              placeholder="#subtitles #video #content"
              style={{ ...inputStyle }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white border border-white/10 transition-all disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !date || !time}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background:  "linear-gradient(90deg,#7c3aed,#9333ea)",
              color:       "#fff",
              boxShadow:   submitting ? "none" : "0 4px 14px rgba(124,58,237,0.35)",
            }}
          >
            {submitting ? "Scheduling…" : `📅 Schedule for ${selectedPlatform.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
