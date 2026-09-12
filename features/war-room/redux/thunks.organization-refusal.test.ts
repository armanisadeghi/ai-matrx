const createNote = jest.fn();
const createAssignment = jest.fn();
const reportWarRoomError = jest.fn();

jest.mock("@/features/notes/service/notesApi", () => ({ create: createNote, update: jest.fn() }));
jest.mock("../service/associations", () => ({ createAssignment }));
jest.mock("../utils/reportWarRoomError", () => ({ reportWarRoomError }));
jest.mock("./selectors", () => ({
  selectThreadEffectiveContext: () => () => ({ organizationId: null, scopeIds: [] }),
  selectThreadTaskId: () => () => null,
  selectActiveAudioSessionId: () => () => null,
  selectActiveNoteId: () => () => null,
  selectAssignmentsForContainer: () => () => [],
  selectAudioSessionIdsForThread: () => () => [],
  selectContainerAssignmentsLoaded: () => () => false,
  selectEffectiveThreadProjectId: () => () => null,
  selectNoteIdsForThread: () => () => [],
  selectRoomProjectId: () => () => null,
}));

import { addNoteToThread } from "./thunks";

describe("addNoteToThread organization refusal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a missing authoritative thread organization before note or association I/O", async () => {
    const dispatch = jest.fn();
    const state = { warRoom: { threadIdsByRoom: {}, threadsById: {} } } as never;
    await expect(addNoteToThread("thread", "room", "Note", "body")(dispatch, () => state)).resolves.toBeNull();
    expect(createNote).not.toHaveBeenCalled();
    expect(createAssignment).not.toHaveBeenCalled();
    expect(reportWarRoomError).toHaveBeenCalledWith("addNoteToThread", expect.any(Error), {
      toast: "This thread needs to be reopened or reloaded before a note can be created.",
    });
  });
});
