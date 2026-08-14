// app/api/schema-overview/route.ts
// Standalone schema overview endpoint for the schema visualizer.
// Reads directly from Postgres (information_schema) via the
// `execute_admin_query` RPC and returns a `SchemaOverview` JSON payload.
//
// This route is intentionally independent of the legacy entity system —
// no `globalCache`, `EntityKeys`, or `AutomationEntity` types are used.
//
// Cache strategy: a module-scoped variable holds the response for 1 hour
// to keep the visualizer snappy. The CDN also caches via Cache-Control.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type {
    SchemaColumn,
    SchemaOverview,
    SchemaRelationship,
    SchemaTable,
} from "@/features/administration/schema-visualizer/types-standalone";

// One-hour module-level cache (keyed by deployment instance).
const CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { payload: string; expiresAt: number } | null = null;

interface InformationSchemaTableRow {
    table_schema: string;
    table_name: string;
    table_type: "BASE TABLE" | "VIEW";
}

interface InformationSchemaColumnRow {
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
    ordinal_position: number;
}

interface ForeignKeyRow {
    table_schema: string;
    table_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_table_schema: string;
    foreign_column_name: string;
    constraint_name: string;
}

interface PrimaryKeyRow {
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
}

async function loadOverview(): Promise<SchemaOverview> {
    const supabase = createAdminClient();

    // 1. List public tables and views.
    const tablesQuery = `
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name;
    `;

    // 2. Pull all columns for public tables/views in one shot.
    const columnsQuery = `
        SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
    `;

    // 3. Foreign keys: source table.column -> target table.column.
    const foreignKeysQuery = `
        SELECT
            tc.table_name,
            tc.table_schema,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.column_name AS foreign_column_name,
            tc.constraint_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public';
    `;

    // 4. Primary keys (composite-aware).
    const primaryKeysQuery = `
        SELECT
            tc.table_name,
            tc.table_schema,
            kcu.column_name,
            kcu.ordinal_position
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, kcu.ordinal_position;
    `;

    const [tablesResult, columnsResult, fkResult, pkResult] = await Promise.all([
        supabase.rpc("execute_admin_query", { query: tablesQuery }),
        supabase.rpc("execute_admin_query", { query: columnsQuery }),
        supabase.rpc("execute_admin_query", { query: foreignKeysQuery }),
        supabase.rpc("execute_admin_query", { query: primaryKeysQuery }),
    ]);

    if (tablesResult.error) throw tablesResult.error;
    if (columnsResult.error) throw columnsResult.error;
    if (fkResult.error) throw fkResult.error;
    if (pkResult.error) throw pkResult.error;

    const tableRows = (tablesResult.data ?? []) as unknown as InformationSchemaTableRow[];
    const columnRows = (columnsResult.data ?? []) as unknown as InformationSchemaColumnRow[];
    const fkRows = (fkResult.data ?? []) as unknown as ForeignKeyRow[];
    const pkRows = (pkResult.data ?? []) as unknown as PrimaryKeyRow[];

    const relationKey = (schema: string, table: string) => `${schema}.${table}`;

    // ---- Build columns map per table ----
    const columnsByTable = new Map<string, Record<string, SchemaColumn>>();
    for (const row of columnRows) {
        const key = relationKey(row.table_schema, row.table_name);
        if (!columnsByTable.has(key)) {
            columnsByTable.set(key, {});
        }
        const map = columnsByTable.get(key)!;
        map[row.column_name] = {
            column_name: row.column_name,
            data_type: row.data_type,
            is_nullable: row.is_nullable === "YES",
            column_default: row.column_default,
            ordinal_position: row.ordinal_position,
        };
    }

    // ---- Build primary key map per table ----
    const primaryKeysByTable = new Map<string, string[]>();
    for (const row of pkRows) {
        const key = relationKey(row.table_schema, row.table_name);
        if (!primaryKeysByTable.has(key)) {
            primaryKeysByTable.set(key, []);
        }
        primaryKeysByTable.get(key)!.push(row.column_name);
    }

    // ---- Build relationships per table ----
    // Forward FKs (source -> target) and inverse FKs (target receives reverse pointer).
    // Many-to-many is heuristic: a junction table has 2 FKs and the table only
    // contains those FK columns plus optional metadata (we keep it lightweight here
    // and just expose forward + inverse FKs; M2M can be derived in the UI if needed).
    const relationshipsByTable = new Map<string, SchemaRelationship[]>();

    const ensureBucket = (table: string) => {
        if (!relationshipsByTable.has(table)) relationshipsByTable.set(table, []);
        return relationshipsByTable.get(table)!;
    };

    for (const row of fkRows) {
        const sourceKey = relationKey(row.table_schema, row.table_name);
        const targetKey = relationKey(row.foreign_table_schema, row.foreign_table_name);
        // Forward foreign key on the source table.
        ensureBucket(sourceKey).push({
            relationshipType: "foreignKey",
            column: row.column_name,
            relatedTable: targetKey,
            relatedColumn: row.foreign_column_name,
            junctionTable: null,
        });

        // Inverse on the target table.
        ensureBucket(targetKey).push({
            relationshipType: "inverseForeignKey",
            column: row.foreign_column_name,
            relatedTable: sourceKey,
            relatedColumn: row.column_name,
            junctionTable: null,
        });
    }

    // ---- Heuristic: detect junction tables for many-to-many ----
    // A "junction" table here = exactly 2 FKs whose source columns are part of
    // the table's primary key. For each such table, we synthesize M2M rows on
    // both endpoints.
    const fksBySourceTable = new Map<string, ForeignKeyRow[]>();
    for (const row of fkRows) {
        const key = relationKey(row.table_schema, row.table_name);
        if (!fksBySourceTable.has(key)) fksBySourceTable.set(key, []);
        fksBySourceTable.get(key)!.push(row);
    }

    for (const [tableName, fks] of fksBySourceTable.entries()) {
        if (fks.length !== 2) continue;
        const pkCols = primaryKeysByTable.get(tableName) ?? [];
        const allFkColsArePk = fks.every((fk) => pkCols.includes(fk.column_name));
        if (!allFkColsArePk) continue;

        const [a, b] = fks;
        const aTarget = relationKey(a.foreign_table_schema, a.foreign_table_name);
        const bTarget = relationKey(b.foreign_table_schema, b.foreign_table_name);
        ensureBucket(aTarget).push({
            relationshipType: "manyToMany",
            column: a.foreign_column_name,
            relatedTable: bTarget,
            relatedColumn: b.foreign_column_name,
            junctionTable: tableName,
        });
        ensureBucket(bTarget).push({
            relationshipType: "manyToMany",
            column: b.foreign_column_name,
            relatedTable: aTarget,
            relatedColumn: a.foreign_column_name,
            junctionTable: tableName,
        });
    }

    // ---- Assemble the final tables object ----
    const tables: Record<string, SchemaTable> = {};
    for (const tableRow of tableRows) {
        const key = relationKey(tableRow.table_schema, tableRow.table_name);
        const columns = columnsByTable.get(key) ?? {};
        const pkArr = primaryKeysByTable.get(key) ?? [];
        const primaryKey: string | string[] =
            pkArr.length === 0 ? "" : pkArr.length === 1 ? pkArr[0] : pkArr;

        const schemaType: SchemaTable["schemaType"] =
            tableRow.table_type === "VIEW" ? "view" : "table";

        tables[key] = {
            table_name: key,
            table_type: tableRow.table_type,
            schemaType,
            columns,
            relationships: relationshipsByTable.get(key) ?? [],
            primaryKey,
        };
    }

    return {
        tables,
        lastUpdated: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            return new NextResponse(cached.payload, {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
                },
            });
        }

        const overview = await loadOverview();
        const payload = JSON.stringify(overview);

        cached = {
            payload,
            expiresAt: now + CACHE_TTL_MS,
        };

        return new NextResponse(payload, {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
        });
    } catch (error) {
        console.error("[/api/schema-overview] Failed to load schema overview:", error);
        const message =
            error instanceof Error ? error.message : "Unknown error loading schema overview";
        return NextResponse.json(
            { error: message },
            { status: 500 },
        );
    }
}
