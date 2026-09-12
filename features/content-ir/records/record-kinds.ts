/**
 * The declared record kinds.
 *
 * Importing this module registers them. Every consumer of the record chrome
 * imports THIS module (never the bare registry) so the declarations can never
 * be missing at the moment the host asks — a chrome that silently does not
 * appear is the exact "dead screen" the platform forbids.
 *
 * Adding a kind here is the whole job: the badge, the count link, Confirm and
 * Archive all come from the shared mechanism.
 */

import { registerKindRecordDisposition } from "./kind-record-registry";

registerKindRecordDisposition({
  kind: "wine_tasting",
  disposition: "record",
  label: "Wine Tasting",
  labelPlural: "Wine Tastings",
});

export {};
