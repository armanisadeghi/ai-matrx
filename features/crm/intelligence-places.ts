// features/crm/intelligence-places.ts
//
// WHERE EACH CRM JOB RUNS — drawn on /intelligence/crm.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { CRM_SAVE_CONTACT_AGENT_MANDATE } from "./constants";

const K = MANDATE_KEYS;

export const CRM_PLACES: FeaturePlaces = {
  feature: "crm",
  label: "CRM",
  aliases: { CRM_SAVE_CONTACT_AGENT_MANDATE },
  roots: ["features/crm", "app/(core)/crm"],
  places: [
    {
      id: "save-contact",
      label: "Any page",
      trigger: "Save selected text as a contact",
      mandateKeys: [K.crm__save_contact],
      sources: ["features/crm/components/SaveContactFromSelectionDialog.tsx"],
    },
    {
      id: "chasebox",
      label: "Chasebox",
      trigger: "Draft review",
      urlPattern: "/crm/chasebox",
      mandateKeys: [K.crm__outreach_draft_reviewer],
      sources: ["features/surfaces/manifests/crm-chasebox.manifest.ts"],
    },
    {
      id: "outreach-lists",
      label: "Outreach lists",
      trigger: "Pitch writing and personalization",
      urlPattern: "/crm/outreach-lists",
      mandateKeys: [K.crm__outreach_pitch_writer, K.crm__outreach_personalization_coach],
      sources: ["features/surfaces/manifests/crm-outreach-lists.manifest.ts"],
    },
  ],
};
