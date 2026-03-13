export interface Language {
  value: string;
  label: string;
  /** Whisper language code (ISO 639-1). Used for skip-translation detection. */
  whisperCode: string;
  /** Human-readable name used inside Claude prompts */
  promptName: string;
}

export const LANGUAGES: Language[] = [
  // ── Darija & Arabic ──────────────────────────────────────────────────────
  { value: "darija-ma", label: "Moroccan Darija",           whisperCode: "ar", promptName: "Moroccan Darija" },
  { value: "darija-dz", label: "Algerian Darija",           whisperCode: "ar", promptName: "Algerian Darija" },
  { value: "msa",       label: "Modern Standard Arabic",    whisperCode: "ar", promptName: "Modern Standard Arabic (Fusha)" },
  { value: "he",        label: "Hebrew",                    whisperCode: "he", promptName: "Hebrew" },
  { value: "fa",        label: "Persian (Farsi)",           whisperCode: "fa", promptName: "Persian (Farsi)" },
  { value: "ku",        label: "Kurdish",                   whisperCode: "ku", promptName: "Kurdish" },
  // ── European ─────────────────────────────────────────────────────────────
  { value: "en",        label: "English",                   whisperCode: "en", promptName: "English" },
  { value: "fr",        label: "French",                    whisperCode: "fr", promptName: "French" },
  { value: "es",        label: "Spanish",                   whisperCode: "es", promptName: "Spanish" },
  { value: "pt",        label: "Portuguese",                whisperCode: "pt", promptName: "Portuguese" },
  { value: "de",        label: "German",                    whisperCode: "de", promptName: "German" },
  { value: "it",        label: "Italian",                   whisperCode: "it", promptName: "Italian" },
  { value: "nl",        label: "Dutch",                     whisperCode: "nl", promptName: "Dutch" },
  { value: "ru",        label: "Russian",                   whisperCode: "ru", promptName: "Russian" },
  { value: "uk",        label: "Ukrainian",                 whisperCode: "uk", promptName: "Ukrainian" },
  { value: "pl",        label: "Polish",                    whisperCode: "pl", promptName: "Polish" },
  { value: "ro",        label: "Romanian",                  whisperCode: "ro", promptName: "Romanian" },
  { value: "hu",        label: "Hungarian",                 whisperCode: "hu", promptName: "Hungarian" },
  { value: "cs",        label: "Czech",                     whisperCode: "cs", promptName: "Czech" },
  { value: "sk",        label: "Slovak",                    whisperCode: "sk", promptName: "Slovak" },
  { value: "bg",        label: "Bulgarian",                 whisperCode: "bg", promptName: "Bulgarian" },
  { value: "sr",        label: "Serbian",                   whisperCode: "sr", promptName: "Serbian" },
  { value: "hr",        label: "Croatian",                  whisperCode: "hr", promptName: "Croatian" },
  { value: "el",        label: "Greek",                     whisperCode: "el", promptName: "Greek" },
  { value: "fi",        label: "Finnish",                   whisperCode: "fi", promptName: "Finnish" },
  { value: "sv",        label: "Swedish",                   whisperCode: "sv", promptName: "Swedish" },
  { value: "no",        label: "Norwegian",                 whisperCode: "no", promptName: "Norwegian" },
  { value: "da",        label: "Danish",                    whisperCode: "da", promptName: "Danish" },
  { value: "tr",        label: "Turkish",                   whisperCode: "tr", promptName: "Turkish" },
  // ── South & Southeast Asian ───────────────────────────────────────────────
  { value: "hi",        label: "Hindi",                     whisperCode: "hi", promptName: "Hindi" },
  { value: "ur",        label: "Urdu",                      whisperCode: "ur", promptName: "Urdu" },
  { value: "bn",        label: "Bengali",                   whisperCode: "bn", promptName: "Bengali" },
  { value: "id",        label: "Indonesian",                whisperCode: "id", promptName: "Indonesian" },
  { value: "ms",        label: "Malay",                     whisperCode: "ms", promptName: "Malay" },
  { value: "tl",        label: "Tagalog (Filipino)",        whisperCode: "tl", promptName: "Tagalog (Filipino)" },
  { value: "th",        label: "Thai",                      whisperCode: "th", promptName: "Thai" },
  { value: "vi",        label: "Vietnamese",                whisperCode: "vi", promptName: "Vietnamese" },
  // ── East Asian ────────────────────────────────────────────────────────────
  { value: "zh",        label: "Chinese (Simplified)",      whisperCode: "zh", promptName: "Chinese (Simplified)" },
  { value: "zh-TW",     label: "Chinese (Traditional)",     whisperCode: "zh", promptName: "Chinese (Traditional)" },
  { value: "ja",        label: "Japanese",                  whisperCode: "ja", promptName: "Japanese" },
  { value: "ko",        label: "Korean",                    whisperCode: "ko", promptName: "Korean" },
  // ── African ───────────────────────────────────────────────────────────────
  { value: "sw",        label: "Swahili",                   whisperCode: "sw", promptName: "Swahili" },
  { value: "ha",        label: "Hausa",                     whisperCode: "ha", promptName: "Hausa" },
  { value: "am",        label: "Amharic",                   whisperCode: "am", promptName: "Amharic" },
];

