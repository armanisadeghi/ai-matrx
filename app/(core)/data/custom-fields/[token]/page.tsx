// app/(core)/data/custom-fields/[token]/page.tsx — THE MOUNT, AND NOTHING MORE.
// A standard table's custom fields, opened from the data home's "Custom fields on <table>" row
// (lane ALL-MY-DATA). The screen is features/unified-data/custom-fields.
import { createRouteMetadata } from "@/utils/route-metadata";
import { CustomFieldsSettingsPage } from "@/features/unified-data/custom-fields/CustomFieldsSettingsPage";

export const metadata = createRouteMetadata("/data", {
  titlePrefix: "Custom fields",
  title: "Data",
  description: "The custom fields your organization added to a standard table.",
  letter: "CF",
});

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ org?: string }>;
}

export default async function CustomFieldsRoute({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { org } = await searchParams;
  return <CustomFieldsSettingsPage token={decodeURIComponent(token)} organizationId={org ?? null} />;
}
