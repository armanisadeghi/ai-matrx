// app/(link)/not-found.tsx — WHAT A LINK THAT OPENS NOTHING ANSWERS.
//
// Without this file, `notFound()` from `/f`, `/b` and `/b/manage` fell through to
// `app/not-found.tsx` — the product's own 404, which draws a "browse AI Matrx" grid of
// workspace links. The person reading it is somebody's patient or somebody's customer who
// followed a link from a text message and has never used this product. That screen was an
// advertisement served as an error.
//
// One sentence, the same shape every other refusal on these routes takes.

import { NO_SUCH_LINK, PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";

export default function LinkNotFound() {
  return <PublicLinkNotice title="This link does not open" message={NO_SUCH_LINK} />;
}
