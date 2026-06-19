/**
 * Babel-based compiler for dynamic tool UI components.
 *
 * Takes raw TSX/JSX code stored in the database and compiles it into
 * usable React components at runtime. Adapted from the Prompt Apps
 * compilation pipeline.
 *
 * @module compiler
 */

import {
  buildToolRendererScope,
  patchScopeForMissingIdentifiers,
  getScopeFunctionParameters,
} from "./allowed-imports";
import {
  loadBabelTransform,
  stripImports,
  replaceExportDefault,
  babelTransform as babelTransformCore,
} from "@/features/dynamic-react/compile-core";
import type {
  ToolUiComponentRow,
  CompiledToolRenderer,
  ContractVersion,
  DynamicRendererProps,
} from "./types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

// ---------------------------------------------------------------------------
// Source→source transform + lazy Babel loader now live in the shared core
// (`@/features/dynamic-react/compile-core`) so every dynamic-React consumer
// shares one implementation. Local thin wrapper preserves the tool filename.
// ---------------------------------------------------------------------------

function babelTransform(code: string, language: "tsx" | "jsx"): string {
  return babelTransformCore(
    code,
    language,
    `dynamic-tool-component.${language}`,
  );
}

// ---------------------------------------------------------------------------
// Component compiler
// ---------------------------------------------------------------------------

/**
 * Compiles a code string into a React component.
 *
 * Pipeline:
 *   1. Strip imports
 *   2. Babel transform JSX/TSX → JS
 *   3. Replace export default → return
 *   4. Build scoped import environment
 *   5. Patch missing PascalCase identifiers
 *   6. Execute via `new Function()` to get the component
 */
function compileComponentCode(
  code: string,
  language: "tsx" | "jsx",
  allowedImports: string[],
  existingScope?: Record<string, any>,
): React.ComponentType<DynamicRendererProps> {
  // 1. Strip imports
  let processedCode = stripImports(code);

  // 2. Babel transform
  processedCode = babelTransform(processedCode, language);

  // 3. Replace export default
  processedCode = replaceExportDefault(processedCode);

  // 4. Build scope (reuse if provided, e.g. when utility_code already built it)
  const scope = existingScope
    ? { ...existingScope }
    : buildToolRendererScope(allowedImports);

  // 5. Patch missing identifiers
  patchScopeForMissingIdentifiers(processedCode, scope);

  // 6. Execute
  const { paramNames, paramValues } = getScopeFunctionParameters(scope);

  const componentFunction = new Function(...paramNames, processedCode);
  const component = componentFunction(...paramValues);

  if (typeof component !== "function") {
    throw new Error(
      "Component code must export default a function component. " +
        `Got ${typeof component} instead.`,
    );
  }

  return component as React.ComponentType<DynamicRendererProps>;
}

/**
 * Compiles utility code and returns its exports merged into the scope.
 * The utility code should use `export` statements; the compiler collects them.
 */
function compileUtilityCode(
  code: string,
  language: "tsx" | "jsx",
  allowedImports: string[],
): Record<string, any> {
  const scope = buildToolRendererScope(allowedImports);

  let processedCode = stripImports(code);
  processedCode = babelTransform(processedCode, language);

  // Collect named exports by wrapping in an object
  // Convert: export function foo() {} → _exports.foo = function foo() {}
  // Convert: export const bar = ... → _exports.bar = ...
  let wrappedCode = "var _exports = {};\n";
  wrappedCode += processedCode
    .replace(/^export\s+function\s+(\w+)/gm, "_exports.$1 = function $1")
    .replace(/^export\s+const\s+(\w+)\s*=/gm, "_exports.$1 = ")
    .replace(/^export\s+let\s+(\w+)\s*=/gm, "_exports.$1 = ")
    .replace(/^export\s+var\s+(\w+)\s*=/gm, "_exports.$1 = ")
    .replace(/^export\s+default\s+/m, "_exports.default = ")
    .replace(/^export\s+\{[^}]+\}\s*;?\s*$/gm, "");
  wrappedCode += "\nreturn _exports;";

  patchScopeForMissingIdentifiers(wrappedCode, scope);
  const { paramNames, paramValues } = getScopeFunctionParameters(scope);

  const utilFunction = new Function(...paramNames, wrappedCode);
  const utilExports = utilFunction(...paramValues);

  // Merge utility exports into scope
  const mergedScope = { ...scope };
  if (utilExports && typeof utilExports === "object") {
    for (const [key, value] of Object.entries(utilExports)) {
      if (key !== "default" && key !== "__esModule") {
        mergedScope[key] = value;
      }
    }
  }

  return mergedScope;
}

