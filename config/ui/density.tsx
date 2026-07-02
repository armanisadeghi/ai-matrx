
// 1. Global App-Level Settings
const globalDensitySettingsBasic = {
    compact: {
        text: {
            xs: 'text-xs',
            sm: 'text-sm',
            base: 'text-sm',
            lg: 'text-base',
            xl: 'text-lg',
            '2xl': 'text-xl'
        },
        spacing: {
            unit: 2,
            gap: 'gap-2',
            containerBase: 'space-y-2',
            sectionBase: 'space-y-1',
            itemSpacing: 'space-x-2'
        },
        controls: {
            height: 'h-8',
            minWidth: 'min-w-[8rem]',
            padding: 'px-2 py-1',
            iconSize: 'w-4 h-4',
            rounded: 'rounded-md'
        },
        containers: {
            padding: 'p-2',
            margin: 'm-2',
            gap: 'gap-2'
        }
    },
    normal: {
        text: {
            xs: 'text-sm',
            sm: 'text-base',
            base: 'text-base',
            lg: 'text-lg',
            xl: 'text-xl',
            '2xl': 'text-2xl'
        },
        spacing: {
            unit: 4,
            gap: 'gap-4',
            containerBase: 'space-y-4',
            sectionBase: 'space-y-2',
            itemSpacing: 'space-x-3'
        },
        controls: {
            height: 'h-10',
            minWidth: 'min-w-[10rem]',
            padding: 'px-3 py-2',
            iconSize: 'w-5 h-5',
            rounded: 'rounded-lg'
        },
        containers: {
            padding: 'p-4',
            margin: 'm-4',
            gap: 'gap-4'
        }
    },
    comfortable: {
        text: {
            xs: 'text-sm',
            sm: 'text-base',
            base: 'text-lg',
            lg: 'text-xl',
            xl: 'text-2xl',
            '2xl': 'text-3xl'
        },
        spacing: {
            unit: 6,
            gap: 'gap-6',
            containerBase: 'space-y-6',
            sectionBase: 'space-y-3',
            itemSpacing: 'space-x-4'
        },
        controls: {
            height: 'h-12',
            minWidth: 'min-w-[12rem]',
            padding: 'px-4 py-2',
            iconSize: 'w-6 h-6',
            rounded: 'rounded-xl'
        },
        containers: {
            padding: 'p-6',
            margin: 'm-6',
            gap: 'gap-6'
        }
    }
};

