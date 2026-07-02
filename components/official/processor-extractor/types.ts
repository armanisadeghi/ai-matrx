// UI navigation path segment (tuple for row index and key)
export type PathSegment = [number, string];
export type PathArray = PathSegment[];

// JSON path segment for parsed path components
export interface JsonPathSegment {
    type: "key" | "index";
    value: string | number;
}


// Type information for data at a path
export interface TypeInfo {
    type: string;
    subtype: string | null;
    depth: number;
    isEmpty: boolean;
    count: number;
}

export interface PathWithTypeInfo extends TypeInfo {
    path: string;
    readibleType: string;
}

// Unified bookmark interface
export interface Bookmark extends TypeInfo {
    id: string;
    name: string;
    description?: string;
    path: string;
    readibleType: string;
    segments: JsonPathSegment[];
    createdAt: number;
    brokerId?: string;
    lastAccessed?: number;
    configKey?: string;
    configName?: string;
}


// UI-specific types
export interface JSONNodeValue {
    value: unknown;
    type: string;
    name?: string;
}

