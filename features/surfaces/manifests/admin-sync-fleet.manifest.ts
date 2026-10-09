import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
export const ADMIN_SYNC_FLEET_SURFACE_NAME = "matrx-admin/sync-fleet";
const groups: SurfaceValueGroup[] = [
  { key: "fleet", label: "Sync fleet", sortOrder: 100 },
  { key: "health", label: "Fleet health", sortOrder: 200 },
  { key: "view", label: "Table views", sortOrder: 300 },
];
const values: SurfaceValue[] = [
  {
    name: "sync_mappings",
    label: "Sync mappings",
    description:
      "Path-free mapping rows loaded by the server, capped at 1000. An empty array means a successful empty read; this client never mounts during a failed read.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    autoContext: false,
    group: "fleet",
    sortOrder: 0,
  },
  {
    name: "sync_mapping_count",
    label: "Sync mapping count",
    description:
      "Count of loaded path-free mapping rows, before segment searches.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "fleet",
    sortOrder: 10,
  },
  {
    name: "fleet_health",
    label: "Fleet health",
    description:
      "Current segment counts, account quota count and observation time; segments overlap.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1000,
    autoContext: true,
    group: "health",
    sortOrder: 20,
  },
  {
    name: "observed_at",
    label: "Observed at",
    description:
      "Browser clock in epoch milliseconds used to classify silent devices and display relative timestamps.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 13,
    autoContext: false,
    group: "health",
    sortOrder: 30,
  },
  {
    name: "accounts_over_quota",
    label: "Accounts over quota",
    description: "Unique accounts among the loaded over-quota mappings.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "health",
    sortOrder: 40,
  },
  {
    name: "over_quota_mappings",
    label: "Over quota mappings",
    description:
      "Loaded mappings in this health segment before its table search/filter; segments can overlap.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "health",
    sortOrder: 50,
  },
  {
    name: "over_quota_count",
    label: "Over quota count",
    description:
      "Count of loaded mappings in this health segment before its table search/filter.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "health",
    sortOrder: 60,
  },
  {
    name: "stalled_mappings",
    label: "Stopped mappings",
    description:
      "Loaded mappings in this health segment before its table search/filter; segments can overlap.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "health",
    sortOrder: 70,
  },
  {
    name: "stalled_count",
    label: "Stopped count",
    description:
      "Count of loaded mappings in this health segment before its table search/filter.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "health",
    sortOrder: 80,
  },
  {
    name: "degraded_mappings",
    label: "Degraded mappings",
    description:
      "Loaded mappings in this health segment before its table search/filter; segments can overlap.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "health",
    sortOrder: 90,
  },
  {
    name: "degraded_count",
    label: "Degraded count",
    description:
      "Count of loaded mappings in this health segment before its table search/filter.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "health",
    sortOrder: 100,
  },
  {
    name: "behind_mappings",
    label: "Devices behind mappings",
    description:
      "Loaded mappings in this health segment before its table search/filter; segments can overlap.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "health",
    sortOrder: 110,
  },
  {
    name: "behind_count",
    label: "Devices behind count",
    description:
      "Count of loaded mappings in this health segment before its table search/filter.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    autoContext: true,
    group: "health",
    sortOrder: 120,
  },
  {
    name: "fleet_table_views",
    label: "Fleet table views",
    description:
      "Per-segment canonical table query and processed rows, including searches, filters, sort and pagination; populated after each table reports its view.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    autoContext: false,
    group: "view",
    sortOrder: 130,
  },
  {
    name: "load_state",
    label: "Load state",
    description:
      "Ready: the server awaits the database read before mounting this client. Failures reach the route error boundary, not an empty array.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    autoContext: true,
    group: "view",
    sortOrder: 140,
  },
];
export const adminSyncFleetManifest: SurfaceManifest = {
  surfaceName: ADMIN_SYNC_FLEET_SURFACE_NAME,
  client: "matrx-admin",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  label: "Sync fleet",
  description:
    "Path-free organization-authorized folder sync health. Mapping rows and overlapping quota, stopped, degraded and silent-device segments describe the loaded fleet, with each table view exposed separately. Local folders and private storage ledgers are not loaded here.",
  urlPattern: "/administration/applications/sync",
  readiness: "partial",
  readinessNote:
    "Complete live scope and canonical menu authored; browser behavior, helper isolation and independent certification remain to be verified.",
  intro: `<surface_intro>Path-free organization-authorized folder sync health. Mapping rows and overlapping quota, stopped, degraded and silent-device segments describe the loaded fleet, with each table view exposed separately. Local folders and private storage ledgers are not loaded here.</surface_intro>`,
  groups,
  values: mergeBaselineValues([], values),
};
export function createAdminSyncFleetScope(values: {
  sync_mappings: unknown[];
  sync_mapping_count: number;
  fleet_health: object;
  observed_at: number;
  accounts_over_quota: number;
  over_quota_mappings: unknown[];
  over_quota_count: number;
  stalled_mappings: unknown[];
  stalled_count: number;
  degraded_mappings: unknown[];
  degraded_count: number;
  behind_mappings: unknown[];
  behind_count: number;
  fleet_table_views: object;
  load_state: "ready";
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values;
}
