'use client';

import React, {useState, useEffect, useRef, useId} from "react";
import {cn} from "@/lib/utils";
import Link from "next/link";

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
    const [mousePosition, setMousePosition] = useState({x: 0, y: 0});
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

    const Content = () => (
        <>
            <Grid size={20} isHovered={isHovered} mousePosition={mousePosition}/>
            <div className="mb-4 relative z-10 px-10 text-neutral-600 dark:text-neutral-400">
                {icon}
            </div>
            <div className="text-lg font-bold mb-2 relative z-10 px-10">
                <div
                    className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-blue-500 transition-all duration-200 origin-center"/>
                <span
                    className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-neutral-800 dark:text-neutral-100">
                    {title}
                </span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xs relative z-10 px-10">
                {description}
            </p>
        </>
    );

    const containerClass = cn(
        "flex flex-col lg:border-r py-10 relative group/feature border-neutral-200 dark:border-neutral-800",
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
                <Content/>
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
            <Content/>
        </div>
    );
};

const Grid = ({
                  pattern,
                  size,
                  isHovered,
                  mousePosition
              }: {
    pattern?: number[][];
    size?: number;
    isHovered: boolean;
    mousePosition: { x: number; y: number };
}) => {
    const [gridPattern, setGridPattern] = useState<number[][]>([]);

    useEffect(() => {
        if (isHovered) {
            const newPattern = [
                [Math.floor(mousePosition.x / 20) % 14 + 1, Math.floor(mousePosition.y / 20) % 12 + 1],
                [Math.floor(mousePosition.x / 25) % 14 + 1, Math.floor(mousePosition.y / 25) % 12 + 1],
                [Math.floor(mousePosition.x / 30) % 14 + 1, Math.floor(mousePosition.y / 30) % 12 + 1],
                [Math.floor(mousePosition.x / 35) % 14 + 1, Math.floor(mousePosition.y / 35) % 12 + 1],
                [Math.floor(mousePosition.x / 40) % 14 + 1, Math.floor(mousePosition.y / 40) % 12 + 1],
            ];
            setGridPattern(newPattern);
        }
    }, [isHovered, mousePosition]);

    return (
        <div className="pointer-events-none absolute inset-0 h-full w-full">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-950 opacity-40">
                <GridPattern
                    width={size ?? 20}
                    height={size ?? 20}
                    x="-12"
                    y="4"
                    squares={gridPattern.length > 0 ? gridPattern : pattern}
                    className="absolute inset-0 h-full w-full fill-blue-100/20 stroke-blue-200/30 dark:fill-white/[0.03] dark:stroke-white/5 transition-opacity duration-300"
                    style={{ opacity: isHovered ? 1 : 0.7 }}
                />
            </div>
        </div>
    );
};

interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
    width: number;
    height: number;
    x: string | number;
    y: string | number;
    squares?: number[][];
}

function GridPattern({width, height, x, y, squares, ...props}: GridPatternProps) {
    const patternId = useId();

    return (
        <svg aria-hidden="true" {...props}>
            <defs>
                <pattern
                    id={patternId}
                    width={width}
                    height={height}
                    patternUnits="userSpaceOnUse"
                    x={x}
                    y={y}
                >
                    <path d={`M.5 ${height}V.5H${width}`} fill="none"/>
                </pattern>
            </defs>
            <rect
                width="100%"
                height="100%"
                strokeWidth={0}
                fill={`url(#${patternId})`}
            />
            {squares && (
                <svg x={x} y={y} className="overflow-visible">
                    {squares.map(([x, y], i: number) => (
                        <rect
                            strokeWidth="0"
                            key={`${x}-${y}-${i}`}
                            width={width + 1}
                            height={height + 1}
                            x={x * width}
                            y={y * height}
                        />
                    ))}
                </svg>
            )}
        </svg>
    );
}

export default FeatureSectionAnimatedGradient;
