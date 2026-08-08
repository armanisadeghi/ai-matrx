// Database types for content templates system

export type MessageRole = 'user' | 'system' | 'assistant' | 'tool';

export interface ContentTemplateDB {
    id: string;
    label: string | null;
    content: string | null;
    role: MessageRole | null;
    metadata: Record<string, any> | null;
    is_public: boolean;
    user_id: string | null;
    created_at: string;
    updated_at: string | null;
    tags: string[] | null;
}

// Input types for creating/updating records
export interface CreateContentTemplateInput {
    label: string;
    content: string;
    role: MessageRole;
    metadata?: Record<string, any>;
    is_public?: boolean;
    tags?: string[];
}

export interface UpdateContentTemplateInput extends Partial<CreateContentTemplateInput> {
    id: string;
}

// Query options
export interface ContentTemplateQueryOptions {
    role?: MessageRole;
    is_public?: boolean;
    search?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    order_by?: 'label' | 'created_at' | 'updated_at' | 'role';
    order_direction?: 'asc' | 'desc';
}

// API response types
export interface ContentTemplatesResponse {
    templates: ContentTemplateDB[];
    total: number;
}

// Grouped by role
export interface TemplatesByRole {
    [role: string]: ContentTemplateDB[];
}

