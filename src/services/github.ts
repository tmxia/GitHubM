
import type {
  GitHubUser,
  GitHubRepo,
  GitHubIssue,
  GitHubComment,
  GitHubPullRequest,
  GitHubCommit,
  GitHubBranch,
  GitHubCollaborator,
  GitHubNotification,
  GitHubContent,
  GitHubRateLimit,
  GitHubSearchResult,
  GitHubEvent,
  GitHubLabel,
  GitHubMilestone,
  IssueState,
  IssueSortField,
  PrState,
  RepoSortField,
  SortDirection,
} from '@/types/types';
import i18n from "@/i18n";

const BASE_URL = 'https://api.github.com';

let authToken: string | null = null;

interface CacheEntry<T> {
  data: T;
  expireAt: number; // ms 时间戳
}
const apiCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 30_000; // 30s

const cdnBustPrefixes = new Set<string>();

export function buildCacheKey(url: string): string {
  return `${authToken ?? ''}|${url}`;
}

export function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  apiCache.set(key, { data, expireAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateCache(urlPrefix: string): void {
  for (const key of apiCache.keys()) {
    if (key.includes(urlPrefix)) apiCache.delete(key);
  }
}

function invalidateAndBust(urlPrefix: string): void {
  invalidateCache(urlPrefix);
  cdnBustPrefixes.add(urlPrefix);
}

function consumeCacheBust(url: string): string {
  for (const prefix of cdnBustPrefixes) {
    if (url.includes(prefix)) {
      cdnBustPrefixes.delete(prefix);
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}_t=${Date.now()}`;
    }
  }
  return url;
}

export function clearApiCache(): void {
  apiCache.clear();
  cdnBustPrefixes.clear();
}

function invalidateCacheForMutation(url: string, method: string): void {
  const path = url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) : url;
  const cleanPath = path.split('?')[0];

  invalidateAndBust(cleanPath);

  const contentsMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+\/contents)/);
  if (contentsMatch) {
    invalidateAndBust(contentsMatch[1]);         // 失效该 repo 所有 contents 缓存
  }

  const repoRootMatch = cleanPath.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (repoRootMatch && (method === 'DELETE' || method === 'PATCH')) {
    const [, owner] = repoRootMatch;
    invalidateAndBust('/user/repos');            // 当前用户仓库列表
    invalidateAndBust(`/users/${owner}/repos`); // 该用户公开仓库列表
    invalidateAndBust(`/orgs/${owner}/repos`);  // 兼容 org 场景
  }

  if (cleanPath === '/user/repos' && method === 'POST') {
    invalidateAndBust('/user/repos');
  }

  const refsMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+)\//);
  if (cleanPath.includes('/git/refs') && refsMatch) {
    invalidateAndBust(`${refsMatch[1]}/branches`);
    invalidateAndBust(`${refsMatch[1]}/git/refs`);
    // ref 变更（force push / 清理历史 / 新建分支）后 commits 列表会变化，
    // 必须同时失效 commits 缓存，否则重新加载仍是旧数据
    invalidateAndBust(`${refsMatch[1]}/commits`);
  }

  const issueMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+)\/issues/);
  if (issueMatch) {
    invalidateAndBust(`${issueMatch[1]}/issues`);
    invalidateAndBust(`${issueMatch[1]}/pulls`);  // PR 列表也要刷新（共享端点）
  }

  const prMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+)\/pulls/);
  if (prMatch) {
    invalidateAndBust(`${prMatch[1]}/pulls`);
    invalidateAndBust(`${prMatch[1]}/issues`);
  }

  const collabMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+\/collaborators)/);
  if (collabMatch) {
    invalidateAndBust(collabMatch[1]);
  }

  if (cleanPath.startsWith('/gists')) {
    invalidateAndBust('/gists');
  }

  if (cleanPath.startsWith('/user/starred')) {
    invalidateAndBust('/user/starred');
    invalidateAndBust(cleanPath);               // checkStarred 精确 key
  }

  const actionsMatch = cleanPath.match(/^(\/repos\/[^/]+\/[^/]+\/actions)/);
  if (actionsMatch) {
    invalidateAndBust(actionsMatch[1]);
  }
}

const inFlightMap = new Map<string, Promise<unknown>>();

export function getOrCreateInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightMap.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => inFlightMap.delete(key));
  inFlightMap.set(key, promise as Promise<unknown>);
  return promise;
}

export function setToken(token: string | null) {
  if (token !== authToken) clearApiCache();
  authToken = token;
}

export function getToken(): string | null {
  return authToken;
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const method = (options.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const cacheKey = buildCacheKey(url);

    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;

    const fetchUrl = consumeCacheBust(url);
    return getOrCreateInFlight<T>(cacheKey, async () => {
      const response = await fetch(fetchUrl, {
        ...options,
        headers: { ...buildHeaders(), ...options.headers },
      });
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json() as {
            message?: string;
            errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
          };
          errorMessage = errorBody.message || errorMessage;
          if (Array.isArray(errorBody.errors) && errorBody.errors.length) {
            const detail = errorBody.errors
              .map((e) => [e.resource, e.field, e.code, e.message].filter(Boolean).join('/'))
              .join('; ');
            if (detail) errorMessage += ` [${detail}]`;
          }
        } catch { /* 忽略 JSON 解析错误 */ }
        const error = new Error(errorMessage) as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      if (response.status === 204) return undefined as T;
      const data = await response.json() as T;
      setCached(cacheKey, data);
      return data;
    });
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...buildHeaders(), ...options.headers },
  });
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json() as {
        message?: string;
        errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
      };
      errorMessage = errorBody.message || errorMessage;
      if (Array.isArray(errorBody.errors) && errorBody.errors.length) {
        const detail = errorBody.errors
          .map((e) => [e.resource, e.field, e.code, e.message].filter(Boolean).join('/'))
          .join('; ');
        if (detail) errorMessage += ` [${detail}]`;
      }
    } catch { /* 忽略 JSON 解析错误 */ }
    const error = new Error(errorMessage) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) {
    invalidateCacheForMutation(url, method);
    return undefined as T;
  }
  const data = await response.json() as T;
  invalidateCacheForMutation(url, method);
  return data;
}

function parseLinkHeader(link: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = link.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      result[match[2]] = match[1];
    }
  }
  return result;
}

async function requestWithPagination<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T[]; hasNextPage: boolean; totalCount?: number }> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const method = (options.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const cacheKey = buildCacheKey(url);

    const cached = getCached<{ data: T[]; hasNextPage: boolean }>(cacheKey);
    if (cached !== null) return cached;

    const fetchUrl = consumeCacheBust(url);
    return getOrCreateInFlight<{ data: T[]; hasNextPage: boolean }>(cacheKey, async () => {
      const response = await fetch(fetchUrl, {
        ...options,
        headers: { ...buildHeaders(), ...options.headers },
      });
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json() as { message?: string };
          errorMessage = errorBody.message || errorMessage;
        } catch { /* 忽略 */ }
        const error = new Error(errorMessage) as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      const data = await response.json() as T[];
      const linkHeader = response.headers.get('Link');
      const links = linkHeader ? parseLinkHeader(linkHeader) : {};
      const result = { data, hasNextPage: !!links.next };
      setCached(cacheKey, result);
      return result;
    });
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...buildHeaders(), ...options.headers },
  });
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json() as { message?: string };
      errorMessage = errorBody.message || errorMessage;
    } catch { /* 忽略 */ }
    const error = new Error(errorMessage) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  const data = await response.json() as T[];
  const linkHeader = response.headers.get('Link');
  const links = linkHeader ? parseLinkHeader(linkHeader) : {};
  invalidateCacheForMutation(url, method);
  return { data, hasNextPage: !!links.next };
}

export async function getCurrentUser(): Promise<GitHubUser> {
  return request<GitHubUser>('/user');
}

export async function getUserByLogin(login: string): Promise<GitHubUser> {
  return request<GitHubUser>(`/users/${login}`);
}

export async function getRateLimit(): Promise<{ rate: GitHubRateLimit }> {
  return request<{ rate: GitHubRateLimit }>('/rate_limit');
}

export async function getUserEvents(
  login: string,
  page = 1
): Promise<GitHubEvent[]> {
  return request<GitHubEvent[]>(
    `/users/${login}/events?per_page=30&page=${page}`
  );
}

export async function getUserRepos(params: {
  sort?: RepoSortField;
  direction?: SortDirection;
  per_page?: number;
  page?: number;
  type?: 'all' | 'owner' | 'member' | 'public' | 'private';
} = {}): Promise<{ data: GitHubRepo[]; hasNextPage: boolean }> {
  const {
    sort = 'updated',
    direction = 'desc',
    per_page = 30,
    page = 1,
    type = 'all',
  } = params;
  return requestWithPagination<GitHubRepo>(
    `/user/repos?sort=${sort}&direction=${direction}&per_page=${per_page}&page=${page}&type=${type}`
  );
}

export async function getReposByLogin(
  login: string,
  params: {
    sort?: RepoSortField;
    direction?: SortDirection;
    per_page?: number;
    page?: number;
    type?: 'all' | 'owner' | 'member';
  } = {}
): Promise<{ data: GitHubRepo[]; hasNextPage: boolean }> {
  const { sort = 'updated', direction = 'desc', per_page = 100, page = 1, type = 'owner' } = params;
  return requestWithPagination<GitHubRepo>(
    `/users/${login}/repos?sort=${sort}&direction=${direction}&per_page=${per_page}&page=${page}&type=${type}`
  );
}

export async function getRepo(
  owner: string,
  repo: string
): Promise<GitHubRepo> {
  return request<GitHubRepo>(`/repos/${owner}/${repo}`);
}

export async function createRepo(params: {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
}): Promise<GitHubRepo> {
  return request<GitHubRepo>('/user/repos', {
    method: 'POST',
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function starRepo(owner: string, repo: string): Promise<void> {
  await request<void>(`/user/starred/${owner}/${repo}`, { method: 'PUT', headers: { 'Content-Length': '0' } });
}

export async function unstarRepo(owner: string, repo: string): Promise<void> {
  await request<void>(`/user/starred/${owner}/${repo}`, { method: 'DELETE' });
}

export async function checkStarred(owner: string, repo: string): Promise<boolean> {
  try {
    const url = `${BASE_URL}/user/starred/${owner}/${repo}`;
    const cacheKey = buildCacheKey(url);
    const cached = getCached<boolean>(cacheKey);
    if (cached !== null) return cached;
    const response = await fetch(url, { headers: buildHeaders() });
    const result = response.status === 204;
    setCached(cacheKey, result);
    return result;
  } catch {
    return false;
  }
}

export async function forkRepo(owner: string, repo: string): Promise<GitHubRepo> {
  return request<GitHubRepo>(`/repos/${owner}/${repo}/forks`, { method: 'POST' });
}

export async function getRepoLanguages(
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  return request<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
}

export async function getRepoTopics(
  owner: string,
  repo: string
): Promise<{ names: string[] }> {
  return request<{ names: string[] }>(`/repos/${owner}/${repo}/topics`);
}

export async function getIssues(
  owner: string,
  repo: string,
  params: {
    state?: IssueState;
    sort?: IssueSortField;
    direction?: SortDirection;
    per_page?: number;
    page?: number;
    labels?: string;
    milestone?: string;
    assignee?: string;
  } = {}
): Promise<{ data: GitHubIssue[]; hasNextPage: boolean }> {
  const {
    state = 'open',
    sort = 'created',
    direction = 'desc',
    per_page = 30,
    page = 1,
  } = params;
  const queryParams = new URLSearchParams({
    state,
    sort,
    direction,
    per_page: String(per_page),
    page: String(page),
  });
  if (params.labels) queryParams.set('labels', params.labels);
  if (params.milestone) queryParams.set('milestone', params.milestone);
  if (params.assignee) queryParams.set('assignee', params.assignee);

  return requestWithPagination<GitHubIssue>(
    `/repos/${owner}/${repo}/issues?${queryParams.toString()}`
  );
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssue> {
  return request<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

export async function createIssue(
  owner: string,
  repo: string,
  params: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }
): Promise<GitHubIssue> {
  return request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  params: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
    milestone?: number | null;
  }
): Promise<GitHubIssue> {
  return request<GitHubIssue>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  page = 1
): Promise<GitHubComment[]> {
  return request<GitHubComment[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=50&page=${page}`
  );
}

export async function createIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<GitHubComment> {
  return request<GitHubComment>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getRepoLabels(
  owner: string,
  repo: string
): Promise<GitHubLabel[]> {
  return request<GitHubLabel[]>(`/repos/${owner}/${repo}/labels?per_page=100`);
}

export async function getRepoMilestones(
  owner: string,
  repo: string
): Promise<GitHubMilestone[]> {
  return request<GitHubMilestone[]>(`/repos/${owner}/${repo}/milestones?per_page=100`);
}

export async function getPullRequests(
  owner: string,
  repo: string,
  params: {
    state?: PrState;
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: SortDirection;
    per_page?: number;
    page?: number;
    base?: string;
    head?: string;
  } = {}
): Promise<{ data: GitHubPullRequest[]; hasNextPage: boolean }> {
  const {
    state = 'open',
    sort = 'created',
    direction = 'desc',
    per_page = 30,
    page = 1,
  } = params;
  const queryParams = new URLSearchParams({
    state,
    sort,
    direction,
    per_page: String(per_page),
    page: String(page),
  });
  if (params.base) queryParams.set('base', params.base);
  if (params.head) queryParams.set('head', params.head);

  return requestWithPagination<GitHubPullRequest>(
    `/repos/${owner}/${repo}/pulls?${queryParams.toString()}`
  );
}

export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPullRequest> {
  return request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${prNumber}`);
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<import('@/types/types').GitHubFile[]> {
  return request<import('@/types/types').GitHubFile[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`
  );
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  params?: {
    commit_title?: string;
    commit_message?: string;
    merge_method?: 'merge' | 'squash' | 'rebase';
  }
): Promise<{ sha: string; merged: boolean; message: string }> {
  return request<{ sha: string; merged: boolean; message: string }>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
    {
      method: 'PUT',
      body: JSON.stringify(params || {}),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function updatePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  params: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
  }
): Promise<GitHubPullRequest> {
  return request<GitHubPullRequest>(
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: 'PATCH',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getPullRequestComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubComment[]> {
  return request<GitHubComment[]>(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`
  );
}

export async function createPullRequestComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<GitHubComment> {
  return request<GitHubComment>(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getCommits(
  owner: string,
  repo: string,
  params: {
    sha?: string;
    per_page?: number;
    page?: number;
    author?: string;
  } = {}
): Promise<{ data: GitHubCommit[]; hasNextPage: boolean }> {
  const { sha, per_page = 30, page = 1, author } = params;
  const queryParams = new URLSearchParams({
    per_page: String(per_page),
    page: String(page),
  });
  if (sha) queryParams.set('sha', sha);
  if (author) queryParams.set('author', author);

  return requestWithPagination<GitHubCommit>(
    `/repos/${owner}/${repo}/commits?${queryParams.toString()}`
  );
}

export async function getCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<GitHubCommit> {
  return request<GitHubCommit>(`/repos/${owner}/${repo}/commits/${sha}`);
}

export async function getBranches(
  owner: string,
  repo: string,
  page = 1
): Promise<{ data: GitHubBranch[]; hasNextPage: boolean }> {
  return requestWithPagination<GitHubBranch>(
    `/repos/${owner}/${repo}/branches?per_page=30&page=${page}`
  );
}

export async function getBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubBranch> {
  return request<GitHubBranch>(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
}

export async function createBranch(
  owner: string,
  repo: string,
  params: { ref: string; sha: string }
): Promise<{ ref: string; object: { sha: string } }> {
  return request<{ ref: string; object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${params.ref}`, sha: params.sha }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function createOrphanBranch(
  owner: string,
  repo: string,
  branchName: string
): Promise<{ ref: string; object: { sha: string } }> {
  const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const commit = await request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Initialize empty branch: ${branchName}`,
      tree: EMPTY_TREE_SHA,
      parents: [],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  return request<{ ref: string; object: { sha: string } }>(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commit.sha }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 获取 commit 的 tree SHA（用于重建历史）
 */
export async function getCommitTreeSha(
  owner: string,
  repo: string,
  commitSha: string
): Promise<string> {
  const data = await request<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${commitSha}`
  );
  return data.tree.sha;
}

/**
 * 创建 commit（可指定 parent）
 */
export async function createCommit(
  owner: string,
  repo: string,
  treeSha: string,
  parents: string[],
  message: string
): Promise<string> {
  const data = await request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeSha, parents, message }),
    headers: { 'Content-Type': 'application/json' },
  });
  return data.sha;
}

