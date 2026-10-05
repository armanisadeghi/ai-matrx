import React from "react";
import { Card, CardProps } from "./Card";
import { cn } from "@/lib/utils";

export interface GridProps {
  title?: string;
  description?: string;
  items: CardProps[];
  columns?: number;
  className?: string;
  cardClassName?: string;
  showAddButton?: boolean;
  onAddButtonClick?: () => void;
  addButtonText?: string;
  /** Render cards in compact iOS-style icon mode — overrides columns to use grid-cols-4 */
  compact?: boolean;
}

export const Grid = ({
  title,
  description,
  items,
  columns = 6,
  className,
  cardClassName,
  showAddButton = false,
  onAddButtonClick,
  addButtonText = "Add Feature",
  compact = false,
}: GridProps) => {
  const colsClass = compact
    ? "grid-cols-4"
    : {
        1: "grid-cols-1",
        2: "grid-cols-1 sm:grid-cols-2",
        3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
        4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
      }[Math.min(6, Math.max(1, columns))];

  return (
    <div className={className}>
      {title && <h2 className="text-md font-semibold mb-4">{title}</h2>}
      {description && <p className="type-body text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      
      <div className={cn("grid", compact ? "gap-2" : "gap-4", colsClass)}>
        {items.map((item, index) => (
          <Card
            key={`card-${index}`}
            {...item}
            compact={compact}
            className={cn(cardClassName, item.className)}
          />
        ))}
        
        {showAddButton && (
          <div 
            onClick={onAddButtonClick}
            className={cn(
              "rounded-xl p-5 cursor-pointer border-2 border-dashed transition",
              "border-gray-200 dark:border-zinc-700 border-opacity-70",
              "hover:border-opacity-100 hover:border-gray-300 dark:hover:border-zinc-600",
              "hover:bg-gray-50 dark:hover:bg-zinc-800",
              cardClassName
            )}
          >
            <div className="flex flex-col items-center text-center space-y-3 h-full justify-center">
              <div className="p-3 rounded-full bg-gray-100 dark:bg-zinc-700">
                <svg 
                  width="28" 
                  height="28" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="text-gray-500 dark:text-gray-400"
                >
                  <path 
                    d="M12 8V16M8 12H16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-lg">{addButtonText}</h3>
              <p className="type-body text-gray-500 dark:text-gray-400">This is coming soon!</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 