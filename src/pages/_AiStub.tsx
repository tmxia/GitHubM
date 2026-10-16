// lite 版占位：Vite alias 会在 VITE_AI_ENABLED=false 时把
// @/pages/AiAssistantPage 指向此文件，真实 AI 页面不会被 rollup 加载。
export default function AiAssistantPageStub() {
  return null;
}
