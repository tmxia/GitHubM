import type { ChatSession, ChatSessionMessage, ToolHistoryItem } from './aiTypes';
import type { Message } from './aiTypes';
import i18n from "@/i18n";

export interface PersistMessageInput {
  role: string;
  content: string;
  messageType?: 'plain' | 'memory_summary';
  meta?: Record<string, unknown>;
  full?: unknown;
}

const KEY_SESSIONS = 'ai_local_sessions';
const keyMsgs = (sid: string) => `ai_local_msgs_${sid}`;
const keyTools = (sid: string) => `ai_local_tools_${sid}`;
const keySnaps = (sid: string) => `ai_local_snaps_${sid}`;

const MAX_SESSIONS = 50;
const MAX_MSGS = 1000;
const MAX_TOOLS = 500;
const MAX_SNAPS = 20;

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
  } catch (e) {
    console.error('[aiLocal] 本地存储写入失败（空间不足？）', e);
  }
}

export async function upsertSession(
  session: Omit<ChatSession, 'created_at' | 'updated_at'>
): Promise<string | null> {
  try {
    const sessions = readJson<ChatSession[]>(KEY_SESSIONS, []);
    const now = new Date().toISOString();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], ...session, updated_at: now };
    } else {
      sessions.unshift({
        ...session,
        title: session.title || '',
        created_at: now,
        updated_at: now,
      } as ChatSession);
    }
    sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    writeJson(KEY_SESSIONS, sessions.slice(0, MAX_SESSIONS));
    return session.id;
  } catch (e) {
    console.error(i18n.t('保存会话失败'), e);
    return null;
  }
}

export async function insertMessages(
  sessionId: string,
  msgs: PersistMessageInput[]
): Promise<void> {
  try {
    const rows = readJson<ChatSessionMessage[]>(keyMsgs(sessionId), []);
    const now = new Date().toISOString();
    for (const m of msgs) {
      rows.push({
        id: crypto.randomUUID(),
        session_id: sessionId,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        created_at: now,
        message_type: m.messageType ?? 'plain',
        meta_json: m.meta ? JSON.stringify(m.meta) : null,
      });
    }
    writeJson(keyMsgs(sessionId), rows.slice(-MAX_MSGS));
  } catch (e) {
    console.error(i18n.t('保存消息失败'), e);
  }
}
export async function replaceSessionMessages(
  sessionId: string,
  msgs: PersistMessageInput[]
): Promise<void> {
  try {
    const base = Date.now();
    const rows: ChatSessionMessage[] = msgs.map((m, i) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      created_at: new Date(base + i).toISOString(),
      message_type: m.messageType ?? 'plain',
      meta_json: m.meta ? JSON.stringify(m.meta) : null,
      full_json: m.full ? JSON.stringify(m.full) : null,
    }));
    writeJson(keyMsgs(sessionId), rows.slice(-MAX_MSGS));
  } catch (e) {
    console.error(i18n.t('保存消息失败'), e);
  }
}

export async function fetchSessions(login: string): Promise<ChatSession[]> {
  const sessions = readJson<ChatSession[]>(KEY_SESSIONS, []);
  return sessions
    .filter(s => s.github_login === login)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 50);
}

export async function fetchSessionMessages(sessionId: string): Promise<ChatSessionMessage[]> {
  const rows = readJson<ChatSessionMessage[]>(keyMsgs(sessionId), []);
  return rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(r => ({
      id: r.id,
      session_id: r.session_id,
      role: r.role,
      content: r.content,
      created_at: r.created_at,
      message_type: r.message_type,
      meta_json: r.meta_json ?? null,
      full_json: r.full_json ?? null,
    }));
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const sessions = readJson<ChatSession[]>(KEY_SESSIONS, []).filter(s => s.id !== sessionId);
    writeJson(KEY_SESSIONS, sessions);
    localStorage.removeItem(keyMsgs(sessionId));
    localStorage.removeItem(keyTools(sessionId));
    localStorage.removeItem(keySnaps(sessionId));
  } catch {}
}

export interface LocalToolLogRow {
  id: string;
  session_id: string;
  turn_id: string;
  tool_name: string;
  label: string | null;
  hint: string | null;
  status: string;
  elapsed_ms: number | null;
  result_json: string | null;
  started_at: string;
}

export async function insertToolExecutionLogs(
  sessionId: string,
  turnId: string,
  items: ToolHistoryItem[],
  userId?: string | null,
): Promise<void> {
  if (items.length === 0) return;
  try {
    const rows = readJson<LocalToolLogRow[]>(keyTools(sessionId), []);
    const newRows: LocalToolLogRow[] = items.map(t => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      turn_id: turnId,
      tool_name: t.tool,
      label: t.label ?? null,
      hint: t.hint ?? null,
      status: t.status === 'fail' ? 'error' : t.status === 'running' ? 'running' : 'success',
      elapsed_ms: t.elapsedMs ?? null,
      result_json: t.result ? t.result.slice(0, 4000) : null,
      started_at: new Date(t.startedAt).toISOString(),
    }));
    writeJson(keyTools(sessionId), [...rows, ...newRows].slice(-MAX_TOOLS));
    void userId;
  } catch (e) {
    console.error(i18n.t('[aiSupabase] 工具日志保存失败'), e);
  }
}

export async function fetchToolExecutionLogs(
  sessionId: string,
): Promise<Array<{
  id: string; session_id: string; turn_id: string; tool_name: string;
  label: string | null; hint: string | null; status: string;
  elapsed_ms: number | null; result_json: string | null; started_at: string;
}>> {
  const rows = readJson<LocalToolLogRow[]>(keyTools(sessionId), []);
  return rows.sort((a, b) => a.started_at.localeCompare(b.started_at)).slice(-500);
}

interface LocalSnapshotRow {
  turn_id: string;
  messages_json: string;
  tool_history_json: string;
  created_at: string;
}

export async function upsertWorkflowSnapshot(
  sessionId: string,
  turnId: string,
  messages: Message[],
  toolHistory: ToolHistoryItem[],
  userId?: string | null,
): Promise<void> {
  try {
    const rows = readJson<LocalSnapshotRow[]>(keySnaps(sessionId), []);
    const idx = rows.findIndex(r => r.turn_id === turnId);
    const row: LocalSnapshotRow = {
      turn_id: turnId,
      messages_json: JSON.stringify(messages),
      tool_history_json: JSON.stringify(toolHistory),
      created_at: new Date().toISOString(),
    };
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    writeJson(keySnaps(sessionId), rows.slice(-MAX_SNAPS));
    void userId;
  } catch (e) {
    console.error(i18n.t('[aiSupabase] workflow 快照保存失败'), e);
  }
}

export async function fetchLatestSnapshot(
  sessionId: string,
): Promise<{ messages: Message[]; toolHistory: ToolHistoryItem[] } | null> {
  const rows = readJson<LocalSnapshotRow[]>(keySnaps(sessionId), []);
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = rows[0];
  try {
    return {
      messages: JSON.parse(latest.messages_json) as Message[],
      toolHistory: JSON.parse(latest.tool_history_json) as ToolHistoryItem[],
    };
  } catch {
    return null;
  }
}
