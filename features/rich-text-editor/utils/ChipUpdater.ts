import { MatrxRecordId } from '@/types/records';

import { cn } from '@/lib/utils';
import { getColorClassName } from './colorUitls';
import { CHIP_BASE_CLASS, TailwindColor } from '@/constants/rich-text-constants';
import { ChipData } from '@/types/editor.types';

// Full type definition for chip updates
export interface ChipUpdateData {
    id?: string;
    label?: string;
    stringValue?: string;
    brokerId?: MatrxRecordId;
    color?: TailwindColor;
    contentEditable?: boolean;
    draggable?: boolean;
}

export interface UpdateResult {
    success: boolean;
    updated: number;
    error?: string;
}

// Type guard to check if an element is a chip
const isChipElement = (element: Element): element is HTMLSpanElement => {
    return element.getAttribute('data-chip') === 'true';
};

/**
 * Updates a chip's visual and data attributes consistently
 */
const updateChipAttributes = (element: HTMLSpanElement, updates: ChipUpdateData): void => {
    // Handle special cases first
    if (updates.contentEditable !== undefined) {
        element.contentEditable = updates.contentEditable.toString();
    }

    if (updates.draggable !== undefined) {
        element.setAttribute('draggable', updates.draggable.toString());
    }

    // Handle color update with class management
    if (updates.color) {
        const newColorClass = getColorClassName(updates.color);
        const currentClasses = element.className.split(' ');
        const baseClasses = 'inline-flex items-center px-2 py-1 mx-1 rounded-md cursor-move';

        // Remove existing color classes and apply new ones
        const updatedClasses = currentClasses.filter((cls) => !cls.includes('-300') && !cls.includes('-800')).join(' ');

        element.className = cn(baseClasses, newColorClass);
    }

    // Update data attributes and ensure text content stays synchronized
    Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && key !== 'color' && key !== 'contentEditable' && key !== 'draggable') {
            element.setAttribute(`data-chip-${key}`, value.toString());

            // Synchronize text content with label if it's updated
            if (key === 'label') {
                element.textContent = value.toString();
            }
        }
    });
};

/**
 * Updates a specific chip by its ID within a specific editor
 */
