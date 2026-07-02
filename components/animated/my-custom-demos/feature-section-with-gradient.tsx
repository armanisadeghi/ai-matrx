import React, { useId } from "react";
import { cn } from "@/lib/utils";
import {
    IconAdjustmentsBolt,
    IconCloud,
    IconCurrencyDollar,
    IconEaseInOut,
    IconHeart,
    IconHelp,
    IconRouteAltLeft,
    IconTerminal2,
} from "@tabler/icons-react";

export function FeaturesSectionDemo() {
    const features = [
        {
            title: "Built for developers",
            description:
                "Built for engineers, developers, dreamers, thinkers and doers.",
            icon: <IconTerminal2/>,
        },
        {
            title: "Ease of use",
            description:
                "It's as easy as using an Apple, and as expensive as buying one.",
            icon: <IconEaseInOut/>,
        },
        {
            title: "Pricing like no other",
            description:
                "Our prices are best in the market. No cap, no lock, no credit card required.",
            icon: <IconCurrencyDollar/>,
        },
        {
            title: "100% Uptime guarantee",
            description: "We just cannot be taken down by anyone.",
            icon: <IconCloud/>,
        },
        {
            title: "Multi-tenant Architecture",
            description: "You can simply share passwords instead of buying new seats",
            icon: <IconRouteAltLeft/>,
        },
        {
            title: "24/7 Customer Support",
            description:
                "We are available a 100% of the time. Atleast our AI Agents are.",
            icon: <IconHelp/>,
        },
        {
            title: "Money back guarantee",
            description:
                "If you donot like EveryAI, we will convince you to like us.",
            icon: <IconAdjustmentsBolt/>,
        },
        {
            title: "And everything else",
            description: "I just ran out of copy ideas. Accept my sincere apologies",
            icon: <IconHeart/>,
        },
    ];
    return (
        <div className="py-20 lg:py-40 bg-white dark:bg-neutral-900">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 relative z-10 max-w-7xl mx-auto">
                {features.map((feature, index) => (
                    <FeatureSectionWithGradient key={feature.title} {...feature} index={index}/>
                ))}
            </div>
        </div>
    );
}

export const FeatureSectionWithGradient = (
    {
        title,
        description,
        icon,
        index,
    }: {
        title: string;
        description: string;
        icon: React.ReactNode;
        index: number;
    }) => {
    return (
        <div
            className={cn(
                "flex flex-col lg:border-r py-10 relative group/feature border-neutral-200 dark:border-neutral-800",
                (index === 0 || index === 4) && "lg:border-l",
                index < 4 && "lg:border-b"
            )}
        >
            <Grid size={20} />
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
        </div>
    );
};

const Grid = ({
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
        <div className="pointer-events-none absolute inset-0 h-full w-full">
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-950 opacity-40">
                <GridPattern
                    width={size ?? 20}
                    height={size ?? 20}
                    x="-12"
                    y="4"
                    squares={p}
                    className="absolute inset-0 h-full w-full fill-black/[0.03] stroke-black/5 dark:fill-white/[0.03] dark:stroke-white/5"
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
                    {squares.map(([x, y]) => (
                        <rect
                            strokeWidth="0"
                            key={`${x}-${y}`}
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
