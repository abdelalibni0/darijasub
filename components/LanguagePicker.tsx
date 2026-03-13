"use client";

import { useState, useRef, useEffect } from "react";
import { LANGUAGES, type Language } from "@/lib/languages";

// ── Flag & group metadata ──────────────────────────────────────────────────────

const FLAGS: Record<string, string> = {
  "darija-ma":        "🇲🇦",
  "darija-dz":        "🇩🇿",
  "tunisian_darija":  "🇹🇳",
  "arabic_egyptian":  "🇪🇬",
  "arabic_levantine": "🇱🇧",
  "arabic_gulf":      "🇸🇦",
  "msa":              "🌍",
  "en":  "🇬🇧", "fr": "🇫🇷", "es": "🇪🇸", "de": "🇩🇪",
  "it":  "🇮🇹", "pt": "🇵🇹", "nl": "🇳🇱", "tr": "🇹🇷",
  "ru":  "🇷🇺", "uk": "🇺🇦", "pl": "🇵🇱", "ro": "🇷🇴",
  "hu":  "🇭🇺", "cs": "🇨🇿", "sk": "🇸🇰", "bg": "🇧🇬",
  "sr":  "🇷🇸", "hr": "🇭🇷", "el": "🇬🇷", "fi": "🇫🇮",
  "sv":  "🇸🇪", "no": "🇳🇴", "da": "🇩🇰",
  "ja":  "🇯🇵", "ko": "🇰🇷", "zh": "🇨🇳", "zh-TW": "🇹🇼",
  "hi":  "🇮🇳", "ur": "🇵🇰", "bn": "🇧🇩", "id": "🇮🇩",
  "ms":  "🇲🇾", "tl": "🇵🇭", "th": "🇹🇭", "vi": "🇻🇳",
  "he":  "🇮🇱", "fa": "🇮🇷", "ku": "🏳️",
  "sw":  "🇰🇪", "ha": "🇳🇬", "am": "🇪🇹",
};

const ARABIC_DIALECTS = new Set([
  "darija-ma", "darija-dz", "tunisian_darija",
  "arabic_egyptian", "arabic_levantine", "arabic_gulf", "msa",
]);
const POPULAR = new Set(["en", "fr", "es", "de", "it", "pt", "nl", "tr"]);
const ASIAN = new Set(["ja", "ko", "zh", "zh-TW", "hi", "id", "vi", "th"]);

type Group = "Arabic Dialects" | "Popular" | "Asian" | "Other";

function getGroup(value: string): Group {
  if (ARABIC_DIALECTS.has(value)) return "Arabic Dialects";
  if (POPULAR.has(value)) return "Popular";
  if (ASIAN.has(value)) return "Asian";
  return "Other";
}

const GROUP_ORDER: Group[] = ["Arabic Dialects", "Popular", "Asian", "Other"];

const GROUP_ICONS: Record<Group, string> = {
  "Arabic Dialects": "🌙",
  "Popular": "⭐",
  "Asian": "🌏",
  "Other": "🌐",
};

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function LanguagePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = LANGUAGES.find((l) => l.value === value);
  const flag = selected ? (FLAGS[selected.value] ?? "🌐") : "🌐";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const filtered = query.trim()
    ? LANGUAGES.filter((l) =>
        l.label.toLowerCase().includes(query.toLowerCase()) ||
        l.promptName.toLowerCase().includes(query.toLowerCase())
      )
    : null;

  // Build grouped list
  const grouped: Record<Group, Language[]> = {
    "Arabic Dialects": [], Popular: [], Asian: [], Other: [],
  };
  LANGUAGES.forEach((l) => grouped[getGroup(l.value)].push(l));

  const handleSelect = (langValue: string) => {
    onChange(langValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="input-field w-full flex items-center gap-2.5 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:border-purple-500/40 transition-colors"
      >
        <span className="text-xl leading-none">{flag}</span>
        <span className="flex-1 text-white text-sm font-medium">{selected?.label ?? "Select language"}</span>
        <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl"
            style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #160822 50%, #0f0518 100%)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8">
              <h3 className="text-white font-semibold text-sm">Select target language</h3>
              <button
                onClick={() => { setOpen(false); setQuery(""); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-white/8">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search languages..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/50 focus:bg-white/8 transition-all"
                />
              </div>
            </div>

            {/* Language list */}
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {filtered ? (
                // Search results — flat list
                filtered.length === 0 ? (
                  <p className="text-center text-white/30 text-sm py-8">No languages found</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 py-1">
                    {filtered.map((lang) => (
                      <LangCard
                        key={lang.value}
                        lang={lang}
                        flag={FLAGS[lang.value] ?? "🌐"}
                        selected={lang.value === value}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )
              ) : (
                // Grouped list
                GROUP_ORDER.map((group) => {
                  const langs = grouped[group];
                  if (!langs.length) return null;
                  return (
                    <div key={group} className="mb-3">
                      <div className="flex items-center gap-1.5 px-1 py-1.5">
                        <span className="text-sm">{GROUP_ICONS[group]}</span>
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">{group}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {langs.map((lang) => (
                          <LangCard
                            key={lang.value}
                            lang={lang}
                            flag={FLAGS[lang.value] ?? "🌐"}
                            selected={lang.value === value}
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LangCard({
  lang,
  flag,
  selected,
  onSelect,
}: {
  lang: Language;
  flag: string;
  selected: boolean;
  onSelect: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(lang.value)}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
        selected
          ? "bg-purple-600/40 border border-purple-500/60 text-white"
          : "bg-white/3 border border-white/5 text-white/70 hover:bg-white/8 hover:text-white hover:border-white/15"
      }`}
    >
      <span className="text-xl leading-none shrink-0">{flag}</span>
      <span className="text-sm font-medium leading-tight">{lang.label}</span>
      {selected && (
        <svg className="w-3.5 h-3.5 text-purple-400 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
