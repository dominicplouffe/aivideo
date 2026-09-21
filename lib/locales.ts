/**
 * The languages this product can translate into, and their names.
 *
 * A BCP-47 tag and the language it denotes are facts, not measurements, so
 * this list is static and that is correct. What was *not* correct was where
 * these names used to live: inside the `localeMatrix` fixture, where each
 * row also carried a fabricated per-language status — German "published" and
 * reviewed by Jonas Weber, Japanese "rendering, 68%", French "stale" — on
 * every workspace, including ones that had never translated anything. The
 * names are kept; the statuses are gone, because a status is measurement and
 * has to come from the `locales` table.
 *
 * `Intl.DisplayNames` would derive most of these at runtime, but it resolves
 * against the *server's* locale data and returns the tag unchanged for
 * anything it does not know — so a name silently becomes "pt-BR" on one
 * deployment and "Portuguese (Brazil)" on another. Written down, they are
 * the same everywhere.
 */

export interface LocaleOption {
  /** BCP-47 tag, as stored on a project and in the `locales` table. */
  code: string;
  label: string;
}

export const SOURCE_LOCALE = "en-US";

export const LOCALES: LocaleOption[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "de-DE", label: "German" },
  { code: "fr-FR", label: "French" },
  { code: "es-ES", label: "Spanish" },
  { code: "es-419", label: "Spanish (Latin America)" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "it-IT", label: "Italian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "pl-PL", label: "Polish" },
  { code: "sv-SE", label: "Swedish" },
  { code: "da-DK", label: "Danish" },
  { code: "nb-NO", label: "Norwegian" },
  { code: "fi-FI", label: "Finnish" },
  { code: "tr-TR", label: "Turkish" },
  { code: "ru-RU", label: "Russian" },
  { code: "uk-UA", label: "Ukrainian" },
  { code: "cs-CZ", label: "Czech" },
  { code: "ro-RO", label: "Romanian" },
  { code: "el-GR", label: "Greek" },
  { code: "he-IL", label: "Hebrew" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "th-TH", label: "Thai" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "id-ID", label: "Indonesian" },
  { code: "ms-MY", label: "Malay" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "yue-HK", label: "Cantonese" },
];

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

/** The language's name, or the tag itself when it is not one we offer. */
export function localeLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}

export function isSupportedLocale(code: string): boolean {
  return BY_CODE.has(code);
}
