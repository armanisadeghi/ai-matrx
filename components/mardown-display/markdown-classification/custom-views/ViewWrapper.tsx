'use client';

import { useState } from 'react';
import { ViewId, getViewComponent, getViewSelectOptions } from './view-registry';

interface ViewWrapperProps {
  initialView: ViewId;
  showOptions?: boolean;
  data: unknown;
  className?: string;
}

export default function ViewWrapper({ 
  initialView, 
  showOptions = false, 
  data, 
  className = '' 
}: ViewWrapperProps) {
  const [selectedViewId, setSelectedViewId] = useState<ViewId>(initialView);
  const viewOptions = getViewSelectOptions();
  
  // Dynamically get the component for the selected view
  const ViewComponent = getViewComponent(selectedViewId);
  
  if (!ViewComponent) {
    return <div className="p-4">Error: View component not found</div>;
  }

  return (
    <div className={`${className}`}>
      {showOptions && (
        <div className="mb-4">
          <select
            value={selectedViewId}
            onChange={(e) => setSelectedViewId(e.target.value as ViewId)}
            className="p-2 border border-border rounded bg-textured text-gray-800 dark:text-gray-200"
          >
            {viewOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="p-4">
        <ViewComponent data={data} />
      </div>
    </div>
  );
} 