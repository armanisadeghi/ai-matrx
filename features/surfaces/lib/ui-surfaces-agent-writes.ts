/**
 * Pure parsers for the UI Surfaces registry's agent write targets
 * (`create_surfaces` / `update_surfaces` / `delete_surfaces` on
 * `matrx-admin/ui-surfaces`). Each reads the agent's WHOLE list, reports every
 * problem at once, and returns plans the page saves through its own service
 * functions. No I/O here — unit-tested in `__tests__/ui-surfaces-agent-writes.test.ts`.
 */

import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

export const DEFAULT_PARENT = "matrx-default/default";
export const DEFAULT_SORT_ORDER = 150;
const LOCAL_RE = /^[a-z0-9][a-z0-9-/]*$/;

/** What a parser needs to know about one existing surface. */
export interface ExistingSurface {
  name: string;
  has_manifest: boolean;
}

export interface SurfaceWriteContext {
  existing: readonly ExistingSurface[];
  clientNames: readonly string[];
}

export interface CreateSurfacePlan {
  name: string;
  client_name: string;
  label: string | null;
  description: string;
  parent_surface_name: string | null;
  sort_order: number;
  is_active: boolean;
  executor_name: string | null;
  url_pattern: string | null;
}

export interface UpdateSurfacePatch {
  description?: string | null;
  parent_surface_name?: string | null;
  sort_order?: number;
  is_active?: boolean;
  executor_name?: string | null;
  url_pattern?: string | null;
}

export interface UpdateSurfacePlan {
  name: string;
  patch: UpdateSurfacePatch;
  changed: string[];
}

const UPDATE_FIELDS = [
  "description",
  "parent_surface_name",
  "sort_order",
  "is_active",
  "executor_name",
  "url_pattern",
] as const;
/** Fields a code manifest owns — Sync manifests rewrites them. */
const MANIFEST_OWNED = new Set([
  "description",
  "parent_surface_name",
  "is_active",
  "url_pattern",
]);

function asObject(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("must be an object.");
  return raw as Record<string, unknown>;
}

function optionalText(
  obj: Record<string, unknown>,
  key: string,
  problems: ProblemList,
  nullable: boolean,
): string | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null && nullable) return null;
  if (typeof v !== "string") {
    problems.add(`${key} must be a string${nullable ? " or null" : ""}.`);
    return undefined;
  }
  return v.trim();
}

function readSortOrder(
  obj: Record<string, unknown>,
  problems: ProblemList,
): number | undefined {
  if (!("sort_order" in obj)) return undefined;
  const v = obj.sort_order;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 100) {
    problems.add(
      "sort_order must be a whole number of at least 100 (0-99 is reserved).",
    );
    return undefined;
  }
  return v;
}

function readParent(
  obj: Record<string, unknown>,
  names: ReadonlySet<string>,
  problems: ProblemList,
  self?: string,
): string | null | undefined {
  const parent = optionalText(obj, "parent_surface_name", problems, true);
  if (typeof parent === "string") {
    if (!parent) return null;
    if (parent === self) {
      problems.add("a surface cannot be its own parent.");
      return undefined;
    }
    if (!names.has(parent)) {
      problems.add(`parent_surface_name "${parent}" is not a surface in the registry.`);
      return undefined;
    }
  }
  return parent;
}

function nameOfRaw(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof (raw as { name?: unknown }).name === "string")
    return (raw as { name: string }).name;
  return undefined;
}

