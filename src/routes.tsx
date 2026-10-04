import { lazy, type ReactNode } from 'react';
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReposPage = lazy(() => import('./pages/ReposPage'));
const RepoDetailPage = lazy(() => import('./pages/RepoDetailPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage'));
const PullsPage = lazy(() => import('./pages/PullsPage'));
const PullDetailPage = lazy(() => import('./pages/PullDetailPage'));
const CodeBrowserPage = lazy(() => import('./pages/CodeBrowserPage'));
const CommitsPage = lazy(() => import('./pages/CommitsPage'));
const BranchesPage = lazy(() => import('./pages/BranchesPage'));
const CollaboratorsPage = lazy(() => import('./pages/CollaboratorsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ActionsPage = lazy(() => import('./pages/ActionsPage'));
const GistsPage = lazy(() => import('./pages/GistsPage'));
const GistDetailPage = lazy(() => import('./pages/GistDetailPage'));
const PackagesPage = lazy(() => import('./pages/PackagesPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const DiscussionsPage = lazy(() => import('./pages/DiscussionsPage'));
const WikiPage = lazy(() => import('./pages/WikiPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const ExportPage = lazy(() => import('./pages/ExportPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const PagesDeployPage = lazy(() => import('./pages/PagesDeployPage'));
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'));
const GraphQLPlaygroundPage = lazy(() => import('./pages/GraphQLPlaygroundPage'));
const FollowListPage = lazy(() => import('./pages/FollowListPage'));
const StarredPage = lazy(() => import('./pages/StarredPage'));
const RepoForksPage = lazy(() => import('./pages/RepoForksPage'));
const RepoDeployKeysPage = lazy(() => import('./pages/RepoDeployKeysPage'));
const RepoActionsSettingsPage = lazy(() => import('./pages/RepoActionsSettingsPage'));
const RepoSecretsVariablesPage = lazy(() => import('./pages/RepoSecretsVariablesPage'));
const RepoSettingsPage = lazy(() => import('./pages/RepoSettingsPage'));
const UserReposPage = lazy(() => import('./pages/UserReposPage'));
const StargazersPage = lazy(() => import('./pages/StargazersPage'));
const PrDiffPage = lazy(() => import('./pages/PrDiffPage'));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage'));
const MorePage = lazy(() => import('./pages/MorePage'));
import i18n from "@/i18n";

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: i18n.t('登录'), path: '/login', element: <LoginPage />, public: true },
  { name: i18n.t('首页'), path: '/', element: <DashboardPage /> },
  { name: i18n.t('仓库列表'), path: '/repos', element: <ReposPage /> },
  { name: i18n.t('仓库详情'), path: '/repos/:owner/:repo', element: <RepoDetailPage /> },
  { name: 'Issues', path: '/repos/:owner/:repo/issues', element: <IssuesPage /> },
  { name: i18n.t('Issue 详情'), path: '/repos/:owner/:repo/issues/:number', element: <IssueDetailPage /> },
  { name: 'Pull Requests', path: '/repos/:owner/:repo/pulls', element: <PullsPage /> },
  { name: i18n.t('PR 详情'), path: '/repos/:owner/:repo/pulls/:number', element: <PullDetailPage /> },
  { name: 'PR Diff', path: '/repos/:owner/:repo/pulls/:number/diff', element: <PrDiffPage /> },
  { name: i18n.t('代码浏览'), path: '/repos/:owner/:repo/code/*', element: <CodeBrowserPage /> },
  { name: i18n.t('代码浏览根'), path: '/repos/:owner/:repo/code', element: <CodeBrowserPage /> },
  { name: i18n.t('提交历史'), path: '/repos/:owner/:repo/commits', element: <CommitsPage /> },
  { name: i18n.t('分支管理'), path: '/repos/:owner/:repo/branches', element: <BranchesPage /> },
  { name: i18n.t('协作者'), path: '/repos/:owner/:repo/collaborators', element: <CollaboratorsPage /> },
  { name: 'Actions', path: '/repos/:owner/:repo/actions', element: <ActionsPage /> },
  { name: 'Packages', path: '/repos/:owner/:repo/packages', element: <PackagesPage /> },
  { name: 'Projects', path: '/repos/:owner/:repo/projects', element: <ProjectsPage /> },
  { name: 'Discussions', path: '/repos/:owner/:repo/discussions', element: <DiscussionsPage /> },
  { name: 'Wiki', path: '/repos/:owner/:repo/wiki', element: <WikiPage /> },
  { name: i18n.t('通知'), path: '/notifications', element: <NotificationsPage /> },
  { name: i18n.t('搜索'), path: '/search', element: <SearchPage /> },
  { name: i18n.t('活动'), path: '/activity', element: <ActivityPage /> },
  { name: 'Gists', path: '/gists', element: <GistsPage /> },
  { name: i18n.t('Gist 详情'), path: '/gists/:gistId', element: <GistDetailPage /> },
  { name: i18n.t('关注列表'), path: '/follow-list/:type', element: <FollowListPage /> },
  { name: i18n.t('我的收藏'), path: '/starred', element: <StarredPage /> },
  { name: 'Packages', path: '/packages', element: <PackagesPage /> },
  { name: i18n.t('账号管理'), path: '/accounts', element: <AccountsPage /> },
  { name: i18n.t('数据导出'), path: '/export', element: <ExportPage /> },
  { name: i18n.t('批量上传'), path: '/repos/:owner/:repo/upload', element: <UploadPage /> },
  { name: i18n.t('Pages 部署'), path: '/repos/:owner/:repo/pages', element: <PagesDeployPage /> },
  { name: i18n.t('仓库产物'), path: '/repos/:owner/:repo/artifacts', element: <ArtifactsPage /> },
  { name: i18n.t('仓库 Forks'), path: '/repos/:owner/:repo/forks', element: <RepoForksPage /> },
  { name: i18n.t('部署密钥'), path: '/repos/:owner/:repo/deploy-keys', element: <RepoDeployKeysPage /> },
  { name: i18n.t('Actions 设置'), path: '/repos/:owner/:repo/actions-settings', element: <RepoActionsSettingsPage /> },
  { name: i18n.t('机密和变量'), path: '/repos/:owner/:repo/secrets-variables', element: <RepoSecretsVariablesPage /> },
  { name: i18n.t('仓库设置'), path: '/repos/:owner/:repo/settings', element: <RepoSettingsPage /> },
  { name: i18n.t('用户仓库'), path: '/users/:login/repos', element: <UserReposPage /> },
  { name: i18n.t('仓库收藏者'), path: '/repos/:owner/:repo/stargazers', element: <StargazersPage /> },
  { name: i18n.t('设置'), path: '/settings', element: <SettingsPage /> },
  { name: 'GraphQL Playground', path: '/graphql-playground', element: <GraphQLPlaygroundPage /> },
  { name: i18n.t('AI 助手'), path: '/ai-assistant', element: <AiAssistantPage /> },
  { name: '全部功能', path: '/more', element: <MorePage /> },
];
