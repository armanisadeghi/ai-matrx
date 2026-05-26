// errorFormatter.ts
import {ErrorSeverity, ErrorFormat, ParsedError, DetailedError, FormattedError} from "../types";

export class ErrorFormatter {
    static formatEssential(parsed: ParsedError): string {
        return `${parsed.errorCode}: ${parsed.summary}`;
    }

    static formatBasic(parsed: ParsedError): string {
        return `Error Code: ${parsed.errorCode}
Type: ${parsed.errorType}
${parsed.summary}
${parsed.suggestions ? '\nSuggestions:\n' + parsed.suggestions.map(s => `- ${s}`).join('\n') : ''}`;
    }

    static formatVerbose(parsed: ParsedError): string {
        return `${this.formatBasic(parsed)}

Details:
${JSON.stringify(parsed.details, null, 2)}`;
    }
}
