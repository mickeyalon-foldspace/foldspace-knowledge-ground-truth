const RTL_LANGUAGES = new Set(["he", "ar", "fa", "ur", "yi", "ps", "sd"]);

export function isRtlLanguage(lang: string): boolean {
  return RTL_LANGUAGES.has(lang.toLowerCase().split("-")[0]);
}

export function getTextDir(lang: string): "rtl" | "ltr" {
  return isRtlLanguage(lang) ? "rtl" : "ltr";
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  he: "Hebrew",
  ar: "Arabic",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  fa: "Persian",
  ur: "Urdu",
  tr: "Turkish",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}
