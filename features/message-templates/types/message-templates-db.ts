// Database types for message templates system

export type MessageRole = 'user' | 'system' | 'assistant' | 'tool';

export interface MessageTemplateDB {
    id: string;
    label: string | null;
    content: string | null;
    role: MessageRole | null;
    metadata: Record<string, any> | null;
    /** Canonical platform visibility enum — replaced the legacy `is_public`
     *  boolean when agent.message_template was certified (2026-08-13). */
    visibility: string;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
    tags: string[] | null;
}

// Input types for creating/updating records
export interface CreateMessageTemplateInput {
    label: string;
    content: string;
    role: MessageRole;
    metadata?: Record<string, any>;
    visibility?: string;
    tags?: string[];
}

export interface UpdateMessageTemplateInput extends Partial<CreateMessageTemplateInput> {
    id: string;
}

// Query options
export interface MessageTemplateQueryOptions {
    role?: MessageRole;
    visibility?: string;
    search?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    order_by?: 'label' | 'created_at' | 'updated_at' | 'role';
    order_direction?: 'asc' | 'desc';
}

// API response types
export interface MessageTemplatesResponse {
    templates: MessageTemplateDB[];
    total: number;
}

// Grouped by role
export interface TemplatesByRole {
    [role: string]: MessageTemplateDB[];
}