/**
 * 保留最近 N 个 commit，丢弃更早的（重写分支历史）
 * commits 是倒序数组（最新在前）
 */
export async function pruneCommitHistory(
  owner: string,
  repo: string,
  branch: string,
  commits: Array<{ sha: string; commit: { message: string } }>,
  keepCount: number
): Promise<string> {
  const keep = commits.slice(0, keepCount);
  if (keep.length === 0) throw new Error('no commits to keep');

  // 从最老的保留的 commit 开始（倒序），逐个重建
  let parentSha: string | null = null;
  let newHeadSha = '';
  for (let i = keep.length - 1; i >= 0; i--) {
    const c = keep[i];
    const treeSha = await getCommitTreeSha(owner, repo, c.sha);
    const parents = parentSha ? [parentSha] : [];
    const newSha = await createCommit(owner, repo, treeSha, parents, c.commit.message);
    parentSha = newSha;
    if (i === 0) newHeadSha = newSha;
  }

  // force update 分支指向新 head
  await forceUpdateBranch(owner, repo, branch, newHeadSha);
  return newHeadSha;
}

/**
 * 强制更新分支指针（用于"保留最近 N 个 commit"，丢弃更早的提交）
 * 破坏性操作：之后的 commit 会变成孤儿，30 天后被 GC 清除
 */