// Global App-Level Settings - Comprehensive Base System
const globalDensitySettings = {
    compact: {
        // Typography System
        text: {
            xs: 'text-xs',     // 12px
            sm: 'text-sm',     // 14px
            base: 'text-sm',   // 14px
            lg: 'text-base',   // 16px
            xl: 'text-lg',     // 18px
            '2xl': 'text-xl',  // 20px
            '3xl': 'text-2xl', // 24px
            lineHeight: {
                tight: 'leading-tight',
                normal: 'leading-normal',
                relaxed: 'leading-relaxed'
            },
            tracking: {
                tight: 'tracking-tight',
                normal: 'tracking-normal',
                wide: 'tracking-wide'
            }
        },

        // Spacing System
        spacing: {
            unit: 2,                    // 0.5rem (8px) - base unit
            micro: 'space-y-0.5',       // 0.125rem (2px)
            tiny: 'space-y-1',          // 0.25rem (4px)
            small: 'space-y-2',         // 0.5rem (8px)
            medium: 'space-y-3',        // 0.75rem (12px)
            large: 'space-y-4',         // 1rem (16px)
            grid: {
                gap: 'gap-2',
                rowGap: 'gap-y-2',
                columnGap: 'gap-x-2'
            },
            container: {
                padding: 'p-2',
                margin: 'm-2'
            }
        },

        // Interactive Elements Base
        controls: {
            height: 'h-8',
            minWidth: 'min-w-[8rem]',
            padding: {
                tight: 'px-1.5 py-0.5',
                normal: 'px-2 py-1',
                relaxed: 'px-3 py-1.5'
            },
            rounded: {
                none: 'rounded-none',
                sm: 'rounded-sm',
                md: 'rounded-md',
                lg: 'rounded-lg',
                full: 'rounded-full'
            }
        },

        // Icon System
        icons: {
            sizes: {
                xs: 'w-3 h-3',
                sm: 'w-4 h-4',
                base: 'w-4 h-4',
                lg: 'w-5 h-5',
                xl: 'w-6 h-6'
            },
            spacing: {
                tight: 'space-x-1',
                normal: 'space-x-2',
                relaxed: 'space-x-3'
            }
        },

        // Border System
        borders: {
            width: {
                thin: 'border',
                medium: 'border-2',
                thick: 'border-4'
            },
            radius: {
                none: 'rounded-none',
                sm: 'rounded-sm',
                md: 'rounded-md',
                lg: 'rounded-lg',
                xl: 'rounded-xl',
                full: 'rounded-full'
            }
        },

        // Shadow System
        shadows: {
            none: 'shadow-none',
            sm: 'shadow-sm',
            md: 'shadow',
            lg: 'shadow-lg',
            xl: 'shadow-xl'
        },

        // Focus States
        focus: {
            ring: {
                width: 'focus:ring-2',
                offset: 'focus:ring-offset-2',
                color: 'focus:ring-primary-500'
            },
            outline: 'focus:outline-none'
        },

        // Animation Timings
        animation: {
            duration: {
                fast: 'duration-150',
                normal: 'duration-200',
                slow: 'duration-300'
            },
            ease: {
                in: 'ease-in',
                out: 'ease-out',
                inOut: 'ease-in-out'
            }
        },

        // Layout Grid
        grid: {
            cols: {
                auto: 'grid-cols-auto',
                min: 'grid-cols-min',
                max: 'grid-cols-max'
            },
            gap: 'gap-2'
        },

        // Transition Properties
        transition: {
            property: {
                all: 'transition-all',
                colors: 'transition-colors',
                opacity: 'transition-opacity',
                shadow: 'transition-shadow',
                transform: 'transition-transform'
            }
        }
    },

    normal: {
        text: {
            xs: 'text-sm',     // 14px
            sm: 'text-base',   // 16px
            base: 'text-base', // 16px
            lg: 'text-lg',     // 18px
            xl: 'text-xl',     // 20px
            '2xl': 'text-2xl', // 24px
            '3xl': 'text-3xl', // 30px
            lineHeight: {
                tight: 'leading-tight',
                normal: 'leading-normal',
                relaxed: 'leading-relaxed'
            },
            tracking: {
                tight: 'tracking-tight',
                normal: 'tracking-normal',
                wide: 'tracking-wide'
            }
        },
        spacing: {
            unit: 4,                    // 1rem (16px) - base unit
            micro: 'space-y-1',         // 0.25rem (4px)
            tiny: 'space-y-2',          // 0.5rem (8px)
            small: 'space-y-3',         // 0.75rem (12px)
            medium: 'space-y-4',        // 1rem (16px)
            large: 'space-y-6',         // 1.5rem (24px)
            grid: {
                gap: 'gap-4',
                rowGap: 'gap-y-4',
                columnGap: 'gap-x-4'
            },
            container: {
                padding: 'p-4',
                margin: 'm-4'
            }
        },
        controls: {
            height: 'h-10',
            minWidth: 'min-w-[10rem]',
            padding: {
                tight: 'px-2 py-1',
                normal: 'px-3 py-2',
                relaxed: 'px-4 py-2.5'
            },
            rounded: {
                none: 'rounded-none',
                sm: 'rounded-sm',
                md: 'rounded-md',
                lg: 'rounded-lg',
                full: 'rounded-full'
            }
        },
        icons: {
            sizes: {
                xs: 'w-4 h-4',
                sm: 'w-5 h-5',
                base: 'w-5 h-5',
                lg: 'w-6 h-6',
                xl: 'w-7 h-7'
            },
            spacing: {
                tight: 'space-x-2',
                normal: 'space-x-3',
                relaxed: 'space-x-4'
            }
        },
        borders: {
            width: {
                thin: 'border',
                medium: 'border-2',
                thick: 'border-4'
            },
            radius: {
                none: 'rounded-none',
                sm: 'rounded',
                md: 'rounded-md',
                lg: 'rounded-lg',
                xl: 'rounded-xl',
                full: 'rounded-full'
            }
        },

        // Shadow System
        shadows: {
            none: 'shadow-none',
            sm: 'shadow-sm',
            md: 'shadow',
            lg: 'shadow-lg',
            xl: 'shadow-xl'
        },

        // Focus States
        focus: {
            ring: {
                width: 'focus:ring-2',
                offset: 'focus:ring-offset-2',
                color: 'focus:ring-primary-500'
            },
            outline: 'focus:outline-none'
        },

        // Animation Timings
        animation: {
            duration: {
                fast: 'duration-200',
                normal: 'duration-300',
                slow: 'duration-500'
            },
            ease: {
                in: 'ease-in',
                out: 'ease-out',
                inOut: 'ease-in-out'
            }
        },

        // Layout Grid
        grid: {
            cols: {
                auto: 'grid-cols-auto',
                min: 'grid-cols-min',
                max: 'grid-cols-max'
            },
            gap: 'gap-4'
        },

        // Transition Properties
        transition: {
            property: {
                all: 'transition-all',
                colors: 'transition-colors',
                opacity: 'transition-opacity',
                shadow: 'transition-shadow',
                transform: 'transition-transform'
            }
        }
    },

    comfortable: {
        text: {
            xs: 'text-base',   // 16px
            sm: 'text-lg',     // 18px
            base: 'text-lg',   // 18px
            lg: 'text-xl',     // 20px
            xl: 'text-2xl',    // 24px
            '2xl': 'text-3xl', // 30px
            '3xl': 'text-4xl', // 36px
            lineHeight: {
                tight: 'leading-tight',
                normal: 'leading-normal',
                relaxed: 'leading-relaxed'
            },
            tracking: {
                tight: 'tracking-tight',
                normal: 'tracking-normal',
                wide: 'tracking-wide'
            }
        },
        spacing: {
            unit: 6,                    // 1.5rem (24px) - base unit
            micro: 'space-y-1.5',       // 0.375rem (6px)
            tiny: 'space-y-3',          // 0.75rem (12px)
            small: 'space-y-4',         // 1rem (16px)
            medium: 'space-y-6',        // 1.5rem (24px)
            large: 'space-y-8',         // 2rem (32px)
            grid: {
                gap: 'gap-6',
                rowGap: 'gap-y-6',
                columnGap: 'gap-x-6'
            },
            container: {
                padding: 'p-6',
                margin: 'm-6'
            }
        },
        controls: {
            height: 'h-12',
            minWidth: 'min-w-[12rem]',
            padding: {
                tight: 'px-3 py-1.5',
                normal: 'px-4 py-2.5',
                relaxed: 'px-5 py-3'
            },
            rounded: {
                none: 'rounded-none',
                sm: 'rounded-sm',
                md: 'rounded-md',
                lg: 'rounded-lg',
                full: 'rounded-full'
            }
        },
        icons: {
            sizes: {
                xs: 'w-5 h-5',
                sm: 'w-6 h-6',
                base: 'w-6 h-6',
                lg: 'w-7 h-7',
                xl: 'w-8 h-8'
            },
            spacing: {
                tight: 'space-x-3',
                normal: 'space-x-4',
                relaxed: 'space-x-5'
            }
        },
        // Border System
        borders: {
            width: {
                thin: 'border-2',
                medium: 'border-4',
                thick: 'border-6'
            },
            radius: {
                none: 'rounded-none',
                sm: 'rounded-lg',
                md: 'rounded-xl',
                lg: 'rounded-2xl',
                xl: 'rounded-3xl',
                full: 'rounded-full'
            }
        },

        // Shadow System
        shadows: {
            none: 'shadow-none',
            sm: 'shadow',
            md: 'shadow-lg',
            lg: 'shadow-xl',
            xl: 'shadow-2xl'
        },

        // Focus States
        focus: {
            ring: {
                width: 'focus:ring-4',
                offset: 'focus:ring-offset-3',
                color: 'focus:ring-primary-500'
            },
            outline: 'focus:outline-none'
        },

        // Animation Timings
        animation: {
            duration: {
                fast: 'duration-300',
                normal: 'duration-500',
                slow: 'duration-700'
            },
            ease: {
                in: 'ease-in',
                out: 'ease-out',
                inOut: 'ease-in-out'
            }
        },

        // Layout Grid
        grid: {
            cols: {
                auto: 'grid-cols-auto',
                min: 'grid-cols-min',
                max: 'grid-cols-max'
            },
            gap: 'gap-6'
        },

        // Transition Properties
        transition: {
            property: {
                all: 'transition-all',
                colors: 'transition-colors',
                opacity: 'transition-opacity',
                shadow: 'transition-shadow',
                transform: 'transition-transform'
            }
        }
    }
};


