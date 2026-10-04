
import {
  getRepo, getRepoLanguages, getReadme, getCommits, checkStarred,
} from '@/services/github';
import type { GitHubRepo, GitHubCommit } from '@/types/types';
import { pageCache } from '@/lib/page-cache';
import { decodeBase64Content } from '@/lib/utils';

const inflight = new Set<string>();
const lastFetched = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export function prefetchRepoDetail(
  owner: string,
  repo: string,
  isOwner: boolean,
): void {
  if (!owner || !repo) return;
  const key = `repodetail:${owner}/${repo}`;

  if (pageCache.get(key)) return;
  if (inflight.has(key)) return;
  const last = lastFetched.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return;

  inflight.add(key);
  lastFetched.set(key, Date.now());

  Promise.all([
    getRepo(owner, repo),
    getRepoLanguages(owner, repo).catch(() => ({})),
    getReadme(owner, repo).catch(() => null),
    getCommits(owner, repo, { per_page: 10 }).catch(() => ({ data: [] as GitHubCommit[], hasNextPage: false })),
    isOwner ? Promise.resolve(false) : checkStarred(owner, repo).catch(() => false),
  ])
    .then(([repoData, langData, readmeData, commitsResult, starredVal]) => {
      const decoded = readmeData?.content ? decodeBase64Content(readmeData.content) : '';
      pageCache.set(key, {
        repo: repoData as GitHubRepo,
        languages: langData as Record<string, number>,
        readme: decoded,
        commits: commitsResult.data,
        starred: starredVal as boolean,
      });
    })
    .catch(() => {
    })
    .finally(() => {
      inflight.delete(key);
    });
}
