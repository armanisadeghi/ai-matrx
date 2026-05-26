import {ErrorSeverity, ErrorFormat, ParsedError, DetailedError, FormattedError} from "./types";



export const extractTypeScriptError = {
    // Previous utility functions remain the same
    getTypeInfo: (typeString: string): { properties: string[], typeNames: string[] } => {
        const cleanType = typeString.replace(/[{}]/g, '').trim();
        const properties = cleanType
            .split(';')
            .map(prop => prop.trim())
            .filter(Boolean)
            .map(prop => prop.split(':')[0].trim());

        const typePattern = /type ['"](.+?)['"]/g;
        const typeNames = [...typeString.matchAll(typePattern)]
            .map(match => match[1])
            .filter(Boolean);

        return { properties, typeNames };
    },

    getPropertyList: (propString: string): string[] => {
        return propString
            .split(',')
            .map(prop => prop.trim())
            .filter(Boolean);
    },

    formatTypeList: (typeString: string, format: 'basic' | 'detailed' = 'basic'): string => {
        const cleaned = typeString.replace(/[{}]/g, '').trim();
        if (format === 'basic') {
            return cleaned
                .split(';')
                .map(prop => prop.trim())
                .filter(Boolean)
                .map(prop => prop.split(':')[0].trim())
                .join(', ');
        }
        return cleaned
            .split(';')
            .map(prop => prop.trim())
            .filter(Boolean)
            .join('\n- ');
    },

    patterns: {
        typeAssignment: /Type ['"](.+?)['"]\s+is not assignable to type ['"](.+?)['"]/,
        missingProperties: /missing the following properties.*?: (.+?)(?=$|\n)/,
        interfaceName: /type ['"](.+?)['"]/,
        propertyType: /Property ['"](.+?)['"]\s+has\s+types?\s+['"](.+?)['"]/,
        errorSeparator: /(?=(?:<html>)?TS\d{4})/,  // Updated to handle <html> prefix
    },

    formatOutput: (parts: string[]): string => {
        return parts
            .filter(Boolean)
            .join('\n\n')
            .trim();
    },

    // New utility function to split multiple errors
    splitErrors: (rawError: string): string[] => {
        const errors = rawError
            .split(extractTypeScriptError.patterns.errorSeparator)
            .map(err => err.trim())
            .filter(Boolean);

        // Ensure we don't split HTML-formatted errors incorrectly
        return errors.filter(err => err.match(/TS\d{4}/));
    }
};


// Example usage in your TS2739 processor:
export function parseTS2739Error(error: string): Record<string, any> {
    const pattern = /Type '(.+)' is missing the following properties from type '(.+)': (.+)$/;
    const match = error.match(pattern);
    if (!match) return {};

    const [, providedType, interfaceName, missingPropsString] = match;

    // Using the utilities
    const missingProperties = extractTypeScriptError.getPropertyList(missingPropsString);
    const basicTypeList = extractTypeScriptError.formatTypeList(providedType, 'basic');
    const detailedTypeList = extractTypeScriptError.formatTypeList(providedType, 'detailed');

    return {
        errorCode: 'TS2739',
        errorType: 'MissingProperties',
        interfaceName,
        missingProperties,
        providedType,
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2739',
            `Missing:\n- ${missingProperties.join(', ')}`,
            `In:\n- ${interfaceName}`
        ]),
        basic: extractTypeScriptError.formatOutput([
            'Error: TS2739',
            `Missing:\n- ${missingProperties.join(', ')}`,
            `In:\n- ${interfaceName}`,
            `Type:\n- ${basicTypeList}`
        ]),
        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2739',
            `Missing:\n- ${missingProperties.join(', ')}`,
            `In:\n- ${interfaceName}`,
            `Type:\n${detailedTypeList}`
        ])
    };
}

