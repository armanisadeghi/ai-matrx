const colorSpecificStyles = {
    rose: {
        card: "border border-rose-200 dark:border-rose-600",
        cardHeader: "border border-rose-200 dark:border-rose-600",
        cardTitle: "text-rose-500 dark:text-rose-600",
    },
    blue: {
        card: "border border-blue-200 dark:border-blue-700",
        cardHeader: "border border-blue-200 dark:border-blue-700",
        cardTitle: "text-blue-500 dark:text-blue-400",
    },
    green: {
        card: "border border-green-200 dark:border-green-600",
        cardHeader: "border border-green-200 dark:border-green-600",
        cardTitle: "text-green-500 dark:text-green-600",
    },
    yellow: {
        card: "border border-yellow-200 dark:border-yellow-600",
        cardHeader: "border border-yellow-200 dark:border-yellow-600",
        cardTitle: "text-yellow-500 dark:text-yellow-600",
    },
    red: {
        card: "border border-red-200 dark:border-red-600",
        cardHeader: "border border-red-200 dark:border-red-600",
        cardTitle: "text-red-500 dark:text-red-600",
    },
    purple: {
        card: "border border-purple-200 dark:border-purple-600",
        cardHeader: "border border-purple-200 dark:border-purple-600",
        cardTitle: "text-purple-500 dark:text-purple-600",
    },
    orange: {
        card: "border border-orange-200 dark:border-orange-600",
        cardHeader: "border border-orange-200 dark:border-orange-600",
        cardTitle: "text-orange-500 dark:text-orange-600",
    },
    pink: {
        card: "border border-pink-200 dark:border-pink-600",
        cardHeader: "border border-pink-200 dark:border-pink-600",
        cardTitle: "text-pink-500 dark:text-pink-600",
    },
    gray: {
        card: "border-border",
        cardHeader: "border-border",
        cardTitle: "text-gray-900 dark:text-gray-100",
    },
    indigo: {
        card: "border border-indigo-200 dark:border-indigo-600",
        cardHeader: "border border-indigo-200 dark:border-indigo-600",
        cardTitle: "text-indigo-500 dark:text-indigo-600",
    },
    teal: {
        card: "border border-teal-200 dark:border-teal-600",
        cardHeader: "border border-teal-200 dark:border-teal-600",
        cardTitle: "text-teal-500 dark:text-teal-600",
    },
    cyan: {
        card: "border border-cyan-200 dark:border-cyan-600",
        cardHeader: "border border-cyan-200 dark:border-cyan-600",
        cardTitle: "text-cyan-500 dark:text-cyan-600",
    },
    amber: {
        card: "border border-amber-200 dark:border-amber-600",
        cardHeader: "border border-amber-200 dark:border-amber-600",
        cardTitle: "text-amber-500 dark:text-amber-600",
    },
    lime: {
        card: "border border-lime-200 dark:border-lime-600",
        cardHeader: "border border-lime-200 dark:border-lime-600",
        cardTitle: "text-lime-500 dark:text-lime-600",
    },
    emerald: {
        card: "border border-emerald-200 dark:border-emerald-600",
        cardHeader: "border border-emerald-200 dark:border-emerald-600",
        cardTitle: "text-emerald-500 dark:text-emerald-600",
    },
    violet: {
        card: "border border-violet-200 dark:border-violet-600",
        cardHeader: "border border-violet-200 dark:border-violet-600",
        cardTitle: "text-violet-500 dark:text-violet-600",
    },
    fuchsia: {
        card: "border border-fuchsia-200 dark:border-fuchsia-600",
        cardHeader: "border border-fuchsia-200 dark:border-fuchsia-600",
        cardTitle: "text-fuchsia-500 dark:text-fuchsia-600",
    },
    primary: {
        card: "border border-rose-200 dark:border-rose-600",
        cardHeader: "border border-rose-200 dark:border-rose-600",
        cardTitle: "text-rose-500 dark:text-rose-600",
    },
};

const baseCardStyles = {
    card: "bg-white dark:bg-slate-900 overflow-hidden p-0 rounded-3xl",
    cardHeader: "bg-gray-100 dark:bg-gray-700 p-3 rounded-t-3xl",
    cardTitle: "pt-2",
    cardDescription: "text-gray-600 dark:text-gray-300 text-sm",
    cardDescriptionNode: "text-gray-600 dark:text-gray-300 text-sm pt-2",
    cardContent: "text-gray-600 dark:text-gray-300 text-sm",
    cardFooter: "flex justify-end gap-3 p-3",
};

// Create spacing options
const spacingOptions = {
    tight: {
        card: "p-0",
        cardHeader: "p-2",
        cardContent: "p-2",
        cardFooter: "p-2 gap-2"
    },
    default: {
        card: "p-0",
        cardHeader: "p-3",
        cardContent: "p-3",
        cardFooter: "p-3 gap-3"
    },
    relaxed: {
        card: "p-0",
        cardHeader: "p-4",
        cardContent: "p-4",
        cardFooter: "p-4 gap-4"
    },
    wide: {
        card: "p-0",
        cardHeader: "p-3 px-4",
        cardContent: "p-3 px-4",
        cardFooter: "p-3 px-4 gap-3"
    }
};

type CardColor = keyof typeof colorSpecificStyles;
type CardSpacing = keyof typeof spacingOptions;

export interface CreateCardStylesProps {
    color: string;
    spacing?: string;
}

export const createCardStyles = ({ color, spacing = 'default' }: CreateCardStylesProps) => {
    const selectedSpacing = spacingOptions[spacing as CardSpacing] || spacingOptions.default;
    const selectedColor = colorSpecificStyles[color as CardColor];

    return {
        card: `${baseCardStyles.card} ${selectedColor?.card || ''} ${selectedSpacing.card}`,
        cardHeader: `${baseCardStyles.cardHeader} ${selectedColor?.cardHeader || ''} ${selectedSpacing.cardHeader}`,
        cardTitle: `${baseCardStyles.cardTitle} ${selectedColor?.cardTitle || ''}`,
        cardDescription: baseCardStyles.cardDescription,
        cardDescriptionNode: baseCardStyles.cardDescriptionNode,
        cardContent: `${baseCardStyles.cardContent} ${selectedSpacing.cardContent}`,
        cardFooter: `${baseCardStyles.cardFooter.replace(/gap-\d+/, '')} ${selectedSpacing.cardFooter}`,
    };
};

// For backward compatibility, maintain the existing classColorOptions
export const classColorOptions: Record<string, ReturnType<typeof createCardStyles>> = Object.keys(colorSpecificStyles).reduce(
    (acc: Record<string, ReturnType<typeof createCardStyles>>, color) => {
        acc[color] = createCardStyles({ color });
        return acc;
    },
    {}
);