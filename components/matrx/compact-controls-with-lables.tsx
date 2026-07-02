"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MatrxSwitch } from "@/components/ui/matrx/matrix-switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectOption } from "@/types/componentConfigTypes";

interface BaseControlProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    onClick?: () => void;
    interactive?: boolean;
    className?: string;
    focusRingColor?: string;
}

const BaseControl = React.forwardRef<HTMLDivElement, BaseControlProps>(
    ({ label, icon: Icon, children, onClick, interactive = true, className, focusRingColor = "ring-primary" }, ref) => {
        return (
            <div
                ref={ref}
                onClick={interactive ? onClick : undefined}
                className={cn(
                    "flex flex-col bg-secondary/50 hover:bg-secondary/70 rounded-lg w-[140px] h-12 text-left overflow-hidden select-none",
                    interactive && "cursor-pointer",
                    `focus-visible:outline-none focus-visible:ring-2 focus-visible:${focusRingColor}`,
                    className
                )}
                tabIndex={interactive ? 0 : undefined}
            >
                <div className="flex items-center gap-1.5 px-2 pt-2 min-h-[20px] max-h-[20px]">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] font-medium text-muted-foreground leading-none truncate select-none">{label}</span>
                </div>
                <div className="flex-1 px-2 flex items-center min-h-[28px] max-h-[28px] overflow-hidden">{children}</div>
            </div>
        );
    }
);

BaseControl.displayName = "BaseControl";

interface CompactSelectProps<T extends string | number> {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    focusRingColor?: string;
}

export const CompactSelect = <T extends string | number>({ label, icon, value, options, onChange, className, focusRingColor }: CompactSelectProps<T>) => {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleContainerClick = () => {
        setOpen(true);
    };

    const handleValueChange = (newValue: string) => {
        onChange(newValue as T);
        requestAnimationFrame(() => {
            containerRef.current?.focus();
        });
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            requestAnimationFrame(() => {
                containerRef.current?.focus();
            });
        }
    };

    return (
        <BaseControl label={label} icon={icon} onClick={handleContainerClick} ref={containerRef} className={className} focusRingColor={focusRingColor}>
            <Select open={open} onOpenChange={handleOpenChange} value={value.toString()} onValueChange={handleValueChange}>
                <SelectTrigger
                    className="w-full h-4 min-h-0 text-xs border-0 !bg-transparent hover:!bg-transparent focus:!bg-transparent data-[state=open]:!bg-transparent dark:!bg-transparent px-0 focus:ring-0 focus-visible:ring-0 truncate shadow-none"
                    onClick={(e) => e.stopPropagation()}
                >
                    <SelectValue className="truncate pr-4 text-inherit" />
                </SelectTrigger>
                <SelectContent className="min-w-[140px] max-w-[140px]" position="popper" sideOffset={4}>
                    {options.map((option) => (
                        <SelectItem key={option.key} value={option.value.toString()} className="text-xs py-1 truncate">
                            {option.label.charAt(0).toUpperCase() + option.label.slice(1)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </BaseControl>
    );
};

interface CompactSwitchProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
    focusRingColor?: string;
    accentColor?: string;
}

export const CompactSwitch: React.FC<CompactSwitchProps> = ({ label, icon, checked, onCheckedChange, className, focusRingColor, accentColor = "bg-primary" }) => (
    <BaseControl label={label} icon={icon} onClick={() => onCheckedChange(!checked)} className={className} focusRingColor={focusRingColor}>
        <div className="flex items-center w-full" onClick={(e) => e.stopPropagation()}>
            <MatrxSwitch checked={checked} onCheckedChange={onCheckedChange} className={`data-[state=checked]:${accentColor} h-3 w-6`} />
        </div>
    </BaseControl>
);

interface CompactSliderProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    className?: string;
    focusRingColor?: string;
}

export const CompactSlider: React.FC<CompactSliderProps> = ({ label, icon, value, onChange, min, max, step, className, focusRingColor }) => {
    const [localValue, setLocalValue] = React.useState(value);

    React.useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <BaseControl label={label} icon={icon} interactive={false} className={className} focusRingColor={focusRingColor}>
            <div className="flex items-center gap-1 w-full max-w-full overflow-hidden">
                <Slider
                    value={[localValue]}
                    onValueChange={([val]) => {
                        setLocalValue(val);
                    }}
                    onValueCommit={([val]) => {
                        onChange(val);
                    }}
                    min={min}
                    max={max}
                    step={step}
                    className="w-[100px] max-w-[100px] flex-shrink-0"
                />
                <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right flex-shrink-0">{localValue}%</span>
            </div>
        </BaseControl>
    );
};