export function parseTS2322Error(error: string): Record<string, any> {
    const { patterns, formatTypeList, formatOutput } = extractTypeScriptError;

    const typeMatch = error.match(patterns.typeAssignment);
    if (!typeMatch) return {};

    const [, providedType, expectedType] = typeMatch;
    const propertyMatch = error.match(/property ['"](.+?)['"]/i);
    const property = propertyMatch?.[1];

    // Handle the 'unknown' type specially
    const isUnknownType = providedType.trim() === 'unknown';
    const expectedTypes = expectedType.split('|').map(t => t.trim());
    const expectedTypesList = expectedTypes.length > 1
                              ? `one of:\n- ${expectedTypes.join('\n- ')}`
                              : expectedType;

    const unknownTypeExplanation =
        'TypeScript cannot determine the type automatically. You need to specify the type explicitly.';

    return {
        errorCode: 'TS2322',
        errorType: 'TypeMismatch',
        providedType,
        expectedType,
        property,
        essential: formatOutput([
            'Error: TS2322',
            property
            ? `Property '${property}' has incorrect type`
            : isUnknownType
              ? 'Type needs to be specified explicitly'
              : 'Incorrect type provided',
            isUnknownType && unknownTypeExplanation,
            `Must be ${expectedTypesList}`
        ]),
        basic: formatOutput([
            'Error: TS2322',
            property
            ? `Property '${property}' has incorrect type`
            : 'Type Mismatch',
            '',
            isUnknownType
            ? 'Problem: Type is undefined or implicit'
            : `Provided: ${formatTypeList(providedType, 'basic')}`,
            '',
            'Must be:',
            expectedTypesList,
            '',
            isUnknownType && 'Note: You need to explicitly declare the type.'
        ]),
        verbose: formatOutput([
            'Error: TS2322',
            property
            ? `Property '${property}' type error`
            : 'Type Mismatch Error',
            '',
            'Current Type:',
            isUnknownType
            ? 'unknown (TypeScript cannot determine the type)'
            : providedType,
            '',
            'Acceptable Types:',
            expectedTypesList,
            '',
            isUnknownType && [
                'Why this happens:',
                '1. Variable type is not explicitly declared',
                '2. TypeScript cannot infer the type from context',
                '3. Value might be coming from an untyped source',
                '',
                'Solutions:',
                '1. Explicitly declare the type',
                '2. Use type assertion if you know the type',
                '3. Ensure the value source is properly typed'
            ].join('\n')
        ])
    };
}

export function parseTS2740Error(error: string): ParsedError {
    const typePattern = /Type '(.+)' is missing the following properties from type '(.+)': (.+)$/;
    const match = error.match(typePattern);

    if (!match) throw new Error('Invalid TS2740 error format');

    const [, providedType, expectedType, missingProps] = match;
    const missingProperties = missingProps.split(',').map(prop => prop.trim());

    const essential = `Missing required properties:\n- ${missingProperties.join('\n- ')}`;

    const basic = `Error Code: TS2740
Expected Type: ${expectedType}

Missing:
- ${missingProperties.join('\n- ')}

Provided Type:
${providedType}`;

    const verbose = `TS2740 - Missing Type Properties
Expected Type: ${expectedType}
Missing Properties:
- ${missingProperties.join('\n- ')}

Provided Type:
${providedType}

Full Details:
${JSON.stringify({ expectedType, missingProperties, providedType }, null, 2)}`;

    return {
        errorCode: 'TS2740',
        errorType: 'MissingTypeProperties',
        essential,
        basic,
        verbose,
        details: {
            providedType,
            expectedType,
            missingProperties
        },
        severity: 'error',
        providedType,
        expectedType,
        missingProperties
    };
}


export function parseTS2538Error(error: string): ParsedError {
    const typePattern = /Type '(.+)' cannot be used as an index type/;
    const match = error.match(typePattern);

    if (!match) return {} as ParsedError;

    const [, invalidType] = match;

    // Extract the function parameters for the essential view
    const paramListMatch = invalidType.match(/\{([^}]+)\}/);
    const paramList = paramListMatch
                      ? paramListMatch[1]
                          .split(',')
                          .map(param => param.split(':')[0].trim())
                          .filter(Boolean)
                          .join(', ')
                      : '';

    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2538',
            'Cannot use a Function as an index.',
            paramList && `Look for Function With:\n- ${paramList}`
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS2538',
            'Cannot use a Function as an index.',
            'Function Type:',
            `- '${invalidType}'`
        ]),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2538',
            'Cannot use a Function as an index.',
            'Type:',
            invalidType
        ])
    };

    return {
        errorCode: 'TS2538',
        errorType: 'InvalidIndexType',
        invalidType,
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: {
            fullType: invalidType,
            parameters: paramList
        },
        severity: 'error'
    };
}



