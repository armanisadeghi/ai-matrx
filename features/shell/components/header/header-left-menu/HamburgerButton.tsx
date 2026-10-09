import { MenuTapButton } from "@ai-matrx/design-system/tap-target/buttons";

export default function HamburgerButton({ className }: { className?: string }) {
  return (
    <div className={className ? `shell-mobile-trigger ${className}` : "shell-mobile-trigger"}>
      <MenuTapButton variant="transparent" as="label" htmlFor="shell-mobile-menu" ariaLabel="Open navigation menu" />
    </div>
  );
}
