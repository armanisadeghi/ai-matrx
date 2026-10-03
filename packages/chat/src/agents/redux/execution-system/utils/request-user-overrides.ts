/**
 * THE USER LAYER of every agent request — one builder for start, continue,
 * resume and the builder's manual run, so no route drops the person's
 * decisions (TOOL-SOURCES rule R).
 *
 *   - `apply_policy` — the person's output-directive preference ("default" =
 *     omit, the backend resolves its own).
 *   - `add` / `remove` / `auto_tools` — their tool picks, removals and the
 *     per-chat auto-tools switch (`buildUserToolOverrides`).
 *
 * Returns `undefined` when the person decided nothing, so the `user` field is
 * omitted entirely.
 */

import type { ChatRootState } from "../../../../store/root-state";
import type { UserOverrides } from "../../../types/request.types";
import { selectDirectiveApplyPolicy } from "../../../../host/prefs";
import { buildUserToolOverrides } from "./build-tool-injection";

export function buildRequestUserOverrides(
  state: ChatRootState,
  conversationId: string,
): UserOverrides | undefined {
  const applyPolicy = selectDirectiveApplyPolicy(state);
  const overrides: UserOverrides = {
    ...(applyPolicy && applyPolicy !== "default" && { apply_policy: applyPolicy }),
    ...buildUserToolOverrides(state, conversationId),
  };
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
