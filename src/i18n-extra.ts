

import i18n from '@/i18n';

const EXTRA: ReadonlyArray<readonly [string, string]> = [

  ['该文件差异过大，请在 GitHub 查看', 'This diff is too large to display. Please view it on GitHub'],
  ['缺少必要的提交参数', 'Missing required commit parameters'],
  ['加载提交详情失败', 'Failed to load commit details'],
  ['提交不存在', 'Commit not found'],
  ['未知作者', 'Unknown author'],
  ['提交历史', 'Commit history'],
  ['个文件', 'files'],
  ['暂无文件差异', 'No file changes'],

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
