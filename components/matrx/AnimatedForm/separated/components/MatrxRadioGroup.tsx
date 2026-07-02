// components/MatrxRadioGroup.tsx
'use client';
import React from "react";
import { motion } from "motion/react";
import {cn} from "@/utils/cn";
import {Label} from "@/components/ui/label";
import {MatrxRadioGroupProps} from "@/types/componentConfigTypes";
import {densityConfig} from "@/config/ui/FlexConfig";

const MatrxRadioGroup: React.FC<MatrxRadioGroupProps> = (
    {
        children,
        className,
        label,
        layout = 'vertical',
        columns = 1,
        showSelectAll = false,
        error,
        hint,
        density = 'normal',
        size = 'md',
        variant = 'default',
        disabled = false,
        ...props
    }) => {
    const densityStyles = densityConfig[density];

    return (
        <div className={cn(densityStyles.spacing, className)} {...props}>
            {label && (
                <Label
                    className={cn(
                        densityStyles.fontSize,
                        "font-medium",
                        disabled ? "text-muted-foreground" : "text-foreground",
                        error ? "text-destructive" : ""
                    )}
                >
                    {label}
                </Label>
            )}

            <div
                className={cn(
                    "flex",
                    layout === 'vertical' && "flex-col",
                    layout === 'horizontal' && "flex-row flex-wrap",
                    layout === 'grid' && `grid grid-cols-${columns} gap-${densityStyles.gap}`,
                    !disabled && "group",
                    densityStyles.spacing
                )}
            >
                {React.Children.map(children, (child) => {
                    if (React.isValidElement<Record<string, unknown>>(child)) {
                        return React.cloneElement(child, {
                            size,
                            density,
                            variant,
                            disabled,
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

export {MatrxRadioGroup};

// Usage Example:
/*
// Single Radio Group
<MatrxRadio
    field={{
        name: "plan",
        label: "Subscription Plan",
        type: "radio",
        options: ["Basic", "Pro", "Enterprise"],
        required: true
    }}
    value={selectedPlan}
    onChange={setSelectedPlan}
    density="normal"
    size="md"
    layout="grid"
    columns={3}
    showSelectAll
    error="Please select a plan"
    hint="You can change this later"
/>

// Complex Radio Group
<MatrxRadioGroup
    label="Choose Your Options"
    layout="grid"
    columns={2}
    error="Please make all selections"
>
    <MatrxRadio
        field={{
            name: "plan",
            type: "radio",
            options: ["Basic", "Pro"]
        }}
        value={plan}
        onChange={setPlan}
    />
    <MatrxRadio
        field={{
            name: "duration",
            type: "radio",
            options: ["Monthly", "Annual"]
        }}
        value={duration}
        onChange={setDuration}
    />
</MatrxRadioGroup>
*/
