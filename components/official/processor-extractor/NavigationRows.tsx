"use client";
import React from "react";
import { Button } from "@/components/ui/ButtonMine";
import { getDataAtPath } from "./utils/json-path-navigation-util";
import { PathArray } from "./types";

export interface NavigationRowsProps {
  originalData: any;
  currentPath: PathArray;
  onKeySelect: (rowIndex: number, key: string) => void;
  onContextMenu?: (e: React.MouseEvent, path: PathArray) => void;
  hiddenPaths?: string[];
  isPathHidden?: (path: PathArray) => boolean;
  hasWildcard?: boolean;
  wildcardPath?: string;
}

const NavigationRows: React.FC<NavigationRowsProps> = ({ 
  originalData, 
  currentPath, 
  onKeySelect, 
  onContextMenu, 
  isPathHidden
}) => {
  if (!originalData) return null;

  // Generate the rows to render for navigation
  const rowsToRender: React.ReactElement[] = [];
  
  // For each row in the path
  currentPath.forEach(([rowIndex, selectedKey], idx) => {
    // Create an internal path for data access that replaces * with Item 0
    const internalPath = currentPath.slice(0, idx).map(([_, key]) => {
      // Replace wildcards with "Item 0" for internal data access
      return key === "*" ? "Item 0" : key;
    });
    
    // Get data for rendering buttons based on the internal path
    const levelData = getDataAtPath(originalData, internalPath);
    
    // Get keys for this level
    let keysForThisRow: string[] = ["All"];
    if (levelData) {
      if (Array.isArray(levelData)) {
        // For arrays, add wildcard option and item indices
        keysForThisRow = ["All", "*", ...levelData.map((_, i) => `Item ${i}`)];
      } else if (typeof levelData === "object" && levelData !== null) {
        // For objects, add their property keys
        const objKeys = Object.keys(levelData);
        keysForThisRow = objKeys.length > 0 ? ["All", ...objKeys] : ["All"];
      }
    }
    
    // Render row of buttons
    rowsToRender.push(
      <div key={`row-${rowIndex}`} className="flex flex-wrap gap-2 mb-2">
        {keysForThisRow.map((key) => {
          const buttonPath = currentPath.slice(0, idx).concat([[rowIndex, key]]);
          const isSelected = selectedKey === key;
          const isHidden = isPathHidden && isPathHidden(buttonPath);
          
          return (
            <Button
              key={key}
              size="xs"
              variant={isSelected ? "default" : "outline"}
              onClick={() => onKeySelect(rowIndex, key)}
              onContextMenu={(e) => onContextMenu && onContextMenu(e, buttonPath)}
              className={`text-xs ${isHidden ? 'bg-yellow-200 dark:bg-yellow-800 hover:bg-yellow-300 dark:hover:bg-yellow-900 text-gray-800 dark:text-gray-300' : ''}`}
            >
              {key}
            </Button>
          );
        })}
      </div>
    );
  });

  // Add placeholder rows if needed
  const placeholdersNeeded = Math.max(0, 3 - rowsToRender.length);
  for (let i = 0; i < placeholdersNeeded; i++) {
    rowsToRender.push(
      <div key={`placeholder-${i}`} className="h-10 mb-2 invisible">
      </div>
    );
  }

  return (
    <div className="mb-4 border-b pb-4 border-gray-200 dark:border-gray-700">
      {rowsToRender}
    </div>
  );
};

export default NavigationRows; 