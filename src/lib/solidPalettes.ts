import type { AccentConfig } from '@/contexts/ThemeContext';

/**
 * 旧版预设强调色板（纯色 / Solid）。
 *
 * 这批是 #107 莫奈体系之前随应用一起提供的 16 套预设纯色，与莫奈「同族双色渐变」
 * 板并存：点击纯色板即写入单色配置（不带第二色），清空渐变角度与第二色。
 * 色值取旧版各板的预览色（previewColor），即用户当年在设置页看到的纯色。
 */
export interface SolidPalette {
  /** 稳定 id，用于 i18n 键与选中态判断 */
  id: string;
  /** 纯色 hex */
  color: string;
}

/** 16 套预设纯色，覆盖主要色相分支 */
export const SOLID_PALETTES: SolidPalette[] = [
  { id: 'purple', color: '#7c3aed' },
  { id: 'blue', color: '#1d6be3' },
  { id: 'green', color: '#16a34a' },
  { id: 'orange', color: '#f97316' },
  { id: 'rose', color: '#e11d48' },
  { id: 'cyan', color: '#0891b2' },
  { id: 'indigo', color: '#4f46e5' },
  { id: 'sky', color: '#0ea5e9' },
  { id: 'emerald', color: '#059669' },
  { id: 'teal', color: '#0d9488' },
  { id: 'amber', color: '#d97706' },
  { id: 'pink', color: '#ec4899' },
  { id: 'violet', color: '#8b5cf6' },
  { id: 'gold', color: '#ca8a04' },
  { id: 'coral', color: '#f0572a' },
  { id: 'lime', color: '#65a30d' },
];

/** 纯色板 → 可直接传给 setAccent 的单色配置（不带 color2 / angle） */
export function toSolidConfig(p: SolidPalette): AccentConfig {
  return { color: p.color };
}

/**
 * 判断当前强调色是否正好等于某个纯色板：必须是单色（无第二色）且主色归一化相等。
 * 大小写不敏感，允许 `#RRGGBB` 与 `#rrggbb` 互通。
 */
export function isSolidActive(
  palette: SolidPalette,
  current: { color: string; color2?: string },
): boolean {
  const norm = (v?: string) => (v ? v.trim().toLowerCase() : '');
  return !current.color2 && norm(palette.color) === norm(current.color);
}
