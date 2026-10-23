
const PREFIX = 'feature_flag_';

export const FEATURE_FLAGS = {
  compileBoard: 'compile_board',
  fileTime: 'file_time',
  sortIncludeDirs: 'sort_include_dirs',
  showFileSize: 'show_file_size',
  dashboardStats: 'dashboard_stats',
  dashboardPinned: 'dashboard_pinned',
  dashboardRecentRepos: 'dashboard_recent_repos',
  dashboardFeed: 'dashboard_feed',
  dashboardRecentActivity: 'dashboard_recent_activity',
  dashboardHeatmap: 'dashboard_heatmap',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export function getFeatureFlag(key: FeatureFlagKey, defaultValue = true): boolean {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === null) return defaultValue;
    return v === 'true';
  } catch {
    return defaultValue;
  }
}

export function setFeatureFlag(key: FeatureFlagKey, value: boolean): void {
  try {
    localStorage.setItem(PREFIX + key, value ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('feature-flags-changed', { detail: { key, value } }));
  } catch {}
}

export function subscribeFeatureFlags(cb: () => void): () => void {
  window.addEventListener('feature-flags-changed', cb);
  return () => window.removeEventListener('feature-flags-changed', cb);
}


const BOARD_MODE_KEY = 'compile_board_mode';
const BOARD_SMART_COUNT_KEY = 'compile_board_smart_count';
const BOARD_CUSTOM_REPOS_KEY = 'compile_board_custom_repos';

export type CompileBoardMode = 'smart' | 'custom';

export function getCompileBoardMode(): CompileBoardMode {
  try {
    const v = localStorage.getItem(BOARD_MODE_KEY);
    if (v === 'custom' || v === 'smart') return v;
  } catch { /* ignore */ }
  return 'smart';
}

export function setCompileBoardMode(mode: CompileBoardMode): void {
  try {
    localStorage.setItem(BOARD_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent('compile-board-config-changed'));
  } catch { /* ignore */ }
}

export function getCompileBoardSmartCount(): number {
  try {
    const v = parseInt(localStorage.getItem(BOARD_SMART_COUNT_KEY) || '6', 10);
    if (Number.isFinite(v) && v > 0 && v <= 50) return v;
  } catch { /* ignore */ }
  return 6;
}

export function setCompileBoardSmartCount(count: number): void {
  try {
    const n = Math.max(1, Math.min(50, count));
    localStorage.setItem(BOARD_SMART_COUNT_KEY, String(n));
    window.dispatchEvent(new CustomEvent('compile-board-config-changed'));
  } catch { /* ignore */ }
}

export function getCompileBoardCustomRepos(): string[] {
  try {
    const raw = localStorage.getItem(BOARD_CUSTOM_REPOS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
  } catch { /* ignore */ }
  return [];
}

export function setCompileBoardCustomRepos(repos: string[]): void {
  try {
    localStorage.setItem(BOARD_CUSTOM_REPOS_KEY, JSON.stringify(repos));
    window.dispatchEvent(new CustomEvent('compile-board-config-changed'));
  } catch { /* ignore */ }
}


export function subscribeCompileBoardConfig(cb: () => void): () => void {
  window.addEventListener('compile-board-config-changed', cb);
  return () => window.removeEventListener('compile-board-config-changed', cb);
}


const BOARD_CUSTOM_WORKFLOWS_KEY = 'compile_board_custom_workflows';

export interface MonitoredWorkflow {
  repoFullName: string;  
  workflowId: number;
  workflowName: string;  
  workflowPath: string;  
}

export function getCompileBoardCustomWorkflows(): MonitoredWorkflow[] {
  try {
    const raw = localStorage.getItem(BOARD_CUSTOM_WORKFLOWS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.filter(
        (x): x is MonitoredWorkflow =>
          x &&
          typeof x.repoFullName === 'string' &&
          typeof x.workflowId === 'number' &&
          typeof x.workflowName === 'string',
      );
    }
  } catch { /* ignore */ }
  return [];
}

export function setCompileBoardCustomWorkflows(list: MonitoredWorkflow[]): void {
  try {
    localStorage.setItem(BOARD_CUSTOM_WORKFLOWS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('compile-board-config-changed'));
  } catch { /* ignore */ }
}


export type DashboardCardId = 'stats' | 'compileBoard' | 'pinned' | 'feed' | 'recentRepos' | 'recentActivity' | 'heatmap';
const DASHBOARD_ORDER_KEY = 'dashboard_cards_order';

export function getDashboardCardOrder(): DashboardCardId[] {
  const def: DashboardCardId[] = ['stats', 'compileBoard', 'pinned', 'feed', 'recentRepos', 'recentActivity', 'heatmap'];
  try {
    const raw = localStorage.getItem(DASHBOARD_ORDER_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const merged = [...arr];
        def.forEach(d => { if (!merged.includes(d)) merged.push(d); });
        return merged as DashboardCardId[];
      }
    }
  } catch {}
  return def;
}

