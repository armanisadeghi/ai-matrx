import React, {useState, useRef, useEffect, useCallback} from 'react';
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Loader2, Search, X} from "lucide-react";
import {cn} from "@/lib/utils";

export interface SearchBarProps {
    onSearch?: (query: string) => void;
    loading?: boolean;
    placeholder?: string;
    defaultValue?: string;
    className?: string;
    inputClassName?: string;
    buttonClassName?: string;
    debounceTime?: number;
    showClearButton?: boolean;
    autoFocus?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = (
    {
        onSearch,
        loading = false,
        placeholder = "Search...",
        defaultValue = "",
        className,
        inputClassName,
        buttonClassName,
        debounceTime = 300,
        showClearButton = true,
        autoFocus = false,
        onFocus,
        onBlur,
    }) => {
    const [query, setQuery] = useState(defaultValue);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const debouncedSearch = useCallback(
        debounce((q: string) => {
            onSearch && onSearch(q);
        }, debounceTime),
        [onSearch, debounceTime]
    );

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        debouncedSearch(newQuery);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch && onSearch(query);
    };

    const handleClear = () => {
        setQuery("");
        onSearch && onSearch("");
        inputRef.current?.focus();
    };

    const handleFocus = () => {
        setIsFocused(true);
        inputRef.current?.select();
        onFocus && onFocus();
    };

    const handleBlur = () => {
        setIsFocused(false);
        onBlur && onBlur();
    };

    return (
        <form onSubmit={handleSubmit} className={cn("flex items-center space-x-2", className)}>
            <div className="relative flex-grow">
                <Input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    className={cn(
                        "pr-10",
                        isFocused && "ring-2 ring-primary",
                        inputClassName
                    )}
                />
                {showClearButton && query && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                        <X className="h-4 w-4 text-muted-foreground"/>
                    </button>
                )}
            </div>
            <Button
                type="submit"
                disabled={loading}
                className={cn(buttonClassName)}
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin"/>
                ) : (
                    <Search className="h-4 w-4"/>
                )}
            </Button>
        </form>
    );
};

function debounce<A extends unknown[]>(
    func: (...args: A) => void,
    wait: number
): (...args: A) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: A) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export default SearchBar;
