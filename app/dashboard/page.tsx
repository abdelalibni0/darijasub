import { createClient } from "@/lib/supabase/server";
import UploadCard from "@/components/UploadCard";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const recentProjects = [
  { name: "Episode 3 - Vlog",  duration: "12:34", status: "completed",  lang: "Darija → French",   date: "2 hours ago", createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
  { name: "Tutorial Darija",   duration: "8:12",  status: "completed",  lang: "Darija → English",  date: "Yesterday",   createdAt: new Date(now - 5 * DAY).toISOString() },
  { name: "Interview show",    duration: "45:00", status: "processing", lang: "Darija → MSA",      date: "Just now",    createdAt: new Date(now - 6 * DAY - 20 * 60 * 60 * 1000).toISOString() },
];

function expiryLabel(createdAt: string): { text: string; urgent: boolean } {
  const age = Date.now() - new Date(createdAt).getTime();
  const daysLeft = Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - age) / (24 * 60 * 60 * 1000)));
  if (daysLeft === 0) return { text: "Expires today", urgent: true };
  if (daysLeft === 1) return { text: "Expires tomorrow", urgent: true };
  return { text: `Expires in ${daysLeft} days`, urgent: daysLeft <= 2 };
}

const stats = [
  { label: "Videos processed", value: "3", icon: "🎬" },
  { label: "Minutes transcribed", value: "65", icon: "⏱️" },
  { label: "Subtitles exported", value: "5", icon: "📄" },
  { label: "Free minutes left", value: "35", icon: "🎁" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "aabaalimanager@gmail.com")
    .split(",").map((e) => e.trim().toLowerCase());
  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Creator";

  const pageStats = [
    { label: "Videos processed",    value: "3",                         icon: "🎬" },
    { label: "Minutes transcribed", value: "65",                        icon: "⏱️" },
    { label: "Subtitles exported",  value: "5",                         icon: "📄" },
    { label: "Free minutes left",   value: isAdmin ? "Unlimited ∞" : "35", icon: "🎁" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-1">
          Welcome back, {displayName} 👋
        </h1>
        <p className="text-white/50">Ready to subtitle your next Darija video?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {pageStats.map((stat, i) => (
          <div key={i} className="card p-5">
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className="text-2xl font-black text-white">{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Upload Section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">New project</h2>
        <UploadCard />
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Recent projects</h2>
          <button className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
            View all
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="divide-y divide-white/5">
            {recentProjects.map((project, i) => {
              const expiry = expiryLabel(project.createdAt);
              return (
              <div key={i} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors cursor-pointer">
                {/* Icon */}
                <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center text-lg shrink-0">
                  🎬
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{project.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">{project.lang} · {project.duration}</div>
                  <div className={`text-xs mt-0.5 ${expiry.urgent ? "text-red-400" : "text-white/25"}`}>
                    {expiry.text}
                  </div>
                </div>

                {/* Status */}
                <div className="shrink-0">
                  {project.status === "completed" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Done
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-yellow-500/15 text-yellow-400 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      Processing
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="text-xs text-white/30 shrink-0 hidden md:block">{project.date}</div>

                {/* Actions */}
                {project.status === "completed" && (
                  <button className="shrink-0 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 px-3 py-1.5 rounded-lg transition-colors">
                    Export
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {recentProjects.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4">🎬</div>
            <p className="text-white/40">No projects yet. Upload your first video above!</p>
          </div>
        )}
      </div>
    </div>
  );
}
