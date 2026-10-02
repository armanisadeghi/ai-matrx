/**
 * The `flashcard_deck` list target (2026-10-02, mandate
 * `flashcards.fix_giveaway_cards`): an agent's card rewrites reach the deck
 * only through fcService, only as edits, and a proposal for a card that is not
 * in the deck can never be mistaken for an open change.
 */

jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: { getSetWithCards: jest.fn(), updateCard: jest.fn() },
}));
// The other two stores' modules are irrelevant here and pull in the app.
jest.mock("@/features/data-tables/service", () => ({}));
jest.mock("@/features/data-tables/types", () => ({}));
jest.mock("@/features/scopes/service/scopesService", () => ({}));
jest.mock("@/features/scopes/types", () => ({}));
jest.mock("@ai-matrx/records/core", () => ({}));
jest.mock("@ai-matrx/records-ui", () => ({}));
jest.mock("@/utils/supabase/client", () => ({}));
jest.mock("@/lib/redux/store-singleton", () => ({}));
jest.mock("@/features/unified-data/objectOrganization", () => ({}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({}));
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({}));

import { fcService } from "@/features/flashcards/data/fcService";
import { readListChangeProposal } from "@/features/content-ir/kinds/list-change-proposal";
import {
  applyListChange,
  proposalStanding,
  readListTarget,
} from "../applyListChange";

const SET = "3ab3fb37-35ec-4d8b-8501-17fde5ce0563";
const CARD = "01d5f01b-6246-49a4-ae92-0b7edce35e5a";

// The agent's real answer shape (run on the 39-card deck, 2026-10-02).
const answer = {
  __kind: "list_change_proposal_v1",
  target: { __kind: "list_change_target_v1", kind: "flashcard_deck", set_id: SET, label: "Polyatomic Ion, Oxoanion and more" },
  summary: "1 card names its own answer.",
  proposals: [
    {
      __kind: "list_change_proposal_item_v1",
      id: "p1",
      action: "update",
      title: "Borite Ion (Formula and Charge)",
      reason: "The back names borite.",
      row_id: CARD,
      patch: { back: "\\(\\text{BO}_2^{2-}\\)\n(charge: \\(-2\\))" },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fcService.getSetWithCards).mockResolvedValue({
    data: {
      set: { id: SET, name: "Polyatomic Ion, Oxoanion and more" },
      cards: [{ id: CARD, front: "Borite Ion", back: "BO2 2- (aluminum borite)" }],
    },
    error: null,
  } as never);
  jest.mocked(fcService.updateCard).mockResolvedValue({ data: { id: CARD }, error: null } as never);
});

test("the agent's answer reads as a flashcard_deck target with one card edit", () => {
  const read = readListChangeProposal(answer);
  expect(read?.target).toEqual({ kind: "flashcard_deck", setId: SET, label: "Polyatomic Ion, Oxoanion and more" });
  expect(read?.proposals[0]).toMatchObject({ action: "update", rowId: CARD });
});

test("a flashcard_deck target with no set_id is refused, never guessed", () => {
  const { set_id: _dropped, ...noSet } = answer.target;
  expect(readListChangeProposal({ ...answer, target: noSet })).toBeNull();
});

test("the deck reads as rows of front/back, and an open edit is open", async () => {
  const read = readListChangeProposal(answer)!;
  const list = await readListTarget(read.target);
  expect(list.status).toBe("read");
  if (list.status !== "read") return;
  expect(list.snapshot.fields.map((f) => f.name)).toEqual(["front", "back"]);
  expect(proposalStanding(list.snapshot, read.proposals[0])).toBe("open");
});

test("an edit for a card that is not in the deck is never open", async () => {
  const read = readListChangeProposal({
    ...answer,
    proposals: [{ ...answer.proposals[0], row_id: "not-a-card" }],
  })!;
  const list = await readListTarget(read.target);
  if (list.status !== "read") throw new Error("deck not read");
  expect(proposalStanding(list.snapshot, read.proposals[0])).toBe("settled");
});

test("accepting writes ONLY the proposed face through fcService.updateCard", async () => {
  const read = readListChangeProposal(answer)!;
  const outcome = await applyListChange(read.target, read.proposals[0]);
  expect(outcome.status).toBe("applied");
  expect(fcService.updateCard).toHaveBeenCalledWith(CARD, { back: answer.proposals[0].patch.back });
});

test("add and remove are refused in words and write nothing", async () => {
  const read = readListChangeProposal(answer)!;
  const outcome = await applyListChange(read.target, {
    id: "p9",
    action: "remove",
    title: "Borite Ion",
    reason: "x",
    rowId: CARD,
  });
  expect(outcome.status).toBe("refused");
  expect(fcService.updateCard).not.toHaveBeenCalled();
});

test("a store refusal is carried back verbatim", async () => {
  jest.mocked(fcService.updateCard).mockResolvedValue({ data: null, error: "updateCard: permission denied" } as never);
  const read = readListChangeProposal(answer)!;
  const outcome = await applyListChange(read.target, read.proposals[0]);
  expect(outcome).toEqual({ status: "refused", detail: "updateCard: permission denied" });
});
