// features/make/gallery/galleryHref.ts — where every "start from a template" door leads.
//
// ONE TEMPLATE FAMILY (lane TEMPLATES, RETIRE-1): published platform templates are read through
// custom.templates and installed through custom.template_install, on /make's gallery. The old
// doors — the scope-template drawer (custom.context_template_apply), /scopes/templates and the
// data home's "Start from an example" (tableFromExample with a use case) — were retired onto it.
// Every entry links here, never to a second gallery.

/** The /make gallery, scrolled to its "Start from a template" section. */
export const TEMPLATE_GALLERY_HREF = "/make#make-templates";

/** One published template's preview and install. */
export const templatePreviewHref = (templateId: string): string => `/make/templates/${encodeURIComponent(templateId)}`;
