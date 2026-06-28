"use client";
import React, { useRef, useState } from "react";
import { cn } from "@/styles/themes/utils";
import {
  IconLayoutNavbarCollapse,
  IconChevronRight,
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

export interface FloatingDockWrapperProps {
  items: { label: string; icon: React.ReactNode; href: string }[];
  className?: string;
  bgColorClassname?: string;
  iconBgColorClassname?: string;
}

export default function FloatingDoc({
  items,
  className,
  bgColorClassname = "bg-background",
  iconBgColorClassname = "bg-zinc-200 dark:bg-zinc-700",
}: FloatingDockWrapperProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-auto",
        bgColorClassname,
        className,
      )}
    >
      <FloatingDockInner
        items={items}
        bgColor={bgColorClassname}
        iconBgColor={iconBgColorClassname}
      />
    </div>
  );
}

// Internal component replacing the original FloatingDock
function FloatingDockInner({
  items,
  bgColor,
  iconBgColor,
}: {
  items: { label: string; icon: React.ReactNode; href: string }[];
  bgColor: string;
  iconBgColor: string;
}) {
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile ? (
        <FloatingDockMobile
          items={items}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
        />
      ) : (
        <FloatingDockDesktop
          items={items}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
        />
      )}
    </>
  );
}

function FloatingDockMobile({
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
    <div className="relative block md:hidden">
      {/* Mobile menu button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center",
          iconBgColor,
        )}
      >
        <IconLayoutNavbarCollapse className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
      </button>

      {/* Full screen overlay menu */}
      {open && (
        <div className={cn("fixed inset-0 z-50", bgColor)}>
          <div className="flex flex-col h-full">
            {/* Header with close button */}
            <div className="flex justify-between items-center p-4 border-b border-border">
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

// Desktop version (unchanged)
function FloatingDockDesktop({
  items,
  bgColor,
  iconBgColor,
}: {
  items: { label: string; icon: React.ReactNode; href: string }[];
  bgColor: string;
  iconBgColor: string;
}) {
  let mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden md:flex h-14 gap-2 items-end rounded-2xl px-3 py-2",
        bgColor,
      )}
    >
      {items.map((item) => (
        <IconContainer
          mouseX={mouseX}
          key={item.label}
          {...item}
          bgColor={bgColor}
          iconBgColor={iconBgColor}
        />
      ))}
    </motion.div>
  );
}

// Icon container (unchanged)
function IconContainer({
  mouseX,
  label,
  icon,
  href,
  bgColor,
  iconBgColor,
}: {
  mouseX: MotionValue;
  label: string;
  icon: React.ReactNode;
  href: string;
  bgColor: string;
  iconBgColor: string;
}) {
  let ref = useRef<HTMLDivElement>(null);
  let distance = useTransform(mouseX, (val) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  let heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  let widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
  let heightTransformIcon = useTransform(
    distance,
    [-150, 0, 150],
    [20, 40, 20],
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

  return (
    <Link href={href}>
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
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 5, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 1, x: "-50%" }}
              className={cn(
                "p-0 whitespace-pre rounded-md bg-transparent text-gray-800 dark:text-gray-100 absolute left-1/2 -translate-x-1/2 -top-0 w-fit text-xs",
                bgColor,
              )}
            >
              {label}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          style={{ width: widthIcon, height: heightIcon }}
          className="flex items-center justify-center"
        >
          {icon}
        </motion.div>
      </motion.div>
    </Link>
  );
}
