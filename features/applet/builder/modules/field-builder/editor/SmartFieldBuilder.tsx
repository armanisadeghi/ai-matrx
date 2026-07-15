"use client";

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import SmartOptionsManager from "./SmartOptionsManager";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectFieldById } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import {
    setLabel,
    setDescription,
    setHelpText,
    setPlaceholder,
    setRequired,
    setComponent,
    setIncludeOther,
    setComponentProps,
    startFieldCreation,
} from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { fieldHelpTextItems } from "../fieldHelpText";
import { Broker } from "@/types/customAppTypes";
import HelpIcon from "@/components/official/HelpIcon";
import { componentOptions } from "@/features/applet/constants/field-constants";

interface SmartFieldBuilderProps {
    fieldId: string;
    broker?: Broker;
}

export const SmartFieldBuilder: React.FC<SmartFieldBuilderProps> = ({ fieldId, broker }) => {
    const dispatch = useAppDispatch();

    // Redux selectors for field properties
    const field = useAppSelector((state) => selectFieldById(state, fieldId));
    const [autoSetLabel, setAutoSetLabel] = useState<boolean>(false);

    // Ensure field exists
    useEffect(() => {
        if (!field) {
            dispatch(startFieldCreation({ id: fieldId }));
        }
    }, [fieldId, field, dispatch]);

    useEffect(() => {
        if ((field?.label === "" && broker) || (autoSetLabel && broker)) {
            dispatch(setLabel({ id: fieldId, label: broker.name }));
            setAutoSetLabel(true);
        }
    }, [autoSetLabel, broker, dispatch, field?.label, fieldId]);


    if (!field) {
        return <div className="p-4">Loading field...</div>;
    }

    const {
        component,
        label,
        description,
        helpText,
        placeholder,
        required,
        includeOther,
        componentProps,
    } = field;

    const hasOptions = ["select", "multiselect", "radio", "checkbox", "button"].includes(component || "");

    const canHaveOther = ["select", "multiselect", "radio", "checkbox", "button"].includes(component || "");

    return (
        <div className="py-3 px-2 space-y-4">
            <div>
                <div className="flex items-center gap-1">
                    <Label htmlFor="component" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Component Type
                    </Label>
                </div>
                <Select
                    value={component || "textarea"}
                    onValueChange={(value) => {
                        const option = componentOptions.find((candidate) => candidate.value === value);
                        if (option) dispatch(setComponent({ id: fieldId, component: option.value }));
                    }}
                >
                    <SelectTrigger className="border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 mt-1">
                        <SelectValue placeholder="Select component type" />
                    </SelectTrigger>
                    <SelectContent>
                        {[...componentOptions]
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <div className="flex items-center gap-1">
                    <Label htmlFor="label" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Label
                    </Label>
                    <HelpIcon text={fieldHelpTextItems.label} />
                </div>
                <Input
                    id="label"
                    name="label"
                    value={label || ""}
                    onChange={(e) => dispatch(setLabel({ id: fieldId, label: e.target.value }))}
                    className="border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 mt-1 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            <div>
                <div className="flex items-center gap-1">
                    <Label htmlFor="description" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Description
                    </Label>
                    <HelpIcon text={fieldHelpTextItems.description} />
                </div>
                <Textarea
                    id="description"
                    name="description"
                    value={description}
                    onChange={(e) => dispatch(setDescription({ id: fieldId, description: e.target.value }))}
                    rows={3}
                    className="resize-none border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 mt-1 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            <div>
                <div className="flex items-center gap-1">
                    <Label htmlFor="helpText" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Help Text
                    </Label>
                    <HelpIcon text={fieldHelpTextItems.helpText} />
                </div>
                <Textarea
                    id="helpText"
                    name="helpText"
                    value={helpText}
                    onChange={(e) => dispatch(setHelpText({ id: fieldId, helpText: e.target.value }))}
                    rows={3}
                    className="resize-none border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 mt-1 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            <div>
                <div className="flex items-center gap-1">
                    <Label htmlFor="placeholder" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Placeholder
                    </Label>
                    <HelpIcon text={fieldHelpTextItems.placeholder} />
                </div>
                <Input
                    id="placeholder"
                    name="placeholder"
                    value={placeholder}
                    onChange={(e) => dispatch(setPlaceholder({ id: fieldId, placeholder: e.target.value }))}
                    className="border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 mt-1 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            <div className="flex items-center space-x-2 pl-1">
                <Checkbox
                    id="required"
                    checked={required}
                    onCheckedChange={(checked) => dispatch(setRequired({ id: fieldId, required: !!checked }))}
                />
                <Label htmlFor="required" className="text-gray-800 dark:text-gray-200">
                    Required
                </Label>
                <HelpIcon text={fieldHelpTextItems.required} />
            </div>

            {/* Include "Other" option checkbox for applicable component types */}
            {canHaveOther && (
                <div className="flex items-center space-x-2 pl-1">
                    <Checkbox
                        id="includeOther"
                        checked={includeOther}
                        onCheckedChange={(checked) => dispatch(setIncludeOther({ id: fieldId, includeOther: !!checked }))}
                    />
                    <Label htmlFor="includeOther" className="text-gray-800 dark:text-gray-200">
                        Allow "Other" Text Input
                    </Label>
                    <HelpIcon text={fieldHelpTextItems.includeOther} />
                </div>
            )}

            {/* Switch component specific properties */}
            {component === "switch" && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="onLabel" className="text-xs text-gray-700 dark:text-gray-300">
                                ON Label
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.onLabel} />
                        </div>
                        <Input
                            id="onLabel"
                            name="onLabel"
                            value={componentProps.onLabel || "Yes"}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            onLabel: e.target.value,
                                        },
                                    })
                                )
                            }
                            className="h-8 mt-1 text-sm border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            placeholder="Yes"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="offLabel" className="text-xs text-gray-700 dark:text-gray-300">
                                OFF Label
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.offLabel} />
                        </div>
                        <Input
                            id="offLabel"
                            name="offLabel"
                            value={componentProps.offLabel || "No"}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            offLabel: e.target.value,
                                        },
                                    })
                                )
                            }
                            className="h-8 mt-1 text-sm border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            placeholder="No"
                        />
                    </div>
                </div>
            )}

            {(component === "rangeSlider" || component === "slider" || component === "number" || component === "numberPicker") && (
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="min" className="text-xs text-gray-700 dark:text-gray-300">
                                Min
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.min} />
                        </div>
                        <Input
                            type="number"
                            id="min"
                            name="min"
                            value={componentProps.min}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            min: parseFloat(e.target.value),
                                        },
                                    })
                                )
                            }
                            className="h-8 mt-1 text-sm border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="max" className="text-xs text-gray-700 dark:text-gray-300">
                                Max
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.max} />
                        </div>
                        <Input
                            type="number"
                            id="max"
                            name="max"
                            value={componentProps.max}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            max: parseFloat(e.target.value),
                                        },
                                    })
                                )
                            }
                            className="h-8 mt-1 text-sm border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="step" className="text-xs text-gray-700 dark:text-gray-300">
                                Step
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.step} />
                        </div>
                        <Input
                            type="number"
                            id="step"
                            name="step"
                            value={componentProps.step}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            step: parseFloat(e.target.value),
                                        },
                                    })
                                )
                            }
                            className="h-8 mt-1 text-sm border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                    </div>
                </div>
            )}

            {(component === "textarea" || component === "multiselect") && (
                <div>
                    <div className="flex items-center gap-1">
                        <Label htmlFor="rows" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Rows
                        </Label>
                        <HelpIcon text={fieldHelpTextItems.rows} />
                    </div>
                    <div className="flex items-center mt-1 border rounded-md border-gray-200 dark:border-gray-700 bg-textured">
                        <button
                            type="button"
                            onClick={() => {
                                const currentRows = componentProps.rows || 3;
                                if (currentRows > 1) {
                                    dispatch(
                                        setComponentProps({
                                            id: fieldId,
                                            componentProps: {
                                                ...componentProps,
                                                rows: currentRows - 1,
                                            },
                                        })
                                    );
                                }
                            }}
                            className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-l-md"
                            aria-label="Decrease rows"
                        >
                            <span className="text-lg">−</span>
                        </button>
                        <div className="flex-1 px-3 py-2 text-center text-gray-900 dark:text-gray-100">{componentProps.rows || 3} rows</div>
                        <button
                            type="button"
                            onClick={() => {
                                const currentRows = componentProps.rows || 3;
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            rows: currentRows + 1,
                                        },
                                    })
                                );
                            }}
                            className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-r-md"
                            aria-label="Increase rows"
                        >
                            <span className="text-lg">+</span>
                        </button>
                    </div>
                </div>
            )}

            {component === "date" && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="minDate" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Min Date
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.minDate} />
                        </div>
                        <Input
                            type="date"
                            id="minDate"
                            name="minDate"
                            value={componentProps.minDate || ""}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            minDate: e.target.value,
                                        },
                                    })
                                )
                            }
                            className="mt-1 border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-1">
                            <Label htmlFor="maxDate" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Max Date
                            </Label>
                            <HelpIcon text={fieldHelpTextItems.maxDate} />
                        </div>
                        <Input
                            type="date"
                            id="maxDate"
                            name="maxDate"
                            value={componentProps.maxDate || ""}
                            onChange={(e) =>
                                dispatch(
                                    setComponentProps({
                                        id: fieldId,
                                        componentProps: {
                                            ...componentProps,
                                            maxDate: e.target.value,
                                        },
                                    })
                                )
                            }
                            className="mt-1 border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                    </div>
                </div>
            )}
            {/* Options management for select, multiselect, radio, checkbox */}
            {hasOptions && <SmartOptionsManager fieldId={fieldId} />}
        </div>
    );
};

export default SmartFieldBuilder;
