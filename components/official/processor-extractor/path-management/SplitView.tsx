// SplitView.tsx
"use client";
import { extractValueByPath } from "@/components/official/processor-extractor/utils/wildcard-utils";
import { convertWildcardPathToConcreteIndexPath } from "@/components/official/processor-extractor/utils/json-path-navigation-util";
import React, { useMemo, useState } from "react";
import { PathArray } from "../types";

interface SplitViewProps {
  originalData: unknown;
  wildcardPath: string;
  children: (item: unknown, index: number) => React.ReactNode;
  maxItems?: number;
  currentPath?: PathArray;
}

const SplitView: React.FC<SplitViewProps> = ({ 
  originalData, 
  wildcardPath, 
  children,
  maxItems = 10,
  currentPath = []
}) => {
  const [showItemCount, setShowItemCount] = useState(maxItems);
  
  // Extract all matching items using the wildcard path
  const results = extractValueByPath(originalData, wildcardPath, { preserveArrays: true });
  
  // Process the items if we're navigating deeper
  const processedResults = useMemo(() => {
    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }
    
    // Check if we have a wildcard in the currentPath
    const wildcardIndex = currentPath.findIndex(([_, key]) => key === '*');
    
    // If no wildcard or it's the last item, just return the original results
    if (wildcardIndex === -1 || wildcardIndex === currentPath.length - 1) {
      return results;
    }
    
    // Extract the path segments after the wildcard
    const pathSegmentsAfterWildcard = currentPath
      .slice(wildcardIndex + 1)
      .map(([_, key]) => key)
      .filter(key => key !== 'All');
      
    // If no additional path segments, return original results
    if (pathSegmentsAfterWildcard.length === 0) {
      return results;
    }
    
    // For each result, try to navigate deeper using the additional path segments
    return results.map((item, index) => {
      try {
        let currentItem = item;
        
        // Navigate through each path segment
        for (const segment of pathSegmentsAfterWildcard) {
          if (!currentItem || typeof currentItem !== 'object') {
            return undefined; // Can't navigate further
          }
          
          if (segment.startsWith('Item ')) {
            const itemIndex = parseInt(segment.replace('Item ', ''));
            if (Array.isArray(currentItem) && itemIndex < currentItem.length) {
              currentItem = currentItem[itemIndex] as unknown;
            } else {
              return undefined; // Invalid index
            }
          } else {
            // Regular property access
            currentItem = (currentItem as Record<string, unknown>)[segment];
          }
        }
        
        return currentItem;
      } catch (error) {
        console.error(`Error processing item ${index}:`, error);
        return undefined;
      }
    }).filter(Boolean); // Remove undefined items
  }, [results, currentPath]);
  
  // When no results are found, show a message
  if (!Array.isArray(results) || results.length === 0) {
    return <div className="text-gray-500">No matching items found</div>;
  }
  
  // Use processed results if available, otherwise use original results
  const allItems = processedResults.length > 0 ? processedResults : results;
  const displayItems = allItems.slice(0, showItemCount);
  const totalItemCount = allItems.length;
  const hasMore = totalItemCount > showItemCount;
  
  const handleShowMore = () => {
    setShowItemCount(prevCount => Math.min(prevCount + maxItems, totalItemCount));
  };
  
  return (
    <div className="grid grid-cols-1 gap-4">
      {displayItems.map((item, index) => (
        <div key={index} className="border rounded-md p-4">
          <div className="text-sm font-medium mb-2">Item {index}</div>
          {children(item, index)}
        </div>
      ))}
      {hasMore && (
        <div className="text-center text-gray-500 my-2">
          Showing {showItemCount} of {totalItemCount} items. 
          <button 
            className="text-blue-500 ml-2 hover:underline"
            onClick={handleShowMore}
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
};

export default SplitView;