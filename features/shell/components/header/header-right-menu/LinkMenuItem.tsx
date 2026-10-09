import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { MenuItemCloseLabel } from "./menuCheckboxId";

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
    <MenuItemCloseLabel>
      {/* A menu item sits in a menu that is mounted (hidden) on every page: never prefetch it. */}
      <AppLink prefetch={false} href={href} className={cn(MENU_ITEM_CLASS, className)}>
        <Icon />
        {label}
      </AppLink>
    </MenuItemCloseLabel>
  );
}
