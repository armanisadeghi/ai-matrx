// features/applets/reserved-slugs.ts — THE ADDRESSES NO APPLET MAY TAKE.
//
// An Applet runs at `/applets/<slug>` (`app/(link)/applets/[slug]`), beside the owner tools in
// `app/(core)/applets`: `/applets/build`, `/applets/manage/<id>/…`. A static segment out-ranks the
// dynamic one, so an Applet slugged `build` or `manage` would be unreachable. Every path that mints or
// changes a slug passes it through here: the builder (`build-applet.ts`) and the record saves
// (`saveApp` / `saveAppField`). `new` is held for a future create route. The database refuses them too:
// CHECK `definition_slug_not_reserved_check` on `app.definition` (keep the two lists equal).

export const RESERVED_APPLET_SLUGS: readonly string[] = ["build", "manage", "new"];

export function isReservedAppletSlug(slug: string): boolean {
  return RESERVED_APPLET_SLUGS.includes(slug.trim().toLowerCase());
}

/** Throws a person-readable error when `slug` is one of the reserved addresses. */
export function assertAppletSlugAllowed(slug: string): void {
  if (isReservedAppletSlug(slug)) throw new Error(`"${slug}" is a reserved address — choose another web address for this Applet.`);
}
