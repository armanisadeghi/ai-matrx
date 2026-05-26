// app/components/common/PreWiredCardHeader.tsx
'use client';

import React, { useState } from 'react';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from '@/lib/redux/hooks';
import { selectFormattedEntityOptions } from '@/lib/redux/schema/globalCacheSelectors';
import type { EntityKeys } from '@/types/entityTypes';

interface PreWiredCardHeaderProps {
    onEntityChange?: (value: EntityKeys | null) => void;
}

const PreWiredCardHeader: React.FC<PreWiredCardHeaderProps> = ({ onEntityChange }) => {
    const [selectedEntity, setSelectedEntity] = useState<EntityKeys | null>(null);

    const entitySelectOptions = useAppSelector(selectFormattedEntityOptions);

    const selectedEntityLabel = selectedEntity
                ? entitySelectOptions.find(option => option.value === selectedEntity)?.label || 'Select Entity'
                : 'Select Entity';

    const handleEntityChange = (value: EntityKeys) => {
        setSelectedEntity(value);
        onEntityChange?.(value);
    };

    return (
        <CardHeader>
            <CardTitle className="flex justify-between items-center">
                <span>{selectedEntityLabel}</span>
                <Select
                    value={selectedEntity}
                    onValueChange={(value) => handleEntityChange(value as EntityKeys)}
                >
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select Entity" />
                    </SelectTrigger>
                    <SelectContent>
                        {entitySelectOptions.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardTitle>
            <CardDescription>
                Browse and manage entity data
            </CardDescription>
        </CardHeader>
    );
};

export default PreWiredCardHeader;
