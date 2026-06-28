"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Component for displaying metadata
 */
const MetadataContent = ({ overview }) => {
  if (!overview || Object.keys(overview).length === 0) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No metadata available
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(overview).map(([key, value], index) => {
          // Handle different types safely
          let displayValue = "";
          if (typeof value === "object" && value !== null) {
            displayValue = Array.isArray(value)
              ? `[Array with ${value.length} items]`
              : `{Object with ${Object.keys(value).length} properties}`;
          } else {
            displayValue = String(value);
          }

          return (
            <Card key={index} className="overflow-hidden">
              <CardContent className="p-4">
                <h4 className="font-medium text-foreground mb-1">{key}</h4>
                <div className="text-muted-foreground text-sm">
                  {displayValue}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default MetadataContent;
