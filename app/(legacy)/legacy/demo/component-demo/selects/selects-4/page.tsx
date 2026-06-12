'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Select from '@/components/ui/loaders/select';

import { Bell, Calendar, ChevronDown, Filter, Mail, Search, Settings, User, Tags, List, Check } from 'lucide-react';
import MultiSelect from '@/components/ui/loaders/multi-select';

const DemoSection = ({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) => (
    <Card className="w-full">
        <CardHeader>
            <CardTitle className="text-xl font-semibold">{title}</CardTitle>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </CardHeader>
        <CardContent>{children}</CardContent>
    </Card>
);

const SAMPLE_OPTIONS = [
    { value: 'option1', label: 'First Option' },
    { value: 'option2', label: 'Second Option' },
    { value: 'option3', label: 'Third Option' },
    { value: 'option4', label: 'Fourth Option' },
];

const CATEGORY_OPTIONS = [
    { value: 'electronics', label: 'Electronics' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'books', label: 'Books' },
    { value: 'sports', label: 'Sports' },
    { value: 'home', label: 'Home & Garden' },
    { value: 'toys', label: 'Toys & Games' },
];

const VARIANTS = ['default', 'destructive', 'success', 'outline', 'secondary', 'ghost', 'link', 'primary'] as const;
const SIZES = ['xs', 'sm', 'default', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

export default function SelectDemo() {
    const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
    const [multiSelectedValues, setMultiSelectedValues] = useState<Record<string, string[]>>({});
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

    const handleSingleChange = (id: string) => (value: string) => {
        setSelectedValues(prev => ({ ...prev, [id]: value }));
    };

    const handleMultiChange = (id: string) => (values: string[]) => {
        setMultiSelectedValues(prev => ({ ...prev, [id]: values }));
    };

    const toggleLoading = (id: string) => {
        setLoadingStates(prev => {
            const newState = { ...prev, [id]: !prev[id] };
            if (newState[id]) {
                setTimeout(() => {
                    setLoadingStates(current => ({ ...current, [id]: false }));
                }, 2000);
            }
            return newState;
        });
    };

    return (
        <div className="flex min-h-dvh w-full flex-col gap-6 p-6">
            {/* Multi-Select Examples */}
            <DemoSection
                title="Multi-Select Variants"
                description="Different styles of multi-select components with various configurations"
            >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.basic}
                        onChange={handleMultiChange('basic')}
                        placeholder="Select categories"
                        label="Basic Multi-select"
                        icon={Tags}
                    />

                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.primary}
                        onChange={handleMultiChange('primary')}
                        variant="primary"
                        placeholder="Primary variant"
                        label="Primary Multi-select"
                        icon={List}
                    />

                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.outlined}
                        onChange={handleMultiChange('outlined')}
                        variant="outline"
                        placeholder="Outlined variant"
                        label="Outlined Multi-select"
                        icon={Check}
                    />
                </div>
            </DemoSection>

            {/* Multi-Select States */}
            <DemoSection
                title="Multi-Select States"
                description="Different states and configurations of the multi-select component"
            >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.loading}
                        onChange={handleMultiChange('loading')}
                        isLoading={loadingStates.multiLoading}
                        onClick={() => toggleLoading('multiLoading')}
                        placeholder="Click to load"
                        label="Loading State"
                    />

                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.disabled}
                        onChange={handleMultiChange('disabled')}
                        disabled
                        placeholder="Disabled state"
                        label="Disabled State"
                    />

                    <MultiSelect
                        options={CATEGORY_OPTIONS}
                        value={multiSelectedValues.error}
                        onChange={handleMultiChange('error')}
                        error
                        placeholder="Error state"
                        label="Error State"
                    />
                </div>
            </DemoSection>

            {/* Single Select Original Examples */}
            <DemoSection title="Single Select Variants">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {VARIANTS.map((variant) => (
                        <Select
                            key={variant}
                            options={SAMPLE_OPTIONS}
                            value={selectedValues[`variant-${variant}`]}
                            onChange={handleSingleChange(`variant-${variant}`)}
                            variant={variant}
                            placeholder={`${variant} variant`}
                            icon={Settings}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* Icon Variants */}
            <DemoSection title="Icon Select Variants">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Single Select Icons */}
                    <div className="flex items-center gap-4 p-2 rounded-lg bg-muted/10">
                        <h3 className="text-sm font-medium">Single:</h3>
                        {[
                            {icon: Filter, variant: 'primary' as const},
                            {icon: Search, variant: 'secondary' as const},
                            {icon: Mail, variant: 'destructive' as const},
                            {icon: Bell, variant: 'success' as const},
                            {icon: Calendar, variant: 'outline' as const},
                            {icon: Settings, variant: 'ghost' as const}
                        ].map(({icon, variant}) => (
                            <Select
                                key={`icon-${variant}`}
                                options={SAMPLE_OPTIONS}
                                value={selectedValues[`icon-${variant}`]}
                                onChange={handleSingleChange(`icon-${variant}`)}
                                size="icon"
                                variant={variant}
                                icon={icon}
                                isLoading={loadingStates[`icon-${variant}`]}
                                onClick={() => toggleLoading(`icon-${variant}`)}
                            />
                        ))}
                    </div>

                    {/* MultiSelect Icons */}
                    <div className="flex items-center gap-4 p-2 rounded-lg bg-muted/10">
                        <h3 className="text-sm font-medium">Multi:</h3>
                        {[
                            {icon: Tags, variant: 'primary' as const},
                            {icon: List, variant: 'secondary' as const},
                            {icon: Filter, variant: 'destructive' as const},
                            {icon: Settings, variant: 'success' as const},
                            {icon: Bell, variant: 'outline' as const},
                            {icon: Search, variant: 'ghost' as const}
                        ].map(({icon, variant}) => (
                            <MultiSelect
                                key={`multi-icon-${variant}`}
                                options={CATEGORY_OPTIONS}
                                value={multiSelectedValues[`icon-${variant}`] || []}
                                onChange={handleMultiChange(`icon-${variant}`)}
                                displayMode="icon"
                                variant={variant}
                                icon={icon}
                                isLoading={loadingStates[`multi-icon-${variant}`]}
                                onClick={() => toggleLoading(`multi-icon-${variant}`)}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-4 p-2 rounded-lg bg-muted/10">
                        <MultiSelect
                            key={`multi-icon-${"primary"}`}
                            options={CATEGORY_OPTIONS}
                            value={multiSelectedValues[`icon-${"primary"}`] || []}
                            onChange={handleMultiChange(`icon-${"primary"}`)}
                            displayMode="icon"
                            variant={"primary"}
                            icon={Tags}
                            isLoading={loadingStates[`multi-icon-${"primary"}`]}
                            onClick={() => toggleLoading(`multi-icon-${"primary"}`)}
                        />
                    </div>

                </div>
            </DemoSection>

            {/* Comparison Section */}
            <DemoSection
                title="Single vs Multi Select"
                description="Compare the behavior of single and multi-select variants side by side"
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <h3 className="text-sm font-medium mb-2">Single Select</h3>
                        <Select
                            options={CATEGORY_OPTIONS}
                            value={selectedValues.compare}
                            onChange={handleSingleChange('compare')}
                            placeholder="Select one category"
                            icon={Tags}
                        />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium mb-2">Multi Select</h3>
                        <MultiSelect
                            options={CATEGORY_OPTIONS}
                            value={multiSelectedValues.compare}
                            onChange={handleMultiChange('compare')}
                            placeholder="Select multiple categories"
                            icon={Tags}
                        />
                    </div>
                </div>
            </DemoSection>
        </div>
    );
}