export async function forceUpdateBranch(
  owner: string,
  repo: string,
  branch: string,
  sha: string
): Promise<void> {
  await request<unknown>(
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha, force: true }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function deleteBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<void> {
  await request<void>(
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'DELETE' }
  );
}

export async function compareBranches(
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<{
  ahead_by: number;
  behind_by: number;
  status: string;
  commits: GitHubCommit[];
}> {
  return request<{
    ahead_by: number;
    behind_by: number;
    status: string;
    commits: GitHubCommit[];
  }>(`/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
}

export async function getCollaborators(
  owner: string,
  repo: string,
  page = 1
): Promise<{ data: GitHubCollaborator[]; hasNextPage: boolean }> {
  return requestWithPagination<GitHubCollaborator>(
    `/repos/${owner}/${repo}/collaborators?per_page=30&page=${page}`
  );
}

export async function addCollaborator(
  owner: string,
  repo: string,
  username: string,
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' = 'push'
): Promise<void> {
  await request<void>(
    `/repos/${owner}/${repo}/collaborators/${username}`,
    {
      method: 'PUT',
      body: JSON.stringify({ permission }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function removeCollaborator(
  owner: string,
  repo: string,
  username: string
): Promise<void> {
  await request<void>(`/repos/${owner}/${repo}/collaborators/${username}`, {
    method: 'DELETE',
  });
}

export async function updateCollaboratorPermission(
  owner: string,
  repo: string,
  username: string,
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
): Promise<void> {
  await request<void>(
    `/repos/${owner}/${repo}/collaborators/${username}`,
    {
      method: 'PUT',
      body: JSON.stringify({ permission }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getNotifications(params: {
  all?: boolean;
  participating?: boolean;
  per_page?: number;
  page?: number;
} = {}): Promise<{ data: GitHubNotification[]; hasNextPage: boolean }> {
  const { all = false, participating = false, per_page = 50, page = 1 } = params;
  return requestWithPagination<GitHubNotification>(
    `/notifications?all=${all}&participating=${participating}&per_page=${per_page}&page=${page}`
  );
}

export async function markNotificationRead(threadId: string): Promise<void> {
  await request<void>(`/notifications/threads/${threadId}`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request<void>('/notifications', {
    method: 'PUT',
    body: JSON.stringify({ read: true }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getRepoContents(
  owner: string,
  repo: string,
  path = '',
  ref?: string
): Promise<GitHubContent | GitHubContent[]> {
  const queryParams = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const encodedPath = path ? `/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  return request<GitHubContent | GitHubContent[]>(
    `/repos/${owner}/${repo}/contents${encodedPath}${queryParams}`
  );
}

export async function getReadme(
  owner: string,
  repo: string,
  ref?: string
): Promise<GitHubContent> {
  const queryParams = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  return request<GitHubContent>(`/repos/${owner}/${repo}/readme${queryParams}`);
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; encoding: string }> {
  const queryParams = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return request<{ content: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${encodedPath}${queryParams}`
  );
}

export async function searchRepositories(
  query: string,
  params: { sort?: 'stars' | 'forks' | 'updated'; order?: SortDirection; per_page?: number; page?: number } = {}
): Promise<GitHubSearchResult<GitHubRepo>> {
  const { sort, order = 'desc', per_page = 20, page = 1 } = params;
  const q = encodeURIComponent(query);
  const sortQS = sort ? `&sort=${sort}&order=${order}` : '';
  return request<GitHubSearchResult<GitHubRepo>>(
    `/search/repositories?q=${q}${sortQS}&per_page=${per_page}&page=${page}`
  );
}

export async function searchIssues(
  query: string,
  params: { sort?: 'created' | 'updated' | 'comments'; order?: SortDirection; per_page?: number; page?: number } = {}
): Promise<GitHubSearchResult<GitHubIssue>> {
  const { sort = 'created', order = 'desc', per_page = 20, page = 1 } = params;
  const q = encodeURIComponent(query);
  return request<GitHubSearchResult<GitHubIssue>>(
    `/search/issues?q=${q}&sort=${sort}&order=${order}&per_page=${per_page}&page=${page}`
  );
}

export async function searchUsers(
  query: string,
  params: { sort?: 'followers' | 'repositories' | 'joined'; order?: SortDirection; per_page?: number; page?: number } = {}
): Promise<GitHubSearchResult<GitHubUser>> {
  const { sort = 'followers', order = 'desc', per_page = 20, page = 1 } = params;
  const q = encodeURIComponent(query);
  return request<GitHubSearchResult<GitHubUser>>(
    `/search/users?q=${q}&sort=${sort}&order=${order}&per_page=${per_page}&page=${page}`
  );
}

export async function searchCode(
  query: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubSearchResult<{
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: GitHubRepo;
  score: number;
}>> {
  const { per_page = 20, page = 1 } = params;
  const q = encodeURIComponent(query);
  return request<GitHubSearchResult<{
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: GitHubRepo;
    score: number;
  }>>(`/search/code?q=${q}&per_page=${per_page}&page=${page}`);
}

export async function updateFileContent(
  owner: string,
  repo: string,
  path: string,
  data: { message: string; content: string; sha: string; branch?: string }
): Promise<void> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  await request<unknown>(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createFileContent(
  owner: string,
  repo: string,
  path: string,
  data: { message: string; content: string; branch?: string }
): Promise<void> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  await request<unknown>(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFileContent(
  owner: string,
  repo: string,
  path: string,
  data: { message: string; sha: string; branch?: string }
): Promise<void> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  await request<unknown>(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

export async function getWorkflows(
  owner: string,
  repo: string
): Promise<{ total_count: number; workflows: import('@/types/types').GitHubWorkflow[] }> {
  return request(`/repos/${owner}/${repo}/actions/workflows`);
}

export async function getWorkflowRuns(
  owner: string,
  repo: string,
  params: { workflow_id?: number | string; status?: string; per_page?: number; page?: number } = {}
): Promise<{ total_count: number; workflow_runs: import('@/types/types').GitHubWorkflowRun[] }> {
  const { workflow_id, status, per_page = 20, page = 1 } = params;
  const base = workflow_id
    ? `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/runs`
    : `/repos/${owner}/${repo}/actions/runs`;
  const qs = new URLSearchParams({ per_page: String(per_page), page: String(page) });
  if (status) qs.set('status', status);
  return request(`${base}?${qs}`);
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<import('@/types/types').GitHubWorkflowRun> {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}`);
}

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: number | string,
  ref: string,
  inputs: Record<string, string> = {}
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs }),
  });
}

