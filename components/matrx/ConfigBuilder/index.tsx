"use client";
import React, { useState, useRef, useCallback } from "react";
import { Inter } from "next/font/google";
import { AlertCircle, AlignLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import ConfigJSONViewer from "./ConfigJSONViewer";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
const inter = Inter({
    subsets: ["latin"],
    weight: ["200", "300", "400", "500"],
    display: "swap",
});

type ConfigValue = string | number | boolean | object | any[];
type ConfigType = "string" | "number" | "boolean" | "object" | "list";
type KeyDownField = "field" | "type" | "value";

interface Config {
    [key: string]: ConfigValue;
}

interface ConfigBuilderProps {
    initialConfig?: Config;
    onConfigChange?: (config: Config) => void;
    className?: string;
}

const ConfigBuilder = ({ initialConfig, onConfigChange, className }: ConfigBuilderProps) => {
    const [config, setConfig] = useState<Config>(initialConfig || {});
    const [field, setField] = useState("");
    const [type, setType] = useState<ConfigType>("string");
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [deleteKey, setDeleteKey] = useState("");
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [copied, setCopied] = useState(false);

    const typeSelectRef = useRef<HTMLSelectElement>(null);
    // Bound to whichever concrete element renderValueInput() mounts for the
    // current field type (RadioGroup -> div, Textarea, or Input) - only
    // `.focus()` is ever called on it, which all three share.
    const valueInputRef = useRef<HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | null>(null);
    const setValueInputRef = useCallback(
        (el: HTMLDivElement | HTMLInputElement | HTMLTextAreaElement | null) => {
            valueInputRef.current = el;
        },
        [],
    );
    const addButtonRef = useRef<HTMLButtonElement>(null);

    const types: ConfigType[] = ["string", "number", "boolean", "object", "list"];

    const handleKeyDown = (e: React.KeyboardEvent, currentField: KeyDownField) => {
        if (e.key === "Enter" && !e.shiftKey) {
            if (!(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
            }
            switch (currentField) {
                case "field":
                    typeSelectRef.current?.focus();
                    break;
                case "type":
                    valueInputRef.current?.focus();
                    break;
                case "value":
                    if (!(e.target instanceof HTMLTextAreaElement)) {
                        addButtonRef.current?.click();
                    }
                    break;
            }
        }
    };

    const getPlaceholder = () => {
        switch (type) {
            case "string":
                return "Enter string value...";
            case "number":
                return "Enter number value...";
            case "object":
                return '{ "key": "value" }';
            case "list":
                return '["item1", "item2"]';
            default:
                return "Enter value...";
        }
    };

    const formatJSONString = (jsonString: string) => {
        try {
            const parsed = JSON.parse(jsonString);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return jsonString;
        }
    };

    const resetForm = () => {
        setField("");
        setValue("");
        setType("string");
        setIsEditing(false);
        setError("");
    };

    const handleBlur = () => {
        if (type === "object" || type === "list") {
            try {
                const parsed = JSON.parse(value);
                setValue(JSON.stringify(parsed));
            } catch (e) {
                // If parsing fails, leave the value as is
            }
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDelete = () => {
        if (deleteKey) {
            const newConfig = { ...config };
            delete newConfig[deleteKey];

            // Update the state
            setConfig(newConfig);

            // Notify parent of the updated configuration
            if (onConfigChange) {
                onConfigChange(newConfig);
            }

            setDeleteKey("");
            setShowDeleteDialog(false);
        }
    };

    const handleEdit = (key: string) => {
        setField(key);
        const fieldValue = config[key];
        setType(typeof fieldValue === "object" ? (Array.isArray(fieldValue) ? "list" : "object") : (typeof fieldValue as ConfigType));
        setValue(typeof fieldValue === "object" ? JSON.stringify(fieldValue, null, 2) : String(fieldValue));
        setIsEditing(true);
    };

    const handleFormatValue = () => {
        if (type === "object" || type === "list") {
            setValue(formatJSONString(value));
        }
    };

    const validateAndAddField = () => {
        setError("");
        if (!field.trim()) {
            setError("Field name is required");
            return;
        }
        let processedValue: ConfigValue;
        try {
            switch (type) {
                case "string":
                    processedValue = String(value);
                    break;
                case "number":
                    processedValue = Number(value);
                    if (isNaN(processedValue)) throw new Error("Invalid number");
                    break;
                case "boolean":
                    processedValue = value === "true";
                    break;
                case "object":
                case "list":
                    processedValue = JSON.parse(value);
                    if (type === "list" && !Array.isArray(processedValue)) {
                        throw new Error("Not a valid array");
                    }
                    break;
                default:
                    processedValue = value;
            }

            // Create the new configuration with the updated field
            const updatedConfig = {
                ...config,
                [field]: processedValue,
            };

            // Update the state
            setConfig(updatedConfig);

            // Notify parent of the updated configuration
            if (onConfigChange) {
                onConfigChange(updatedConfig);
            }

            resetForm();
        } catch (err) {
            setError(`Invalid ${type} value: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
    };

    const renderValueInput = () => {
        switch (type) {
            case "boolean":
                return (
                    <RadioGroup
                        defaultValue={value}
                        onValueChange={setValue}
                        className="flex gap-3 pl-1"
                        ref={setValueInputRef}
                        onKeyDown={(e) => handleKeyDown(e, "value")}
                    >
                        <div className="flex items-center space-x-1">
                            <RadioGroupItem value="true" id="true" className="h-3 w-3" />
                            <Label htmlFor="true" className="text-xs font-extralight">
                                True
                            </Label>
                        </div>
                        <div className="flex items-center space-x-1">
                            <RadioGroupItem value="false" id="false" className="h-3 w-3" />
                            <Label htmlFor="false" className="text-xs font-extralight">
                                False
                            </Label>
                        </div>
                    </RadioGroup>
                );
            case "object":
            case "list":
                return (
                    <div className="relative">
                        <Textarea
                            ref={setValueInputRef}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={handleBlur}
                            className="h-16 font-mono text-xs p-1"
                            placeholder={getPlaceholder()}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleFormatValue}
                            className="absolute top-0 right-0 h-6 w-6 p-0"
                            title="Format JSON"
                        >
                            <AlignLeft className="h-3 w-3" />
                        </Button>
                    </div>
                );
            default:
                return (
                    <Input
                        ref={setValueInputRef}
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, "value")}
                        className="text-xs h-7"
                        placeholder={getPlaceholder()}
                    />
                );
        }
    };

    return (
        <div
            className={cn(
                `border rounded-lg bg-card text-card-foreground shadow-sm ${inter.className} text-sm font-extralight tracking-tight antialiased h-full`,
                className
            )}
        >
            <div className="flex gap-3 p-2 h-full">
                <div className="w-1/2 space-y-2">
                    <div className="flex gap-1">
                        <Input
                            type="text"
                            value={field}
                            onChange={(e) => setField(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, "field")}
                            className="flex-1 text-xs h-7"
                            placeholder="Field name..."
                            disabled={isEditing}
                        />
                        <Select value={type} onValueChange={(value) => setType(value as ConfigType)}>
                            <SelectTrigger className="w-20 h-7 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {types.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                        {t}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div>{renderValueInput()}</div>
                    
                    {error && (
                        <Alert variant="destructive" className="py-1">
                            <AlertCircle className="h-3 w-3" />
                            <AlertDescription className="text-xs font-extralight">{error}</AlertDescription>
                        </Alert>
                    )}
                    
                    <div className="flex gap-1">
                        <Button
                            ref={addButtonRef}
                            onClick={validateAndAddField}
                            className="flex-1 text-xs h-7"
                            size="sm"
                        >
                            {isEditing ? "Update" : "Add"}
                        </Button>
                        
                        <Select value={deleteKey} onValueChange={(value) => {
                            setDeleteKey(value);
                            if (value) setShowDeleteDialog(true);
                        }}>
                            <SelectTrigger className="flex-1 h-7 text-xs">
                                <SelectValue placeholder="Delete" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(config).map((key) => (
                                    <SelectItem key={key} value={key} className="text-xs">
                                        {key}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <Select value="" onValueChange={(value) => {
                            if (value) handleEdit(value);
                        }}>
                            <SelectTrigger className="flex-1 h-7 text-xs">
                                <SelectValue placeholder="Edit" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(config).map((key) => (
                                    <SelectItem key={key} value={key} className="text-xs">
                                        {key}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <div className="w-1/2">
                    <ConfigJSONViewer data={config} copied={copied} onCopy={copyToClipboard} />
                </div>
            </div>
            
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-normal">Confirm Deletion</AlertDialogTitle>
                        <AlertDialogDescription className="text-sm font-extralight">
                            Are you sure you want to delete the field "{deleteKey}"?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setDeleteKey("")}
                            className="text-sm font-extralight"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="text-sm font-extralight">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ConfigBuilder;
