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
      <AppLink href={href} className={cn(MENU_ITEM_CLASS, className)}>
        <Icon />
        {label}
      </AppLink>
    </MenuItemCloseLabel>
  );
}
