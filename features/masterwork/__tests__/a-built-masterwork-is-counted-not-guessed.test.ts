/**
 * A BUILT MASTERWORK IS COUNTED, NOT GUESSED.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 5, finding 6). About fifteen seconds
 * after a Quick Build finished, the Rulebook's own Masterworks summary read
 * "0 Built" — about a Masterwork the page had just watched being built — and a
 * check moments later, on a fresh navigation, correctly read "1 Built ·
 * 1 Current".
 *
 * THE ROOT CAUSE: the Build's terminal stream event fires the moment the run
 * completes; the `workflow.definition` row it wrote is not necessarily visible
 * to the very next PostgREST read. The page reloaded on that event exactly
 * once, with no retry and no way to tell "not there yet" from "not there" — so
 * it painted a number nobody had measured.
 *
 * THE FORCING FUNCTION: a read that is empty for the first attempts and then
 * carries the row, exactly as the race behaves.
 *
 * RED against a single un-retried read: the first result is returned, without
 * the Masterwork, and reported as if it were the truth.
 */

const listMock = jest.fn();

import { listMasterworksAfterBuild } from "../service";

const RULEBOOK = "aa11bb22-cc33-4d44-8e55-ff6677889900";
const WORKFLOW = "11112222-3333-4444-5555-666677778888";
const BUILT = [{ id: WORKFLOW, name: "E-Waste Pallet Manual-Sort Decider" }];

describe("a built Masterwork is counted, not guessed", () => {
  beforeEach(() => listMock.mockReset());

  it("waits for the row the Build announced, then reports it confirmed", async () => {
    listMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(BUILT);

    const result = await listMasterworksAfterBuild(RULEBOOK, WORKFLOW, {
      attempts: 6,
      firstWaitMs: 1,
      read: listMock,
    });

    expect(listMock).toHaveBeenCalledTimes(3);
    expect(result.confirmed).toBe(true);
    expect(result.masterworks).toHaveLength(1);
  });

  it("says out loud when the row never appeared — never a silent wrong count", async () => {
    listMock.mockResolvedValue([]);

    const result = await listMasterworksAfterBuild(RULEBOOK, WORKFLOW, {
      attempts: 3,
      firstWaitMs: 1,
      read: listMock,
    });

    expect(listMock).toHaveBeenCalledTimes(3);
    expect(result.confirmed).toBe(false);
    expect(result.masterworks).toEqual([]);
  });

  it("costs nothing extra when the row is already there", async () => {
    listMock.mockResolvedValue(BUILT);

    const result = await listMasterworksAfterBuild(RULEBOOK, WORKFLOW, {
      attempts: 6,
      firstWaitMs: 1,
      read: listMock,
    });

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(result.confirmed).toBe(true);
  });
});
