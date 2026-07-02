// FlexManager.tsx
import React from 'react';
import {motion, AnimatePresence} from "motion/react";
import {cn} from "@/styles/themes/utils";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {FlexFormField, FormState} from '@/types/componentConfigTypes';
import {FlexDensity, FlexField} from './FlexField';


const densityConfig: Record<FlexDensity, {
    padding: string,
    gap: string,
    sectionSpacing: string,
    itemSpacing: string
}> = {
    compact: {
        padding: "p-1",
        gap: "gap-2",
        sectionSpacing: "space-y-4",
        itemSpacing: "mb-2"
    },
    normal: {
        padding: "p-3",
        gap: "gap-4",
        sectionSpacing: "space-y-6",
        itemSpacing: "mb-4"
    },
    comfortable: {
        padding: "p-4",
        gap: "gap-6",
        sectionSpacing: "space-y-8",
        itemSpacing: "mb-6"
    }
};

interface FlexManagerProps {
    layout: 'grid' | 'sections' | 'accordion' | 'tabs' | 'masonry' | 'carousel' | 'timeline';
    fields: FlexFormField[];
    formState: FormState;
    onUpdateField: (name: string, value: unknown) => void;
    columns: number | 'auto' | { xs: number, sm: number, md: number, lg: number, xl: number };
    direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    carouselActiveIndex?: number;
    onCarouselChange?: (index: number) => void;
    searchTerm?: string;
    enableSearch?: boolean;
    density?: FlexDensity;
}

