/**
 * Hidden Path Utilities
 * 
 * This module provides utilities for handling hidden paths functionality
 */

import { PathArray } from "../types";

/**
 * Normalizes a path from bracket notation to dot notation
 * @param {string} path - Path string like 'data["key"]' to convert to 'data.key'
 * @returns {string} - Normalized path using consistent dot notation
 */
export const normalizePath = (path: string): string => {
  // Just normalize bracket notation to dot notation - it's simpler now that we're consistent
  // For array indices, we'll keep brackets [0] but for object keys we use dots
  return path.replace(/\["([^"]+)"\]/g, ".$1");
};

/**
 * Normalize an array of paths from bracket notation to dot notation
 * @param {string[]} paths - Array of path strings to normalize
 * @returns {string[]} - Array of normalized paths
 */
export const normalizeHiddenPaths = (paths: string[]): string[] => {
  return paths.map(path => normalizePath(path));
};

/**
 * Process data with hidden paths to hide specified parts of the data structure
 * @param {unknown} data - Data to process
 * @param {string[]} hiddenPaths - Array of paths to hide
 * @param {string} currentFullPath - Current path being processed (default: "data")
 * @returns {unknown} - Processed data with hidden elements replaced
 */
export const processDataWithHiddenPaths = (data: unknown, hiddenPaths: string[], currentFullPath = "data"): unknown => {
  // Normalize hidden paths for consistent comparison
  const normalizedHiddenPaths = normalizeHiddenPaths(hiddenPaths);

  // Function to process data with normalized hidden paths
  const processData = (data: unknown, currentFullPath = "data"): unknown => {
    // Check if the current path itself should be hidden
    if (normalizedHiddenPaths.some(hiddenPath => {
      // Check exact match
      if (hiddenPath === currentFullPath) return true;

      // Check if this is a child of a hidden path using both notation types
      // For dot notation (.key)
      if (currentFullPath.startsWith(hiddenPath + ".")) return true;
      
      // For bracket notation ([0])
      if (currentFullPath.startsWith(hiddenPath + "[")) return true;

      return false;
    })) {
      return Array.isArray(data) ? [{ hidden: true }] : typeof data === "object" && data !== null ? { hidden: true } : data;
    }

    // Handle primitive values
    if (typeof data !== "object" || data === null) {
      return data;
    }

    // For arrays and objects, process each item
    if (Array.isArray(data)) {
      return data.map((item, idx) => {
        // For array items, use bracket notation consistently
        const childPath = `${currentFullPath}[${idx}]`;
        return processData(item, childPath);
      });
    } else {
      const result: Record<string, unknown> = {};
      const dataRecord = data as Record<string, unknown>;

      // Process object properties
      for (const key in dataRecord) {
        // For object properties, use dot notation consistently
        // Check if the key is a valid JS identifier
        const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? `${currentFullPath}.${key}`
          : `${currentFullPath}["${key}"]`;

        // Process recursively
        result[key] = processData(dataRecord[key], childPath);
      }
      return result;
    }
  };

  return processData(data, currentFullPath);
};

/**
 * Checks if a path is hidden
 * @param {string | PathArray} path - Path to check (either a string or PathArray)
 * @param {string[]} hiddenPaths - Array of hidden paths
 * @returns {boolean} - Whether the path is hidden
 */
export const isPathHidden = (path: string | PathArray | null, hiddenPaths: string[]): boolean => {
  if (!path) return false;

  let relativePath: string;

  // Handle different path formats
  if (typeof path === 'string') {
    // If it's already a string path like "data.property" from contextMenu
    relativePath = path;
  } else if (Array.isArray(path) && path.length > 0) {
    // If it's a PathArray format [[index, key], [index, key], ...]
    // Get the key name from the path
    const keyName = path[path.length - 1][1];
    
    // Generate path in simple dot notation
    relativePath = `data`;
    if (keyName !== "All") {
      // For Item X format (array indices), we use bracket notation
      if (keyName.startsWith("Item ")) {
        const index = parseInt(keyName.replace("Item ", ""));
        relativePath += `[${index}]`;
      } else if (keyName.startsWith("Object ")) {
        const index = parseInt(keyName.replace("Object ", ""));
        relativePath += `[${index}]`;
      } else {
        // For normal keys, use dot notation
        relativePath += `.${keyName}`;
      }
    }
  } else {
    // Invalid path format
    return false;
  }

  return hiddenPaths.includes(relativePath);
}; 