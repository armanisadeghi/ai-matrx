// features/make/gallery/galleryHref.ts — where every "start from a template" door leads.
//
// ONE TEMPLATE FAMILY (lane TEMPLATES, RETIRE-1): published platform templates are read through
// custom.templates and installed through custom.template_install, on /make's gallery. The old
// doors — the scope-template drawer (custom.context_template_apply), /scopes/templates and the
// data home's "Start from an example" (tableFromExample with a use case) — were retired onto it.
// Every entry links here, never to a second gallery.

/** THE gallery, one route for everyone (lane CHAIR-GALLERY, 2026-10-05): /templates. */
export const TEMPLATE_GALLERY_HREF = "/templates";

/**
 * One template's page and install. A version id resolves to the template's readable address
 * (/templates/<slug>); an organization's own saved template opens on the same route, signed in.
 */
export const templatePreviewHref = (templateId: string): string => `/templates/${encodeURIComponent(templateId)}`;
