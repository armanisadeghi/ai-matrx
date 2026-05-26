// errorHandlers.ts

import { parseTS2739Error } from "../errorProcessors";

export interface ErrorHandler {
    matches: (error: string) => boolean;
    parse: (error: string) => Record<string, any>;
    essential: (parsed: Record<string, any>) => string;
    basic: (parsed: Record<string, any>) => string;
    verbose: (parsed: Record<string, any>) => string;
}

export const errorHandlers: Record<string, ErrorHandler> = {
    'TS2739': {
        matches: (error: string) => error.includes('TS2739'),

        parse: (error: string) => {
            const parsed = parseTS2739Error(error);
            return parsed || {};
        },

        essential: (parsed) => {
            return `'${parsed.interfaceName}' is missing:\n- ${parsed.missingProperties.join('\n- ')}`;
        },

        basic: (parsed) => {
            return `Error Code: TS2739
Interface: '${parsed.interfaceName}'\n
Missing:\n -${parsed.missingProperties.join(', ')}\n
Provided Type:\n- ${parsed.providedType}`;
        },

        verbose: (parsed) => {

            return `${parsed.errorCode} - Missing Properties Error
Interface: ${parsed.interfaceName}
Missing Properties: ${parsed.missingProperties.join(', ')}
Provided Type: ${parsed.providedType}
Full Type Information:
${JSON.stringify(parsed, null, 2)}`;
        }
    }

    // Add more handlers for other error types


};
