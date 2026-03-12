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
 * Returns the Whisper `prompt` string for a given source language.
 *
 * IMPORTANT: Whisper's prompt parameter is a vocabulary/style hint, NOT an instruction field.
 * It should contain short sample text in the audio's language to prime the model's vocabulary.
 * Long English instructions will be treated as preceding spoken content and appear as subtitles.
 *
 * For Darija we pass common dialect words in Arabic script so Whisper stays in dialect
 * rather than normalizing to MSA.
 */
export function getWhisperPrompt(sourceLangValue: string): string {
  switch (sourceLangValue) {
    case "darija-ma":
      // Common Moroccan Darija vocabulary — guides Whisper to stay in dialect
      return "واش، بزاف، مزيان، والو، دابا، راه، هاذ، كاين، درت، حشومة، شكون، فين، كيفاش، علاش، بغيت";
    case "darija-dz":
      // Common Algerian Darija vocabulary
      return "واش، يزر، بزاف، والو، كيما، رواح، يلاه، حبيبي، كاين، وين، علاش، كيفاش، نتا، هكا، درت";
    case "msa":
      return "بسم الله الرحمن الرحيم، والسلام عليكم،";
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
    `You are a subtitle translator. You translate spoken subtitle segments.\n\n` +
    `Source: ${sourceLang.promptName}\n` +
    `Target: ${targetLang.promptName}\n\n` +
    `${getSourceInstructions(sourceLang.value)}` +
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