export async function cancelWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
    method: 'POST',
  });
}

export async function rerunWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
    method: 'POST',
  });
}

export async function deleteWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/runs/${runId}`, {
    method: 'DELETE',
  });
}

export async function deleteAllWorkflowRuns(
  owner: string,
  repo: string,
  options: {
    workflowId?: number | string;
    onProgress?: (info: { deleted: number; total: number; failed: number; currentName?: string }) => void;
  } = {},
): Promise<{ deleted: number; failed: number; total: number }> {
  const { workflowId, onProgress } = options;

  const base = workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
    : `/repos/${owner}/${repo}/actions/runs`;

  const all: import('@/types/types').GitHubWorkflowRun[] = [];
  let page = 1;
  while (true) {
    const res = await request<{ workflow_runs: import('@/types/types').GitHubWorkflowRun[] }>(
      `${base}?per_page=100&page=${page}`
    );
    if (!res.workflow_runs || res.workflow_runs.length === 0) break;
    all.push(...res.workflow_runs);
    if (res.workflow_runs.length < 100) break;
    page += 1;
    if (page > 20) break; // 安全上限 2000 条
  }

  const targets = all.filter(
    (r) => r.status !== 'in_progress' && r.status !== 'queued'
  );

  const total = targets.length;
  let deleted = 0;
  let failed = 0;
  onProgress?.({ deleted, total, failed });

  for (const run of targets) {
    try {
      await deleteWorkflowRun(owner, repo, run.id);
      deleted++;
    } catch {
      failed++;
    }
    onProgress?.({ deleted, total, failed, currentName: `${run.name} #${run.run_number}` });
    await new Promise((r) => setTimeout(r, 150));
  }

  return { deleted, failed, total };
}

export async function getWorkflowRunJobs(
  owner: string,
  repo: string,
  runId: number
): Promise<{ total_count: number; jobs: import('@/types/types').GitHubWorkflowJob[] }> {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
}