interface CompactNumberProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
    focusRingColor?: string;
}

export const CompactNumber: React.FC<CompactNumberProps> = ({ label, icon, value, onChange, min, max, step = 1, className, focusRingColor }) => (
    <BaseControl label={label} icon={icon} interactive={false} className={className} focusRingColor={focusRingColor}>
        <Input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            className="h-4 min-h-0 text-xs border-0 bg-transparent px-0 w-full focus-visible:ring-0"
        />
    </BaseControl>
);

interface CompactTextProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    focusRingColor?: string;
}

export const CompactText: React.FC<CompactTextProps> = ({ label, icon, value, onChange, placeholder, className, focusRingColor }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    return (
        <BaseControl label={label} icon={icon} onClick={() => inputRef.current?.focus()} className={className} focusRingColor={focusRingColor}>
            <Input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-4 min-h-0 text-xs border-0 bg-transparent px-0 w-full focus-visible:ring-0"
                onClick={(e) => e.stopPropagation()}
            />
        </BaseControl>
    );
};

interface CompactRadioProps<T extends string> {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    focusRingColor?: string;
}

export const CompactRadio = <T extends string>({ label, icon, value, options, onChange, className, focusRingColor }: CompactRadioProps<T>) => {
    const handleContainerClick = (optionValue: T) => {
        if (value !== optionValue) {
            onChange(optionValue);
        }
    };

    return (
        <BaseControl label={label} icon={icon} interactive={false} className={className} focusRingColor={focusRingColor}>
            <RadioGroup value={value} onValueChange={onChange} className="flex gap-2">
                {options.map((option) => (
                    <div
                        key={option.key}
                        className="flex items-center space-x-1 cursor-pointer"
                        onClick={() => handleContainerClick(option.value)}
                    >
                        <RadioGroupItem value={option.value} id={option.key} className="h-3 w-3" />
                        <label htmlFor={option.key} className="text-xs text-muted-foreground cursor-pointer select-none">
                            {option.label}
                        </label>
                    </div>
                ))}
            </RadioGroup>
        </BaseControl>
    );
};

interface CompactMultiSelectProps<T extends string> {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: T[];
    options: SelectOption<T>[];
    onChange: (value: T[]) => void;
    className?: string;
    focusRingColor?: string;
}

export const CompactMultiSelect = <T extends string>({ label, icon, value, options, onChange, className, focusRingColor }: CompactMultiSelectProps<T>) => {
    const [open, setOpen] = React.useState(false);

    const handleContainerClick = () => {
        setOpen(true);
    };

    return (
        <BaseControl label={label} icon={icon} onClick={handleContainerClick} className={className} focusRingColor={focusRingColor}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className="h-4 text-xs w-full flex items-center justify-between rounded px-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <span className="truncate">{value.length === 0 ? "Select..." : `${value.length} selected`}</span>
                        <ChevronDownIcon className="h-3 w-3 opacity-50" />
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search..." className="h-8" />
                        <CommandEmpty>No options found.</CommandEmpty>
                        <CommandGroup className="max-h-[200px] overflow-auto">
                            {options.map((option) => (
                                <CommandItem
                                    key={option.key}
                                    value={option.value}
                                    onSelect={() => {
                                        onChange(
                                            value.includes(option.value)
                                                ? value.filter((v) => v !== option.value)
                                                : [...value, option.value]
                                        );
                                    }}
                                >
                                    <CheckIcon className={cn("mr-2 h-3 w-3", value.includes(option.value) ? "opacity-100" : "opacity-0")} />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </Command>
                </PopoverContent>
            </Popover>
        </BaseControl>
    );
};

interface CompactTimeProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: string;
    onChange: (value: string) => void;
    className?: string;
    focusRingColor?: string;
}

export const CompactTime: React.FC<CompactTimeProps> = ({ label, icon, value, onChange, className, focusRingColor }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    return (
        <BaseControl label={label} icon={icon} onClick={() => inputRef.current?.focus()} className={className} focusRingColor={focusRingColor}>
            <Input
                ref={inputRef}
                type="time"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-4 min-h-0 text-xs border-0 bg-transparent px-0 w-full focus-visible:ring-0"
                onClick={(e) => e.stopPropagation()}
            />
        </BaseControl>
    );
};
