// One initiative, opened inside its client's Planning section. `[id]` is a
// plain initiative UUID (initiatives carry no URL key), so it is passed
// straight through to the canonical detail component.

import { InitiativeDetail } from "@/features/marketing/initiatives/InitiativeDetail";

export default async function BrandInitiativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InitiativeDetail id={id} />;
}
