'use client';

import { usePathname, useSearchParams } from 'next/navigation';

const DEFAULT_NAME_REPLACE_MAP = {
    'api': 'API',
    'ui': 'UI',
    'url': 'URL',
    'qr': 'QR',
};

// Helper function to apply word replacements
function applyWordReplacements(text: string, replaceMap: Record<string, string> = DEFAULT_NAME_REPLACE_MAP) {
    let formatted = text;
    Object.entries(replaceMap).forEach(([key, value]) => {
        // Create a regex that matches the key as a whole word (case insensitive)
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        formatted = formatted.replace(regex, value as string);
    });
    return formatted;
}

export function getCurrentParsedPathName() {
    const pathName = usePathname();
    const segments = pathName.split('/').filter(Boolean);
    
    const result = segments.map((segment, index) => {
        const toTitleCase = (str: string) => {
            // First apply standard transformations
            let formatted = str
                .replace(/[_-]/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
            
            // Then apply special word replacements
            formatted = applyWordReplacements(formatted);
            
            return formatted;
        };

        const href = '/' + segments.slice(0, index + 1).join('/');
        const name = toTitleCase(segment);

        return {
            href,
            id: segment,
            name,
            isLast: index === segments.length - 1,
        };
    });

    return result;
}

export function getParsedSearchParams() {
    const searchParams = useSearchParams();
    const result: { key: string; value: string; encoded: string }[] = [];

    searchParams.forEach((value, key) => {
        result.push({
            key,
            value,
            encoded: encodeURIComponent(`${key}=${value}`),
        });
    });

    return result;
}

export function getParsedPathNameAndSearchParams() {
    const parsedPathName = getCurrentParsedPathName();
    const parsedSearchParams = getParsedSearchParams();

    return {
        pathName: parsedPathName,
        searchParams: parsedSearchParams,
    };
}

// New function for customized replacement map usage
export function getCurrentParsedPathNameWithCustomReplacements(customReplaceMap: Record<string, string>) {
    const pathName = usePathname();
    const segments = pathName.split('/').filter(Boolean);
    
    // Merge default and custom replace maps
    const replaceMap = { ...DEFAULT_NAME_REPLACE_MAP, ...customReplaceMap };
    
    const result = segments.map((segment, index) => {
        const toTitleCase = (str: string) => {
            // First apply standard transformations
            let formatted = str
                .replace(/[_-]/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
            
            // Then apply special word replacements with custom map
            formatted = applyWordReplacements(formatted, replaceMap);
            
            return formatted;
        };

        const href = '/' + segments.slice(0, index + 1).join('/');
        const name = toTitleCase(segment);

        return {
            href,
            id: segment,
            name,
            isLast: index === segments.length - 1,
        };
    });

    return result;
}

// New function for customized path and search params
export function getParsedPathNameAndSearchParamsWithCustomReplacements(customReplaceMap: Record<string, string>) {
    const parsedPathName = getCurrentParsedPathNameWithCustomReplacements(customReplaceMap);
    const parsedSearchParams = getParsedSearchParams();

    return {
        pathName: parsedPathName,
        searchParams: parsedSearchParams,
    };
}