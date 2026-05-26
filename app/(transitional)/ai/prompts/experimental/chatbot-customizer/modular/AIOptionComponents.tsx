// components/ui/AIOptionComponents.tsx
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleOption, SliderOption, SelectOption, MultiSelectOption, RadioGroupOption, InputOption, OptionId, OptionValue } from "./types";

// Toggle component
export const ToggleControl: React.FC<{
    option: ToggleOption;
    value: boolean;
    onChange: (id: OptionId, value: boolean) => void;
}> = ({ option, value, onChange }) => {
    const Icon = option.icon;
    const id = `toggle-${option.id}`;

    const handleClick = () => {
        onChange(option.id, !value);
    };

    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 cursor-pointer" onClick={handleClick}>
            <div className="flex items-center">
                <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
                    {option.label}
                </Label>
            </div>
            <Switch
                id={id}
                checked={value}
                onCheckedChange={(checked) => onChange(option.id, checked)}
                onClick={(e) => e.stopPropagation()} // Prevent double-toggling
            />
        </div>
    );
};

// Slider component
export const SliderControl: React.FC<{
    option: SliderOption;
    value: number;
    onChange: (id: OptionId, value: number) => void;
}> = ({ option, value, onChange }) => {
    const { label, min = 0, max = 100, step = 1, leftLabel = "Less", rightLabel = "More" } = option;

    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
                <Label className="text-sm font-medium">{label}</Label>
                <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-full">{value}%</span>
            </div>
            <div className="flex items-center space-x-2">
                <span className="text-xs text-muted-foreground">{leftLabel}</span>
                <Slider
                    value={[value]}
                    min={min}
                    max={max}
                    step={step}
                    onValueChange={(values) => onChange(option.id, values[0])}
                    className="flex-1"
                />
                <span className="text-xs text-muted-foreground">{rightLabel}</span>
            </div>
        </div>
    );
};

// Select component
export const SelectControl: React.FC<{
    option: SelectOption;
    value: string;
    onChange: (id: OptionId, value: string) => void;
}> = ({ option, value, onChange }) => {
    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-1">{option.label}</Label>
            <Select value={value} onValueChange={(value) => onChange(option.id, value)}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                    {option.options.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

// Radio Group component
export const RadioGroupControl: React.FC<{
    option: RadioGroupOption;
    value: string;
    onChange: (id: OptionId, value: string) => void;
}> = ({ option, value, onChange }) => {
    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-2">{option.label}</Label>
            <RadioGroup value={value} onValueChange={(value) => onChange(option.id, value)} className="flex flex-wrap gap-2">
                {option.options.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2 cursor-pointer" onClick={() => onChange(option.id, item.id)}>
                        <RadioGroupItem value={item.id} id={`radio-${option.id}-${item.id}`} className="cursor-pointer" />
                        <Label htmlFor={`radio-${option.id}-${item.id}`} className="text-sm cursor-pointer">
                            {item.label}
                        </Label>
                    </div>
                ))}
            </RadioGroup>
        </div>
    );
};

// Style Button component (for visual selections)
export const StyleButtonControl: React.FC<{
    option: RadioGroupOption;
    value: string;
    onChange: (id: OptionId, value: string) => void;
    isLarge?: boolean;
}> = ({ option, value, onChange, isLarge = false }) => {
    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-2">{option.label}</Label>
            <div className={`grid ${isLarge ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" : "grid-cols-3"} gap-3`}>
                {option.options.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onChange(option.id, item.id)}
                        className={`p-3 border rounded-xl text-left transition-all ${
                            value === item.id
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border hover:border-muted-foreground hover:bg-accent/50"
                        }`}
                    >
                        <div className="font-medium mb-1">{item.label}</div>
                        {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                    </button>
                ))}
            </div>
        </div>
    );
};

// Pill Button component (for tone selection etc)
export const PillButtonControl: React.FC<{
    option: RadioGroupOption;
    value: string;
    onChange: (id: OptionId, value: string) => void;
}> = ({ option, value, onChange }) => {
    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-2">{option.label}</Label>
            <div className="flex flex-wrap gap-2">
                {option.options.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onChange(option.id, item.id)}
                        className={`px-3 py-1.5 border rounded-full text-sm transition-all ${
                            value === item.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-foreground hover:border-muted-foreground hover:bg-accent/50"
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

// MultiSelect component (for expertise areas etc)
export const MultiSelectControl: React.FC<{
    option: MultiSelectOption;
    value: string[];
    onChange: (id: OptionId, value: string[]) => void;
}> = ({ option, value, onChange }) => {
    const handleToggle = (itemId: string) => {
        const newValue = value.includes(itemId) ? value.filter((id) => id !== itemId) : [...value, itemId];

        onChange(option.id, newValue);
    };

    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-2">{option.label}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {option.options.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggle(item.id)}
                        className={`py-2 px-3 text-sm border rounded-lg flex items-center ${
                            value.includes(item.id)
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-muted-foreground hover:bg-accent/50"
                        }`}
                    >
                        {value.includes(item.id) && <span className="mr-1.5 text-primary">✓</span>}
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

// Input component
export const InputControl: React.FC<{
    option: InputOption;
    value: string;
    onChange: (id: OptionId, value: string) => void;
}> = ({ option, value, onChange }) => {
    return (
        <div className="mb-4">
            <Label className="block text-sm font-medium mb-1">{option.label}</Label>
            <Input
                type="text"
                value={value}
                placeholder={option.placeholder}
                onChange={(e) => onChange(option.id, e.target.value)}
                className="w-full"
            />
        </div>
    );
};

// This factory helps select the right component based on option type
export const createOptionComponent = (option: any, value: OptionValue, onChange: (id: OptionId, value: OptionValue) => void) => {
    switch (option.type) {
        case "toggle":
            return <ToggleControl key={option.id} option={option} value={value as boolean} onChange={onChange} />;
        case "slider":
            return <SliderControl key={option.id} option={option} value={value as number} onChange={onChange} />;
        case "select":
            return <SelectControl key={option.id} option={option} value={value as string} onChange={onChange} />;
        case "radioGroup":
            return <RadioGroupControl key={option.id} option={option} value={value as string} onChange={onChange} />;
        case "styleButton":
            return (
                <StyleButtonControl key={option.id} option={option} value={value as string} onChange={onChange} isLarge={option.isLarge} />
            );
        case "pillButton":
            return <PillButtonControl key={option.id} option={option} value={value as string} onChange={onChange} />;
        case "multiSelect":
            return <MultiSelectControl key={option.id} option={option} value={value as string[]} onChange={onChange} />;
        case "input":
            return <InputControl key={option.id} option={option} value={value as string} onChange={onChange} />;
        default:
            return null;
    }
};
