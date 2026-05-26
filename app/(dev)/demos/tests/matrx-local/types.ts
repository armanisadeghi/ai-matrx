// =====================
// Types
// =====================

export interface QueryParam {
    type: string;
    default: string;
}

export interface EndpointBody {
    [key: string]: any;
}

export type ResponseType = 'json' | 'file' | 'text';

export interface Endpoint {
    id: string;
    name: string;
    method: string;
    url: string;
    description: string;
    queryParams?: Record<string, QueryParam>;
    hasBody?: boolean;
    defaultBody?: EndpointBody;
    returnsFile?: boolean;
    responseType?: ResponseType;
    fileType?: string;  // e.g., 'text/plain', 'application/json', etc.
}

export interface EndpointResponse {
    data?: any;
    error?: string;
    timestamp: string;
    status: number;
    headers?: Record<string, string>;
}

export interface DownloadProgress {
    status: 'idle' | 'downloading' | 'success' | 'error';
    progress: number;
    error?: string;
    filename?: string;
}

export interface Category {
    id: string;
    name: string;
    endpoints: Endpoint[];
}

export interface WebSocketConfig {
    url: string;
    defaultMessage: string;
    reconnectInterval: number;
    autoReconnect?: boolean;
    maxRetries?: number;
}

export interface ApiConfig {
    baseUrl: string;
    categories: Category[];
    websocket: WebSocketConfig;
    defaultHeaders?: Record<string, string>;
}

// =====================
// Component Props Types
// =====================

export interface EndpointCardProps {
    endpoint: Endpoint;
    onTest?: (endpoint: Endpoint, url: string, body?: EndpointBody) => Promise<void>;
    response?: EndpointResponse;
    loading?: boolean;
    baseUrl: string;
}

export interface DirectoryStructureParams {
    root_directory: string;
    project_root: string;
    common_configs?: Record<string, any> | string;
}

export interface DirectoryStructureFormProps {
    onSubmit: (params: DirectoryStructureParams) => void;
    loading?: boolean;
}