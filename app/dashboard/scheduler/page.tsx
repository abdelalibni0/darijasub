"use client";

import { useState, useEffect, useCallback } from "react";
import SchedulerModal, { type ScheduledPost } from "@/components/SchedulerModal";

const PLATFORM_META: Record<string, { label: string; emoji: string; url: string }> = {
  tiktok:         { label: "TikTok",      emoji: "🎵", url: "https://www.tiktok.com/upload" },
  instagram:      { label: "Instagram",   emoji: "📸", url: "https://www.instagram.com/" },
  facebook:       { label: "Facebook",    emoji: "📘", url: "https://www.facebook.com/" },
  youtube:        { label: "YouTube",     emoji: "▶️", url: "https://studio.youtube.com/" },
  youtube_shorts: { label: "YT Shorts",   emoji: "📱", url: "https://studio.youtube.com/" },
  x:              { label: "X",           emoji: "𝕏",  url: "https://x.com/compose/tweet" },
};

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  scheduled: { label: "Scheduled", bg: "rgba(59,130,246,0.15)",  color: "#93c5fd",               border: "rgba(59,130,246,0.3)"  },
  ready:     { label: "Ready",     bg: "rgba(34,197,94,0.15)",   color: "#86efac",               border: "rgba(34,197,94,0.3)"   },
  posted:    { label: "Posted",    bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", border: "rgba(255,255,255,0.1)" },
};

interface Toast {
  id: number;
  message: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export default function SchedulerPage() {
  const [posts,      setPosts]      = useState<ScheduledPost[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [toasts,     setToasts]     = useState<Toast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduler");
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const { posts: list } = await res.json() as { posts: ScheduledPost[] };
      setPosts(list ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const deletePost = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch("/api/scheduler", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silently ignore
    } finally {
      setDeleting(null);
    }
  };

  const publishNow = async (post: ScheduledPost) => {
    setPublishing(post.id);
    const platform = PLATFORM_META[post.platform] ?? { label: post.platform, emoji: "📤", url: "" };

    // 1. Copy caption + hashtags to clipboard
    const clipboardText = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
    if (clipboardText) {
      await navigator.clipboard.writeText(clipboardText).catch(() => {});
    }

    // 2. Trigger video download if video_url exists
    if (post.video_url) {
      const a = document.createElement("a");
      a.href = post.video_url;
      a.download = `video-${post.platform}.mp4`;
      a.click();
    }

    // 3. Open platform upload page
    if (platform.url) {
      window.open(platform.url, "_blank", "noopener,noreferrer");
    }

    // 4. Show toast
    const parts = [
      clipboardText ? "✅ Caption copied!" : null,
      post.video_url ? "Video downloading…" : null,
      `Opening ${platform.label}`,
    ].filter(Boolean).join("  ");
    addToast(parts);

    // 5. Mark as posted via PATCH
    try {
      const res = await fetch("/api/scheduler", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: post.id, status: "posted" }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => p.id === post.id ? { ...p, status: "posted" } : p)
        );
      }
    } catch {
      // silently ignore status update failure
    } finally {
      setPublishing(null);
    }
  };

  const handleScheduled = (post: ScheduledPost) => {
    setPosts((prev) =>
      [...prev, post].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      )
    );
  };

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: "linear-gradient(160deg,#0d0618 0%,#080410 100%)" }}
    >
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="px-4 py-3 rounded-xl text-sm font-medium shadow-xl"
            style={{
              background:  "linear-gradient(135deg,#1a0a2e,#12062a)",
              border:      "1px solid rgba(168,85,247,0.4)",
              color:       "#e9d5ff",
              boxShadow:   "0 8px 32px rgba(0,0,0,0.5)",
              animation:   "fadeInUp 0.25s ease",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Social Media Scheduler</h1>
          <p className="text-sm text-white/40 mt-1">Plan and schedule your subtitle videos across platforms</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: "linear-gradient(90deg,#7c3aed,#9333ea)",
            color:      "#fff",
            boxShadow:  "0 4px 14px rgba(124,58,237,0.35)",
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Scheduled Post
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl animate-pulse"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          className="px-5 py-4 rounded-2xl text-sm"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}
        >
          {error}
          <button
            type="button"
            onClick={fetchPosts}
            className="ml-3 underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5"
            style={{ background: "rgba(147,51,234,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}
          >
            📅
          </div>
          <h2 className="text-lg font-semibold text-white/80 mb-2">No scheduled posts yet</h2>
          <p className="text-sm text-white/35 mb-6 max-w-xs">
            Click &ldquo;New Scheduled Post&rdquo; to schedule your first subtitle video to social media.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{ background: "linear-gradient(90deg,#7c3aed,#9333ea)", color: "#fff", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
          >
            Schedule Your First Post
          </button>
        </div>
      )}

      {/* Post list */}
      {!loading && !error && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => {
            const platform  = PLATFORM_META[post.platform] ?? { label: post.platform, emoji: "📤", url: "" };
            const status    = STATUS_STYLE[post.status]    ?? STATUS_STYLE.scheduled;
            const isDel     = deleting   === post.id;
            const isPub     = publishing === post.id;
            const isPosted  = post.status === "posted";

            return (
              <div
                key={post.id}
                className="flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                {/* Platform icon */}
                <div
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {platform.emoji}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white/90">{platform.label}</span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium border"
                      style={{ background: status.bg, color: status.color, borderColor: status.border }}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs text-white/35">{formatDate(post.scheduled_at)}</span>
                  </div>
                  {post.caption && (
                    <p className="text-xs text-white/45 mt-1 truncate max-w-xl">{post.caption}</p>
                  )}
                  {post.hashtags && (
                    <p className="text-xs mt-0.5 truncate max-w-xl" style={{ color: "rgba(168,85,247,0.7)" }}>
                      {post.hashtags}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Publish Now */}
                  <button
                    type="button"
                    onClick={() => publishNow(post)}
                    disabled={isPub || isDel || isPosted}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isPosted
                        ? "rgba(255,255,255,0.04)"
                        : "linear-gradient(90deg,#059669,#10b981)",
                      color:      isPosted ? "rgba(255,255,255,0.3)" : "#fff",
                      border:     isPosted ? "1px solid rgba(255,255,255,0.08)" : "none",
                      boxShadow:  isPosted || isPub ? "none" : "0 2px 8px rgba(16,185,129,0.3)",
                    }}
                    title={isPosted ? "Already posted" : "Publish Now"}
                  >
                    {isPub ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                    {isPub ? "Publishing…" : isPosted ? "Posted" : "Publish Now"}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => deletePost(post.id)}
                    disabled={isDel || isPub}
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(252,165,165,0.7)" }}
                    title="Delete scheduled post"
                  >
                    {isDel ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <SchedulerModal
          onClose={() => setModalOpen(false)}
          onScheduled={handleScheduled}
        />
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
