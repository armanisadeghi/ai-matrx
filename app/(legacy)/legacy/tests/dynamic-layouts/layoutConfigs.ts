import React from "react";

type SpacingDensity = 'compact' | 'normal' | 'comfortable';

interface LayoutOption {
    label: string;
    value: string;
    icon?: React.ReactNode;
}

interface LayoutBaseConfig {
    container: string;
    parentContainer?: string;
}

interface SingleColumnLayout extends LayoutBaseConfig {
    content: string;
}

interface TwoColumnLayout extends LayoutBaseConfig {
    primary: string;
    secondary: string;
}

interface ThreeColumnLayout extends LayoutBaseConfig {
    primary?: string;
    secondary?: string;
    tertiary?: string;
    columns?: string;
}

interface GridLayout extends LayoutBaseConfig {
    item: string;
    featured?: string;
}

interface ListLayout extends LayoutBaseConfig {
    item: string;
    column?: string;
}

interface DashboardLayout extends LayoutBaseConfig {
    header?: string;
    sidebar?: string;
    content?: string;
    footerStats?: string;
    mainContent?: string;
    footer?: string;
    fullWidth?: string;
    large?: string;
    medium?: string;
    small?: string;
}

interface PageLayout extends LayoutBaseConfig {
    hero?: string;
    featuresGrid?: string;
    content?: string;
    leftSidebar?: string;
    rightSidebar?: string;
    header?: string;
    alternatingFeatures?: string;
    feature?: string;
    featureReverse?: string;
}

interface AppLayout extends LayoutBaseConfig {
    sidebar?: string;
    list?: string;
    content?: string;
    navigation?: string;
    preview?: string;
    section?: string;
}

interface ComplexLayout extends LayoutBaseConfig {
    header?: string;
    mainSection?: string;
    sidebar?: string;
    content?: string;
    features?: string;
    footer?: string;
    topRow?: string;
    middleSection?: string;
    mainContent?: string;
    bottomGrid?: string;
}

interface MediaLayout extends LayoutBaseConfig {
    item?: string;
    hero?: string;
    content?: string;
    media?: string;
    sidebar?: string;
}

// Define the configuration structure
interface LayoutConfigs {
    single: Record<string, SingleColumnLayout>;
    twoColumn: Record<string, TwoColumnLayout>;
    threeColumn: Record<string, ThreeColumnLayout>;
    grid: Record<string, GridLayout>;
    list: Record<string, ListLayout>;
    dashboard: Record<string, DashboardLayout>;
    page: Record<string, PageLayout>;
    app: Record<string, AppLayout>;
    complex: Record<string, ComplexLayout>;
    media: Record<string, MediaLayout>;
    parentContainer: string;
}

// Update the helper function with proper typing
interface SpacingConfig {
    container: string;
    item: string;
}

type SpacingConfigs = Record<'compact' | 'normal' | 'comfortable', SpacingConfig>;
type LayoutCategory = keyof Omit<LayoutConfigs, 'parentContainer'>;


const widthPresets = {
    xs: 'w-full', // Changed from max-w-xl
    sm: 'w-full', // Changed from max-w-2xl
    md: 'w-full', // Changed from max-w-4xl
    lg: 'w-full', // Changed from max-w-6xl
    xl: 'w-full', // Changed from max-w-7xl
    full: 'w-full'
};