export function parseTS2345Error(error: string): ParsedError {
    const cleanError = error.replace(/<[^>]+>/g, '');  // Remove HTML tags

    // Extract the main type mismatch
    const mainTypePattern = /Argument of type '(.+?)' is not assignable to parameter of type '(.+?)'/;
    const propertyPattern = /Types of property '(.+?)' are incompatible/;
    const specificTypePattern = /Type '(.+?)' is not assignable to type '(.+?)'/;

    const mainMatch = cleanError.match(mainTypePattern);
    const propertyMatch = cleanError.match(propertyPattern);
    const specificMatch = cleanError.match(specificTypePattern);

    if (!mainMatch) return {} as ParsedError;

    const [, providedType, expectedType] = mainMatch;
    const property = propertyMatch?.[1];
    const [, specificProvided, specificExpected] = specificMatch || [, '', ''];

    // Create human-readable messages
    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2345',
            property
            ? `Invalid type for '${property}':`
            : 'Type mismatch:',
            `Expected: ${specificExpected || expectedType}`,
            `Provided: ${specificProvided || providedType}`
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS2345',
            'Type Mismatch Error',
            property && `Property: ${property}`,
            '',
            'Types:',
            `Provided: ${providedType}`,
            `Expected: ${expectedType}`,
            specificMatch && 'Specific Issue:',
            specificMatch && `Provided: ${specificProvided}`,
            specificMatch && `Expected: ${specificExpected}`
        ].filter(Boolean)),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2345',
            'Type Assignment Error',
            '',
            'Main Type Mismatch:',
            `Provided: ${providedType}`,
            `Expected: ${expectedType}`,
            '',
            property && `Property with Issue: ${property}`,
            specificMatch && 'Specific Type Mismatch:',
            specificMatch && `Provided: ${specificProvided}`,
            specificMatch && `Expected: ${specificExpected}`,
            '',
            'Full Error:',
            cleanError
        ].filter(Boolean))
    };

    return {
        errorCode: 'TS2345',
        errorType: 'ArgumentTypeMismatch',
        providedType,
        expectedType,
        property,
        specificProvided,
        specificExpected,
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: {
            providedType,
            expectedType,
            property,
            specificProvided,
            specificExpected
        },
        severity: 'error'
    };
}


export function parseTS2741Error(error: string): ParsedError {
    const propertyPattern = /Property '(.+?)' is missing in type/;
    const typePattern = /type '(.+?)' but required in type '(.+?)'/;

    const propertyMatch = error.match(propertyPattern);
    const typeMatch = error.match(typePattern);

    if (!propertyMatch || !typeMatch) return {} as ParsedError;

    const [, missingProperty] = propertyMatch;
    const [, sourceType, targetType] = typeMatch;

    // Clean up the types for display
    const cleanSourceType = sourceType.replace(/[{}]/g, '').trim();
    const cleanTargetType = targetType.replace(/[{}]/g, '').trim();

    return {
        errorCode: 'TS2741',
        errorType: 'MissingRequiredProperty',
        missingProperty,
        sourceType,
        targetType,
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2741',
            `'${missingProperty}' is missing`,
            `Needed for: ${cleanTargetType}`
        ]),
        basic: extractTypeScriptError.formatOutput([
            'Error: TS2741',
            `'${missingProperty}' is missing`,
            `Needed for: ${cleanTargetType}`,
            '',
            'Current props:',
            cleanSourceType
        ]),
        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2741',
            `Missing: '${missingProperty}'`,
            '',
            'Required By:',
            cleanTargetType,
            '',
            'Current Props Provided:',
            cleanSourceType,
            '',
            'Full Error:',
            error
        ]),
        details: {
            missingProperty,
            sourceType: cleanSourceType,
            targetType: cleanTargetType
        },
        severity: 'error'
    };
}


