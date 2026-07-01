/** Uncheck the CSS-driven mobile nav sheet (`#shell-mobile-menu`). */
export function closeShellMobileMenu(): void {
  const checkbox = document.getElementById(
    "shell-mobile-menu",
  ) as HTMLInputElement | null;
  if (checkbox?.checked) checkbox.checked = false;
}