// 2. Component-Specific Settings
const componentSettings = {
    // Core UI Components
    button: {
        compact: {
            base: 'px-2 py-1 text-sm',
            icon: 'w-4 h-4',
            iconSpacing: 'space-x-1.5'
        },
        normal: {
            base: 'px-3 py-2 text-base',
            icon: 'w-5 h-5',
            iconSpacing: 'space-x-2'
        },
        comfortable: {
            base: 'px-4 py-2 text-lg',
            icon: 'w-6 h-6',
            iconSpacing: 'space-x-3'
        }
    },
    input: {
        compact: {
            wrapper: 'space-y-1',
            label: 'text-xs mb-0.5',
            field: 'px-2 py-1 text-sm',
            helper: 'text-xs mt-0.5'
        },
        normal: {
            wrapper: 'space-y-2',
            label: 'text-sm mb-1',
            field: 'px-3 py-2 text-base',
            helper: 'text-sm mt-1'
        },
        comfortable: {
            wrapper: 'space-y-3',
            label: 'text-base mb-1.5',
            field: 'px-4 py-2 text-lg',
            helper: 'text-sm mt-1.5'
        }
    },

    // Layout Components
    card: {
        compact: {
            wrapper: 'p-2 space-y-2',
            header: 'space-y-1',
            title: 'text-base',
            content: 'space-y-2'
        },
        normal: {
            wrapper: 'p-4 space-y-4',
            header: 'space-y-2',
            title: 'text-lg',
            content: 'space-y-4'
        },
        comfortable: {
            wrapper: 'p-6 space-y-6',
            header: 'space-y-3',
            title: 'text-xl',
            content: 'space-y-6'
        }
    },

    select: {
        compact: {
            wrapper: 'space-y-1',
            label: 'text-xs mb-0.5',
            trigger: 'h-8 px-2 text-sm',
            content: 'p-1',
            option: 'text-sm py-1 px-2',
            icon: 'w-4 h-4'
        },
        normal: {
            wrapper: 'space-y-2',
            label: 'text-sm mb-1',
            trigger: 'h-10 px-3 text-base',
            content: 'p-2',
            option: 'text-base py-1.5 px-3',
            icon: 'w-5 h-5'
        },
        comfortable: {
            wrapper: 'space-y-3',
            label: 'text-base mb-1.5',
            trigger: 'h-12 px-4 text-lg',
            content: 'p-3',
            option: 'text-lg py-2 px-4',
            icon: 'w-6 h-6'
        }
    },
    checkbox: {
        compact: {
            wrapper: 'space-x-2',
            box: 'w-4 h-4',
            label: 'text-sm'
        },
        normal: {
            wrapper: 'space-x-3',
            box: 'w-5 h-5',
            label: 'text-base'
        },
        comfortable: {
            wrapper: 'space-x-4',
            box: 'w-6 h-6',
            label: 'text-lg'
        }
    },
    radio: {
        compact: {
            wrapper: 'space-x-2',
            radio: 'w-4 h-4',
            label: 'text-sm'
        },
        normal: {
            wrapper: 'space-x-3',
            radio: 'w-5 h-5',
            label: 'text-base'
        },
        comfortable: {
            wrapper: 'space-x-4',
            radio: 'w-6 h-6',
            label: 'text-lg'
        }
    },
    textarea: {
        compact: {
            wrapper: 'space-y-1',
            label: 'text-xs mb-0.5',
            field: 'px-2 py-1 text-sm min-h-[4rem]',
            helper: 'text-xs mt-0.5'
        },
        normal: {
            wrapper: 'space-y-2',
            label: 'text-sm mb-1',
            field: 'px-3 py-2 text-base min-h-[6rem]',
            helper: 'text-sm mt-1'
        },
        comfortable: {
            wrapper: 'space-y-3',
            label: 'text-base mb-1.5',
            field: 'px-4 py-2 text-lg min-h-[8rem]',
            helper: 'text-sm mt-1.5'
        }
    },

    // === Navigation Components ===
    menu: {
        compact: {
            wrapper: 'space-y-0.5',
            item: 'px-2 py-1 text-sm',
            icon: 'w-4 h-4',
            spacing: 'space-x-2'
        },
        normal: {
            wrapper: 'space-y-1',
            item: 'px-3 py-2 text-base',
            icon: 'w-5 h-5',
            spacing: 'space-x-3'
        },
        comfortable: {
            wrapper: 'space-y-2',
            item: 'px-4 py-3 text-lg',
            icon: 'w-6 h-6',
            spacing: 'space-x-4'
        }
    },
    tabs: {
        compact: {
            list: 'space-x-1',
            tab: 'px-2 py-1 text-sm',
            content: 'mt-2 p-2',
            indicator: 'h-0.5'
        },
        normal: {
            list: 'space-x-2',
            tab: 'px-3 py-2 text-base',
            content: 'mt-4 p-4',
            indicator: 'h-0.5'
        },
        comfortable: {
            list: 'space-x-3',
            tab: 'px-4 py-3 text-lg',
            content: 'mt-6 p-6',
            indicator: 'h-1'
        }
    },
    breadcrumb: {
        compact: {
            wrapper: 'space-x-1 text-sm',
            separator: 'w-3 h-3',
            item: 'hover:underline'
        },
        normal: {
            wrapper: 'space-x-2 text-base',
            separator: 'w-4 h-4',
            item: 'hover:underline'
        },
        comfortable: {
            wrapper: 'space-x-3 text-lg',
            separator: 'w-5 h-5',
            item: 'hover:underline'
        }
    },

    // === Data Display Components ===
    table: {
        compact: {
            cell: 'px-2 py-1 text-sm',
            header: 'text-xs font-medium',
            spacing: 'space-y-1'
        },
        normal: {
            cell: 'px-3 py-2 text-base',
            header: 'text-sm font-medium',
            spacing: 'space-y-2'
        },
        comfortable: {
            cell: 'px-4 py-3 text-lg',
            header: 'text-base font-medium',
            spacing: 'space-y-3'
        }
    },
    list: {
        compact: {
            wrapper: 'space-y-0.5',
            item: 'px-2 py-1',
            icon: 'w-4 h-4 mr-2',
            text: 'text-sm'
        },
        normal: {
            wrapper: 'space-y-1',
            item: 'px-3 py-2',
            icon: 'w-5 h-5 mr-3',
            text: 'text-base'
        },
        comfortable: {
            wrapper: 'space-y-2',
            item: 'px-4 py-3',
            icon: 'w-6 h-6 mr-4',
            text: 'text-lg'
        }
    },
    badge: {
        compact: {
            base: 'px-1.5 py-0.5 text-xs rounded-full',
            icon: 'w-3 h-3'
        },
        normal: {
            base: 'px-2 py-1 text-sm rounded-full',
            icon: 'w-4 h-4'
        },
        comfortable: {
            base: 'px-3 py-1.5 text-base rounded-full',
            icon: 'w-5 h-5'
        }
    },

    // === Feedback Components ===
    dialog: {
        compact: {
            wrapper: 'p-2 space-y-2',
            header: 'text-base mb-2',
            content: 'space-y-2',
            footer: 'space-x-2 mt-2'
        },
        normal: {
            wrapper: 'p-4 space-y-4',
            header: 'text-lg mb-4',
            content: 'space-y-4',
            footer: 'space-x-3 mt-4'
        },
        comfortable: {
            wrapper: 'p-6 space-y-6',
            header: 'text-xl mb-6',
            content: 'space-y-6',
            footer: 'space-x-4 mt-6'
        }
    },
    toast: {
        compact: {
            wrapper: 'p-2 min-w-[200px]',
            icon: 'w-4 h-4',
            title: 'text-sm font-medium',
            description: 'text-xs mt-1'
        },
        normal: {
            wrapper: 'p-3 min-w-[300px]',
            icon: 'w-5 h-5',
            title: 'text-base font-medium',
            description: 'text-sm mt-1'
        },
        comfortable: {
            wrapper: 'p-4 min-w-[400px]',
            icon: 'w-6 h-6',
            title: 'text-lg font-medium',
            description: 'text-base mt-2'
        }
    },
    alert: {
        compact: {
            wrapper: 'p-2 space-x-2',
            icon: 'w-4 h-4',
            title: 'text-sm font-medium',
            description: 'text-xs mt-1'
        },
        normal: {
            wrapper: 'p-3 space-x-3',
            icon: 'w-5 h-5',
            title: 'text-base font-medium',
            description: 'text-sm mt-1'
        },
        comfortable: {
            wrapper: 'p-4 space-x-4',
            icon: 'w-6 h-6',
            title: 'text-lg font-medium',
            description: 'text-base mt-2'
        }
    },

    // === Overlay Components ===
    popover: {
        compact: {
            content: 'p-2 w-48',
            arrow: 'w-2 h-2',
            header: 'text-sm font-medium mb-1',
            body: 'text-xs'
        },
        normal: {
            content: 'p-3 w-64',
            arrow: 'w-3 h-3',
            header: 'text-base font-medium mb-2',
            body: 'text-sm'
        },
        comfortable: {
            content: 'p-4 w-72',
            arrow: 'w-4 h-4',
            header: 'text-lg font-medium mb-3',
            body: 'text-base'
        }
    },
    tooltip: {
        compact: {
            content: 'px-2 py-1 text-xs max-w-xs',
            arrow: 'w-1.5 h-1.5'
        },
        normal: {
            content: 'px-3 py-1.5 text-sm max-w-sm',
            arrow: 'w-2 h-2'
        },
        comfortable: {
            content: 'px-4 py-2 text-base max-w-md',
            arrow: 'w-2.5 h-2.5'
        }
    },

    // === Data Input Components ===
    slider: {
        compact: {
            wrapper: 'min-h-[24px]',
            track: 'h-1',
            thumb: 'h-3 w-3',
            valueLabel: 'text-xs'
        },
        normal: {
            wrapper: 'min-h-[32px]',
            track: 'h-2',
            thumb: 'h-4 w-4',
            valueLabel: 'text-sm'
        },
        comfortable: {
            wrapper: 'min-h-[40px]',
            track: 'h-3',
            thumb: 'h-5 w-5',
            valueLabel: 'text-base'
        }
    },
    switch: {
        compact: {
            wrapper: 'w-8 h-4',
            thumb: 'w-3 h-3',
            label: 'text-sm ml-2'
        },
        normal: {
            wrapper: 'w-10 h-5',
            thumb: 'w-4 h-4',
            label: 'text-base ml-3'
        },
        comfortable: {
            wrapper: 'w-12 h-6',
            thumb: 'w-5 h-5',
            label: 'text-lg ml-4'
        }
    },

    // === Progress Components ===
    progress: {
        compact: {
            wrapper: 'h-1',
            bar: 'h-1',
            label: 'text-xs mb-1'
        },
        normal: {
            wrapper: 'h-2',
            bar: 'h-2',
            label: 'text-sm mb-2'
        },
        comfortable: {
            wrapper: 'h-3',
            bar: 'h-3',
            label: 'text-base mb-3'
        }
    },
    spinner: {
        compact: {
            wrapper: 'w-4 h-4',
            track: 'border-2',
            indicator: 'border-2'
        },
        normal: {
            wrapper: 'w-6 h-6',
            track: 'border-2',
            indicator: 'border-2'
        },
        comfortable: {
            wrapper: 'w-8 h-8',
            track: 'border-3',
            indicator: 'border-3'
        }
    }
};


