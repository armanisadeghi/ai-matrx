export type SettingDoorTarget =
  | {
      scope: "user";
      tabId: string;
      controlId: string;
    }
  | {
      scope: "organization";
      organizationSlugOrId: string;
      controlId: string;
      /** Non-sensitive intent only; it becomes part of the URL. */
      requestedValue?: string | null;
    };

/** `FIRST_SCREEN_TAB.id` — the settings index, reached at the base path. */
export const FIRST_SCREEN_TAB_ID = "firstScreen";

export function settingDoorHref(target: SettingDoorTarget): string {
  if (target.scope === "user") {
    const query = new URLSearchParams({
      control: target.controlId,
    });
    // The first screen is the settings INDEX (`/user-settings`), not a tab
    // path — `/user-settings/first-screen` renders "choose a category".
    if (target.tabId === FIRST_SCREEN_TAB_ID) {
      return `/user-settings?${query.toString()}`;
    }
    const path = target.tabId
      .split(".")
      .map((segment) =>
        segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
      )
      .join("/");
    return `/user-settings/${path}?${query.toString()}`;
  }

  const query = new URLSearchParams();
  if (target.requestedValue?.trim()) {
    query.set("setting_value", target.requestedValue.trim());
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/organizations/${encodeURIComponent(target.organizationSlugOrId)}/settings${suffix}#${encodeURIComponent(target.controlId)}`;
}
