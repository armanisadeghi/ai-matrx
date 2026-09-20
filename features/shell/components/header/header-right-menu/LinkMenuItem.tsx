import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { useMenuCheckboxId } from "./menuCheckboxId";

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
  const menuCheckboxId = useMenuCheckboxId();
  return (
    <label htmlFor={menuCheckboxId} className="block">
      <AppLink href={href} className={cn(MENU_ITEM_CLASS, className)}>
        <Icon />
        {label}
      </AppLink>
    </label>
  );
}
