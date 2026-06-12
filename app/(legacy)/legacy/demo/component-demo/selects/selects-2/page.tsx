'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Select from '@/components/ui/loaders/select';
import { Bell, Calendar, ChevronDown, Filter, Mail, Search, Settings, User } from 'lucide-react';

const DemoSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card className="w-full">
        <CardHeader>
            <CardTitle className="text-xl font-semibold">{title}</CardTitle>
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

const VARIANTS = [
    'default',
    'destructive',
    'success',
    'outline',
    'secondary',
    'ghost',
    'link',
    'primary',
] as const;

const SIZES = ['xs', 'sm', 'default', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

export default function SelectDemo() {
    const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

    const handleChange = (id: string) => (value: string) => {
        setSelectedValues(prev => ({ ...prev, [id]: value }));
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
        <div className="flex min-h-dvh w-full flex-col gap-6">
            {/* Color Variants */}
            <DemoSection title="Color Variants">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {VARIANTS.map((variant) => (
                        <Select
                            key={variant}
                            options={SAMPLE_OPTIONS}
                            value={selectedValues[`variant-${variant}`]}
                            onChange={handleChange(`variant-${variant}`)}
                            variant={variant}
                            placeholder={`${variant} variant`}
                            icon={Settings}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* Size Variants */}
            <DemoSection title="Size Variants">
                <div className="grid gap-4">
                    {SIZES.map((size) => (
                        <Select
                            key={size}
                            options={SAMPLE_OPTIONS}
                            value={selectedValues[`size-${size}`]}
                            onChange={handleChange(`size-${size}`)}
                            size={size}
                            placeholder={`Size: ${size}`}
                            icon={User}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* Icon Variants */}
            <DemoSection title="Icon Select Variants">
                <div className="flex flex-wrap items-center gap-4">
                    {[
                        { icon: Filter, variant: 'primary' as const },
                        { icon: Search, variant: 'secondary' as const },
                        { icon: Mail, variant: 'destructive' as const },
                        { icon: Bell, variant: 'success' as const },
                        { icon: Calendar, variant: 'outline' as const },
                        { icon: Settings, variant: 'ghost' as const }
                    ].map(({ icon, variant }) => (
                        <Select
                            key={`icon-${variant}`}
                            options={SAMPLE_OPTIONS}
                            value={selectedValues[`icon-${variant}`]}
                            onChange={handleChange(`icon-${variant}`)}
                            size="icon"
                            variant={variant}
                            icon={icon}
                            isLoading={loadingStates[`icon-${variant}`]}
                            onClick={() => toggleLoading(`icon-${variant}`)}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* Round Icon Variants */}
            <DemoSection title="Round Icon Select Variants">
                <div className="flex flex-wrap items-center gap-4">
                    {[
                        { icon: Filter, variant: 'primary' as const },
                        { icon: Search, variant: 'secondary' as const },
                        { icon: Mail, variant: 'destructive' as const },
                        { icon: Bell, variant: 'success' as const },
                        { icon: Calendar, variant: 'outline' as const },
                        { icon: Settings, variant: 'ghost' as const }
                    ].map(({ icon, variant }) => (
                        <Select
                            key={`round-${variant}`}
                            options={SAMPLE_OPTIONS}
                            value={selectedValues[`round-${variant}`]}
                            onChange={handleChange(`round-${variant}`)}
                            size="roundIcon"
                            variant={variant}
                            icon={icon}
                            isLoading={loadingStates[`round-${variant}`]}
                            onClick={() => toggleLoading(`round-${variant}`)}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* States & Features */}
            <DemoSection title="States & Features">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.loading}
                        onChange={handleChange('loading')}
                        isLoading={loadingStates.loading}
                        onClick={() => toggleLoading('loading')}
                        placeholder="Click to load"
                        icon={Settings}
                    />
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.disabled}
                        onChange={handleChange('disabled')}
                        disabled
                        placeholder="Disabled state"
                        icon={Settings}
                    />
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.error}
                        onChange={handleChange('error')}
                        error
                        placeholder="Error state"
                        icon={Settings}
                    />
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.withLabel}
                        onChange={handleChange('withLabel')}
                        label="With Label"
                        description="This select has a label and description"
                        placeholder="Select an option"
                        icon={Settings}
                    />
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.success}
                        onChange={handleChange('success')}
                        variant="success"
                        placeholder="Success variant"
                        icon={Settings}
                    />
                    <Select
                        options={SAMPLE_OPTIONS}
                        value={selectedValues.destructive}
                        onChange={handleChange('destructive')}
                        variant="destructive"
                        placeholder="Destructive variant"
                        icon={Settings}
                    />
                </div>
            </DemoSection>
        </div>
    );
}
