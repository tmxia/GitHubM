const CURRENT_REPO_KEY = 'ghm_current_repo';

export function setCurrentRepo(fullName: string) {
  if (fullName) {
    localStorage.setItem(CURRENT_REPO_KEY, fullName);
  }
}

export function getCurrentRepo(): string | null {
  return localStorage.getItem(CURRENT_REPO_KEY);
}