// 3. Layout-Level Settings
const layoutSettings = {
    pageContainer: {
        compact: {
            padding: 'p-2',
            gap: 'gap-2',
            maxWidth: 'max-w-7xl'
        },
        normal: {
            padding: 'p-4',
            gap: 'gap-4',
            maxWidth: 'max-w-7xl'
        },
        comfortable: {
            padding: 'p-6',
            gap: 'gap-6',
            maxWidth: 'max-w-7xl'
        }
    },
    sidebar: {
        compact: {
            width: 'w-48',
            padding: 'p-2',
            spacing: 'space-y-1'
        },
        normal: {
            width: 'w-64',
            padding: 'p-4',
            spacing: 'space-y-2'
        },
        comfortable: {
            width: 'w-72',
            padding: 'p-6',
            spacing: 'space-y-3'
        }
    }
};

// 4. Context Provider and Hook
import React, { createContext, useContext } from 'react';

type DensityKey = keyof typeof globalDensitySettings;

interface DensityContextValue {
    density: DensityKey;
    settings: {
        global: (typeof globalDensitySettings)[DensityKey];
        component: typeof componentSettings;
        layout: typeof layoutSettings;
    };
}

const DensityContext = createContext<DensityContextValue>({
    density: 'normal',
    settings: {
        global: globalDensitySettings.normal,
        component: componentSettings,
        layout: layoutSettings
    }
});

