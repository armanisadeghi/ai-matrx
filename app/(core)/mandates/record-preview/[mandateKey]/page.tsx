import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MandateRecordPage } from "@/features/mandates/record-next/MandateRecordPage";
import { PERSON_MANDATE_LIST_HREF } from "@/features/mandates/member-list/routes";

/**
 * /mandates/record-preview/[mandateKey] — the NEW mandate record page from the
 * PERSON's seat, built beside /mandates/[mandateKey] (untouched). Same record
 * page as the admin preview with level="person": only the tabs a person may
 * use, and the Binding tab shows which level's binding runs for you and why.
 */
export default async function UserMandateRecordPreviewRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");
  // The App Router already decodes dynamic params — never decode twice.
  const { mandateKey } = await params;
  return (
    <MandateRecordPage
      mandateKey={mandateKey}
      level="person"
      listHref={PERSON_MANDATE_LIST_HREF}
    />
  );
}
