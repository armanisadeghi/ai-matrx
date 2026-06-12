'use client';

import React, {useState} from 'react';
import LoadingButton from '@/components/ui/loaders/loading-button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Bell, Mail, Save, Send, Settings, Star, Upload, User, Plus, Heart, Trash, ArrowRight} from 'lucide-react';
import LoadingButtonGroup from "@/components/ui/loaders/loading-button-group";

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

const DEMO_ICONS = {
    Bell,
    Mail,
    Save,
    Send,
    Settings,
    Star,
    Upload,
    User,
};

const DemoSection = ({title, children}: { title: string; children: React.ReactNode }) => (
    <Card className="w-full">
        <CardHeader>
            <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap gap-4">{children}</div>
        </CardContent>
    </Card>
);

export default function LoadingButtonDemo() {
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

    const toggleLoading = (id: string) => {
        setLoadingStates(prev => {
            const newState = {...prev, [id]: !prev[id]};
            if (newState[id]) {
                setTimeout(() => {
                    setLoadingStates(current => ({...current, [id]: false}));
                }, 2000);
            }
            return newState;
        });
    };

    return (
        <div className="flex min-h-dvh w-full flex-col gap-6">
            {/* Variants Section */}
            <DemoSection title="Color Variants">
                {VARIANTS.map((variant) => (
                    <LoadingButton
                        key={variant}
                        variant={variant}
                        icon={Send}
                        isLoading={loadingStates[`variant-${variant}`]}
                        onClick={() => toggleLoading(`variant-${variant}`)}
                        className="min-w-[150px]"
                    >
                        {variant}
                    </LoadingButton>
                ))}
            </DemoSection>

            {/* Non-Responsive Round Icon Buttons Section */}
            <DemoSection title="Non-Responsive Container Icon-Only Buttons">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4">
                        {VARIANTS.map((variant) => (
                            <LoadingButton
                                key={`icon-${variant}`}
                                variant={variant}
                                size="icon"
                                icon={Plus}
                                isLoading={loadingStates[`icon-${variant}`]}
                                onClick={() => toggleLoading(`icon-${variant}`)}
                            />
                        ))}
                    </div>
                </div>
            </DemoSection>

            {/* Responsive */}
            <DemoSection title="Responsive Icon-Only Buttons">
                <div className="flex flex-wrap items-center gap-4">
                    {VARIANTS.map((variant) => (
                        <LoadingButton
                            key={`icon-${variant}`}
                            variant={variant}
                            size="icon"
                            icon={Plus}
                            isLoading={loadingStates[`icon-${variant}`]}
                            onClick={() => toggleLoading(`icon-${variant}`)}
                        />
                    ))}
                </div>
            </DemoSection>

            {/* Responsive Pairs */}
            <DemoSection title="Responsive Paired Icon-Only Buttons">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Group buttons in pairs using array chunking */}
                    {Array.from({length: Math.ceil(VARIANTS.length / 2)}, (_, i) => (
                        <div key={`pair-${i}`} className="flex items-center gap-4">
                            {VARIANTS.slice(i * 2, i * 2 + 2).map((variant) => (
                                <LoadingButton
                                    key={`icon-${variant}`}
                                    variant={variant}
                                    size="icon"
                                    icon={Plus}
                                    isLoading={loadingStates[`icon-${variant}`]}
                                    onClick={() => toggleLoading(`icon-${variant}`)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </DemoSection>

            {/* Responsive Adaptive */}
            <DemoSection title="Responsive Button Group">
                <LoadingButtonGroup>
                    {VARIANTS.map((variant) => (
                        <LoadingButton
                            key={`icon-${variant}`}
                            variant={variant}
                            size="icon"
                            icon={Plus}
                            isLoading={loadingStates[`icon-${variant}`]}
                            onClick={() => toggleLoading(`icon-${variant}`)}
                        />
                    ))}
                </LoadingButtonGroup>
            </DemoSection>


            <DemoSection title="Responsive Even Groups Icon-Only Buttons NOT WORKING WELL">
                <div className="flex flex-wrap items-center gap-4">
                    {(() => {
                        // Calculate optimal group size
                        const totalButtons = VARIANTS.length;
                        const optimalGroups = totalButtons <= 3 ? 1 :
                                              totalButtons <= 6 ? 2 :
                                              totalButtons <= 9 ? 3 :
                                              Math.ceil(totalButtons / 4);

                        const buttonGroups = Array.from({ length: optimalGroups }, (_, groupIndex) => {
                            const start = Math.floor(groupIndex * totalButtons / optimalGroups);
                            const end = Math.floor((groupIndex + 1) * totalButtons / optimalGroups);
                            const groupVariants = VARIANTS.slice(start, end);

                            return (
                                <div key={`group-${groupIndex}`} className="flex items-center gap-4">
                                    {groupVariants.map((variant) => (
                                        <LoadingButton
                                            key={`icon-${variant}`}
                                            variant={variant}
                                            size="icon"
                                            icon={Plus}
                                            isLoading={loadingStates[`icon-${variant}`]}
                                            onClick={() => toggleLoading(`icon-${variant}`)}
                                        />
                                    ))}
                                </div>
                            );
                        });

                        return buttonGroups;
                    })()}
                </div>
            </DemoSection>
             Round Icon Buttons Section
            <DemoSection title="Round Icon Buttons">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4">
                        {VARIANTS.map((variant) => (
                            <LoadingButton
                                key={`round-${variant}`}
                                variant={variant}
                                size="roundIcon"
                                icon={Heart}
                                isLoading={loadingStates[`round-${variant}`]}
                                onClick={() => toggleLoading(`round-${variant}`)}
                            />
                        ))}
                    </div>
                </div>
            </DemoSection>
            <DemoSection title="Smart CRUD Buttons">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4">
                        {VARIANTS.map((variant) => (
                            <LoadingButton
                                key={`icon-${variant}`}
                                variant={variant}
                                size="icon"
                                icon={Plus}
                                isLoading={loadingStates[`icon-${variant}`]}
                                onClick={() => toggleLoading(`icon-${variant}`)}
                            />
                        ))}
                    </div>
                </div>
            </DemoSection>

            {/* Sizes Section */}
            <DemoSection title="Size Variants">
                {SIZES.map((size) => (
                    <LoadingButton
                        key={size}
                        size={size}
                        icon={Star}
                        variant="primary"
                        isLoading={loadingStates[`size-${size}`]}
                        onClick={() => toggleLoading(`size-${size}`)}
                    >
                        Size {size}
                    </LoadingButton>
                ))}
            </DemoSection>

            {/* Common Actions */}
            <DemoSection title="Common Actions">
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <LoadingButton
                        icon={Upload}
                        variant="primary"
                        isLoading={loadingStates['action1']}
                        onClick={() => toggleLoading('action1')}
                        loadingText="Uploading..."
                    >
                        Upload File
                    </LoadingButton>

                    <LoadingButton
                        icon={Trash}
                        variant="destructive"
                        isLoading={loadingStates['action2']}
                        onClick={() => toggleLoading('action2')}
                        loadingText="Deleting..."
                    >
                        Delete Item
                    </LoadingButton>

                    <LoadingButton
                        icon={ArrowRight}
                        variant="success"
                        isLoading={loadingStates['action3']}
                        onClick={() => toggleLoading('action3')}
                        loadingText="Processing..."
                    >
                        Next Step
                    </LoadingButton>
                </div>
            </DemoSection>

            {/* Mixed Layout Example */}
            <DemoSection title="Mixed Layout Example">
                <div className="flex w-full flex-wrap items-center gap-4">
                    <LoadingButton
                        variant="primary"
                        icon={Save}
                        isLoading={loadingStates['mixed1']}
                        onClick={() => toggleLoading('mixed1')}
                    >
                        Save
                    </LoadingButton>

                    <LoadingButton
                        size="roundIcon"
                        variant="secondary"
                        icon={Heart}
                        isLoading={loadingStates['mixed2']}
                        onClick={() => toggleLoading('mixed2')}
                    />

                    <LoadingButton
                        size="icon"
                        variant="outline"
                        icon={Plus}
                        isLoading={loadingStates['mixed3']}
                        onClick={() => toggleLoading('mixed3')}
                    />

                    <LoadingButton
                        variant="ghost"
                        icon={Settings}
                        size="sm"
                        isLoading={loadingStates['mixed4']}
                        onClick={() => toggleLoading('mixed4')}
                    >
                        Settings
                    </LoadingButton>
                </div>
            </DemoSection>

            {/* Special States */}
            <DemoSection title="Special States">
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
                    <LoadingButton
                        disabled
                        icon={Mail}
                        variant="primary"
                    >
                        Disabled
                    </LoadingButton>

                    <LoadingButton
                        isLoading
                        icon={Mail}
                        variant="secondary"
                        loadingText="Always Loading..."
                    >
                        Always Loading
                    </LoadingButton>

                    <LoadingButton
                        disabled
                        isLoading
                        icon={Mail}
                        variant="outline"
                        loadingText="Disabled & Loading"
                    >
                        Disabled & Loading
                    </LoadingButton>
                </div>
            </DemoSection>
        </div>
    );
}
