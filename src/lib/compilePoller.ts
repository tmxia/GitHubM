import { getWorkflowRunFresh } from '@/services/github';

const PENDING_KEY = 'gm_pending_compiles';
const INTERVAL = 30000;

export interface PendingCompile {
  owner: string;
  repo: string;
  runId: number;
  wfName: string;
  runNumber: number;
  registeredAt: number;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function loadPending(): PendingCompile[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingCompile[]) : [];
  } catch {
    return [];
  }
}

function savePending(list: PendingCompile[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {}
}

function isEnabled(): boolean {
  try {
    return localStorage.getItem('notify_compile_done') !== 'false';
  } catch {
    return true;
  }
}


const NOTIFIED_KEY = 'gm_notified_runs';
const MAX_NOTIFIED = 200;

function loadNotified(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function appendNotified(key: string) {
  const list = loadNotified();
  if (list.includes(key)) return;
  list.push(key);
  if (list.length > MAX_NOTIFIED) list.splice(0, list.length - MAX_NOTIFIED);
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function getNotifiedKeys(): string[] {
  return loadNotified();
}

export function registerCompileWatch(item: Omit<PendingCompile, 'registeredAt'>) {
  if (!isEnabled()) return;
  const list = loadPending();
  const exists = list.some(
    (x) => x.owner === item.owner && x.repo === item.repo && x.runId === item.runId,
  );
  if (!exists) {
    list.push({ ...item, registeredAt: Date.now() });
    savePending(list);
  }
  startPolling();
  
  syncToWorkManager();
}


export function syncToWorkManager() {
  try {
    const bridge = (window as unknown as {
      AndroidBridge?: { syncMonitorConfig?: (json: string) => void };
    }).AndroidBridge;
    if (!bridge?.syncMonitorConfig) return;

    let token = '';
    try { token = localStorage.getItem('github_manager_token') || ''; } catch { /* ignore */ }
    if (!token) return;

    const pending = loadPending();

    let notifyEnabled = true;
    try { notifyEnabled = localStorage.getItem('notify_compile_done') !== 'false'; } catch { /* ignore */ }

    
    
    const repos = pending.map((p) => ({
      fullName: `${p.owner}/${p.repo}`,
      workflowId: p.runId,  // 占位：WorkManager 会按 workflow 查 latest run，此处不太精确
      workflowName: p.wfName,
    }));

    let lastStatus: Record<string, string> = {};
    try {
      const raw = localStorage.getItem('gm_monitor_last_status');
      if (raw) lastStatus = JSON.parse(raw);
    } catch { /* ignore */ }

    
    const notifiedRuns = loadNotified();

    bridge.syncMonitorConfig(JSON.stringify({ notifyEnabled, token, repos, lastStatus, notifiedRuns }));
  } catch { /* ignore */ }
}

export function startPolling() {
  if (running) return;
  if (loadPending().length === 0) return;
  running = true;
  void loop();
}

export function stopPolling() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  running = false;
}

export function clearPending() {
  savePending([]);
  stopPolling();
}

async function loop() {
  if (!isEnabled()) {
    savePending([]);
    running = false;
    return;
  }

  const list = loadPending();
  if (list.length === 0) {
    running = false;
    return;
  }

  const bridge = (window as unknown as {
    AndroidBridge?: {
      notifyCompileDone?: (key: string, t: string, b: string, u: string) => void;
    };
  }).AndroidBridge;

  const remaining: PendingCompile[] = [];

  for (const item of list) {
    try {
      const run = await getWorkflowRunFresh(item.owner, item.repo, item.runId);
      if (run.status !== 'completed') {
        remaining.push(item);
        continue;
      }

      const notifKey = `${item.owner}/${item.repo}@${item.runId}`;
      const alreadyNotified = loadNotified().includes(notifKey);
      if (!alreadyNotified) {
        const ok = run.conclusion === 'success';
        const title = `${ok ? '✅' : '❌'} ${item.wfName} 编译${ok ? '成功' : '失败'}`;
        const body = `${item.owner}/${item.repo} #${item.runNumber}` + (ok ? '，点击查看' : '，点击排查');
        const deepLink = `githubmanager://repos/${item.owner}/${item.repo}/actions`;
  
        if (bridge?.notifyCompileDone) {
          bridge.notifyCompileDone(notifKey, title, body, deepLink);
        }
        
        appendNotified(`${item.owner}/${item.repo}@${item.runId}`);
      }
      
      try {
        window.dispatchEvent(new CustomEvent('compile-board-refresh'));
      } catch { /* ignore */ }
    } catch {
      remaining.push(item);
    }
  }

  savePending(remaining);

  if (remaining.length === 0) {
    running = false;
    return;
  }

  timer = setTimeout(loop, INTERVAL);
}
