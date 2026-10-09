/**
 * The web app's copy bar and read-state notices, handed to
 * `@ai-matrx/content-ir-react/kind-kit`'s host slots. Import for its side
 * effect from every module that renders kit components (the stored-code
 * scope and the app's own kind blocks) — never from app boot.
 *
 * Each slot loads its app module only when a kit component first RENDERS
 * one, never at registration: registering must cost nothing, and in the kind
 * sandbox frame the copy bar's module graph must not run until a component
 * actually shows a copy bar (that is when it ran before the kit moved). The
 * frame bundle's esbuild aliases swap these modules for the frame-safe twins.
 */
import { createElement } from "react";
import {
  setKindKitHost,
  type KindKitCopyProps,
  type KindKitReadEmptyProps,
  type KindKitReadStaleNoticeProps,
} from "@ai-matrx/content-ir-react/kind-kit";

function AppCopyButtons(props: KindKitCopyProps) {
  const { CopyButtons } = require("@/components/agent-copy/CopyButtons") as typeof import("@/components/agent-copy/CopyButtons");
  return createElement(CopyButtons, props);
}

function AppReadEmpty(props: KindKitReadEmptyProps) {
  const { ReadEmpty } = require("@ai-matrx/design-system") as typeof import("@ai-matrx/design-system");
  return createElement(ReadEmpty, props);
}

function AppReadStaleNotice(props: KindKitReadStaleNoticeProps) {
  const { ReadStaleNotice } = require("@ai-matrx/design-system") as typeof import("@ai-matrx/design-system");
  return createElement(ReadStaleNotice, props);
}

setKindKitHost({ CopyButtons: AppCopyButtons, ReadEmpty: AppReadEmpty, ReadStaleNotice: AppReadStaleNotice });