const layoutConfigs = {
    single: {
        // Standard content column
        standard: {
            container: `${widthPresets.md} space-y-4`,
            content: 'w-full'
        },
        // Narrow content for focused reading
        narrow: {
            container: `${widthPresets.sm} space-y-4`,
            content: 'w-full'
        },
        // Wide content for rich media
        wide: {
            container: `${widthPresets.lg} space-y-4`,
            content: 'w-full'
        },
        // Full width with padding
        full: {
            container: 'w-full px-4 space-y-4',
            content: 'w-full'
        },
        // Centered content with maximum width
        centered: {
            container: `${widthPresets.sm} space-y-4 text-center`,
            content: 'w-full'
        }
    },

    // Two column layouts with various arrangements
    twoColumn: {
        // Equal width columns
        even: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-2 gap-4`,
            primary: 'w-full',
            secondary: 'w-full'
        },
        // Wide left column (2/3 - 1/3)
        primaryLeft: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-3 gap-4`,
            primary: 'lg:col-span-2',
            secondary: 'w-full'
        },
        // Wide right column (1/3 - 2/3)
        primaryRight: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-3 gap-4`,
            primary: 'lg:col-span-2 lg:col-start-2',
            secondary: 'w-full'
        },
        // Asymmetric (3/4 - 1/4)
        asymmetric: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-4 gap-4`,
            primary: 'lg:col-span-3',
            secondary: 'w-full'
        },
        // Sticky sidebar right
        stickyRight: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-3 gap-4`,
            primary: 'lg:col-span-2',
            secondary: 'w-full lg:sticky lg:top-4 lg:self-start'
        },
        // Sticky sidebar left
        stickyLeft: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-3 gap-4`,
            primary: 'lg:col-span-2 lg:col-start-2',
            secondary: 'w-full lg:sticky lg:top-4 lg:self-start'
        },
        // Overlapping columns
        overlapping: {
            container: `${widthPresets.xl} mx-auto relative`,
            primary: 'w-2/3 z-10',
            secondary: 'w-2/3 absolute right-0 top-8 z-0'
        }
    },

    // Three column layouts
    threeColumn: {
        // Equal width columns
        equal: {
            container: `${widthPresets.xl} grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`,
            columns: 'w-full'
        },
        // Wide center column
        primaryCenter: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-4 gap-4`,
            primary: 'lg:col-span-2 lg:col-start-2',
            secondary: 'w-full'
        },
        // Wide left column
        primaryLeft: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-4 gap-4`,
            primary: 'lg:col-span-2',
            secondary: 'w-full',
            tertiary: 'w-full'
        },
        // Sticky sidebars
        stickySides: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-4 gap-4`,
            primary: 'lg:col-span-2 lg:col-start-2',
            secondary: 'w-full lg:sticky lg:top-4 lg:self-start',
            tertiary: 'w-full lg:sticky lg:top-4 lg:self-start'
        }
    },

    // Grid layouts
    grid: {
        // Responsive card grid
        cards: {
            container: `${widthPresets.xl} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`,
            item: 'w-full'
        },
        // Masonry-style grid
        masonry: {
            container: `${widthPresets.xl} mx-auto columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4`,
            item: 'break-inside-avoid mb-4'
        },
        // Featured item with grid
        featured: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4`,
            featured: 'lg:col-span-2 xl:col-span-2 row-span-2',
            item: 'w-full'
        },
        // Alternating grid
        alternating: {
            container: `${widthPresets.xl} grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`,
            primary: 'md:col-span-2 lg:col-span-2',
            secondary: 'w-full',
            alternate: 'md:col-span-2 lg:col-span-1'
        }
    },

    // List layouts
    list: {
        // Standard vertical list
        standard: {
            container: `${widthPresets.lg} mx-auto space-y-4`,
            item: 'w-full'
        },
        // Compact list
        compact: {
            container: `${widthPresets.lg} mx-auto space-y-2`,
            item: 'w-full'
        },
        // Feed style with avatars
        feed: {
            container: `${widthPresets.md} mx-auto space-y-4`,
            item: 'flex gap-4 items-start'
        },
        // Timeline style
        timeline: {
            container: `${widthPresets.md} mx-auto space-y-0`,
            item: 'relative pl-8 pb-8 border-l border-gray-200 last:border-0'
        },
        // Kanban-style columns
        kanban: {
            container: `${widthPresets.xl} grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4`,
            column: 'space-y-4 bg-gray-50 p-4 rounded-lg',
            item: 'w-full'
        }
    },

    // Dashboard layouts
    dashboard: {
        // Standard dashboard grid
        standard: {
            container: `${widthPresets.xl} grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`,
            fullWidth: 'md:col-span-2 lg:col-span-3',
            item: 'w-full'
        },
        // Analytics layout
        analytics: {
            container: 'w-full grid grid-cols-12 gap-4',
            header: 'col-span-12 h-40',  // Full width header
            sidebar: 'col-span-12 lg:col-span-3 sticky top-4 self-start',
            content: 'col-span-12 lg:col-span-9 space-y-4',
            footerStats: 'col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4'
        },

        // Complex dashboard with multiple sections
        complex: {
            container: 'w-full space-y-4',
            header: 'w-full grid grid-cols-1 md:grid-cols-3 gap-4',
            mainContent: 'w-full grid grid-cols-12 gap-4',
            sidebar: 'col-span-12 lg:col-span-3 space-y-4 sticky top-4 self-start',
            content: 'col-span-12 lg:col-span-9 space-y-4',
            footer: 'w-full grid grid-cols-1 md:grid-cols-4 gap-4'
        },
        // Widget grid
        widgets: {
            container: `${widthPresets.xl} grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`,
            large: 'col-span-2 md:col-span-2 lg:col-span-2',
            medium: 'col-span-2 md:col-span-1 lg:col-span-1',
            small: 'col-span-1'
        }
    },
    // Media-focused layouts
    media: {
        // Gallery grid
        gallery: {
            container: `${widthPresets.xl} grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2`,
            item: 'aspect-square'
        },
        // Hero with content
        hero: {
            container: 'w-full relative',
            hero: 'w-full h-[50dvh] relative',
            content: `${widthPresets.lg} mx-auto relative -mt-16 bg-white p-6 rounded-lg shadow-lg`
        },
        // Media with sidebar
        mediaSidebar: {
            container: `${widthPresets.xl} grid grid-cols-1 lg:grid-cols-3 gap-4`,
            media: 'lg:col-span-2',
            sidebar: 'space-y-4'
        }
    },
    page: {
        // Hero with features grid
        heroWithFeatures: {
            container: 'w-full space-y-8',
            hero: 'w-full min-h-[60dvh] relative',
            featuresGrid: 'w-full grid grid-cols-1 md:grid-cols-3 gap-6',
            content: 'w-full space-y-6'
        },

        // Content with dual sidebars
        dualSidebar: {
            container: 'w-full grid grid-cols-12 gap-4',
            leftSidebar: 'col-span-12 lg:col-span-3 sticky top-4 self-start',
            content: 'col-span-12 lg:col-span-6 space-y-4',
            rightSidebar: 'col-span-12 lg:col-span-3 sticky top-4 self-start'
        },

        // Feature sections layout
        featureSections: {
            container: 'w-full space-y-16',
            header: 'w-full',
            alternatingFeatures: 'w-full space-y-24',
            feature: 'w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center',
            featureReverse: 'w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center lg:flex-row-reverse'
        }
    },

    // App-specific layouts
    app: {
        // Email client layout
        email: {
            container: 'w-full grid grid-cols-12 gap-4 h-full',
            sidebar: 'col-span-12 md:col-span-3 lg:col-span-2 space-y-4',
            list: 'col-span-12 md:col-span-9 lg:col-span-4 border-x space-y-1',
            content: 'col-span-12 lg:col-span-6 space-y-4'
        },

        // File browser layout
        fileBrowser: {
            container: 'w-full grid grid-cols-12 gap-4',
            navigation: 'col-span-12 md:col-span-3 space-y-2',
            content: 'col-span-12 md:col-span-9 space-y-4',
            preview: 'col-span-12 md:col-span-3 sticky top-4 self-start'
        },

        // Settings page layout
        settings: {
            container: 'w-full grid grid-cols-12 gap-6',
            sidebar: 'col-span-12 lg:col-span-3 space-y-2',
            content: 'col-span-12 lg:col-span-9 space-y-6',
            section: 'w-full space-y-4'
        }
    },
    // Complex arrangements
    complex: {
        // Mixed content layout
        mixed: {
            container: 'w-full space-y-8',
            header: 'w-full grid grid-cols-1 md:grid-cols-3 gap-4',
            mainSection: 'w-full grid grid-cols-12 gap-6',
            sidebar: 'col-span-12 lg:col-span-3 space-y-4 sticky top-4 self-start',
            content: 'col-span-12 lg:col-span-9 space-y-6',
            features: 'w-full grid grid-cols-1 md:grid-cols-3 gap-6',
            footer: 'w-full grid grid-cols-2 md:grid-cols-4 gap-4'
        },

        // Dashboard with multiple grids
        multiGrid: {
            container: 'w-full space-y-6',
            topRow: 'w-full grid grid-cols-1 md:grid-cols-4 gap-4',
            middleSection: 'w-full grid grid-cols-12 gap-6',
            mainContent: 'col-span-12 lg:col-span-8 space-y-6',
            sidebar: 'col-span-12 lg:col-span-4 space-y-4 sticky top-4 self-start',
            bottomGrid: 'w-full grid grid-cols-1 md:grid-cols-3 gap-4'
        }
    },
    parentContainer: 'bg-elevation1 rounded-lg p-3 border border-border shadow-sm',
};

