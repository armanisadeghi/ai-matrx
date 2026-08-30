import React, { useState } from 'react';
import { Clock } from "lucide-react";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system";

interface TimePickerProps {
    onChange: (time: string) => void;
    value?: string;
    placeholder?: string;
    className?: string;
    buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    is24Hour?: boolean;
}

export const TimePicker: React.FC<TimePickerProps> = ({
                                                          onChange,
                                                          value,
                                                          placeholder = "Pick a time",
                                                          className = "",
                                                          buttonVariant = "outline",
                                                          is24Hour = false,
                                                      }) => {
    const [time, setTime] = useState<string>(value || "");

    const handleTimeChange = (newTime: string) => {
        setTime(newTime);
        onChange(newTime);
    };

    const formatTime = (timeString: string) => {
        if (!timeString) return "";
        try {
            const date = parse(timeString, is24Hour ? "HH:mm" : "hh:mm a", new Date());
            return format(date, is24Hour ? "HH:mm" : "hh:mm a");
        } catch {
            return timeString;
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={buttonVariant}
                    className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !time && "text-muted-foreground",
                        className
                    )}
                >
                    <Clock className="mr-2 h-4 w-4" />
                    {time ? formatTime(time) : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
                <div className="flex flex-col space-y-2">
                    <Input
                        type="time"
                        value={time}
                        onChange={(e) => handleTimeChange(e.target.value)}
                        className="w-full"
                    />
                    {!is24Hour && (
                        <div className="flex justify-between mt-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    const date = parse(time, "HH:mm", new Date());
                                    handleTimeChange(format(date, "hh:mm a"));
                                }}
                            >
                                AM
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    const date = parse(time, "HH:mm", new Date());
                                    const pmDate = new Date(date.setHours(date.getHours() + 12));
                                    handleTimeChange(format(pmDate, "hh:mm a"));
                                }}
                            >
                                PM
                            </Button>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

// Usage example:
export const TimePickerExample: React.FC = () => {
    const [selectedTime, setSelectedTime] = useState<string>("");

    return (
        <TimePicker
            onChange={setSelectedTime}
            value={selectedTime}
            placeholder="Select event time"
            className="w-[300px]"
            buttonVariant="secondary"
            is24Hour={false}
        />
    );
};
