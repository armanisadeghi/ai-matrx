import { MandateRecordPage } from "@/features/mandates/record-next/MandateRecordPage";
import { ADMIN_MANDATES_SUPPORT } from "@/features/mandates/admin-routes";

/**
 * /administration/intelligence/mandates/support/[mandateId] — one
 * organization's or person's mandate, opened from Mandate support lookup. By
 * id: a tenant mandate's key can repeat across organizations.
 */
export const metadata = {
  title: "Mandate | Support lookup",
  description: "One organization's or person's mandate, for tech support",
};

export default async function IntelligenceMandateSupportRecordRoute({
  params,
}: {
  params: Promise<{ mandateId: string }>;
}) {
  const { mandateId } = await params;
  return (
    <MandateRecordPage
      mandateKey={mandateId}
      lane="support"
      listHref={ADMIN_MANDATES_SUPPORT}
    />
  );
}
