// app/(authenticated)/tests/app-shell-test/layout-choices/page.tsx

'use client';

import React, { useState } from 'react';
import EnhancedDynamicLayout from '../../components/EnhancedDynamicLayout';
import AdvancedDynamicLayoutNew from '../../components/AdvancedDynamicLayoutNew';
import AdvancedDynamicLayout from '../../components/AdvancedDynamicLayout';
import AdvancedLayout from '../../components/AdvancedLayout';
import DynamicLayout from '../../components/DynamicLayout';
import { HeaderControls } from '../../HeaderControls';

const FullWidthWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full min-w-full flex-1 overflow-hidden">
        {children}
    </div>
);

type LayoutType = 'EnhancedDynamicLayout' | 'AdvancedDynamicLayoutNew' | 'AdvancedDynamicLayout' | 'AdvancedLayout' | 'DynamicLayout';

export default function Page() {
    const [selectedLayout, setSelectedLayout] = useState<LayoutType>('EnhancedDynamicLayout');
    const [enhancedProps, setEnhancedProps] = useState({
        backgroundColor: "bg-gray-900",
        gap: "medium",
        padding: "medium",
        rounded: true,
        animate: true,
        hoverEffect: true,
    });

    const commonChildren = [
        <div key="featured" id="featured">Featured Content</div>,
        <div key="header1" id="header1">Header 1</div>,
        <div key="header2" id="header2">Header 2</div>,
        <div key="sidebar" id="sidebar">Sidebar</div>,
        <div key="main" id="main">Main Article</div>,
        <div key="quickLink1" id="quickLink1">Quick Link 1</div>,
        <div key="quickLink2" id="quickLink2">Quick Link 2</div>,
        <div key="secondary" id="secondary">Secondary Article</div>,
        <div key="social" id="social">Social Media Feed</div>,
        <div key="weather" id="weather">Weather Widget</div>,
        <div key="footer1" id="footer1">Footer Content 1</div>,
        <div key="footer2" id="footer2">Footer Content 2</div>,
    ];

    const baseProps = {
        layoutType: "complexDashboard" as const,
    };

    const renderSelectedLayout = () => {
        switch (selectedLayout) {
            case 'EnhancedDynamicLayout':
                return (
                    <FullWidthWrapper>
                        <EnhancedDynamicLayout
                            {...baseProps}
                            {...enhancedProps}
                        >
                            {commonChildren}
                        </EnhancedDynamicLayout>
                    </FullWidthWrapper>
                );
            case 'AdvancedDynamicLayoutNew':
                return (
                    <FullWidthWrapper>
                        <AdvancedDynamicLayoutNew {...baseProps}>
                            {commonChildren}
                        </AdvancedDynamicLayoutNew>
                    </FullWidthWrapper>
                );
            case 'AdvancedDynamicLayout':
                return (
                    <FullWidthWrapper>
                        <AdvancedDynamicLayout {...baseProps}>
                            {commonChildren}
                        </AdvancedDynamicLayout>
                    </FullWidthWrapper>
                );
            case 'AdvancedLayout':
                return (
                    <FullWidthWrapper>
                        <AdvancedLayout {...baseProps}>
                            {commonChildren}
                        </AdvancedLayout>
                    </FullWidthWrapper>
                );
            case 'DynamicLayout':
                return (
                    <FullWidthWrapper>
                        <DynamicLayout {...baseProps}>
                            {commonChildren}
                        </DynamicLayout>
                    </FullWidthWrapper>
                );
            default:
                return null;
        }
    };


    return (
        <div className="flex flex-col w-full min-w-full space-y-4">
            <HeaderControls
                selectedLayout={selectedLayout}
                setSelectedLayout={setSelectedLayout}
                enhancedProps={enhancedProps}
                setEnhancedProps={setEnhancedProps}
            />
            {renderSelectedLayout()}
        </div>
    );
}
