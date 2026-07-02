// lib/logger/types.ts

export type LogLevel = 'none' | 'debug' | 'info' | 'warn' | 'error';
export type DetailLevel = 'minimal' | 'standard' | 'verbose';

export type LogContext = {
    timestamp: string;
    environment: string;
    component?: string;
    action?: string;
    userId?: string;
    sessionId?: string;
    requestId?: string;
    url?: string;
    userAgent?: string;
    route?: string;
    version?: string;
    query?: string;
    trace?: string[];
    feature?: string;
    entityKey?: string;
};

export interface BaseLogEntry { // BAD!
    id: string;
    level: LogLevel;
    message: string;
    context: LogContext;
    metadata?: Record<string, unknown>;  // Additional meta-information
    trace?: string[];  // Include this for stack tracing
}

export interface AccurateLogEntry {
    id: string;
    level: LogLevel;
    message: string;
    data: unknown;
    trace?: string[];
    module?: string;
    feature?: string;
    category: string;
    subCategory?: string;
    context: LogContext;
    metadata?: Record<string, unknown>;
}



// In types.ts
export interface SchemaResolutionLog extends BaseLogEntry {
    category: 'schema_resolution';
    resolutionType: 'table' | 'field' | 'cache' | 'database' | 'entity';
    original: string;
    resolved: string;
    tableMetrics?: {
        fieldCount?: number;  // Make optional
        variantCount?: number;  // Make optional
        size?: number;  // Make optional
    };
}


export interface ErrorLog extends BaseLogEntry {
    category: 'error';
    error: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
        type?: string;  // e.g., 'PostgrestError', 'ValidationError'
        query?: string;  // SQL query or API endpoint that triggered the error
        trace?: string[];  // Stack trace or function call trace
    };
}

export interface ReduxLog extends BaseLogEntry {
    category: 'redux';
    action: {
        type: string;
        payload?: unknown;
    };
    prevState: unknown;
    nextState: unknown;
    duration?: number;
}

export interface NetworkLog extends BaseLogEntry {
    category: 'network';
    // Level should be mapped as follows:
    // - 500+ status: error
    // - 400-499 status: warn
    // - 300-399 status: info
    // - 200-299 status: debug
    request: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: unknown;
    };
    response: {
        status: number;
        statusText: string;
        headers?: Record<string, string>;
        body?: unknown;
        size?: number;
    };
    duration: number;
    cache?: {
        hits?: number;
        type?: string;
    };
}

export interface PerformanceLog extends BaseLogEntry {
    category: 'performance';
    // Level should be determined as:
    // - Above critical threshold: error
    // - Above warning threshold: warn
    // - Above info threshold: info
    // - Below all thresholds: debug
    metric: {
        name: string;
        value: number;
        unit: string;
    };
    threshold?: {
        critical?: number;
        warning?: number;
        info?: number;
    };
    source: 'nextjs' | 'react' | 'browser' | 'custom';
}

export interface SchemaMetricsLog extends BaseLogEntry {
    category: 'schema_metrics';
    metrics: {
        tableCount: number;
        totalFields: number;
        totalVariants: number;
        cacheSize: number;
        resolutionStats: {
            successful: number;
            failed: number;
            total: number;
        };
        tables: Array<{
            name: string;
            fieldCount: number;
            variantCount: number;
            size: number;
        }>;
    };
}

export interface ConsoleLog extends BaseLogEntry {
    category: 'console';
    type: LogLevel;  // Change from 'log' | 'info' | 'warn' | 'error' | 'debug' to reuse LogLevel
    args: unknown[];
    stack?: string;
}


export interface ApplicationLog extends BaseLogEntry {
    category: 'application';
    subCategory?: 'api' | 'auth' | 'performance' | 'security' | 'system' | 'console' | 'nextjs';
}

export type LogEntry =
    | SchemaResolutionLog
    | ErrorLog
    | ReduxLog
    | NetworkLog
    | PerformanceLog
    | SchemaMetricsLog
    | ConsoleLog
    | ApplicationLog;

// Storage types for persistence
export interface LogStorageType {
    app: LogEntry[];
    schema: SchemaResolutionLog[];
    performance: PerformanceLog[];
    network: NetworkLog[];
}

// Real-time metrics types
export interface SystemMetrics {
    memory: {
        used: number;
        total: number;
        limit: number;
    };
    performance: {
        fps: number;
        loadTime: number;
        firstContentfulPaint: number;
        domInteractive: number;
        resourceCount: number;
    };
    schema: {
        tableCount: number;
        fieldCount: number;
        variantCount: number;
        cacheSize: number;
        resolutionRate: number;
    };
    network: {
        activeRequests: number;
        totalRequests: number;
        failedRequests: number;
        averageLatency: number;
        totalBandwidth: number;
    };
}
