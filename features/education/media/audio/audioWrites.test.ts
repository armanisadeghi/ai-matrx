import type { StudyMediaRow } from "../types";
import { parseAudioUpdate, updateAudioStudy } from "./audioWrites";
import { getResourceAccess } from "@/utils/permissions/access";
import { studyMediaService } from "../service";

jest.mock("@/features/files/api/files", () => ({ getFileMetadata: jest.fn(async () => ({ data: { id: "file-2", mime_type: "audio/wav" } })) }));
jest.mock("@/utils/permissions/access", () => ({ getResourceAccess: jest.fn() }));
jest.mock("../service", () => ({ studyMediaService: { updateVersioned: jest.fn() } }));
jest.mock("@/features/surfaces/runtime/surface-writeback", () => ({ refuseSurfaceWrite: jest.fn() }));

const row: StudyMediaRow = {
  audio_file_id: "file-1", audio_format: "overview", config: {}, created_at: "2026-09-27T00:00:00Z",
  created_by: "user-1", custom_fields: {}, deleted_at: null, description: "Original description",
  diagram_kind: null, duration_seconds: 12, episode_id: "episode-1", id: "audio-1", ir_envelope: null,
  media_kind: "audio", metadata: {}, organization_id: "org-1", run_id: "run-1", shown_to: null,
  source_id: "source-1", source_kind: "note", source_title: "Lecture", status: "ready", title: "Original",
  trust: { confidence: "grounded", citations: [] }, updated_at: "2026-09-27T00:00:00Z", updated_by: "user-1", version: 7, visibility: "personal",
  published_to_web: false, published_to_web_at: null, published_to_web_by: null,
};

describe("saved audio writes", () => {
  beforeEach(() => {
    jest.mocked(getResourceAccess).mockResolvedValue({ level: "edit", isOwner: false, exists: true });
    jest.mocked(studyMediaService.updateVersioned).mockResolvedValue({ data: row, error: null });
    jest.clearAllMocks();
  });
  it("refuses a stale approved revision", () => {
    expect(() => parseAudioUpdate({ id: row.id, expected_version: 6, title: "Changed" }, [row])).toThrow("version");
  });
  it("retains description when renaming and guards the saved revision", async () => {
    await updateAudioStudy(parseAudioUpdate({ id: row.id, expected_version: 7, title: "Changed" }, [row]));
    expect(studyMediaService.updateVersioned).toHaveBeenCalledWith(row.id, 7, { title: "Changed", description: "Original description" });
  });
  it("clears the old generation claims when replacing a recording", async () => {
    await updateAudioStudy(parseAudioUpdate({ id: row.id, expected_version: 7, audio_file_id: "file-2" }, [row]));
    expect(studyMediaService.updateVersioned).toHaveBeenCalledWith(row.id, 7, expect.objectContaining({ audio_file_id: "file-2", episode_id: null, trust: null, source_id: null, source_kind: null, run_id: null, duration_seconds: null }));
  });
  it("does not write when edit access is absent", async () => {
    jest.mocked(getResourceAccess).mockResolvedValue({ level: "view", isOwner: false, exists: true });
    await expect(updateAudioStudy(parseAudioUpdate({ id: row.id, expected_version: 7, title: "Changed" }, [row]))).rejects.toThrow("edit access");
    expect(studyMediaService.updateVersioned).not.toHaveBeenCalled();
  });
});
