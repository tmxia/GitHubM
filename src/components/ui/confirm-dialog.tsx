// 全局确认弹窗：替代原生 window.confirm，支持异步 await
// 视觉与 Actions 等删除弹窗统一：红色警告图标 + 加粗标题 + 灰色描述 + 取消/危险主按钮
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import i18n from '@/i18n';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 默认 true：红色危险操作样式 */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let pushConfirm: ((pending: PendingConfirm) => void) | null = null;

/** 用法：if (!(await confirmAction({ title: '…' }))) return; */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!pushConfirm) {
      // 极端兜底：宿主未挂载时退回原生确认
      resolve(window.confirm(options.description || options.title));
      return;
    }
    pushConfirm({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    pushConfirm = next => setPending(next);
    return () => {
      pushConfirm = null;
    };
  }, []);

  const close = (value: boolean) => {
    setPending(current => {
      current?.resolve(value);
      return null;
    });
  };

  const destructive = pending?.destructive !== false;

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={open => { if (!open) close(false); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            {destructive && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
            <span className="break-words">{pending?.title}</span>
          </AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
              {pending.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-row justify-end gap-3 mt-6 sm:space-x-0">
          <AlertDialogCancel className="min-w-[80px] px-4 border-border hover:bg-secondary">
            {pending?.cancelText || i18n.t('取消')}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? 'min-w-[80px] px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'min-w-[80px] px-4'
            }
            onClick={e => { e.preventDefault(); close(true); }}
          >
            {pending?.confirmText || i18n.t('删除')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
