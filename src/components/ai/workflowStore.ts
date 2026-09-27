
export interface LocalWorkflowRow {
  id: string;
  user_id: string;
  repo: string;
  task_summary: string;
  status: 'running' | 'done' | 'partial_fail';
  total_steps: number;
  done_steps: number;
  fail_steps: number;
  created_at: string;
  finished_at: string | null;
  interrupted: boolean;
}

export interface LocalWorkflowStepRow {
  id: string;
  workflow_id: string;
  step_id: string;
  seq: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error';
  retry_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

const KEY_WORKFLOWS = 'ai_local_workflows';
const keySteps = (wfId: string) => `ai_local_wf_steps_${wfId}`;

const MAX_WORKFLOWS = 100; // 同旧版 limit 100

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 空间不足时静默失败 */ }
}

export async function saveWorkflow(
  wf: Omit<LocalWorkflowRow, 'created_at'> & { created_at?: string },
): Promise<string> {
  const rows = readJson<LocalWorkflowRow[]>(KEY_WORKFLOWS, []);
  const now = new Date().toISOString();
  const idx = rows.findIndex(r => r.id === wf.id);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...wf, created_at: rows[idx].created_at };
  } else {
    rows.unshift({ ...wf, created_at: wf.created_at ?? now } as LocalWorkflowRow);
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  writeJson(KEY_WORKFLOWS, rows.slice(0, MAX_WORKFLOWS));
  return wf.id;
}

export async function listWorkflows(userId: string): Promise<LocalWorkflowRow[]> {
  const rows = readJson<LocalWorkflowRow[]>(KEY_WORKFLOWS, []);
  return rows.filter(w => w.user_id === userId);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const rows = readJson<LocalWorkflowRow[]>(KEY_WORKFLOWS, []).filter(w => w.id !== id);
  writeJson(KEY_WORKFLOWS, rows);
  localStorage.removeItem(keySteps(id));
}

export async function saveWorkflowSteps(
  workflowId: string,
  steps: Array<Omit<LocalWorkflowStepRow, 'id' | 'workflow_id' | 'created_at'> & { id?: string; created_at?: string }>,
): Promise<void> {
  const rows = readJson<LocalWorkflowStepRow[]>(keySteps(workflowId), []);
  const now = new Date().toISOString();
  for (const s of steps) {
    const idx = rows.findIndex(r => r.id === s.id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...s };
    } else {
      rows.push({
        ...s,
        id: s.id ?? crypto.randomUUID(),
        workflow_id: workflowId,
        created_at: s.created_at ?? now,
      } as LocalWorkflowStepRow);
    }
  }
  rows.sort((a, b) => a.seq - b.seq);
  writeJson(keySteps(workflowId), rows);
}

export async function listWorkflowSteps(workflowId: string): Promise<LocalWorkflowStepRow[]> {
  const rows = readJson<LocalWorkflowStepRow[]>(keySteps(workflowId), []);
  return rows.sort((a, b) => a.seq - b.seq);
}

export async function clearAllWorkflows(userId: string): Promise<void> {
  const rows = readJson<LocalWorkflowRow[]>(KEY_WORKFLOWS, []);
  const targets = rows.filter(w => w.user_id === userId);
  for (const t of targets) localStorage.removeItem(keySteps(t.id));
  writeJson(KEY_WORKFLOWS, rows.filter(w => w.user_id !== userId));
}