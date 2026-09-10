import React from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { LucideIcon } from "lucide-react";

interface FeatureProps {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }> | LucideIcon;
    index: number;
    link?: string;
}

// Grid Pattern Component
const GridPattern = () => (
    <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full fill-blue-100/20 stroke-blue-200/30 dark:fill-white/[0.03] dark:stroke-white/5"
    >
        <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse" x="-12" y="4">
            <path d="M.5 20V.5H20" fill="none" />
        </pattern>
        <rect width="100%" height="100%" strokeWidth={0} fill="url(#grid-pattern)" />
    </svg>
);

/**
 * Hoisted to module scope: an inner component type remounts its subtree on
 * every render of the feature item.
 */
const Content = ({
    title,
    description,
    icon: Icon,
}: {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }> | LucideIcon;
}) => (
    <>
        <div className="absolute inset-0 transition-opacity group-hover/feature:opacity-100 opacity-40">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-950">
                <GridPattern />
            </div>
        </div>
        <div className="mb-4 relative z-10 px-10 text-neutral-600 dark:text-neutral-400">
            <Icon className="w-8 h-8 text-blue-400 group-hover/feature:text-blue-500 transition-colors duration-200" />
        </div>
        <div className="text-lg font-bold mb-2 relative z-10 px-10">
            <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-blue-500 transition-all duration-200 origin-center" />
            <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-neutral-800 dark:text-neutral-100">
                {title}
            </span>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xs relative z-10 px-10">{description}</p>
    </>
);

// Feature Item Component
const FeatureItem = ({ title, description, icon: Icon, index, link }: FeatureProps) => {
    const containerClass = cn(
        "flex flex-col lg:border-r py-10 relative group/feature border-neutral-200 dark:border-neutral-800 hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-neutral-50/50 dark:hover:from-neutral-800/50 dark:hover:to-neutral-900/50 transition-colors duration-300",
        (index === 0 || index === 4) && "lg:border-l",
        index < 4 && "lg:border-b",
        link && "cursor-pointer"
    );

    return link ? (
        <Link href={link} className={containerClass}>
            <Content title={title} description={description} icon={Icon} />
        </Link>
    ) : (
        <div className={containerClass}>
            <Content title={title} description={description} icon={Icon} />
        </div>
    );
};

interface CategorySectionProps {
    category: string;
    description?: string;
    icon?: LucideIcon;
    items: Array<{
        id: string;
        title: string;
        description: string;
        icon: LucideIcon;
        link: string;
    }>;
    className?: string;
}

export const FeatureSectionGradient: React.FC<CategorySectionProps> = ({ category, description, icon: CategoryIcon, items, className }) => {
    return (
        <section className={cn("space-y-4", className)}>
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    {CategoryIcon && <CategoryIcon className="w-6 h-6 text-blue-500" />}
                    <h2 className="text-2xl font-semibold">{category}</h2>
                </div>
                {description && <p className="text-muted-foreground">{description}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                {items.map((item, index) => (
                    <FeatureItem
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        icon={item.icon}
                        index={index}
                        link={item.link}
                    />
                ))}
            </div>
        </section>
    );
};

export default FeatureSectionGradient;