export function setDashboardCardOrder(order: DashboardCardId[]): void {
  try {
    localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(order));
    window.dispatchEvent(new CustomEvent('dashboard-order-changed'));
  } catch {}
}


const REPO_LIMIT_KEY = 'dashboard_repo_limit';
const ACTIVITY_LIMIT_KEY = 'dashboard_activity_limit';

export function getDashboardRepoLimit(): number {
  const v = parseInt(localStorage.getItem(REPO_LIMIT_KEY) || '5', 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 50) : 5;
}

export function setDashboardRepoLimit(n: number): void {
  localStorage.setItem(REPO_LIMIT_KEY, String(Math.max(1, Math.min(50, n))));
  window.dispatchEvent(new Event('dashboard-limits-changed'));
}

export function getDashboardActivityLimit(): number {
  const v = parseInt(localStorage.getItem(ACTIVITY_LIMIT_KEY) || '5', 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 50) : 5;
}

export function setDashboardActivityLimit(n: number): void {
  localStorage.setItem(ACTIVITY_LIMIT_KEY, String(Math.max(1, Math.min(50, n))));
  window.dispatchEvent(new Event('dashboard-limits-changed'));
}


const COLOR_PALETTE_COLLAPSED_KEY = 'color_palette_collapsed';

export function getColorPaletteCollapsed(): boolean {
  return localStorage.getItem(COLOR_PALETTE_COLLAPSED_KEY) === 'true';
}

export function setColorPaletteCollapsed(collapsed: boolean): void {
  localStorage.setItem(COLOR_PALETTE_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}


const NOTIFICATION_COLLAPSED_KEY = 'notification_collapsed';
export function getNotificationCollapsed(): boolean {
  return localStorage.getItem(NOTIFICATION_COLLAPSED_KEY) === 'true';
}
export function setNotificationCollapsed(collapsed: boolean): void {
  localStorage.setItem(NOTIFICATION_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}

const FEATURES_COLLAPSED_KEY = 'features_collapsed';
export function getFeaturesCollapsed(): boolean {
  return localStorage.getItem(FEATURES_COLLAPSED_KEY) === 'true';
}
export function setFeaturesCollapsed(collapsed: boolean): void {
  localStorage.setItem(FEATURES_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}

const MISC_COLLAPSED_KEY = 'misc_collapsed';
export function getMiscCollapsed(): boolean {
  return localStorage.getItem(MISC_COLLAPSED_KEY) === 'true';
}
export function setMiscCollapsed(collapsed: boolean): void {
  localStorage.setItem(MISC_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}

const FEED_LIMIT_KEY = 'dashboard_feed_limit';

export function getDashboardFeedLimit(): number {
  const v = parseInt(localStorage.getItem(FEED_LIMIT_KEY) || '5', 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 50) : 5;
}

export function setDashboardFeedLimit(n: number): void {
  localStorage.setItem(FEED_LIMIT_KEY, String(Math.max(1, Math.min(30, n))));
  window.dispatchEvent(new Event('dashboard-limits-changed'));
}
