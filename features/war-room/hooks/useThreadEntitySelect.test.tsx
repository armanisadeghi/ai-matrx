import { renderHook } from "@/test-utils/renderHook";

const dispatchMock = jest.fn();
const cachedTitleMock = jest.fn();
const primeTitleMock = jest.fn();
const useEntityTitlesMock = jest.fn();
const updateNoteMock = jest.fn();
const updateSessionMock = jest.fn();

const NOTE_A = "11111111-1111-4111-8111-111111111111";
const NOTE_B = "22222222-2222-4222-8222-222222222222";
const AUDIO_A = "33333333-3333-4333-8333-333333333333";
const AUDIO_B = "44444444-4444-4444-8444-444444444444";

const selected: Record<string, unknown> = {
  loaded: true,
  noteIds: [NOTE_A, NOTE_B],
  activeNote: NOTE_A,
  notesMap: {
    [NOTE_A]: { label: "Loaded note" },
  },
  audioIds: [AUDIO_A, AUDIO_B],
  activeAudio: AUDIO_A,
  sessionsMap: {
    [AUDIO_A]: { title: "Loaded recording" },
  },
  assignments: [
    {
      entity_type: "note",
      entity_id: NOTE_A,
      label: "Old loaded note",
      is_active: true,
    },
    {
      entity_type: "note",
      entity_id: NOTE_B,
      label: "Attach-time note",
      is_active: false,
    },
    {
      entity_type: "studio_session",
      entity_id: AUDIO_A,
      label: "Old loaded recording",
      is_active: true,
    },
    {
      entity_type: "studio_session",
      entity_id: AUDIO_B,
      label: "Attach-time recording",
      is_active: false,
    },
  ],
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: string) => selected[selector],
}));

jest.mock("@/features/scopes/service/entityTitles", () => ({
  getCachedEntityTitle: (...args: unknown[]) => cachedTitleMock(...args),
  primeEntityTitle: (...args: unknown[]) => primeTitleMock(...args),
}));

jest.mock("@/features/scopes/hooks/useEntityTitles", () => ({
  useEntityTitles: (...args: unknown[]) => useEntityTitlesMock(...args),
}));

jest.mock("@/features/notes/redux/selectors", () => ({
  selectNotesMap: "notesMap",
}));

jest.mock("@/features/notes/service/notesApi", () => ({
  update: (...args: unknown[]) => updateNoteMock(...args),
}));

jest.mock("@/features/notes/redux/slice", () => ({
  upsertNoteFromServer: (payload: unknown) => ({ type: "note/upsert", payload }),
}));

jest.mock("@/features/transcript-studio/redux/selectors", () => ({
  selectSessionsById: "sessionsMap",
  selectAssistantConversationId: jest.fn(),
  selectAssistantConversations: jest.fn(),
}));

jest.mock("@/features/transcript-studio/redux/thunks", () => ({
  updateSessionThunk: (...args: unknown[]) => updateSessionMock(...args),
}));

jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAllAgents: jest.fn(),
}));

jest.mock(
  "@/features/agents/redux/conversation-list/conversation-row-actions.thunks",
  () => ({ renameConversation: jest.fn() }),
);

jest.mock("@/features/war-room/redux/selectors", () => ({
  selectContainerAssignmentsLoaded: () => "loaded",
  selectNoteIdsForThread: () => "noteIds",
  selectActiveNoteId: () => "activeNote",
  selectAudioSessionIdsForThread: () => "audioIds",
  selectActiveAudioSessionId: () => "activeAudio",
  selectAssignmentsForContainer: () => "assignments",
  selectActiveConversationId: jest.fn(),
  selectActiveConversationIdForRoom: jest.fn(),
  selectConversationIdsForRoom: jest.fn(),
  selectConversationIdsForThread: jest.fn(),
  selectPendingConversationForContainer: jest.fn(),
}));

