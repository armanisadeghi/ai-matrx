import React from "react";
import { HorizontalCard, HorizontalCardProps } from "./HorizontalCard";
import { cn } from "@/lib/utils";

export interface ListProps {
  title?: string;
  description?: string;
  items: HorizontalCardProps[];
  className?: string;
  cardClassName?: string;
  showBorders?: boolean;
  showContainer?: boolean;
  containerClassName?: string;
}

export const List = ({
  title,
  description,
  items,
  className,
  cardClassName,
  showBorders = true,
  showContainer = true,
  containerClassName,
}: ListProps) => {
  const containerContent = (
    <>
      {items.map((item, index) => (
        <HorizontalCard
          key={`horizontal-card-${index}`}
          {...item}
          isLast={index === items.length - 1}
          showBorder={showBorders}
          className={cn(cardClassName, item.className)}
        />
      ))}
    </>
  );

  return (
    <div className={className}>
      {title && <h2 className="text-md font-semibold mb-4">{title}</h2>}
      {description && <p className="type-body text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      
      {showContainer ? (
        <div className={cn(
          "rounded-xl bg-white dark:bg-zinc-800 shadow-md dark:shadow-zinc-800/20",
          containerClassName
        )}>
          {containerContent}
        </div>
      ) : (
        containerContent
      )}
    </div>
  );
}; 