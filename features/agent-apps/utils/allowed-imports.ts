/**
 * Single source of truth for allowed imports in Agent Apps.
 * Ported verbatim from features/prompt-apps/utils/allowed-imports.ts —
 * ALLOWED_IMPORTS_CONFIG, the safe-proxy behavior, and scope builders are
 * security-critical. Do not widen this list without a separate review.
 */

import React from "react";
import type { Json } from "@/types/database.types";
import {
  createFallbackIcon,
  patchScopeForMissingIdentifiers as patchScopeForMissingIdentifiersImpl,
} from "@/features/agent-apps/utils/patch-scope-identifiers";

function coerceAllowedImportPaths(
  value: Json | null | undefined | string[],
): string[] {
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
    return value as string[];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

/**
 * Configuration for each allowed import
 */
interface AllowedImportConfig {
  /** The import path/identifier used in the database and for checks */
  path: string;
  /** How to require/load the module */
  loader: () => any;
  /** How to add to scope - either 'spread' (Object.assign all exports) or 'named' (specific exports) */
  scopeStrategy: "spread" | "named";
  /** For 'named' strategy: which exports to add to scope */
  exports?: string[];
  /** For 'named' strategy: optionally map export names to scope names */
  exportMap?: Record<string, string>;
  /** If true, wrap spread exports in a safe proxy that returns fallbacks for missing keys */
  safeProxy?: boolean;
}

/**
 * Core allowed imports configuration
 * Add new allowed imports here
 */
export const ALLOWED_IMPORTS_CONFIG: AllowedImportConfig[] = [
  {
    path: "react",
    loader: () => require("react"),
    scopeStrategy: "named",
    exports: ["useState", "useEffect", "useMemo", "useCallback", "useRef"],
    exportMap: {
      default: "React",
    },
  },
  {
    path: "lucide-react",
    loader: () => require("lucide-react"),
    scopeStrategy: "spread", // All Lucide icons available directly
    safeProxy: true, // Wrap in proxy to return fallback for non-existent icons
  },
  {
    path: "@/components/official/icons/IconResolver",
    loader: () => require("@/components/official/icons/IconResolver"),
    scopeStrategy: "named",
    exports: ["DynamicIcon", "renderIcon", "getIconComponent"],
  },
  {
    path: "@/components/Markdown",
    loader: () => require("@/components/MarkdownStream"),
    scopeStrategy: "named",
    exportMap: {
      default: "MarkdownStream",
    },
  },
  {
    path: "@/components/markdown", // lowercase - matches what code generators produce
    loader: () => require("@/components/MarkdownStream"),
    scopeStrategy: "named",
    exportMap: {
      default: "MarkdownStream",
    },
  },
  {
    path: "@/components/mardown", // common typo variant
    loader: () => require("@/components/MarkdownStream"),
    scopeStrategy: "named",
    exportMap: {
      default: "MarkdownStream",
    },
  },
  {
    path: "@/components/MarkdownStream",
    loader: () => require("@/components/MarkdownStream"),
    scopeStrategy: "named",
    exportMap: {
      default: "MarkdownStream",
    },
  },
  {
    path: "@/components/ui/button",
    loader: () => require("@/components/ui/button"),
    scopeStrategy: "named",
    exports: ["Button"],
  },
  {
    path: "@/components/ui/input",
    loader: () => require("@/components/ui/input"),
    scopeStrategy: "named",
    exports: ["Input"],
  },
  {
    path: "@/components/ui/textarea",
    loader: () => require("@/components/ui/textarea"),
    scopeStrategy: "named",
    exports: ["Textarea"],
  },
  {
    path: "@/components/ui/card",
    loader: () => require("@/components/ui/card"),
    scopeStrategy: "spread", // Card, CardHeader, CardTitle, CardContent, etc.
  },
  {
    path: "@/components/ui/label",
    loader: () => require("@/components/ui/label"),
    scopeStrategy: "named",
    exports: ["Label"],
  },
  {
    path: "@/components/ui/select",
    loader: () => require("@/components/ui/select"),
    scopeStrategy: "spread", // Select, SelectTrigger, SelectContent, etc.
  },
  {
    path: "@/components/ui/slider",
    loader: () => require("@/components/ui/slider"),
    scopeStrategy: "named",
    exports: ["Slider"],
  },
  {
    path: "@/components/ui/switch",
    loader: () => require("@/components/ui/switch"),
    scopeStrategy: "named",
    exports: ["Switch"],
  },
  {
    path: "@/components/ui/tabs",
    loader: () => require("@/components/ui/tabs"),
    scopeStrategy: "spread", // Tabs, TabsList, TabsTrigger, TabsContent
  },
];

/**
 * Get list of allowed import paths (for database storage, display, etc.)
 */
export function getAllowedImportsList(): string[] {
  return ALLOWED_IMPORTS_CONFIG.map((config) => config.path);
}

/**
 * Get default imports for new apps
 * (subset of all allowed imports that are commonly needed)
 */
export function getDefaultImportsForNewApps(): string[] {
  return [
    "react",
    "lucide-react",
    "@/components/MarkdownStream", // Use new name for new apps
    "@/components/ui/button",
    "@/components/ui/input",
    "@/components/ui/textarea",
    "@/components/ui/card",
    "@/components/ui/label",
    "@/components/ui/select",
    "@/components/ui/slider",
    "@/components/ui/switch",
    "@/components/ui/tabs",
  ];
}

/**
 * Cache for safe proxy modules - avoids re-creating on every scope build
 */
const safeProxyCache = new Map<string, Record<string, any>>();

/**
 * Wraps a module's exports so that any missing key (e.g. a non-existent icon name)
 * returns a safe fallback component instead of undefined.
 * This prevents crashes when AI-generated code references icons that don't exist.
 */
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
      if (prop in target) {
        return target[prop];
      }

      // Skip non-icon lookups (internal JS symbols, React internals, etc.)
      if (
        typeof prop !== "string" ||
        prop.startsWith("_") ||
        prop === "default" ||
        prop === "__esModule"
      ) {
        return undefined;
      }

      // If it looks like a PascalCase component name (icon), return a fallback
      if (/^[A-Z]/.test(prop)) {
        console.warn(
          `[AgentApp] Missing icon "${prop}" from ${importPath}. Using fallback.`,
        );
        const fallback = createFallbackIcon(prop);
        // Cache it so subsequent accesses don't re-create
        target[prop] = fallback;
        return fallback;
      }

      return undefined;
    },
    has(target, prop) {
      if (typeof prop === "string" && /^[A-Z]/.test(prop)) {
        return true;
      }
      return prop in target;
    },
  });

  safeProxyCache.set(importPath, proxy);
  return proxy;
}

