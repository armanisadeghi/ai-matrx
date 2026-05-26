import React, { useState, useEffect } from "react";
import { staticLucideIconMap } from "@/components/official/icons/IconResolver";
import { LiveProvider, LiveError, LivePreview } from "react-live";
import * as UIComponents from "@/components/ui/react-live-scope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

import axios from "axios";
import * as _ from "lodash";
import * as dateFns from "date-fns";

/**
 * Enhanced DynamicComponentRenderer that handles imports
 * This component can be used anywhere in your app to render
 * dynamically generated React components
 */
const DynamicComponentRenderer = ({ code, containerClassName = "" }) => {
  const [processedCode, setProcessedCode] = useState("");
  const [error, setError] = useState(null);

  // Process the code to handle imports and other transformations
  useEffect(() => {
    try {
      if (!code) {
        setProcessedCode("");
        return;
      }

      // Process import comments and prepare the code
      const transformedCode = processComponentCode(code);
      setProcessedCode(transformedCode);
      setError(null);
    } catch (err) {
      console.error("Error processing component code:", err);
      setError(err.message);
    }
  }, [code]);

  // Create a scope with all the required dependencies
  const scope = {
    // React core
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useContext: React.useContext,
    useReducer: React.useReducer,
    useCallback: React.useCallback,
    useMemo: React.useMemo,
    useRef: React.useRef,

    // UI Components - spread all components
    ...UIComponents,

    // Redux
    useAppDispatch,
    useAppSelector,

    // Supabase
    supabase,

    // Next.js navigation
    useRouter,
    Link,

    // Icons (curated static set — avoids bundling the full lucide namespace)
    ...staticLucideIconMap,

    // External libs
    axios,
    _,
    dateFns,
  };

  // The actual component rendering
  return (
    <div className={`dynamic-component-container ${containerClassName}`}>
      {error ? (
        <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-md text-red-700 dark:text-red-300">
          <h3 className="font-bold mb-2">Error Rendering Component</h3>
          <pre className="whitespace-pre-wrap text-sm">{error}</pre>
        </div>
      ) : processedCode ? (
        <LiveProvider code={processedCode} scope={scope} noInline={false}>
          <div className="live-preview-wrapper bg-textured p-4 rounded-md border-border">
            <LiveError className="p-3 mb-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm" />
            <LivePreview />
          </div>
        </LiveProvider>
      ) : (
        <div className="p-4 border-border rounded-md bg-textured text-gray-400 dark:text-gray-500 flex items-center justify-center min-h-[200px]">
          <p>No component code provided</p>
        </div>
      )}
    </div>
  );
};

/**
 * Process component code to handle imports and transformations
 */
function processComponentCode(code) {
  // First, handle standard ES module imports
  // Find all import statements and collect the imported items
  const importRegex = /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?/g;
  const importMatches = Array.from(code.matchAll(importRegex));

  // Remove all import statements from the code
  let processedCode = code;
  for (const match of importMatches) {
    processedCode = processedCode.replace(match[0], "");
  }

  // Also handle the special import comment format
  const commentImportRegex = /\/\/\s*@import\s+(.+)\s+from\s+['"](.+)['"]/g;
  let commentMatch;

  // Remove import comments from the code
  while ((commentMatch = commentImportRegex.exec(processedCode)) !== null) {
    processedCode = processedCode.replace(commentMatch[0], "");
  }

  // Remove any render() calls from the code to avoid conflicts
  processedCode = processedCode.replace(/render\s*\(<.+>\);?/g, "");

  // Trim extra whitespace that might be left
  processedCode = processedCode.replace(/^\s*\n/gm, "");

  // Extract the component name (assuming the first function definition is our component)
  const functionNameMatch = processedCode.match(/function\s+([A-Za-z0-9_]+)/);
  const componentName = functionNameMatch ? functionNameMatch[1] : null;

  if (!componentName) {
    throw new Error("Could not find a component function in the code");
  }

  // We're switching to inline mode (noInline={false}) which means we don't need to call render() ourselves
  return processedCode;
}

export default DynamicComponentRenderer;
