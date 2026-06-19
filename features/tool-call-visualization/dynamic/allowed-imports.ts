/**
 * Capability registry for dynamic React (tool UI components, prompt apps, and
 * inline React code blocks in chat/notes).
 *
 * THE single source of truth for "what can generated React import / use." Every
 * consumer builds its execution scope from here.
 *
 * ── Bundle safety (load-bearing) ────────────────────────────────────────────
 * Every capability loads via a dynamic `import()` with a LITERAL specifier, so
 * the bundler splits each into its own async chunk. `buildToolRendererScope` is
 * async and only loads the capabilities it is asked for, so:
 *   - Nothing here is in the SSR or initial client bundle (the whole compiler is
 *     reached only through lazy chunks + a dynamic Babel import).
 *   - Heavy libs (recharts, three, xlsx, react-pdf, motion, katex) become
 *     separate chunks fetched ONLY when a block actually references them
 *     (`detectReactCapabilities` scans the source). A chart block never downloads
 *     three.js; a 3D block never downloads recharts.
 *   - `core: true` capabilities (React, common shadcn UI, lucide, cn) are loaded
 *     for every React block, but they already ship in the app's shared chunks so
 *     re-importing them adds ~nothing.
 *
 * RULES FOR GENERATED COMPONENTS:
 *   1. Import from the paths below (or just use the provided identifiers).
 *   2. All React hooks, lucide icons (missing → placeholder), and `cn` are always
 *      available.
 *   3. No direct node_modules access beyond this registry; no `require()` / no
 *      dynamic `import()` in the generated code itself.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

type ScopeStrategy = "spread" | "named" | "namespace";

interface CapabilityConfig {
  /** Specifier used in `allowed_imports` rows and in source detection. */
  path: string;
  /** Dynamic import — MUST use a literal string so the bundler can split it. */
  loader: () => Promise<any>;
  scopeStrategy: ScopeStrategy;
  /** For "named": which exports to lift into scope. */
  exports?: string[];
  /** moduleKey → scopeKey (e.g. { default: "React" }). */
  exportMap?: Record<string, string>;
  /** For "namespace": expose the whole module under this identifier. */
  namespaceName?: string;
  /** lucide-style: unknown PascalCase identifiers resolve to a placeholder. */
  safeProxy?: boolean;
  /** Always loaded for inline React blocks (light, already in shared chunks). */
  core?: boolean;
  /** Identifier names that imply this capability (heavy-lib demand detection). */
  provides?: string[];
  /** Human description for the admin/agent capability list. */
  description?: string;
}

