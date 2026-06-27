// features/rich-text-editor/types/editor.types.ts
import { BrokerDataOptional, DataBrokerDataOptional } from '@/types/AutomationSchemaTypes';
import { MatrxRecordId } from '@/types/records';
import { RefObject } from 'react';
import { TailwindColor } from '../constants/rich-text-constants';

export interface LayoutMetadata {
    position: string | number;
    isVisible: boolean;
    type?: string;
}

export type MatrxStatus = 'new' | 'active' | 'disconnected' | 'deleted' | 'fetched' | string;

export interface BrokerMetaData {
    matrxRecordId?: string;
    name?: string;
    defaultValue?: string;
    color?: string;
    status?: MatrxStatus;
    defaultComponent?: string;
    dataType?: string;
    id?: string;
    [key: string]: string | undefined;
}

export type ContentMode = 'encodeChips' | 'encodeVisible' | 'name' | 'defaultValue' | 'recordKey' | 'status';

export interface EditorState {
    content: string;
    initialized: boolean;
    contentMode: ContentMode;
    chipData: ChipData[];
    metadata?: BrokerMetaData[];
    layout?: LayoutMetadata;
}

// Base Types
export interface ChipRequestOptions {
    matrxRecordId?: string;
    name?: string;
    defaultValue?: string;
    color?: string;
    status?: MatrxStatus;
    defaultComponent?: string;
    dataType?: string;
    id?: string;
    label?: string;
    stringValue?: string;
    brokerId?: MatrxRecordId;
}

export interface ChipData {
    id: string;
    label: string;
    color?: string;
    stringValue?: string;
    brokerId?: MatrxRecordId;
    editorId?: MatrxRecordId;
}

export interface TextStyle {
    command: string;
    value?: string | null;
}

export interface EditorInstanceState {
    ref: RefObject<HTMLDivElement>;
    state: EditorState;
    plainTextContent: string; // Regular text with chip placeholders MATRX_PATTERN = /<<<MATRX_START>>>(.*?)<<<MATRX_END>>>/gs;
    fullTextContent: string; // Text with actual chip values inserted
    chipData: ChipData[];
    brokerAssociations: Map<string, Set<string>>; // chipId -> Set of brokerIds
}

// Event Handler Types
export interface DOMEventHandlers {
    handleNativeDragStart: (e: DragEvent) => void;
    handleNativeDragEnd: (e: DragEvent) => void;
}

export interface ReactEventHandlers {
    handleDragOver: (e: React.DragEvent<HTMLElement>) => void;
    handleDrop: (e: React.DragEvent<HTMLElement>) => void;
}

// Content Types
export interface ContentInput {
    type: 'plain' | 'withChips' | 'withBrokers';
    content: string;
    chips?: ChipData[];
    brokerMappings?: Map<string, MatrxRecordId>;
}

// Provider Types
export interface EditorProviderState {
    editors: Map<string, EditorInstanceState>;
    globalChips: Map<string, ChipData>;
    globalBrokers: Map<string, Set<string>>;
}

export interface ChipVerificationResult {
    mismatches: Array<{ chipId: string; domContent: string; stateContent: string }>;
    orphanedChips: string[];
    missingChips: string[];
}

export type EditorStateUpdate =
    | { type: 'updateColorAssignments'; id: string; color: string }
    | { type: 'addChip'; chip: ChipData }
    | { type: 'removeChip'; chipId: string }
    | { type: 'updateContent'; content: string }
    | { type: 'updateContent'; content: string }
    | { type: 'incrementChipCounter' }
    | { type: 'applyStyle'; style: TextStyle };

export interface ColorOption {
    color: TailwindColor;
    className: string;
}

export interface DOMSnapshot {
    selection: {
        anchorNode: Node | null;
        focusNode: Node | null;
        anchorOffset: number;
        focusOffset: number;
        isCollapsed: boolean;
    };
    range: {
        startOffset: number;
        endOffset: number;
        startContainer: Node;
        endContainer: Node;
        commonAncestorContainer: Node;
    };
    editor: {
        activeElement: Element | null;
        editorNode: HTMLElement;
        currentContainer: Node;
        caretPosition: number;
    };
}
