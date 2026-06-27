/**
 * Resource Data Fetcher Utility
 *
 * Fetches data for resources that need it (e.g., tables).
 * Uses the existing RPC functions designed for specific table references.
 * This is called before formatting resources to ensure we have all necessary data.
 *
 * Canonical home: features/agents/resources/data-fetcher.ts
 * (Relocated from features/prompts/utils/resource-data-fetcher.ts)
 */

import { Resource, TableResourceData } from './types';
import { supabase } from '@/utils/supabase/client';

// ===========================
// Table Data Fetching
// ===========================

/**
 * Fetch table data based on reference type
 * Uses the appropriate RPC function for each reference type
 */
async function fetchTableDataByReference(tableRef: TableResourceData): Promise<{
    fields?: any[];
    rows?: any[];
    row?: any;
    column?: any;
    value?: any;
    referenceType: string;
} | null> {
    try {
        const referenceType = tableRef.type;

        switch (referenceType) {
            case 'full_table': {
                // For full table, fetch table metadata and a sample of rows
                // We use list_table_rows RPC which is designed for this
                const { data: rowsDataRaw, error } = await supabase
                    .rpc('list_table_rows', {
                        ref: {
                            type: 'full_table',
                            table_id: tableRef.table_id
                        },
                        limit_rows: 200,
                        offset_rows: 0
                    });

                if (error) {
                    console.error('Error fetching table rows:', error);
                    return null;
                }

                const rowsData = rowsDataRaw as unknown as { fields?: unknown[]; rows?: unknown[] } | null;
                return {
                    fields: rowsData?.fields || [],
                    rows: rowsData?.rows || [],
                    referenceType: 'full_table'
                };
            }

            case 'table_row': {
                // Fetch specific row using get_table_row RPC
                const { data: rowRaw, error } = await supabase
                    .rpc('get_table_row', { ref: tableRef });

                if (error) {
                    console.error('Error fetching table row:', error);
                    return null;
                }

                const row = rowRaw as unknown as Record<string, unknown> | null;
                return {
                    row: row || {},
                    referenceType: 'table_row'
                };
            }

            case 'table_column': {
                // Fetch column data using get_table_column RPC
                const [columnResult, rowsResult] = await Promise.all([
                    supabase.rpc('get_table_column', { ref: tableRef }),
                    supabase.rpc('list_table_rows', {
                        ref: {
                            type: 'full_table',
                            table_id: tableRef.table_id
                        },
                        limit_rows: 100,
                        offset_rows: 0
                    })
                ]);

                if (columnResult.error || rowsResult.error) {
                    console.error('Error fetching column data:', columnResult.error || rowsResult.error);
                    return null;
                }

                const colData = columnResult.data as unknown;
                const rowsPayload = rowsResult.data as unknown as { rows?: unknown[]; fields?: unknown[] } | null;
                return {
                    column: colData,
                    rows: rowsPayload?.rows || [],
                    fields: rowsPayload?.fields || [],
                    referenceType: 'table_column'
                };
            }

            case 'table_cell': {
                // Fetch specific cell using get_table_cell RPC
                const { data: cellRaw, error } = await supabase
                    .rpc('get_table_cell', { ref: tableRef });

                if (error) {
                    console.error('Error fetching table cell:', error);
                    return null;
                }

                const cellData = cellRaw as unknown as { value?: unknown } | null;
                return {
                    value: cellData?.value,
                    referenceType: 'table_cell'
                };
            }

            default:
                console.warn('Unknown table reference type:', referenceType);
                return null;
        }
    } catch (error) {
        console.error('Error in fetchTableDataByReference:', error);
        return null;
    }
}

/**
 * Enrich a table resource with data based on its reference type
 */
async function enrichTableResource(resource: Resource): Promise<Resource> {
    if (resource.type !== 'table') {
        return resource;
    }

    const tableData = resource.data as TableResourceData;

    // If we already have the necessary data, no need to fetch
    // (fields and rows for full_table, or specific data for other types)
    if (tableData.fields && tableData.rows) {
        return resource;
    }

    // Fetch the data using the appropriate RPC function
    const fetchedData = await fetchTableDataByReference(tableData);

    if (!fetchedData) {
        console.warn(`Failed to fetch data for table reference`, tableData);
        return resource;
    }

    // Merge the fetched data into the resource based on reference type
    const enrichedData: TableResourceData = {
        ...tableData,
    };

    switch (fetchedData.referenceType) {
        case 'full_table':
            enrichedData.fields = fetchedData.fields;
            enrichedData.rows = fetchedData.rows;
            enrichedData.row_count = fetchedData.rows?.length;
            break;

        case 'table_row':
            // Store the fetched row data
            enrichedData.rows = [fetchedData.row];
            break;

        case 'table_column':
            // Store column definition and rows
            enrichedData.fields = fetchedData.fields;
            enrichedData.rows = fetchedData.rows;
            break;

        case 'table_cell':
            // Store the cell value
            // We'll format this in the content extraction
            (enrichedData as any).cell_value = fetchedData.value;
            break;
    }

    // Return enriched resource
    return {
        ...resource,
        data: enrichedData
    };
}

// ===========================
// File Data Fetching
// ===========================

/**
 * Fetch file content if it's a text file
 * This is optional - only fetch if we want to include file contents
 */
async function enrichFileResource(resource: Resource): Promise<Resource> {
    if (resource.type !== 'file') {
        return resource;
    }

    const fileData = resource.data;

    // If we already have content, no need to fetch
    if (fileData.content) {
        return resource;
    }

    // TODO: Add logic to fetch file content from storage if needed
    // For now, just return the resource as-is
    return resource;
}

// ===========================
// Main Fetching Function
// ===========================

/**
 * Fetch data for resources that require it
 * This should be called before formatting resources for the LLM
 */
export async function fetchResourceData(resource: Resource): Promise<Resource> {
    switch (resource.type) {
        case 'table':
            return enrichTableResource(resource);

        case 'file':
            return enrichFileResource(resource);

        // Other resource types don't need data fetching
        default:
            return resource;
    }
}

/**
 * Fetch data for multiple resources
 */
export async function fetchResourcesData(resources: Resource[]): Promise<Resource[]> {
    // Process resources in parallel for better performance
    const enrichedResources = await Promise.all(
        resources.map(resource => fetchResourceData(resource))
    );

    return enrichedResources;
}

/**
 * Check if a resource needs data fetching
 */
export function resourceNeedsDataFetch(resource: Resource): boolean {
    switch (resource.type) {
        case 'table':
            const tableData = resource.data as TableResourceData;
            // Needs fetch if we don't have fields or rows
            return !tableData.fields || !tableData.rows;

        case 'file':
            // Files might need content fetching, but it's optional
            return false;

        default:
            return false;
    }
}

/**
 * Get count of resources that need fetching
 */
export function getResourcesFetchCount(resources: Resource[]): number {
    return resources.filter(resourceNeedsDataFetch).length;
}
