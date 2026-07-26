import React, { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommonFieldProps } from "./core/types";
import { FieldValidation, useFieldValidation } from "./common/FieldValidation";

const DateField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, placeholder, componentProps, required } = field;
    const { width, customContent, minDate, maxDate } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);
    
    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const updateBrokerValue = useCallback(
        (updatedValue: any) => {
            dispatch(
                brokerActions.setValue({
                    brokerId,
                    value: updatedValue,
                })
            );
        },
        [dispatch, brokerId]
    );
    
    // Use the validation hook
    const { handleBlur, showValidation } = useFieldValidation();
    
    // Process min and max dates
    const processDateLimit = (dateLimit: string): Date | undefined => {
        if (!dateLimit) return undefined;
        if (dateLimit.toLowerCase() === "today") {
            return new Date();
        }
        const parsedDate = new Date(dateLimit);
        return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
    };
    
    const minDateLimit = processDateLimit(minDate);
    const maxDateLimit = processDateLimit(maxDate);
    
    // Handler for date selection
    const handleDateSelect = (date: Date | undefined) => {
        updateBrokerValue(date ? date.toISOString() : null);
    };
    
    // Parse date from state if available
    const selectedDate =
        typeof stateValue === "string" || typeof stateValue === "number"
            ? new Date(stateValue)
            : undefined;
    const isValidDate = selectedDate !== undefined && !isNaN(selectedDate.getTime());
    
    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }
    
    return (
        <div className={`${safeWidthClass} ${className}`} onBlur={handleBlur}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                            "w-full pl-3 text-left font-normal flex items-center justify-between",
                            !isValidDate && "text-muted-foreground"
                        )}
                        disabled={disabled}
                    >
                        <span>{isValidDate ? format(selectedDate, "PPP") : placeholder}</span>
                        <CalendarIcon className="h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={isValidDate ? selectedDate : undefined}
                        onSelect={handleDateSelect}
                        disabled={disabled}
                        fromDate={minDateLimit}
                        toDate={maxDateLimit}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
            
            <FieldValidation
                value={isValidDate ? selectedDate : null}
                required={required}
                showValidation={showValidation}
                fieldType="date"
            />
        </div>
    );
};

export default DateField;