export const updateChipById = (editorElement: HTMLDivElement, chipId: string, updates: ChipUpdateData): UpdateResult => {
    const chipElement = editorElement.querySelector(`[data-chip-id="${chipId}"]`);

    if (!chipElement || !isChipElement(chipElement)) {
        return { success: false, updated: 0, error: 'Chip not found or invalid' };
    }

    try {
        updateChipAttributes(chipElement, updates);
        return { success: true, updated: 1 };
    } catch (error) {
        return {
            success: false,
            updated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
};

export const updateChipToBrokerId = (
    editorElement: HTMLDivElement,
    chipId: string,
    brokerId: MatrxRecordId
): UpdateResult => {
    return updateChipById(editorElement, chipId, {
        id: brokerId,
        brokerId: brokerId
    });
};

/**
 * Updates all chips with a specific broker ID within a specific editor
 */
export const updateChipsByBrokerId = (editorElement: HTMLDivElement, brokerId: MatrxRecordId, updates: ChipUpdateData): UpdateResult => {
    const chipElements = editorElement.querySelectorAll(`[data-broker-id="${brokerId}"]`);
    let updatedCount = 0;

    if (!chipElements.length) {
        return { success: false, updated: 0, error: 'No chips found' };
    }

    try {
        chipElements.forEach((element) => {
            if (isChipElement(element)) {
                updateChipAttributes(element, updates);
                updatedCount++;
            }
        });

        return { success: true, updated: updatedCount };
    } catch (error) {
        return {
            success: false,
            updated: updatedCount,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
};

/**
 * Updates a specific chip by its ID across all editors
 */
export const updateChipByIdGlobal = (chipId: string, updates: ChipUpdateData): UpdateResult => {
    const chipElement = document.querySelector(`[data-chip-id="${chipId}"]`);

    if (!chipElement || !isChipElement(chipElement)) {
        return { success: false, updated: 0, error: 'Chip not found or invalid' };
    }

    try {
        updateChipAttributes(chipElement, updates);
        return { success: true, updated: 1 };
    } catch (error) {
        return {
            success: false,
            updated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
};

/**
 * Updates all chips with a specific broker ID across all editors
 */
export const updateChipsByBrokerIdGlobal = (brokerId: MatrxRecordId, updates: ChipUpdateData): UpdateResult => {
    const chipElements = document.querySelectorAll(`[data-broker-id="${brokerId}"]`);
    let updatedCount = 0;

    if (!chipElements.length) {
        return { success: false, updated: 0, error: 'No chips found' };
    }

    try {
        chipElements.forEach((element) => {
            if (isChipElement(element)) {
                updateChipAttributes(element, updates);
                updatedCount++;
            }
        });

        return { success: true, updated: updatedCount };
    } catch (error) {
        return {
            success: false,
            updated: updatedCount,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
};

/*
// Update a single chip's color and label
updateChipById(editorElement, 'chip-123', {
    color: 'blue',
    label: 'New Label'
});

// Update all chips with a specific broker ID
updateChipsByBrokerIdGlobal('broker-456', {
    brokerId: 'new-broker-id',
    color: 'red'
});

// Update multiple attributes at once
updateChipByIdGlobal('chip-789', {
    label: 'Updated Label',
    stringValue: 'New Content',
    color: 'green',
    draggable: false
});
*/

export type ChipUpdateSync = {
    success: boolean;
    error?: string;
    updated?: number;
};

export type ChipDeleteSync = {
    success: boolean;
    error?: string;
    deleted: boolean;
};

// Using ColorOption from your existing types
export class ChipSyncManager {
    private getChipElement(editorId: string, chipId: string): HTMLSpanElement | null {
        const editor = document.querySelector(`[data-editor-id="${editorId}"]`);
        if (!editor) return null;

        const chipElement = editor.querySelector(`[data-chip-id="${chipId}"]`);
        return (chipElement as HTMLSpanElement) || null;
    }

    private getEditorElement(editorId: string): HTMLDivElement | null {
        return (document.querySelector(`[data-editor-id="${editorId}"]`) as HTMLDivElement) || null;
    }

    private updateChipDOM(element: HTMLSpanElement, updates: Partial<ChipData>): void {
        // Handle basic attributes
        if (updates.id) {
            element.setAttribute('data-chip-id', updates.id);
        }

        if (updates.label) {
            element.setAttribute('data-chip-label', updates.label);
            element.textContent = updates.label;
        }

        if (updates.stringValue) {
            element.setAttribute('data-chip-original-content', updates.stringValue);
        }

        if (updates.brokerId) {
            element.setAttribute('data-broker-id', updates.brokerId as MatrxRecordId);
        }

        // Handle color update using our single source of truth
        if (updates.color) {
            const newColorClass = getColorClassName(updates.color);
            element.className = cn(CHIP_BASE_CLASS, newColorClass);
        }
    }

    syncStateToDOM = (editorId: string, chipId: string, updates: Partial<ChipData>): ChipUpdateSync => {
        try {
            const chipElement = this.getChipElement(editorId, chipId);

            if (!chipElement) {
                return {
                    success: false,
                    error: `Chip element not found: ${chipId} in editor ${editorId}`,
                    updated: 0,
                };
            }

            this.updateChipDOM(chipElement, updates);
            return { success: true, updated: 1 };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during sync',
                updated: 0,
            };
        }
    };

    syncStateByBrokerId = (editorId: string, brokerId: MatrxRecordId, updates: Partial<ChipData>): ChipUpdateSync => {
        try {
            const editor = this.getEditorElement(editorId);
            if (!editor) {
                return {
                    success: false,
                    error: `Editor not found: ${editorId}`,
                    updated: 0,
                };
            }

            const chipElements = editor.querySelectorAll(`[data-broker-id="${brokerId}"]`);
            let updatedCount = 0;

            chipElements.forEach((element) => {
                if (element instanceof HTMLSpanElement && element.getAttribute('data-chip') === 'true') {
                    this.updateChipDOM(element, updates);
                    updatedCount++;
                }
            });

            return {
                success: updatedCount > 0,
                updated: updatedCount,
                error: updatedCount === 0 ? 'No chips found with specified broker ID' : undefined,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during sync',
                updated: 0,
            };
        }
    };

    syncStateGlobal = (chipId: string, updates: Partial<ChipData>): ChipUpdateSync => {
        try {
            const chipElement = document.querySelector(`[data-chip-id="${chipId}"]`);

            if (!chipElement || !(chipElement instanceof HTMLSpanElement) || chipElement.getAttribute('data-chip') !== 'true') {
                return {
                    success: false,
                    error: 'Chip not found or invalid',
                    updated: 0,
                };
            }

            this.updateChipDOM(chipElement, updates);
            return { success: true, updated: 1 };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during sync',
                updated: 0,
            };
        }
    };

    syncStateByBrokerIdGlobal = (brokerId: MatrxRecordId, updates: Partial<ChipData>): ChipUpdateSync => {
        try {
            const chipElements = document.querySelectorAll(`[data-broker-id="${brokerId}"]`);
            let updatedCount = 0;

            chipElements.forEach((element) => {
                if (element instanceof HTMLSpanElement && element.getAttribute('data-chip') === 'true') {
                    this.updateChipDOM(element, updates);
                    updatedCount++;
                }
            });

            return {
                success: updatedCount > 0,
                updated: updatedCount,
                error: updatedCount === 0 ? 'No chips found with specified broker ID' : undefined,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during sync',
                updated: 0,
            };
        }
    };

    private getChipStructure(editorId: string, chipId: string): HTMLSpanElement | null {
        const editor = document.querySelector(`[data-editor-id="${editorId}"]`);
        if (!editor) return null;

        const structureId = `chip-structure-${chipId}`;
        const structure = editor.querySelector(`[data-structure-id="${structureId}"]`);

        return (structure as HTMLSpanElement) || null;
    }

    private validateChipStructure(structure: HTMLSpanElement): boolean {
        // Ensure we have all required parts of a chip structure
        const hasContainer = !!structure.querySelector('[data-chip-container="true"]');
        const hasSpaces = !!structure.querySelector('[data-chip-space="true"]');
        const hasAnchor = !!structure.querySelector('[data-chip-anchor="true"]');
        const hasChip = !!structure.querySelector('[data-chip="true"]');

        return hasContainer && hasSpaces && hasAnchor && hasChip;
    }

    private logStructureDetails(structure: HTMLSpanElement, prefix: string = '') {
        const lines = structure.innerHTML.split('\n');
        const charCount = structure.innerHTML.length;
        const structureContent = structure.outerHTML;

        console.group(`${prefix} Structure Details`);
        console.log('Element ID:', structure.getAttribute('data-structure-id'));
        console.log('Total Lines:', lines.length);
        console.log('Total Characters:', charCount);
        console.log('Child Elements:', structure.children.length);
        console.log('Structure Content:', structureContent);

        // Log all data attributes
        const dataAttrs = Array.from(structure.attributes)
            .filter((attr) => attr.name.startsWith('data-'))
            .map((attr) => `${attr.name}="${attr.value}"`);
        console.log('Data Attributes:', dataAttrs);

        // Log immediate children with their attributes
        Array.from(structure.children).forEach((child, index) => {
            console.log(`Child ${index}:`, {
                tag: child.tagName,
                class: child.className,
                dataAttrs: Array.from(child.attributes)
                    .filter((attr) => attr.name.startsWith('data-'))
                    .map((attr) => `${attr.name}="${attr.value}"`),
            });
        });
        console.groupEnd();

        return { lines: lines.length, chars: charCount, content: structureContent };
    }

    deleteChip = (editorId: string, chipId: string): ChipDeleteSync => {
        try {
            console.group(`Deleting Chip: ${chipId} from Editor: ${editorId}`);
            const structure = this.getChipStructure(editorId, chipId);

            if (!structure) {
                console.warn('Structure not found');
                console.groupEnd();
                return {
                    success: false,
                    error: `Chip structure not found: ${chipId} in editor ${editorId}`,
                    deleted: false,
                };
            }

            // Log structure before deletion
            console.log('Found structure, analyzing before deletion:');
            const details = this.logStructureDetails(structure, 'Pre-deletion');

            if (!this.validateChipStructure(structure)) {
                console.warn('Invalid structure detected');
                console.log('Validation failed for structure:', structure.outerHTML);
                console.groupEnd();
                return {
                    success: false,
                    error: `Invalid chip structure found for chip: ${chipId}`,
                    deleted: false,
                };
            }

            // Get parent information before removal
            const parent = structure.parentElement;
            const parentChildCount = parent?.children.length || 0;
            console.log('Parent element before deletion:', {
                tag: parent?.tagName,
                childCount: parentChildCount,
                nextSibling: structure.nextElementSibling?.tagName || 'none',
                previousSibling: structure.previousElementSibling?.tagName || 'none',
            });

            // Perform removal
            structure.remove();

            // Verify removal
            const postParentChildCount = parent?.children.length || 0;
            console.log('Removal verification:', {
                parentStillExists: !!parent,
                childrenRemoved: parentChildCount - postParentChildCount,
                remainingChildren: postParentChildCount,
            });

            console.log(`Successfully removed ${details.lines} lines, ${details.chars} characters`);
            console.groupEnd();

            return {
                success: true,
                deleted: true,
            };
        } catch (error) {
            console.error('Error during deletion:', error);
            console.groupEnd();
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during deletion',
                deleted: false,
            };
        }
    };

    deleteChipGlobal = (chipId: string): ChipDeleteSync => {
        try {
            const structureId = `chip-structure-${chipId}`;
            const structure = document.querySelector(`[data-structure-id="${structureId}"]`);

            if (!structure || !(structure instanceof HTMLSpanElement)) {
                return {
                    success: false,
                    error: 'Chip structure not found',
                    deleted: false,
                };
            }

            if (!this.validateChipStructure(structure as HTMLSpanElement)) {
                return {
                    success: false,
                    error: `Invalid chip structure found for chip: ${chipId}`,
                    deleted: false,
                };
            }

            structure.remove();
            return { success: true, deleted: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during deletion',
                deleted: false,
            };
        }
    };

    deleteChipsByBrokerId = (editorId: string, brokerId: MatrxRecordId): ChipDeleteSync => {
        try {
            const editor = this.getEditorElement(editorId);
            if (!editor) {
                return {
                    success: false,
                    error: `Editor not found: ${editorId}`,
                    deleted: false,
                };
            }

            const chips = editor.querySelectorAll(`[data-broker-id="${brokerId}"]`);
            let deletedCount = 0;

            chips.forEach((chip) => {
                const structure = chip.closest('[data-structure-id]');
                if (structure && structure instanceof HTMLSpanElement && this.validateChipStructure(structure)) {
                    structure.remove();
                    deletedCount++;
                }
            });

            return {
                success: deletedCount > 0,
                deleted: deletedCount > 0,
                error: deletedCount === 0 ? 'No valid chips found to delete' : undefined,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error during deletion',
                deleted: false,
            };
        }
    };
}

export const chipSyncManager = new ChipSyncManager();

export const createEnhancedUpdateChipData = (baseUpdateChipData: (editorId: string, chipId: string, updates: Partial<ChipData>) => void) => {
    return (editorId: string, chipId: string, updates: Partial<ChipData>) => {
        baseUpdateChipData(editorId, chipId, updates);
        const syncResult = chipSyncManager.syncStateToDOM(editorId, chipId, updates);

        if (!syncResult.success) {
            console.error('Failed to sync chip DOM:', syncResult.error);
        }
    };
};

export const createEnhancedDeleteChip = (baseDeleteChip: (editorId: string, chipId: string) => void) => {
    return (editorId: string, chipId: string) => {
        baseDeleteChip(editorId, chipId);
        const deleteResult = chipSyncManager.deleteChip(editorId, chipId);

        if (!deleteResult.success) {
            console.error('Failed to delete chip from DOM:', deleteResult.error);
        }
    };
};
