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
  { value: "darija-ma",       label: "Moroccan Darija",         whisperCode: "ar", promptName: "Moroccan Darija" },
  { value: "darija-dz",       label: "Algerian Darija",         whisperCode: "ar", promptName: "Algerian Darija" },
  { value: "tunisian_darija", label: "Tunisian Darija",         whisperCode: "ar", promptName: "Tunisian Darija" },
  { value: "msa",             label: "Modern Standard Arabic",  whisperCode: "ar", promptName: "Modern Standard Arabic (Fusha)" },
  { value: "arabic_egyptian", label: "Arabic (Egyptian)",       whisperCode: "ar", promptName: "Egyptian Arabic" },
  { value: "arabic_levantine",label: "Arabic (Levantine)",      whisperCode: "ar", promptName: "Levantine Arabic" },
  { value: "arabic_gulf",     label: "Arabic (Gulf)",           whisperCode: "ar", promptName: "Gulf Arabic" },
  { value: "he",              label: "Hebrew",                  whisperCode: "he", promptName: "Hebrew" },
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
    `You are an expert subtitle localizer. Your job is not to translate — it is to rewrite the content so it sounds completely natural to a native ${targetLang.promptName} speaker, as if it were originally written in that language.\n\n` +
    `Source language: ${formatDetectedLanguage(detectedLanguage)}\n` +
    `Target language: ${targetLang.promptName}\n\n` +
    `${targetInstructions}\n\n` +
    `HOW TO TRANSLATE:\n\n` +
    `1. UNDERSTAND BEFORE YOU WRITE. Read the full batch first to understand the topic, context, and speaker's tone. Then translate each segment with that full context in mind — never in isolation.\n\n` +
    `2. TRANSLATE MEANING, NOT WORDS. Ask yourself: "What is this person actually trying to say?" Then write that — in the target language's own words, its own idioms, its own rhythm. Do not map words across.\n\n` +
    `3. REPLACE IDIOMS AND SLANG WITH EQUIVALENTS. If the source uses a colloquial expression, a saying, or slang, find the natural equivalent in the target language. Never translate the expression literally — that produces nonsense. Example: "break a leg" in English should become the equivalent good-luck expression in the target language, not "casse une jambe".\n\n` +
    `4. MATCH THE SPEAKER'S REGISTER EXACTLY. Casual → casual. Formal → formal. Humorous → humorous. Sarcastic → sarcastic. Emotional → emotional. A joke must still land as a joke. A rant must still feel like a rant. Preserve the speaker's personality and energy.\n\n` +
    `5. HANDLE CODE-SWITCHING NATURALLY. The source may mix languages (e.g. Darija + French + English, Arabic + Amazigh). This is natural speech. Translate the overall meaning of the full utterance — do not translate each language fragment separately, and do not flag the mixing as an error.\n\n` +
    `6. WRITE FOR THE EAR, NOT THE PAGE. Subtitles represent spoken language. Write how a real person would say something out loud — contractions, dropped words, natural phrasing. Avoid formal written register unless the speaker is being formal.\n\n` +
    `7. NEVER PRODUCE MACHINE-TRANSLATION PATTERNS. Avoid calques (word-for-word structural copies), unnatural word order, and stiff phrasing. If a sentence sounds like Google Translate, rewrite it.\n\n` +
    `8. KEEP SUBTITLES CONCISE. Cut filler words if needed. Never cut meaning. Each segment must be readable on screen in the time available.\n\n` +
    `YOUR RESPONSE MUST BE A SINGLE RAW JSON ARRAY AND NOTHING ELSE.\n` +
    `Do not write any text before the "[". Do not write any text after the "]".\n` +
    `Do not use markdown. Do not use code fences. Do not explain anything.\n` +
    `The very first character of your response must be "[" and the very last must be "]".\n\n` +
    `Input format: [{"index": 1, "text": "..."}, {"index": 2, "text": "..."}, ...]\n` +
    `Output format: [{"index": 1, "text": "<localized text>"}, {"index": 2, "text": "<localized text>"}, ...]\n\n` +
    `JSON rules:\n` +
    `- Return exactly the same number of objects as you received.\n` +
    `- Keep every "index" value unchanged.\n` +
    `- Translate only the "text" value of each object.`
  );
}

