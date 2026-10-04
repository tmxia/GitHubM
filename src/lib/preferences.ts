
const PREFIX = 'feature_flag_';

export const FEATURE_FLAGS = {
  compileBoard: 'compile_board',
  fileTime: 'file_time',
  sortIncludeDirs: 'sort_include_dirs',
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