const FlexManager: React.FC<FlexManagerProps> = (
    {
        layout,
        fields,
        formState,
        onUpdateField,
        columns,
        direction,
        carouselActiveIndex = 0,
        onCarouselChange,
        searchTerm = '',
        enableSearch = false,
        density = 'normal'
    }) => {
    const densityStyles = densityConfig[density];

    const filteredFields = enableSearch
                           ? fields.filter(field =>
            field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            field.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
                           : fields;

    const getGridColumns = () => {
        if (typeof columns === 'object') {
            return `grid-cols-${columns.xs} sm:grid-cols-${columns.sm} md:grid-cols-${columns.md} lg:grid-cols-${columns.lg} xl:grid-cols-${columns.xl}`;
        }
        if (columns === 'auto') {
            return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
        }
        switch (columns) {
            case 1:
                return 'grid-cols-1';
            case 2:
                return 'grid-cols-1 sm:grid-cols-2';
            case 3:
                return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
            case 4:
                return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
            case 5:
                return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
            case 6:
                return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
            default:
                return 'grid-cols-1';
        }
    };

    const getFlexDirection = () => {
        switch (direction) {
            case 'row':
                return 'flex-row';
            case 'row-reverse':
                return 'flex-row-reverse';
            case 'column':
                return 'flex-col';
            case 'column-reverse':
                return 'flex-col-reverse';
            default:
                return 'flex-row';
        }
    };

    const renderGridLayout = () => (
        <div className={cn("grid", densityStyles.gap, getGridColumns(), getFlexDirection())}>
            <AnimatePresence>
                {filteredFields.map((field, index) => (
                    <motion.div
                        key={field.name}
                        initial={{opacity: 0, y: 20}}
                        animate={{opacity: 1, y: 0}}
                        transition={{delay: index * 0.1, duration: 0.3}}
                        className={densityStyles.padding}
                    >
                        <FlexField
                            field={field}
                            formState={formState}
                            onUpdateField={onUpdateField}
                            density={density}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );

    const renderSectionsLayout = () => {
        const sections = [...new Set(filteredFields.map(field => field.section || 'Default'))];
        return (
            <div className={densityStyles.sectionSpacing}>
                {sections.map(section => (
                    <div key={section} className={cn("border-b", densityStyles.padding, "pb-6")}>
                        <h3 className={cn("text-lg font-semibold", densityStyles.itemSpacing)}>{section}</h3>
                        <div className={cn("grid", densityStyles.gap, getGridColumns())}>
                            {filteredFields
                                .filter(field => (field.section || 'Default') === section)
                                .map(field => (
                                    <FlexField
                                        key={field.name}
                                        field={field}
                                        formState={formState}
                                        onUpdateField={onUpdateField}
                                        density={density}
                                    />
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderAccordionLayout = () => {
        const sections = [...new Set(filteredFields.map(field => field.section || 'Default'))];
        return (
            <Accordion type="single" collapsible className="w-full">
                {sections.map(section => (
                    <AccordionItem key={section} value={section}>
                        <AccordionTrigger className={densityStyles.padding}>{section}</AccordionTrigger>
                        <AccordionContent className={densityStyles.padding}>
                            <div className={cn("grid", densityStyles.gap, getGridColumns())}>
                                {filteredFields
                                    .filter(field => (field.section || 'Default') === section)
                                    .map(field => (
                                        <FlexField
                                            key={field.name}
                                            field={field}
                                            formState={formState}
                                            onUpdateField={onUpdateField}
                                            density={density}
                                        />
                                    ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    };

    const renderTabsLayout = () => {
        const sections = [...new Set(filteredFields.map(field => field.section || 'Default'))];
        return (
            <Tabs defaultValue={sections[0]} className="w-full">
                <TabsList className={densityStyles.padding}>
                    {sections.map(section => (
                        <TabsTrigger key={section} value={section}>{section}</TabsTrigger>
                    ))}
                </TabsList>
                {sections.map(section => (
                    <TabsContent key={section} value={section} className={densityStyles.padding}>
                        <div className={cn("grid", densityStyles.gap, getGridColumns())}>
                            {filteredFields
                                .filter(field => (field.section || 'Default') === section)
                                .map(field => (
                                    <FlexField
                                        key={field.name}
                                        field={field}
                                        formState={formState}
                                        onUpdateField={onUpdateField}
                                        density={density}
                                    />
                                ))}
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        );
    };

    const renderMasonryLayout = () => (
        <div className={cn("columns-1 sm:columns-2 lg:columns-3 xl:columns-4", densityStyles.gap, getFlexDirection())}>
            {filteredFields.map((field, index) => (
                <div key={field.name}
                     className={cn(densityStyles.itemSpacing, "break-inside-avoid", densityStyles.padding)}>
                    <FlexField
                        field={field}
                        formState={formState}
                        onUpdateField={onUpdateField}
                        density={density}
                    />
                </div>
            ))}
        </div>
    );

    const renderCarouselLayout = () => {
        return (
            <div className="relative overflow-hidden">
                <div
                    className={cn("flex transition-transform duration-300 ease-in-out", getFlexDirection())}
                    style={{transform: `translateX(-${carouselActiveIndex * 100}%)`}}
                >
                    {filteredFields.map((field, index) => (
                        <div key={field.name} className={cn("w-full flex-shrink-0", densityStyles.padding)}>
                            <FlexField
                                field={field}
                                formState={formState}
                                onUpdateField={onUpdateField}
                                density={density}
                            />
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => onCarouselChange?.(Math.max(carouselActiveIndex - 1, 0))}
                    className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full"
                >
                    &lt;
                </button>
                <button
                    onClick={() => onCarouselChange?.(Math.min(carouselActiveIndex + 1, filteredFields.length - 1))}
                    className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full"
                >
                    &gt;
                </button>
            </div>
        );
    };

    const renderTimelineLayout = () => (
        <div className={cn("relative", getFlexDirection(), densityStyles.sectionSpacing)}>
            {filteredFields.map((field, index) => (
                <div key={field.name} className={cn("flex", densityStyles.itemSpacing)}>
                    <div
                        className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                        {index + 1}
                    </div>
                    <div className={cn("ml-4 flex-grow", densityStyles.padding)}>
                        <FlexField
                            field={field}
                            formState={formState}
                            onUpdateField={onUpdateField}
                            density={density}
                        />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderLayout = () => {
        switch (layout) {
            case 'sections':
                return renderSectionsLayout();
            case 'accordion':
                return renderAccordionLayout();
            case 'tabs':
                return renderTabsLayout();
            case 'masonry':
                return renderMasonryLayout();
            case 'carousel':
                return renderCarouselLayout();
            case 'timeline':
                return renderTimelineLayout();
            case 'grid':
            default:
                return renderGridLayout();
        }
    };

    return renderLayout();
};

export default FlexManager;
