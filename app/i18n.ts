export type Language = "en" | "zh";

export type LocalizedText = Readonly<Record<Language, string>>;

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: Language;
  label: LocalizedText;
}> = [
  { value: "en", label: { en: "English", zh: "English" } },
  { value: "zh", label: { en: "中文", zh: "中文" } },
];

export const COMMON_COPY = {
  selectOne: { en: "Select one", zh: "请选择" },
  yes: { en: "Yes", zh: "是" },
  no: { en: "No", zh: "否" },
  preferNotToAnswer: { en: "Prefer not to answer", zh: "不愿回答" },
  phone: { en: "Phone", zh: "手机" },
  tablet: { en: "Tablet", zh: "平板电脑" },
  computer: { en: "Computer", zh: "电脑" },
} satisfies Record<string, LocalizedText>;

export function localize(language: Language, copy: LocalizedText) {
  return copy[language];
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh";
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}
