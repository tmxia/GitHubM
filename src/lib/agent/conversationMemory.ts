

import type { Message } from '@/components/ai/aiTypes';

export function truncateForStorage(text: string | undefined, max: number): string | undefined {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + `\n…（持久化时截断，原始长度 ${text.length} 字符）`;
}

export function compactMessageForStorage(message: Message): Message {
  const compact: Message = { ...message };
  compact.content = truncateForStorage(message.content, 12_000) ?? '';
  compact.thinkingContent = truncateForStorage(message.thinkingContent, 2_000);
  compact.toolResult = truncateForStorage(message.toolResult, 2_000);
  if (message.inlineTools) {
    compact.inlineTools = message.inlineTools.map(tool => ({
      ...tool,
      result: truncateForStorage(tool.result, 1_000),
    }));
  }
  if (message.attachments) {
    compact.attachments = message.attachments.map(att => ({
      ...att,

      content: att.type === 'text'
        ? (truncateForStorage(att.content, 2_000) ?? '')
        : '',
    }));
  }
  return compact;
}

export function messageToModelHistoryText(message: Message): string {
  if (message.messageType === 'memory_summary') return message.content;
  if (message.bubbleType === 'thinking') return '';
  if (message.bubbleType === 'step') return message.stepTitle ? `[步骤] ${message.stepTitle}` : '';
  if (message.bubbleType === 'tool') {
    const label = message.toolLabel || message.toolName || '工具';
    const result = (message.toolResult || '').trim();
    const brief = result.length > 1_500 ? `${result.slice(0, 1_500)}…` : result;
    return brief ? `[工具 ${label}] ${brief}` : `[工具 ${label}] ${message.toolStatus ?? ''}`;
  }

  const attachmentText = (message.attachments ?? [])
    .filter(att => att.type === 'text' && att.content)
    .map(att => `[附件 ${att.name}]\n${att.content.slice(0, 4_000)}`)
    .join('\n');
  const content = [message.content, attachmentText].filter(Boolean).join('\n\n');
  if (content) return content;

  if (message.inlineTools?.length) {
    return message.inlineTools
      .map(t => `[工具 ${t.label || t.tool}] ${t.status}${t.result ? `：${t.result.slice(0, 800)}` : ''}`)
      .join('\n');
  }
  return '';
}

export function buildModelHistory(
  messages: Message[],
  latestUserText?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const normalized = messages
    .filter(m => m.id !== 'welcome')
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: messageToModelHistoryText(m) }))
    .filter(m => m.content.trim().length > 0)
    .slice(-80);

  if (!latestUserText) return normalized;
  if (normalized.length === 0) return [{ role: 'user', content: latestUserText }];

  const last = normalized[normalized.length - 1];
  if (last.role === 'user') {
    return [...normalized.slice(0, -1), { role: 'user', content: latestUserText }];
  }
  return [...normalized, { role: 'user', content: latestUserText }];
}