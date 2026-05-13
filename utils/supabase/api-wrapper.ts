// @ts-nocheck
// utils/supabase/api-wrapper.ts

import { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import {
  PostgrestError,
  PostgrestFilterBuilder,
  PostgrestQueryBuilder,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/postgrest-js";
import {
  convertData,
  getRegisteredSchemas,
  getSchema,
  processDataForInsert,
  TableSchema,
} from "../schema/schemaRegistry";

const availableSchemas = getRegisteredSchemas("database");
export type TableOrView = (typeof availableSchemas)[number];

export type QueryOptions<T extends TableOrView> = {
  filters?: Partial<Record<keyof TableSchema["fields"], any>>;
  sorts?: Array<{ column: keyof TableSchema["fields"]; ascending?: boolean }>;
  limit?: number;
  offset?: number;
  columns?: Array<keyof TableSchema["fields"]>;
};

type SubscriptionCallback = (data: any[]) => void;

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "cs"
  | "cd"
  | "sl"
  | "sr"
  | "nxl"
  | "nxr"
  | "adj"
  | "ov"
  | "fts"
  | "plfts"
  | "phfts"
  | "wfts";

type QueryBuilder<T extends Record<string, any> = any> = {
  from: (table: string) => QueryBuilder<T>;
  select: (columns: string) => QueryBuilder<T>;
  filter: (
    column: keyof T,
    operator: FilterOperator,
    value: any,
  ) => QueryBuilder<T>;
  order: (column: keyof T, ascending?: boolean) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  offset: (count: number) => QueryBuilder<T>;
  joinRelated: (table: string) => QueryBuilder<T>;
  execute: () => Promise<{ data: T[] | null; error: PostgrestError | null }>;
};

type PostgrestList = Array<Record<string, any>>;
type PostgrestMap = Record<string, any>;

class DatabaseApiWrapper {
  private client: SupabaseClient;
  private subscriptions: Map<string, any> = new Map();
  private queryBuilders: Map<string, QueryBuilder> = new Map();

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private getDatabaseTableName<T extends TableOrView>(name: T): string {
    const tableSchema = getSchema(name, "database");
    if (!tableSchema) {
      throw new Error(`tableSchema not found for table or view: ${name}`);
    }
    return tableSchema.name.database;
  }

  private applyQueryOptions<T extends TableOrView>(
    query: any,
    options: QueryOptions<T>,
    tableSchema: TableSchema,
  ): any {
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        const dbField =
          tableSchema.fields[key as keyof typeof tableSchema.fields]?.alts
            .database;
        if (dbField) {
          query = query.eq(dbField, value);
        }
      }
    }

    if (options.sorts) {
      for (const sort of options.sorts) {
        const dbField =
          tableSchema.fields[sort.column as keyof typeof tableSchema.fields]
            ?.alts.database;
        if (dbField) {
          query = query.order(dbField, { ascending: sort.ascending ?? true });
        }
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 0) - 1,
      );
    }

    if (options.columns) {
      const dbColumns = options.columns
        .map((col) => tableSchema.fields[col]?.alts.database)
        .filter(Boolean);
      query = query.select(dbColumns.join(", "));
    }

    return query;
  }

  private convertResponse<T extends TableOrView>(data: any, name: T): any {
    return convertData(data, "database", "frontend", name);
  }

  async fetchSimple<T extends TableOrView>(
    dbTableName: string,
    id: string,
    options: Omit<QueryOptions<T>, "limit" | "offset">,
  ): Promise<any> {
    let query = this.client.from(dbTableName).select("*").eq("id", id);
    query = this.applyQueryOptions(
      query,
      options,
      getSchema(dbTableName, "database")!,
    );
    const { data, error } = await query.single();
    if (error) {
      console.error(`Error fetching data for ${dbTableName}: ${error.message}`);
      return null;
    }
    return data;
  }

  async fetchOne<T extends TableOrView>(
    name: T,
    id: string,
    options: Omit<QueryOptions<T>, "limit" | "offset"> = {},
  ): Promise<any> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;
    const fetchStrategy = tableSchema.relationships.fetchStrategy;

    // Fetch the main table data once
    let result = await this.fetchSimple(dbTableName, id, options);
    if (!result) return null;

    // Handle relationships based on fetchStrategy
    switch (fetchStrategy) {
      case "simple":
        return this.convertResponse(result, name);

      case "fk":
        result = await this.fetchFk(dbTableName, result, tableSchema);
        break;

      case "ifk":
        result = await this.fetchIfk(dbTableName, result, tableSchema);
        break;

      case "m2m":
        result = await this.fetchM2m(dbTableName, result, tableSchema);
        break;

      case "fkAndIfk":
        result = await this.fetchFk(dbTableName, result, tableSchema);
        result = await this.fetchIfk(dbTableName, result, tableSchema);
        break;

      case "m2mAndFk":
        result = await this.fetchFk(dbTableName, result, tableSchema);
        result = await this.fetchM2m(dbTableName, result, tableSchema);
        break;

      case "m2mAndIfk":
        result = await this.fetchIfk(dbTableName, result, tableSchema);
        result = await this.fetchM2m(dbTableName, result, tableSchema);
        break;

      case "fkIfkAndM2M":
        result = await this.fetchFk(dbTableName, result, tableSchema);
        result = await this.fetchIfk(dbTableName, result, tableSchema);
        result = await this.fetchM2m(dbTableName, result, tableSchema);
        break;

      default:
        console.error(`Invalid fetch strategy: ${fetchStrategy}`);
        return null;
    }

    return this.convertResponse(result, name);
  }

  async fetchFk<T extends TableOrView>(
    dbTableName: string,
    data: any,
    tableSchema: TableSchema,
  ): Promise<any> {
    const foreignKeyQueries = tableSchema.relationships.foreignKeys.map(
      (fk) => {
        const mainTableColumn = tableSchema.fields[fk.column].alts.database; // The column in the main table
        const relatedTable = fk.relatedTable; // The related table to fetch from
        const relatedColumn = fk.relatedColumn; // The column in the related table

        return this.client
          .from(relatedTable)
          .select("*")
          .eq(relatedColumn, data[mainTableColumn]); // Fetch records where relatedColumn matches mainTableColumn value
      },
    );

    const foreignKeyResults = await Promise.all(foreignKeyQueries);

    foreignKeyResults.forEach((result, index) => {
      const { data: relatedData, error } = result;
      if (error) {
        console.error(
          `Error fetching FK data for ${tableSchema.relationships.foreignKeys[index].relatedTable}: ${error.message}`,
        );
        return;
      }
      // Attach the related data to the main data object
      data[tableSchema.relationships.foreignKeys[index].relatedTable] =
        relatedData;
    });

    return data;
  }

  async fetchIfk<T extends TableOrView>(
    dbTableName: string,
    data: any,
    tableSchema: TableSchema,
  ): Promise<any> {
    const inverseForeignKeyQueries =
      tableSchema.relationships.inverseForeignKeys.map((ifk) => {
        const relatedTable = ifk.relatedTable; // The related table to fetch from
        const relatedColumn = ifk.relatedColumn; // The column in the related table
        const mainTableColumn = ifk.mainTableColumn; // The column in the main table that is referenced

        return this.client
          .from(relatedTable)
          .select("*")
          .eq(relatedColumn, data[mainTableColumn]); // Match on the column in the main table
      });

    const inverseForeignKeyResults = await Promise.all(
      inverseForeignKeyQueries,
    );

    inverseForeignKeyResults.forEach((result, index) => {
      const { data: relatedData, error } = result;
      if (error) {
        console.error(
          `Error fetching IFK data for ${tableSchema.relationships.inverseForeignKeys[index].relatedTable}: ${error.message}`,
        );
        return;
      }
      // Attach the related data to the main data object
      data[tableSchema.relationships.inverseForeignKeys[index].relatedTable] =
        relatedData;
    });

    return data;
  }

  async fetchM2m<T extends TableOrView>(
    dbTableName: string,
    data: any,
    tableSchema: TableSchema,
  ): Promise<any> {
    const manyToManyQueries = tableSchema.relationships.manyToMany.map(
      (m2m) => {
        const junctionTable = m2m.junctionTable; // The junction table
        const mainTableColumn = m2m.mainTableColumn; // The column in the junction table that references the main table
        const relatedTableColumn = m2m.relatedTableColumn; // The column in the junction table that references the related table

        // Fetch from the junction table based on the main table's reference column
        return this.client
          .from(junctionTable)
          .select("*")
          .eq(mainTableColumn, data[tableSchema.fields["id"].alts.database]); // Match on the main table column in the junction table
      },
    );

    const manyToManyResults = await Promise.all(manyToManyQueries);

    await Promise.all(
      manyToManyResults.map(async (result, index) => {
        const { data: junctionData, error } = result;
        if (error) {
          console.error(
            `Error fetching M2M junction table data for ${tableSchema.relationships.manyToMany[index].junctionTable}: ${error.message}`,
          );
          return;
        }

        // Now, fetch related table data for each junction record
        const relatedDataQueries = junctionData.map((junctionRecord) => {
          const relatedTable =
            tableSchema.relationships.manyToMany[index].relatedTable;
          const relatedTableColumn =
            tableSchema.relationships.manyToMany[index].relatedTableColumn;

          return this.client
            .from(relatedTable)
            .select("*")
            .eq("id", junctionRecord[relatedTableColumn]); // Match on the related table column in the junction table
        });

        const relatedDataResults = await Promise.all(relatedDataQueries);
        data[tableSchema.relationships.manyToMany[index].relatedTable] =
          relatedDataResults.map((res) => res.data);
      }),
    );

    return data;
  }

  async fetchAll<T extends TableOrView>(
    name: T,
    options: Omit<QueryOptions<T>, "limit" | "offset"> = {},
  ): Promise<any[]> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;

    let query = this.client.from(dbTableName).select("*");
    query = this.applyQueryOptions(query, options, tableSchema);

    const { data, error } = await query;

    if (error) throw pgErrorToError(error);
    return data.map((item) => this.convertResponse(item, name));
  }

  async fetchPaginated<T extends TableOrView>(
    name: T,
    options: QueryOptions<T>,
    page: number = 1,
    pageSize: number = 10,
    maxCount: number = 10000,
  ): Promise<{
    page: number;
    allNamesAndIds?: { id: string; name: string }[];
    pageSize: number;
    totalCount: number;
    paginatedData: any[];
  }> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;

    options.limit = pageSize;
    options.offset = (page - 1) * pageSize;

    let query = this.client.from(dbTableName).select("*", { count: "exact" });
    query = this.applyQueryOptions(query, options, tableSchema);

    const { data, error, count } = await query;
    if (error) {
      console.error(`Error fetching data: ${error.message}`);
      return {
        page,
        pageSize,
        totalCount: 0,
        paginatedData: [],
      };
    }

    let allNamesAndIds: { id: string; name: string }[] | undefined;
    if (maxCount !== 0) {
      const idNameQuery = this.client
        .from(dbTableName)
        .select("id, name")
        .limit(maxCount);
      const { data: idNameData, error: idNameError } = await idNameQuery;
      if (idNameError) {
        console.error(`Error fetching names and IDs: ${idNameError.message}`);
      } else {
        allNamesAndIds = idNameData as { id: string; name: string }[];
      }
    }

    const paginatedData = data.map((item) => {
      if (typeof item === "string") {
        try {
          return JSON.parse(item);
        } catch (parseError: any) {
          console.error(
            `Failed to parse JSON string: ${parseError.message}`,
            item,
          );
          return null;
        }
      } else if (typeof item === "object" && item !== null) {
        return this.convertResponse(item, name); // Correctly convert the response
      } else {
        console.warn("Unexpected item type:", typeof item, item);
        return null;
      }
    });

    return {
      page,
      allNamesAndIds,
      pageSize,
      totalCount: count ?? 0,
      paginatedData,
    };
  }

  async create<T extends TableOrView>(
    name: T,
    data: Partial<any>,
  ): Promise<any> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;
    const dbData = convertData(data, "frontend", "database", name);
    const response = processDataForInsert(dbTableName, dbData);
    const processedData = response.processedData;
    const requiredMethod = response.callMethod;

    let result;

    // Delegate to the appropriate handler based on `requiredMethod`
    switch (requiredMethod) {
      case "simple":
        result = await this.insertSimple(dbTableName, processedData);
        break;
      case "fk": // This will handle both one and many FK cases
        result = await this.insertWithFk(dbTableName, processedData);
        break;
      case "ifk": // This will handle both one and many IFK cases
        result = await this.insertWithIfk(dbTableName, processedData);
        break;
      case "fkAndIfk": // This will handle combinations of FK and IFK (both one or many)
        result = await this.insertWithFkAndIfk(dbTableName, processedData);
        break;
      default:
        throw new Error("Invalid method for insertion");
    }

    return this.convertResponse(result, name);
  }

  async insertSimple(dbTableName: string, processedData: any): Promise<any> {
    const { data: result, error } = await this.client
      .from(dbTableName)
      .insert(processedData)
      .select()
      .single();
    if (error) throw pgErrorToError(error);
    return result;
  }

  async insertWithFk(dbTableName: string, processedData: any): Promise<any> {
    const { data: result, error } = await this.client
      .from(dbTableName)
      .insert(processedData)
      .select()
      .single();
    if (error) throw pgErrorToError(error);
    return result;
  }

  async insertWithIfk(dbTableName: string, processedData: any): Promise<any> {
    const { data: primaryResult, error: primaryError } = await this.client
      .from(dbTableName)
      .insert(processedData)
      .select()
      .single();

    if (primaryError) throw primaryError;

    for (const relatedTable of processedData.relatedTables) {
      const relatedInsertData = {
        ...relatedTable.data,
        related_column: primaryResult.id,
      };
      const { error: relatedError } = await this.client
        .from(relatedTable.table)
        .insert(relatedInsertData)
        .select()
        .single();

      if (relatedError) throw relatedError;
    }

    return primaryResult;
  }

  async insertWithFkAndIfk(
    dbTableName: string,
    processedData: any,
  ): Promise<any> {
    const { data: primaryResult, error: primaryError } = await this.client
      .from(dbTableName)
      .insert(processedData)
      .select()
      .single();

    if (primaryError) throw primaryError;

    for (const relatedTable of processedData.relatedTables) {
      const relatedInsertData = {
        ...relatedTable.data,
        related_column: primaryResult.id,
      };
      const { error: relatedError } = await this.client
        .from(relatedTable.table)
        .insert(relatedInsertData)
        .select()
        .single();

      if (relatedError) throw relatedError;
    }

    return primaryResult;
  }

  async update<T extends TableOrView>(
    name: T,
    id: string,
    data: Partial<any>,
  ): Promise<any> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;
    const dbData = convertData(data, "frontend", "database", name);

    const { data: result, error } = await this.client
      .from(dbTableName)
      .update(dbData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw pgErrorToError(error);
    return this.convertResponse(result, name);
  }

  async delete<T extends TableOrView>(name: T, id: string): Promise<void> {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;

    if (tableSchema.schemaType === "view") {
      throw new Error(`Cannot delete from view: ${name}`);
    }

    const { error } = await this.client.from(dbTableName).delete().eq("id", id);

    if (error) throw pgErrorToError(error);
  }

  async executeCustomQuery<T extends TableOrView>(
    name: T,
    query: (baseQuery: any) => any,
  ): Promise<any[]> {
    const dbTableName = this.getDatabaseTableName(name);
    const baseQuery = this.client.from(dbTableName).select("*");
    const customQuery = query(baseQuery);

    const { data, error } = await customQuery;

    if (error) throw pgErrorToError(error);
    return data.map((item) => this.convertResponse(item, name));
  }

  subscribeToChanges<T extends TableOrView>(
    name: T,
    callback: SubscriptionCallback,
  ): void {
    const dbTableName = this.getDatabaseTableName(name);
    const tableSchema = getSchema(name, "database")!;

    // Unsubscribe from existing subscription if any
    this.unsubscribeFromChanges(name);

    const subscription = this.client
      .channel(`public:${dbTableName}`)
      .on(
        "postgres_changes",
        { event: "*", tableSchema: "public", table: dbTableName },
        (payload) => {
          this.fetchAll(name)
            .then((data) => {
              callback(data);
            })
            .catch((error) => {
              console.error("Error fetching updated data:", error);
            });
        },
      )
      .subscribe();

    this.subscriptions.set(name, subscription);
  }

  unsubscribeFromChanges(name: TableOrView): void {
    const subscription = this.subscriptions.get(name);
    if (subscription) {
      this.client.removeChannel(subscription);
      this.subscriptions.delete(name);
    }
  }

  unsubscribeFromAllChanges(): void {
    this.subscriptions.forEach((subscription, name) => {
      this.client.removeChannel(subscription);
    });
    this.subscriptions.clear();
  }

  // Helper method to convert any data to frontend format
  convertToFrontendFormat<T extends TableOrView>(name: T, data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.convertResponse(item, name));
    } else {
      return this.convertResponse(data, name);
    }
  }

  // buildQuery<T extends Record<string, any> = any>(queryName: string, table: string): PostgrestQueryBuilder<T> {
  //     const builder = this.client.from(table);
  //     this.queryBuilders.set(queryName, builder);
  //     return builder;
  // }
  //
  // getQuery<T extends Record<string, any> = any>(queryName: string): PostgrestQueryBuilder<T> | undefined {
  //     return this.queryBuilders.get(queryName) as PostgrestQueryBuilder<T> | undefined;
  // }
  //
  // async executeQuery<T extends Record<string, any> = any>(
  //     queryName: string,
  //     params?: Partial<T>
  // ): Promise<PostgrestResponse<T>> {
  //     const builder = this.getQuery<T>(queryName);
  //     if (!builder) {
  //         throw new Error(`Query "${queryName}" not found`);
  //     }
  //
  //     let query = builder.select();
  //
  //     // Apply parameters if provided
  //     if (params) {
  //         Object.entries(params).forEach(([key, value]) => {
  //             query = query.eq(key, value);
  //         });
  //     }
  //
  //     return await query;
  // }
  //
  // async fetchSimpleWithRelations<T extends TableOrView>(
  //     dbTableName: string,
  //     id: string,
  //     options: QueryOptions<T> & { relations?: string[] }
  // ): Promise<PostgrestSingleResponse<PostgrestMap>> {
  //     const queryName = `fetchSimpleWithRelations_${dbTableName}`;
  //     let builder = this.getQuery(queryName);
  //
  //     if (!builder) {
  //         builder = this.buildQuery(queryName, dbTableName);
  //     }
  //
  //     let query = builder.select('*').eq('id', id);
  //
  //     if (options.relations) {
  //         options.relations.forEach(relation => {
  //             query = query.select(`${relation}(*)`);
  //         });
  //     }
  //
  //     if (options.limit) {
  //         query = query.limit(options.limit);
  //     }
  //
  //     if (options.offset) {
  //         query = query.range(options.offset, options.offset + (options.limit || 1) - 1);
  //     }
  //
  //     if (options.sorts) {
  //         options.sorts.forEach(sort => {
  //             query = query.order(sort.column as string, { ascending: sort.ascending });
  //         });
  //     }
  //
  //     const response = await query.single();
  //     if (response.error) {
  //         console.error(`Error fetching data for ${dbTableName}: ${response.error.message}`);
  //         return { data: null, error: response.error };
  //     }
  //
  //     return {
  //         data: this.convertResponse(response.data, dbTableName as any),
  //         error: null
  //     };
  // }

  // async fetchFk<T extends TableOrView>(
  //     dbTableName: string,
  //     data: any,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     const foreignKeyQueries = tableSchema.relationships.foreignKeys.map(fk => {
  //         return this.client
  //             .from(fk.relatedTable)
  //             .select('*')
  //             .eq(fk.relatedColumn, data[fk.column]);
  //     });
  //
  //     const foreignKeyResults = await Promise.all(foreignKeyQueries);
  //     foreignKeyResults.forEach((result, index) => {
  //         const {data: relatedData, error} = result;
  //         if (error) {
  //             console.error(`Error fetching FK data for ${tableSchema.relationships.foreignKeys[index].relatedTable}: ${error.message}`);
  //             return;
  //         }
  //         data[tableSchema.relationships.foreignKeys[index].relatedTable] = relatedData;
  //     });
  //
  //     return data;
  // }
  //
  // async fetchIfk<T extends TableOrView>(
  //     dbTableName: string,
  //     data: any,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     const inverseForeignKeyQueries = tableSchema.relationships.inverseForeignKeys.map(ifk => {
  //         return this.client
  //             .from(ifk.relatedTable)
  //             .select('*')
  //             .eq(ifk.relatedColumn, data.id);
  //     });
  //
  //     const inverseForeignKeyResults = await Promise.all(inverseForeignKeyQueries);
  //     inverseForeignKeyResults.forEach((result, index) => {
  //         const {data: relatedData, error} = result;
  //         if (error) {
  //             console.error(`Error fetching IFK data for ${tableSchema.relationships.inverseForeignKeys[index].relatedTable}: ${error.message}`);
  //             return;
  //         }
  //         data[tableSchema.relationships.inverseForeignKeys[index].relatedTable] = relatedData;
  //     });
  //
  //     return data;
  // }
  //
  // async fetchM2m<T extends TableOrView>(
  //     dbTableName: string,
  //     data: any,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     const manyToManyQueries = tableSchema.relationships.manyToMany.map(m2m => {
  //         return this.client
  //             .from(m2m.junctionTable)
  //             .select('*')
  //             .eq('main_table_column', data.id);  // Assuming 'main_table_column' is the column in the junction table that relates to the main table
  //     });
  //
  //     const manyToManyResults = await Promise.all(manyToManyQueries);
  //
  //     await Promise.all(
  //         manyToManyResults.map(async (result, index) => {
  //             const {data: junctionData, error} = result;
  //             if (error) {
  //                 console.error(`Error fetching junction table data for ${tableSchema.relationships.manyToMany[index].junctionTable}: ${error.message}`);
  //                 return;
  //             }
  //
  //             const relatedDataQueries = junctionData.map(junctionRecord => {
  //                 return this.client
  //                     .from(tableSchema.relationships.manyToMany[index].relatedTable)
  //                     .select('*')
  //                     .eq('related_column', junctionRecord.related_column);
  //             });
  //
  //             const relatedDataResults = await Promise.all(relatedDataQueries);
  //             data[tableSchema.relationships.manyToMany[index].relatedTable] = relatedDataResults.map(res => res.data);
  //         })
  //     );
  //
  //     return data;
  // }
  //
  // async fetchWithFkAndIfk<T extends TableOrView>(
  //     dbTableName: string,
  //     id: string,
  //     options: Omit<QueryOptions<T>, 'limit' | 'offset'>,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     let data = await this.fetchSimple(dbTableName, id, options);
  //     if (!data) return null;
  //
  //     data = await this.fetchFk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     data = await this.fetchIfk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     return data;
  // }
  //
  // async fetchWithFkIfkAndM2M<T extends TableOrView>(
  //     dbTableName: string,
  //     id: string,
  //     options: Omit<QueryOptions<T>, 'limit' | 'offset'>,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     let data = await this.fetchSimple(dbTableName, id, options);
  //     if (!data) return null;
  //
  //     data = await this.fetchFk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     data = await this.fetchIfk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     data = await this.fetchM2m(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     return data;
  // }
  //
  //
  // async fetchWithFkAndM2M<T extends TableOrView>(
  //     dbTableName: string,
  //     id: string,
  //     options: Omit<QueryOptions<T>, 'limit' | 'offset'>,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     let data = await this.fetchSimple(dbTableName, id, options);
  //     if (!data) return null;
  //
  //     data = await this.fetchFk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     data = await this.fetchM2m(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     return data;
  // }
  //
  // async fetchWithIfkAndM2M<T extends TableOrView>(
  //     dbTableName: string,
  //     id: string,
  //     options: Omit<QueryOptions<T>, 'limit' | 'offset'>,
  //     tableSchema: TableSchema
  // ): Promise<any> {
  //     let data = await this.fetchSimple(dbTableName, id, options);
  //     if (!data) return null;
  //
  //     data = await this.fetchIfk(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     data = await this.fetchM2m(dbTableName, data, tableSchema);
  //     if (!data) return null;
  //
  //     return data;
  // }
}

export const databaseApi = new DatabaseApiWrapper(supabase);
