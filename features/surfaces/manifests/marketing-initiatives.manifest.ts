import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
const groups: SurfaceValueGroup[] = [
  {
    key: "initiative_context",
    label: "Initiative context",
    sortOrder: 100,
    description: "The initiative list or the single initiative currently open.",
  },
];
const values: SurfaceValue[] = [
  {
    name: "page_kind",
    label: "Page kind",
    description:
      '"list" on the initiative portfolio and "detail" when one initiative is open.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "initiative_context",
    sortOrder: 100,
  },
  {
    name: "initiative_id",
    label: "Initiative ID",
    description: "UUID of the open initiative. Empty on the initiatives list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "initiative_context",
    sortOrder: 110,
  },
  {
    name: "initiative",
    label: "Open initiative",
    description:
      "The open initiative's identity, brand, objective, goal, status, date window, and budget. Empty on the list or before the record loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    group: "initiative_context",
    sortOrder: 120,
  },
];
export const marketingInitiativesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-initiatives",
  readiness: "partial",
  readinessNote:
    "Manifest, route mapping, and list/detail emitters are wired; live binding verification remains.",
  label: "Marketing Initiatives",
  urlPattern: "/marketing/initiatives*",
  intro: `<surface_intro>You are in Marketing Initiatives: containers uniting work across content, social, email, ads, and outreach under one objective, goal, timeline, and budget. Ground answers in the open initiative and linked brand; never invent channel work or attribution.</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), values),
};
export function createMarketingInitiativesScope(values: {
  page_kind: "list" | "detail";
  initiative_id?: string;
  initiative?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values;
}
