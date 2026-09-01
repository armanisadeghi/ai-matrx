import reducer, {
  assignmentsLoadedForContainer,
  assignmentUpserted,
} from "./slice";
import { initialWarRoomState } from "./warRoom.types";
import type { WarRoomAssignment } from "../types";

const KEY = "thread:11111111-1111-4111-8111-111111111111";

function assignment(
  id: string,
  entityId: string,
  label: string,
): WarRoomAssignment {
  return {
    id,
    container_type: "thread",
    container_id: KEY.slice("thread:".length),
    entity_type: "note",
    entity_id: entityId,
    position: 0,
    is_active: true,
    label,
    metadata: {},
    created_by: null,
    created_at: null,
  };
}

describe("warRoom assignmentUpserted", () => {
  it("replaces hydrated synthetic rows by semantic entity identity", () => {
    const entityId = "22222222-2222-4222-8222-222222222222";
    const synthetic = assignment(`tc:${KEY}:note:${entityId}`, entityId, "Old");
    const real = assignment(
      "33333333-3333-4333-8333-333333333333",
      entityId,
      "Renamed",
    );
    let state = reducer(
      initialWarRoomState,
      assignmentsLoadedForContainer({ key: KEY, assignments: [synthetic] }),
    );

    state = reducer(state, assignmentUpserted({ key: KEY, assignment: real }));

    expect(state.assignmentsByContainer[KEY]).toEqual([real]);
  });

  it("collapses preexisting semantic duplicates when the real edge arrives", () => {
    const entityId = "22222222-2222-4222-8222-222222222222";
    const rows = [
      assignment("synthetic-a", entityId, "Old A"),
      assignment("synthetic-b", entityId, "Old B"),
    ];
    const real = assignment("real-edge", entityId, "Renamed");
    let state = reducer(
      initialWarRoomState,
      assignmentsLoadedForContainer({ key: KEY, assignments: rows }),
    );

    state = reducer(state, assignmentUpserted({ key: KEY, assignment: real }));

    expect(state.assignmentsByContainer[KEY]).toEqual([real]);
  });
});
