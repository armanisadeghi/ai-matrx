// GenericSelect.tsx

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GenericSelectProps {
    options: string[]; // Array of options to display in the dropdown
    onSelect: (value: string) => void; // Callback when an option is selected
    selectedValue: string | null; // Currently selected value
    label?: string; // Optional label for the select
    placeholder?: string; // Optional placeholder text for the select
}

const adminActions = [
    "Add User",
    "Remove User",
    "Update Permissions",
    "View Logs",
    "System Settings"
];


const GenericSelect: React.FC<GenericSelectProps> = ({ options, onSelect, selectedValue, label = "Select Option", placeholder = "Please select" }) => {

    return (
        <div className="space-y-2">
            <label className="block text-md font-medium">{label}</label>
            <Select onValueChange={onSelect} value={selectedValue || undefined}>
                <SelectTrigger className="w-full bg-input">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

export default GenericSelect;
