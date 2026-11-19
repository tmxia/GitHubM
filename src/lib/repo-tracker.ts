import { lsGet, lsSet } from '@/lib/storage';

const CURRENT_REPO_KEY = 'ghm_current_repo';

export function setCurrentRepo(fullName: string) {
  if (fullName) lsSet(CURRENT_REPO_KEY, fullName);
}

export function getCurrentRepo(): string | null {
  return lsGet(CURRENT_REPO_KEY);
}
