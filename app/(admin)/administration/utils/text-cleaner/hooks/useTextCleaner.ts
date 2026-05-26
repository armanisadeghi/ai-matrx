// hooks/useTextCleaner.ts
import { useState, useCallback, useMemo } from 'react';
import { patterns, ActionConfig, PatternConfig } from "@/app/(admin)/administration/utils/configs/patterns";
import { textContext, TextContextEntry } from "@/app/(admin)/administration/utils/text-cleaner/configs";
import {ErrorSeverity, ErrorFormat, ParsedError, DetailedError, FormattedError} from "../utilities/types";
import { ErrorManager } from '../utilities/ErrorManager';

interface TextCleanerError {
    original: string;
    parsed: FormattedError | null;
    timestamp: number;
}




export function useTextCleaner() {
    const [inputText, setInputText] = useState<string>('');
    const [cleanedText, setCleanedText] = useState<string>('');
    const [removeDuplicates, setRemoveDuplicates] = useState<boolean>(false);
    const [preserveClasses, setPreserveClasses] = useState<boolean>(true);
    const [preserveStyles, setPreserveStyles] = useState<boolean>(true);
    const [preserveDataAttributes, setPreserveDataAttributes] = useState<boolean>(true);
    const [preserveAriaAttributes, setPreserveAriaAttributes] = useState<boolean>(true);
    const [errorMode, setErrorMode] = useState<boolean>(false);
    const [parsedErrors, setParsedErrors] = useState<TextCleanerError[]>([]);
    const [errorFormat, setErrorFormat] = useState<ErrorFormat>('essential');


    // Config states
    const [activePatterns, setActivePatterns] = useState<string[]>(Object.keys(patterns));
    const [config, setConfig] = useState<ActionConfig>({
        remove: Object.keys(patterns).filter(key => patterns[key].replacement === null),
        replace: Object.keys(patterns).filter(key => patterns[key].replacement !== null),
    });

    const [selectedContexts, setSelectedContexts] = useState<TextContextEntry[]>(
        textContext.slice(0, 5).map(entry => entry)
    );
    const [prefixes, setPrefixes] = useState<string[]>(selectedContexts.map(context => context.prefix));
    const [suffixes, setSuffixes] = useState<string[]>(selectedContexts.map(context => context.suffix));

    const findSimilarComponents = useCallback((text: string, selector: string): Map<string, { count: number, indices: number[], examples: string[] }> => {
        const componentMap = new Map<string, { count: number, indices: number[], examples: string[] }>();
        const regex = new RegExp(`(<${selector}[^>]*>)(.*?)(<\/${selector}>)`, 'gis');
        let match;

        while ((match = regex.exec(text)) !== null) {
            const [fullMatch, openTag, content, closeTag] = match;

            // Create signature based on element structure, respecting preservation settings
            let structureSignature = openTag;
            if (!preserveClasses) {
                structureSignature = structureSignature.replace(/\sclass="[^"]*"/g, '');
            }
            if (!preserveStyles) {
                structureSignature = structureSignature.replace(/\sstyle="[^"]*"/g, '');
            }
            if (!preserveDataAttributes) {
                structureSignature = structureSignature.replace(/\sdata-[^=]*="[^"]*"/g, '');
            }
            if (!preserveAriaAttributes) {
                structureSignature = structureSignature.replace(/\saria-[^=]*="[^"]*"/g, '');
            }

            structureSignature = structureSignature.trim();

            const cleanContent = content.replace(/\s+/g, ' ').trim();

            if (componentMap.has(structureSignature)) {
                const existing = componentMap.get(structureSignature)!;
                existing.count++;
                existing.indices.push(match.index);
                if (!existing.examples.includes(cleanContent)) {
                    existing.examples.push(cleanContent);
                }
            } else {
                componentMap.set(structureSignature, {
                    count: 1,
                    indices: [match.index],
                    examples: [cleanContent]
                });
            }
        }

        return componentMap;
    }, [preserveClasses, preserveStyles, preserveDataAttributes, preserveAriaAttributes]);

    const replaceRepeatingElements = useCallback((text: string): string => {
        if (!removeDuplicates) return text;

        let result = text;
        const elementsToCheck = ['button', 'div', 'span', 'p', 'a', 'li', 'tr', 'td'];

        elementsToCheck.forEach(selector => {
            const similarComponents = findSimilarComponents(result, selector);

            similarComponents.forEach((data, signature) => {
                if (data.count > 1) {
                    const structurePattern = signature
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        .replace('>', '>[\\s\\S]*?');

                    const regex = new RegExp(structurePattern + `</${selector}>`, 'g');
                    let found = false;

                    result = result.replace(regex, (match) => {
                        if (!found) {
                            found = true;
                            const comment = `\n<!-- Removed ${data.count - 1} similar ${selector} elements with contents like: ${
                                data.examples
                                    .slice(1, 4)
                                    .map(ex => `"${ex}"`)
                                    .join(', ')
                            }${data.examples.length > 4 ? ', ...' : ''} -->`;
                            return match + comment;
                        }
                        return '';
                    });
                }
            });
        });

        return result;
    }, [removeDuplicates, findSimilarComponents]);

    const cleanText = useCallback((text: string) => {
        let cleaned = text;

        // Apply patterns based on current settings and active patterns
        Object.entries(patterns).forEach(([key, pattern]) => {
            if (!activePatterns.includes(key)) return;

            // Skip patterns based on preservation settings
            if (preserveClasses && key === 'classAttribute') return;
            if (preserveStyles && key === 'styleAttribute') return;
            if (preserveDataAttributes && key.toLowerCase().includes('data-')) return;
            if (preserveAriaAttributes && key.toLowerCase().includes('aria-')) return;

            if (pattern.replacement === null) {
                cleaned = cleaned.replace(pattern.pattern, '');
            } else {
                cleaned = cleaned.replace(pattern.pattern, pattern.replacement);
            }
        });

        // Apply duplicate removal if enabled
        if (removeDuplicates) {
            cleaned = replaceRepeatingElements(cleaned);
        }

        return cleaned;
    }, [activePatterns, preserveClasses, preserveStyles, preserveDataAttributes, preserveAriaAttributes, removeDuplicates, replaceRepeatingElements]);

    const processText = useCallback((text: string) => {
        setCleanedText(cleanText(text));
    }, [cleanText]);

    const handleContextChange = useCallback((index: number, contextId: string) => {
        const newContext = textContext.find(entry => entry.id === contextId);
        if (newContext) {
            setSelectedContexts(prev => {
                const updated = [...prev];
                updated[index] = newContext;
                return updated;
            });
            setPrefixes(prev => {
                const updated = [...prev];
                updated[index] = newContext.prefix;
                return updated;
            });
            setSuffixes(prev => {
                const updated = [...prev];
                updated[index] = newContext.suffix;
                return updated;
            });
        }
    }, []);

    const togglePattern = useCallback((patternKey: string) => {
        setActivePatterns(prev => {
            const isActive = prev.includes(patternKey);
            const newPatterns = isActive
                                ? prev.filter(p => p !== patternKey)
                                : [...prev, patternKey];

            setConfig({
                remove: newPatterns.filter(key => patterns[key].replacement === null),
                replace: newPatterns.filter(key => patterns[key].replacement !== null),
            });

            return newPatterns;
        });
    }, []);

    const extractText = useCallback((text: string): string => {
        let extractedText = '';
        const startMarker = '<start-marker>';
        const endMarker = '<end-marker>';

        let currentIndex = 0;
        while (true) {
            const startIndex = text.indexOf(startMarker, currentIndex);
            if (startIndex === -1) break;

            const endIndex = text.indexOf(endMarker, startIndex);
            if (endIndex === -1) break;

            const extractedContent = text.slice(startIndex + startMarker.length, endIndex);
            if (extractedContent.trim()) {
                extractedText += extractedContent.trim() + '\n';
            }

            currentIndex = endIndex + endMarker.length;
        }

        return extractedText.trim();
    }, []);

    const processErrorText = useCallback((text: string) => {
        try {
            // First, identify complete HTML-formatted errors
            const htmlErrorPattern = /<html>TS\d{4}:.+?(?=(?:<html>TS\d{4}:|$))/gs;
            const plainErrorPattern = /(?<!<html>)TS\d{4}:.+?(?=(?:TS\d{4}:|$))/gs;

            // Collect all errors
            const htmlErrors = [...text.matchAll(htmlErrorPattern)].map(m => m[0]);
            const plainErrors = [...text.matchAll(plainErrorPattern)].map(m => m[0]);

            // Combine all unique errors
            const errorSegments = [...new Set([...htmlErrors, ...plainErrors])]
                .filter(Boolean)
                .map(segment => segment.trim());

            const newErrors: TextCleanerError[] = errorSegments.map(errorText => {
                // Clean up HTML entities before parsing
                const cleanedError = errorText
                    .replace(/<br\s*\/?>/g, '\n')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&apos;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/<html>/g, ''); // Remove the <html> tag completely

                return {
                    original: errorText,
                    parsed: ErrorManager.parseError(cleanedError),
                    timestamp: Date.now()
                };
            });

            setParsedErrors(newErrors);

            // Format errors based on selected format
            const formattedErrors = newErrors
                .map(error => {
                    const formatted = error.parsed?.[errorFormat];
                    if (!formatted) return error.original;

                    // Add separator between errors for better readability
                    return `${formatted}\n${'-'.repeat(40)}`;
                })
                .join('\n\n');

            setCleanedText(formattedErrors);
        } catch (error) {
            console.error('Error parsing error text:', error);
            setCleanedText('Error parsing error text. Please check the format.');
        }
    }, [errorFormat]);

    const handleInputChange = useCallback((text: string) => {
        setInputText(text);
        if (errorMode) {
            processErrorText(text);
        } else {
            processText(text);
        }
    }, [errorMode, processErrorText, processText]);

    const clearErrors = useCallback(() => {
        setParsedErrors([]);
        if (errorMode) {
            setCleanedText('');
        }
    }, [errorMode]);


    const toggleErrorMode = useCallback(() => {
        setErrorMode(prev => {
            const newMode = !prev;
            if (!newMode) {
                clearErrors();
            } else {
                // Process current input as error if there's any
                if (inputText) {
                    processErrorText(inputText);
                }
            }
            return newMode;
        });
    }, [clearErrors, inputText, processErrorText]);

    const changeErrorFormat = useCallback((format: ErrorFormat) => {
        setErrorFormat(format);
        // Reformat existing errors with new format
        if (parsedErrors.length > 0) {
            const formattedErrors = parsedErrors
                .map(error => error.parsed?.[format] || error.original)
                .join('\n\n');
            setCleanedText(formattedErrors);
        }
    }, [parsedErrors]);

    const errorStats = useMemo(() => {
        if (!parsedErrors.length) return null;

        return {
            total: parsedErrors.length,
            byType: parsedErrors.reduce((acc, curr) => {
                const type = curr.parsed?.error.errorType || 'Unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
            bySeverity: parsedErrors.reduce((acc, curr) => {
                const severity = curr.parsed?.error.severity || 'error';
                acc[severity] = (acc[severity] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        };
    }, [parsedErrors]);



    return {
        errorMode,
        errorFormat,
        parsedErrors,
        errorStats,
        toggleErrorMode,
        changeErrorFormat,
        clearErrors,
        setErrorFormat,
        inputText,
        cleanedText,
        prefixes,
        suffixes,
        selectedContexts,
        activePatterns,
        patterns,
        removeDuplicates,
        preserveClasses,
        preserveStyles,
        preserveDataAttributes,
        preserveAriaAttributes,
        setInputText,
        setCleanedText,
        setPrefixes,
        setSuffixes,
        setRemoveDuplicates,
        setPreserveClasses,
        setPreserveStyles,
        setPreserveDataAttributes,
        setPreserveAriaAttributes,
        handleContextChange,
        handleInputChange,
        processText,
        togglePattern,
        extractText
    };
}