export const useDensity = () => {
    const context = useContext(DensityContext);
    if (!context) {
        throw new Error('useDensity must be used within a DensityProvider');
    }
    return context;
};

export const DensityProvider = ({
    density = 'normal',
    children,
}: {
    density?: DensityKey;
    children: React.ReactNode;
}) => {
    const settings = {
        global: globalDensitySettings[density],
        component: componentSettings,
        layout: layoutSettings
    };

    return (
        <DensityContext.Provider value={{ density, settings }}>
            {children}
        </DensityContext.Provider>
    );
};

// 5. Example Usage in a Component
export const ExampleCard = ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { density, settings } = useDensity();
    const cardStyles = settings.component.card[density];

    return (
        <div className={cardStyles.wrapper}>
            <div className={cardStyles.header}>
                <h2 className={cardStyles.title}>{title}</h2>
            </div>
            <div className={cardStyles.content}>
                {children}
            </div>
        </div>
    );
};
// 2. Component Category Settings (variations for different types of components)
const componentCategorySettings = {
    form: {
        compact: {
            fieldSpacing: 'space-y-1',
            labelSpacing: 'mb-0.5',
            inputPadding: 'py-1'
        },
        normal: {
            fieldSpacing: 'space-y-2',
            labelSpacing: 'mb-1',
            inputPadding: 'py-1.5'
        },
        comfortable: {
            fieldSpacing: 'space-y-3',
            labelSpacing: 'mb-2',
            inputPadding: 'py-2'
        }
    },
    card: {
        compact: {
            padding: 'p-2',
            headerSpacing: 'mb-2'
        },
        normal: {
            padding: 'p-4',
            headerSpacing: 'mb-4'
        },
        comfortable: {
            padding: 'p-6',
            headerSpacing: 'mb-6'
        }
    },
    // Add more component categories as needed
};

