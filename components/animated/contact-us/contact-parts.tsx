'use client';

import { motion } from "motion/react";
import {cn} from "@/lib/utils";
import React, {useId} from "react";

export const Pin = ({className}: { className?: string }) => {
    return (
        <motion.div
            style={{
                transform: "translateZ(1px)",
            }}
            className={cn(
                "pointer-events-none absolute z-[60] flex h-40 w-96 items-center justify-center opacity-100 transition duration-500",
                className,
            )}
        >
            <div className="h-full w-full">
                <div
                    className="absolute inset-x-0 top-0 z-20 mx-auto inline-block w-fit rounded-lg bg-neutral-200 px-2 py-1 text-xs font-normal text-neutral-700 dark:bg-neutral-800 dark:text-white">
                    We are here
                    <span
                        className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-blue-400/0 via-blue-400/90 to-blue-400/0 transition-opacity duration-500"></span>
                </div>

                <div
                    style={{
                        perspective: "800px",
                        transform: "rotateX(70deg) translateZ(0px)",
                    }}
                    className="absolute left-1/2 top-1/2 ml-[0.09375rem] mt-4 -translate-x-1/2 -translate-y-1/2"
                >
                    <>
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0,
                                x: "-50%",
                                y: "-50%",
                            }}
                            animate={{
                                opacity: [0, 1, 0.5, 0],
                                scale: 1,

                                z: 0,
                            }}
                            transition={{
                                duration: 6,
                                repeat: Infinity,
                                delay: 0,
                            }}
                            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-sky-500/[0.08] shadow-[0_8px_16px_rgb(0_0_0/0.4)] dark:bg-sky-500/[0.2]"
                        ></motion.div>
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0,
                                x: "-50%",
                                y: "-50%",
                            }}
                            animate={{
                                opacity: [0, 1, 0.5, 0],
                                scale: 1,

                                z: 0,
                            }}
                            transition={{
                                duration: 6,
                                repeat: Infinity,
                                delay: 2,
                            }}
                            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-sky-500/[0.08] shadow-[0_8px_16px_rgb(0_0_0/0.4)] dark:bg-sky-500/[0.2]"
                        ></motion.div>
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0,
                                x: "-50%",
                                y: "-50%",
                            }}
                            animate={{
                                opacity: [0, 1, 0.5, 0],
                                scale: 1,

                                z: 0,
                            }}
                            transition={{
                                duration: 6,
                                repeat: Infinity,
                                delay: 4,
                            }}
                            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-sky-500/[0.08] shadow-[0_8px_16px_rgb(0_0_0/0.4)] dark:bg-sky-500/[0.2]"
                        ></motion.div>
                    </>
                </div>

                <>
                    <motion.div
                        className="absolute bottom-1/2 right-1/2 h-20 w-px translate-y-[14px] bg-gradient-to-b from-transparent to-blue-500 blur-[2px]"/>
                    <motion.div
                        className="absolute bottom-1/2 right-1/2 h-20 w-px translate-y-[14px] bg-gradient-to-b from-transparent to-blue-500"/>
                    <motion.div
                        className="absolute bottom-1/2 right-1/2 z-40 h-[4px] w-[4px] translate-x-[1.5px] translate-y-[14px] rounded-full bg-blue-600 blur-[3px]"/>
                    <motion.div
                        className="absolute bottom-1/2 right-1/2 z-40 h-[2px] w-[2px] translate-x-[0.5px] translate-y-[14px] rounded-full bg-blue-300"/>
                </>
            </div>
        </motion.div>
    );
};

export const FeatureIconContainer = (
    {
        children,
        className,
    }: {
        children: React.ReactNode;
        className?: string;
    }) => {
    return (
        <div
            className={cn(
                "relative h-14 w-14 rounded-md bg-gradient-to-b from-gray-50 to-neutral-200 p-[4px] dark:from-neutral-800 dark:to-neutral-950",
                className,
            )}
        >
            <div
                className={cn(
                    "relative z-20 h-full w-full rounded-[5px] bg-gray-50 dark:bg-neutral-800",
                    className,
                )}
            >
                {children}
            </div>
            <div
                className="absolute inset-x-0 bottom-0 z-30 mx-auto h-4 w-full rounded-full bg-neutral-600 opacity-50 blur-lg"></div>
            <div
                className="absolute inset-x-0 bottom-0 mx-auto h-px w-[60%] bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
            <div
                className="absolute inset-x-0 bottom-0 mx-auto h-px w-[60%] bg-gradient-to-r from-transparent via-blue-600 to-transparent dark:h-[8px] dark:blur-sm"></div>
        </div>
    );
};

export const Grid = (
    {
        pattern,
        size,
    }: {
        pattern?: number[][];
        size?: number;
    }) => {
    const p = pattern ?? [
        [Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
        [Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
        [Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
        [Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
        [Math.floor(Math.random() * 4) + 7, Math.floor(Math.random() * 6) + 1],
    ];
    return (
        <div
            className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
            <div
                className="absolute inset-0 bg-gradient-to-r from-zinc-900/30 to-zinc-900/30 opacity-10 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] dark:from-zinc-900/30 dark:to-zinc-900/30">
                <GridPattern
                    width={size ?? 20}
                    height={size ?? 20}
                    x="-12"
                    y="4"
                    squares={p}
                    className="absolute inset-0 h-full w-full fill-black/100 stroke-black/100 mix-blend-overlay dark:fill-white/100 dark:stroke-white/100"
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

export function GridPattern({width, height, x, y, squares, ...props}: GridPatternProps) {
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
                    {squares.map(([x, y], idx: number) => (
                        <rect
                            strokeWidth="0"
                            key={`${x}-${y}-${idx}`}
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
