/**
 * 编译时功能开关。
 *
 * 由 Vite 在构建阶段通过 import.meta.env 替换为字面量，
 * rollup 可折叠为常量并做 DCE（删除死代码分支）。
 *
 * 编译正常版：不设置或 VITE_AI_ENABLED=true（默认）
 * 编译精简版：VITE_AI_ENABLED=false pnpm exec vite build
 */
export const AI_ENABLED: boolean = import.meta.env.VITE_AI_ENABLED !== "false";