jest.mock("@/features/war-room/redux/thunks", () => ({
  addAudioSessionToThread: jest.fn(),
  addNoteToThread: jest.fn(),
  attachEntityToThread: (
    threadId: string,
    token: string,
    id: string,
    options: unknown,
  ) => ({ type: "war-room/attach", threadId, token, id, options }),
  removeConversationFromRoom: jest.fn(),
  removeEntityFromThread: jest.fn(),
  setRoomActiveConversation: jest.fn(),
  setThreadActiveAudioSession: jest.fn(),
  setThreadActiveConversation: jest.fn(),
  setThreadActiveNote: jest.fn(),
}));

import {
  useThreadAudioSessionSelectAdapter,
  useThreadNoteSelectAdapter,
} from "./useThreadEntitySelect";

describe("War Room Notes/Audio name dropdown contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useEntityTitlesMock.mockReturnValue({});
    cachedTitleMock.mockImplementation((token: string, id: string) => {
      if (token === "note" && id === NOTE_B) return "Canonical note";
      if (token === "studio_session" && id === AUDIO_B)
        return "Canonical recording";
      return null;
    });
    dispatchMock.mockImplementation((action: { type?: string }) => {
      if (action?.type === "war-room/attach") return Promise.resolve(true);
      if (action?.type === "studio/update") {
        return {
          unwrap: () => Promise.resolve({ id: AUDIO_A, title: "Renamed audio" }),
        };
      }
      return action;
    });
    updateNoteMock.mockResolvedValue({ id: NOTE_A, label: "Renamed note" });
    updateSessionMock.mockReturnValue({ type: "studio/update" });
  });

  it("resolves every attached name from source truth on a cold refresh", async () => {
    const notes = await renderHook(() =>
      useThreadNoteSelectAdapter("thread-1", "room-1"),
    );
    expect(notes.current.items).toEqual([
      { id: NOTE_A, title: "Loaded note" },
      { id: NOTE_B, title: "Canonical note" },
    ]);
    expect(useEntityTitlesMock).toHaveBeenCalledWith([
      { token: "note", id: NOTE_A, label: null },
      { token: "note", id: NOTE_B, label: null },
    ]);
    await notes.unmount();

    const audio = await renderHook(() =>
      useThreadAudioSessionSelectAdapter("thread-1"),
    );
    expect(audio.current.items).toEqual([
      { id: AUDIO_A, title: "Loaded recording" },
      { id: AUDIO_B, title: "Canonical recording" },
    ]);
    expect(useEntityTitlesMock).toHaveBeenCalledWith([
      { token: "studio_session", id: AUDIO_A, label: null },
      { token: "studio_session", id: AUDIO_B, label: null },
    ]);
    await audio.unmount();
  });

  it("keeps the association label coherent when Notes and Audio are renamed", async () => {
    const notes = await renderHook(() =>
      useThreadNoteSelectAdapter("thread-1", "room-1"),
    );
    await expect(notes.current.rename(NOTE_A, " Renamed note ")).resolves.toBe(
      true,
    );
    expect(updateNoteMock).toHaveBeenCalledWith(NOTE_A, {
      label: "Renamed note",
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      type: "war-room/attach",
      threadId: "thread-1",
      token: "note",
      id: NOTE_A,
      options: { label: "Renamed note", makeActive: true },
    });
    expect(primeTitleMock).toHaveBeenCalledWith(
      "note",
      NOTE_A,
      "Renamed note",
    );
    await notes.unmount();

    const audio = await renderHook(() =>
      useThreadAudioSessionSelectAdapter("thread-1"),
    );
    await expect(
      audio.current.rename(AUDIO_A, " Renamed audio "),
    ).resolves.toBe(true);
    expect(dispatchMock).toHaveBeenCalledWith({
      type: "war-room/attach",
      threadId: "thread-1",
      token: "studio_session",
      id: AUDIO_A,
      options: { label: "Renamed audio", makeActive: true },
    });
    expect(primeTitleMock).toHaveBeenCalledWith(
      "studio_session",
      AUDIO_A,
      "Renamed audio",
    );
    await audio.unmount();
  });
});
