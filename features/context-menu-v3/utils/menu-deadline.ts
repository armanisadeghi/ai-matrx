// features/context-menu-v3/utils/menu-deadline.ts
//
// A menu library (AI Actions, My Items, Org Items, Agents) that is still
// fetching shows "Loading…" on its row. Without a bound, a slow or hung fetch
// leaves that word there for as long as the menu is open — a screen that
// never ends (page-pass 2026-09-27, /education/progress). Every library fetch
// the menu starts races this deadline; past it the row stops claiming to load
// and offers a retry. The fetch itself keeps running, so rows still arrive if
// it lands later.

export const MENU_LIBRARY_DEADLINE_MS = 8_000;

export class MenuLibraryTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} took longer than ${Math.round(ms / 1000)}s`);
    this.name = "MenuLibraryTimeoutError";
  }
}

export function withMenuDeadline<T>(
  work: Promise<T>,
  what: string,
  ms: number = MENU_LIBRARY_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MenuLibraryTimeoutError(what, ms)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
