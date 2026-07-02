import React, {useState} from 'react';
import {CalendarIcon} from "lucide-react";
import {format} from "date-fns";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Calendar} from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type {Modifiers} from "react-day-picker";

interface DatePickerProps {
    onChange: (date: Date | undefined) => void;
    value?: Date;
    placeholder?: string;
    className?: string;
    buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    formatString?: string;
    calendarProps?: Omit<React.ComponentProps<typeof Calendar>, 'mode' | 'selected' | 'onSelect'>;
}

export const DatePicker: React.FC<DatePickerProps> = (
    {
        onChange,
        value,
        placeholder = "Pick a date",
        className = "",
        buttonVariant = "outline",
        formatString = "PPP",
        calendarProps = {},
    }) => {
    const [date, setDate] = useState<Date | undefined>(value);

    const handleDateSelect = (
        newDate: Date | undefined,
        _triggerDate: Date,
        _modifiers: Modifiers,
        _e: React.MouseEvent | React.KeyboardEvent,
    ) => {
        setDate(newDate);
        onChange(newDate);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={buttonVariant}
                    className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {date ? format(date, formatString) : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    initialFocus
                    {...calendarProps}
                />
            </PopoverContent>
        </Popover>
    );
};

// Usage example:
export const DatePickerExample: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Date>();

    return (
        <DatePicker
            onChange={setSelectedDate}
            value={selectedDate}
            placeholder="Select event date"
            className="w-[300px]"
            buttonVariant="secondary"
            formatString="dd/MM/yyyy"
        />
    );
};
