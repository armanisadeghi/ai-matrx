/**
 * Stable deep-link identity for an authored setting. This is deliberately
 * separate from the React input id: controls remount, while setting doors and
 * bookmarked search results must keep resolving to the same row.
 */
export function settingsControlSearchId(sectionTitle: string, label: string): string {
  const slug = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "setting";
  return `settings-control-${slug(sectionTitle)}-${slug(label)}`;
}
