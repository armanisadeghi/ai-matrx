'use client';

import React, {useState, useRef} from "react";
import {cn} from "@/lib/utils";
import Link from "next/link";
import {DynamicGrid} from "@/components/animated/feature-with-dynamic-grid/dynamic-grid";

/**
 * Hoisted to module scope: defined inside the feature item it was a new
 * component type each render, remounting the grid animation on every
 * mouse move.
 */
const Content = ({
    icon,
    title,
    description,
    isHovered,
    mousePosition,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    isHovered: boolean;
    mousePosition: { x: number; y: number };
}) => (
    <>
        <DynamicGrid size={20} isHovered={isHovered} mousePosition={mousePosition} />
        <div className="mb-4 relative z-10 px-10 text-neutral-600 dark:text-neutral-400">
            {icon}
        </div>
        <div className="text-lg font-bold mb-2 relative z-10 px-10">
            <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-blue-500 transition-all duration-200 origin-center" />
            <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-neutral-800 dark:text-neutral-100">
      {title}
    </span>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xs relative z-10 px-10">
            {description}
        </p>
    </>
);

const FeatureSectionAnimatedGradient = (
    {
        title,
        description,
        icon,
        index,
        link
    }: {
        title: string;
        description: string;
        icon: React.ReactNode;
        index: number;
        link?: string;
    }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setMousePosition({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            });
        }
    };

    const containerClass = cn(
        "flex flex-col lg:border-r py-10 relative group/feature border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden",
        (index === 0 || index === 4) && "lg:border-l",
        index < 4 && "lg:border-b",
        link && "cursor-pointer"
    );

    return link ? (
        <Link href={link} passHref>
            <div
                className={containerClass}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onMouseMove={handleMouseMove}
                ref={containerRef}
            >
                <Content icon={icon} title={title} description={description} isHovered={isHovered} mousePosition={mousePosition} />
            </div>
        </Link>
    ) : (
        <div
            className={containerClass}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMouseMove}
            ref={containerRef}
        >
            <Content icon={icon} title={title} description={description} isHovered={isHovered} mousePosition={mousePosition} />
        </div>
    );
};

export default FeatureSectionAnimatedGradient;
