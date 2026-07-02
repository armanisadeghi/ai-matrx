import React from 'react';
import { ChevronDown, BracketsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArrayItem, InlineArray, ValueDisplay } from './renderers';
import { isSimpleArray } from './utils';
import type { JsonValue } from '@/types/json';

export interface JsonViewerItemProps {
    keyName: string;
    value: JsonValue;
    isExpanded: boolean;
    onToggle: (key: string) => void;
    isKeyExpanded: (key: string) => boolean;
    disabled?: boolean;
    className?: string;
    path: string;
    isLastItem: boolean;
}

const JsonViewerItem: React.FC<JsonViewerItemProps> = ({
    keyName,
    value,
    isExpanded,
    onToggle,
    isKeyExpanded,
    disabled = false,
    className,
    path,
    isLastItem,
}) => {
    const isObject = typeof value === 'object' && value !== null;
    const isArray = Array.isArray(value);
    const hasContent = isObject && Object.keys(value).length > 0;
    const isSmallArray = isArray && isSimpleArray(value as JsonValue[]);

    return (
        <div className={cn(
            "relative",
            !isLastItem && "border-l border-border/30",
            disabled && "opacity-70",
            className
        )}>
            <div
                className={cn(
                    "flex items-center gap-0.5 py-0.5 group transition-colors duration-200",
                    hasContent && !isSmallArray && "cursor-pointer hover:bg-muted"
                )}
                onClick={hasContent && !isSmallArray && !disabled ? () => onToggle(path) : undefined}
            >
                {hasContent && !isSmallArray ? (
                    <div className="flex items-center">
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 transition-transform duration-300 ease-in-out",
                                !isExpanded && "-rotate-90"
                            )}
                        />
                    </div>
                ) : (
                    <div className="w-1"/>
                )}

                <div className="flex-1 flex items-center">
                    <span className={cn(
                        "font-medium text-md transition-colors duration-200",
                        disabled ? "text-muted-foreground" : "text-foreground"
                    )}>
                        {keyName}
                    </span>

                    {isArray && <BracketsIcon className="h-3 w-3 ml-1 text-blue-500 inline transition-colors duration-200"/>}
                    <span className="mx-1">:</span>

                    {!isObject && <ValueDisplay value={value} disabled={disabled} />}

                    {isObject && !hasContent && (
                        <span className="text-md text-muted-foreground italic transition-opacity duration-200">
                            {isArray ? '[]' : '{}'}
                        </span>
                    )}

                    {isSmallArray && hasContent && (
                        <InlineArray arr={value as JsonValue[]} disabled={disabled} />
                    )}

                    {isArray && !isSmallArray && hasContent && !isExpanded && (
                        <span className="text-muted-foreground ml-1 transition-opacity duration-200">
                            [{(value as JsonValue[]).length} items]
                        </span>
                    )}
                </div>
            </div>

            {hasContent && !isSmallArray && (
                <div
                    className={cn(
                        "pl-2 overflow-hidden transition-all duration-300 ease-in-out",
                        isExpanded ? "opacity-100 max-h-[5000px]" : "opacity-0 max-h-0"
                    )}
                >
                    {isArray ? (
                        <div className="flex flex-col border-l border-border/30">
                            {(value as JsonValue[]).map((item: JsonValue, index: number) => (
                                <React.Fragment key={index}>
                                    {typeof item === 'object' && item !== null && !Array.isArray(item) ? (
                                        Object.entries(item).map(([k, v], idx, arr) => (
                                            <JsonViewerItem
                                                key={`${path}.${index}.${k}`}
                                                path={`${path}.${index}.${k}`}
                                                keyName={k}
                                                value={v ?? null}
                                                isExpanded={isKeyExpanded(`${path}.${index}.${k}`)}
                                                onToggle={onToggle}
                                                isKeyExpanded={isKeyExpanded}
                                                disabled={disabled}
                                                isLastItem={idx === arr.length - 1}
                                                className={className}
                                            />
                                        ))
                                    ) : (
                                        <ArrayItem
                                            item={item}
                                            itemPath={`${path}.${index}`}
                                            index={index}
                                            isLastItem={index === (value as JsonValue[]).length - 1}
                                            disabled={disabled}
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    ) : (
                        Object.entries(value as object).map(([k, v], index, arr) => (
                            <JsonViewerItem
                                key={`${path}.${k}`}
                                path={`${path}.${k}`}
                                keyName={k}
                                value={(v as JsonValue) ?? null}
                                isExpanded={isKeyExpanded(`${path}.${k}`)}
                                onToggle={onToggle}
                                isKeyExpanded={isKeyExpanded}
                                disabled={disabled}
                                isLastItem={index === arr.length - 1}
                                className={className}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default JsonViewerItem;