export function parseCreateSurfacesValue(
  value: unknown,
  ctx: SurfaceWriteContext,
): CreateSurfacePlan[] {
  const target = "create_surfaces";
  const list = readCollectionList(target, "surfaces", value);
  const names = new Set(ctx.existing.map((s) => s.name));
  const clients = new Set(ctx.clientNames);
  return collectProblems(
    target,
    list,
    (raw) => {
      const obj = asObject(raw);
      const problems = new ProblemList(target);
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      let client = "";
      if (!name) problems.add('name is required ("<client>/<local>").');
      else {
        const slash = name.indexOf("/");
        client = slash > 0 ? name.slice(0, slash) : "";
        const local = slash > 0 ? name.slice(slash + 1) : "";
        if (!client || !local)
          problems.add(`name "${name}" must be "<client>/<local>".`);
        else {
          if (!clients.has(client))
            problems.add(
              `client "${client}" is not a UI client (one of: ${[...clients].join(", ")}).`,
            );
          if (!LOCAL_RE.test(local))
            problems.add(
              `the local part "${local}" may use only lowercase letters, digits, hyphens and slashes.`,
            );
        }
      }
      const label = optionalText(obj, "label", problems, true);
      const description = optionalText(obj, "description", problems, true);
      const parent = readParent(obj, names, problems);
      const sort = readSortOrder(obj, problems);
      const executor = optionalText(obj, "executor_name", problems, true);
      const url = optionalText(obj, "url_pattern", problems, true);
      let isActive = true;
      if ("is_active" in obj) {
        if (typeof obj.is_active !== "boolean")
          problems.add("is_active must be true or false.");
        else isActive = obj.is_active;
      }
      problems.throwIfAny();
      return {
        name,
        client_name: client,
        label: label || null,
        description: description ?? "",
        parent_surface_name: parent === undefined ? DEFAULT_PARENT : parent,
        sort_order: sort ?? DEFAULT_SORT_ORDER,
        is_active: isActive,
        executor_name: executor || null,
        url_pattern: url || null,
      };
    },
    {
      nameOf: nameOfRaw,
      listChecks: (items) => [
        repeatsProblem(target, items.map((i) => i.name), "name"),
        ...items
          .filter((i) => i.name && names.has(i.name))
          .map(
            (i) =>
              `${target}[${i.index}] "${i.name}" already exists in the registry — use update_surfaces to change it.`,
          ),
      ],
    },
  );
}

export function parseUpdateSurfacesValue(
  value: unknown,
  ctx: SurfaceWriteContext,
): UpdateSurfacePlan[] {
  const target = "update_surfaces";
  const list = readCollectionList(target, "surfaces", value);
  const byName = new Map(ctx.existing.map((s) => [s.name, s]));
  const names = new Set(byName.keys());
  return collectProblems(
    target,
    list,
    (raw) => {
      const obj = asObject(raw);
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!name) throw new Error("name is required (from surfaces).");
      const current = byName.get(name);
      if (!current)
        throw new ListLevelProblem(
          `${target}: "${name}" is not a surface in the registry.`,
        );
      const problems = new ProblemList(target);
      const unknown = Object.keys(obj).filter(
        (k) => k !== "name" && !(UPDATE_FIELDS as readonly string[]).includes(k),
      );
      if (unknown.length)
        problems.add(
          `cannot change ${unknown.join(", ")} here (changeable: ${UPDATE_FIELDS.join(", ")}).`,
        );
      if (current.has_manifest) {
        const owned = Object.keys(obj).filter((k) => MANIFEST_OWNED.has(k));
        if (owned.length)
          problems.add(
            `"${name}" has a code manifest, which owns ${owned.join(", ")} — Sync manifests would overwrite the change. Change the manifest in code; here only sort_order and executor_name may change.`,
          );
      }
      const patch: UpdateSurfacePatch = {};
      const description = optionalText(obj, "description", problems, true);
      if (description !== undefined) patch.description = description || null;
      const parent = readParent(obj, names, problems, name);
      if (parent !== undefined) patch.parent_surface_name = parent;
      const sort = readSortOrder(obj, problems);
      if (sort !== undefined) patch.sort_order = sort;
      if ("is_active" in obj) {
        if (typeof obj.is_active !== "boolean")
          problems.add("is_active must be true or false.");
        else patch.is_active = obj.is_active;
      }
      const executor = optionalText(obj, "executor_name", problems, true);
      if (executor !== undefined) patch.executor_name = executor || null;
      const url = optionalText(obj, "url_pattern", problems, true);
      if (url !== undefined) patch.url_pattern = url || null;
      problems.throwIfAny();
      const changed = Object.keys(patch);
      if (changed.length === 0) throw new Error("sends no field to change.");
      return { name, patch, changed };
    },
    {
      nameOf: nameOfRaw,
      listChecks: (items) => [
        repeatsProblem(target, items.map((i) => i.name), "surface"),
      ],
    },
  );
}

