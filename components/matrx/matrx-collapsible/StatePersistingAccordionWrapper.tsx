import React, { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ai-matrx/design-system";

/**
 * A bordered single-item disclosure. Composition only — the primitives live in
 * `@ai-matrx/design-system`.
 *
 * This file used to hand-roll the panel: a plain `<div>` toggled by local
 * `isOpen` state, with `animate-smooth-drop`/`-lift` and inline height/opacity.
 * That div was not `AccordionPrimitive.Content`, so the trigger's
 * `aria-controls` pointed at an id that did not exist, the panel had no
 * `role="region"`, and screen readers saw a button that controlled nothing.
 * It is `AccordionContent` now; the local state it drove is gone with it.
 */
interface AccordionWrapperProps {
    children: ReactNode;
    title: string;
    value: string;
    rightElement?: ReactNode;
    defaultOpen?: boolean;
}

const StatePersistingAccordionWrapper = ({
    children,
    title,
    value,
    rightElement,
    defaultOpen = false
}: AccordionWrapperProps) => {
    return (
        <Accordion
            type="single"
            collapsible
            className="w-full"
            defaultValue={defaultOpen ? value : undefined}
        >
            <AccordionItem value={value} className="border-b border-b-border">
                <div className="flex items-center justify-between">
                    <AccordionTrigger className="flex-1">{title}</AccordionTrigger>
                    {rightElement && (
                        <div className="pr-4">
                            {rightElement}
                        </div>
                    )}
                </div>
                <AccordionContent>
                    <div className="space-y-4 pt-2">
                        {children}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export default StatePersistingAccordionWrapper;