const spacingConfigs = {
    compact: {
        container: 'space-y-1 gap-1',
        item: 'p-1',
        section: 'space-y-1',
        content: 'p-2',
        header: 'p-2 mb-1',
        sidebar: 'p-2 space-y-1',
        card: 'p-2',
        nested: 'space-y-1 gap-1'
    },
    normal: {
        container: 'space-y-3 gap-3',
        item: 'p-3',
        section: 'space-y-3',
        content: 'p-4',
        header: 'p-4 mb-3',
        sidebar: 'p-4 space-y-3',
        card: 'p-4',
        nested: 'space-y-3 gap-3'
    },
    comfortable: {
        container: 'space-y-6 gap-6',
        item: 'p-6',
        section: 'space-y-6',
        content: 'p-6',
        header: 'p-6 mb-6',
        sidebar: 'p-6 space-y-6',
        card: 'p-6',
        nested: 'space-y-6 gap-6'
    }
};

// Base classes that should be applied to all layout elements
const baseClasses = {
    container: 'min-w-0 overflow-hidden', // Prevents text overflow
    card: 'break-words overflow-hidden', // Ensures text wraps and stays contained
    text: 'break-words', // Ensures text wraps appropriately
    section: 'min-w-0', // Prevents flex/grid items from expanding beyond container
    sidebar: 'min-w-0 overflow-hidden'
};

