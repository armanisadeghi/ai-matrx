// app/(core)/marketing/[brandId]/content/map/page.tsx
//
// The SAME screen as `../page.tsx`, at an address no browser has ever cached a
// redirect for.
//
// Until the placement decision shipped, `/marketing/<brand>/content` answered
// with `permanentRedirect` — an HTTP 308, which browsers cache indefinitely.
// Every visitor who opened it before today will keep being sent to the content
// plan from their own cache, past any change we make on the server. So the
// sidebar and every in-app entry point link HERE
// (`marketingRoutes.brandTopicalMapHome`), and `/content` stays a real,
// shareable address for everyone else.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { TopicalMapHome } from "@/features/marketing/seo/topical-map/components/TopicalMapHome";
import { TopicalMapHomeHeader } from "@/features/marketing/seo/topical-map/components/TopicalMapHomeHeader";

export default function BrandTopicalMapHomePage() {
  return (
    <>
      <PageHeader>
        <TopicalMapHomeHeader />
      </PageHeader>
      <TopicalMapHome />
    </>
  );
}
