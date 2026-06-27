import { MatrxRecordId } from '@/types/records';
import { ChipData } from '@/types/editor.types';

export interface ChipSearchResult extends Omit<ChipData, 'color'> {
    editorId?: string;
}

/**
 * Finds a chip by its unique ID within a specific editor instance
 * @param editorElement The editor DOM element to search within
 * @param chipId The unique ID of the chip to find
 * @returns The chip data if found, null otherwise
 */
export const findChipById = (editorElement: HTMLDivElement, chipId: string): ChipSearchResult | null => {
    const chipElement = editorElement.querySelector(`[data-chip-id="${chipId}"]`);

    if (!chipElement) return null;

    return {
        id: chipElement.getAttribute('data-chip-id') || '',
        label: chipElement.getAttribute('data-chip-label') || '',
        stringValue: chipElement.getAttribute('data-chip-original-content') || '',
        brokerId: (chipElement.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
    };
};

/**
 * Finds all chips with a specific broker ID within a specific editor instance
 * @param editorElement The editor DOM element to search within
 * @param brokerId The broker ID to search for
 * @returns Array of chip data for all matching chips
 */
export const findChipsByBrokerId = (editorElement: HTMLDivElement, brokerId: MatrxRecordId): ChipSearchResult[] => {
    const chipElements = editorElement.querySelectorAll(`[data-broker-id="${brokerId}"]`);

    return Array.from(chipElements).map((element) => ({
        id: element.getAttribute('data-chip-id') || '',
        label: element.getAttribute('data-chip-label') || '',
        stringValue: element.getAttribute('data-chip-original-content') || '',
        brokerId: (element.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
    }));
};

/**
 * Finds a chip by its unique ID across all editor instances on the page
 * @param chipId The unique ID of the chip to find
 * @returns The chip data including editor ID if found, null otherwise
 */
export const findChipByIdGlobal = (chipId: string): ChipSearchResult | null => {
    const chipElement = document.querySelector(`[data-chip-id="${chipId}"]`);

    if (!chipElement) return null;

    // Find the parent editor element
    const editorElement = chipElement.closest('[data-editor-id]');

    return {
        id: chipElement.getAttribute('data-chip-id') || '',
        label: chipElement.getAttribute('data-chip-label') || '',
        stringValue: chipElement.getAttribute('data-chip-original-content') || '',
        brokerId: (chipElement.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
        editorId: editorElement?.getAttribute('data-editor-id'),
    };
};

/**
 * Finds all chips with a specific broker ID across all editor instances on the page
 * @param brokerId The broker ID to search for
 * @returns Array of chip data including editor IDs for all matching chips
 */
export const findChipsByBrokerIdGlobal = (brokerId: MatrxRecordId): ChipSearchResult[] => {
    const chipElements = document.querySelectorAll(`[data-broker-id="${brokerId}"]`);

    return Array.from(chipElements).map((element) => {
        const editorElement = element.closest('[data-editor-id]');

        return {
            id: element.getAttribute('data-chip-id') || '',
            label: element.getAttribute('data-chip-label') || '',
            stringValue: element.getAttribute('data-chip-original-content') || '',
            brokerId: (element.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
            editorId: editorElement?.getAttribute('data-editor-id'),
        };
    });
};

/**
 * Validates that a chip element contains all required data attributes
 * @param element The chip DOM element to validate
 * @returns boolean indicating whether the chip is valid
 */
export const isValidChipElement = (element: Element): boolean => {
    const requiredAttributes = ['data-chip-id', 'data-chip-label', 'data-broker-id'];
    return requiredAttributes.every((attr) => element.hasAttribute(attr));
};

/**
 * Retrieves all chips within a specific editor instance
 * @param editorElement The editor DOM element to search within
 * @returns Array of chip data for all chips in the editor
 */
export const getAllChipsInEditor = (editorElement: HTMLDivElement): ChipSearchResult[] => {
    const chipElements = editorElement.querySelectorAll('[data-chip="true"]');

    return Array.from(chipElements)
        .filter(isValidChipElement)
        .map((element) => ({
            id: element.getAttribute('data-chip-id') || '',
            label: element.getAttribute('data-chip-label') || '',
            stringValue: element.getAttribute('data-chip-original-content') || '',
            brokerId: (element.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
        }));
};

/**
 * Retrieves all chips across all editor instances on the page
 * @returns Array of chip data including editor IDs for all chips
 */
export const getAllChipsGlobal = (): ChipSearchResult[] => {
    const chipElements = document.querySelectorAll('[data-chip="true"]');

    return Array.from(chipElements)
        .filter(isValidChipElement)
        .map((element) => {
            const editorElement = element.closest('[data-editor-id]');

            return {
                id: element.getAttribute('data-chip-id') || '',
                label: element.getAttribute('data-chip-label') || '',
                stringValue: element.getAttribute('data-chip-original-content') || '',
                brokerId: (element.getAttribute('data-broker-id') as MatrxRecordId) || 'disconnected',
                editorId: editorElement?.getAttribute('data-editor-id'),
            };
        });
};

/**
 * Returns a unique list of all broker IDs currently in use
 * @param editorElement Optional editor element to scope the search
 * @returns Array of unique broker IDs
 */
export const getUniqueBrokerIds = (editorElement?: HTMLDivElement): string[] => {
    const chips = editorElement ? getAllChipsInEditor(editorElement) : getAllChipsGlobal();
    return Array.from(new Set(chips.map((chip) => chip.brokerId)));
};

/**
 * Returns the total count of chips
 * @param editorElement Optional editor element to scope the search
 * @returns Number of chips found
 */
export const getChipCount = (editorElement?: HTMLDivElement): number => {
    const chips = editorElement ? getAllChipsInEditor(editorElement) : getAllChipsGlobal();
    return chips.length;
};

export interface ChipDistribution {
    brokerId: string;
    totalChips: number;
    editorDistribution: {
        [editorId: string]: number;
    };
}

/**
 * Analyzes the distribution of chips across brokers and editors
 * @returns Array of broker distributions
 */
export const analyzeChipDistribution = (): ChipDistribution[] => {
    const chips = getAllChipsGlobal();
    const distribution = new Map<string, ChipDistribution>();

    chips.forEach((chip) => {
        const editorId = chip.editorId || 'unknown';
        const brokerId = chip.brokerId;

        if (!distribution.has(brokerId)) {
            distribution.set(brokerId, {
                brokerId,
                totalChips: 0,
                editorDistribution: {},
            });
        }

        const brokerData = distribution.get(brokerId)!;
        brokerData.totalChips++;
        brokerData.editorDistribution[editorId] = (brokerData.editorDistribution[editorId] || 0) + 1;
    });

    return Array.from(distribution.values());
};

export interface RecoveredContent {
    originalContent: string;
    contentType: 'plaintext' | 'code' | 'markdown' | 'unknown';
    metadata: {
        chipId: string;
        brokerId: string;
        editorId?: string;
    };
}

/**
 * Recovers the original string value from chips with special handling for different content types
 * @param chipId ID of the chip to recover content from
 * @returns RecoveredContent object containing the original content and metadata
 */
export const recoverChipContent = (chipId: string): RecoveredContent | null => {
    const chip = findChipByIdGlobal(chipId);
    if (!chip || !chip.stringValue) return null;

    const content = chip.stringValue;
    let contentType: RecoveredContent['contentType'] = 'plaintext';

    // Detect content type
    if (content.includes('```') || content.match(/^[ \t]*[\w-]+\s*\([^)]*\)\s*{/m)) {
        contentType = 'code';
    } else if (content.includes('#') || content.match(/\[.*\]\(.*\)/) || content.match(/[*_]{1,2}.*[*_]{1,2}/)) {
        contentType = 'markdown';
    } else if (content.match(/[<>{}\[\]]/)) {
        // Additional check for potential structured content
        contentType = 'unknown';
    }

    return {
        originalContent: content,
        contentType,
        metadata: {
            chipId: chip.id,
            brokerId: chip.brokerId,
            editorId: chip.editorId,
        },
    };
};

/**
 * Gets all unique editor IDs from the page
 * @returns Array of editor IDs and their labels
 */
export const getAllEditors = (): Array<{ id: string; label: string }> => {
    const editors = document.querySelectorAll('[data-editor-id]');
    return Array.from(editors).map(editor => ({
        id: editor.getAttribute('data-editor-id') || '',
        label: editor.getAttribute('data-editor-label') || editor.getAttribute('data-editor-id') || ''
    }));
};

/**
 * Gets all text content for chips associated with a broker ID
 * @param brokerId The broker ID to get content for
 * @returns Formatted text content with metadata
 */
export interface FormattedBrokerContent {
    brokerId: string;
    chips: Array<{
        chipId: string;
        editorId?: string;
        content: string;
        formattedContent: string;
    }>;
    combinedContent: string;
}

export const getBrokerContent = (brokerId: string): FormattedBrokerContent => {
    const chips = findChipsByBrokerIdGlobal(brokerId);
    
    const processedChips = chips.map(chip => {
        const content = chip.stringValue || '';
        const formattedContent = formatContent(content);
        
        return {
            chipId: chip.id,
            editorId: chip.editorId,
            content,
            formattedContent
        };
    });

    return {
        brokerId,
        chips: processedChips,
        combinedContent: processedChips.map(chip => chip.formattedContent).join('\n\n')
    };
};

/**
 * Formats content with proper line breaks and basic formatting
 * @param content The raw content string
 * @returns Formatted content string
 */
export const formatContent = (content: string): string => {
    if (!content) return '';
    
    // Replace escaped newlines with actual newlines
    let formatted = content.replace(/\\n/g, '\n');
    
    // Handle code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
        return `\n${code.trim()}\n`;
    });
    
    // Handle line breaks in markdown
    formatted = formatted.replace(/\n{3,}/g, '\n\n'); // Normalize multiple line breaks
    
    // Handle basic markdown without modifying the content
    formatted = formatted.replace(/\r\n/g, '\n');
    
    return formatted.trim();
};

/**
 * Gets filtered chips based on selected editor
 * @param editorId The editor ID to filter by, or 'all' for global
 * @returns Filtered chip data
 */
export const getFilteredChips = (editorId: string | 'all'): ChipSearchResult[] => {
    if (editorId === 'all') {
        return getAllChipsGlobal();
    }
    
    const editor = document.querySelector(`[data-editor-id="${editorId}"]`) as HTMLDivElement;
    return editor ? getAllChipsInEditor(editor) : [];
};