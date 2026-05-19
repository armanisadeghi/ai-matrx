// app/entities/fields/field-components/EntityUUIDArray.tsx

import React, { useState } from 'react';
import { X, Plus, Copy, Check, Zap, ChevronDown, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldComponentProps } from "../types";
import { cn } from "@/lib/utils";
import {
    FloatingFieldLabel,
    StandardFieldLabel,
} from "./add-ons/FloatingFieldLabel";
import { useFieldStyles } from "./add-ons/useFieldStyles";

type EntityUUIDArrayProps = FieldComponentProps<string[]>;

const EntityUUIDArray = React.forwardRef<HTMLDivElement, EntityUUIDArrayProps>(
    ({
        entityKey,
        dynamicFieldInfo,
        value,
        onChange,
        disabled,
        className,
        density,
        animationPreset,
        size,
        textSize,
        variant,
        floatingLabel,
    }, ref) => {
        const safeValue = value ?? [];
        const [inputValue, setInputValue] = useState('');
        const [copiedId, setCopiedId] = useState<string | null>(null);

        const showExternal = dynamicFieldInfo.componentProps?.displayMode === 'external';
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        const { getInputStyles } = useFieldStyles({
            variant,
            size,
            density,
            disabled,
            hasValue: safeValue.length > 0,
            isFloating: floatingLabel,
            customStates: {
                "font-mono": true,
                "pr-28": true,
            },
        });

        const generateUUID = () => {
            const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            setInputValue(uuid);
        };

        const handleAdd = (e?: React.MouseEvent) => {
            e?.preventDefault();
            if (!inputValue.trim() || !uuidRegex.test(inputValue)) return;
            if (!safeValue.includes(inputValue)) {
                onChange([...safeValue, inputValue]);
                setInputValue('');
            }
        };

        const handleRemove = (uuid: string, e?: React.MouseEvent) => {
            e?.stopPropagation();
            onChange(safeValue.filter(v => v !== uuid));
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
            }
        };

        const copyToClipboard = async (uuid: string, e?: React.MouseEvent) => {
            e?.stopPropagation();
            try {
                await navigator.clipboard.writeText(uuid);
                setCopiedId(uuid);
                setTimeout(() => setCopiedId(null), 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };

        const renderInput = () => (
            <div className="relative">
                <Input
                    id={dynamicFieldInfo.name}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add UUID..."
                    disabled={disabled}
                    className={getInputStyles}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={generateUUID}
                        disabled={disabled}
                    >
                        <Zap className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAdd()}
                        disabled={disabled || !inputValue}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );

const renderDropdown = !showExternal && safeValue.length > 0 && (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                className="w-full justify-between font-normal mt-1"
                disabled={disabled}
            >
                <div className="flex items-center gap-2">
                    <ListFilter className="h-4 w-4" />
                    <span>{safeValue.length} UUID{safeValue.length !== 1 ? 's' : ''} stored</span>
                </div>
                <ChevronDown className="h-4 w-4" />
            </Button>
        </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {safeValue.map((uuid) => (
                        <DropdownMenuItem
                            key={uuid}
                            className="flex justify-between items-center"
                        >
                            <span className="font-mono truncate flex-1">{uuid}</span>
                            <div className="flex gap-1 ml-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => copyToClipboard(uuid, e)}
                                    disabled={disabled}
                                >
                                    {copiedId === uuid ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleRemove(uuid, e)}
                                    disabled={disabled}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );

        const renderExternalView = showExternal && safeValue.length > 0 && (
            <div className="flex flex-wrap gap-2">
                {safeValue.map((uuid) => (
                    <div
                        key={uuid}
                        className={cn(
                            "bg-secondary text-secondary-foreground px-3 py-1 rounded-md flex items-center gap-2 font-mono",
                            getInputStyles
                        )}
                    >
                        <span className="truncate max-w-48">{uuid}</span>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                onClick={(e) => copyToClipboard(uuid, e)}
                                disabled={disabled}
                            >
                                {copiedId === uuid ? (
                                    <Check className="h-4 w-4" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={(e) => handleRemove(uuid, e)}
                                disabled={disabled}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        );

        return (
            <div ref={ref} className={cn("space-y-2", className)}>
                {floatingLabel ? (
                    <div className="relative mt-1">
                        {renderInput()}
                        <FloatingFieldLabel
                            htmlFor={dynamicFieldInfo.name}
                            disabled={disabled}
                            isFocused={false}
                            hasValue={true}
                        >
                            {dynamicFieldInfo.displayName}
                        </FloatingFieldLabel>
                    </div>
                ) : (
                    <>
                        <StandardFieldLabel
                            htmlFor={dynamicFieldInfo.name}
                            disabled={disabled}
                            required={dynamicFieldInfo.isRequired}
                        >
                            {dynamicFieldInfo.displayName}
                        </StandardFieldLabel>
                        {renderInput()}
                    </>
                )}
                {renderDropdown}
                {renderExternalView}
            </div>
        );
    }
);

EntityUUIDArray.displayName = "EntityUUIDArray";

export default React.memo(EntityUUIDArray);