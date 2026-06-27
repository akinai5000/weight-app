/** アプリのアクセント（設定で選択可能）。タグの意味色とは別。 */
export const THEME_COLOR_SKY = '#BAE1FF';
export const THEME_COLOR_BLUE = '#007AFF';
export const THEME_COLOR_RED = '#FF3B30';
export const THEME_COLOR_GREEN = '#34C759';

export const THEME_COLOR_OPTIONS = [
  THEME_COLOR_SKY,
  THEME_COLOR_BLUE,
  THEME_COLOR_RED,
  THEME_COLOR_GREEN,
] as const;

export type ThemeColorOption = (typeof THEME_COLOR_OPTIONS)[number];

export const DEFAULT_THEME_COLOR: ThemeColorOption = THEME_COLOR_SKY;

/** ボタン・選択タグなど水色サーフェス上の配色 */
export const ACCENT_SURFACE_BG = THEME_COLOR_SKY;
/** ボタン・選択タグの文字色（下部タブの非アクティブ色と同色） */
export const ACCENT_SURFACE_TEXT = '#636366';

export const accentButtonContainerStyle = {
  backgroundColor: ACCENT_SURFACE_BG,
} as const;

export const accentButtonTextStyle = {
  color: ACCENT_SURFACE_TEXT,
  fontWeight: 'bold' as const,
};

export const accentSurfaceTextStyle = accentButtonTextStyle;

export function normalizeThemeHex(value: string): string | null {
  const t = value.trim();
  if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(t)) return null;
  if (t.length === 4) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return (`#${r}${r}${g}${g}${b}${b}` as string).toUpperCase();
  }
  return t.toUpperCase();
}

export function isPresetThemeColor(value: string): boolean {
  const n = normalizeThemeHex(value);
  return (
    n !== null &&
    THEME_COLOR_OPTIONS.some((opt) => opt.toUpperCase() === n)
  );
}
