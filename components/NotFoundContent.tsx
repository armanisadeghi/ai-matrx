"use client";

import React from "react";
import { Grid, CardProps } from "@/components/official/card-and-grid";
import { allNavigationLinks } from "@/features/shell/navigation/navigationLinks";
import { AlertCircle } from "lucide-react";

interface NotFoundContentProps {
  /** Optional custom navigation items to display instead of defaults */
  customItems?: CardProps[];
  /** Message to show - defaults to minimal message */
  message?: string;
  /** Show extended navigation (all primary items) vs just dashboard items */
  extended?: boolean;
}

/**
 * Reusable 404 Not Found content component
 * Provides navigation cards to help users get where they need to go
 */
export function NotFoundContent({
  customItems,
  message = "We couldn't find that page",
  extended = false,
}: NotFoundContentProps) {
  // Map icon color names to CardColor types
  const colorMap: Record<string, CardProps["color"]> = {
    "#0ea5e9": "cyan", // Sky blue
    "#8b5cf6": "purple", // Purple
    "#d946ef": "pink", // Fuchsia
    "#a855f7": "purple", // Light Purple
    "#3b82f6": "blue", // Blue
    "#f59e0b": "amber", // Amber
    "#10b981": "green", // Green
    "#6366f1": "indigo", // Indigo
    "#06b6d4": "cyan", // Cyan
    "#ec4899": "pink", // Pink
    "#f97316": "orange", // Orange
    "#14b8a6": "teal", // Teal
    "#ef4444": "red", // Red
  };

  // Get navigation items from constants
  const getDefaultItems = (): CardProps[] => {
    const links = extended
      ? allNavigationLinks.filter((link) => link.section === "primary")
      : allNavigationLinks.filter((link) => link.dashboard === true);

    return links.map((link) => ({
      title: link.label,
      description: `Go to ${link.label}`,
      icon: link.icon as React.ReactElement,
      color: colorMap[link.favicon?.color || "#6366f1"] || "indigo",
      path: link.href,
    }));
  };

  const items = customItems || getDefaultItems();

  return (
    <div className="min-h-dvh bg-textured flex flex-col items-center justify-center p-4">
      {/* Minimal header */}
      <div className="text-center mb-8 max-w-md">
        <div className="flex items-center justify-center mb-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <p className="text-lg text-muted-foreground">{message}</p>
      </div>

      {/* Navigation grid */}
      <div className="w-full max-w-6xl">
        <Grid
          title="Where would you like to go?"
          items={items}
          columns={4}
          className="mx-auto"
        />
      </div>
    </div>
  );
}
