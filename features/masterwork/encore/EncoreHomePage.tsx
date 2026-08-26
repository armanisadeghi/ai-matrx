"use client";

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { encoreListConfig } from "./browse/listConfig";

/** Encore is an inventory of released Masterworks, so it uses the same
 * canonical /all list shell as Agents, Transcripts, Workflows, and Rulebooks. */
export function EncoreHomePage() {
  return <EntityListPage config={encoreListConfig} />;
}
