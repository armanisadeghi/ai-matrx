"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import {ChevronDownIcon} from "@radix-ui/react-icons"

import {cn} from "@/styles/themes/utils"

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-accordion 1.2.14 / react-id 1.1.2). The gate was actively
 * harmful — it deleted EVERY accordion header (and any open item) from SSR
 * and the first client paint. See components/ui/context-menu/context-menu.tsx
 * (the precedent fix, D144).
 */
const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({className, ...props}, ref) => (
    <AccordionPrimitive.Item
        ref={ref}
        className={cn(
            "[&:not(:only-child)]:border-b", // Only apply border if not the only child
            className
        )}
        {...props}
    />
))

AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    rightElements?: React.ReactNode
}
>(({className, children, rightElements, ...props}, ref) => (
    <AccordionPrimitive.Header className="flex w-full">
        <AccordionPrimitive.Trigger
            ref={ref}
            className={cn(
                "flex w-full items-center justify-between rounded-t-lg p-4 text-sm font-medium transition-all hover:bg-accent/50 hover:shadow-sm [&[data-state=open]>svg]:rotate-180",
                className
            )}
            {...props}
        >
            {children}
            <div className="flex items-center">
                <div className="flex items-center gap-2">
                    {rightElements}
                </div>
                <ChevronDownIcon
                    className="ml-4 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"/>
            </div>
        </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
))

AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
    React.ComponentRef<typeof AccordionPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({className, children, ...props}, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
        {...props}
    >
        <div className={cn("pb-4 pt-0", className)}>{children}</div>
    </AccordionPrimitive.Content>
))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

export {Accordion, AccordionItem, AccordionTrigger, AccordionContent}
