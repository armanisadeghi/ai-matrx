/**
 * Unified user data reference structure (LEGACY table-reference producer shape).
 *
 * Mirrors the CANONICAL Matrx reference item for the `table*` taxonomy
 * (docs/protocol/MATRX_REFERENCES.md): the identity ids (`table_id`, `row_id`,
 * `column_name`) are authoritative; `table_name`, `column_display_name`, and
 * `description` are non-authoritative display hints. Field names match the
 * canonical wire shape so this maps 1:1 to a reference item via
 * `features/matrx-envelope/bookmarkToReference`. All fields except `type`,
 * `table_id`, `table_name`, and `description` are optional, used per reference type.
 */
export interface UserDataReference {
  type: 'full_table' | 'table_row' | 'table_column' | 'table_cell';
  table_id: string;
  table_name: string;
  description: string;
  
  // Optional fields used based on type
  row_id?: string;
  column_name?: string;
  column_display_name?: string;
}

/**
 * Type guard to check if a reference is a full table reference
 */
export function isFullTableReference(ref: any): ref is UserDataReference {
  return ref?.type === 'full_table';
}

/**
 * Type guard to check if a reference is a row reference
 */
export function isRowReference(ref: any): ref is UserDataReference {
  return ref?.type === 'table_row';
}

/**
 * Type guard to check if a reference is a column reference
 */
export function isColumnReference(ref: any): ref is UserDataReference {
  return ref?.type === 'table_column';
}

/**
 * Type guard to check if a reference is a cell reference
 */
export function isCellReference(ref: any): ref is UserDataReference {
  return ref?.type === 'table_cell';
}

/**
 * Type guard to check if an object is any type of user data reference
 */
export function isUserDataReference(ref: any): ref is UserDataReference {
  return isFullTableReference(ref) || isRowReference(ref) || isColumnReference(ref) || isCellReference(ref);
}

/**
 * Helper function to get a human-readable title for a reference
 */
export function getUserDataReferenceTitle(reference: UserDataReference): string {
  switch (reference.type) {
    case 'full_table':
      return `Table: ${reference.table_name}`;
    case 'table_row':
      return `Row ${reference.row_id} from ${reference.table_name}`;
    case 'table_column':
      return `Column "${reference.column_display_name}" from ${reference.table_name}`;
    case 'table_cell':
      return `Cell "${reference.column_display_name}" in row ${reference.row_id}`;
    default:
      return 'Unknown Reference';
  }
}

/**
 * Helper function to get the reference type as a human-readable string
 */
export function getUserDataReferenceTypeLabel(reference: UserDataReference): string {
  switch (reference.type) {
    case 'full_table':
      return 'Table';
    case 'table_row':
      return 'Row';
    case 'table_column':
      return 'Column';
    case 'table_cell':
      return 'Cell';
    default:
      return 'Unknown';
  }
} 