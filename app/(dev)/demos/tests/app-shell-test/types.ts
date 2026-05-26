import React from "react";

export type LayoutType =
    'EnhancedDynamicLayout'
    | 'AdvancedDynamicLayoutNew'
    | 'AdvancedDynamicLayout'
    | 'AdvancedLayout'
    | 'DynamicLayout';

export type gapOptions = 'small' | 'medium' | 'large' | string;
export type paddingOptions = 'small' | 'medium' | 'large' | string;


export type EnhancedProps = {
    backgroundColor: string;
    gap: gapOptions;
    padding: paddingOptions
    rounded: boolean;
    animate: boolean;
    hoverEffect: boolean;
};

export type HeaderControlsProps = {
    selectedLayout: LayoutType;
    setSelectedLayout: (layout: LayoutType) => void;
    enhancedProps: EnhancedProps;
    setEnhancedProps: React.Dispatch<React.SetStateAction<EnhancedProps>>;
};

export interface LayoutItem {
    id: string;
    gridArea: string;
    minHeight: string;
}

export interface Layouts {
    [key: string]: {
        [key: string]: LayoutItem[];
    };
}

export interface ChildProps {
    id: string;
    children?: React.ReactNode;
}

export interface EnhancedDynamicLayoutProps {
    layoutType: string;
    children: React.ReactNode;
    backgroundColor?: string;
    gap?: gapOptions
    padding?: paddingOptions;
    rounded?: boolean;
    animate?: boolean;
    hoverEffect?: boolean;
}

export interface EnhancedDynamicLayoutNewProps {
    layoutType: string;
    children: React.ReactNode;
    backgroundColor?: string;
    gap?: 'small' | 'medium' | 'large';
    padding?: 'small' | 'medium' | 'large';
    rounded?: boolean;
    animate?: boolean;
    hoverEffect?: boolean;
}


