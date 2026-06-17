// features/research/components/outputs/outputs.ts
//
// The research "Outputs" bundle — the content engine's index of everything a
// topic has produced beyond the report (podcast, blog, slides, SEO). It lives
// in `rs_topic.outputs` (JSONB, migration 0014): the topic owns its output
// bundle. The Studio surface reads this index; generation appends to it.
//
// This is a deliberate single source of truth for the Studio. Durable asset
// rows still live in their domain tables (pc_episodes, pc_articles, cx_artifact);
// this index points at them so the Studio can show status without re-querying
// every domain.

export type OutputKind = "podcast" | "blog" | "slides" | "seo";

export type OutputStatus = "generating" | "ready" | "failed" | "stale";

export interface OutputAsset {
  /** Stable id — the domain row id where one exists (episode_id, article id…),
   *  otherwise a synthetic id. */
  id: string;
  kind: OutputKind;
  title: string;
  status: OutputStatus;
  /** ISO timestamp. */
  created_at: string;
  /** Public/app slug where the asset is viewable. */
  slug?: string;
  /** Direct URL (audio CDN, public page, …). */
  url?: string;
  /** Free-form per-kind extras (host_count, model, etc.). */
  meta?: Record<string, unknown>;
}

export interface ResearchOutputs {
  podcast?: { assets: OutputAsset[] };
  blog?: { assets: OutputAsset[] };
  slides?: { assets: OutputAsset[] };
  seo?: { assets: OutputAsset[] };
}

export const OUTPUT_KINDS: OutputKind[] = ["podcast", "blog", "slides", "seo"];

function isAsset(v: unknown): v is OutputAsset {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.kind === "string";
}

/** Defensively parse the JSONB `outputs` column into a typed bundle. */
export function parseOutputs(raw: unknown): ResearchOutputs {
  const out: ResearchOutputs = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const kind of OUTPUT_KINDS) {
    const slot = o[kind];
    if (slot && typeof slot === "object") {
      const assetsRaw = (slot as Record<string, unknown>).assets;
      const assets = Array.isArray(assetsRaw)
        ? assetsRaw.filter(isAsset)
        : [];
      out[kind] = { assets };
    }
  }
  return out;
}

export function assetsFor(
  outputs: ResearchOutputs,
  kind: OutputKind,
): OutputAsset[] {
  return outputs[kind]?.assets ?? [];
}

/** Return a NEW bundle with `asset` prepended to `kind` (newest first),
 *  de-duped by id. Pure — never mutates the input. */
export function appendAsset(
  outputs: ResearchOutputs,
  kind: OutputKind,
  asset: OutputAsset,
): ResearchOutputs {
  const existing = assetsFor(outputs, kind).filter((a) => a.id !== asset.id);
  return {
    ...outputs,
    [kind]: { assets: [asset, ...existing] },
  };
}

/** Serialize the typed bundle for `rs_topic.outputs` (JSONB). */
export function serializeOutputs(
  outputs: ResearchOutputs,
): Record<string, unknown> {
  return outputs as unknown as Record<string, unknown>;
}