/**
 * Build component scope based on allowed imports
 * This is the core function that resolves imports and builds the execution scope
 *
 * @param allowedImports - Array of allowed import paths from the app configuration
 * @returns Scope object with all allowed dependencies ready for component execution
 */
export function buildComponentScope(
  allowedImports: string[] | Json | null | undefined,
): Record<string, any> {
  const scope: Record<string, any> = {};
  const importPaths = coerceAllowedImportPaths(allowedImports ?? null);

  // Always include React core (it's required)
  const ReactModule = require("react");
  const { useState, useEffect, useMemo, useCallback, useRef } = ReactModule;
  scope.React = ReactModule;
  scope.useState = useState;
  scope.useEffect = useEffect;
  scope.useMemo = useMemo;
  scope.useCallback = useCallback;
  scope.useRef = useRef;

  // Process each allowed import
  for (const importPath of importPaths) {
    const config = ALLOWED_IMPORTS_CONFIG.find((c) => c.path === importPath);

    if (!config) {
      console.warn(`Unknown import path: ${importPath}. Skipping.`);
      continue;
    }

    try {
      const module = config.loader();

      if (config.scopeStrategy === "spread") {
        if (config.safeProxy) {
          // Wrap in a safe proxy so missing keys return fallback components
          const safeModule = createSafeModuleProxy(config.path, module);
          // Spread the real module keys into scope
          for (const key of Object.keys(module)) {
            scope[key] = module[key];
          }
          // Store the proxy so patchScopeForMissingIdentifiers can use it
          if (!scope.__safeProxies) scope.__safeProxies = {};
          scope.__safeProxies[config.path] = safeModule;
          if (!scope.__safeProxyModuleKeys) scope.__safeProxyModuleKeys = {};
          scope.__safeProxyModuleKeys[config.path] = new Set(
            Object.keys(module),
          );
        } else {
          // Add all exports directly to scope
          Object.assign(scope, module);
        }
      } else if (config.scopeStrategy === "named") {
        // Add specific named exports
        if (config.exports) {
          for (const exportName of config.exports) {
            scope[exportName] = module[exportName];
          }
        }

        // Add mapped exports (e.g., default exports with custom names)
        if (config.exportMap) {
          for (const [moduleKey, scopeKey] of Object.entries(
            config.exportMap,
          )) {
            const value =
              moduleKey === "default"
                ? module.default || module
                : module[moduleKey];
            scope[scopeKey] = value;
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load import: ${importPath}`, err);
    }
  }

  // Add Markdown alias if MarkdownStream is in scope
  // This handles cases where database code uses `import Markdown from...` vs `import MarkdownStream from...`
  if (scope.MarkdownStream && !scope.Markdown) {
    scope.Markdown = scope.MarkdownStream;
  }

  // Official DynamicIcon — always available in sandboxed components so authors
  // can render any icon by name without importing each Lucide export.
  if (!scope.DynamicIcon) {
    try {
      const iconResolver = require("@/components/official/icons/IconResolver");
      scope.DynamicIcon = iconResolver.DynamicIcon;
      scope.renderIcon = iconResolver.renderIcon;
      scope.getIconComponent = iconResolver.getIconComponent;
    } catch {
      // Non-fatal — lucide spread + safe proxy still work
    }
  }

  return scope;
}

/**
 * Scans transformed JSX for component references missing from scope.
 */
export function patchScopeForMissingIdentifiers(
  code: string,
  scope: Record<string, any>,
): void {
  patchScopeForMissingIdentifiersImpl(code, scope, { logPrefix: "[AgentApp]" });
}

/**
 * Filter scope to only include valid JavaScript identifiers
 * (removes imports with special characters like '/' that can't be variable names)
 *
 * @param scope - The full scope object
 * @returns Object with parameter names and their corresponding values
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

/**
 * Check if an import path is allowed
 */
export function isImportAllowed(importPath: string): boolean {
  return ALLOWED_IMPORTS_CONFIG.some((config) => config.path === importPath);
}

/**
 * Get human-readable description of an import
 * (useful for UI display)
 */
export function getImportDescription(importPath: string): string {
  const descriptions: Record<string, string> = {
    react: "React core (useState, useEffect, useMemo, useCallback, useRef)",
    "lucide-react":
      "Lucide icons (all icons available) + use DynamicIcon for any name",
    "@/components/official/icons/IconResolver":
      "DynamicIcon — resolve any Lucide/custom icon by string name without importing each icon",
    "@/components/Markdown":
      "MarkdownStream component for rendering markdown (legacy path)",
    "@/components/markdown":
      "MarkdownStream component for rendering markdown (lowercase path)",
    "@/components/MarkdownStream":
      "MarkdownStream component for rendering markdown",
    "@/components/ui/button": "Button component",
    "@/components/ui/input": "Input component",
    "@/components/ui/textarea": "Textarea component",
    "@/components/ui/card":
      "Card components (Card, CardHeader, CardTitle, CardContent, etc.)",
    "@/components/ui/label": "Label component",
    "@/components/ui/select":
      "Select components (Select, SelectTrigger, SelectContent, etc.)",
    "@/components/ui/slider": "Slider component",
    "@/components/ui/switch": "Switch component",
    "@/components/ui/tabs":
      "Tabs components (Tabs, TabsList, TabsTrigger, TabsContent)",
  };

  return descriptions[importPath] || importPath;
}