/**
 * Compiles a header function (subtitle or extras).
 *
 * Accepts two code styles:
 *   1. A complete function:  `export default function(toolUpdates) { ... }`
 *   2. A bare function body: `const x = ...; return x;`
 *
 * In both cases, a callable `(toolUpdates) => any` is returned.
 *
 * IMPORTANT: the function-body wrapping must happen BEFORE babelTransform,
 * otherwise Babel sees `return` at the top level of a script and throws
 * "return outside of function".
 */
type CompiledHeaderFn = (
  entry: ToolLifecycleEntry,
  events?: ToolEventPayload[],
) => any;

function compileHeaderFunction(
  code: string,
  language: "tsx" | "jsx",
  allowedImports: string[],
  contractVersion: ContractVersion,
  existingScope?: Record<string, any>,
): CompiledHeaderFn {
  const scope = existingScope
    ? { ...existingScope }
    : buildToolRendererScope(allowedImports);

  let processedCode = stripImports(code);

  const trimmedRaw = processedCode.trim();
  const isAlreadyComplete =
    trimmedRaw.startsWith("export default") ||
    /^export\s+(?:async\s+)?function\s+\w+/.test(trimmedRaw) ||
    /^export\s+(?:const|let|var)\s+\w+\s*=/.test(trimmedRaw);

  // Parameter list depends on contract version for backwards-compat with
  // bare-function-body code stored in v1 components.
  const paramList = contractVersion === 2 ? "entry, events" : "toolUpdates";

  if (!isAlreadyComplete) {
    processedCode = `export default function __headerFn__(${paramList}) {\n${processedCode}\n}`;
  }

  processedCode = babelTransform(processedCode, language);
  processedCode = replaceExportDefault(processedCode);

  const trimmed = processedCode.trim();
  const isReadyToExecute = trimmed.startsWith("return ");

  if (!isReadyToExecute) {
    const namedFnMatch = trimmed.match(/^function\s+(\w+)\s*\(/);
    if (namedFnMatch) {
      processedCode = processedCode.trimEnd() + `\nreturn ${namedFnMatch[1]};`;
    } else {
      processedCode = `return function headerFn(${paramList}) {\n${processedCode}\n}`;
    }
  }

  patchScopeForMissingIdentifiers(processedCode, scope);
  const { paramNames, paramValues } = getScopeFunctionParameters(scope);

  const factory = new Function(...paramNames, processedCode);
  const rawFn = factory(...paramValues);

  if (typeof rawFn !== "function") {
    throw new Error(
      "Header code must export default a function. " +
        `Got ${typeof rawFn} instead.`,
    );
  }

  // v1 components expect (toolUpdates) — adapt them so the registry can call
  // everything with the v2 (entry, events) signature.  v1 is treated as a
  // no-op header (returns null/undefined) because ToolCallObject is gone.
  if (contractVersion === 1) {
    return () => null;
  }

  return rawFn as CompiledHeaderFn;
}

// ---------------------------------------------------------------------------
// Main entry: compile a full ToolUiComponentRow
// ---------------------------------------------------------------------------

/**
 * Compiles a database row into a fully usable `CompiledToolRenderer`.
 * Returns the compiled components ready for the registry.
 *
 * @throws Error if inline_code fails to compile (it's required).
 */
/**
 * Runtime policy: v1 components are compiled but always fall back to the
 * GenericRenderer via a stub that throws, because their internal data shape
 * (`ToolCallObject[]`) no longer exists.  Admins must migrate them.
 */
function makeV1Stub(
  toolName: string,
): React.ComponentType<DynamicRendererProps> {
  const Stub: React.ComponentType<DynamicRendererProps> = () => {
    throw new Error(
      `tool_ui_component "${toolName}" uses contract v1 (ToolCallObject-based) ` +
        `which is no longer supported. Migrate the component to contract v2 ` +
        `(entry / events based) from the admin UI.`,
    );
  };
  Stub.displayName = `V1ContractStub(${toolName})`;
  return Stub;
}

export async function compileToolUiComponent(
  row: ToolUiComponentRow,
): Promise<CompiledToolRenderer> {
  const { allowed_imports } = row;
  const language: "jsx" | "tsx" = row.language === "jsx" ? "jsx" : "tsx";

  // contract_version is a first-class DB column (check constraint 1 | 2).
  const contractVersion: ContractVersion = row.contract_version === 2 ? 2 : 1;

  // v1 components: compile nothing — the whole renderer becomes a stub that
  // throws into the error boundary → GenericRenderer fallback. We can short
  // circuit BEFORE loading babel since v1 never invokes the transform.
  if (contractVersion === 1) {
    const Stub = makeV1Stub(row.tool_name);
    return {
      toolName: row.tool_name,
      displayName: row.display_name,
      resultsLabel: row.results_label,
      keepExpandedOnStream: row.keep_expanded_on_stream,
      version: String(row.version),
      componentId: row.id,
      contractVersion,
      InlineComponent: Stub,
      OverlayComponent: null,
      getHeaderExtras: null,
      getHeaderSubtitle: null,
    };
  }

  // v2 — canonical (entry, events) contract — compile normally.
  // Preload babel exactly once per process before any sync helper runs.
  // Subsequent `compileToolUiComponent` calls hit the cached transform.
  await loadBabelTransform();

  let sharedScope: Record<string, any> | undefined;
  if (row.utility_code?.trim()) {
    sharedScope = compileUtilityCode(
      row.utility_code,
      language,
      allowed_imports,
    );
  }

  const InlineComponent = compileComponentCode(
    row.inline_code,
    language,
    allowed_imports,
    sharedScope,
  );

  let OverlayComponent: React.ComponentType<DynamicRendererProps> | null = null;
  if (row.overlay_code?.trim()) {
    try {
      OverlayComponent = compileComponentCode(
        row.overlay_code,
        language,
        allowed_imports,
        sharedScope,
      );
    } catch (err) {
      console.error(
        `[DynamicToolRenderer] Failed to compile overlay for ${row.tool_name}:`,
        err,
      );
    }
  }

  let getHeaderExtras: CompiledHeaderFn | null = null;
  if (row.header_extras_code?.trim()) {
    try {
      getHeaderExtras = compileHeaderFunction(
        row.header_extras_code,
        language,
        allowed_imports,
        contractVersion,
        sharedScope,
      );
    } catch (err) {
      console.error(
        `[DynamicToolRenderer] Failed to compile header extras for ${row.tool_name}:`,
        err,
      );
    }
  }

  let getHeaderSubtitle: CompiledHeaderFn | null = null;
  if (row.header_subtitle_code?.trim()) {
    try {
      getHeaderSubtitle = compileHeaderFunction(
        row.header_subtitle_code,
        language,
        allowed_imports,
        contractVersion,
        sharedScope,
      );
    } catch (err) {
      console.error(
        `[DynamicToolRenderer] Failed to compile header subtitle for ${row.tool_name}:`,
        err,
      );
    }
  }

  return {
    toolName: row.tool_name,
    displayName: row.display_name,
    resultsLabel: row.results_label,
    keepExpandedOnStream: row.keep_expanded_on_stream,
    version: String(row.version),
    componentId: row.id,
    contractVersion,
    InlineComponent,
    OverlayComponent,
    getHeaderExtras,
    getHeaderSubtitle,
  };
}
