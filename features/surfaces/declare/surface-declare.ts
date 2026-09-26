/**
 * The app's binding to `@ai-matrx/alchemy/declare` + `/checks` (Matrx Alchemy ALC-14).
 *
 * The package owns declaration validation and THE ONE SYNC PLAN. This module
 * only supplies what the package deliberately does not know:
 *   - the agent-owned EXTENSION SLOTS on a manifest (agent roles, client tools):
 *     their validators and their mirror rows;
 *   - the app's registries the checks consult (config namespaces, kinds);
 *   - the app's url-pattern fallback;
 *   - which generation of the `ui` schema is live (`SYNC_SCHEMA`).
 * Nothing here builds a declaration check or a sync row of its own.
 */
import {
  declarationHash,
  resolveSensitivity,
  validateDeclarations,
  type DeclarationExtension,
  type DeclarationIssue,
  type Json,
  type Resolved,
  type ResolvedSurfaceDeclaration,
  type ValidateOptions,
} from "@ai-matrx/alchemy/declare";
import {
  planSurfaceSync,
  type SurfaceSyncPlan,
  type SyncSchema,
} from "@ai-matrx/alchemy/checks";
import type {
  ResolvedSurfaceManifest,
  SurfaceManifest,
} from "@/features/surfaces/types";
import { resolveSurfaceUrlPattern } from "@/features/surfaces/utils/surface-url-pattern";

/**
 * Which `ui` schema generation is live. Flip each flag in the SAME commit that
 * follows the chair's apply of `migrations/alchemy_declare_columns_and_item_key.sql`
 * (itemType also needs re-key step 2). Until then the sync never writes a
 * column — or upserts on a key — the database does not have.
 */
export const SYNC_SCHEMA: SyncSchema = {
  itemType: true,
  valueContract: true,
  contentHash: true,
};

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_KINDS = new Set(["single", "multi"]);
const AUTO_RUN = new Set(["always", "never", "user-choice"]);
const TOOL_MODES = new Set(["draft", "entity", "ui"]);

type Manifest = SurfaceManifest & ResolvedSurfaceDeclaration;

function issue(
  surfaceName: string,
  path: string,
  sentence: string,
  remedy: string,
): DeclarationIssue {
  return { surfaceName, path, sentence, remedy };
}

/** Agent roles — owned by the agent layer, carried on the manifest as an extension slot. */
export const agentRolesExtension: DeclarationExtension<Manifest> = {
  key: "agentRoles",
  owner: "matrx-frontend agents (features/surfaces/declare)",
  inheritedLists: [
    { field: "agentRoles", identity: (entry) => (entry as { name: string }).name },
  ],
  validate(m) {
    const s = m.surfaceName;
    const out: DeclarationIssue[] = [];
    const seen = new Set<string>();
    for (const r of m.agentRoles ?? []) {
      const at = `agentRoles/${r.name}`;
      if (seen.has(r.name))
        out.push(issue(s, at, `Surface "${s}" declares duplicate agent role "${r.name}".`, "Remove the duplicate."));
      seen.add(r.name);
      if (!NAME_RE.test(r.name))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" doesn't match /^[a-z][a-z0-9_]*$/ — the DB CHECK constraint will reject this.`, "Rename it to lower_snake_case."));
      if (!ROLE_KINDS.has(r.kind))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" has invalid kind "${r.kind}" (expected "single" | "multi").`, "Use single or multi."));
      if (r.maxAgents !== undefined && (typeof r.maxAgents !== "number" || r.maxAgents < 1))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" has invalid maxAgents (must be >= 1).`, "Use a number of at least 1."));
      if (r.defaultAgentId !== null && (typeof r.defaultAgentId !== "string" || !UUID_RE.test(r.defaultAgentId)))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" has invalid defaultAgentId (must be a UUID or null).`, "Use null; roles name a mandate."));
      if (r.mandateKey != null && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(r.mandateKey))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" has invalid mandateKey "${r.mandateKey}" (expected dotted lower_snake, e.g. "masterwork.scout").`, "Name a declared mandate key."));
      if (r.mandateKey != null && r.defaultAgentId !== null)
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" sets BOTH mandateKey and defaultAgentId — a mandate-backed role must not also hardcode an agent UUID (NO HARDCODED AGENTS).`, "Drop defaultAgentId."));
      if (r.autoRun !== undefined && !AUTO_RUN.has(r.autoRun))
        out.push(issue(s, at, `Surface "${s}" agent role "${r.name}" has invalid autoRun "${r.autoRun}" (expected "always" | "never" | "user-choice").`, "Use a valid autoRun."));
    }
    return out;
  },
  toRows: (m) =>
    (m.agentRoles ?? []).map((r) => ({
      table: "ui.ui_surface_agent_role",
      conflict: ["surface_name", "name"],
      row: {
        surface_name: m.surfaceName,
        name: r.name,
        label: r.label,
        description: r.description,
        kind: r.kind,
        default_agent_id: r.defaultAgentId,
        mandate_key: r.mandateKey ?? null,
        max_agents: r.maxAgents ?? 1,
        allow_custom: r.allowCustom ?? true,
        auto_run: r.autoRun ?? "user-choice",
        sort_order: r.sortOrder ?? 1000,
      },
    })),
};

