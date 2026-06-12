/**
 * components/dialogs/value-prompts/ValuePromptsDialogHost.tsx
 *
 * Slim client shell + public entry point for the global value-prompts
 * dialog — the runtime face of `prompt_user` value mappings. Mirrors the
 * ConfirmDialogHost pattern exactly: the opener registry is pure TS, the
 * heavy body loads via `next/dynamic({ ssr: false })`, and pre-hydration
 * calls queue inside the opener until the host registers.
 *
 * Mount `<ValuePromptsDialogHost />` once per provider tree, beside
 * `<ConfirmDialogHost />`. Consumers call:
 *
 *   import { promptForValues } from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
 *   const answers = await promptForValues({ title: shortcut.label, fields });
 *   if (answers === null) ... // cancelled (only possible when nothing is required)
 */

"use client";

import dynamic from "next/dynamic";

export { promptForValues } from "./valuePromptsOpener";
export type {
  ValuePromptField,
  ValuePromptsRequest,
} from "./valuePromptsOpener";

const ValuePromptsDialogHostImpl = dynamic(
  () => import("./ValuePromptsDialogHostImpl"),
  { ssr: false, loading: () => null },
);

export function ValuePromptsDialogHost() {
  return <ValuePromptsDialogHostImpl />;
}
