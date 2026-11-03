export const LOCALES = ['en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (v: string | undefined): v is Locale => LOCALES.some((l) => l === v);
