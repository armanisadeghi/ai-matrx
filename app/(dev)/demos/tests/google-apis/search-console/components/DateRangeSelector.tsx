"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangeSelectorProps {
    startDate: string;
    endDate: string;
    onChange: (range: { startDate: string; endDate: string }) => void;
}

export function DateRangeSelector({ startDate, endDate, onChange }: DateRangeSelectorProps) {
    const presets = [
        { label: "Last 7 days", days: 7 },
        { label: "Last 28 days", days: 28 },
        { label: "Last 3 months", days: 90 },
        { label: "Last 6 months", days: 180 },
    ];

    const getDateDaysAgo = (days: number): string => {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0];
    };

    const handlePresetClick = (days: number) => {
        onChange({
            startDate: getDateDaysAgo(days),
            endDate: getDateDaysAgo(1), // Yesterday
        });
    };

    const formatDateRange = () => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        return `${formatter.format(start)} - ${formatter.format(end)}`;
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-gray-700 dark:text-gray-300"
                >
                    <Calendar className="w-4 h-4" />
                    {formatDateRange()}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 bg-textured border-gray-200 dark:border-gray-700">
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Quick Select
                    </p>
                    {presets.map((preset) => (
                        <button
                            key={preset.days}
                            onClick={() => handlePresetClick(preset.days)}
                            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            {preset.label}
                        </button>
                    ))}
                    <div className="pt-2 border-t border-border">
                        <div className="space-y-2">
                            <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    max={endDate}
                                    onChange={(e) => onChange({ startDate: e.target.value, endDate })}
                                    className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate}
                                    max={getDateDaysAgo(1)}
                                    onChange={(e) => onChange({ startDate, endDate: e.target.value })}
                                    className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

