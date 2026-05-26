import React, { useRef, useCallback } from 'react';

type PropPath = string[];
type PropMapping = {
    source: PropPath;
    target: PropPath;
    transform?: (value: any) => any;
};

interface HandlerConfig {
    component: string;
    handlerName: string;
    handler: Handler;
    propMappings?: PropMapping[];
}

type HandlerKey = `${string}:${string}`;
type Handler = (...args: any[]) => any;

interface HandlerRegistration {
    handler: Handler;
    propMappings?: PropMapping[];
}

interface InvokeOptions {
    component: string;
    handlerName: string;
    args?: any[];
}

const getNestedValue = (obj: any, path: PropPath) => {
    return path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

const setNestedValue = (obj: any, path: PropPath, value: any) => {
    const newObj = { ...obj };
    let current = newObj;

    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        current[key] = { ...current[key] };
        current = current[key];
    }

    current[path[path.length - 1]] = value;
    return newObj;
};

export const useDynamicGateway = () => {
    const registryRef = useRef<Map<HandlerKey, HandlerRegistration>>(new Map());
    const mountedRef = useRef<boolean>(true);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            registryRef.current.clear();
        };
    }, []);

    const createHandlerKey = useCallback((component: string, handlerName: string): HandlerKey => {
        return `${component}:${handlerName}`;
    }, []);

    const register = useCallback((config: HandlerConfig) => {
        const key = createHandlerKey(config.component, config.handlerName);
        registryRef.current.set(key, {
            handler: config.handler,
            propMappings: config.propMappings
        });

        // Return cleanup function
        return () => {
            if (mountedRef.current) {
                registryRef.current.delete(key);
            }
        };
    }, [createHandlerKey]);

    const invoke = useCallback(async ({ component, handlerName, args = [] }: InvokeOptions) => {
        const key = createHandlerKey(component, handlerName);
        const registration = registryRef.current.get(key);

        if (!registration) {
            throw new Error(`Handler not found: ${key}`);
        }

        try {
            let mappedArgs = [...args];

            if (registration.propMappings) {
                mappedArgs = args.map((arg, index) => {
                    const relevantMappings = registration.propMappings!.filter(
                        m => m.target[0] === index.toString()
                    );

                    if (relevantMappings.length === 0) return arg;

                    let result = { ...arg };

                    relevantMappings.forEach(mapping => {
                        const sourceValue = getNestedValue(args[parseInt(mapping.source[0])], mapping.source.slice(1));
                        const transformedValue = mapping.transform ? mapping.transform(sourceValue) : sourceValue;
                        result = setNestedValue(result, mapping.target.slice(1), transformedValue);
                    });

                    return result;
                });
            }

            return await registration.handler(...mappedArgs);
        } catch (error) {
            throw new Error(`Handler execution failed: ${error}`);
        }
    }, [createHandlerKey]);

    return {
        register,
        invoke
    };
};
