"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";

// Import the shadcn/ui components
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommonFieldProps } from "./core/types";

// Interface for phone number data
interface PhoneData {
    countryCode: string;
    number: string;
}

// Common country codes
const COMMON_COUNTRY_CODES = [
  { code: "+1", country: "US/Canada" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+33", country: "France" },
  { code: "+49", country: "Germany" },
  { code: "+81", country: "Japan" },
  { code: "+86", country: "China" },
  { code: "+91", country: "India" },
  { code: "+52", country: "Mexico" },
  { code: "+55", country: "Brazil" },
  { code: "+34", country: "Spain" },
  { code: "+39", country: "Italy" },
  { code: "+82", country: "South Korea" },
  { code: "+7", country: "Russia" },
  { code: "+31", country: "Netherlands" },
  { code: "+20", country: "Egypt" },
  { code: "+27", country: "South Africa" },
  { code: "+46", country: "Sweden" },
  { code: "+47", country: "Norway" },
  { code: "+45", country: "Denmark" },
  { code: "+32", country: "Belgium" },
  { code: "+41", country: "Switzerland" },
  { code: "+90", country: "Turkey" },
  { code: "+62", country: "Indonesia" },
  { code: "+63", country: "Philippines" },
  { code: "+66", country: "Thailand" },
  { code: "+65", country: "Singapore" },
  { code: "+60", country: "Malaysia" },
  { code: "+64", country: "New Zealand" },
  { code: "+92", country: "Pakistan" },
  { code: "+98", country: "Iran" },
  { code: "+972", country: "Israel" },
  { code: "+961", country: "Lebanon" },
  { code: "+962", country: "Jordan" },
  { code: "+964", country: "Iraq" },
  { code: "+965", country: "Kuwait" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+973", country: "Bahrain" },
  { code: "+974", country: "Qatar" },
  { code: "+975", country: "Bhutan" },
  { code: "+976", country: "Mongolia" },
  { code: "+977", country: "Nepal" },
  { code: "+880", country: "Bangladesh" },
  { code: "+94", country: "Sri Lanka" },
  { code: "+93", country: "Afghanistan" },
  { code: "+856", country: "Laos" },
  { code: "+855", country: "Cambodia" },
  { code: "+84", country: "Vietnam" },
  { code: "+95", country: "Myanmar" },
  // Add more as needed
];

const PhoneNumberField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "Phone number", componentProps, required } = field;

    const { width, customContent } = componentProps;

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

    // Local state for phone number
    const [phone, setPhone] = useState<PhoneData>({
        countryCode: "+1", // Default to US/Canada
        number: "",
    });

    // Track if fields have been touched for validation
    const [touched, setTouched] = useState({
        countryCode: false,
        number: false,
    });

    // Initialize from state value
    useEffect(() => {
        if (stateValue) {
            if (typeof stateValue === "string") {
                // If it's a string, try to parse it
                const match = stateValue.match(/^(\+\d+)?\s*(.*)$/);
                if (match) {
                    setPhone({
                        countryCode: match[1] || "+1",
                        number: match[2] || "",
                    });
                } else {
                    setPhone({
                        countryCode: "+1",
                        number: stateValue,
                    });
                }
            } else if (typeof stateValue === "object") {
                // If it's already an object, use it directly
                setPhone((prevPhone) => ({
                    ...prevPhone,
                    ...stateValue,
                }));
            }
        } else if (field.defaultValue) {
            // Handle default value
            if (typeof field.defaultValue === "string") {
                const match = field.defaultValue.match(/^(\+\d+)?\s*(.*)$/);
                if (match) {
                    const initialPhone = {
                        countryCode: match[1] || "+1",
                        number: match[2] || "",
                    };
                    setPhone(initialPhone);

                    // Update state
                    updateBrokerValue(initialPhone);
                } else {
                    const initialPhone = {
                        countryCode: "+1",
                        number: field.defaultValue,
                    };
                    setPhone(initialPhone);

                    // Update state
                    updateBrokerValue(initialPhone);
                }
            } else if (typeof field.defaultValue === "object") {
                setPhone((prevPhone) => ({
                    ...prevPhone,
                    ...field.defaultValue,
                }));

                // Update state
                updateBrokerValue({
                    ...phone,
                    ...field.defaultValue,
                });
            }
        }
    }, [dispatch, field.defaultValue, id, stateValue]);

    // Handle country code change
    const handleCountryCodeChange = (value: string) => {
        if (disabled) return;

        const updatedPhone = {
            ...phone,
            countryCode: value,
        };

        setPhone(updatedPhone);
        setTouched((prev) => ({ ...prev, countryCode: true }));

        // Update state
        updateBrokerValue(updatedPhone);
    };

    // Handle phone number change
    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;

        const value = e.target.value;

        // Allow any input - no formatting or validation as per requirements
        const updatedPhone = {
            ...phone,
            number: value,
        };

        setPhone(updatedPhone);
        setTouched((prev) => ({ ...prev, number: true }));

        // Update state
        updateBrokerValue(updatedPhone);
    };

    // Handle blur event
    const handleBlur = (field: keyof PhoneData) => {
        setTouched((prev) => ({
            ...prev,
            [field]: true,
        }));
    };

    // Check validation
    const getNumberError = () => {
        if (required && touched.number && !phone.number) {
            return "Phone number is required";
        }
        return null;
    };

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="flex flex-wrap gap-2">
                {/* Country Code Dropdown */}
                <div className="w-48">
                    <Select value={phone.countryCode} onValueChange={handleCountryCodeChange} disabled={disabled}>
                        <SelectTrigger className="focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured">
                            <SelectValue placeholder="Code" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                            {COMMON_COUNTRY_CODES.map((country) => (
                                <SelectItem key={country.code} value={country.code}>
                                    {country.code} {country.country}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Phone Number Input */}
                <div className="flex-1 min-w-[200px]">
                    <Input
                        id={`${id}-number`}
                        placeholder={placeholder}
                        value={phone.number}
                        onChange={handleNumberChange}
                        onBlur={() => handleBlur("number")}
                        disabled={disabled}
                        className={cn(
                            "focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured",
                            getNumberError() && "border-red-500"
                        )}
                    />
                    {getNumberError() && <div className="text-red-500 text-xs mt-1">{getNumberError()}</div>}
                </div>
            </div>
        </div>
    );
};

export default PhoneNumberField;