const ns = (mod: any) => mod?.default ?? mod;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TOOL_RENDERER_IMPORTS_CONFIG: CapabilityConfig[] = [
  // ── React core ──────────────────────────────────────────────────────────
  {
    path: "react",
    loader: () => import("react"),
    scopeStrategy: "named",
    exports: [
      "useState",
      "useEffect",
      "useMemo",
      "useCallback",
      "useRef",
      "useReducer",
      "useContext",
      "useId",
      "useTransition",
      "useDeferredValue",
      "Fragment",
    ],
    exportMap: { default: "React" },
    core: true,
    description: "React core (hooks, Fragment)",
  },

  // ── Icons ─────────────────────────────────────────────────────────────────
  {
    path: "lucide-react",
    loader: () => import("lucide-react"),
    scopeStrategy: "spread",
    safeProxy: true,
    core: true,
    description: "All Lucide icons (missing names render a placeholder)",
  },

  // ── Utility ─────────────────────────────────────────────────────────────
  {
    path: "@/lib/utils",
    loader: () => import("@/lib/utils"),
    scopeStrategy: "named",
    exports: ["cn"],
    core: true,
    description: "cn() className merge utility",
  },

  // ── Core shadcn UI (light, app-wide; loaded for every React block) ────────
  {
    path: "@/components/ui/badge",
    loader: () => import("@/components/ui/badge"),
    scopeStrategy: "named",
    exports: ["Badge"],
    core: true,
  },
  {
    path: "@/components/ui/button",
    loader: () => import("@/components/ui/button"),
    scopeStrategy: "named",
    exports: ["Button"],
    core: true,
  },
  {
    path: "@/components/ui/card",
    loader: () => import("@/components/ui/card"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/input",
    loader: () => import("@/components/ui/input"),
    scopeStrategy: "named",
    exports: ["Input"],
    core: true,
  },
  {
    path: "@/components/ui/label",
    loader: () => import("@/components/ui/label"),
    scopeStrategy: "named",
    exports: ["Label"],
    core: true,
  },
  {
    path: "@/components/ui/select",
    loader: () => import("@/components/ui/select"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/slider",
    loader: () => import("@/components/ui/slider"),
    scopeStrategy: "named",
    exports: ["Slider"],
    core: true,
  },
  {
    path: "@/components/ui/switch",
    loader: () => import("@/components/ui/switch"),
    scopeStrategy: "named",
    exports: ["Switch"],
    core: true,
  },
  {
    path: "@/components/ui/tabs",
    loader: () => import("@/components/ui/tabs"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/textarea",
    loader: () => import("@/components/ui/textarea"),
    scopeStrategy: "named",
    exports: ["Textarea"],
    core: true,
  },
  {
    path: "@/components/ui/tooltip",
    loader: () => import("@/components/ui/tooltip"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/accordion",
    loader: () => import("@/components/ui/accordion"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/collapsible",
    loader: () => import("@/components/ui/collapsible"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/progress",
    loader: () => import("@/components/ui/progress"),
    scopeStrategy: "named",
    exports: ["Progress"],
    core: true,
  },
  {
    path: "@/components/ui/separator",
    loader: () => import("@/components/ui/separator"),
    scopeStrategy: "named",
    exports: ["Separator"],
    core: true,
  },
  {
    path: "@/components/ui/scroll-area",
    loader: () => import("@/components/ui/scroll-area"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/dialog",
    loader: () => import("@/components/ui/dialog"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/sheet",
    loader: () => import("@/components/ui/sheet"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/dropdown-menu",
    loader: () => import("@/components/ui/dropdown-menu"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/table",
    loader: () => import("@/components/ui/table"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/checkbox",
    loader: () => import("@/components/ui/checkbox"),
    scopeStrategy: "named",
    exports: ["Checkbox"],
    core: true,
  },
  {
    path: "@/components/ui/radio-group",
    loader: () => import("@/components/ui/radio-group"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/popover",
    loader: () => import("@/components/ui/popover"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/avatar",
    loader: () => import("@/components/ui/avatar"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/alert",
    loader: () => import("@/components/ui/alert"),
    scopeStrategy: "spread",
    core: true,
  },
  {
    path: "@/components/ui/skeleton",
    loader: () => import("@/components/ui/skeleton"),
    scopeStrategy: "named",
    exports: ["Skeleton"],
    core: true,
  },

  // ── Markdown ────────────────────────────────────────────────────────────
  {
    path: "@/components/MarkdownStream",
    loader: () => import("@/components/MarkdownStream"),
    scopeStrategy: "named",
    exportMap: { default: "MarkdownStream" },
    core: true,
    description: "MarkdownStream renderer",
  },

  // ── Heavy capabilities — demand-loaded only (own chunks) ──────────────────
  {
    path: "recharts",
    loader: () => import("recharts"),
    scopeStrategy: "spread",
    provides: [
      "ResponsiveContainer",
      "LineChart",
      "BarChart",
      "AreaChart",
      "PieChart",
      "RadarChart",
      "ScatterChart",
      "ComposedChart",
      "RadialBarChart",
    ],
    description: "Charts & graphs (recharts)",
  },
  {
    path: "motion/react",
    loader: () => import("motion/react"),
    scopeStrategy: "spread",
    provides: ["motion", "AnimatePresence", "useAnimate", "useInView"],
    description: "Animation (motion / framer-motion)",
  },
  {
    path: "react-katex",
    loader: () => import("react-katex"),
    scopeStrategy: "spread",
    provides: ["BlockMath", "InlineMath"],
    description: "Math typesetting (KaTeX)",
  },
  {
    path: "react-pdf",
    loader: () => import("react-pdf"),
    scopeStrategy: "named",
    exports: ["Document", "Page", "Outline"],
    provides: ["Document", "Page", "Outline"],
    description: "PDF document viewing (react-pdf)",
  },
  {
    path: "xlsx",
    loader: () => import("xlsx"),
    scopeStrategy: "namespace",
    namespaceName: "XLSX",
    provides: ["XLSX"],
    description: "Workbooks / spreadsheets (xlsx)",
  },
  {
    path: "@react-three/fiber",
    loader: () => import("@react-three/fiber"),
    scopeStrategy: "spread",
    provides: ["Canvas", "useFrame", "useThree", "useLoader"],
    description: "3D React renderer (react-three-fiber)",
  },
  {
    path: "three",
    loader: () => import("three"),
    scopeStrategy: "namespace",
    namespaceName: "THREE",
    provides: ["THREE"],
    description: "3D engine (three.js)",
  },
  {
    path: "date-fns",
    loader: () => import("date-fns"),
    scopeStrategy: "namespace",
    namespaceName: "dateFns",
    provides: ["dateFns"],
    description: "Date utilities (date-fns)",
  },
  {
    path: "lodash",
    loader: () => import("lodash"),
    scopeStrategy: "namespace",
    namespaceName: "_",
    provides: ["_"],
    description: "Utility helpers (lodash)",
  },
];

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

const CAP_BY_PATH = new Map<string, CapabilityConfig>();
for (const cap of TOOL_RENDERER_IMPORTS_CONFIG) CAP_BY_PATH.set(cap.path, cap);

/** Paths always loaded for inline React blocks. */
export function getCoreCapabilityPaths(): string[] {
  return TOOL_RENDERER_IMPORTS_CONFIG.filter((c) => c.core).map((c) => c.path);
}

/**
 * Scan source for the capabilities it actually needs (import specifiers +
 * heavy-lib provided identifiers), unioned with the always-on core set. Heavy
 * libs not referenced are never loaded → never chunked in.
 */
export function detectReactCapabilities(code: string): string[] {
  const needed = new Set<string>(getCoreCapabilityPaths());

  const importedPaths = new Set<string>();
  for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    importedPaths.add(m[1]);
  }

  for (const cap of TOOL_RENDERER_IMPORTS_CONFIG) {
    if (cap.core) continue;
    if (importedPaths.has(cap.path)) {
      needed.add(cap.path);
      continue;
    }
    if (
      cap.provides?.some((id) =>
        new RegExp(`\\b${id.replace(/[$]/g, "\\$")}\\b`).test(code),
      )
    ) {
      needed.add(cap.path);
    }
  }

  return [...needed];
}

export function getDefaultImportsForToolRenderer(): string[] {
  return [
    "react",
    "lucide-react",
    "@/lib/utils",
    "@/components/ui/badge",
    "@/components/ui/button",
    "@/components/ui/card",
    "@/components/ui/tabs",
  ];
}

export function getAllAvailableImports(): Array<{
  path: string;
  description: string;
}> {
  return TOOL_RENDERER_IMPORTS_CONFIG.map((c) => ({
    path: c.path,
    description: c.description || c.path,
  }));
}

// ---------------------------------------------------------------------------
// Fallback icon factory (for missing Lucide icons)
// ---------------------------------------------------------------------------

function createFallbackIcon(iconName: string) {
  const FallbackIcon = React.forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number | string }
  >(({ size = 24, className, ...props }, ref) => {
    return React.createElement(
      "svg",
      {
        ref,
        xmlns: "http://www.w3.org/2000/svg",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className,
        "data-missing-icon": iconName,
        ...props,
      },
      React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
      React.createElement("path", {
        d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
      }),
      React.createElement("line", { x1: 12, y1: 17, x2: 12.01, y2: 17 }),
    );
  });
  FallbackIcon.displayName = `MissingIcon(${iconName})`;
  return FallbackIcon;
}

// ---------------------------------------------------------------------------
// Safe proxy for modules (returns fallback for missing icons)
// ---------------------------------------------------------------------------

const safeProxyCache = new Map<string, Record<string, any>>();

function createSafeModuleProxy(
  importPath: string,
  moduleExports: Record<string, any>,
): Record<string, any> {
  if (safeProxyCache.has(importPath)) {
    return safeProxyCache.get(importPath)!;
  }

  const safeExports: Record<string, any> = { ...moduleExports };

  const proxy = new Proxy(safeExports, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (
        typeof prop !== "string" ||
        prop.startsWith("_") ||
        prop === "default" ||
        prop === "__esModule"
      ) {
        return undefined;
      }
      if (/^[A-Z]/.test(prop)) {
        const fallback = createFallbackIcon(prop);
        target[prop] = fallback;
        return fallback;
      }
      return undefined;
    },
    has(target, prop) {
      if (typeof prop === "string" && /^[A-Z]/.test(prop)) return true;
      return prop in target;
    },
  });

  safeProxyCache.set(importPath, proxy);
  return proxy;
}

// ---------------------------------------------------------------------------
// Scope builder (async — loads only the requested capabilities)
// ---------------------------------------------------------------------------

/**
 * Builds the execution scope for dynamic React. Only the capabilities in
 * `allowedImports` are loaded (each via its own dynamic chunk). React core is
 * always present.
 */
export async function buildToolRendererScope(
  allowedImports: string[],
): Promise<Record<string, any>> {
  const scope: Record<string, any> = {};

  // React core is always present even if "react" wasn't requested.
  scope.React = React;
  scope.useState = React.useState;
  scope.useEffect = React.useEffect;
  scope.useMemo = React.useMemo;
  scope.useCallback = React.useCallback;
  scope.useRef = React.useRef;
  scope.useReducer = React.useReducer;
  scope.useContext = React.useContext;
  scope.Fragment = React.Fragment;

  // Load every requested capability in parallel, but APPLY them to the scope in
  // `allowedImports` order so spread-key precedence is deterministic (later
  // entries win — e.g. recharts' `Tooltip` overrides the UI `Tooltip` only when
  // charts are actually requested, since heavy libs come after core).
  const loaded = await Promise.all(
    allowedImports.map(async (importPath) => {
      const config = CAP_BY_PATH.get(importPath);
      if (!config || config.path === "react") return null;
      try {
        return { config, mod: await config.loader() };
      } catch (err) {
        console.error(
          `[DynamicReact] Failed to load capability: ${importPath}`,
          err,
        );
        return null;
      }
    }),
  );

  for (const entry of loaded) {
    if (!entry) continue;
    const { config, mod } = entry;

    if (config.scopeStrategy === "namespace" && config.namespaceName) {
      scope[config.namespaceName] = ns(mod);
      continue;
    }

    if (config.scopeStrategy === "spread") {
      const source = ns(mod);
      if (config.safeProxy) {
        const safeModule = createSafeModuleProxy(config.path, source);
        for (const key of Object.keys(source)) scope[key] = source[key];
        if (!scope.__safeProxies) scope.__safeProxies = {};
        scope.__safeProxies[config.path] = safeModule;
      } else {
        Object.assign(scope, source);
      }
      continue;
    }

    // named
    if (config.exports) {
      for (const exportName of config.exports) {
        if (mod[exportName] !== undefined) scope[exportName] = mod[exportName];
      }
    }
    if (config.exportMap) {
      for (const [moduleKey, scopeKey] of Object.entries(config.exportMap)) {
        scope[scopeKey] =
          moduleKey === "default" ? (mod.default ?? mod) : mod[moduleKey];
      }
    }
  }

  return scope;
}

// ---------------------------------------------------------------------------
// Missing identifier patcher
// ---------------------------------------------------------------------------

/**
 * Scans transformed code for PascalCase identifiers not in scope and injects
 * safe fallback components to prevent ReferenceError crashes.
 */
export function patchScopeForMissingIdentifiers(
  code: string,
  scope: Record<string, any>,
): void {
  const codeForScanning = code
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gs, "``");

  const identifierRegex = /\b([A-Z][a-zA-Z0-9]*)\b/g;
  const foundIdentifiers = new Set<string>();

  let match;
  while ((match = identifierRegex.exec(codeForScanning)) !== null) {
    foundIdentifiers.add(match[1]);
  }

  const skipList = new Set([
    "React",
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Date",
    "Math",
    "JSON",
    "Promise",
    "Error",
    "TypeError",
    "RangeError",
    "RegExp",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Symbol",
    "Proxy",
    "Reflect",
    "Intl",
    "URL",
    "FormData",
    "Headers",
    "Request",
    "Response",
    "AbortController",
    "HTMLElement",
    "SVGElement",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLButtonElement",
    "HTMLDivElement",
    "HTMLFormElement",
    "Node",
    "Element",
    "Document",
    "Window",
    "Infinity",
    "NaN",
    "Fragment",
    "Promise",
    "Boolean",
  ]);

  const safeProxies = scope.__safeProxies as
    | Record<string, Record<string, any>>
    | undefined;

  for (const identifier of foundIdentifiers) {
    if (skipList.has(identifier)) continue;
    if (identifier in scope) continue;

    if (safeProxies) {
      let provided = false;
      for (const proxy of Object.values(safeProxies)) {
        const value = proxy[identifier];
        if (value !== undefined) {
          scope[identifier] = value;
          provided = true;
          break;
        }
      }
      if (provided) continue;
    }

    scope[identifier] = createFallbackIcon(identifier);
  }
}

// ---------------------------------------------------------------------------
// Scope → function parameters
// ---------------------------------------------------------------------------

/**
 * Filters scope to valid JS identifiers that can be used as function params.
 */
export function getScopeFunctionParameters(scope: Record<string, any>): {
  paramNames: string[];
  paramValues: any[];
} {
  const paramNames = Object.keys(scope).filter(
    (key) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) && !key.startsWith("__"),
  );
  const paramValues = paramNames.map((key) => scope[key]);
  return { paramNames, paramValues };
}
