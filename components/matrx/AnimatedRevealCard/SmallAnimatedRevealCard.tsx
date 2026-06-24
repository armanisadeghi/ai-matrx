"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { presetStyles } from "./presets";

type PresetStyleKey = keyof typeof presetStyles;

interface SmallAnimatedRevealCardProps {
  title: string;
  icon: string;
  style: PresetStyleKey;
  className?: string;
  speedOverride?: number;
  containerClassOverride?: string;
  colorsOverride?: string[];
  link?: string;
  component?: React.ComponentType<any>;
}

const SmallAnimatedRevealCard: React.FC<SmallAnimatedRevealCardProps> = ({
  title,
  icon,
  style,
  className,
  speedOverride,
  containerClassOverride,
  colorsOverride,
  link,
  component: Component,
}) => {
  const [hovered, setHovered] = useState(false);
  const [isComponentVisible, setIsComponentVisible] = useState(false);

  // Reuse the logic from the original component
  const presetStyle = presetStyles[style] || presetStyles.emerald;
  const animationSpeed = speedOverride || presetStyle.animationSpeed;
  const containerClassName =
    containerClassOverride || presetStyle.containerClassName;
  const colors = colorsOverride
    ? colorsOverride.map((color) => color.match(/\d+/g)?.map(Number) || [])
    : presetStyle.colors;

  // Update the IconComponent type
  const IconComponent = (props: any) => (
    <DynamicIcon name={icon} fallbackIcon="HelpCircle" {...props} />
  );

  const handleClick = () => {
    if (Component) {
      setIsComponentVisible(!isComponentVisible);
    }
  };

  const EdgeIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
    className,
    ...rest
  }) => {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className={className}
        {...rest}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
      </svg>
    );
  };

  const CardContent = () => (
    <>
      <EdgeIcon className="absolute h-4 w-4 -top-2 -left-2 dark:text-white text-black" />
      <EdgeIcon className="absolute h-4 w-4 -bottom-2 -left-2 dark:text-white text-black" />
      <EdgeIcon className="absolute h-4 w-4 -top-2 -right-2 dark:text-white text-black" />
      <EdgeIcon className="absolute h-4 w-4 -bottom-2 -right-2 dark:text-white text-black" />

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full absolute inset-0"
          >
            <CanvasRevealEffect
              animationSpeed={animationSpeed}
              containerClassName={containerClassName}
              colors={colors}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-20 flex flex-col items-center justify-center h-full">
        <div className="text-center group-hover:-translate-y-2 group-hover:opacity-0 transition duration-200">
          <IconComponent
            className="h-8 w-8 text-black dark:text-white group-hover:text-white"
            strokeWidth={1}
          />
        </div>
        <h3 className="dark:text-white text-sm opacity-0 group-hover:opacity-100 relative z-10 text-black mt-2 font-bold group-hover:text-white group-hover:-translate-y-1 transition duration-200 text-center">
          {title}
        </h3>
      </div>
    </>
  );

  const cardClassName = cn(
    "border border-black/[0.2] dark:border-white/[0.2] w-full mx-auto p-2 relative h-[200px] w-[200px] cursor-pointer group",
    className,
  );

  if (link) {
    return (
      <Link
        href={link}
        className={cardClassName}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CardContent />
      </Link>
    );
  }

  return (
    <>
      <div
        className={cardClassName}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
      >
        <CardContent />
      </div>
      {Component && isComponentVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-textured p-4 rounded-lg max-w-xl w-full max-h-[80dvh] overflow-auto">
            <Component />
            <button
              className="mt-4 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
              onClick={() => setIsComponentVisible(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SmallAnimatedRevealCard;
