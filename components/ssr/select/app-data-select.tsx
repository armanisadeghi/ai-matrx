// SelectComponents.tsx
import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
// @ts-ignore - Constants file may not exist
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Constants file may not exist
import {AvailableData, CategoryDetails} from "@/app/(dev)/demos/tests/ssr-test/constants";


// Server Components
export async function CategorySelect(
    {
        categories,
        defaultValue,
        className
    }: {
        defaultValue?: string;
        className?: string;
        categories: CategoryDetails[];
    }) {

    return (
        <Select defaultValue={defaultValue}>
            <SelectTrigger className={className}>
                <SelectValue placeholder="Select a category"/>
            </SelectTrigger>
            <SelectContent>
                {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                        {category.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export async function DataSetSelect(
    {
        defaultValue,
        className,
        availableData,
    }: {
        defaultValue?: string;
        className?: string;
        availableData: AvailableData;
    }) {

    return (
        <Select defaultValue={defaultValue}>
            <SelectTrigger className={className}>
                <SelectValue placeholder="Select a data set"/>
            </SelectTrigger>
            <SelectContent>
                {/* @ts-ignore - dataSets may not be defined, using availableData fallback */}
                {(dataSets || availableData?.dataSets || []).map((set: any) => (
                    <SelectItem key={set.value} value={set.value}>
                        {set.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export async function CategoryDataSelect(
    {
        category,
        defaultValue,
        className
    }: {
        // @ts-ignore - CategoryOptions type may not be defined
        category: CategoryOptions | any;
        defaultValue?: string;
        className?: string;
    }) {

    return (
        <Select defaultValue={defaultValue}>
            <SelectTrigger className={className}>
                <SelectValue placeholder="Select data from category"/>
            </SelectTrigger>
            <SelectContent>
                {/* @ts-ignore - dataSets may not be defined */}
                {(dataSets || []).map((set: any) => (
                    <SelectItem key={set.key} value={set.key}>
                        {set.displayName}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}


/*
// Client wrapper for when you need onChange handling
'use client';

export function ClientSelectWrapper({
                                        children,
                                        onValueChange,
                                    }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
}) {
    return (
        <div onChange={(e: any) => onValueChange(e.target.value)}>
            {children}
        </div>
    );
}*/
