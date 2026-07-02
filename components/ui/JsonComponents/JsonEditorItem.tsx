import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Edit, Save, X, Plus, Trash } from 'lucide-react';
import { Input } from "@/components/ui/input";
import type { JsonEditorItemProps } from "./types";
import { jsonUtils } from './newUitls';
import type { JsonValue, JsonObject } from '@/types/json';

const JsonEditorItem: React.FC<JsonEditorItemProps> = ({
    keyName,
    value,
    depth,
    isExpanded,
    onToggle,
    onEdit,
    onAdd,
    onDelete,
    error,
    lockKeys,
    readOnly,
    index,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedKey, setEditedKey] = useState(keyName);
    const [editedValue, setEditedValue] = useState(() => 
        typeof value === 'object' ? '' : jsonUtils.stringify(value, false)
    );

    const isObject = typeof value === 'object' && value !== null;
    const indent = depth * 12;

    const handleEdit = () => {
        if (readOnly) return;
        setIsEditing(true);
        setEditedKey(keyName);
        setEditedValue(typeof value === 'object' ? '' : jsonUtils.stringify(value, false));
    };

    const handleSave = () => {
        if (typeof value === 'object') {
            onEdit(editedKey, value);
            setIsEditing(false);
            return;
        }

        const { data: parsedValue, error } = jsonUtils.parse(editedValue);
        
        if (error) {
            console.error('Invalid JSON:', error);
            return;
        }

        onEdit(editedKey, parsedValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedKey(keyName);
        setEditedValue(typeof value === 'object' ? '' : jsonUtils.stringify(value, false));
    };

    const getValueColor = (val: JsonValue) => {
        if (typeof val === 'string') return "text-emerald-600 dark:text-emerald-400";
        if (typeof val === 'number') return "text-blue-600 dark:text-blue-400";
        if (typeof val === 'boolean') return "text-amber-600 dark:text-amber-400";
        return "text-foreground";
    };

    const asJsonObject = (): JsonObject =>
        typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

    const handleNestedEdit = (k: string, newKey: string, newValue: JsonValue) => {
        const newObj = jsonUtils.transform(asJsonObject(), 'edit', [k], { [newKey]: newValue });
        onEdit(keyName, newObj);
    };

    const handleNestedAdd = (k: string, newKey: string, newValue: JsonValue, index: number) => {
        const newObj = jsonUtils.transform(asJsonObject(), 'add', [String(index)], { [newKey]: newValue });
        onEdit(keyName, newObj);
    };

    const handleNestedDelete = (k: string) => {
        const newObj = jsonUtils.transform(asJsonObject(), 'delete', [k]);
        onEdit(keyName, newObj);
    };

    // IconButton component remains the same
    const IconButton = ({
        icon: Icon,
        onClick,
        color = "text-muted-foreground",
        hoverColor = "hover:text-foreground"
    }: {
        icon: React.ComponentType<{ className?: string }>;
        onClick: () => void;
        color?: string;
        hoverColor?: string;
    }) => (
        <button
            onClick={onClick}
            className={cn(
                "p-0.5 rounded-sm transition-colors",
                color,
                hoverColor,
                "opacity-0 group-hover:opacity-100",
                readOnly && "hidden"
            )}
        >
            <Icon className="h-3.5 w-3.5"/>
        </button>
    );

    const renderValue = (val: JsonValue) => {
        if (typeof val === 'string') return `"${val}"`;
        if (val === null) return 'null';
        if (val === undefined) return 'undefined';
        return String(val);
    };

    return (
        <div
            className={cn(
                "group text-sm",
                error && "bg-destructive/10 rounded-sm"
            )}
            style={{marginLeft: `${indent}px`}}
        >
            {/* Rest of the JSX remains largely the same */}
            <div className="flex items-center py-0.5 hover:bg-muted/50 rounded-sm -ml-1 pl-1">
                {isObject && (
                    <button
                        onClick={onToggle}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                    >
                        {isExpanded ? 
                            <ChevronDown className="h-3 w-3"/> : 
                            <ChevronRight className="h-3 w-3"/>
                        }
                    </button>
                )}

                {isEditing ? (
                    <div className="flex items-center gap-1 flex-1">
                        {!lockKeys && (
                            <Input
                                value={editedKey}
                                onChange={e => setEditedKey(e.target.value)}
                                className="h-6 text-sm px-1 w-auto min-w-[60px]"
                            />
                        )}
                        {!isObject && (
                            <Input
                                value={editedValue}
                                onChange={e => setEditedValue(e.target.value)}
                                className="h-6 text-sm px-1 flex-1"
                            />
                        )}
                        <IconButton
                            icon={Save}
                            onClick={handleSave}
                            color="text-green-600 dark:text-green-400"
                            hoverColor="hover:text-green-700 dark:hover:text-green-300"
                        />
                        <IconButton
                            icon={X}
                            onClick={handleCancel}
                            color="text-red-600 dark:text-red-400"
                            hoverColor="hover:text-red-700 dark:hover:text-red-300"
                        />
                    </div>
                ) : (
                    <div className="flex items-center gap-1 flex-1">
                        <span className="font-medium">{keyName}</span>
                        <span>:</span>
                        {!isObject && (
                            <span
                                className={cn(
                                    "cursor-text px-1 rounded-sm",
                                    getValueColor(value),
                                    !readOnly && "hover:bg-muted"
                                )}
                                onClick={handleEdit}
                            >
                                {renderValue(value)}
                            </span>
                        )}
                        <div className="flex items-center gap-0.5 ml-auto">
                            <IconButton
                                icon={Edit}
                                onClick={handleEdit}
                                color="text-blue-600 dark:text-blue-400"
                                hoverColor="hover:text-blue-700 dark:hover:text-blue-300"
                            />
                            <IconButton
                                icon={Plus}
                                onClick={() => onAdd("newKey", null, index + 1)}
                                color="text-green-600 dark:text-green-400"
                                hoverColor="hover:text-green-700 dark:hover:text-green-300"
                            />
                            <IconButton
                                icon={Trash}
                                onClick={onDelete}
                                color="text-red-600 dark:text-red-400"
                                hoverColor="hover:text-red-700 dark:hover:text-red-300"
                            />
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="text-destructive text-xs mt-0.5 ml-4">{error.message}</div>
            )}

            {isObject && isExpanded && (
                <AnimatePresence>
                    <motion.div
                        initial={{opacity: 0, height: 0}}
                        animate={{opacity: 1, height: 'auto'}}
                        exit={{opacity: 0, height: 0}}
                        transition={{duration: 0.2}}
                    >
                        {Object.entries(asJsonObject()).map(([k, v], i) => (
                            <JsonEditorItem
                                key={k}
                                keyName={k}
                                value={v ?? null}
                                depth={depth + 1}
                                isExpanded={false}
                                onToggle={() => {}}
                                onEdit={(newKey, newValue) => handleNestedEdit(k, newKey, newValue)}
                                onAdd={(newKey, newValue, index) => handleNestedAdd(k, newKey, newValue, index)}
                                onDelete={() => handleNestedDelete(k)}
                                error={error}
                                lockKeys={lockKeys}
                                readOnly={readOnly}
                                index={i}
                            />
                        ))}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default JsonEditorItem;
