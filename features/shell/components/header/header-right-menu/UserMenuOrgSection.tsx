"use client";

// UserMenuOrgSection — the active-organization switcher INSIDE the user-menu
// dropdown. The persistent home for org selection: the user can always see the
// current org (in words — "Working in Acme"), switch it, and pin a default.
// HeaderChooseOrgButton appears in the header only while no org is chosen; this
// section is always available. Both render the ONE shared control
// (OrganizationPickerPanel → `@ai-matrx/design-system`'s OrganizationPicker),
// so this menu, the header nudge, Workflow Studio's sidebar and the admin
// dashboard are pixel-identical.

import { useIsMounted } from "@/hooks/use-is-mounted";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";
import { MenuGroup } from "./MenuGroup";
import { MENU_ITEM_CLASS } from "./menuItemClass";

export default function UserMenuOrgSection() {
  const isMounted = useIsMounted();
  const promptForOrg = useAppSelector(selectShouldPromptForOrganization);

  return (
    <MenuGroup
      id="organization"
      icon="Building2"
      label="Organization"
      iconClassName={promptForOrg ? "[&_svg]:text-red-500" : undefined}
    >
      {!isMounted ? (
        <div className="space-y-1 px-3 py-1">
          <div className="h-5 animate-pulse rounded-full bg-muted" />
          <div className="h-5 animate-pulse rounded-full bg-muted" />
        </div>
      ) : (
        <OrganizationPickerPanel hideHeading itemClassName={MENU_ITEM_CLASS} />
      )}
    </MenuGroup>
  );
}
