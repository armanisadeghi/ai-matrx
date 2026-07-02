"use client"

import React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/input';

type AnimationLevel = 'none' | 'basic' | 'moderate' | 'enhanced';

interface ExtendedAccordionProps extends Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>, 'type' | 'value' | 'onValueChange' | 'defaultValue'> {
    animationLevel?: AnimationLevel;
    persistState?: boolean;
    theme?: 'default' | 'elevated' | 'subtle';
    borderStyle?: 'none' | 'subtle' | 'solid';
    iconPosition?: 'left' | 'right';
    size?: 'sm' | 'md' | 'lg';
    type: 'single' | 'multiple';
    value?: string | string[];
    defaultValue?: string | string[];
    onValueChange?: (value: string | string[]) => void;
}

const MatrxAccordion = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Root>,
    ExtendedAccordionProps
>(({
       animationLevel = 'enhanced',
       persistState,
       theme = 'default',
       borderStyle = 'subtle',
       size = 'md',
       className,
       onValueChange,
       type = 'single',
       defaultValue,
       value,
       ...props
   }, ref) => {
    // Handle controlled vs uncontrolled state
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<string | string[]>(
        defaultValue ?? (type === 'multiple' ? [] : '')
    );

    // Handle value changes with proper type handling
    const handleValueChange = React.useCallback((newValue: string | string[]) => {
        if (!isControlled) {
            setInternalValue(newValue);
        }

        if (persistState) {
            localStorage.setItem('accordionState', JSON.stringify(newValue));
        }

        if (onValueChange) {
            onValueChange(type === 'multiple' ? (Array.isArray(newValue) ? newValue : [newValue]) :
                          Array.isArray(newValue) ? newValue[0] : newValue);
        }
    }, [persistState, onValueChange, type, setInternalValue]);

    // Load persisted state on mount
    React.useEffect(() => {
        if (persistState && !isControlled && !defaultValue) {
            const stored = localStorage.getItem('accordionState');
            if (stored) {
                const parsedValue = JSON.parse(stored);
                setInternalValue(parsedValue);
            }
        }
    }, [persistState, isControlled, defaultValue]);

    const themeClasses = {
        default: 'bg-background text-foreground',
        elevated: 'bg-elevation2 text-foreground',
        subtle: 'bg-muted text-foreground'
    };

    const borderClasses = {
        none: '',
        subtle: 'divide-y divide-border',
        solid: 'divide-y-2 divide-matrxBorder'
    };

    const sizeClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg'
    };

    return (
        <AccordionPrimitive.Root
            ref={ref}
            type={type}
            defaultValue={defaultValue as any}
            value={isControlled ? (value as any) : internalValue}
            onValueChange={handleValueChange as any}
            className={cn(
                'rounded-xl',
                'shadow-elevation1',
                'overflow-hidden',
                themeClasses[theme],
                borderClasses[borderStyle],
                sizeClasses[size],
                'transition-all duration-500', // Increased from 300ms to 500ms
                className
            )}
            {...props}
        />
    );
});

MatrxAccordion.displayName = 'MatrxAccordion';

const MatrxAccordionItem = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & {
    highlight?: boolean;
}
>(({ className, disabled, highlight, ...props }, ref) => (
    <AccordionPrimitive.Item
        ref={ref}
        className={cn(
            "group",
            highlight && "bg-blue-50 dark:bg-blue-900/20",
            disabled && "opacity-50 cursor-not-allowed",
            "transition-colors duration-500", // Increased from 200ms to 500ms
            className
        )}
        disabled={disabled}
        {...props}
    />
));
MatrxAccordionItem.displayName = 'MatrxAccordionItem';

const MatrxAccordionTrigger = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    icon?: React.ReactNode;
    animationLevel?: AnimationLevel;
    fullWidth?: boolean;
    iconPosition?: 'left' | 'right';
    size?: 'sm' | 'md' | 'lg';
    'data-state'?: 'open' | 'closed';
}
>(({ className, children, icon, animationLevel = 'enhanced', fullWidth, iconPosition = 'right', size = 'md', ...props }, ref) => {
    const sizeClasses = {
        sm: 'py-2 px-3',
        md: 'py-4 px-5',
        lg: 'py-6 px-7'
    };

    return (
        <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
                ref={ref}
                className={cn(
                    "flex flex-1 items-center justify-between",
                    sizeClasses[size],
                    "font-medium",
                    "transition-all duration-500", // Increased from 300ms to 500ms
                    "hover:bg-accent/10",
                    "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50",
                    "data-[state=open]:bg-accent/5",
                    fullWidth && "w-full",
                    className
                )}
                {...props}
            >
                {iconPosition === 'left' && icon && (
                    <motion.div
                        animate={{ rotate: props['data-state'] === 'open' ? 90 : 0 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }} // Increased from 0.3s to 0.5s and added easing
                        className="mr-2"
                    >
                        {icon}
                    </motion.div>
                )}

                <span className="flex-1">{children}</span>

                {iconPosition === 'right' && (
                    <motion.div
                        animate={{ rotate: props['data-state'] === 'open' ? 180 : 0 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }} // Increased from 0.3s to 0.5s and added easing
                        className="ml-2"
                    >
                        {icon || <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </motion.div>
                )}
            </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
    );
});
MatrxAccordionTrigger.displayName = 'MatrxAccordionTrigger';

const MatrxAccordionContent = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & {
    animationLevel?: AnimationLevel;
    lazyLoad?: boolean;
}
>(({ className, children, lazyLoad, ...props }, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className={cn(
            "overflow-hidden text-sm",
            "transition-all duration-500", // Added explicit transition
            "data-[state=closed]:animate-[accordion-up_500ms]", // Increased animation duration
            "data-[state=open]:animate-[accordion-down_500ms]", // Increased animation duration
            className
        )}
        {...props}
    >
        <div className="p-5">
            {lazyLoad ? (
                <React.Suspense fallback={
                    <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                    </div>
                }>
                    {children}
                </React.Suspense>
            ) : children}
        </div>
    </AccordionPrimitive.Content>
));
MatrxAccordionContent.displayName = 'MatrxAccordionContent';

interface AccordionSearchProps {
    onSearch: (searchTerm: string) => void;
    placeholder?: string;
}


const MatrxAccordionSearch: React.FC<AccordionSearchProps> = ({ onSearch, placeholder = 'Search...' }) => {
    const [focused, setFocused] = React.useState(false);

    return (
        <motion.div
            className="relative mb-4"
            animate={{ scale: focused ? 1.02 : 1 }}
            transition={{ duration: 0.5, ease: "easeInOut" }} // Increased from 0.2s to 0.5s and added easing
        >
            <Input
                type="text"
                className={cn(
                    "pl-10 bg-background/50",
                    "focus:bg-background transition-all duration-500", // Increased from 200ms to 500ms
                    "border-2 focus:border-accent",
                    "rounded-lg shadow-sm"
                )}
                placeholder={placeholder}
                onChange={(e) => onSearch(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
            />
            <Search
                className={cn(
                    "absolute left-3 top-1/2 transform -translate-y-1/2",
                    "text-muted-foreground transition-colors duration-500", // Increased from 200ms to 500ms
                    focused && "text-accent"
                )}
                size={20}
            />
        </motion.div>
    );
};

export {
    MatrxAccordion,
    MatrxAccordionItem,
    MatrxAccordionTrigger,
    MatrxAccordionContent,
    MatrxAccordionSearch,
};
