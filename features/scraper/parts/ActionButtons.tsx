"use client";
import React from "react";
import { Button } from "@/components/ui/button";

/**
 * Component for displaying action buttons
 */
const ActionButtons = ({ url }: { url: string | null | undefined }) => {
  if (!url) {
    return null;
  }
  
  return (
    <div className="flex justify-end gap-2 p-4 border-t border-border">
      <Button variant="outline" onClick={() => window.open(url, "_blank")}>
        Visit Website
      </Button>
    </div>
  );
};

export default ActionButtons;