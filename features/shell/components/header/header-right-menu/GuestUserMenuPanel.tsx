import { OverlayMenuItem } from "./OverlayMenuItem";
import { ThemeToggleMenuItem } from "./ThemeToggleMenuItem";
import { MenuGroup } from "./MenuGroup";
import { GuestHeroCard } from "./GuestHeroCard";
import { GuestOverlayMenuItem } from "./GuestOverlayMenuItem";
import {
  QUICK_ACCESS_ITEMS,
  COMMUNICATION_ITEMS,
  SETTINGS_ITEMS,
} from "./userMenuItems.constants";
import { USER_MENU_PANEL_CLASS } from "./menuItemClass";

const divider = (
  <div className="h-px my-1 mx-2 bg-[var(--matrx-glass-border-color)]" />
);

/**
 * Mirror of `UserMenuPanel` for unauthenticated visitors. Same structure so
 * the surface feels familiar, but auth-required items route through
 * `AuthGateDialog` (via `GuestOverlayMenuItem`) and items that genuinely
 * require an account (Sign Out, Admin, Messages, Notifications) are absent.
 */
export default function GuestUserMenuPanel() {
  return (
    <div className={USER_MENU_PANEL_CLASS}>
      <GuestHeroCard />

      {divider}

      <MenuGroup
        id="quick"
        icon="Rocket"
        label="Quick Access"
        defaultOpen={true}
      >
        {QUICK_ACCESS_ITEMS.map((item) =>
          item.requiresAuth ? (
            <GuestOverlayMenuItem
              key={item.overlayId}
              icon={item.icon}
              label={item.label}
              description={item.guestDescription}
              className={item.className}
            />
          ) : (
            <OverlayMenuItem key={item.overlayId} {...item} />
          ),
        )}
      </MenuGroup>

      {divider}

      {COMMUNICATION_ITEMS.map((item) =>
        item.requiresAuth ? (
          <GuestOverlayMenuItem
            key={item.overlayId}
            icon={item.icon}
            label={item.label}
            description={item.guestDescription}
            className={item.className}
          />
        ) : (
          <OverlayMenuItem key={item.overlayId} {...item} />
        ),
      )}

      {divider}

      <ThemeToggleMenuItem />
      {SETTINGS_ITEMS.map((item) =>
        item.requiresAuth ? (
          <GuestOverlayMenuItem
            key={item.overlayId}
            icon={item.icon}
            label={item.label}
            description={item.guestDescription}
            className={item.className}
          />
        ) : (
          <OverlayMenuItem key={item.overlayId} {...item} />
        ),
      )}
    </div>
  );
}