export function getLanguage(value: string): Language {
  const lang = LANGUAGES.find((l) => l.value === value);
  if (!lang) throw new Error(`Unknown language: ${value}`);
  return lang;
}

/**
 * Maps the language name Whisper returns (e.g. "arabic", "french") to an ISO 639-1 code.
 * Whisper returns full lowercase English names in its verbose_json response.
 * Used to detect when source and target are the same language (skip translation).
 */
export function whisperNameToCode(whisperLang: string): string {
  const map: Record<string, string> = {
    arabic: "ar", french: "fr", english: "en", spanish: "es",
    portuguese: "pt", german: "de", italian: "it", dutch: "nl",
    russian: "ru", ukrainian: "uk", polish: "pl", turkish: "tr",
    hindi: "hi", urdu: "ur", bengali: "bn", indonesian: "id",
    malay: "ms", tagalog: "tl", thai: "th", vietnamese: "vi",
    chinese: "zh", japanese: "ja", korean: "ko",
    swahili: "sw", hausa: "ha", amharic: "am",
    hebrew: "he", persian: "fa", farsi: "fa", kurdish: "ku",
    romanian: "ro", hungarian: "hu", czech: "cs", slovak: "sk",
    bulgarian: "bg", serbian: "sr", croatian: "hr", greek: "el",
    finnish: "fi", swedish: "sv", norwegian: "no", danish: "da",
  };
  return map[whisperLang.toLowerCase()] ?? whisperLang.toLowerCase();
}

/**
 * Capitalises the first letter of the language name Whisper returns,
 * for display in the UI (e.g. "arabic" → "Arabic").
 */
export function formatDetectedLanguage(whisperLang: string): string {
  if (!whisperLang) return "";
  return whisperLang.charAt(0).toUpperCase() + whisperLang.slice(1).toLowerCase();
}

/**
 * Returns the Claude system prompt for translating SRT segments.
 * `detectedLanguage` is the raw string Whisper returned (e.g. "arabic", "french").
 */
export function getTranslationPrompt(
  detectedLanguage: string,
  targetLang: Language
): string {
  const targetInstructions = getTargetInstructions(targetLang.value);

  return (
    `You are a subtitle translator. You translate spoken subtitle segments.\n\n` +
    `Source: ${formatDetectedLanguage(detectedLanguage)} (auto-detected)\n` +
    `Target: ${targetLang.promptName}\n\n` +
    `${targetInstructions}\n\n` +
    `YOUR RESPONSE MUST BE A SINGLE RAW JSON ARRAY AND NOTHING ELSE.\n` +
    `Do not write any text before the "[". Do not write any text after the "]".\n` +
    `Do not use markdown. Do not use code fences. Do not explain anything.\n` +
    `The very first character of your response must be "[" and the very last must be "]".\n\n` +
    `Input format: [{"index": 1, "text": "..."}, {"index": 2, "text": "..."}, ...]\n` +
    `Output format: [{"index": 1, "text": "<translation>"}, {"index": 2, "text": "<translation>"}, ...]\n\n` +
    `Rules:\n` +
    `- Return exactly the same number of objects as you received.\n` +
    `- Keep every "index" value unchanged.\n` +
    `- Translate only the "text" value of each object.\n` +
    `- Keep translations concise and natural for on-screen reading.`
  );
}

function getTargetInstructions(targetLangValue: string): string {
  switch (targetLangValue) {
    case "darija-ma":
      return (
        "Translate into Moroccan Darija. Write in Arabic script. " +
        "Use natural Moroccan Darija as spoken in Morocco — include French loanwords where commonly used. " +
        "Do NOT write in Modern Standard Arabic."
      );
    case "darija-dz":
      return (
        "Translate into Algerian Darija. Write in Arabic script. " +
        "Use natural Algerian Darija as spoken in Algeria — include French loanwords and Tamazight expressions where appropriate. " +
        "Do NOT write in Modern Standard Arabic."
      );
    case "msa":
      return "Translate into Modern Standard Arabic (Fusha). Write in Arabic script. Use formal, grammatically correct MSA suitable for subtitles.";
    case "zh":
      return "Translate into Simplified Chinese. Use Simplified Chinese characters (Mainland China standard).";
    case "zh-TW":
      return "Translate into Traditional Chinese. Use Traditional Chinese characters (Taiwan/Hong Kong standard).";
    default: {
      const lang = LANGUAGES.find((l) => l.value === targetLangValue);
      return `Translate into ${lang?.promptName ?? targetLangValue}.`;
    }
  }
}
