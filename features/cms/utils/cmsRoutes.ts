/**
 * In-app CMS routes — the doors every other feature uses to reach a CMS site
 * or page editor.
 *
 * These are APP routes (`/cms/...` inside this Next app), NOT public page URLs
 * — the visitor-facing builders live in `pageUrls.ts` and are twinned with
 * aidream/my-matrx. Nothing here is twinned; it only has to agree with
 * `app/(core)/cms/**`.
 *
 * THE DOOR LAW: any surface that names a CMS page (a plan badge, a push card,
 * a workspace header) must be able to open it. Build the href here so the
 * route shape lives in exactly one place.
 */

export function cmsSiteHref(cmsSiteId: string): string {
  return `/cms/${cmsSiteId}`;
}

/**
 * `tab` deep-links straight into one of the editor's tabs — the editor reads
 * `?tab=` on mount and writes it on every switch, so a door can open the Plan
 * or Measure tab directly instead of dropping the user on Code.
 */
export type CmsPageEditorTabParam =
  | "html"
  | "css"
  | "js"
  | "code"
  | "preview"
  | "plan"
  | "seo"
  | "measure"
  | "settings"
  | "versions";

export function cmsPageEditorHref(
  cmsSiteId: string,
  cmsPageId: string,
  tab?: CmsPageEditorTabParam,
): string {
  const base = `/cms/${cmsSiteId}/pages/${cmsPageId}`;
  return tab ? `${base}?tab=${tab}` : base;
}
