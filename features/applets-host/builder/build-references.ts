// features/applets-host/builder/build-references.ts — what she ATTACHED to a build (lane A1).
//
// Two kinds, both kept on the build's record (`app.definition.metadata.build.references`, written through the
// same guarded merge as the request history), so a reload keeps them and every round still has them:
//
//   resource — a file, note, document, page… picked in the canonical "+" attach menu (`ResourcePickerMenu`,
//              the same sources as /chat's +). It reaches the builder agent ONLY through THE attach path
//              (`resources` on `runHeadlessAgentJson` / `continueAgentJson` → `attachResourceToConversation`):
//              a stored file by its file id (the server keeps its `file → conversation` edge), every other kind
//              as its typed resource block. Never pasted into her message (THE USER-INPUT LAW).
//   job      — one of her agents or workflows, made a job (mandate) of the Applet's organization
//              (`applet-job.ts`). The catalogue lists it first with its real inputs (`attachedJobs`), and the
//              Applet runs it through the one job path (`useJob` → `POST /ai/mandates/<key>`).

import type { Resource } from "@ai-matrx/chat/agents/resources/types";
import { resourceLabel } from "@ai-matrx/chat/agents/components/inputs/resources/attach-resource";

export interface ResourceReference {
  id: string;
  kind: "resource";
  label: string;
  resource: Resource;
}

export interface JobReference {
  id: string;
  kind: "job";
  holder: "agent" | "workflow";
  holder_id: string;
  label: string;
  /** The job made for it in the Applet's organization. */
  mandate_key: string;
}

export type BuildReference = ResourceReference | JobReference;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The references stored on the row's `metadata.build.references`; anything malformed is left out. */
export function readBuildReferences(metadata: unknown): BuildReference[] {
  const build = isRecord(metadata) && isRecord(metadata.build) ? metadata.build : null;
  const list = build && Array.isArray(build.references) ? build.references : [];
  return list.filter((r): r is BuildReference => {
    if (!isRecord(r) || typeof r.id !== "string" || typeof r.label !== "string") return false;
    if (r.kind === "resource") return isRecord(r.resource) && typeof r.resource.type === "string";
    return r.kind === "job" && (r.holder === "agent" || r.holder === "workflow") && typeof r.holder_id === "string" && typeof r.mandate_key === "string";
  });
}

/** A stable identity for a pick: the same file, note or page picked twice is one reference. */
function resourceIdentity(resource: Resource): string {
  const data = resource.data as unknown;
  if (isRecord(data)) {
    for (const key of ["fileId", "file_id", "id", "url"] as const) {
      const value = data[key];
      if (typeof value === "string" && value) return `${resource.type}:${value}`;
    }
  }
  if (typeof data === "string") return `${resource.type}:${data}`;
  return `${resource.type}:${JSON.stringify(data)}`;
}

/** A picked resource as a reference (its id is its identity, so a re-pick is the same reference). */
export function resourceReference(resource: Resource): ResourceReference {
  return { id: resourceIdentity(resource), kind: "resource", label: resourceLabel(resource), resource };
}

export function jobReference(input: { holder: "agent" | "workflow"; holderId: string; label: string; jobKey: string }): JobReference {
  return { id: `${input.holder}:${input.holderId}`, kind: "job", holder: input.holder, holder_id: input.holderId, label: input.label, mandate_key: input.jobKey };
}

/** Add (a reference already there is replaced in place, never doubled). */
export function withReference(list: readonly BuildReference[], next: BuildReference): BuildReference[] {
  return list.some((r) => r.id === next.id) ? list.map((r) => (r.id === next.id ? next : r)) : [...list, next];
}

export function withoutReference(list: readonly BuildReference[], id: string): BuildReference[] {
  return list.filter((r) => r.id !== id);
}

/** What rides THE attach path on every round. */
export function referenceResources(list: readonly BuildReference[]): Resource[] {
  return list.flatMap((r) => (r.kind === "resource" ? [r.resource] : []));
}

/** The jobs the catalogue must list (and the build checks run against). */
export function attachedJobKeys(list: readonly BuildReference[]): string[] {
  return list.flatMap((r) => (r.kind === "job" ? [r.mandate_key] : []));
}

/**
 * The named context entry each round carries: WHAT she attached, by name — the material itself rides the
 * attach path, the jobs the catalogue. Null when nothing is attached (removes the entry on a continued turn).
 */
export function attachmentsContext(list: readonly BuildReference[]): string | null {
  if (!list.length) return null;
  return JSON.stringify(
    list.map((r) =>
      r.kind === "resource"
        ? { attached: r.label, what: r.resource.type, use: "reference material for this Applet (its content is attached to this request)" }
        : { attached: r.label, what: r.holder, job: r.mandate_key, use: "a job this Applet runs (listed in the catalogue with attached: true)" },
    ),
  );
}
