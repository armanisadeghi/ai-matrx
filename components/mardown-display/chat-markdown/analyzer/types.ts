import type { JsonValue } from "@/types/json";

// Using the enums you provided
export enum LineCategory {
    HEADER = "header",
    BULLET = "bullet",
    SUB_BULLET = "sub_bullet",
    NUMBERED_LIST = "numbered_list",
    TABLE_ROW = "table_row",
    TABLE_DIVIDER = "table_divider",
    CODE_BLOCK_START = "code_block_start",
    CODE_BLOCK_END = "code_block_end",
    QUOTE = "quote",
    IMAGE = "image",
    LINK = "link",
    BOLD_TEXT = "bold_text",
    ITALIC_TEXT = "italic_text",
    ENTRY_AND_VALUE = "entry_and_value",
    LINE_BREAK = "line_break",
    OTHER_TEXT = "other_text",
}

export enum SegmentType {
    NUMBERED_LIST_MARKER_TEXT = "numbered_list_marker_text",
    BOLD_AND_ITALIC_TEXT = "bold_and_italic_text",
    BOLD_TEXT = "bold_text",
    ITALIC_TEXT = "italic_text",
    INLINE_CODE_TEXT = "inline_code_text",
    LINK_TITLE_TEXT = "link_title_text",
    LINK_URL_TEXT = "link_url_text",
    PLAIN_TEXT = "plain_text",
}

// export enum SectionType {
//     HORIZONTAL_RULE = "horizontal_rule",
//     CODE_BLOCK = "code_block",
//     TABLE = "table",
//     ENTRIES_AND_VALUES = "entries_and_values",
//     HEADER_WITH_BULLETS = "header_with_bullets",
//     HEADER_WITH_NUMBERED_LIST = "header_with_numbered_list",
//     HEADER_WITH_LIST = "header_with_list",
//     HEADER_WITH_TEXT = "header_with_text",
//     HEADER_WITH_TEXT_AND_LISTS = "header_with_text_and_lists",
//     BOLD_TEXT_WITH_SUB_BULLETS = "bold_text_with_sub_bullets",
//     BOLD_TEXT_WITH_MIXED_BULLETS = "bold_text_with_mixed_bullets",
//     PLAIN_TEXT = "plain_text",
//     BARE_HEADER = "bare_header",
//     LIST = "list",
//     TEXT_AND_LIST = "text_and_list",
// }

export interface LineMetadata {
    level: number | null; // Can be null or a number (e.g., 1 for list level)
    code_language: string | null;
    table_rows_count: number | null;
    table_column_count: number | null;
    table_has_numerical_content: boolean | null;
}

// Interface for Line Segmentation
export interface LineSegmentation {
    segments: [SegmentType, string][]; // Array of tuples [type, content]
}

// Interface for a single Line
export interface LineData {
    line: string;
    category: LineCategory;
    metadata: LineMetadata;
    position: number; // Changed from string to number to match data
    clean_line: string;
    segmentation: LineSegmentation;
}

// Interface for Section Analysis Metadata (nested in section.analysis.metadata)
export interface SectionAnalysisMetadata {
    level: number | null;
    code_language: string | null;
    table_rows_count: number | null;
    table_column_count: number | null;
    table_has_numerical_content: boolean | null;
}

// Interface for Section Analysis Content Elements Count
export interface ContentElementsCount {
    [key: string]: number; // Dynamic keys like "other_text", "numbered_list"
}

// Interface for Section Analysis
export interface SectionAnalysis {
    metadata: SectionAnalysisMetadata;
    char_count: number;
    section_type: SectionType;
    content_elements_count: ContentElementsCount;
}

// Interface for a single Section
export interface Section {
    lines: LineData[];
    analysis: SectionAnalysis;
    position: number;
    section_type: SectionType;
}

// Interface for a Section Group
export interface SectionGroup {
    sections: Section[];
    end_position: number;
    pattern_type: string; // e.g., "other_section_group"
    start_position: number;
}

// Interface for Top-Level Analysis
export interface MarkdownAnalysis {
    total_char_count: number;
    avg_section_depth: number;
    total_bullet_count: number;
    total_header_count: number;
    header_level_counts: { [key: string]: number }; // Empty object in your example
    primary_content_type: string; // e.g., "mixed"
    primary_header_level: number;
    total_all_list_items: number;
    total_code_block_count: number;
    total_content_sections: number;
    total_sub_bullet_count: number;
    total_numbered_bullet_count: number;
    content_char_distribution_std: number;
    content_distribution_percentage: number;
    average_list_items_per_content_section: number;
}

// Interface for MarkdownAnalysisData
export interface MarkdownAnalysisData {
    section_groups: SectionGroup[];
    analysis: MarkdownAnalysis;
    related_id: string;
    message_id?: string;
    conversation_id?: string;
}

// NEW SYSTEM

export interface ModelConfig {
    endpoint: string;
    model: string;
    max_tokens?: number;
    conversation_id?: string;
    user_id?: string;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    stop_sequences?: string[];
    tts_voice?: string | { name: string; voice: string }[] | null;
    audio_format?: string | null;
    model_id?: string;
    endpoint_id?: string | null;
    recipe_id?: string | null;
    recipe_version?: string | null;
    // Allow for additional config properties
    [key: string]: JsonValue | undefined;
}

// Known section types - extend this union as needed
export type SectionType =
    | "intro_text"
    | "code_block"
    | "table"
    | "entries_and_values"
    | "header_with_or_without_text"
    | "header_with_list"
    | "header_with_bullets"
    | "header_with_numbered_list"
    | "header_with_text"
    | "numbered_list_without_header"
    | "bold_text_with_sub_bullets"
    | "plain_text"
    | "outro_text"
    | "json_block"
    | "checklist"
    | "other_section_type" // Fallback for unclassified sections
    | string; // Allow for future unknown section types

// Individual classified section
export interface ClassifiedSection {
    section: SectionType;
    content: string[];
    // Optional metadata for sections
    metadata?: {
        [key: string]: JsonValue | undefined;
    };
}

// Main metadata structure
export interface ClassifiedMetadata {
    endpoint?: string;
    model_name?: string;
    config?: ModelConfig;
    classified_output?: ClassifiedSection[];
    // Allow for additional metadata fields
    [key: string]: JsonValue | ClassifiedSection[] | ModelConfig | undefined;
}

// Root response interface
export interface ClassifiedResponse {
    metadata: ClassifiedMetadata;
    // Allow for additional top-level properties
    [key: string]: JsonValue | ClassifiedMetadata | undefined;
}

// Utility types for working with the classified output
export type ContentBySection<T extends SectionType> = {
    [K in T]: string[];
};

// Helper type to extract sections of a specific type
export type SectionsOfType<T extends SectionType> = ClassifiedSection & {
    section: T;
};

// Example usage and type guards
export function isSection<T extends SectionType>(section: ClassifiedSection, sectionType: T): section is SectionsOfType<T> {
    return section.section === sectionType;
}

export function getSectionsByType<T extends SectionType>(classifiedOutput: ClassifiedSection[], sectionType: T): SectionsOfType<T>[] {
    return classifiedOutput.filter((section): section is SectionsOfType<T> => isSection(section, sectionType));
}
