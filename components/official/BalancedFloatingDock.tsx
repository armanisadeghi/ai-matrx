"use client";
import React, { useRef, useState } from "react";
import { cn } from "@/styles/themes/utils";
import {
  IconLayoutNavbarExpand,
  IconChevronRight,
  IconArrowLeft,
  IconChevronDown,
} from "@tabler/icons-react";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";

export interface BalancedFloatingDockProps {
  items: { label: string; icon: React.ReactNode; href: string }[];
  className?: string;
  bgColorClassname?: string;
  iconBgColorClassname?: string;
  growthFactor?: number; // Controls how much the icons grow (1.0 = no growth, 2.0 = double size)
  labelPosition?: "side" | "bottom"; // Controls where the label appears
}

export default function BalancedFloatingDock({
  items,
  className,
  bgColorClassname = "bg-background",
  iconBgColorClassname = "bg-zinc-200 dark:bg-zinc-700",
  growthFactor = 1.8, // Default growth multiplier
  labelPosition = "side", // Default to side position
}: BalancedFloatingDockProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-auto",
        bgColorClassname,
        className,
      )}
    >
      <BalancedFloatingDockInner
        items={items}
        bgColor={bgColorClassname}
        iconBgColor={iconBgColorClassname}
        growthFactor={growthFactor}
        labelPosition={labelPosition}
      />
    </div>
  );
}

function BalancedFloatingDockInner({
  items,
  bgColor,
  iconBgColor,
  growthFactor,
  labelPosition,
}: {
  items: { label: string; icon: React.ReactNode; href: string }[];
  bgColor: string;
  iconBgColor: string;
  growthFactor: number;
  labelPosition: "side" | "bottom";
}) {
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile ? (
        <BalancedFloatingDockMobile
          items={items}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
        />
      ) : (
        <BalancedFloatingDockDesktop
          items={items}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
          growthFactor={growthFactor}
          labelPosition={labelPosition}
        />
      )}
    </>
  );
}

function BalancedFloatingDockMobile({
  items,
  bgColor,
  iconBgColor,
}: {
  items: { label: string; icon: React.ReactNode; href: string }[];
  bgColor: string;
  iconBgColor: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative block md:hidden w-full">
      {/* Container with left alignment */}
      <div className="flex justify-start px-3">
        {/* Mobile menu button */}
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            iconBgColor,
          )}
        >
          <IconLayoutNavbarExpand className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
        </button>
      </div>

      {/* Full screen overlay menu */}
      {open && (
        <div className={cn("fixed inset-0 z-50", bgColor)}>
          <div className="flex flex-col h-full">
            {/* Header with close button */}
            <div className="flex justify-between items-center p-4 border-b border-border">
              {/* Back button (positioned on the left) */}
              <button
                onClick={() => setOpen(false)}
                className="flex items-center text-blue-500 dark:text-blue-400"
              >
                <IconArrowLeft className="h-5 w-5 mr-2" />
                <span>Back</span>
              </button>

              <h2 className="text-lg font-medium">Menu</h2>

              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto">
              {items.map((item) => (
                <Link
                  href={item.href}
                  key={item.label}
                  className="flex items-center justify-between p-4 border-b border-border"
                  onClick={() => setOpen(false)}
                >
                  <div className="flex items-center space-x-4">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        iconBgColor,
                      )}
                    >
                      <div className="h-5 w-5">{item.icon}</div>
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <IconChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BalancedFloatingDockDesktop({
  items,
  bgColor,
  iconBgColor,
  growthFactor,
  labelPosition,
}: {
  items: { label: string; icon: React.ReactNode; href: string }[];
  bgColor: string;
  iconBgColor: string;
  growthFactor: number;
  labelPosition: "side" | "bottom";
}) {
  let mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden md:flex h-14 gap-2 items-center rounded-2xl px-3 py-2",
        bgColor,
      )}
    >
      {items.map((item) => (
        <BalancedIconContainer
          mouseX={mouseX}
          key={item.label}
          {...item}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
          growthFactor={growthFactor}
          labelPosition={labelPosition}
        />
      ))}
    </motion.div>
  );
}

