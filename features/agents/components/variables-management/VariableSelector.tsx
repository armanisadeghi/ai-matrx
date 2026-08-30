import React from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

interface VariableSelectorProps {
    variables: string[];
    onVariableSelected: (variable: string) => void;
    onBeforeOpen?: () => void;
}

export function VariableSelector({
    variables,
    onVariableSelected,
    onBeforeOpen,
}: VariableSelectorProps) {
    const [popoverOpen, setPopoverOpen] = React.useState(false);

    return (
        <Popover 
            open={popoverOpen} 
            onOpenChange={(open) => {
                if (open) {
                    onBeforeOpen?.();
                }
                setPopoverOpen(open);
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => {
                        // Prevent textarea from losing focus
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <Braces className="w-3.5 h-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="min-w-56 max-w-[calc(100vw-2rem)] sm:max-w-md w-max p-2" 
                align="start"
            >
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {variables.length === 0 ? (
                        <div className="text-xs text-muted-foreground px-2 py-2 italic">
                            No variables defined
                        </div>
                    ) : (
                        variables.map((variable) => (
                            <Button
                                key={variable}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 px-2 text-xs text-foreground hover:bg-accent whitespace-nowrap"
                                onClick={() => {
                                    onVariableSelected(variable);
                                    setPopoverOpen(false);
                                }}
                            >
                                <span className="font-mono">{variable}</span>
                            </Button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