// 3. Specific Component Instance Overrides (for components with unique needs)
const componentSpecificSettings = {
    mainNav: {
        compact: {
            itemPadding: 'py-1 px-2',
            itemSpacing: 'space-x-1'
        },
        normal: {
            itemPadding: 'py-2 px-3',
            itemSpacing: 'space-x-2'
        },
        comfortable: {
            itemPadding: 'py-3 px-4',
            itemSpacing: 'space-x-3'
        }
    },
    // Add more specific component overrides as needed
};

// Example usage in a component
const ExampleComponent = ({ density = 'normal' }: { density?: DensityKey }) => {
    // Combine settings from different levels
    const globalSettings = globalDensitySettings[density];
    const formSettings = componentCategorySettings.form[density];

    return (
        <div className={globalSettings.spacing.containerBase}>
            <form className={formSettings.fieldSpacing}>
                <div>
                    <label className={`${globalSettings.text.label} ${formSettings.labelSpacing}`}>
                        Input Label
                    </label>
                    <input
                        className={`${globalSettings.controls.height} ${globalSettings.controls.padding} ${formSettings.inputPadding}`}
                        type="text"
                    />
                </div>
            </form>
        </div>
    );
};

// Helper function to merge settings from different levels
const getMergedSettings = (
    density: DensityKey,
    componentType: keyof typeof componentCategorySettings,
    componentId: keyof typeof componentSpecificSettings,
) => {
    return {
        ...globalDensitySettings[density],
        ...(componentCategorySettings[componentType]?.[density] || {}),
        ...(componentSpecificSettings[componentId]?.[density] || {})
    };
};

