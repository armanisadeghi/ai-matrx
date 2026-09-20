/**
 * Refcount store: MatrxDynamicPanel claims when its chrome covers the shell
 * avatar corner. ElevatedShellUserMenuRoot renders the replacement menu while
 * any claim is held.
 *
 * The elevated chrome reuses AppShell's `#shell-user-menu` checkbox so every
 * menu item that closes via `htmlFor="shell-user-menu"` keeps working.
 */

type Listener = () => void;

let claimCount = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setDocumentFlag(active: boolean): void {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.dataset.dynamicPanelAvatarCover = "true";
  } else {
    delete document.documentElement.dataset.dynamicPanelAvatarCover;
  }
  const shellToggle = document.getElementById(
    "shell-user-menu",
  ) as HTMLInputElement | null;
  if (shellToggle) shellToggle.checked = false;
}

export function subscribeDynamicPanelAvatarCover(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDynamicPanelAvatarCoverActive(): boolean {
  return claimCount > 0;
}

/** Hold a claim while a panel covers the avatar. Returns a release function. */
export function claimDynamicPanelAvatarCover(): () => void {
  claimCount += 1;
  if (claimCount === 1) {
    setDocumentFlag(true);
  }
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claimCount = Math.max(0, claimCount - 1);
    if (claimCount === 0) {
      setDocumentFlag(false);
    }
    emit();
  };
}
