
export type ModelType = 'wenxin' | 'deepseek' | 'gemini' | 'qwen' | 'openai' | 'custom';

export interface ChatSession {
  id: string;
  github_login: string;
  repo_full_name: string;
  branch: string;
  title: string;
  model_type: string;
  model_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  message_type?: 'plain' | 'memory_summary';
  meta_json?: string | null;
  full_json?: string | null;
}

export interface InlineTool {
  id: string;
  tool: string;
  label: string;
  hint: string;
  status: 'queued' | 'running' | 'success' | 'fail' | 'blocked';
  elapsedMs?: number;
  result?: string;
}

export interface InlineStep {
  id: string;
  title: string;
  desc: string;
  status: 'pending' | 'running' | 'done' | 'error';
  retryCount?: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'text' | 'binary';
  mimeType: string;
  content: string;
  size: number;
}

export interface FileRequest {
  id: string;
  filename: string;
  description: string;
  mime_types?: string;
  fulfilled?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  messageType?: 'plain' | 'memory_summary';
  meta?: Record<string, unknown>;
  thinkingContent?: string;
  thinkingDone?: boolean;
  inlinePlan?: InlineStep[];
  inlineTools?: InlineTool[];
  attachments?: Attachment[];
  fileRequests?: FileRequest[];
  bubbleType?: 'step' | 'answer' | 'thinking' | 'tool';
  stepTitle?: string;
  stepId?: string;
  toolCallId?: string;
  toolName?: string;
  toolLabel?: string;
  toolHint?: string;
  toolStatus?: 'queued' | 'running' | 'success' | 'fail' | 'blocked';
  toolElapsedMs?: number;
  toolResult?: string;
}

export interface ToolHistoryItem {
  id: string;
  tool: string;
  label: string;
  hint: string;
  status: 'queued' | 'running' | 'success' | 'fail' | 'blocked';
  startedAt: number;
  elapsedMs?: number;
  result?: string;
}

export interface TaskPlanStep {
  id: string;
  title: string;
  desc: string;
}

export interface SSEEnvelope {
  stream_id?: string;
  turn_id?: string;
  seq?: number;
  timestamp?: number;
}

export type SSEChunk = SSEEnvelope & (
  | { type: 'content'; content: string }
  | { type: 'think_start' }
  | { type: 'think_chunk'; content: string }
  | { type: 'think_end' }
  | { type: 'tool_queued'; id: string; tool: string; label: string; hint: string }
  | { type: 'tool_start'; id: string; tool: string; label: string; hint: string }
  | { type: 'tool_end'; id: string; status: 'success' | 'fail'; result?: string; elapsedMs: number }
  | { type: 'plan'; steps: TaskPlanStep[] }
  | { type: 'step_start'; stepId: string }
  | { type: 'step_end'; stepId: string; status: 'done' | 'error' }
  | { type: 'step_retry'; stepId: string; retryCount: number }
  | { type: 'heartbeat' }
  | { type: 'status_info'; message: string }
  | { type: 'status_warning'; message: string }
  | { type: 'file_request'; id: string; filename: string; description: string; mime_types?: string }
  | { type: 'timeout'; workflow_id?: string }
  | { type: 'usage'; prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string; providerType: string }
  | { type: 'tool_issue_reported'; tool_name: string; severity: string; proposal_id: string | null }
  | { type: 'tool_fix_proposed'; tool_name: string; proposal_id: string | null }
  | { type: 'done'; total_seq?: number }
  | { type: 'error'; code: string; message: string }
);

export interface ModelConfig {
  type: ModelType;
  api_key?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

export interface StreamMetrics {
  ttft?: number;
  throughput?: number;
  startedAt: number;
  firstTokenAt?: number;
  finishedAt?: number;
  interruptReason?: 'user_stop' | 'network_error' | 'idle_timeout' | 'server_error' | 'completed';
  totalSeq?: number;
  streamId?: string;
}