export {
    globalDensitySettings,
    componentCategorySettings,
    componentSpecificSettings,
    getMergedSettings
};

export const densityConfig = {
    compact: {
        spacing: 'gap-2',
        padding: {
            xs: 'p-2',
            sm: 'p-3',
            md: 'p-4',
            lg: 'p-5',
            xl: 'p-6'
        },
        fontSize: 'text-sm',
        iconSize: 'h-4 w-4',
        buttonSize: 'size-sm',
        maxHeight: 'max-h-[500px]'
    },
    normal: {
        spacing: 'gap-4',
        padding: {
            xs: 'p-3',
            sm: 'p-4',
            md: 'p-5',
            lg: 'p-6',
            xl: 'p-8'
        },
        fontSize: 'text-base',
        iconSize: 'h-5 w-5',
        buttonSize: 'size-default',
        maxHeight: 'max-h-[600px]'
    },
    comfortable: {
        spacing: 'gap-6',
        padding: {
            xs: 'p-4',
            sm: 'p-6',
            md: 'p-8',
            lg: 'p-10',
            xl: 'p-12'
        },
        fontSize: 'text-lg',
        iconSize: 'h-6 w-6',
        buttonSize: 'size-lg',
        maxHeight: 'max-h-[700px]'
    }
};



type ComponentSize = 'compact' | 'normal' | 'comfortable';

type ButtonSettings = {
    base: string;
    icon: string;
    iconSpacing: string;
};

type InputSettings = {
    wrapper: string;
    label: string;
    field: string;
    helper: string;
};

type CardSettings = {
    wrapper: string;
    header: string;
    title: string;
    content: string;
};

type SelectSettings = {
    wrapper: string;
    label: string;
    trigger: string;
    content: string;
    option: string;
    icon: string;
};

type CheckboxSettings = {
    wrapper: string;
    box: string;
    label: string;
};

type RadioSettings = {
    wrapper: string;
    radio: string;
    label: string;
};

type TextareaSettings = {
    wrapper: string;
    label: string;
    field: string;
    helper: string;
};

type MenuSettings = {
    wrapper: string;
    item: string;
    icon: string;
    spacing: string;
};

type TabsSettings = {
    list: string;
    tab: string;
    content: string;
    indicator: string;
};

type BreadcrumbSettings = {
    wrapper: string;
    separator: string;
    item: string;
};

type TableSettings = {
    cell: string;
    header: string;
    spacing: string;
};

type ListSettings = {
    wrapper: string;
    item: string;
    icon: string;
    text: string;
};

type BadgeSettings = {
    base: string;
    icon: string;
};

type DialogSettings = {
    wrapper: string;
    header: string;
    content: string;
    footer: string;
};

type ToastSettings = {
    wrapper: string;
    icon: string;
    title: string;
    description: string;
};

type AlertSettings = {
    wrapper: string;
    icon: string;
    title: string;
    description: string;
};

type PopoverSettings = {
    content: string;
    arrow: string;
    header: string;
    body: string;
};

type TooltipSettings = {
    content: string;
    arrow: string;
};

type SliderSettings = {
    wrapper: string;
    track: string;
    thumb: string;
    valueLabel: string;
};

type SwitchSettings = {
    wrapper: string;
    thumb: string;
    label: string;
};

type ProgressSettings = {
    wrapper: string;
    bar: string;
    label: string;
};

type SpinnerSettings = {
    wrapper: string;
    track: string;
    indicator: string;
};

type ComponentSettings = {
    button: Record<ComponentSize, ButtonSettings>;
    input: Record<ComponentSize, InputSettings>;
    card: Record<ComponentSize, CardSettings>;
    select: Record<ComponentSize, SelectSettings>;
    checkbox: Record<ComponentSize, CheckboxSettings>;
    radio: Record<ComponentSize, RadioSettings>;
    textarea: Record<ComponentSize, TextareaSettings>;
    menu: Record<ComponentSize, MenuSettings>;
    tabs: Record<ComponentSize, TabsSettings>;
    breadcrumb: Record<ComponentSize, BreadcrumbSettings>;
    table: Record<ComponentSize, TableSettings>;
    list: Record<ComponentSize, ListSettings>;
    badge: Record<ComponentSize, BadgeSettings>;
    dialog: Record<ComponentSize, DialogSettings>;
    toast: Record<ComponentSize, ToastSettings>;
    alert: Record<ComponentSize, AlertSettings>;
    popover: Record<ComponentSize, PopoverSettings>;
    tooltip: Record<ComponentSize, TooltipSettings>;
    slider: Record<ComponentSize, SliderSettings>;
    switch: Record<ComponentSize, SwitchSettings>;
    progress: Record<ComponentSize, ProgressSettings>;
    spinner: Record<ComponentSize, SpinnerSettings>;
};


