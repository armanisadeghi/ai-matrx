/**
 * host/model-class — the model "class" (offering) a run is pinned to, read through the host.
 *
 * The host loads a pinned class's controls and its display labels from its model registry.
 * A host with no registry answers `undefined` (callers keep the model's own controls) and
 * labels nothing. matrx-frontend registers its hooks (`providers/chatUiRegistration.ts`).
 */
import type { Json } from "./db-types";
import { reportUnregisteredHostSlot } from "./diagnostics";

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

function current(): ChatModelClassHooks {
  if (hooks === NO_REGISTRY)
    reportUnregisteredHostSlot("modelClassHooks", "pinned model classes keep the model's own controls and show no class labels");
  return hooks;
}

export const useModelClassControls: ChatModelClassHooks["useModelClassControls"] = (modelId, offeringId) =>
  current().useModelClassControls(modelId, offeringId);
export const useModelClassLabels: ChatModelClassHooks["useModelClassLabels"] = () => current().useModelClassLabels();
