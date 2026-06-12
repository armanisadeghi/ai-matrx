'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
    LayoutGrid,
    Columns,
    GalleryHorizontal,
    LayoutDashboard,
    Image as ImageIcon
} from 'lucide-react';
import {getTestLayoutWithSpacing} from "@/app/(legacy)/legacy/tests/dynamic-layouts/layoutConfigs";

// TypeScript types
type LayoutCategory = 'single' | 'twoColumn' | 'threeColumn' | 'grid' | 'list' | 'dashboard' | 'media';
type SpacingDensity = 'compact' | 'normal' | 'comfortable';

interface LayoutOption {
    label: string;
    value: string;
    icon?: React.ReactNode;
}

// Layout options by category
const layoutOptions: Record<LayoutCategory, LayoutOption[]> = {
    single: [
        { label: 'Standard', value: 'standard' },
        { label: 'Narrow', value: 'narrow' },
        { label: 'Wide', value: 'wide' },
        { label: 'Full', value: 'full' },
        { label: 'Centered', value: 'centered' }
    ],
    twoColumn: [
        { label: 'Even Split', value: 'even' },
        { label: 'Primary Left', value: 'primaryLeft' },
        { label: 'Primary Right', value: 'primaryRight' },
        { label: 'Asymmetric', value: 'asymmetric' },
        { label: 'Sticky Right', value: 'stickyRight' },
        { label: 'Sticky Left', value: 'stickyLeft' },
        { label: 'Overlapping', value: 'overlapping' }
    ],
    threeColumn: [
        { label: 'Equal', value: 'equal' },
        { label: 'Primary Center', value: 'primaryCenter' },
        { label: 'Primary Left', value: 'primaryLeft' },
        { label: 'Sticky Sides', value: 'stickySides' }
    ],
    grid: [
        { label: 'Cards', value: 'cards' },
        { label: 'Masonry', value: 'masonry' },
        { label: 'Featured', value: 'featured' },
        { label: 'Alternating', value: 'alternating' }
    ],
    list: [
        { label: 'Standard', value: 'standard' },
        { label: 'Compact', value: 'compact' },
        { label: 'Feed', value: 'feed' },
        { label: 'Timeline', value: 'timeline' },
        { label: 'Kanban', value: 'kanban' }
    ],
    dashboard: [
        { label: 'Standard', value: 'standard' },
        { label: 'Analytics', value: 'analytics' },
        { label: 'Widgets', value: 'widgets' }
    ],
    media: [
        { label: 'Gallery', value: 'gallery' },
        { label: 'Hero', value: 'hero' },
        { label: 'Media Sidebar', value: 'mediaSidebar' }
    ]
};

const categoryIcons = {
    single: <LayoutGrid size={16} />,
    twoColumn: <Columns size={16} />,
    threeColumn: <Columns size={16} />,
    grid: <LayoutGrid size={16} />,
    list: <LayoutGrid size={16} />,
    dashboard: <LayoutDashboard size={16} />,
    media: <GalleryHorizontal size={16} />
};

// Demo content generator
const generateDemoContent = (type: LayoutCategory, variant: string) => {
    const DemoCard = ({ title }: { title: string }) => (
        <Card className="p-4">
            <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-gray-400" />
                <h3 className="font-medium">{title}</h3>
            </div>
            <p className="mt-2 text-sm text-gray-500">
                Sample content for {title}. This is a placeholder to demonstrate the layout.
            </p>
        </Card>
    );

    switch (type) {
        case 'single':
            return <DemoCard title="Single Column Content" />;

        case 'twoColumn':
            return (
                <>
                    <DemoCard title="Primary Content" />
                    <DemoCard title="Secondary Content" />
                </>
            );

        case 'threeColumn':
            return (
                <>
                    <DemoCard title="Column 1" />
                    <DemoCard title="Column 2" />
                    <DemoCard title="Column 3" />
                </>
            );

        case 'grid':
            return Array.from({ length: 6 }, (_, i) => (
                <DemoCard key={i} title={`Grid Item ${i + 1}`} />
            ));

        case 'list':
            return Array.from({ length: 4 }, (_, i) => (
                <DemoCard key={i} title={`List Item ${i + 1}`} />
            ));

        case 'dashboard':
            return Array.from({ length: 6 }, (_, i) => (
                <DemoCard key={i} title={`Dashboard Widget ${i + 1}`} />
            ));

        case 'media':
            return Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
            ));

        default:
            return null;
    }
};

const LayoutDemoPage = () => {
    const [category, setCategory] = useState<LayoutCategory>('single');
    const [variant, setVariant] = useState('standard');
    const [spacing, setSpacing] = useState<SpacingDensity>('normal');

    // Get current layout configuration
    const layoutConfig = getTestLayoutWithSpacing(category, variant, spacing);

    return (
        <div className="min-h-dvh bg-gray-50 p-6">
            {/* Controls */}
            <Card className="mb-8 p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <Label htmlFor="category">Layout Category</Label>
                        <Select
                            value={category}
                            onValueChange={(value) => {
                                setCategory(value as LayoutCategory);
                                setVariant(layoutOptions[value as LayoutCategory][0].value);
                            }}
                        >
                            {Object.entries(layoutOptions).map(([key, options]) => (
                                <option key={key} value={key}>
                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="variant">Layout Variant</Label>
                        <Select
                            value={variant}
                            onValueChange={setVariant}
                        >
                            {layoutOptions[category].map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="spacing">Spacing Density</Label>
                        <Select
                            value={spacing}
                            onValueChange={(value) => setSpacing(value as SpacingDensity)}
                        >
                            <option value="compact">Compact</option>
                            <option value="normal">Normal</option>
                            <option value="comfortable">Comfortable</option>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Layout Preview */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className={layoutConfig?.container}>
                    {generateDemoContent(category, variant)}
                </div>
            </div>

            {/* Configuration Display */}
            <Card className="mt-8 p-6">
                <h3 className="font-medium mb-4">Current Configuration</h3>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto">
          {JSON.stringify(layoutConfig, null, 2)}
        </pre>
            </Card>
        </div>
    );
};

export default LayoutDemoPage;
