// i18n 词条补充模块
//
// ── 为什么单独一个文件 ──────────────────────────────────────
// src/i18n.ts 是单文件内联资源（en + zh），体积约 146KB（约 10 万字符）。
// 新增文案时整体重写该文件风险极高（容易丢词条 / 破坏嵌套结构），
// 因此后续新增的词条统一登记在这里，通过 addResourceBundle 合并进去：
//   addResourceBundle(lng, ns, bundle, deep = true, overwrite = false)
// overwrite = false 表示「只补缺失的 key」，i18n.ts 里已有的翻译保持原样，
// 所以这里的条目可以放心地和老词条重名。
//
// 语言代码不硬编码，从 i18n.options.resources / i18n.languages 运行时读取，
// 以后 i18n.ts 里增删语言也不需要改本文件。
//
// 注意：必须由 main.tsx 在首屏渲染前 import，否则首屏会显示中文 key 原文。

import i18n from '@/i18n';

/** [中文 key, 英文翻译] —— key 本身就是中文文案，所以 zh 侧直接用 key 原文 */
const EXTRA: ReadonlyArray<readonly [string, string]> = [
  // 提交详情页（CommitDetailPage）
  ['该文件差异过大，请在 GitHub 查看', 'This diff is too large to display. Please view it on GitHub'],
  ['缺少必要的提交参数', 'Missing required commit parameters'],
  ['加载提交详情失败', 'Failed to load commit details'],
  ['提交不存在', 'Commit not found'],
  ['未知作者', 'Unknown author'],
  ['提交历史', 'Commit history'],
  ['个文件', 'files'],
  ['暂无文件差异', 'No file changes'],
  // 复制 SHA 交互
  ['点击复制提交 SHA', 'Copy commit SHA'],
  ['已复制 SHA', 'Commit SHA copied'],
  ['已复制', 'Copied'],
  ['复制失败', 'Copy failed'],
];

const EN: Record<string, string> = Object.fromEntries(EXTRA);
const ZH: Record<string, string> = Object.fromEntries(EXTRA.map(([zh]) => [zh, zh]));

function resourceLanguages(): string[] {
  const langs = new Set<string>();

  const resources = (i18n.options?.resources ?? {}) as Record<string, unknown>;
  for (const lng of Object.keys(resources)) {
    const value = resources[lng];
    if (value && typeof value === 'object') langs.add(lng);
  }

  for (const lng of i18n.languages ?? []) {
    if (lng) langs.add(lng);
  }
  if (i18n.language) langs.add(i18n.language);

  // 兜底：理论上不会走到，避免 i18n 配置变动导致本文件静默失效
  if (langs.size === 0) {
    langs.add('zh');
    langs.add('en');
  }

  return [...langs].filter(Boolean);
}

for (const lng of resourceLanguages()) {
  const bundle = /^en\b/i.test(lng) ? EN : ZH;
  i18n.addResourceBundle(lng, 'translation', bundle, true, false);
}

export {};
