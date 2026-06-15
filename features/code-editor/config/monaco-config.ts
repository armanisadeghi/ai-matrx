/**
 * Monaco Editor Configuration
 * Sets up language services for syntax highlighting and IntelliSense
 *
 * IMPORTANT: This is lazy-loaded - only runs when Monaco Editor is actually used
 */

import { loader } from "@monaco-editor/react";
import { registerJsonMonacoThemes } from "./syntax-themes";
import { getAllTypeDefinitions } from "./type-definitions";

// Track if configuration has been initiated
let configurationPromise: Promise<void> | null = null;

/**
 * Configure Monaco Editor (lazy-loaded)
 * This runs only once when first Monaco Editor mounts
 * Returns a promise that resolves when configuration is complete
 */
export function configureMonaco(): Promise<void> {
  // Return existing configuration promise if already started
  if (configurationPromise) {
    return configurationPromise;
  }

  // Start configuration
  configurationPromise = (async () => {
    // Configure the loader to use CDN (default, but explicit)
    loader.config({
      paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs",
      },
    });

    // Initialize Monaco and configure language services
    const monaco = await loader.init();
    // ===== TypeScript/JavaScript Configuration =====
    // Enable all language features for maximum IntelliSense
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      checkJs: false, // Don't check JS files for TypeScript errors
      typeRoots: ["node_modules/@types"],
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      checkJs: false,
      typeRoots: ["node_modules/@types"],
      // Enable all TypeScript features
      strict: false, // Disable strict mode to be more lenient
      noImplicitAny: false,
      strictNullChecks: false,
      strictFunctionTypes: false,
      strictPropertyInitialization: false,
      noImplicitThis: false,
      alwaysStrict: false,
    });

    // Enable diagnostic options (error checking)
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });

    // Enable eager model sync for better performance
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

    // ===== Add common library definitions for better IntelliSense =====
    // Add type definitions for React, Lucide icons, and UI components
    const typeDefinitions = getAllTypeDefinitions();

    // Add a version/timestamp to force Monaco to recognize type definition updates
    // Change this version number when you update type definitions to bust the cache
    const VERSION = "v2";

    typeDefinitions.forEach(({ content, filePath }) => {
      const versionedPath = `${filePath}?${VERSION}`;
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        content,
        versionedPath,
      );
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        content,
        versionedPath,
      );
    });

    // Add console definitions for convenience
    const consoleLib = `
      declare interface Console {
        log(message?: any, ...optionalParams: any[]): void;
        error(message?: any, ...optionalParams: any[]): void;
        warn(message?: any, ...optionalParams: any[]): void;
        info(message?: any, ...optionalParams: any[]): void;
        debug(message?: any, ...optionalParams: any[]): void;
      }
      declare var console: Console;
    `;

    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      consoleLib,
      "ts:filename/console.d.ts",
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      consoleLib,
      "ts:filename/console.d.ts",
    );

    // ===== JSON Configuration =====
    registerJsonMonacoThemes(monaco);

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemas: [],
      enableSchemaRequest: true,
    });

    // Configuration complete
  })();

  return configurationPromise;
}
