/**
 * proposedDirectives slice — the inbox of agent-proposed actions awaiting the
 * user's approval (the `ask` apply policy).
 *
 * When a directive's resolved policy is `ask`, the brain streams a
 * `directive_apply.proposed` event instead of applying. This slice holds those
 * proposals (keyed by conversation) so a card can render an Approve/Decline
 * choice; on Approve the card POSTs the round-tripped envelope to
 * `/actions/confirm` (`confirmDirective`) and removes the proposal.
 *
 * This is NOT `pendingAsks`: that inbox resolves a suspended tool call via a
 * promise + `/tool_results`. A proposed directive is a TERMINAL side effect with
 * no awaiting handler — it resolves via a fresh authed REST confirm. Distinct
 * lifecycle, distinct (small) slice. Reducers stay pure.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";
import type { RootState } from "@/lib/redux/store";

export interface ProposedDirective {
  proposalId: string;
  conversationId: string;
  type: string;
  verb: string | null;
  noun: string | null;
  summary: string | null;
  itemCount: number;
  /** The round-tripped envelope the client POSTs back verbatim to confirm. */
  envelope: MatrxEnvelope;
}

interface ProposedDirectivesState {
  /** Pending proposals per conversation, in arrival order. */
  byConversation: Record<string, ProposedDirective[]>;
}

const initialState: ProposedDirectivesState = { byConversation: {} };

const proposedDirectivesSlice = createSlice({
  name: "proposedDirectives",
  initialState,
  reducers: {
    proposeDirective(state, action: PayloadAction<ProposedDirective>) {
      const { conversationId, proposalId } = action.payload;
      const list = state.byConversation[conversationId] ?? [];
      // Idempotent: a re-emitted proposal (same content key) never stacks.
      if (list.some((p) => p.proposalId === proposalId)) return;
      state.byConversation[conversationId] = [...list, action.payload];
    },
    removeProposal(
      state,
      action: PayloadAction<{ conversationId: string; proposalId: string }>,
    ) {
      const { conversationId, proposalId } = action.payload;
      const list = state.byConversation[conversationId];
      if (!list) return;
      const next = list.filter((p) => p.proposalId !== proposalId);
      if (next.length) state.byConversation[conversationId] = next;
      else delete state.byConversation[conversationId];
    },
    clearProposalsForConversation(state, action: PayloadAction<string>) {
      delete state.byConversation[action.payload];
    },
  },
});

export const { proposeDirective, removeProposal, clearProposalsForConversation } =
  proposedDirectivesSlice.actions;

export default proposedDirectivesSlice.reducer;

const EMPTY: ProposedDirective[] = [];

const selectByConversation = (state: RootState) =>
  state.proposedDirectives.byConversation;

/** The pending proposals for one conversation (memoized; stable empty array). */
export const selectProposedDirectives = (conversationId: string) =>
  createSelector(selectByConversation, (byConv) => byConv[conversationId] ?? EMPTY);
