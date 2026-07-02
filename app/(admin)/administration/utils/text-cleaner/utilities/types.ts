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
    // Each TS-error-code parser (parseTS2740Error, parseTS2554Error, etc. in
    // errorProcessors.ts) adds its own extra diagnostic fields on top of the
    // required ones above (providedType, expectedType, missingProperties,
    // interfaceName, ...) — this is a genuinely open, per-variant record, not
    // a lazily-typed `any`.
    [key: string]: unknown;
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

