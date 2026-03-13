"use client";

type StepStatus = "pending" | "active" | "done";

interface Step {
  label: string;
  icon: "upload" | "mic" | "globe" | "check";
}

interface Props {
  steps: Step[];
  statuses: StepStatus[];
  progress: number; // 0–100
}

const ICONS: Record<Step["icon"], (active: boolean) => React.ReactNode> = {
  upload: (active) => (
    <svg className={`w-4 h-4 ${active ? "animate-bounce" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  mic: (active) => (
    <svg className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  globe: (active) => (
    <svg className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
    </svg>
  ),
  check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
};

export default function ProgressSteps({ steps, statuses, progress }: Props) {
  return (
    <div className="space-y-4">
      {/* Step list */}
      <div className="space-y-2">
        {steps.map((step, i) => {
          const s = statuses[i] ?? "pending";
          return (
            <div key={i} className="flex items-center gap-3">
              {/* Icon bubble */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  s === "done"
                    ? "bg-green-500/20 text-green-400 border border-green-500/40"
                    : s === "active"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                    : "bg-white/5 text-white/20 border border-white/10"
                }`}
              >
                {s === "done" ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  ICONS[step.icon](s === "active")
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  s === "done"
                    ? "text-green-400"
                    : s === "active"
                    ? "text-white"
                    : "text-white/25"
                }`}
              >
                {step.label}
              </span>

              {/* Active spinner dot */}
              {s === "active" && (
                <span className="ml-auto">
                  <svg className="animate-spin w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: progress === 100
                ? "linear-gradient(90deg, #22c55e, #16a34a)"
                : "linear-gradient(90deg, #7c3aed, #a855f7)",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/30">
          <span>{Math.round(progress)}%</span>
          {progress === 100 && <span className="text-green-400">Complete</span>}
        </div>
      </div>
    </div>
  );
}