export function parseTS1501Error(error: string): ParsedError {
    const featurePattern = /This (.+?) is only available when targeting '(.+?)' or later/;
    const match = error.match(featurePattern);

    if (!match) return {} as ParsedError;

    const [, feature, requiredVersion] = match;

    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS1501',
            'Modern JavaScript Feature Not Enabled',
            '',
            'Quick Fix:',
            '1. Open tsconfig.json',
            `2. Set "target": "${requiredVersion}" or higher`,
            '',
            'Note: This is not a code problem; just needs newer JavaScript enabled.'
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS1501',
            'Configuration Update Needed',
            '',
            `Feature: ${feature}`,
            `Required Version: ${requiredVersion} or later`,
            '',
            'Solution:',
            '1. Locate your tsconfig.json file',
            '2. Find the "compilerOptions" section',
            `3. Update or add: "target": "${requiredVersion}"`,
            '',
            'Current code is using modern features correctly,',
            'just needs proper TypeScript configuration.'
        ]),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS1501',
            'TypeScript Configuration Version Mismatch',
            '',
            'Details:',
            `- Feature: ${feature}`,
            `- Required Version: ${requiredVersion}`,
            '',
            'Full Context:',
            '- Your code uses modern JavaScript features',
            '- Current TypeScript configuration is set for older JavaScript',
            '- This is not a code quality issue',
            '',
            'Resolution:',
            '1. Open tsconfig.json',
            '2. In compilerOptions:',
            `   "target": "${requiredVersion}"`,
            '',
            'Example tsconfig.json:',
            '{',
            '  "compilerOptions": {',
            `    "target": "${requiredVersion}",`,
            '    // other options...',
            '  }',
            '}',
            '',
            'Original Error:',
            error
        ])
    };

    return {
        errorCode: 'TS1501',
        errorType: 'ConfigurationVersion',
        feature,
        requiredVersion,
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: {
            feature,
            requiredVersion,
            file: 'tsconfig.json',
            configSection: 'compilerOptions.target'
        },
        severity: 'error'
    };
}

export function parseTS2339Error(error: string): ParsedError {
    const propertyPattern = /Property '(.+?)' does not exist on type '(.+?)'/;
    const match = error.match(propertyPattern);

    if (!match) return {} as ParsedError;

    const [, property, type] = match;

    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2339',
            `Cannot use '${property}' with type '${type}'`,
            '',
            'Quick Fix:',
            `Check if '${type}' is the correct type for your value`
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS2339',
            'Invalid Property Access',
            '',
            `You're trying to use '${property}' on a ${type}`,
            '',
            'Common Causes:',
            '- Variable is not the type you expect',
            '- Missing type conversion',
            '- Incorrect API usage'
        ]),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2339',
            'Invalid Property Access Error',
            '',
            'Details:',
            `Attempted Property: ${property}`,
            `Found Type: ${type}`,
            '',
            'Common Solutions:',
            '1. Verify Variable Type:',
            `   Make sure your value is not ${type} if you need '${property}'`,
            '',
            '2. Type Conversion:',
            `   Convert ${type} to appropriate type before using '${property}'`,
            '',
            '3. Type Checking:',
            '   Add type check before accessing property:',
            `   if (typeof myVar !== '${type.toLowerCase()}') {`,
            `     myVar.${property}`,
            '   }',
            '',
            'Original Error:',
            error
        ])
    };

    return {
        errorCode: 'TS2339',
        errorType: 'InvalidPropertyAccess',
        property,
        type,
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: { property, type },
        severity: 'error'
    };
}

export function parseTS2532Error(error: string): ParsedError {
    const objectPattern = /Object is possibly '(.+?)'/;
    const match = error.match(objectPattern);

    if (!match) return {} as ParsedError;

    const [, nullOrUndefined] = match;

    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2532',
            'Safety Check Required',
            '',
            'Quick Fix:',
            `Add check: if (myObject !== ${nullOrUndefined}) { ... }`
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS2532',
            `Object Might Be ${nullOrUndefined}`,
            '',
            'Solutions:',
            '1. Add null check',
            '2. Use optional chaining: object?.property',
            '3. Use nullish coalescing: object ?? defaultValue'
        ]),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2532',
            `Possible ${nullOrUndefined} Value Error`,
            '',
            'Problem:',
            `TypeScript detected that this value might be ${nullOrUndefined}`,
            'Accessing properties without checking could crash your app',
            '',
            'Solutions:',
            '',
            '1. Traditional Check:',
            `if (myObject !== ${nullOrUndefined}) {`,
            '    myObject.property',
            '}',
            '',
            '2. Modern Solution (Optional Chaining):',
            'myObject?.property',
            '',
            '3. With Default Value:',
            'myObject ?? defaultValue',
            '',
            '4. Type Assertion (use carefully):',
            'myObject! // Only if you are absolutely sure',
            '',
            'Best Practices:',
            '- Always handle null/undefined cases',
            '- Use optional chaining for cleaner code',
            '- Consider why the value might be null',
            '',
            'Original Error:',
            error
        ])
    };

    return {
        errorCode: 'TS2532',
        errorType: 'NullableObjectAccess',
        nullableType: nullOrUndefined,
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: { nullableType: nullOrUndefined },
        severity: 'error'
    };
}

