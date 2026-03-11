import Link from "next/link";
import Navbar from "@/components/Navbar";
import FeatureCard from "@/components/FeatureCard";

const features = [
  {
    icon: "🎙️",
    title: "Darija Speech Recognition",
    description:
      "Our AI is fine-tuned specifically on Moroccan and Algerian Darija dialects — not just MSA. It understands your accent.",
  },
  {
    icon: "⚡",
    title: "Lightning Fast",
    description:
      "Upload your video or audio file and get accurate subtitles in under 2 minutes. No waiting, no fuss.",
  },
  {
    icon: "🌍",
    title: "Multi-language Export",
    description:
      "Export subtitles in Darija (Latin or Arabic script), French, English, or MSA — all from one upload.",
  },
  {
    icon: "✂️",
    title: "In-browser Editor",
    description:
      "Fine-tune timing and text directly in your browser before exporting. No third-party tools needed.",
  },
  {
    icon: "📁",
    title: "SRT & VTT Export",
    description:
      "Download your subtitles in industry-standard SRT or VTT formats, ready to upload to YouTube, TikTok, or Instagram.",
  },
  {
    icon: "🔒",
    title: "Private & Secure",
    description:
      "Your content is never shared or used to train models. Files are deleted from our servers after processing.",
  },
];

const steps = [
  { number: "01", title: "Upload your content", description: "Drop a video or audio file — any format works." },
  { number: "02", title: "AI processes Darija", description: "Our model transcribes and timestamps your speech." },
  { number: "03", title: "Review & edit", description: "Fix any errors in our clean in-browser editor." },
  { number: "04", title: "Export & publish", description: "Download SRT/VTT and upload anywhere." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-24 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-purple-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-pink-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 rounded-full px-4 py-1.5 text-sm text-purple-300 mb-8">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            Built for Moroccan &amp; Algerian creators
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            Subtitles that{" "}
            <span className="gradient-text">actually speak</span>
            <br />
            Darija
          </h1>

          <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            DarijaSub uses AI trained on real Moroccan and Algerian speech to generate
            accurate subtitles for your content — faster than any general tool.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="btn-primary text-lg px-8 py-4">
              Get started free
            </Link>
            <Link href="#how-it-works" className="btn-secondary text-lg px-8 py-4">
              See how it works
            </Link>
          </div>

          <p className="mt-5 text-sm text-white/30">No credit card required · Free plan available</p>
        </div>

        {/* Mock UI preview */}
        <div className="relative max-w-4xl mx-auto mt-20">
          <div className="card p-6 shadow-2xl shadow-purple-950/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <div className="ml-3 flex-1 bg-white/5 rounded-lg h-6 max-w-xs" />
            </div>
            <div className="grid grid-cols-5 gap-4 h-48">
              <div className="col-span-2 bg-white/5 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎬</div>
                  <div className="text-xs text-white/40">video.mp4</div>
                </div>
              </div>
              <div className="col-span-3 space-y-3">
                {[
                  { time: "00:00:03", text: "واش نبدأو بالدارجة؟" },
                  { time: "00:00:06", text: "ها نبدأو، كل شي مزيان" },
                  { time: "00:00:09", text: "هاو الترجمة كاملة" },
                  { time: "00:00:13", text: "شوف كيفاش خدام..." },
                ].map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${i === 1 ? "bg-purple-600/30 border border-purple-500/40" : "hover:bg-white/5"}`}
                  >
                    <span className="text-xs text-white/30 font-mono mt-0.5 shrink-0">{line.time}</span>
                    <span className="text-sm text-white/80">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <div className="flex-1 h-9 bg-purple-600/40 rounded-lg flex items-center justify-center text-xs text-purple-300 font-medium">
                Export SRT
              </div>
              <div className="flex-1 h-9 bg-white/5 rounded-lg flex items-center justify-center text-xs text-white/40">
                Export VTT
              </div>
              <div className="flex-1 h-9 bg-white/5 rounded-lg flex items-center justify-center text-xs text-white/40">
                Translate
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6" id="features">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything a Darija creator needs
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              One tool. No stitching together a dozen apps.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <FeatureCard key={i} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 relative" id="how-it-works">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-purple-700/15 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How it works</h2>
            <p className="text-white/50 text-lg">From upload to subtitled in minutes.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="card p-6 flex gap-5">
                <div className="text-3xl font-black text-purple-500/40 shrink-0 leading-none">{step.number}</div>
                <div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-white/50">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="card p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/10 pointer-events-none" />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Ready to grow your<br />Darija audience?
              </h2>
              <p className="text-white/50 mb-8 text-lg">
                Join creators already using DarijaSub to reach more viewers.
              </p>
              <Link href="/auth/signup" className="btn-primary text-lg px-10 py-4 inline-block">
                Start for free today
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xl font-black">
            <span className="text-purple-400">Darija</span>
            <span>Sub</span>
          </div>
          <p className="text-white/30 text-sm">
            © {new Date().getFullYear()} DarijaSub. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white/80 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/80 transition-colors">Terms</a>
            <a href="#" className="hover:text-white/80 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
