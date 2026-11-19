
import type { ModelConfig } from '@/components/ai/aiTypes';
import type { UiAttachment } from './attachments';

export interface RepoContext {
  fullName: string;
  defaultBranch: string;
  branch?: string;
}

export interface V2ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface V2ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type V2ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface V2ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | V2ContentPart[] | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

export interface ProviderStreamResult {
  content: string;
  reasoning: string;
  toolCalls: V2ToolCall[];
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ToolRunResult {
  ok: boolean;
  content: string;
  artifact?: ArtifactMeta;
}

export interface ArtifactMeta {
  id: string;
  title: string;
  mime: string;
  size: number;
  createdAt: string;
  runId?: string;
  toolName?: string;
  preview: string;
}

export interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  risk: AgentTool['risk'];
}

export interface CapabilityInfo {
  id: string;
  label: string;
  description: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: 'read' | 'write' | 'dangerous';
  execute: (args: Record<string, unknown>, ctx: ToolRuntimeContext) => Promise<ToolRunResult>;
}

export interface ToolRuntimeContext {
  token: string;
  userLogin?: string;
  repo?: RepoContext;
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: 'run_start'; runId: string; capabilities?: string[]; skills?: string[]; memories?: string[] }
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_start'; call: V2ToolCall }
  | { type: 'tool_end'; call: V2ToolCall; ok: boolean; content: string; artifact?: ArtifactMeta }
  | { type: 'usage'; usage: NonNullable<ProviderStreamResult['usage']> }
  | { type: 'done'; text: string; steps: number }
  | { type: 'error'; message: string };

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunAgentOptions {
  token: string;
  userLogin?: string;
  runId?: string;
  repo?: RepoContext;
  config: ModelConfig;
  history: AgentHistoryMessage[];
  contextBudget?: number;
  memoryEnabled?: boolean;

  currentUserContent?: V2ProviderMessage['content'];
  currentUserText?: string;

  persona?: string;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;

  requestApproval?: (request: ApprovalRequest) => Promise<boolean>;

  onSnapshot?: (snapshot: { messages: V2ProviderMessage[]; steps: number }) => void;

  resumeMessages?: V2ProviderMessage[];
  resumeSteps?: number;

  callModel?: (
    config: ModelConfig,
    messages: V2ProviderMessage[],
    tools: V2ToolDefinition[],
    signal: AbortSignal,
    onEvent: (event: AgentEvent) => void,
  ) => Promise<ProviderStreamResult>;

  tools?: AgentTool[];
  maxSteps?: number;
}

export interface UiToolRun {
  id: string;
  name: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  content?: string;
  artifact?: ArtifactMeta;
  startedAt?: number;
  endedAt?: number;
}

export interface UiAssistantBlock {
  id: string;
  type: 'text' | 'reasoning' | 'tool';
  text?: string;
  toolId?: string;
}

export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;

  modelContent?: string | V2ContentPart[];
  attachments?: UiAttachment[];
  reasoning?: string;
  tools?: UiToolRun[];

  blocks?: UiAssistantBlock[];
  streaming?: boolean;
  error?: boolean;
  metrics?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    durationMs?: number;
    firstTokenMs?: number;
    model?: string;
  };
  createdAt: string;
}