export async function getUserPackages(
  username: string,
  packageType: string = 'container',
  bust = false
): Promise<import('@/types/types').GitHubPackage[]> {
  const url = `/users/${username}/packages?package_type=${packageType}`;
  return request(bust ? `${url}&_t=${Date.now()}` : url);
}

export async function getRepoPackages(
  owner: string,
  repo: string
): Promise<import('@/types/types').GitHubPackage[]> {
  return request<import('@/types/types').GitHubPackage[]>(`/repos/${owner}/${repo}/packages`).catch(() => [] as import('@/types/types').GitHubPackage[]);
}

export async function getPackageVersions(
  packageType: string,
  packageName: string,
  username: string
): Promise<import('@/types/types').GitHubPackageVersion[]> {
  return request(
    `/users/${username}/packages/${packageType}/${encodeURIComponent(packageName)}/versions`
  );
}

export async function deletePackageVersion(
  packageType: string,
  packageName: string,
  username: string,
  versionId: number
): Promise<void> {
  await request<unknown>(
    `/users/${username}/packages/${packageType}/${encodeURIComponent(packageName)}/versions/${versionId}`,
    { method: 'DELETE' }
  );
}

export async function listRepoPackages(
  owner: string, repo: string, packageType = 'container'
): Promise<import('@/types/types').GitHubPackage[]> {
  return request<import('@/types/types').GitHubPackage[]>(
    `/repos/${owner}/${repo}/packages?package_type=${packageType}`
  ).catch(() => [] as import('@/types/types').GitHubPackage[]);
}

export async function listRepoPackageVersions(
  owner: string, repo: string, packageType: string, packageName: string
): Promise<import('@/types/types').GitHubPackageVersion[]> {
  const enc = encodeURIComponent(packageName);
  return request<import('@/types/types').GitHubPackageVersion[]>(
    `/repos/${owner}/${repo}/packages/${packageType}/${enc}/versions`
  );
}

export async function deleteRepoPackageVersion(
  owner: string, repo: string, packageType: string, packageName: string, versionId: number
): Promise<void> {
  const enc = encodeURIComponent(packageName);
  await request<unknown>(
    `/repos/${owner}/${repo}/packages/${packageType}/${enc}/versions/${versionId}`,
    { method: 'DELETE' }
  );
}

export async function deleteRepoPackage(
  owner: string, repo: string, packageType: string, packageName: string
): Promise<void> {
  const enc = encodeURIComponent(packageName);
  await request<unknown>(
    `/repos/${owner}/${repo}/packages/${packageType}/${enc}`,
    { method: 'DELETE' }
  );
}

export async function getRepoProjects(
  owner: string,
  repo: string
): Promise<import('@/types/types').GitHubProject[]> {
  return request(`/repos/${owner}/${repo}/projects`, {
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
  });
}

export async function getProjectColumns(
  projectId: number
): Promise<import('@/types/types').GitHubProjectColumn[]> {
  return request(`/projects/${projectId}/columns`, {
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
  });
}

export async function getColumnCards(
  columnId: number
): Promise<import('@/types/types').GitHubProjectCard[]> {
  return request(`/projects/columns/${columnId}/cards`, {
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
  });
}

export async function createProject(
  owner: string,
  repo: string,
  name: string,
  body?: string
): Promise<import('@/types/types').GitHubProject> {
  return request(`/repos/${owner}/${repo}/projects`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
    body: JSON.stringify({ name, body }),
  });
}

export async function deleteProject(projectId: number): Promise<void> {
  await request<unknown>(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
  });
}

export async function createProjectColumn(
  projectId: number,
  name: string
): Promise<import('@/types/types').GitHubProjectColumn> {
  return request(`/projects/${projectId}/columns`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
    body: JSON.stringify({ name }),
  });
}

export async function createProjectCard(
  columnId: number,
  note: string
): Promise<import('@/types/types').GitHubProjectCard> {
  return request(`/projects/columns/${columnId}/cards`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
    body: JSON.stringify({ note }),
  });
}

export async function moveProjectCard(
  cardId: number,
  position: string,
  columnId: number
): Promise<void> {
  await request<unknown>(`/projects/columns/cards/${cardId}/moves`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.inertia-preview+json' },
    body: JSON.stringify({ position, column_id: columnId }),
  });
}

export async function getGists(
  params: { per_page?: number; page?: number } = {}
): Promise<import('@/types/types').GitHubGist[]> {
  const { per_page = 30, page = 1 } = params;
  return request(`/gists?per_page=${per_page}&page=${page}`);
}

export async function getGist(gistId: string): Promise<import('@/types/types').GitHubGistDetail> {
  return request(`/gists/${gistId}`);
}

