import { MenuTapButton } from "@ai-matrx/tap-target/buttons";

export default function HamburgerButton({ className }: { className?: string }) {
  return (
    <div className={className ? `shell-mobile-trigger ${className}` : "shell-mobile-trigger"}>
      <MenuTapButton as="label" htmlFor="shell-mobile-menu" ariaLabel="Open navigation menu" />
    </div>
  );
}
