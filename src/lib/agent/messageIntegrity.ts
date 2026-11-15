

export interface ToolCallLike {
  id: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface MessageLike {
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content?: unknown;
  tool_calls?: ToolCallLike[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface CompressionOptions {

  maxMessages?: number;

  headCount?: number;

  tailCount?: number;

  summaryText?: string;
}

export interface CompressionResult<T extends MessageLike> {
  messages: T[];
  omitted: number;
  compressed: boolean;
}

function toolCallIds(msg: MessageLike): string[] {
  return (msg.tool_calls ?? []).map((tc) => tc.id).filter(Boolean);
}

export function validateToolCallPairs(messages: MessageLike[]): string[] {
  const problems: string[] = [];
  const seenCallIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const ids = toolCallIds(msg);
      if (ids.length !== msg.tool_calls.length) {
        problems.push(`assistant 消息 #${i} 存在缺少 id 的 tool_call`);
      }
      for (const id of ids) {
        if (seenCallIds.has(id)) problems.push(`tool_call id 重复：${id}`);
        seenCallIds.add(id);
      }

      let cursor = i + 1;
      for (const id of ids) {
        const reply = messages[cursor];
        if (!reply || reply.role !== 'tool' || reply.tool_call_id !== id) {
          problems.push(`assistant 消息 #${i} 的 tool_call ${id} 缺少紧邻的 tool 回复`);
          break;
        }
        cursor++;
      }
    }

    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        problems.push(`tool 消息 #${i} 缺少 tool_call_id`);
        continue;
      }

      let j = i - 1;
      while (j >= 0 && messages[j].role === 'tool') j--;
      const owner = j >= 0 ? messages[j] : undefined;
      const ok =
        owner?.role === 'assistant' &&
        Array.isArray(owner.tool_calls) &&
        owner.tool_calls.some((tc) => tc.id === msg.tool_call_id);
      if (!ok) problems.push(`tool 消息 #${i} 是孤立回复：${msg.tool_call_id}`);
    }
  }

  return problems;
}

export function repairToolCallPairs<T extends MessageLike>(messages: T[]): T[] {
  const result: T[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const ids = toolCallIds(msg);
      const replies: T[] = [];
      let cursor = i + 1;
      while (cursor < messages.length && messages[cursor].role === 'tool') {
        replies.push(messages[cursor]);
        cursor++;
      }

      const used = new Set<string>();
      const matched: T[] = [];
      let complete = ids.length > 0;
      for (const id of ids) {
        const reply = replies.find((r) => r.tool_call_id === id && !used.has(id));
        if (!reply) {
          complete = false;
          break;
        }
        used.add(id);
        matched.push(reply);
      }

      if (complete) {
        result.push(msg);
        result.push(...matched);
      }

      i = cursor - 1;
      continue;
    }

    if (msg.role === 'tool') {

      continue;
    }

    result.push(msg);
  }

  return result;
}

function safeTailStart(messages: MessageLike[], requestedStart: number, minStart: number): number {
  let start = Math.max(requestedStart, minStart);
  while (start > minStart && messages[start]?.role === 'tool') start--;

  if (start > minStart && messages[start]?.role === 'assistant' && messages[start]?.tool_calls?.length) {

    return start;
  }
  return start;
}

export function compressMessages<T extends MessageLike>(
  messages: T[],
  options: CompressionOptions = {}
): CompressionResult<T> {
  const maxMessages = options.maxMessages ?? 60;
  const headCount = options.headCount ?? 4;
  const tailCount = options.tailCount ?? 20;

  if (messages.length <= maxMessages) {
    return { messages, omitted: 0, compressed: false };
  }

  const hasSystem = messages[0]?.role === 'system';
  const system = hasSystem ? messages[0] : undefined;
  const bodyStart = hasSystem ? 1 : 0;

  const headEnd = Math.min(bodyStart + headCount, messages.length);
  const head = messages.slice(bodyStart, headEnd);

  const rawTailStart = Math.max(headEnd, messages.length - tailCount);
  const tailStart = safeTailStart(messages, rawTailStart, headEnd);
  const tail = messages.slice(tailStart);
  const middle = messages.slice(headEnd, tailStart);

  const summaryText =
    options.summaryText ??
    `[系统摘要] 上面已省略 ${middle.length} 条中间过程消息。任务仍在继续，请根据最近上下文继续执行剩余步骤。`;

  const summary = {
    role: 'user',
    content: summaryText,
  } as T;

  const rebuilt = [...(system ? [system] : []), ...head, summary, ...tail];
  return {
    messages: repairToolCallPairs(rebuilt),
    omitted: middle.length,
    compressed: true,
  };
}