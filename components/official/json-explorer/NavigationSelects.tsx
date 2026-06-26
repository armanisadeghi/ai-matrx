"use client";
import React from "react";
import { NavigationRowsProps } from "./types";
import { getKeysAtPath } from "./json-utils";

const NavigationSelects: React.FC<NavigationRowsProps> = ({
  originalData,
  currentPath,
  onKeySelect,
  onContextMenu,
  isPathHidden,
}) => {
  if (!originalData) return null;

  // Create array of selects to render
  const selectsToRender = [];

  // Add actual navigation selects
  currentPath.forEach(([rowIndex, selectedKey], idx) => {
    // Calculate the path up to this row for getting available keys
    const pathToHere = currentPath.slice(0, idx).map(([_, key]) => key);
    const keysForThisRow = getKeysAtPath(originalData, pathToHere);

    // Create the path for the currently selected option
    const selectedPath = currentPath
      .slice(0, idx)
      .concat([[rowIndex, selectedKey]]);
    const isHidden = isPathHidden && isPathHidden(selectedPath);

    selectsToRender.push(
      <select
        key={`select-${rowIndex}`}
        value={selectedKey}
        onChange={(e) => onKeySelect(rowIndex, e.target.value)}
        onContextMenu={(e) => onContextMenu && onContextMenu(e, selectedPath)}
        className={`
          text-xs px-2 py-1 rounded border min-w-0 flex-shrink
          bg-textured 
          border-gray-300 dark:border-gray-600
          text-gray-900 dark:text-gray-100
          hover:border-gray-400 dark:hover:border-gray-500
          focus:border-blue-500 dark:focus:border-blue-400
          focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400
          ${isHidden ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-600" : ""}
        `}
        title={isHidden ? "This path is hidden" : ""}
      >
        {keysForThisRow.map((key) => {
          // Check if this option would create a hidden path
          const optionPath = currentPath
            .slice(0, idx)
            .concat([[rowIndex, key]]);
          const optionIsHidden = isPathHidden && isPathHidden(optionPath);

          return (
            <option
              key={key}
              value={key}
              className={
                optionIsHidden ? "bg-yellow-100 dark:bg-yellow-900" : ""
              }
            >
              {key}
            </option>
          );
        })}
      </select>,
    );
  });

  // Add placeholder selects to minimize UI shifts (up to 3 selects total)
  const placeholdersNeeded = Math.max(0, 3 - selectsToRender.length);
  for (let i = 0; i < placeholdersNeeded; i++) {
    selectsToRender.push(
      <div key={`placeholder-${i}`} className="h-7 invisible flex-shrink-0">
        {/* Invisible placeholder with same height as a select */}
      </div>,
    );
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex gap-1 items-center flex-wrap">{selectsToRender}</div>
    </div>
  );
};

export default NavigationSelects;
