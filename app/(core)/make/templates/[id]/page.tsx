// record-view: none — a store template preview, not a standard table row
// app/(core)/make/templates/[id]/page.tsx — THE MOUNT for one template's preview (lane MAKE-HOME,
// wave 4). The page is `features/make/gallery/TemplatePreviewPage.tsx`; nothing is read here — the
// card, the install and its progress all happen in the browser through the catalogue door.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import TemplatePreviewPage from "@/features/make/gallery/TemplatePreviewPage";

export default async function MakeTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(`/make/templates/${id}`));
  return <TemplatePreviewPage templateId={id} />;
}
