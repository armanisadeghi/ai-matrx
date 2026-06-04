"use client";

import React from "react";
import Link from "next/link";
import FeatureSectionAnimatedGradientComponents from "./feature-section-animated-gradient-component";
import { cn } from "@/lib/utils";

interface FeatureSectionLinkProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
  link: string;
  isNew?: boolean;
}

const FeatureSectionLinkComponent = ({
  title,
  description,
  icon,
  index,
  link,
  isNew = false,
}: FeatureSectionLinkProps) => {
  return (
    <Link href={link} className="group/link relative block">
      <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 opacity-0 group-hover/link:opacity-100 transition-opacity duration-300 z-0" />

      <FeatureSectionAnimatedGradientComponents
        title={title}
        description={description}
        icon={icon}
        index={index}
        // Don't pass link prop to avoid nested <a> tags
      />

      {/* Route indicator */}
      <div className="absolute top-2 right-2 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full z-20">
        Route
      </div>

      {/* New indicator */}
      {isNew && (
        <span className="absolute z-20 top-0 left-10 transform -translate-y-1/2 text-amber-500 dark:text-amber-400 font-bold text-sm px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
          New
        </span>
      )}
    </Link>
  );
};

export default FeatureSectionLinkComponent;
