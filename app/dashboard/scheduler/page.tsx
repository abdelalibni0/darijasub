"use client";

import { useState, useEffect } from "react";
import SchedulerModal, { type ScheduledPost } from "@/components/SchedulerModal";

const PLATFORM_META: Record<string, { label: string; emoji: string; color: string }> = {
  tiktok:         { label: "TikTok",      emoji: "🎵", color: "#ff0050" },
  instagram:      { label: "Instagram",   emoji: "📸", color: "#e1306c" },
  facebook:       { label: "Facebook",    emoji: "📘", color: "#1877f2" },
  youtube:        { label: "YouTube",     emoji: "▶️", color: "#ff0000" },
  youtube_shorts: { label: "YT Shorts",   emoji: "📱", color: "#ff0000" },
  x:              { label: "X",           emoji: "𝕏",  color: "#ffffff" },
};

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  scheduled: { label: "Scheduled", bg: "rgba(59,130,246,0.15)", color: "#93c5fd", border: "rgba(59,130,246,0.3)"  },
  ready:     { label: "Ready",     bg: "rgba(34,197,94,0.15)",  color: "#86efac", border: "rgba(34,197,94,0.3)"   },
  posted:    { label: "Posted",    bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", border: "rgba(255,255,255,0.1)" },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function SchedulerPage() {
  const [posts,     setPosts]     = useState<ScheduledPost[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);

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
      // silently ignore for now
    } finally {
      setDeleting(null);
    }
  };

  const handleScheduled = (post: ScheduledPost) => {
    setPosts((prev) => [...prev, post].sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
  };

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: "linear-gradient(160deg,#0d0618 0%,#080410 100%)" }}
    >
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
            const platform = PLATFORM_META[post.platform] ?? { label: post.platform, emoji: "📤", color: "#ffffff" };
            const status   = STATUS_STYLE[post.status]   ?? STATUS_STYLE.scheduled;
            const isDel    = deleting === post.id;
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
                    <p className="text-xs mt-0.5 truncate max-w-xl" style={{ color: "rgba(168,85,247,0.7)" }}>{post.hashtags}</p>
                  )}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => deletePost(post.id)}
                  disabled={isDel}
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
    </div>
  );
}
