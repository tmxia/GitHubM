import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export interface BackgroundTask {
  id: string;
  type: 'mirror' | 'clone' | 'generic';
  title: string;
  description?: string;
  status: TaskStatus;
  error?: string;
  link?: string;         // 比如 Actions 页面或目标仓库链接
  createdAt: number;
  updatedAt: number;
}

interface TaskState {
  tasks: BackgroundTask[];
  addTask: (task: Omit<BackgroundTask, 'createdAt' | 'updatedAt'>) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (task) => set((state) => ({
        tasks: [
          { ...task, createdAt: Date.now(), updatedAt: Date.now() },
          ...state.tasks,
        ].slice(0, 50), // 最多保留50条
      })),
      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
        ),
      })),
      removeTask: (id) => set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
      })),
      clearCompleted: () => set((state) => ({
        tasks: state.tasks.filter((t) => t.status === 'pending' || t.status === 'running'),
      })),
    }),
    { name: 'ghm-background-tasks' }
  )
);
