/** Canonical admin catalogue route for AI models. */
export const AI_MODELS_CONSOLE_ROUTE = "/administration/ai/ai-models";

/** Search parameter consumed by `AiModelsContainer` to open one model. */
export const AI_MODEL_DEEP_LINK_PARAM = "model";

/** Durable URL value for the create-new-model panel state. */
export const AI_MODEL_NEW_VALUE = "new";

export const AI_PROVIDERS_CONSOLE_ROUTE =
  "/administration/ai/ai-models/providers";
export const AI_PROVIDER_DEEP_LINK_PARAM = "provider";

/** Deep link to one model's existing split-pane detail editor. */
export function aiModelHref(modelId: string): string {
  return `${AI_MODELS_CONSOLE_ROUTE}?${AI_MODEL_DEEP_LINK_PARAM}=${encodeURIComponent(modelId)}`;
}

/** Deep link to one provider's existing split-pane detail editor. */
export function aiProviderHref(providerId: string): string {
  return `${AI_PROVIDERS_CONSOLE_ROUTE}?${AI_PROVIDER_DEEP_LINK_PARAM}=${encodeURIComponent(providerId)}`;
}
