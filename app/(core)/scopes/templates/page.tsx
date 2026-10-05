// record-view: none — a retired address that forwards to the one template gallery
// app/(core)/scopes/templates/page.tsx — the scope-template catalogue was retired onto the template
// family (lane TEMPLATES, RETIRE-1): every published template, scope templates included, is on
// /make's gallery. An old link lands there.

import { redirect } from "next/navigation";
import { TEMPLATE_GALLERY_HREF } from "@/features/make/gallery/galleryHref";

export default function ScopesTemplatesPage(): never {
  redirect(TEMPLATE_GALLERY_HREF);
}
