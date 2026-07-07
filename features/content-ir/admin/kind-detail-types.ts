/**
 * Pure types shared between the server-side shape-doctor gather
 * (shape-doctor-server.ts, `server-only`) and the client tab components of
 * /administration/kind-registry/[kind]. No runtime imports of either side —
 * keeping the server module's poison pill out of client chunks.
 */

import type { Json } from "@/types/database.types";
import type {
  ShapeKindRow,
  SkillTeaching,
} from "@/features/content-ir/registry/shape-doctor";

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
