// lib/refs/types.ts
// MATRX-EXCEPTION: heterogeneous imperative-ref registry — components register
// methods of arbitrary arity/parameter types under a string key and are called
// dynamically by name (manager.call(componentId, methodName, ...args)).
// `(...args: unknown[]) => unknown` would reject assigning any concrete method
// with typed parameters (e.g. `(x: string) => void`) under strictFunctionTypes,
// which is exactly the case this registry exists to support — `any` here is
// the same relaxation React's own imperative-handle typing relies on.
export type RefMethod = (...args: any[]) => any;

export interface RefCollection {
    [componentId: string]: {
        [methodName: string]: RefMethod;
    };
}

export interface RefManagerMethods {
    call: <T extends any[], R = any>(componentId: string, methodName: string, ...args: T) => R;
    broadcast: <T extends any[]>(methodName: string, ...args: T) => void;
    hasMethod: (componentId: string, methodName: string) => boolean;
    register: (componentId: string, methods: { [key: string]: RefMethod }) => void;
    unregister: (componentId: string) => void;
}
