import { runLangGraphAgent, GraphMessage, GraphModelResult } from './runtime';
import { callLLM } from '../../aiAgentCore';

export async function runLangGraphBridge(params: {
  messages: any[];
  modelConfig: any;
  signal?: AbortSignal;
  onEvent: (event: any) => void;
  executeTool: (toolCall: any) => Promise<any>;
}) {
  const graphMessages: GraphMessage[] = params.messages.map(m => ({
    role: m.role as any,
    content: m.content || "",
    toolCall: m.tool_calls?.[0] ? {
        id: m.tool_calls[0].id,
        name: m.tool_calls[0].function.name,
        arguments: JSON.parse(m.tool_calls[0].function.arguments || '{}')
    } : undefined
  }));

  const modelAdapter = async (msgs: GraphMessage[]): Promise<GraphModelResult> => {
    const formattedMsgs = msgs.map(m => ({
        role: m.role,
        content: m.content,
    }));
    const res = await callLLM(params.modelConfig, formattedMsgs as any);
    return {
      content: res.content,
      toolCall: res.toolCall ? {
        id: res.toolCall.id,
        name: res.toolCall.name,
        arguments: res.toolCall.arguments
      } : null
    };
  };

  const result = await runLangGraphAgent({
    model: modelAdapter as any,
    executeTool: params.executeTool as any,
    messages: graphMessages,
    signal: params.signal,
    onEvent: params.onEvent
  });

  return result;
}
