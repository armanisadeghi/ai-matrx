// features/data-tables/data-source/where-a-table-is-born.ts — WHERE A NEW TABLE IS BORN.
//
// Every table is born in the record store (`custom.*`). This module only settles the two facts
// the store's doors need for the birth: the organization the person is making it in (the
// caller's, never derived here — `ensureOrgId` holds the request when there is none) and the
// signed-in person, for the actor envelope.

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@ai-matrx/chat/host/org";

import { signedInUserId, type RecordStoreHome } from "./table-home";

export type BirthStore =
  | { ok: true; store: "record"; home: RecordStoreHome }
  | { ok: false; error: string };

/** Where a table this person makes for `organizationId` is born. */
export async function whereANewTableIsBorn(organizationId?: string | null): Promise<BirthStore> {
  // object-org-exempt: a NEW table has no organization of its own yet; it is born where the person chose to make it
  const org = await withOrganizationRefusalShown("created", () => ensureOrgId(organizationId ?? null), {
    subject: "The table",
  });
  const userId = await signedInUserId();
  return { ok: true, store: "record", home: { store: "record", organizationId: org, userId } };
}
