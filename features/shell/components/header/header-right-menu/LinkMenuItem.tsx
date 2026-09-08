import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";

interface LinkMenuItemProps {
  href: string;
  icon: MenuIconKey;
  label: string;
  className?: string;
}

export function LinkMenuItem({
  href,
  icon,
  label,
  className,
}: LinkMenuItemProps) {
  const Icon = getMenuIcon(icon);
  return (
    <label htmlFor="shell-user-menu" className="block">
      <AppLink href={href} className={cn(MENU_ITEM_CLASS, className)}>
        <Icon />
        {label}
      </AppLink>
    </label>
  );
}
