// app/components/common/PreWiredEntitySelect.tsx
'use client';

import {EntityKeys} from '@/types/entityTypes';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {useAppSelector} from "@/lib/redux/hooks";
import {selectFormattedEntityOptions} from "@/lib/redux/schema/globalCacheSelectors";

interface PreWiredEntitySelectProps {
    selectedEntity: EntityKeys;
    onValueChange: (value: EntityKeys) => void;
}

const PreWiredEntitySelectName: React.FC<PreWiredEntitySelectProps> = (
    {
        selectedEntity,
        onValueChange,
    }) => {
    const entitySelectOptions = useAppSelector(selectFormattedEntityOptions);

    return (
        <Select
            value={selectedEntity}
            onValueChange={(value) => onValueChange(value as EntityKeys)}
        >
            <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select Entity"/>
            </SelectTrigger>
            <SelectContent>
                {entitySelectOptions.map(({value, label}) => (
                    <SelectItem key={value} value={value}>
                        {label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export default PreWiredEntitySelectName;
