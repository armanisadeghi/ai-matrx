/**
 * summarizeSql — derive a plain-English intent line for a database tool call.
 *
 * The database tools (`sql`, `db_query`, `db_schema`) are "poor in richness":
 * the raw payload is just a SQL string and/or a data blob. This helper reads
 * the args and produces a single human line ("Querying `users`", "Inserting 3
 * rows into `events`") that heads the slim collapsed row and the inline card.
 *
 * Everything here is heuristic and DEFENSIVE — args vary across the multi-action
 * `sql` tool, `data` may be a JSON string or an object/array, and the SQL may be
 * any verb (or absent). We never throw; worst case we return "Running query".
 */

export interface SummarizeSqlArgs {
    /** Raw SQL string (query mode of `sql`, or the `db_query` tool). */
    query?: unknown;
    /** Multi-action selector for the `sql` tool ("query", "insert", "upsert", …). */
    action?: unknown;
    /** Target table for write actions (insert/upsert/update/delete). */
    table?: unknown;
    /** Rows being written — may be a JSON string, an object, or an array. */
    data?: unknown;
}

/** Wrap a table name in backticks for the inline-code look; omit if unknown. */
function code(table: string | null): string {
    return table ? `\`${table}\`` : "";
}

/** Trim + collapse whitespace; return null for empty/garbage. */
function clean(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const s = value.trim();
    return s.length > 0 ? s : null;
}

/**
 * Best-effort row count for a write payload. `data` may be a JSON string, a
 * single object (one row), or an array (n rows). Returns null when we can't
 * confidently count.
 */
function countRows(data: unknown): number | null {
    if (data == null) return null;
    if (Array.isArray(data)) return data.length;
    if (typeof data === "object") return 1;
    if (typeof data === "string") {
        const s = data.trim();
        if (!s) return null;
        try {
            const parsed: unknown = JSON.parse(s);
            if (Array.isArray(parsed)) return parsed.length;
            if (parsed && typeof parsed === "object") return 1;
        } catch {
            // Not JSON — can't count.
        }
    }
    return null;
}

/** Pluralize "row" by count. */
function rows(n: number): string {
    return `${n} ${n === 1 ? "row" : "rows"}`;
}

/**
 * Parse the table name out of a SQL statement for common verbs. Conservative:
 * matches `FROM <table>`, `INTO <table>`, `UPDATE <table>`, and DDL targets.
 * Strips a leading schema qualifier for display (`public.users` → `users`),
 * EXCEPT `information_schema`, which the caller wants to detect upstream.
 */
function tableFromSql(sql: string): string | null {
    const lowered = sql.toLowerCase();

    // Order matters: check the most specific clause for each verb.
    const patterns: RegExp[] = [
        /\bfrom\s+([a-z0-9_."]+)/i, // SELECT / DELETE FROM
        /\binto\s+([a-z0-9_."]+)/i, // INSERT INTO
        /\bupdate\s+([a-z0-9_."]+)/i, // UPDATE
        /\b(?:table|view|index)\s+(?:if\s+(?:not\s+)?exists\s+)?([a-z0-9_."]+)/i, // CREATE/ALTER/DROP
    ];

    for (const re of patterns) {
        const m = re.exec(lowered);
        if (m && m[1]) {
            // Use the original-case slice for display fidelity.
            const start = m.index + m[0].length - m[1].length;
            const raw = sql.slice(start, start + m[1].length).replace(/"/g, "");
            return raw;
        }
    }
    return null;
}

/** Strip the schema qualifier for display: `public.users` → `users`. */
function displayTable(qualified: string | null): string | null {
    if (!qualified) return null;
    const parts = qualified.split(".");
    return parts[parts.length - 1] || qualified;
}

/** Detect the leading SQL verb (select/insert/update/delete/create/alter/drop). */
function sqlVerb(sql: string): string | null {
    const m = /^\s*(select|insert|update|delete|create|alter|drop|with)\b/i.exec(sql);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Produce a plain-English intent line for a database tool call.
 *
 * Resolution order:
 *   1. If a SQL string is present, drive off its verb + parsed table.
 *   2. Otherwise fall back to the `action`/`data`/`table` args (write modes
 *      of the `sql` tool that pass structured data instead of raw SQL).
 *   3. Last resort: "Running query".
 */
export function summarizeSql({ query, action, table, data }: SummarizeSqlArgs): string {
    const sql = clean(query);
    const actionStr = clean(action)?.toLowerCase() ?? null;
    const argTable = displayTable(clean(table));

    // ── SQL-string path ──────────────────────────────────────────────────────
    if (sql) {
        const verb = sqlVerb(sql);
        const parsedTableRaw = tableFromSql(sql);
        const isInfoSchema =
            parsedTableRaw != null && parsedTableRaw.toLowerCase().includes("information_schema");
        const parsedTable = displayTable(parsedTableRaw);
        const tbl = parsedTable ?? argTable;

        if (verb === "select" || verb === "with") {
            if (isInfoSchema) return "Reading schema";
            return tbl ? `Querying ${code(tbl)}` : "Running query";
        }
        if (verb === "insert") {
            const n = countRows(data);
            return n != null
                ? `Inserting ${rows(n)} into ${code(tbl)}`.trimEnd()
                : tbl
                  ? `Inserting into ${code(tbl)}`
                  : "Inserting rows";
        }
        if (verb === "update") return tbl ? `Updating ${code(tbl)}` : "Updating rows";
        if (verb === "delete") return tbl ? `Deleting from ${code(tbl)}` : "Deleting rows";
        if (verb === "create") return tbl ? `Creating ${code(tbl)}` : "Creating object";
        if (verb === "alter") return tbl ? `Altering ${code(tbl)}` : "Altering object";
        if (verb === "drop") return tbl ? `Dropping ${code(tbl)}` : "Dropping object";
        // Unknown verb but we have SQL — still better than nothing.
        return tbl ? `Querying ${code(tbl)}` : "Running query";
    }

    // ── Action / data path (write modes that pass structured data) ────────────
    if (actionStr) {
        if (actionStr === "query" || actionStr === "select") {
            return argTable ? `Querying ${code(argTable)}` : "Running query";
        }
        if (actionStr === "insert" || actionStr === "upsert") {
            const n = countRows(data);
            const verb = actionStr === "upsert" ? "Upserting" : "Inserting";
            return n != null && argTable
                ? `${verb} ${rows(n)} into ${code(argTable)}`
                : argTable
                  ? `${verb} into ${code(argTable)}`
                  : `${verb} rows`;
        }
        if (actionStr === "update") return argTable ? `Updating ${code(argTable)}` : "Updating rows";
        if (actionStr === "delete") return argTable ? `Deleting from ${code(argTable)}` : "Deleting rows";
    }

    // Data present without an explicit action → most likely an insert.
    const n = countRows(data);
    if (n != null) {
        return argTable ? `Inserting ${rows(n)} into ${code(argTable)}` : `Inserting ${rows(n)}`;
    }

    return "Running query";
}
