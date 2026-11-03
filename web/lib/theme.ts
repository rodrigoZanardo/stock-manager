export type Theme = 'system' | 'light' | 'dark';
export const THEME_COOKIE = 'theme';
export const THEMES: Theme[] = ['system', 'light', 'dark'];
export const isTheme = (v: string | undefined): v is Theme => THEMES.some((t) => t === v);
