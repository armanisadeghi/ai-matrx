/**
 * host/model-class — the model "class" (offering) a run is pinned to, read through the host.
 *
 * The host loads a pinned class's controls and its display labels from its model registry.
 * A host with no registry answers `undefined` (callers keep the model's own controls) and
 * labels nothing. matrx-frontend registers its hooks (`providers/chatUiRegistration.ts`).
 */
import type { Json } from "./db-types";

export type ModelClassControls =
  | undefined
  | { pending: true; failed?: false; config?: undefined }
  | { pending?: false; failed: true; config?: undefined }
  | {
      pending?: false;
      failed?: false;
      config: { modelId: string; controls: Json | null; constraints: Json | null };
    };

export interface ChatModelClassHooks {
  useModelClassControls(modelId: string | null | undefined, offeringId: string | null | undefined): ModelClassControls;
  /** Loads the class labels the model pickers read (a side-effect hook). */
  useModelClassLabels(): void;
}

const NO_REGISTRY: ChatModelClassHooks = {
  useModelClassControls: () => undefined,
  useModelClassLabels: () => undefined,
};

let hooks: ChatModelClassHooks = NO_REGISTRY;

export function registerChatModelClassHooks(next: ChatModelClassHooks | null): void {
  hooks = next ?? NO_REGISTRY;
}

export const useModelClassControls: ChatModelClassHooks["useModelClassControls"] = (modelId, offeringId) =>
  hooks.useModelClassControls(modelId, offeringId);
export const useModelClassLabels: ChatModelClassHooks["useModelClassLabels"] = () => hooks.useModelClassLabels();
