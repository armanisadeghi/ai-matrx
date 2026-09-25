// features/rich-document/code-block/code-block-registry-bridge.ts
//
// Resolve the registry's code-block actions (`code-block-*`) for one block and
// hand them to the CodeBlock header menu as plain menu rows. Loaded at runtime
// by the code-block host (never in the first paint of an answer), and it pulls
// in ONLY the registry + the answer-tools handler module — not the whole
// document action set.

import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { getAllActions } from "../actions/registry";
import { resolveActionLabel } from "../actions/utils";
import "../actions/handlers/answer-tools";
import type { RichDocumentActionContext } from "../types";
import { CODE_BLOCK_METADATA_KEY, type CodeBlockFacts } from "./code-block-context";

export const CODE_BLOCK_ACTION_PREFIX = "code-block-";

export function codeBlockContext(args: {
  facts: CodeBlockFacts;
  dispatch: AppDispatch;
  getState: () => RootState;
  isAuthenticated: boolean;
  organizationId: string | null;
}): RichDocumentActionContext {
  return {
    content: args.facts.code,
    source: { type: "raw" },
    metadata: { [CODE_BLOCK_METADATA_KEY]: args.facts },
    dispatch: args.dispatch,
    getState: args.getState,
    organizationId: args.organizationId,
    isAuthenticated: args.isAuthenticated,
    isAdmin: false,
    isCreator: false,
    surfaceKey: null,
    onClose: () => {},
    instanceKey: (prefix: string) => `${prefix}-code-block`,
    sourceAdapter: { instanceKeyPrefix: () => "code-block" },
  };
}

export function resolveCodeBlockMenuItems(
  ctx: RichDocumentActionContext,
): MenuItem[] {
  // Only the code-block family is evaluated — a block never pays for the
  // visibility predicates of every document action in the registry.
  return getAllActions()
    .filter((a) => String(a.id).startsWith(CODE_BLOCK_ACTION_PREFIX))
    .filter((a) => !a.requiresAuth || ctx.isAuthenticated)
    .filter((a) => !a.visible || a.visible(ctx))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((action) => ({
      key: String(action.id),
      icon: action.icon,
      iconColor: action.iconColor,
      label: resolveActionLabel(action.label, ctx),
      category: "Answer tools",
      showToast: false,
      action: () => {
        void Promise.resolve(action.run(ctx)).catch((err: unknown) => {
          console.error(`[code-block] action ${String(action.id)} threw`, err);
        });
      },
    }));
}