function getTargetInstructions(targetLangValue: string): string {
  switch (targetLangValue) {
    case "darija-ma":
      return (
        "TARGET: Moroccan Darija — write in Arabic script.\n" +
        "This is colloquial Moroccan Arabic as spoken in everyday life, not written MSA. Key points:\n" +
        "- Use Moroccan vocabulary naturally: 'واش' (question marker), 'كيفاش' (how), 'فين' (where), 'علاش' (why), 'بزاف' (a lot), 'مزيان' (good), 'دابا' (now), 'غير' (just/only).\n" +
        "- French loanwords are normal and expected in Moroccan Darija: 'البروبلم', 'لكار' (car), 'البورطابل' (mobile), 'الطوبيس' (bus). Use them as a Moroccan would.\n" +
        "- The source may mix Darija, French, and sometimes Amazigh/Tamazight — this is natural. Translate the overall meaning into natural Darija.\n" +
        "- Colloquial expressions must be replaced with their Darija equivalents, not translated literally. e.g. if the source means 'I'm tired', write 'عيّيت' not a literal translation of 'tired'.\n" +
        "- Preserve humor, sarcasm, and casual tone — Moroccan speech is expressive.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha)."
      );
    case "darija-dz":
      return (
        "TARGET: Algerian Darija — write in Arabic script.\n" +
        "This is colloquial Algerian Arabic as spoken in everyday life, not MSA. Key points:\n" +
        "- Use Algerian vocabulary naturally: 'واش' (what/question), 'كيفاش' (how), 'وين' (where), 'علاش' (why), 'يزي' (enough/ok), 'برك' (enough), 'هاك' (here/take), 'حنايا' (we).\n" +
        "- French loanwords are common and natural: 'لابيل' (beautiful), 'البونجور', 'لكار', etc. Use them where an Algerian naturally would.\n" +
        "- Tamazight/Berber words may appear — leave common ones if they fit, or translate their meaning into natural Algerian Darija.\n" +
        "- Replace idioms and expressions with their natural Algerian equivalents — never translate them literally.\n" +
        "- Preserve the speaker's tone, humor, and energy.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha)."
      );
    case "tunisian_darija":
      return (
        "TARGET: Tunisian Darija — write in Arabic script.\n" +
        "This is colloquial Tunisian Arabic as spoken daily, not MSA. Key points:\n" +
        "- Use Tunisian vocabulary naturally: 'شنوّا' (what), 'كيفاش' (how), 'وين' (where), 'عليش' (why), 'برشا' (a lot), 'باهي' (good/ok), 'توّا' (now), 'مانيش' (I'm not).\n" +
        "- French loanwords are naturally embedded: 'لكار', 'البورطابل', 'فيلو' (son/guy in slang), etc.\n" +
        "- Tunisian speech is fast and elliptical — contractions and dropped words are normal. Reflect that.\n" +
        "- Replace idioms with natural Tunisian equivalents — never translate them literally.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha)."
      );
    case "arabic_egyptian":
      return (
        "TARGET: Egyptian colloquial Arabic (Masri/Aamiyya) as spoken in Cairo — write in Arabic script.\n" +
        "Key vocabulary markers:\n" +
        "- 'إيه' (what), 'مين' (who), 'فين' (where), 'إمتى' (when), 'ليه' (why), 'إزّاي' (how)\n" +
        "- 'عايز/عايزة' (want), 'بيعمل' (he does), 'دلوقتي' (now), 'كده' (like this)\n" +
        "- 'أوي' (very), 'خالص' (at all / completely), 'يعني' (I mean / so)\n" +
        "- Use 'ج' for the Egyptian 'g' sound where appropriate in colloquial spelling.\n" +
        "- Replace idioms and expressions with natural Egyptian equivalents — never translate literally.\n" +
        "- Preserve the speaker's register: Cairo street speech is different from educated/formal Egyptian.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha)."
      );
    case "arabic_levantine":
      return (
        "TARGET: Levantine Arabic (Shami) as spoken in Lebanon and Syria — write in Arabic script.\n" +
        "Key vocabulary markers:\n" +
        "- 'شو' (what), 'مين' (who), 'وين' (where), 'إيمتى' (when), 'ليش' (why), 'كيف' (how)\n" +
        "- 'بدّي' (I want), 'عم يعمل' (he is doing), 'هلّق' (now), 'هيك' (like this)\n" +
        "- 'كتير' (very/a lot), 'منيح' (good), 'لأ' (no), 'يلاّ' (let's go/come on)\n" +
        "- Lebanese and Syrian Shami have some differences — stay close to neutral Levantine if unclear.\n" +
        "- Replace idioms and expressions with natural Shami equivalents — never translate literally.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha)."
      );
    case "arabic_gulf":
      return (
        "TARGET: Gulf Arabic (Khaleeji) as spoken in Saudi Arabia and the UAE — write in Arabic script.\n" +
        "Key vocabulary markers:\n" +
        "- 'وش/ايش' (what), 'مين' (who), 'وين' (where), 'متى' (when), 'ليش' (why), 'كيف' (how)\n" +
        "- 'أبغى/أبي' (I want), 'يسوّي' (he does/makes), 'الحين' (now), 'جذي/جذا' (like this)\n" +
        "- 'زين' (good), 'واجد' (a lot), 'يهال' (kids), 'يالله' (come on/let's go)\n" +
        "- Replace idioms and expressions with natural Khaleeji equivalents — never translate literally.\n" +
        "- NEVER write in Modern Standard Arabic (Fusha) unless the speaker is clearly being formal."
      );
    case "msa":
      return (
        "TARGET: Modern Standard Arabic (Fusha) — write in Arabic script.\n" +
        "Use formal, grammatically correct MSA suitable for subtitles. " +
        "Unlike the dialect instructions, MSA should be clear and formal — avoid colloquialisms. " +
        "Still prioritize natural readability over overly academic phrasing."
      );
    case "zh":
      return "TARGET: Simplified Chinese — use Simplified Chinese characters (Mainland China standard). Write naturally as a native Mainland Chinese speaker would speak.";
    case "zh-TW":
      return "TARGET: Traditional Chinese — use Traditional Chinese characters (Taiwan/Hong Kong standard). Write naturally as a native Traditional Chinese speaker would speak.";
    default: {
      const lang = LANGUAGES.find((l) => l.value === targetLangValue);
      return `TARGET: ${lang?.promptName ?? targetLangValue}. Write as a native speaker would naturally speak — not how a textbook would write it.`;
    }
  }
}
