"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";
import { presetStyles } from "./presets";
import { HelpCircle } from "lucide-react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";

type PresetStyleKey = keyof typeof presetStyles;

const variants = {
  default: "max-w-sm w-full h-[30rem]",
  small: "max-w-xs w-full h-64",
  wide: "max-w-2xl w-full h-64",
  square: "w-64 h-64",
  circle: "w-64 h-64 rounded-full",
};

type VariantKey = keyof typeof variants;

interface AnimatedRevealCardProps {
  title: string;
  icon: string;
  style: PresetStyleKey;
  className?: string;
  speedOverride?: number;
  containerClassOverride?: string;
  colorsOverride?: string[];
  link?: string;
  component?: React.ComponentType<any>;
  variant?: VariantKey;
}

const StandardAnimatedRevealCard: React.FC<AnimatedRevealCardProps> = ({
  title,
  icon,
  style,
  className,
  speedOverride,
  containerClassOverride,
  colorsOverride,
  link,
  component: Component,
  variant = "default",
}) => {
  const [hovered, setHovered] = useState(false);
  const [isComponentVisible, setIsComponentVisible] = useState(false);

  // Get the preset style or use a default
  const presetStyle = presetStyles[style] || presetStyles.emerald;

  // Override values if provided
  const animationSpeed = speedOverride || presetStyle.animationSpeed;
  const containerClassName =
    containerClassOverride || presetStyle.containerClassName;
  const colors = colorsOverride
    ? colorsOverride.map((color) => color.match(/\d+/g)?.map(Number) || [])
    : presetStyle.colors;

  // Get the Lucide icon component
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
      <EdgeIcon className="absolute h-6 w-6 -top-3 -left-3 dark:text-white text-black" />
      <EdgeIcon className="absolute h-6 w-6 -bottom-3 -left-3 dark:text-white text-black" />
      <EdgeIcon className="absolute h-6 w-6 -top-3 -right-3 dark:text-white text-black" />
      <EdgeIcon className="absolute h-6 w-6 -bottom-3 -right-3 dark:text-white text-black" />

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
        <div className="text-center group-hover:-translate-y-4 group-hover:opacity-0 transition duration-200">
          <IconComponent
            className="h-12 w-12 text-black dark:text-white group-hover:text-white"
            strokeWidth={1}
          />
        </div>
        <h2 className="dark:text-white text-xl opacity-0 group-hover:opacity-100 relative z-10 text-black mt-4 font-bold group-hover:text-white group-hover:-translate-y-2 transition duration-200 text-center px-4">
          {title}
        </h2>
      </div>
    </>
  );

  const cardClassName = cn(
    "border border-black/[0.1] dark:border-white/[0.2] mx-auto p-4 relative cursor-pointer group",
    variants[variant],
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
          <div className="bg-textured p-6 rounded-lg max-w-4xl w-full max-h-[90dvh] overflow-auto">
            <Component />
            <button
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
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

export default StandardAnimatedRevealCard;
