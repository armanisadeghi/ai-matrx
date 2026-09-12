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

export function settingDoorHref(target: SettingDoorTarget): string {
  if (target.scope === "user") {
    const query = new URLSearchParams({
      control: target.controlId,
    });
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
