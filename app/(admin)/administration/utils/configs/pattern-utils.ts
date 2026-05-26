// utils/pattern-utils.ts
import { patterns, PatternConfig } from './patterns';

export type PatternCategory = {
    title: string;
    patterns: string[];
};

export type PatternType = 'remove' | 'replace' | 'attribute' | 'content' | 'event';

// Function to categorize patterns based on their characteristics
export function categorizePatterns(patterns: Record<string, PatternConfig>): PatternCategory[] {
    const categories = new Map<string, string[]>();

    Object.entries(patterns).forEach(([key, config]) => {
        let category: string;

        // Determine category based on pattern characteristics
        if (key.toLowerCase().includes('attribute') || key.includes('class') || key.includes('style')) {
            category = 'HTML Attributes';
        } else if (key.toLowerCase().includes('entity')) {
            category = 'Basic Entity Handling';
        } else if (key.toLowerCase().includes('tag') || key.includes('content') || key.includes('svg')) {
            category = 'Content Elements';
        } else if (key.toLowerCase().includes('event') || key.toLowerCase().includes('click')) {
            category = 'Event Handlers';
        } else {
            category = 'Other Patterns';
        }

        if (!categories.has(category)) {
            categories.set(category, []);
        }
        categories.get(category)!.push(key);
    });

    return Array.from(categories.entries())
        .map(([title, patterns]) => ({ title, patterns }))
        .sort((a, b) => a.title.localeCompare(b.title));
}

