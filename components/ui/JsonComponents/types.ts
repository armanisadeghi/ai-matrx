import React from "react";
import type { JsonValue } from "@/types/json";

export type JsonData = object | string;

export interface ValidationError {
    line: number;
    column: number;
    message: string;
}

export interface JsonComponentConfig {
    id: string;
    data: JsonData;
    title: string;
    type: 'viewer' | 'editor';
    allowMinimize?: boolean;
    readOnly?: boolean;
    onSave?: (data: JsonData) => void;
    onChange?: (data: JsonData) => void;
    initialLayout?: 'expanded' | 'minimized';
    description?: string;
    metrics?: {
        keys?: number;
        depth?: number;
        size?: string;
    };
}


// Types and interfaces
export interface JsonMetrics {
    keys: number;
    depth: number;
    size: string;
}

export type LayoutType = 'grid' | 'rows' | 'columns' | 'autoGrid';
export type MinimizedPosition = 'top' | 'bottom' | 'left' | 'right';

export interface LayoutControlsProps {
    layout: LayoutType;
    onLayoutChange: (layout: LayoutType) => void;
    minimizedPosition: MinimizedPosition;
    onPositionChange: (position: MinimizedPosition) => void;
    showControls: boolean;
    onShowControlsChange: (show: boolean) => void;
}


export interface EditableJsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
    data: object | string | null,
    onChange: (newData: object | string) => void,
    onFormat?: () => void,
    initialExpanded?: boolean,
    maxHeight?: string,
    validateDelay?: number,
    lockKeys?: boolean,
    defaultEnhancedMode?: boolean,
    readOnly?: boolean
    sampleEntry?: object | string | null
}

export interface JsonEditorItemProps {
    keyName: string;
    value: JsonValue;
    depth: number;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: (newKey: string, newValue: JsonValue) => void;
    onAdd: (newKey: string, newValue: JsonValue, index: number) => void;
    onDelete: () => void;
    error?: ValidationError;
    lockKeys: boolean;
    readOnly?: boolean;
    index: number;
}


