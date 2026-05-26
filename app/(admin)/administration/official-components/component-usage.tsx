// File: app/(authenticated)/(admin-auth)/administration/official-components/component-usage.tsx

import React from "react";
import { ComponentEntry } from "./parts/component-list";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ComponentDisplayWrapperProps {
  component: ComponentEntry;
  children: React.ReactNode;
  className?: string;
  description?: string;
  code: string;
}

/**
 * Standard wrapper for all component displays
 * This ensures consistent presentation across all component examples
 */
interface ComponentDisplayGroupProps {
  items: React.ReactNode[];
}

export const ComponentDisplayGroup: React.FC<ComponentDisplayGroupProps> = ({
  items,
}) => {
  return (
    <div className="space-y-6">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item}
          {index < items.length - 1 && <hr className="border-border" />}
        </React.Fragment>
      ))}
    </div>
  );
};

export const ComponentDisplayWrapper: React.FC<
  ComponentDisplayWrapperProps
> = ({ component, children, className, description, code }) => {
  return (
    <div className="space-y-2">
      {/* Description */}
      <div className="text-foreground text-sm">
        {description || component.description || "No description available"}
      </div>

      {/* Component Display */}
      <Card
        className={cn(
          "p-4 flex items-center justify-center bg-background border border-border",
          className,
        )}
      >
        <div className="w-full flex items-center justify-center">
          {children}
        </div>
      </Card>

      {/* Code Example */}
      <div className="bg-muted rounded-md p-2 overflow-x-auto">
        <pre className="text-xs text-muted-foreground">{code}</pre>
      </div>
    </div>
  );
};
