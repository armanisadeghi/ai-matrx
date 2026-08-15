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
      tab: target.tabId,
      control: target.controlId,
    });
    return `/settings/preferences?${query.toString()}`;
  }

  const query = new URLSearchParams();
  if (target.requestedValue?.trim()) {
    query.set("setting_value", target.requestedValue.trim());
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/organizations/${encodeURIComponent(target.organizationSlugOrId)}/settings${suffix}#${encodeURIComponent(target.controlId)}`;
}
