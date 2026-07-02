// components/MatrxInputGroup.tsx
'use client';
import React from "react";
import { motion } from "motion/react";
import {cn} from "@/utils/cn";
import {Label} from "@/components/ui/label";
import {MatrxInputGroupProps} from "@/types/componentConfigTypes";
import {densityConfig} from "@/config/ui/FlexConfig";

const MatrxInputGroup: React.FC<MatrxInputGroupProps> = (
    {
        children,
        className,
        label,
        error,
        hint,
        required,
        orientation = 'vertical',
        attached = false,
        density = 'normal',
        size = 'md',
        variant = 'default',
        disabled = false,
        ...props
    }) => {
    const densityStyles = densityConfig[density];
    const id = React.useId();

    return (
        <div className={cn(densityStyles.spacing, className)} {...props}>
            {label && (
                <Label
                    htmlFor={id}
                    className={cn(
                        densityStyles.fontSize,
                        "font-medium",
                        disabled ? "text-muted-foreground" : "text-foreground",
                        error ? "text-destructive" : "",
                        required && "after:content-['*'] after:ml-0.5 after:text-destructive"
                    )}
                >
                    {label}
                </Label>
            )}

            <div
                className={cn(
                    "flex",
                    orientation === 'vertical' ? "flex-col" : "flex-row items-start",
                    !attached && orientation === 'horizontal' && `gap-${densityStyles.gap}`,
                    !attached && orientation === 'vertical' && `gap-${densityStyles.gap}`,
                    attached && orientation === 'horizontal' && [
                        "[&>*:not(:first-child)]:-ml-px",
                        "[&>*:not(:first-child)]:rounded-l-none",
                        "[&>*:not(:last-child)]:rounded-r-none"
                    ],
                    attached && orientation === 'vertical' && [
                        "[&>*:not(:first-child)]:-mt-px",
                        "[&>*:not(:first-child)]:rounded-t-none",
                        "[&>*:not(:last-child)]:rounded-b-none"
                    ]
                )}
            >
                {React.Children.map(children, (child) => {
                    if (React.isValidElement<Record<string, unknown>>(child)) {
                        return React.cloneElement(child, {
                            size,
                            density,
                            variant,
                            disabled,
                            hideLabel: true,
                            ...child.props,
                        });
                    }
                    return child;
                })}
            </div>

            {error && (
                <motion.span
                    initial={{opacity: 0, y: -5}}
                    animate={{opacity: 1, y: 0}}
                    className={cn(
                        "text-destructive",
                        density === 'compact' ? "text-xs" : "text-sm"
                    )}
                >
                    {error}
                </motion.span>
            )}

            {hint && !error && (
                <span className={cn(
                    "text-muted-foreground",
                    density === 'compact' ? "text-xs" : "text-sm"
                )}>
                    {hint}
                </span>
            )}
        </div>
    );
};

export {MatrxInputGroup};

// Usage Example:
/*
// Single Input
<MatrxInput
    field={{
        name: "email",
        label: "Email Address",
        type: "email",
        required: true
    }}
    value={email}
    onChange={setEmail}
    density="normal"
    size="md"
    startAdornment={<Mail className="w-4 h-4 text-muted-foreground" />}
    error="Please enter a valid email"
    hint="We'll never share your email"
/>

// Input Group
<MatrxInputGroup
    label="Search Filters"
    orientation="horizontal"
    attached
    density="normal"
    size="md"
>
    <MatrxInput
        field={{ name: "search", type: "text" }}
        value={search}
        onChange={setSearch}
        startAdornment={<Search className="w-4 h-4" />}
    />
    <MatrxInput
        field={{ name: "category", type: "text" }}
        value={category}
        onChange={setCategory}
    />
    <MatrxInput
        field={{ name: "location", type: "text" }}
        value={location}
        onChange={setLocation}
        endAdornment={<MapPin className="w-4 h-4" />}
    />
</MatrxInputGroup>
*/
