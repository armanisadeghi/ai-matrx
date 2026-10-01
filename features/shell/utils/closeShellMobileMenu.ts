/** Uncheck the CSS-driven mobile nav sheet (`#shell-mobile-menu`). */
export function closeShellMobileMenu(): void {
  const checkbox = document.getElementById(
    "shell-mobile-menu",
  ) as HTMLInputElement | null;
  if (checkbox?.checked) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Open the shell's navigation drawer — for a page that draws its own header
 * (the canvas workspace) and so has no shell hamburger on screen.
 */
export function openShellMobileMenu(): void {
  const checkbox = document.getElementById(
    "shell-mobile-menu",
  ) as HTMLInputElement | null;
  if (!checkbox) {
    console.error("[shell] #shell-mobile-menu is missing — this page is outside AppShell, so it has no navigation drawer.");
    return;
  }
  if (!checkbox.checked) {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
