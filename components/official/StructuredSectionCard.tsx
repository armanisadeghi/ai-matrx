"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StructuredSectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  headerActions?: ReactNode[];
  footerLeft?: ReactNode;
  footerCenter?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

const StructuredSectionCard: React.FC<StructuredSectionCardProps> = ({
  title,
  description,
  children,
  headerActions = [],
  footerLeft,
  footerCenter,
  footerRight,
  className,
}) => {
  // Determine if footer should be rendered
  const hasFooter = footerLeft || footerCenter || footerRight;

  return (
    <div className={cn(
      "border-border bg-textured shadow-sm rounded-xl overflow-hidden",
      className
    )}>
      {/* Header with title, description, and actions */}
      <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
        <div>
          <h3 className="text-rose-500 dark:text-rose-600 font-medium">{title}</h3>
          {description && (
            <p className="text-gray-600 dark:text-gray-300 type-body">{description}</p>
          )}
        </div>
        
        {headerActions && headerActions.length > 0 && (
          <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
            {headerActions.map((action, index) => (
              <React.Fragment key={index}>{action}</React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="p-4">{children}</div>

      {/* Footer with 3 columns if any footer content exists */}
      {hasFooter && (
        <div className="px-4 py-3 border-t border-border flex flex-wrap items-center">
          {/* Left column */}
          <div className="flex-1 flex justify-start space-x-2 min-w-[33%] sm:min-w-0">
            {footerLeft}
          </div>
          
          {/* Center column */}
          <div className="flex-1 flex justify-center space-x-2 min-w-[33%] sm:min-w-0 mt-2 sm:mt-0">
            {footerCenter}
          </div>
          
          {/* Right column */}
          <div className="flex-1 flex justify-end space-x-2 min-w-[33%] sm:min-w-0 mt-2 sm:mt-0">
            {footerRight}
          </div>
        </div>
      )}
    </div>
  );
};

export default StructuredSectionCard;
