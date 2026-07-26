import { extractTypeScriptError } from "./errorProcessors";
import {DetailedError, FormattedError} from "./types";



export class ErrorManager {
    private static readonly PATTERNS = {
        typeScript: /TS(\d{4})/,
        propertyError: /Types of property '(.+)' are incompatible/,
        typeAssignment: /Type '(.+)' is not assignable to type '(.+)'/,
        component: /to type 'IntrinsicAttributes & (.+?)'/,
        functionError: /Type '\((.*?)\) => (.*?)' is not assignable/,
        propertyMissing: /Property '(.+)' is missing/
    };

    private static readonly ERROR_SUGGESTIONS = {
        'TS2322_boolean_true': [
            'Explicitly set the property to true: required={true}',
            'Remove the property if it\'s not needed',
            'Consider using a different prop if true is not appropriate'
        ],
        'TS2322_type_mismatch': [
            'Check the expected type in the component definition',
            'Ensure the provided value matches the expected type',
            'Consider using type assertion if you\'re sure about the type'
        ],
        'default': ['Check the type definitions', 'Verify the component props']
    };

    private static cleanHtmlError(htmlError: string): string {
        const htmlEntities: Record<string, string> = {
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&amp;': '&',
            '&apos;': "'",
            '<br/>': '\n',
            '<br>': '\n'
        };

        return Object.entries(htmlEntities).reduce(
            (error, [entity, char]) => error.replace(new RegExp(entity, 'g'), char),
            htmlError
        );
    }

    private static generateReference(): string {
        return `ERR_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    private static handleError(error: string): Partial<DetailedError> {
        const propertyMatch = error.match(this.PATTERNS.propertyError);
        const typeMatch = error.match(this.PATTERNS.typeAssignment);
        const componentMatch = error.match(this.PATTERNS.component);

        const property = propertyMatch?.[1];
        const [providedType, expectedType] = typeMatch ? [typeMatch[1], typeMatch[2]] : [];
        const component = componentMatch?.[1];

        const isBoolean = property && expectedType === 'true' && providedType === 'boolean';

        return {
            property,
            expectedType,
            providedType,
            component,
            severity: isBoolean ? 'warning' : 'error',
            suggestions: isBoolean ?
                         this.ERROR_SUGGESTIONS.TS2322_boolean_true :
                         this.ERROR_SUGGESTIONS.TS2322_type_mismatch,
            context: isBoolean ? 'boolean_true_requirement' : 'type_mismatch',
            details: { property, expectedType, providedType, component }
        };
    }

    static parseError(rawError: string): FormattedError {
        const cleanedError = this.cleanHtmlError(rawError);
        const errorCodeMatch = cleanedError.match(this.PATTERNS.typeScript);
        const errorCode = errorCodeMatch ? `TS${errorCodeMatch[1]}` : 'Unknown';

        // Try to use specific error processor first
        if (errorCode !== 'Unknown') {
            const processorName = `parse${errorCode}Error`;
            try {
                const errorProcessors = require('./errorProcessors');
                const processor = errorProcessors[processorName];

                if (typeof processor === 'function') {
                    const processed = processor(cleanedError);
                    if (processed && processed.essential) {
                        return {
                            essential: processed.essential,
                            basic: processed.basic,
                            verbose: processed.verbose,
                            json: JSON.stringify(processed, null, 2),
                            error: {
                                errorCode,
                                errorType: processed.errorType || 'TypeError',
                                summary: processed.essential,
                                fullError: cleanedError,
                                reference: this.generateReference(),
                                rawError,
                                details: processed,
                                severity: 'error',
                                suggestions: []
                            }
                        };
                    }
                }
            } catch (e) {
                // Silently continue to default handling if processor not found or fails
            }
        }

        // Original error handling logic
        try {
            const handled = this.handleError(cleanedError);

            const error: DetailedError = {
                errorCode,
                errorType: 'TypeError',
                summary: this.generateSummary(handled),
                fullError: cleanedError,
                reference: this.generateReference(),
                rawError,
                details: handled.details || {},
                severity: handled.severity || 'error',
                suggestions: handled.suggestions || this.ERROR_SUGGESTIONS.default,
                ...handled
            };

            return {
                essential: this.formatEssential(error),
                basic: this.formatBasic(error),
                verbose: this.formatVerbose(error),
                json: this.formatJson(error),
                error
            };
        } catch (error) {
            console.error('Error parsing error:', error);
            const fallbackError: DetailedError = {
                errorCode: 'PARSE_ERROR',
                errorType: 'ParsingError',
                summary: 'Error occurred while parsing the error message',
                fullError: cleanedError,
                reference: this.generateReference(),
                rawError,
                details: {},
                severity: 'error',
                suggestions: ['Check the error format', 'Ensure the error is properly encoded']
            };

            return {
                essential: this.formatEssential(fallbackError),
                basic: this.formatBasic(fallbackError),
                verbose: this.formatVerbose(fallbackError),
                json: this.formatJson(fallbackError),
                error: fallbackError
            };
        }
    }


    private static generateSummary(error: Partial<DetailedError>): string {
        const { property, expectedType, providedType, component } = error;

        if (property && expectedType === 'true' && providedType === 'boolean') {
            return `Property '${property}' must be explicitly set to 'true'`;
        }
        if (property) {
            return `Type mismatch for property '${property}': expected ${expectedType}, got ${providedType}`;
        }
        return `Type mismatch error in ${component || 'component'}`;
    }

    private static formatEssential(error: DetailedError): string {
        return `${error.errorCode}: ${error.summary}${
            error.suggestions.length ? `\nQuick fix: ${error.suggestions[0]}` : ''
        }`;
    }

    private static formatBasic(error: DetailedError): string {
        return `
${error.severity.toUpperCase()} ${error.errorCode}
${error.summary}
Reference: ${error.reference}
${error.suggestions.length ? '\nSuggestions:\n' + error.suggestions.map(s => `- ${s}`).join('\n') : ''}
        `.trim();
    }

    private static formatVerbose(error: DetailedError): string {
        return `
${this.formatBasic(error)}

Component: ${error.component || 'N/A'}
Property: ${error.property || 'N/A'}
Expected Type: ${error.expectedType || 'N/A'}
Provided Type: ${error.providedType || 'N/A'}
Context: ${error.context || 'N/A'}

Details:
${JSON.stringify(error.details, null, 2)}

Full Error:
${error.fullError}
        `.trim();
    }

    private static formatJson(error: DetailedError): string {
        return JSON.stringify(error, null, 2);
    }
}