type LayoutSize = 'compact' | 'normal' | 'comfortable';

type PageContainerSettings = {
    padding: string;
    gap: string;
    maxWidth: string;
    contentWidth: string;
    spacing: string;
};

type NavbarSettings = {
    height: string;
    padding: string;
    itemSpacing: string;
    itemPadding: string;
    logoSize: string;
    dropdownOffset: string;
};

type SidebarSettings = {
    width: string;
    collapsedWidth: string;
    padding: string;
    itemSpacing: string;
    itemPadding: string;
    sectionSpacing: string;
    iconSize: string;
};

type MainContentSettings = {
    padding: string;
    spacing: string;
    sectionSpacing: string;
    headerSpacing: string;
};

type GridSettings = {
    gap: string;
    columns: {
        sm: string;
        md: string;
        lg: string;
        xl: string;
    };
    padding: string;
};

type DashboardSettings = {
    gap: string;
    cardPadding: string;
    gridCols: string;
    widgetSpacing: string;
    headerHeight: string;
};

type FormLayoutSettings = {
    spacing: string;
    groupSpacing: string;
    sectionSpacing: string;
    labelGap: string;
    columnGap: string;
};

type ListLayoutSettings = {
    spacing: string;
    itemPadding: string;
    headerSpacing: string;
    divider: string;
};

type ModalLayoutSettings = {
    padding: string;
    spacing: string;
    headerSpacing: string;
    footerSpacing: string;
    maxWidth: string;
    maxHeight: string;
};

type PanelLayoutSettings = {
    padding: string;
    headerHeight: string;
    footerHeight: string;
    bodySpacing: string;
    width: string;
};

type SplitViewSettings = {
    gap: string;
    primaryWidth: string;
    secondaryWidth: string;
    dividerWidth: string;
    minPaneWidth: string;
};

type LayoutSettings = {
    pageContainer: Record<LayoutSize, PageContainerSettings>;
    navbar: Record<LayoutSize, NavbarSettings>;
    sidebar: Record<LayoutSize, SidebarSettings>;
    mainContent: Record<LayoutSize, MainContentSettings>;
    grid: Record<LayoutSize, GridSettings>;
    dashboard: Record<LayoutSize, DashboardSettings>;
    formLayout: Record<LayoutSize, FormLayoutSettings>;
    listLayout: Record<LayoutSize, ListLayoutSettings>;
    modalLayout: Record<LayoutSize, ModalLayoutSettings>;
    panel: Record<LayoutSize, PanelLayoutSettings>;
    splitView: Record<LayoutSize, SplitViewSettings>;
};


type DensitySize = 'compact' | 'normal' | 'comfortable';

type TextSettings = {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    lineHeight: {
        tight: string;
        normal: string;
        relaxed: string;
    };
    tracking: {
        tight: string;
        normal: string;
        wide: string;
    };
};

type SpacingSettings = {
    unit: number; // The base unit (e.g., 2 for compact)
    micro: string;
    tiny: string;
    small: string;
    medium: string;
    large: string;
    grid: {
        gap: string;
        rowGap: string;
        columnGap: string;
    };
    container: {
        padding: string;
        margin: string;
    };
};

type ControlSettings = {
    height: string;
    minWidth: string;
    padding: {
        tight: string;
        normal: string;
        relaxed: string;
    };
    rounded: {
        none: string;
        sm: string;
        md: string;
        lg: string;
        full: string;
    };
};

type IconSettings = {
    sizes: {
        xs: string;
        sm: string;
        base: string;
        lg: string;
        xl: string;
    };
    spacing: {
        tight: string;
        normal: string;
        relaxed: string;
    };
};

type BorderSettings = {
    width: {
        thin: string;
        medium: string;
        thick: string;
    };
    radius: {
        none: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        full: string;
    };
};

type ShadowSettings = {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
};

type FocusSettings = {
    ring: {
        width: string;
        offset: string;
        color: string;
    };
    outline: string;
};

type AnimationSettings = {
    duration: {
        fast: string;
        normal: string;
        slow: string;
    };
    ease: {
        in: string;
        out: string;
        inOut: string;
    };
};

type TransitionSettings = {
    property: {
        all: string;
        colors: string;
        opacity: string;
        shadow: string;
        transform: string;
    };
};

type GlobalDensitySettings = {
    text: TextSettings;
    spacing: SpacingSettings;
    controls: ControlSettings;
    icons: IconSettings;
    borders: BorderSettings;
    shadows: ShadowSettings;
    focus: FocusSettings;
    animation: AnimationSettings;
    grid: GridSettings;
    transition: TransitionSettings;
};

type GlobalDensitySettingsBySize = {
    compact: GlobalDensitySettings;
    normal: GlobalDensitySettings;
    comfortable: GlobalDensitySettings;
};

export default globalDensitySettings;
