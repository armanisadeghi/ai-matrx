// utils/safeStringify.ts

export function safeStringify(obj: unknown, space: number = 2): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    }, space);
}


export function safeStringifyDepthLimit(obj: unknown, space: number = 2, maxDepth: number = 5): string {
    const seen = new WeakSet();

    function stringifyHelper(value: unknown, depth: number): unknown {
        if (depth > maxDepth) {
            return "[Max Depth Reached]";
        }

        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);

            const result: Record<string | number, unknown> = Array.isArray(value) ? [] : {};
            for (const key in value) {
                if (Object.hasOwn(value, key)) {
                    result[key] = stringifyHelper((value as Record<string, unknown>)[key], depth + 1);
                }
            }
            return result;
        }

        return value;
    }

    return JSON.stringify(stringifyHelper(obj, 0), null, space);
}

export function safeStringifyWithTimeout(obj: unknown, space: number = 2, maxDepth: number = 5, timeout: number = 1000): string {
    let result = "[Unresolved]";
    const stringifyTask = new Promise<void>((resolve) => {
        result = safeStringifyDepthLimit(obj, space, maxDepth);
        resolve();
    });

    const timeoutTask = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Stringification timeout")), timeout)
    );

    try {
        Promise.race([stringifyTask, timeoutTask]).catch((error) => {
            console.warn(error.message);
        });
    } catch (err) {
        console.warn("Error during stringification:", err);
    }

    return result;
}