function BalancedIconContainer({
  mouseX,
  label,
  icon,
  href,
  bgColor,
  iconBgColor,
  growthFactor,
  labelPosition,
}: {
  mouseX: MotionValue;
  label: string;
  icon: React.ReactNode;
  href: string;
  bgColor: string;
  iconBgColor: string;
  growthFactor: number;
  labelPosition: "side" | "bottom";
}) {
  let ref = useRef<HTMLDivElement>(null);
  let distance = useTransform(mouseX, (val) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const baseSize = 40; // Base size in pixels
  const maxSize = baseSize * growthFactor; // Maximum size when hovered

  let widthTransform = useTransform(
    distance,
    [-150, 0, 150],
    [baseSize, maxSize, baseSize],
  );
  let heightTransform = useTransform(
    distance,
    [-150, 0, 150],
    [baseSize, maxSize, baseSize],
  );

  // Icon size calculations (adjust the growth ratio as needed)
  const baseIconSize = 20;
  const maxIconSize = baseIconSize * growthFactor;
  let widthTransformIcon = useTransform(
    distance,
    [-150, 0, 150],
    [baseIconSize, maxIconSize, baseIconSize],
  );
  let heightTransformIcon = useTransform(
    distance,
    [-150, 0, 150],
    [baseIconSize, maxIconSize, baseIconSize],
  );

  let width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  // Label animation properties based on position
  const labelAnimationProps =
    labelPosition === "side"
      ? {
          initial: { opacity: 0, y: 0, x: 10 },
          animate: { opacity: 1, y: 0, x: 60 },
          exit: { opacity: 0, y: 0, x: 10 },
          className: cn(
            "p-1 px-2 whitespace-pre rounded-md bg-zinc-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 absolute left-full top-1/2 -translate-y-1/2 w-fit text-xs shadow-sm z-50",
            "border-border",
          ),
        }
      : {
          initial: { opacity: 0, y: 5 },
          animate: { opacity: 1, y: 15 },
          exit: { opacity: 0, y: 5 },
          className: cn(
            "p-1 px-2 whitespace-pre rounded-md bg-zinc-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 absolute left-1/2 -translate-x-1/2 top-full w-fit text-xs shadow-sm",
            "border-border",
          ),
        };

  return (
    <Link href={href}>
      <div className="relative">
        <motion.div
          ref={ref}
          style={{ width, height }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "aspect-square rounded-full flex items-center justify-center relative",
            iconBgColor,
          )}
        >
          <motion.div
            style={{ width: widthIcon, height: heightIcon }}
            className="flex items-center justify-center"
          >
            {icon}
          </motion.div>
        </motion.div>

        {/* Tooltip container positioned in document flow to avoid clipping */}
        {labelPosition === "side" && (
          <AnimatePresence>
            {hovered && (
              <div
                className="fixed"
                style={{
                  top: ref.current
                    ? ref.current.getBoundingClientRect().top +
                      window.scrollY +
                      ref.current.getBoundingClientRect().height / 2
                    : 0,
                  left: ref.current
                    ? ref.current.getBoundingClientRect().left +
                      ref.current.getBoundingClientRect().width
                    : 0,
                  transform: "translateY(-50%)",
                  zIndex: 60,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 15 }}
                  exit={{ opacity: 0, x: 5 }}
                  className={cn(
                    "p-1 px-2 whitespace-pre rounded-md bg-zinc-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 w-fit text-xs shadow-sm",
                    "border-border",
                  )}
                >
                  {label}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        )}

        {/* Bottom tooltip that remains in normal component flow */}
        {labelPosition === "bottom" && (
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={labelAnimationProps.initial}
                animate={labelAnimationProps.animate}
                exit={labelAnimationProps.exit}
                className={labelAnimationProps.className}
              >
                {label}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </Link>
  );
}
