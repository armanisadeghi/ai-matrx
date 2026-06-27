"use client";

import React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";
import { ComponentSize } from "@/types/componentConfigTypes";

// Thumb travel matches the canonical `components/ui/switch.tsx`: a `w-9` track
// (border-2) with a `w-4` thumb slides `translate-x-0` → `translate-x-4` (16px),
// keeping the thumb symmetric inside the track. (Earlier these carried a skewed
// `-6px`/`10px` offset that pushed the thumb 6px too far left in both states.)

// Common types
interface BaseMatrxSwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
    size?: ComponentSize;
    label?: string;
    labelPosition?: 'left' | 'right';
}

// Base Switch (unchanged from our previous implementation)
const Switch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
        className={cn(
            "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-stone-400",
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
            )}
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

// Labeled Switch
const MatrxLabeledSwitch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    BaseMatrxSwitchProps
>(({ label, labelPosition = 'right', size = 'default', className, ...props }, ref) => {
    const sizeClasses = {
        xs: 'text-xs gap-1.5',
        sm: 'text-sm gap-2',
        default: 'text-sm gap-2',
        md: 'text-sm gap-2',
        lg: 'text-base gap-3',
        xl: 'text-lg gap-3',
    };

    return (
        <label className={cn(
            "flex items-center cursor-pointer",
            sizeClasses[size],
            labelPosition === 'right' ? 'flex-row' : 'flex-row-reverse',
            className
        )}>
            {label && <span className="select-none">{label}</span>}
            <Switch ref={ref} {...props} />
        </label>
    );
});
MatrxLabeledSwitch.displayName = "MatrxLabeledSwitch";

// Icon Switch
interface MatrxIconSwitchProps extends BaseMatrxSwitchProps {
    onIcon?: React.ReactNode;
    offIcon?: React.ReactNode;
}

const MatrxIconSwitch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    MatrxIconSwitchProps
>(({ onIcon, offIcon, size = 'default', className, ...props }, ref) => {
    const iconSizes = {
        xs: 12,
        sm: 14,
        default: 14,
        md: 14,
        lg: 16,
        xl: 18,
    };

    const DefaultOnIcon = () => <Sun size={iconSizes[size]} />;
    const DefaultOffIcon = () => <Moon size={iconSizes[size]} />;

    return (
        <SwitchPrimitives.Root
            ref={ref}
            className={cn(
                "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-stone-400",
                className
            )}
            {...props}
        >
            <SwitchPrimitives.Thumb
                className={cn(
                    "pointer-events-none flex items-center justify-center h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
                )}
            >
                <div className="text-primary">
                    {props.checked ? (onIcon || <DefaultOnIcon />) : (offIcon || <DefaultOffIcon />)}
                </div>
            </SwitchPrimitives.Thumb>
        </SwitchPrimitives.Root>
    );
});
MatrxIconSwitch.displayName = "MatrxIconSwitch";

// Side Icon Switch
const MatrxSideIconSwitch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    MatrxIconSwitchProps
>(({ onIcon, offIcon, size = 'default', className, ...props }, ref) => {
    const iconSizes = {
        xs: 12,
        sm: 14,
        default: 14,
        md: 14,
        lg: 16,
        xl: 18,
    };

    const DefaultOnIcon = () => <Sun size={iconSizes[size]} />;
    const DefaultOffIcon = () => <Moon size={iconSizes[size]} />;

    return (
        <div className="flex items-center gap-2">
            <div className="text-muted-foreground">
                {!props.checked ? (onIcon || <DefaultOnIcon />) : (offIcon || <DefaultOffIcon />)}
            </div>
            <Switch ref={ref} className={className} {...props} />
        </div>
    );
});
MatrxSideIconSwitch.displayName = "MatrxSideIconSwitch";

// Icon Toggle
const MatrxIconToggle = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    MatrxIconSwitchProps
>(({ onIcon, offIcon, size = 'default', className, ...props }, ref) => {
    const iconSizes = {
        xs: 16,
        sm: 18,
        default: 18,
        md: 18,
        lg: 20,
        xl: 24,
    };

    const DefaultOnIcon = () => <Sun size={iconSizes[size]} />;
    const DefaultOffIcon = () => <Moon size={iconSizes[size]} />;

    return (
        <SwitchPrimitives.Root
            ref={ref}
            className={cn(
                "inline-flex items-center justify-center rounded-full p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                className
            )}
            {...props}
        >
            <div className={cn(
                "text-muted-foreground transition-colors",
                props.checked && "text-primary"
            )}>
                {props.checked ? (onIcon || <DefaultOnIcon />) : (offIcon || <DefaultOffIcon />)}
            </div>
        </SwitchPrimitives.Root>
    );
});
MatrxIconToggle.displayName = "MatrxIconToggle";

// Unified Switch Component
interface MatrxSwitchProps extends BaseMatrxSwitchProps {
    variant?: 'default' | 'icon' | 'sideIcon' | 'iconToggle';
    icon?: {
        on?: React.ReactNode;
        off?: React.ReactNode;
    };
}

const MatrxSwitch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitives.Root>,
    MatrxSwitchProps
>(({ variant = 'default', icon, label, ...props }, ref) => {
    const commonProps = {
        ...props,
        ref,
        'aria-label': label,
    };

    switch (variant) {
        case 'icon':
            return <MatrxIconSwitch onIcon={icon?.on} offIcon={icon?.off} {...commonProps} />;
        case 'sideIcon':
            return <MatrxSideIconSwitch onIcon={icon?.on} offIcon={icon?.off} {...commonProps} />;
        case 'iconToggle':
            return <MatrxIconToggle onIcon={icon?.on} offIcon={icon?.off} {...commonProps} />;
        default:
            return label ? (
                <MatrxLabeledSwitch label={label} {...commonProps} />
            ) : (
                       <Switch {...commonProps} />
                   );
    }
});
MatrxSwitch.displayName = "MatrxSwitch";

export {
    Switch,
    MatrxLabeledSwitch,
    MatrxIconSwitch,
    MatrxSideIconSwitch,
    MatrxIconToggle,
    MatrxSwitch,
};