const getTestLayoutWithSpacing = (
    layoutType: LayoutCategory,
    layoutVariant: string,
    spacingDensity: keyof SpacingConfigs = 'normal'
): Record<string, string> | null => {
    const layout = layoutConfigs[layoutType]?.[layoutVariant];
    const spacing = spacingConfigs[spacingDensity];
    const parentContainer = layoutConfigs.parentContainer;

    if (!layout || !spacing) return null;

    const processedLayout = Object.entries(layout).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string') {
            // Remove existing spacing classes
            const baseValue = value.replace(/space-[xy]-\d+|gap-\d+|p-\d+|m[tbrlxy]-\d+/g, '');

            // Add appropriate spacing and base classes based on the key
            if (key === 'container') {
                acc[key] = `${baseValue} ${baseClasses.container} ${spacing.container}`;
            } else if (key.includes('item')) {
                acc[key] = `${baseValue} ${baseClasses.card} ${spacing.item}`;
            } else if (key.includes('content')) {
                acc[key] = `${baseValue} ${baseClasses.section} ${spacing.content}`;
            } else if (key.includes('sidebar')) {
                acc[key] = `${baseValue} ${baseClasses.sidebar} ${spacing.sidebar}`;
            } else if (key.includes('header')) {
                acc[key] = `${baseValue} ${baseClasses.section} ${spacing.header}`;
            } else if (key.includes('section')) {
                acc[key] = `${baseValue} ${baseClasses.section} ${spacing.section}`;
            } else {
                // For any other elements, add basic overflow protection
                acc[key] = `${baseValue} ${baseClasses.section} ${spacing.nested}`;
            }
        }
        return acc;
    }, {});

    // Update parent container with proper overflow handling
    return {
        ...processedLayout,
        parentContainer: `${parentContainer} ${baseClasses.container}`
    };
};

export {
    layoutConfigs,
    spacingConfigs,
    widthPresets,
    getTestLayoutWithSpacing
};

export type {
    LayoutConfigs,
    LayoutCategory,
    SpacingConfigs,
    LayoutBaseConfig,
    SingleColumnLayout,
    TwoColumnLayout,
    ThreeColumnLayout,
    GridLayout,
    ListLayout,
    DashboardLayout,
    PageLayout,
    AppLayout,
    ComplexLayout,
    MediaLayout,
    LayoutOption,
    SpacingDensity,
};

