// types/error.ts
export type ErrorSeverity = 'error' | 'warning' | 'info';
export type ErrorFormat = 'essential' | 'basic' | 'verbose' | 'json';

export interface ParsedError {
    errorCode: string;
    errorType: string;
    essential: string;
    basic: string;
    verbose: string;
    details: Record<string, unknown>;
    severity: ErrorSeverity;
    [key: string]: any;
}

export interface DetailedError {
    errorCode: string;
    errorType: string;
    component?: string;
    property?: string;
    expectedType?: string;
    providedType?: string;
    summary: string;
    fullError: string;
    reference: string;
    rawError: string;
    details: Record<string, unknown>;
    severity: ErrorSeverity;
    suggestions: string[];
    context?: string;
}

export interface FormattedError {
    essential: string;
    basic: string;
    verbose: string;
    json: string;
    error: DetailedError;
}