export function parseDeleteSurfacesValue(
  value: unknown,
  ctx: SurfaceWriteContext,
): ExistingSurface[] {
  const target = "delete_surfaces";
  const list = readCollectionList(target, "surfaces", value);
  const byName = new Map(ctx.existing.map((s) => [s.name, s]));
  return collectProblems(
    target,
    list,
    (raw) => {
      const name = nameOfRaw(raw)?.trim();
      if (!name) throw new Error('must be a surface name or { "name": "…" }.');
      const current = byName.get(name);
      if (!current)
        throw new ListLevelProblem(
          `${target}: "${name}" is not a surface in the registry.`,
        );
      if (current.has_manifest)
        throw new Error(
          `"${name}" has a code manifest: the next Sync manifests re-creates it, so deleting it would only destroy its agent roles and tool defaults. Remove the manifest in code, or deactivate instead.`,
        );
      return current;
    },
    {
      nameOf: nameOfRaw,
      listChecks: (items) => [
        repeatsProblem(target, items.map((i) => i.name), "surface"),
      ],
    },
  );
}

/** Fields the New surface dialog holds — the `new_surface_draft` target. */
export interface NewSurfaceDraftFields {
  client?: string;
  local?: string;
  /** A surface name, or null for a root surface. */
  parent_surface_name?: string | null;
  /** A tier label: Pages | Specialized | Overlays | Editor variants | Debug. */
  tier?: string;
  description?: string;
}

export const NEW_SURFACE_TIERS = [
  "Pages",
  "Specialized",
  "Overlays",
  "Editor variants",
  "Debug",
] as const;

/**
 * Read the `new_surface_draft` value: an OBJECT with any of { name, parent_surface_name,
 * tier, description }. Every problem is reported at once; nothing is saved.
 */
export function parseNewSurfaceDraftValue(
  value: unknown,
  ctx: SurfaceWriteContext,
): NewSurfaceDraftFields {
  const target = "new_surface_draft";
  const problems = new ProblemList(target);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    problems.add(
      "new_surface_draft expects a JSON OBJECT like { name, parent_surface_name, tier, description }.",
    );
    problems.throwIfAny();
  }
  const obj = value as Record<string, unknown>;
  const allowed = ["name", "parent_surface_name", "tier", "description"];
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length)
    problems.add(
      `the dialog has no ${unknown.join(", ")} field (fields: ${allowed.join(", ")}).`,
    );
  const out: NewSurfaceDraftFields = {};
  if ("name" in obj) {
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const slash = name.indexOf("/");
    const client = slash > 0 ? name.slice(0, slash) : "";
    const local = slash > 0 ? name.slice(slash + 1) : "";
    if (!client || !local) problems.add(`name must be "<client>/<local>".`);
    else {
      if (!ctx.clientNames.includes(client))
        problems.add(
          `client "${client}" is not a UI client (one of: ${ctx.clientNames.join(", ")}).`,
        );
      if (!LOCAL_RE.test(local))
        problems.add(
          `the local part "${local}" may use only lowercase letters, digits, hyphens and slashes.`,
        );
      if (ctx.existing.some((s) => s.name === name))
        problems.add(`"${name}" already exists in the registry.`);
      out.client = client;
      out.local = local;
    }
  }
  if ("parent_surface_name" in obj) {
    const parent = readParent(
      obj,
      new Set(ctx.existing.map((s) => s.name)),
      problems,
    );
    if (parent !== undefined) out.parent_surface_name = parent;
  }
  if ("tier" in obj) {
    if (
      typeof obj.tier !== "string" ||
      !(NEW_SURFACE_TIERS as readonly string[]).includes(obj.tier)
    )
      problems.add(`tier must be one of: ${NEW_SURFACE_TIERS.join(", ")}.`);
    else out.tier = obj.tier;
  }
  if ("description" in obj) {
    if (typeof obj.description !== "string")
      problems.add("description must be a string.");
    else out.description = obj.description;
  }
  problems.throwIfAny();
  if (Object.keys(out).length === 0)
    throw new Error("new_surface_draft sends no field to fill. Nothing was changed.");
  return out;
}
