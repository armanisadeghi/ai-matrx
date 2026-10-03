/**
 * Records for the work items (note, chat, file): one property manager's
 * turnover of Unit 4B. Rows carry every column of their generated table type.
 */

import type { Database } from "@/types/database.types";
import { ORGANIZATION, PERSON } from "./people";
import { seed, seedRpc } from "./fake-backend";

export const NOTE_ID = "3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718";
export const NOTE_TEXT = "Paint touch-ups in the hallway and both bedrooms.";

const note = {
  id: NOTE_ID,
  label: "Unit 4B turnover checklist",
  content: NOTE_TEXT,
  content_hash: null,
  content_preview: NOTE_TEXT,
  created_at: "2026-09-28T15:00:00.000Z",
  created_by: PERSON.id,
  custom_fields: {},
  deleted_at: null,
  file_path: null,
  folder_id: null,
  folder_name: "Turnovers",
  last_device_id: null,
  metadata: {},
  organization_id: ORGANIZATION.id,
  position: 0,
  project_id: null,
  published_to_web: false,
  published_to_web_at: null,
  published_to_web_by: null,
  search_engine_indexed: null,
  shown_to: null,
  sync_version: 3,
  tags: ["turnover", "unit-4b"],
  task_id: null,
  updated_at: "2026-09-30T18:22:00.000Z",
  updated_by: PERSON.id,
  version: 3,
  visibility: "private",
} satisfies Database["workbench"]["Tables"]["notes"]["Row"];

export function seedNote(): void {
  seed("workbench.notes", [note]);
  seedRpc("get_notes_shared_with_me", []);
  seedRpc("mbr_count", [{ container_id: ORGANIZATION.id, member_count: 4 }]);
}
