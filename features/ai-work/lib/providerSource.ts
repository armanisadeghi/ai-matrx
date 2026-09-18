// features/ai-work/lib/providerSource.ts
//
// THE ONE TEST for "this conversation came from outside AI Matrx".
//
// Provenance is a two-level categorization, biggest → smaller (Arman,
// 2026-09-18): `source_app` names the product family, `source_feature` names
// the thing inside it. Every conversation or request from an outside coding
// tool is `source_app = 'code-plugin'`, and the tool itself is the
// `source_feature` (`claude-code` | `codex` | `cursor` | `vscode`). A person
// replying from AI Matrx on a mirrored conversation stays in the family —
// `source_app = 'code-plugin'`, `source_feature = 'coding_session_reply'` —
// and the tool is then read from the conversation's coding-session binding.
//
// A coding-tool slug is NEVER a source_app. Nothing may test for "external" by
// listing tool slugs against source_app; call `isCodePluginSourceApp`.

import {
  CODING_SESSION_PROVIDER_META,
  providerMeta,
  type CodingSessionProviderMeta,
} from "@/features/agent-connections/coding-sessions/catalog";

export const CODE_PLUGIN_SOURCE_APP = "code-plugin" as const;

/** The feature a person's AI Matrx reply on a mirrored conversation carries. */
export const CODING_SESSION_REPLY_SOURCE_FEATURE =
  "coding_session_reply" as const;

/** The coding tools, as they appear in `source_feature` under `code-plugin`. */
export const CODING_TOOL_SOURCE_FEATURES = Object.values(
  CODING_SESSION_PROVIDER_META,
).map((meta) => meta.sourceFeature);

export function isCodePluginSourceApp(
  value: string | null | undefined,
): value is typeof CODE_PLUGIN_SOURCE_APP {
  return value === CODE_PLUGIN_SOURCE_APP;
}

/**
 * The coding tool a `code-plugin` conversation came from, read from its
 * `source_feature`. Null for a reply row (`coding_session_reply`) — the caller
 * resolves that from the coding-session binding — and for anything that is not
 * a code-plugin conversation at all.
 */
export function codingToolFromSource(
  sourceApp: string | null | undefined,
  sourceFeature: string | null | undefined,
): CodingSessionProviderMeta | null {
  if (!isCodePluginSourceApp(sourceApp) || !sourceFeature) return null;
  return (
    Object.values(CODING_SESSION_PROVIDER_META).find(
      (meta) => meta.sourceFeature === sourceFeature,
    ) ?? null
  );
}

/**
 * The coding tool behind a `code-plugin` conversation: its `source_feature`
 * when that names a tool, otherwise the first binding whose storage provider
 * is known (the reply case). Null when neither says — the caller renders the
 * family label, never a guessed tool.
 */
export function resolveCodingTool(
  sourceApp: string | null | undefined,
  sourceFeature: string | null | undefined,
  bindingProviders: readonly string[],
): CodingSessionProviderMeta | null {
  const fromFeature = codingToolFromSource(sourceApp, sourceFeature);
  if (fromFeature) return fromFeature;
  if (!isCodePluginSourceApp(sourceApp)) return null;
  for (const provider of bindingProviders) {
    const meta = providerMeta(provider);
    if (meta) return meta;
  }
  return null;
}
