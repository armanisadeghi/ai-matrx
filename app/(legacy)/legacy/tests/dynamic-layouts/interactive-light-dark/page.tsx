'use client';

import React, {useState} from 'react';
import {Card} from '@/components/ui/card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Label} from '@/components/ui/label';
import {
    LayoutGrid,
    Columns,
    GalleryHorizontal,
    LayoutDashboard,
    List,
    Image as ImageIcon,
    Layout,
    Files,
    Layers
} from 'lucide-react';
import {
    layoutConfigs,
    getTestLayoutWithSpacing,
    LayoutCategory,
    SpacingConfigs,
    LayoutOption,
    SpacingDensity,
} from "@/app/(legacy)/legacy/tests/dynamic-layouts/layoutConfigs";



const generateLayoutOptions = () => {
    const options: Record<string, LayoutOption[]> = {};

    Object.entries(layoutConfigs).forEach(([category, variants]) => {
        options[category] = Object.entries(variants).map(([value, config]) => ({
            label: value.split(/(?=[A-Z])/).join(' '),  // Convert camelCase to spaces
            value
        }));
    });

    return options;
};

// Updated category icons
const categoryIcons: Record<string, React.ReactNode> = {
    single: <Layout size={16} />,
    twoColumn: <Columns size={16} />,
    threeColumn: <Columns size={16} />,
    grid: <LayoutGrid size={16} />,
    list: <List size={16} />,
    dashboardLayouts: <LayoutDashboard size={16} />,
    pageLayouts: <Layout size={16} />,
    appLayouts: <Files size={16} />,
    complexLayouts: <Layers size={16} />,
    media: <GalleryHorizontal size={16} />
};

// Demo content generator
const DemoCard = ({ title }: { title: string }) => (
    <Card className="border-border bg-card overflow-hidden">
        <div className="p-4 break-words">
            <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-5 h-5 shrink-0 text-muted-foreground" />
                <h3 className="font-medium text-card-foreground truncate">
                    {title}
                </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground break-words">
                Sample content for {title}. This is a placeholder to demonstrate the layout.
            </p>
        </div>
    </Card>
);

const generateDemoContent = (type: LayoutCategory, variant: string, config: any) => {
    // Helper function to create a demo section
    const DemoSection = ({ title, className }: { title: string; className?: string }) => (
        <div className={className || ''}>
            <DemoCard title={title} />
        </div>
    );

    // Handle complex layouts
    if (type === 'dashboard' || type === 'page' || type === 'app' || type === 'complex') {
        const sections = Object.keys(config).filter(key => key !== 'container');
        return sections.map((section, index) => (
            <div key={index} className={config[section]}>
                <DemoSection title={`${variant} - ${section}`} />
            </div>
        ));
    }

    // Handle existing layout types
    return generateBasicDemoContent(type, variant);
};

const generateBasicDemoContent = (type: LayoutCategory, variant: string) => {

    switch (type) {
        case 'single':
            return <DemoCard title="Single Column Content"/>;

        case 'twoColumn':
            return (
                <>
                    <DemoCard title="Primary Content"/>
                    <DemoCard title="Secondary Content"/>
                </>
            );

        case 'threeColumn':
            return (
                <>
                    <DemoCard title="Column 1"/>
                    <DemoCard title="Column 2"/>
                    <DemoCard title="Column 3"/>
                </>
            );

        case 'grid':
            return Array.from({length: 6}, (_, i) => (
                <DemoCard key={i} title={`Grid Item ${i + 1}`}/>
            ));

        case 'list':
            return Array.from({length: 4}, (_, i) => (
                <DemoCard key={i} title={`List Item ${i + 1}`}/>
            ));

        case 'dashboard':
            return Array.from({length: 6}, (_, i) => (
                <DemoCard key={i} title={`Dashboard Widget ${i + 1}`}/>
            ));

        case 'media':
            return Array.from({length: 8}, (_, i) => (
                <div
                    key={i}
                    className="aspect-square bg-muted rounded-lg flex items-center justify-center border border-border"
                >
                    <ImageIcon className="w-8 h-8 text-muted-foreground"/>
                </div>
            ));

        default:
            return null;
    }
};

const LayoutDemoPage = () => {
    const layoutOptions = generateLayoutOptions();
    const [category, setCategory] = useState<LayoutCategory>('dashboard');
    const [variant, setVariant] = useState(layoutOptions[category][0].value);
    const [spacing, setSpacing] = useState<keyof SpacingConfigs>('normal');

    const layoutConfig = getTestLayoutWithSpacing(category, variant, spacing);
    const previewContainerClass = layoutConfig?.parentContainer ?? 'bg-elevation1 rounded-lg p-3 border border-border shadow-sm';

    return (
        <div className="min-h-dvh bg-background text-foreground p-3">
            {/* Controls */}
            <Card className="mb-3 border-border bg-card">
                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="category">Layout Category</Label>
                            <Select
                                value={category}
                                onValueChange={(value) => {
                                    setCategory(value as LayoutCategory);
                                    setVariant(layoutOptions[value][0].value);
                                }}
                            >
                                <SelectTrigger id="category">
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.keys(layoutOptions).map((key) => (
                                        <SelectItem key={key} value={key}>
                                            <span className="flex items-center gap-2">
                                                {categoryIcons[key]}
                                                {key.split(/(?=[A-Z])/).join(' ')}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="variant">Layout Variant</Label>
                            <Select
                                value={variant}
                                onValueChange={setVariant}
                            >
                                <SelectTrigger id="variant">
                                    <SelectValue placeholder="Select variant" />
                                </SelectTrigger>
                                <SelectContent>
                                    {layoutOptions[category].map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="spacing">Spacing Density</Label>
                            <Select
                                value={spacing}
                                onValueChange={(value) => setSpacing(value as SpacingDensity)}
                            >
                                <SelectTrigger id="spacing">
                                    <SelectValue placeholder="Select spacing" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="compact">Compact</SelectItem>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="comfortable">Comfortable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Layout Preview */}
            <div className={previewContainerClass}>
                <div className={layoutConfig?.container}>
                    {generateDemoContent(category, variant, layoutConfig)}
                </div>
            </div>

            {/* Configuration Display */}
            <Card className="mt-8 border-border bg-card">
                <div className="p-4">
                    <h3 className="font-medium text-card-foreground mb-3">
                        Current Configuration
                    </h3>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-muted-foreground font-mono text-sm">
                        {JSON.stringify(layoutConfig, null, 2)}
                    </pre>
                </div>
            </Card>
        </div>
    );
};

export default LayoutDemoPage;
