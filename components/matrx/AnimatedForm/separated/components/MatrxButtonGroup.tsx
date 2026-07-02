// components/MatrxButtonGroup.tsx
'use client';
import React from "react";
import {cn} from "@/utils/cn";
import {MatrxButtonGroupProps} from "@/types/componentConfigTypes";
import {densityConfig} from "@/config/ui/FlexConfig";

const MatrxButtonGroup: React.FC<MatrxButtonGroupProps> = (
    {
        children,
        className,
        orientation = 'horizontal',
        fullWidth = false,
        attached = false,
        density = 'normal',
        size = 'md',
        variant = 'default',
        ...props
    }) => {
    const densityStyles = densityConfig[density];

    return (
        <div
            className={cn(
                "inline-flex",
                orientation === 'vertical' ? "flex-col" : "flex-row",
                fullWidth && "w-full",
                attached && [
                    orientation === 'horizontal' && [
                        "[&>*:not(:first-child)]:-ml-px",
                        "[&>*:not(:first-child)]:rounded-l-none",
                        "[&>*:not(:last-child)]:rounded-r-none",
                    ],
                    orientation === 'vertical' && [
                        "[&>*:not(:first-child)]:-mt-px",
                        "[&>*:not(:first-child)]:rounded-t-none",
                        "[&>*:not(:last-child)]:rounded-b-none",
                    ]
                ],
                !attached && orientation === 'horizontal' && `gap-${densityStyles.gap}`,
                !attached && orientation === 'vertical' && `gap-${densityStyles.gap}`,
                className
            )}
            {...props}
        >
            {React.Children.map(children, (child) => {
                if (React.isValidElement<Record<string, unknown>>(child)) {
                    return React.cloneElement(child, {
                        size,
                        variant,
                        density,
                        ...child.props,
                    });
                }
                return child;
            })}
        </div>
    );
};

export {MatrxButtonGroup};

// Usage Example:
/*
import { MatrxButton, MatrxButtonGroup } from './components/MatrxButton';

// Regular Button
<MatrxButton
    variant="primary"
    size="md"
    density="normal"
    animation="smooth"
    onClick={() => console.log('clicked')}
>
    Click Me
</MatrxButton>

// Button Group
<MatrxButtonGroup
    orientation="horizontal"
    attached
    density="normal"
    size="md"
    variant="primary"
>
    <MatrxButton>Left</MatrxButton>
    <MatrxButton>Middle</MatrxButton>
    <MatrxButton>Right</MatrxButton>
</MatrxButtonGroup>
*/