export async function createGist(data: {
  description: string;
  public: boolean;
  files: Record<string, { content: string }>;
}): Promise<import('@/types/types').GitHubGistDetail> {
  return request('/gists', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateGist(
  gistId: string,
  data: {
    description?: string;
    files?: Record<string, { content: string } | null>;
  }
): Promise<import('@/types/types').GitHubGistDetail> {
  return request(`/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteGist(gistId: string): Promise<void> {
  await request<unknown>(`/gists/${gistId}`, { method: 'DELETE' });
}

export async function forkGist(gistId: string): Promise<import('@/types/types').GitHubGistDetail> {
  return request(`/gists/${gistId}/forks`, { method: 'POST' });
}

export async function starGist(gistId: string): Promise<void> {
  await request<unknown>(`/gists/${gistId}/star`, { method: 'PUT' });
}

export async function unstarGist(gistId: string): Promise<void> {
  await request<unknown>(`/gists/${gistId}/star`, { method: 'DELETE' });
}

export async function getGistComments(
  gistId: string
): Promise<import('@/types/types').GitHubComment[]> {
  return request(`/gists/${gistId}/comments`);
}

export async function createGistComment(
  gistId: string,
  body: string
): Promise<import('@/types/types').GitHubComment> {
  return request(`/gists/${gistId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function getDiscussions(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<import('@/types/types').GitHubDiscussion[]> {
  const { per_page = 20, page = 1 } = params;
  return request<import('@/types/types').GitHubDiscussion[]>(
    `/repos/${owner}/${repo}/discussions?per_page=${per_page}&page=${page}`
  );
}

export async function getGitignoreTemplates(): Promise<string[]> {
  return request<string[]>('/gitignore/templates');
}

export async function getLicenses(): Promise<Array<{ key: string; name: string; spdx_id: string }>> {
  return request<Array<{ key: string; name: string; spdx_id: string }>>('/licenses');
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return i18n.t('刚刚');
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  if (months < 12) return `${months} 个月前`;
  return `${years} 年前`;
}

export function formatNumber(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return String(num);
}

export function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Java: '#b07219',
    Go: '#00ADD8',
    Rust: '#dea584',
    C: '#555555',
    'C++': '#f34b7d',
    'C#': '#178600',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
    Scala: '#c22d40',
    Elixir: '#6e4a7e',
    Haskell: '#5e5086',
    Lua: '#000080',
    MATLAB: '#e16737',
    R: '#198CE7',
  };
  return colors[language] || '#6b7280';
}

export interface GitHubPages {
  url: string;
  status: 'built' | 'building' | 'errored' | 'null' | null;
  cname: string | null;
  custom_404: boolean;
  html_url: string;
  source: { branch: string; directory: string } | null;
  public: boolean;
  https_enforced?: boolean;
}

export interface GitHubPagesBuild {
  url: string;
  status: 'built' | 'building' | 'errored';
  error: { message: string | null };
  pusher: { login: string; avatar_url: string } | null;
  commit: string;
  duration: number;
  created_at: string;
  updated_at: string;
}

export async function getPages(owner: string, repo: string): Promise<GitHubPages> {
  return request<GitHubPages>(`/repos/${owner}/${repo}/pages`);
}

export async function enablePages(
  owner: string,
  repo: string,
  source: { branch: string; path?: '/' | '/docs' }
): Promise<GitHubPages> {
  return request<GitHubPages>(`/repos/${owner}/${repo}/pages`, {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export async function updatePages(
  owner: string,
  repo: string,
  data: { source?: { branch: string; path?: '/' | '/docs' }; cname?: string | null; https_enforced?: boolean }
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/pages`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function disablePages(owner: string, repo: string): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/pages`, { method: 'DELETE' });
}

export async function triggerPagesBuild(owner: string, repo: string): Promise<{ url: string; status: string }> {
  return request<{ url: string; status: string }>(`/repos/${owner}/${repo}/pages/builds`, { method: 'POST' });
}

export async function getLatestPagesBuild(owner: string, repo: string): Promise<GitHubPagesBuild> {
  return request<GitHubPagesBuild>(`/repos/${owner}/${repo}/pages/builds/latest`);
}

export async function listPagesBuilds(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubPagesBuild[]> {
  const { per_page = 10, page = 1 } = params;
  return request<GitHubPagesBuild[]>(`/repos/${owner}/${repo}/pages/builds?per_page=${per_page}&page=${page}`);
}

export async function getRepoDeployments(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number; environment?: string } = {}
): Promise<import('@/types/types').GitHubDeployment[]> {
  const { per_page = 20, page = 1, environment } = params;
  const env = environment ? `&environment=${encodeURIComponent(environment)}` : '';
  return request<import('@/types/types').GitHubDeployment[]>(
    `/repos/${owner}/${repo}/deployments?per_page=${per_page}&page=${page}${env}`
  );
}

export async function getDeploymentStatuses(
  owner: string,
  repo: string,
  deploymentId: number
): Promise<import('@/types/types').GitHubDeploymentStatus[]> {
  return request<import('@/types/types').GitHubDeploymentStatus[]>(
    `/repos/${owner}/${repo}/deployments/${deploymentId}/statuses`
  );
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  author: { login: string; avatar_url: string };
  html_url: string;
  tarball_url: string | null;
  zipball_url: string | null;
  assets: GitHubReleaseAsset[];
}

export interface GitHubReleaseAsset {
  url: string;
  id: number;
  name: string;
  label: string | null;
  content_type: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  archive_download_url: string;
  workflow_run: { id: number; head_branch: string; head_sha: string; event: string } | null;
}

export async function getReleases(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubRelease[]> {
  const { per_page = 20, page = 1 } = params;
  return request<GitHubRelease[]>(`/repos/${owner}/${repo}/releases?per_page=${per_page}&page=${page}`);
}

export async function getRelease(owner: string, repo: string, releaseId: number): Promise<GitHubRelease> {
  return request<GitHubRelease>(`/repos/${owner}/${repo}/releases/${releaseId}`);
}

export interface GitHubTag {
  name: string;
  commit: { sha: string; url: string };
  zipball_url: string;
  tarball_url: string;
  node_id: string;
}

export async function getTags(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubTag[]> {
  const { per_page = 100, page = 1 } = params;
  return request<GitHubTag[]>(
    `/repos/${owner}/${repo}/tags?per_page=${per_page}&page=${page}`
  );
}

export async function deleteTag(
  owner: string,
  repo: string,
  tagName: string
): Promise<void> {
  await request<unknown>(
    `/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(tagName)}`,
    { method: 'DELETE' }
  );
}

export async function deleteRelease(owner: string, repo: string, releaseId: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/releases/${releaseId}`, { method: 'DELETE' });
}

export async function deleteReleaseAsset(owner: string, repo: string, assetId: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/releases/assets/${assetId}`, { method: 'DELETE' });
}

export interface GitHubRepoUpdate {
  name?: string;
  description?: string;
  private?: boolean;
  default_branch?: string;
  has_issues?: boolean;
  has_wiki?: boolean;
  has_projects?: boolean;
  homepage?: string;
  has_downloads?: boolean;
  allow_squash_merge?: boolean;
  allow_merge_commit?: boolean;
  allow_rebase_merge?: boolean;
  allow_auto_merge?: boolean;
  delete_branch_on_merge?: boolean;
}

export async function updateRepo(
  owner: string,
  repo: string,
  data: GitHubRepoUpdate
): Promise<GitHubRepo> {
  return request<GitHubRepo>(`/repos/${owner}/${repo}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteRepo(owner: string, repo: string): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}`, { method: 'DELETE' });
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export async function getGitTree(
  owner: string,
  repo: string,
  treeSha: string,
  recursive = false
): Promise<{ sha: string; truncated: boolean; tree: GitTreeItem[] }> {
  const q = recursive ? '?recursive=1' : '';
  return request<{ sha: string; truncated: boolean; tree: GitTreeItem[] }>(
    `/repos/${owner}/${repo}/git/trees/${treeSha}${q}`
  );
}

export async function deleteFolderContents(
  owner: string,
  repo: string,
  folderPath: string,
  branch: string,
  commitMessagePrefix: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  const branchInfo = await request<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`
  );
  const tree = await getGitTree(owner, repo, branchInfo.commit.sha, true);
  const files = tree.tree.filter(
    (item) => item.type === 'blob' && item.path.startsWith(folderPath + '/')
  );

  let success = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await request<unknown>(`/repos/${owner}/${repo}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: `${commitMessagePrefix}: delete ${file.path}`,
          sha: file.sha,
          branch,
        }),
      });
      success++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, files.length);
  }
  return { success, failed };
}

export async function getRepoArtifacts(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<{ total_count: number; artifacts: GitHubArtifact[] }> {
  const { per_page = 30, page = 1 } = params;
  return request<{ total_count: number; artifacts: GitHubArtifact[] }>(
    `/repos/${owner}/${repo}/actions/artifacts?per_page=${per_page}&page=${page}`
  );
}

export async function deleteArtifact(owner: string, repo: string, artifactId: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}`, { method: 'DELETE' });
}

export interface GitHubFileInfo {
  sha: string;
  size: number;
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: string;
  content?: string;
}

export async function getFileInfo(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GitHubFileInfo | null> {
  try {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return await request<GitHubFileInfo>(`/repos/${owner}/${repo}/contents/${encodedPath}${query}`);
  } catch {
    return null;
  }
}

export async function getRepoBranches(owner: string, repo: string): Promise<Array<{ name: string; commit: { sha: string } }>> {
  return request<Array<{ name: string; commit: { sha: string } }>>(`/repos/${owner}/${repo}/branches?per_page=100`);
}

export async function getFollowers(
  login: string,
  page = 1,
  per_page = 30
): Promise<GitHubUser[]> {
  return request<GitHubUser[]>(
    `/users/${encodeURIComponent(login)}/followers?per_page=${per_page}&page=${page}`
  );
}

export async function getFollowing(
  login: string,
  page = 1,
  per_page = 30
): Promise<GitHubUser[]> {
  return request<GitHubUser[]>(
    `/users/${encodeURIComponent(login)}/following?per_page=${per_page}&page=${page}`
  );
}

export async function updateUserProfile(params: {
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  twitter_username?: string;
}): Promise<GitHubUser> {
  return request<GitHubUser>('/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function getStarredRepos(params: {
  per_page?: number;
  page?: number;
  sort?: 'created' | 'updated';
  direction?: 'asc' | 'desc';
} = {}): Promise<GitHubRepo[]> {
  const { per_page = 30, page = 1, sort = 'created', direction = 'desc' } = params;
  const data = await request<Array<{ starred_at: string; repo: GitHubRepo }>>(
    `/user/starred?per_page=${per_page}&page=${page}&sort=${sort}&direction=${direction}&_starred_at=1`,
    { headers: { Accept: 'application/vnd.github.star+json' } }
  );
  return data.map((item) => item.repo);
}

export async function getStarredCount(): Promise<number> {
  const result = await requestWithPagination<GitHubRepo>('/user/starred?per_page=1');
  if (!result.hasNextPage) return result.data.length;
  const url = `${BASE_URL}/user/starred?per_page=1`;
  const response = await fetch(url, { headers: buildHeaders() });
  const linkHeader = response.headers.get('Link') || '';
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return match ? parseInt(match[1], 10) : result.data.length;
}

export async function followUser(username: string): Promise<void> {
  await request<void>(`/user/following/${encodeURIComponent(username)}`, { method: 'PUT' });
}

export async function unfollowUser(username: string): Promise<void> {
  await request<void>(`/user/following/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export async function checkFollowing(username: string): Promise<boolean> {
  try {
    await request<void>(`/user/following/${encodeURIComponent(username)}`);
    return true;
  } catch {
    return false;
  }
}

export async function getRepoForks(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number; sort?: 'newest' | 'oldest' | 'stargazers' | 'watchers' } = {}
): Promise<GitHubRepo[]> {
  const { per_page = 30, page = 1, sort = 'newest' } = params;
  return request<GitHubRepo[]>(
    `/repos/${owner}/${repo}/forks?per_page=${per_page}&page=${page}&sort=${sort}`
  );
}

export async function getRepoWatchers(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubUser[]> {
  const { per_page = 30, page = 1 } = params;
  return request<GitHubUser[]>(
    `/repos/${owner}/${repo}/subscribers?per_page=${per_page}&page=${page}`
  );
}

export async function getRepoStargazers(
  owner: string,
  repo: string,
  params: { per_page?: number; page?: number } = {}
): Promise<GitHubUser[]> {
  const { per_page = 30, page = 1 } = params;
  return request<GitHubUser[]>(
    `/repos/${owner}/${repo}/stargazers?per_page=${per_page}&page=${page}`
  );
}

async function httpGetTextWithAuth(url: string): Promise<string> {
  const bridge =
    (typeof window !== "undefined" && (window as any).AndroidBridge) || null;
  if (bridge && typeof bridge.httpGetText === "function") {
    const raw = bridge.httpGetText(url, authToken || "");
    let parsed: { status?: number; body?: string; error?: string } = {};
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
    if (parsed.status !== 200) {
      throw new Error(`获取日志失败: ${parsed.status}${parsed.error ? ` (${parsed.error})` : ""}`);
    }
    return parsed.body || "";
  }
  const headers = buildHeaders() as Record<string, string>;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`获取日志失败: ${res.status}`);
  return res.text();
}

export async function getJobLogs(
  owner: string,
  repo: string,
  jobId: number
): Promise<string> {
  const url = `${BASE_URL}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;
  return httpGetTextWithAuth(url);
}

export interface CreateReviewCommentParams {
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
}

export async function createPullRequestReviewComment(
  owner: string,
  repo: string,
  pullNumber: number,
  params: CreateReviewCommentParams
): Promise<GitHubComment> {
  return request<GitHubComment>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

export async function getPullRequestReviewComments(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubComment[]> {
  return request<GitHubComment[]>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`
  );
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface SubmitReviewParams {
  event: ReviewEvent;
  body?: string;
}

export async function submitPullRequestReview(
  owner: string,
  repo: string,
  pullNumber: number,
  params: SubmitReviewParams
): Promise<void> {
  await request(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
    {
      method: 'POST',
      body: JSON.stringify({
        event: params.event,
        body: params.body ?? '',
      }),
    }
  );
}

export interface GitHubDeployKey {
  id: number;
  key: string;
  url: string;
  title: string;
  verified: boolean;
  created_at: string;
  read_only: boolean;
  added_by?: string;
  last_used?: string | null;
}

export async function getDeployKeys(owner: string, repo: string): Promise<GitHubDeployKey[]> {
  return request<GitHubDeployKey[]>(`/repos/${owner}/${repo}/keys`);
}

export async function getDeployKey(owner: string, repo: string, keyId: number): Promise<GitHubDeployKey> {
  return request<GitHubDeployKey>(`/repos/${owner}/${repo}/keys/${keyId}`);
}

export async function createDeployKey(
  owner: string,
  repo: string,
  data: { title: string; key: string; read_only?: boolean }
): Promise<GitHubDeployKey> {
  return request<GitHubDeployKey>(`/repos/${owner}/${repo}/keys`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteDeployKey(owner: string, repo: string, keyId: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/keys/${keyId}`, { method: 'DELETE' });
}

export interface ActionsPermissions {
  enabled: boolean;
  allowed_actions?: 'all' | 'local_only' | 'selected';
  selected_actions_url?: string;
}

export async function getActionsPermissions(owner: string, repo: string): Promise<ActionsPermissions> {
  return request<ActionsPermissions>(`/repos/${owner}/${repo}/actions/permissions`);
}

export async function updateActionsPermissions(
  owner: string,
  repo: string,
  data: { enabled: boolean; allowed_actions?: 'all' | 'local_only' | 'selected' }
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/permissions`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export interface WorkflowPermissions {
  default_workflow_permissions?: 'read' | 'write';
  can_approve_pull_request_reviews?: boolean;
}

export async function getWorkflowPermissions(owner: string, repo: string): Promise<WorkflowPermissions> {
  return request<WorkflowPermissions>(`/repos/${owner}/${repo}/actions/permissions/workflow`);
}

export async function updateWorkflowPermissions(
  owner: string,
  repo: string,
  data: { default_workflow_permissions: 'read' | 'write'; can_approve_pull_request_reviews?: boolean }
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/permissions/workflow`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export interface SelectedActions {
  github_owned_allowed?: boolean;
  verified_allowed?: boolean;
  patterns_allowed?: string[];
}

export async function getSelectedActions(owner: string, repo: string): Promise<SelectedActions> {
  return request<SelectedActions>(`/repos/${owner}/${repo}/actions/permissions/selected-actions`);
}

export async function updateSelectedActions(
  owner: string,
  repo: string,
  data: { github_owned_allowed: boolean; verified_allowed: boolean; patterns_allowed?: string[] }
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/permissions/selected-actions`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export interface ArtifactLogRetention {
  days?: number;
}

export async function getArtifactLogRetention(owner: string, repo: string): Promise<ArtifactLogRetention> {
  return request<ArtifactLogRetention>(`/repos/${owner}/${repo}/actions/permissions/artifact-and-log-retention`);
}

export async function updateArtifactLogRetention(owner: string, repo: string, days: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/permissions/artifact-and-log-retention`, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

export type SecretScope = 'actions' | 'dependabot' | 'codespaces';

function scopePath(scope: SecretScope): string {
  return scope === 'dependabot' ? 'dependabot' : scope === 'codespaces' ? 'codespaces' : 'actions';
}

export interface GitHubVariable {
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

interface VariablesListResp {
  total_count: number;
  variables: GitHubVariable[];
}

export async function getRepoVariables(
  owner: string, repo: string, scope: SecretScope = 'actions'
): Promise<GitHubVariable[]> {
  const resp = await request<VariablesListResp>(`/repos/${owner}/${repo}/${scopePath(scope)}/variables`);
  return resp.variables || [];
}

export async function getRepoVariable(
  owner: string, repo: string, name: string, scope: SecretScope = 'actions'
): Promise<GitHubVariable> {
  return request<GitHubVariable>(`/repos/${owner}/${repo}/${scopePath(scope)}/variables/${encodeURIComponent(name)}`);
}

export async function createRepoVariable(
  owner: string, repo: string, name: string, value: string, scope: SecretScope = 'actions'
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/${scopePath(scope)}/variables`, {
    method: 'POST',
    body: JSON.stringify({ name, value }),
  });
}

export async function updateRepoVariable(
  owner: string, repo: string, name: string, value: string, scope: SecretScope = 'actions'
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/${scopePath(scope)}/variables/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, value }),
  });
}

export async function deleteRepoVariable(
  owner: string, repo: string, name: string, scope: SecretScope = 'actions'
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/${scopePath(scope)}/variables/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export interface GitHubSecret {
  name: string;
  created_at: string;
  updated_at: string;
}

interface SecretsListResp {
  total_count: number;
  secrets: GitHubSecret[];
}

export interface SecretPublicKey {
  key_id: string;
  key: string;
}

export async function getRepoSecrets(
  owner: string, repo: string, scope: SecretScope = 'actions'
): Promise<GitHubSecret[]> {
  const resp = await request<SecretsListResp>(`/repos/${owner}/${repo}/${scopePath(scope)}/secrets`);
  return resp.secrets || [];
}

export async function getRepoSecretPublicKey(
  owner: string, repo: string, scope: SecretScope = 'actions'
): Promise<SecretPublicKey> {
  return request<SecretPublicKey>(`/repos/${owner}/${repo}/${scopePath(scope)}/secrets/public-key`);
}

export async function putRepoSecret(
  owner: string, repo: string, name: string,
  encryptedValue: string, keyId: string, scope: SecretScope = 'actions'
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/${scopePath(scope)}/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyId }),
  });
}

