/**
 * ONE normalization of the emitted OpenAPI document, shared by every road that
 * produces `types/python-generated/api-types.ts`.
 *
 * FastAPI emits one operationId when a single route accepts several HTTP
 * methods. OpenAPI requires operationIds to be unique, and the generated
 * TypeScript rejects the duplicate property names. We normalize consumer-side so
 * the frontend contract stays independently releasable from the backend.
 *
 * It lives in its own module because TWO callers must do it identically:
 * `sync-types.mjs` (which writes the committed files) and
 * `check-api-types-fresh.mjs` (which re-derives them to prove the committed
 * files were not hand-edited). A second copy of this logic would make the check
 * disagree with the generator for a reason that has nothing to do with a hand
 * edit.
 */

const OPENAPI_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/**
 * Rewrite duplicate operationIds in place. Returns how many operations were
 * renamed (0 = the document was already unique).
 */
export function normalizeDuplicateOperationIds(document) {
    const operationsById = new Map();

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!OPENAPI_METHODS.has(method) || !operation || typeof operation !== 'object') continue;
            const operationId = operation.operationId;
            if (typeof operationId !== 'string' || operationId.length === 0) continue;
            const entries = operationsById.get(operationId) ?? [];
            entries.push({ method, operation, path });
            operationsById.set(operationId, entries);
        }
    }

    let normalized = 0;
    for (const [operationId, entries] of operationsById) {
        if (entries.length < 2) continue;
        for (const { method, operation, path } of entries) {
            const pathSuffix = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
            operation.operationId = `${operationId}__${method}__${pathSuffix}`;
            normalized += 1;
        }
    }

    return normalized;
}

/**
 * CANONICAL ENUM ORDER. A JSON Schema `enum` is a SET — its member order carries
 * no meaning — but the generated TypeScript union is written in that order, so an
 * order that wobbles makes the generated files un-reproducible and a freshness
 * check unusable.
 *
 * It really does wobble: emitting through `scripts/emit_openapi.py` alone gives
 * `JsonSchemaProperty.type` as ["string","number",…] while emitting through
 * `scripts/generate_types.py all --direct` — which imports more of the app first —
 * gives it alphabetically. Same tree, same contract, different bytes (observed
 * 2026-09-12). Sorting every all-string `enum` makes both roads agree without
 * hiding anything: a member ADDED or REMOVED still changes the file loudly.
 *
 * Returns how many enum arrays were reordered.
 */
export function canonicalizeEnumOrder(node) {
    let reordered = 0;
    const walk = (value) => {
        if (Array.isArray(value)) {
            for (const item of value) walk(item);
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (
                key === 'enum'
                && Array.isArray(child)
                && child.length > 1
                && child.every((member) => typeof member === 'string')
            ) {
                const sorted = [...child].sort();
                if (sorted.some((member, i) => member !== child[i])) {
                    value[key] = sorted;
                    reordered += 1;
                }
                continue;
            }
            walk(child);
        }
    };
    walk(node);
    return reordered;
}

/**
 * Everything a raw emitted document needs before the generator sees it, applied
 * identically by `sync-types.mjs` and `check-api-types-fresh.mjs`.
 */
export function normalizeOpenApiDocument(document) {
    return {
        operationIds: normalizeDuplicateOperationIds(document),
        enums: canonicalizeEnumOrder(document),
    };
}

export { OPENAPI_METHODS };
