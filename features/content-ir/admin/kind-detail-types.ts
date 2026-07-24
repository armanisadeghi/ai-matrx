/**
 * Pure types shared between the server-side shape-doctor gather
 * (shape-doctor-server.ts, `server-only`) and the client tab components of
 * /administration/utilities/kind-registry/[kind]. No runtime imports of either side —
 * keeping the server module's poison pill out of client chunks.
 */

import type { Json } from "@/types/database.types";
import type {
  AssetCell,
  AssetColumn,
  ShapeDoctorReport,
  ShapeFinding,
  ShapeKindRow,
  SkillTeaching,
} from "@/features/content-ir/registry/shape-doctor";

// ─── Kind status board model (built server-side, rendered client-side) ──────

export type BoardRowPresence = "both" | "live-only" | "snapshot-only";

export interface KindBoardRow {
  kind: string;
  label: string;
  isActive: boolean;
  presence: BoardRowPresence;
  /** Live cells (snapshot-only rows carry the snapshot's statuses, no details). */
  cells: Record<AssetColumn, AssetCell>;
  /** Cells whose status differs from the committed snapshot. */
  driftedCells: AssetColumn[];
  /** is_active flipped vs the snapshot. */
  activeDrift: boolean;
  /** Live RED finding codes naming this kind. */
  redCodes: string[];
  /** kind_definition.version — null for snapshot-only rows (gone from live DB). */
  version: number | null;
  /** kind_definition.visibility — null for snapshot-only rows. */
  visibility: string | null;
  /** Contract family from the committed content-ir contract manifest, when declared. */
  family: string | null;
  /** Live kind_component row count (0 for snapshot-only rows). */
  componentCount: number;
  /** Live kind_surface row count (0 for snapshot-only rows). */
  surfaceCount: number;
  /** Live kind_example row count (0 for snapshot-only rows). */
  exampleCount: number;
  /** At least one canonical kind_example row exists live. */
  hasCanonicalExample: boolean;
}

export interface KindStatusBoardModel {
  rows: KindBoardRow[];
  redFindings: ShapeFinding[];
  yellowFindingCount: number;
  totals: ShapeDoctorReport["totals"];
  driftedRowCount: number;
  snapshotStamp: string;
  excludedFromDrift: AssetColumn[];
  warnings: string[];
  generatedAt: string;
}

export interface KindComponentDetail {
  id: string;
  platform: string;
  role: string;
  componentKey: string;
  source: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface KindSurfaceDetail {
  id: string;
  surfaceType: string;
  token: string;
  parserStrategy: string;
  streaming: boolean;
  isActive: boolean;
}

/** The [kind] page's server payload — everything the tabs need except the
 * kind_example rows, which the Preview/Gate tabs load in the browser. */
export interface KindDetailData {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  version: number;
  visibility: string;
  updatedAt: string;
  /** kind_definition.data — the ordered StoredFieldElement[] (ts-owned kinds). */
  fieldData: Json | null;
  emittedJsonSchema: Json | null;
  doctorRow: ShapeKindRow;
  /** render_block skills the doctor attributes to this kind. */
  skills: SkillTeaching[];
  /** Content blocks whose template demonstrates this kind's `__kind` JSON. */
  contentBlocks: Array<{ id: string; label: string }>;
  components: KindComponentDetail[];
  surfaces: KindSurfaceDetail[];
  warnings: string[];
}

/** One `content_ir.kind_example` row as the browser tabs consume it. */
export interface KindExampleListItem {
  id: string;
  label: string | null;
  description: string | null;
  isCanonical: boolean;
  source: string;
  validationStatus: string;
  kindVersion: number;
  data: Json;
  updatedAt: string;
}
