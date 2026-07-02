'use client';

import React, {useState, useEffect, useId} from 'react';

const DynamicGrid = (
    {
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
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-100 via-neutral-100 to-neutral-100 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 opacity-40">
                <GridPattern
                    width={size ?? 20}
                    height={size ?? 20}
                    x="-12"
                    y="4"
                    squares={gridPattern.length > 0 ? gridPattern : pattern}
                    className="absolute inset-0 h-full w-full fill-blue-500/30 stroke-neutral-300 dark:stroke-neutral-600 transition-opacity duration-300"
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
                    <path d={`M.5 ${height}V.5H${width}`} fill="none" />
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

export {DynamicGrid, GridPattern};
