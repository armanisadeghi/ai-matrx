// A version conflict keeps the person's text. Red before: the form reported the conflict upward, the
// workspace remounted on the server's version and the unsaved local draft was gone.
import { createDraftSaver } from "../draftSaver";
import type { StdResult } from "../service";
import { emptyAnswers } from "../types";

const draft = (goals: string) => ({ ...emptyAnswers(), texts: { goals } });
const conflict = (currentVersion: number): StdResult<{ version: number }> => ({ ok: false, reason: "version_conflict", message: "changed elsewhere", currentVersion });

it("keeps the local draft on conflict and Keep mine re-saves it over the server's version", async () => {
  const save = jest.fn<Promise<StdResult<{ version: number }>>, [unknown, number | null]>();
  save.mockResolvedValueOnce(conflict(7)).mockResolvedValueOnce({ ok: true, data: { version: 8 } });
  const states: string[] = [];
  const saver = createDraftSaver(async (a, v) => save(a, v), { answers: draft("old"), version: 3 }, (s) => states.push(s.status));

  saver.edit(draft("Own the Q1 audit file and mentor one new coordinator."));
  await saver.flush();
  expect(states.at(-1)).toBe("conflict");
  expect(saver.hasUnsaved()).toBe(true);
  expect(saver.latest().texts.goals).toBe("Own the Q1 audit file and mentor one new coordinator.");

  // while the choice is open, no further save is attempted
  await saver.flush();
  expect(save).toHaveBeenCalledTimes(1);

  await saver.keepMine();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ texts: { goals: "Own the Q1 audit file and mentor one new coordinator." } }), 7);
  expect(states.at(-1)).toBe("saved");
  expect(saver.hasUnsaved()).toBe(false);
});
