import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, Loader2, ExternalLink, Trash2, ArrowLeft, Inbox, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import PullToRefresh from '@/components/common/PullToRefresh';
import { useTaskStore, BackgroundTask } from '@/stores/taskStore';
import { getWorkflowRunById, getWorkflowRunStatus } from '@/services/github';
import i18n from '@/i18n';

export default function TasksPage() {
  const navigate = useNavigate();
  const { tasks, clearCompleted, removeTask } = useTaskStore();
  const [refreshing, setRefreshing] = useState(false);

  const runningTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'running');
  const completedTasks = tasks.filter((t) => t.status === 'success' || t.status === 'failed');

  const syncTasksStatus = useCallback(async () => {
    const state = useTaskStore.getState();
    const running = state.tasks.filter(
      (t) => t.status === 'running' && t.owner && t.repo
    );
    
    for (const task of running) {
      try {
        let run: any = null;
        
        if (task.runId) {
          
          run = await getWorkflowRunById(task.owner!, task.repo!, task.runId);
        } else {
          
          run = await getWorkflowRunStatus(task.owner!, task.repo!, 'sync.yml');
        }

        if (run && run.status === 'completed') {
          if (run.conclusion === 'success') {
            state.updateTask(task.id, { status: 'success', error: undefined });
          } else {
            state.updateTask(task.id, { 
              status: 'failed', 
              error: `运行结果: ${run.conclusion || '未知'}`,
              link: `https://github.com/${task.owner}/${task.repo}/actions`
            });
          }
        }
      } catch (e) {
        // 查询失败静默忽略，下一轮继续查
      }
    }
  }, []);

  useEffect(() => {
    syncTasksStatus();
    const timer = setInterval(syncTasksStatus, 10000);
    return () => clearInterval(timer);
  }, [syncTasksStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncTasksStatus();
    setRefreshing(false);
  };

  const StatusIcon = ({ status }: { status: BackgroundTask['status'] }) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-warning animate-pulse" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const TaskItem = ({ task }: { task: BackgroundTask }) => (
    <div className="p-4 border-b border-border last:border-0 flex items-start gap-3 bg-card hover:bg-secondary/20 transition-colors">
      <div className="mt-0.5">
        <StatusIcon status={task.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {format(task.createdAt, 'HH:mm:ss')}
          </span>
        </div>
        {task.status === 'pending' && (
          <p className="text-xs text-warning mt-1">正在向 GitHub 提交触发请求...</p>
        )}
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
        )}
        {task.error && (
          <p className="text-xs text-destructive mt-1 line-clamp-2">错误：{task.error}</p>
        )}
        {task.link && (
          <a
            href={task.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
          >
            {i18n.t('查看详情')} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button
        onClick={() => removeTask(task.id)}
        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0 transition-colors"
        title={i18n.t('删除记录')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 min-h-[calc(100vh+1px)]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              {i18n.t('后台任务')}
              {refreshing && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </h1>
            <p className="text-sm text-muted-foreground">{i18n.t('实时同步云端准确状态，也可下拉刷新')}</p>
          </div>
          {completedTasks.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearCompleted} className="shrink-0 border-border">
              {i18n.t('清理已结束')}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1">
              {i18n.t('进行中')} ({runningTasks.length})
            </h2>
            <Card className="bg-card border-border overflow-hidden">
              {runningTasks.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Inbox className="w-8 h-8 opacity-50" />
                  <span className="text-sm">{i18n.t('暂无正在进行的任务')}</span>
                </div>
              ) : (
                runningTasks.map((t) => <TaskItem key={t.id} task={t} />)
              )}
            </Card>
          </div>

          {completedTasks.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1">
                {i18n.t('最近完成')}
              </h2>
              <Card className="bg-card border-border overflow-hidden">
                {completedTasks.map((t) => <TaskItem key={t.id} task={t} />)}
              </Card>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
