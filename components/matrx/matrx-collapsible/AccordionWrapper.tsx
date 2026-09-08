import React, { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@ai-matrx/design-system";
import { cn } from '@/lib/utils';

interface AccordionWrapperProps {
    children: ReactNode;
    title: string;
    value: string;
    rightElement?: ReactNode;
    defaultOpen?: boolean;
    className?: string;
}

const AccordionWrapper = ({
    children,
    title,
    value,
    rightElement,
    defaultOpen = false,
    className,
}: AccordionWrapperProps) => {
    return (
        <Accordion
            type="single"
            collapsible
            className={cn("w-full", className)}
            defaultValue={defaultOpen ? value : undefined}
        >
            <AccordionItem value={value}>
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

export default AccordionWrapper;