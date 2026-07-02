interface CleanedErrorStack {
    errorStack?: string;
    [functionName: string]: string | { "File Location": string; line: string } | undefined;
}

export function cleanErrorStack(errorStack: string | undefined): CleanedErrorStack {
    if (!errorStack) return {};

    // Keep the working filtering logic
    const filteredLines = errorStack
        .split('\n')
        .filter(line => {
            return !(
                line.includes('node_modules') ||
                // Defensive: strip Chrome extension stack frames from error reports. Pre-dates
                // the matrx-extend bridge; unrelated to it.
                line.includes('chrome-extension') ||
                line.includes('<anonymous>')
            );
        })
        .map(line =>
            line.replace(
                /webpack-internal:\/\/\/\(app-pages-browser\)\//g,
                'File Location: @'
            )
        );

    // Start building our result object with the error message
    const result: CleanedErrorStack = {
        errorStack: filteredLines[0]
    };

    // Process remaining lines
    filteredLines.slice(1).forEach(line => {
        // Extract function name and file info using parentheses as delimiter
        const parts = line.trim().split(' (');
        if (parts.length === 2) {
            const functionName = parts[0].replace('at ', '');
            const fileInfo = parts[1].replace(')', '');

            // Find the last occurrence of the colon that separates file location from line number
            const lastColonIndex = fileInfo.lastIndexOf(':');
            const secondLastColonIndex = fileInfo.lastIndexOf(':', lastColonIndex - 1);

            const filePath = fileInfo.substring(0, secondLastColonIndex);
            const lineNumbers = fileInfo.substring(secondLastColonIndex + 1);

            result[functionName] = {
                "File Location": filePath,
                "line": lineNumbers
            };
        }
    });

    return result;
}


interface ErrorDetails {
    error: Error | { message: string; [key: string]: unknown };
    location: string;
    action?: { type: string; payload: unknown };
    entityKey?: string;
    additionalContext?: Record<string, unknown>;
}

export function createStructuredError(
    {
        error,
        location,
        action,
        entityKey,
        additionalContext = {}
    }: ErrorDetails) {
    const details: Record<string, unknown> = {
        location,
        errorMessage: error.message,
        errorName: error.constructor.name,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
    };

    // Add error stack if available
    if ('stack' in error && typeof error.stack === 'string') {
        details['errorStack'] = cleanErrorStack(error.stack);
    }

    // Add any additional properties from the error object
    Object.entries(error).forEach(([key, value]) => {
        if (key !== 'message' && key !== 'stack') {
            details[`error${key.charAt(0).toUpperCase() + key.slice(1)}`] = value;
        }
    });

    // Add action context if provided
    if (action) {
        details['actionType'] = action.type;
        details['attemptedOperation'] = action.type.split('/').pop();
        details['payloadSnapshot'] = action.payload;
    }

    // Add entity context if provided
    if (entityKey) {
        details['entityKey'] = entityKey;
    }

    // Add any additional context
    Object.assign(details, additionalContext);

    // Structure the final error
    return {
        message: error.message,
        details
    };
}


/*
// Minimal usage
const simpleError = createStructuredError({
    error: new Error("Something went wrong"),
    location: "SimpleFunction"
});

// Full saga usage (your current case)
const sagaError = createStructuredError({
    error,
    location: 'handleUpdate Saga',
    action,
    entityKey,
    additionalContext: {
        mostImportantContext: "This error is not a TypeScript error..."
    }
});

// Custom error with additional properties
const customError = createStructuredError({
    error: {
        message: "API Call Failed",
        statusCode: 404,
        responseBody: { error: "Not Found" }
    },
    location: "APIHandler",
    additionalContext: {
        endpoint: "/api/users",
        method: "GET"
    }
});*/
