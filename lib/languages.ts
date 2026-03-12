export interface Language {
  value: string;
  label: string;
  /** Whisper language code. For Darija variants we use 'ar' with a guiding prompt. */
  whisperCode: string;
  /** Human-readable name used inside Claude prompts */
  promptName: string;
}

export const LANGUAGES: Language[] = [
  {
    value: "darija-ma",
    label: "Moroccan Darija",
    whisperCode: "ar",
    promptName: "Moroccan Darija",
  },
  {
    value: "darija-dz",
    label: "Algerian Darija",
    whisperCode: "ar",
    promptName: "Algerian Darija",
  },
  {
    value: "msa",
    label: "Modern Standard Arabic",
    whisperCode: "ar",
    promptName: "Modern Standard Arabic (Fusha)",
  },
  {
    value: "en",
    label: "English",
    whisperCode: "en",
    promptName: "English",
  },
  {
    value: "fr",
    label: "French",
    whisperCode: "fr",
    promptName: "French",
  },
  {
    value: "es",
    label: "Spanish",
    whisperCode: "es",
    promptName: "Spanish",
  },
  {
    value: "pt",
    label: "Portuguese",
    whisperCode: "pt",
    promptName: "Portuguese",
  },
  {
    value: "de",
    label: "German",
    whisperCode: "de",
    promptName: "German",
  },
  {
    value: "it",
    label: "Italian",
    whisperCode: "it",
    promptName: "Italian",
  },
  {
    value: "tr",
    label: "Turkish",
    whisperCode: "tr",
    promptName: "Turkish",
  },
  {
    value: "nl",
    label: "Dutch",
    whisperCode: "nl",
    promptName: "Dutch",
  },
];

export function getLanguage(value: string): Language {
  const lang = LANGUAGES.find((l) => l.value === value);
  if (!lang) throw new Error(`Unknown language: ${value}`);
  return lang;
}

/**
 * Returns the Whisper `prompt` string that guides transcription for a given source language.
 * For Darija variants this is critical — without it Whisper tends to output MSA.
 */
export function getWhisperPrompt(sourceLangValue: string): string {
  switch (sourceLangValue) {
    case "darija-ma":
      return (
        "This audio is in Moroccan Darija, a North African Arabic dialect spoken in Morocco. " +
        "Moroccan Darija heavily mixes Arabic with French and sometimes Spanish loanwords. " +
        "It is distinct from Modern Standard Arabic and Egyptian Arabic. " +
        "Transcribe exactly as spoken, preserving the dialect. " +
        "Do not normalize to Modern Standard Arabic."
      );
    case "darija-dz":
      return (
        "This audio is in Algerian Darija, a North African Arabic dialect spoken in Algeria. " +
        "Algerian Darija mixes Arabic with French loanwords and Tamazight (Berber) words. " +
        "It is distinct from Modern Standard Arabic and Moroccan Darija. " +
        "Transcribe exactly as spoken, preserving the dialect. " +
        "Do not normalize to Modern Standard Arabic."
      );
    case "msa":
      return "This audio is in Modern Standard Arabic (Fusha). Transcribe accurately.";
    default:
      return "";
  }
}

/**
 * Returns the Claude system prompt for translating SRT segments into the target language.
 */
export function getTranslationPrompt(
  sourceLang: Language,
  targetLang: Language
): string {
  const targetInstructions = getTargetInstructions(targetLang.value);

  return (
    `You are a professional subtitle translator specializing in translating spoken content.\n\n` +
    `Source language: ${sourceLang.promptName}\n` +
    `Target language: ${targetLang.promptName}\n\n` +
    `${getSourceInstructions(sourceLang.value)}` +
    `${targetInstructions}\n\n` +
    `RULES:\n` +
    `- You will receive an array of subtitle segment objects, each with an "index" and "text" field.\n` +
    `- Translate ONLY the "text" field of each segment. Keep the "index" field unchanged.\n` +
    `- Preserve the natural spoken flow — subtitles should read naturally, not like a literal dictionary translation.\n` +
    `- Keep translations concise — subtitles must be readable on screen.\n` +
    `- Do NOT merge or split segments. Return exactly the same number of segments.\n` +
    `- Return a valid JSON array with the same structure: [{"index": N, "text": "translation"}, ...]\n` +
    `- Return ONLY the JSON array. No explanation, no markdown, no code fences.`
  );
}

function getSourceInstructions(sourceLangValue: string): string {
  switch (sourceLangValue) {
    case "darija-ma":
      return (
        "The source is Moroccan Darija — a spoken Arabic dialect that mixes Arabic with French and occasionally Spanish words. " +
        "It is NOT Modern Standard Arabic. Treat it as a distinct spoken language.\n\n"
      );
    case "darija-dz":
      return (
        "The source is Algerian Darija — a spoken Arabic dialect that mixes Arabic with French words and Tamazight (Berber) expressions. " +
        "It is NOT Modern Standard Arabic. Treat it as a distinct spoken language.\n\n"
      );
    default:
      return "";
  }
}

function getTargetInstructions(targetLangValue: string): string {
  switch (targetLangValue) {
    case "darija-ma":
      return (
        "Translate into Moroccan Darija. Write in Arabic script. " +
        "Use natural Moroccan Darija as spoken in Morocco — include French loanwords where they are commonly used in speech. " +
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
    default:
      return `Translate into ${LANGUAGES.find((l) => l.value === targetLangValue)?.promptName ?? targetLangValue}.`;
  }
}