/** Client tools — the ACTION tier, an extension slot typed by the agent layer. */
export const clientToolsExtension: DeclarationExtension<Manifest> = {
  key: "clientTools",
  owner: "matrx-frontend agents (features/surfaces/declare)",
  validate(m, context) {
    const s = m.surfaceName;
    const out: DeclarationIssue[] = [];
    const owners = new Map<string, string>();
    for (const other of context.all as readonly Manifest[]) {
      for (const t of other.clientTools ?? []) {
        if (!owners.has(t.name)) owners.set(t.name, other.surfaceName);
      }
    }
    const seen = new Set<string>();
    for (const t of m.clientTools ?? []) {
      const where = `Surface "${s}" client tool "${t.name}"`;
      const at = `clientTools/${t.name}`;
      if (seen.has(t.name))
        out.push(issue(s, at, `Surface "${s}" declares duplicate client tool "${t.name}".`, "A tool name may appear once per surface."));
      seen.add(t.name);
      const owner = owners.get(t.name);
      if (owner && owner !== s)
        out.push(issue(s, at, `Client tool name "${t.name}" is declared by BOTH "${owner}" and "${s}" — tool names are global per conversation.`, `Prefix it with its surface domain (e.g. "${s.split("/").pop()?.replace(/-/g, "_")}_${t.name}").`));
      if (!NAME_RE.test(t.name))
        out.push(issue(s, at, `${where} doesn't match /^[a-z][a-z0-9_]*$/.`, "Rename it to lower_snake_case (the server's tool-name rule and the DB CHECK both reject anything else)."));
      if (t.name.length > 64)
        out.push(issue(s, at, `${where} is ${t.name.length} characters — the server caps tool names at 64.`, "Shorten it."));
      if (!t.label?.trim())
        out.push(issue(s, at, `${where} has no label.`, "Add the ONE canonical human label (THE NAMING LAW)."));
      if (!t.description?.trim())
        out.push(issue(s, at, `${where} has no description.`, "Tell the agent when to call it and what the result means."));
      if (t.mode !== undefined && !TOOL_MODES.has(t.mode))
        out.push(issue(s, at, `${where} has invalid mode "${t.mode}".`, 'Use "draft" | "entity" | "ui", or omit it for "ui".'));
      const schema = t.inputSchema as unknown;
      if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
        out.push(issue(s, `${at}/inputSchema`, `${where} has an invalid inputSchema.`, 'Use { type: "object", properties: {...}, required: [...] }.'));
        continue;
      }
      const sch = schema as { type?: unknown; properties?: unknown; required?: unknown };
      if (sch.type !== "object")
        out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema has type ${JSON.stringify(sch.type)}.`, 'Set it to "object"; that is the only shape the wire contract accepts.'));
      let properties: Set<string> | null = null;
      if (sch.properties !== undefined) {
        if (typeof sch.properties !== "object" || sch.properties === null || Array.isArray(sch.properties)) {
          out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema.properties must be an object keyed by argument name.`, "Use {} for a tool that takes no arguments."));
        } else {
          properties = new Set(Object.keys(sch.properties));
          for (const [name, spec] of Object.entries(sch.properties as Record<string, unknown>)) {
            if (typeof spec !== "object" || spec === null || Array.isArray(spec))
              out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema property "${name}" must be a JSON Schema object.`, 'e.g. { type: "string", description: "..." }.'));
          }
        }
      }
      if (sch.required !== undefined) {
        if (!Array.isArray(sch.required) || sch.required.some((entry) => typeof entry !== "string")) {
          out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema.required must be an array of argument-name strings.`, "Fix the required list."));
        } else if (properties) {
          const undeclared = (sch.required as string[]).filter((entry) => !properties.has(entry));
          if (undeclared.length > 0)
            out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema requires argument(s) it never declares: ${undeclared.join(", ")}.`, "Declare them in properties or drop them from required."));
        } else if ((sch.required as string[]).length > 0) {
          out.push(issue(s, `${at}/inputSchema`, `${where} inputSchema has required arguments but no properties block.`, "Declare each required argument in properties."));
        }
      }
    }
    return out;
  },
  toRows: (m) =>
    (m.clientTools ?? []).map((t) => ({
      table: "ui.ui_surface_client_tool",
      conflict: ["surface_name", "name"],
      row: {
        surface_name: m.surfaceName,
        name: t.name,
        label: t.label,
        description: t.description,
        input_schema: t.inputSchema as unknown as Json,
        // Omitted mode reads as "ui" — the safe reading, written explicitly.
        mode: t.mode ?? "ui",
      },
    })),
};

export const SURFACE_DECLARATION_EXTENSIONS = [
  agentRolesExtension,
  clientToolsExtension,
] as const;

/**
 * The registry's resolved manifests typed as the package's resolved shape.
 * `manifests/registry.ts` resolves through `createDeclarationRegistry`, so
 * every manifest already carries `contentHash` and per-value
 * `resolvedSensitivity`; a caller holding a hand-built manifest (tests,
 * fixtures) gets both filled here.
 */
export function toPackageResolved(
  manifests: readonly ResolvedSurfaceManifest[],
  raw: (surfaceName: string) => SurfaceManifest | undefined,
): Resolved<Manifest>[] {
  return manifests.map((m) => {
    const resolved = m as ResolvedSurfaceManifest & { contentHash?: string };
    if (typeof resolved.contentHash === "string") return m as unknown as Resolved<Manifest>;
    return {
      ...m,
      contentHash: declarationHash(raw(m.surfaceName) ?? m),
      values: m.values.map((v) => ({ ...v, resolvedSensitivity: resolveSensitivity(v) })),
    } as unknown as Resolved<Manifest>;
  });
}

export function validateSurfaceManifests(
  manifests: readonly Resolved<Manifest>[],
  options: Omit<ValidateOptions, "extensions">,
): DeclarationIssue[] {
  return validateDeclarations(
    manifests as unknown as readonly ResolvedSurfaceDeclaration[],
    { ...options, extensions: SURFACE_DECLARATION_EXTENSIONS as unknown as ValidateOptions["extensions"] },
  );
}

/** THE sync plan for these manifests — the only row builder any sync path uses. */
export function planManifestSync(
  manifests: readonly Resolved<Manifest>[],
  options: { organizationId: string; syncedFrom: string; syncedBy?: string | null },
): SurfaceSyncPlan {
  return planSurfaceSync(manifests, {
    ...options,
    schema: SYNC_SCHEMA,
    extensions: SURFACE_DECLARATION_EXTENSIONS,
    resolveUrlPattern: (m) => resolveSurfaceUrlPattern(m) ?? undefined,
  });
}
