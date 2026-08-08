// Database types for the content-blocks admin editor.
// Canonical table: skill.render_definition (public.content_blocks retired —
// see scripts/dead-relations.json). Categories: platform.categories
// (dimension 'shortcut', placement_type 'content-block').

export type ContentBlockVisibility =
    | "personal"
    | "internal"
    | "link"
    | "public";

export type ContentBlockBlockType = "render_kind" | "xml" | "markdown";

export interface ContentBlockDB {
    id: string;
    block_id: string;
    label: string;
    description: string | null;
    icon_name: string;
    category_id: string | null; // UUID FK to platform.categories
    skill_id: string | null; // UUID FK to skill.definition
    block_type: ContentBlockBlockType;
    visibility: ContentBlockVisibility;
    template: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface CategoryConfigDB {
    id: string;
    category_id: string;
    label: string;
    icon_name: string;
    color: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SubcategoryConfigDB {
    id: string;
    category_id: string;
    subcategory_id: string;
    label: string;
    icon_name: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Input types for creating/updating records
export interface CreateContentBlockInput {
    block_id: string;
    label: string;
    description?: string;
    icon_name: string;
    category_id: string; // UUID FK to platform.categories
    skill_id?: string | null;
    block_type?: ContentBlockBlockType;
    visibility?: ContentBlockVisibility;
    template: string;
    sort_order?: number;
    is_active?: boolean;
}

export interface UpdateContentBlockInput extends Partial<CreateContentBlockInput> {
    id: string;
}

export interface CreateCategoryConfigInput {
    category_id: string;
    label: string;
    icon_name: string;
    color: string;
    sort_order?: number;
    is_active?: boolean;
}

export interface UpdateCategoryConfigInput extends Partial<CreateCategoryConfigInput> {
    id: string;
}

export interface CreateSubcategoryConfigInput {
    category_id: string;
    subcategory_id: string;
    label: string;
    icon_name: string;
    sort_order?: number;
    is_active?: boolean;
}

export interface UpdateSubcategoryConfigInput extends Partial<CreateSubcategoryConfigInput> {
    id: string;
}

// Structured data types for the frontend
export interface ContentBlockWithHierarchy extends ContentBlockDB {
    category_config?: CategoryConfigDB;
    subcategory_config?: SubcategoryConfigDB;
}

export interface CategoryWithSubcategories extends CategoryConfigDB {
    subcategories: SubcategoryConfigDB[];
    blocks: ContentBlockDB[];
}

// API response types
export interface ContentBlocksResponse {
    categories: CategoryWithSubcategories[];
    total_blocks: number;
    total_categories: number;
}

// Query options
export interface ContentBlockQueryOptions {
    category_id?: string; // UUID
    is_active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    order_by?: 'sort_order' | 'label' | 'created_at' | 'updated_at';
    order_direction?: 'asc' | 'desc';
}