export async function deleteRepoSecret(
  owner: string, repo: string, name: string, scope: SecretScope = 'actions'
): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/${scopePath(scope)}/secrets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export interface GitHubActionCache {
  id: number;
  ref: string;
  key: string;
  version: string;
  size_in_bytes: number;
  created_at: string;
  last_accessed_at: string;
}

export async function getActionCaches(
  owner: string, repo: string, page = 1, per_page = 30
): Promise<GitHubActionCache[]> {
  const resp = await request<{ total_count: number; actions_caches: GitHubActionCache[] }>(
    `/repos/${owner}/${repo}/actions/caches?per_page=${per_page}&page=${page}`
  );
  return resp.actions_caches || [];
}

export async function deleteActionCache(owner: string, repo: string, cacheId: number): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/caches/${cacheId}`, { method: 'DELETE' });
}

export async function deleteActionCacheByKey(owner: string, repo: string, key: string): Promise<void> {
  await request<unknown>(`/repos/${owner}/${repo}/actions/caches?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export async function listUserPackageVersions(
  username: string, packageName: string, packageType = 'container', bust = false
): Promise<import('@/types/types').GitHubPackageVersion[]> {
  const url = `/users/${username}/packages/${packageType}/${encodeURIComponent(packageName)}/versions`;
  return request<import('@/types/types').GitHubPackageVersion[]>(
    bust ? `${url}?_t=${Date.now()}` : url
  );
}

export async function deleteUserPackageVersion(
  username: string, packageName: string, versionId: number, packageType = 'container'
): Promise<void> {
  await request<unknown>(
    `/users/${username}/packages/${packageType}/${encodeURIComponent(packageName)}/versions/${versionId}`,
    { method: 'DELETE' }
  );
}

export async function deleteUserPackage(
  username: string, packageName: string, packageType = 'container'
): Promise<void> {
  await request<unknown>(
    `/users/${username}/packages/${packageType}/${encodeURIComponent(packageName)}`,
    { method: 'DELETE' }
  );
}