export function parseTS2554Error(error: string): ParsedError {
    const argsPattern = /Expected (\d+) arguments?, but got (\d+)/;
    const match = error.match(argsPattern);

    if (!match) return {} as ParsedError;

    const [, expected, received] = match;

    const sections = {
        essential: extractTypeScriptError.formatOutput([
            'Error: TS2554',
            'Wrong Number of Arguments',
            '',
            `Need: ${expected} arguments`,
            `Used: ${received} arguments`
        ]),

        basic: extractTypeScriptError.formatOutput([
            'Error: TS2554',
            'Incorrect Argument Count',
            '',
            `Expected: ${expected} arguments`,
            `Provided: ${received} arguments`,
            '',
            'Check:',
            '- Function definition',
            '- All required parameters',
            '- Optional parameters'
        ]),

        verbose: extractTypeScriptError.formatOutput([
            'Error: TS2554',
            'Function Call Argument Mismatch',
            '',
            'Details:',
            `Required Arguments: ${expected}`,
            `Provided Arguments: ${received}`,
            '',
            'Common Issues:',
            '1. Missing Required Arguments:',
            '   - Check function definition',
            '   - Ensure all required parameters are provided',
            '',
            '2. Optional Parameters:',
            '   - Optional parameters come after required ones',
            '   - They have a ? or default value',
            '',
            'Example:',
            'function example(required1, required2, optional?) { ... }',
            '// Correct: example(value1, value2)',
            '// Correct: example(value1, value2, optional)',
            '',
            'Original Error:',
            error
        ])
    };

    return {
        errorCode: 'TS2554',
        errorType: 'ArgumentCount',
        expectedArgs: parseInt(expected),
        receivedArgs: parseInt(received),
        essential: sections.essential,
        basic: sections.basic,
        verbose: sections.verbose,
        details: {
            expected: parseInt(expected),
            received: parseInt(received)
        },
        severity: 'error'
    };
}




/*
// genericErrorProcessor.ts
export function parseGenericTypeScriptError(error: string): Record<string, any> {
    const { patterns, getTypeInfo, formatTypeList, formatOutput } = extractTypeScriptError;

    // Try to extract common patterns
    const typeAssignment = error.match(patterns.typeAssignment);
    const missingProps = error.match(patterns.missingProperties);
    const interfaceMatch = error.match(patterns.interfaceName);
    const propertyType = error.match(patterns.propertyType);

    // Collect all meaningful information
    const extracted = {
        providedType: typeAssignment?.[1],
        expectedType: typeAssignment?.[2],
        missingProperties: missingProps ? getPropertyList(missingProps[1]) : [],
        interfaceName: interfaceMatch?.[1],
        property: propertyType?.[1],
        propertyType: propertyType?.[2],
    };

    // Build sections based on what we found
    const sections: Record<string, string> = {};

    if (extracted.providedType && extracted.expectedType) {
        sections.types = `Type Mismatch:
- Provided: ${formatTypeList(extracted.providedType, 'basic')}
- Expected: ${formatTypeList(extracted.expectedType, 'basic')}`;
    }

    if (extracted.missingProperties.length) {
        sections.missing = `Missing Properties:
- ${extracted.missingProperties.join('\n- ')}`;
    }

    if (extracted.property) {
        sections.property = `Property Issue:
- Name: ${extracted.property}
- Type: ${extracted.propertyType}`;
    }

    // Create different detail levels
    const essential = formatOutput([
        sections.missing || sections.types || sections.property || 'Type Error',
    ]);

    const basic = formatOutput([
        sections.missing,
        sections.types,
        sections.property,
    ]);

    const verbose = formatOutput([
        sections.missing,
        sections.types,
        sections.property,
        `Full Error:\n${error}`
    ]);

    return {
        errorCode: 'Generic',
        errorType: 'TypeScript',
        ...extracted,
        essential,
        basic,
        verbose,
    };
}

*/
