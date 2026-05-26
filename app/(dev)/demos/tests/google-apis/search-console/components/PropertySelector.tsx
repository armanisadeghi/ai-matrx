"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Globe, Check, ChevronsUpDown } from "lucide-react";
import { useSearchConsoleAPI } from "../hooks/useSearchConsole";
import type { SiteProperty } from "../types";

interface PropertySelectorProps {
    token: string;
    selectedProperty: SiteProperty | null;
    onSelectProperty: (property: SiteProperty) => void;
}

interface GroupedProperty {
    domain: string;
    properties: SiteProperty[];
}

export function PropertySelector({ token, selectedProperty, onSelectProperty }: PropertySelectorProps) {
    const [properties, setProperties] = useState<SiteProperty[]>([]);
    const [open, setOpen] = useState(false);
    const { fetchProperties, loading, error } = useSearchConsoleAPI(token);

    useEffect(() => {
        loadProperties();
    }, [token]);

    const loadProperties = async () => {
        const props = await fetchProperties();
        setProperties(props);
        // Don't auto-select - let user choose
    };

    // Group properties by domain
    const groupedProperties = useMemo(() => {
        const groups = new Map<string, SiteProperty[]>();

        properties.forEach((prop) => {
            const domain = extractDomain(prop.siteUrl);
            if (!groups.has(domain)) {
                groups.set(domain, []);
            }
            groups.get(domain)!.push(prop);
        });

        // Sort properties within each group: domain property first, then alphabetically
        groups.forEach((props, domain) => {
            props.sort((a, b) => {
                if (a.siteUrl.startsWith('sc-domain:')) return -1;
                if (b.siteUrl.startsWith('sc-domain:')) return 1;
                return a.siteUrl.localeCompare(b.siteUrl);
            });
        });

        // Convert to array and sort by domain name
        return Array.from(groups.entries())
            .map(([domain, properties]) => ({ domain, properties }))
            .sort((a, b) => a.domain.localeCompare(b.domain));
    }, [properties]);

    if (loading && properties.length === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading properties...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-sm text-red-600 dark:text-red-400">
                {error}
            </div>
        );
    }

    if (properties.length === 0) {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400">
                No properties found
            </div>
        );
    }

    const selectedPropertyName = selectedProperty ? formatPropertyName(selectedProperty.siteUrl) : "Select property...";
    const isLongName = selectedPropertyName.length > 40;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="justify-between text-left font-normal w-full max-w-md"
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="truncate">
                                        {selectedPropertyName}
                                    </span>
                                </TooltipTrigger>
                                {isLongName && selectedProperty && (
                                    <TooltipContent 
                                        side="bottom" 
                                        align="start"
                                        className="max-w-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs p-2"
                                    >
                                        {selectedPropertyName}
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search properties..." />
                    <CommandList>
                        <CommandEmpty>No properties found.</CommandEmpty>
                        {groupedProperties.map((group) => (
                            <CommandGroup key={group.domain} heading={group.domain}>
                                {group.properties.map((property) => {
                                    const isSelected = selectedProperty?.siteUrl === property.siteUrl;
                                    return (
                                        <CommandItem
                                            key={property.siteUrl}
                                            value={property.siteUrl}
                                            onSelect={() => {
                                                onSelectProperty(property);
                                                setOpen(false);
                                            }}
                                            className="cursor-pointer"
                                        >
                                            <Check
                                                className={`mr-2 h-4 w-4 flex-shrink-0 ${
                                                    isSelected ? "opacity-100" : "opacity-0"
                                                }`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <TooltipProvider>
                                                    <Tooltip delayDuration={300}>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm truncate">
                                                                    {formatPropertyName(property.siteUrl)}
                                                                </span>
                                                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                                                    {property.siteUrl.startsWith('sc-domain:') ? 'Domain' : 'URL Prefix'}
                                                                </Badge>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent 
                                                            side="right"
                                                            className="max-w-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs p-2"
                                                        >
                                                            {formatPropertyName(property.siteUrl)}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function extractDomain(siteUrl: string): string {
    // Extract domain from various formats
    if (siteUrl.startsWith('sc-domain:')) {
        return siteUrl.replace('sc-domain:', '');
    }
    
    try {
        const url = new URL(siteUrl);
        return url.hostname;
    } catch {
        return siteUrl;
    }
}

function formatPropertyName(siteUrl: string): string {
    if (siteUrl.startsWith('sc-domain:')) {
        return siteUrl.replace('sc-domain:', '') + ' (Domain Property)';
    }
    return siteUrl;
}

