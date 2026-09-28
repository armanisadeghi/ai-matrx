/**
 * FIELD NAME → KEY, THE PURE RULE (moved here from `utils/user-table-utls/field-name-sanitizer.ts`
 * by DATA-V2-BASICS-2 so record-store code never imports the older store's module; the old path
 * re-exports this file until it retires with the older grid).
 *
 * Field name sanitization and validation utilities
 * Ensures field names follow snake_case convention for database compatibility
 */


/**
 * Sanitize a display name into a valid field name
 * Converts to lowercase, replaces special chars with underscores, follows snake_case
 * 
 * @param displayName - The user-entered display name
 * @returns Sanitized field name in snake_case format
 * 
 * @example
 * sanitizeFieldName("Total Revenue") // returns "total_revenue"
 * sanitizeFieldName("Price ($)") // returns "price"
 * sanitizeFieldName("2024 Sales") // returns "_2024_sales"
 */
export function sanitizeFieldName(displayName: string): string {
  if (!displayName || typeof displayName !== 'string') {
    return '';
  }

  return displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '') // Remove special chars (keep letters, numbers, spaces, underscores)
    .replace(/\s+/g, '_')          // Spaces to underscores
    .replace(/^_+|_+$/g, '')       // Trim leading/trailing underscores
    .replace(/_+/g, '_')           // Collapse multiple underscores
    .replace(/^(\d)/, '_$1');      // Prefix if starts with number
}

/**
 * Validate that a field name follows the required format
 * Must start with lowercase letter, contain only lowercase letters, numbers, and underscores
 * 
 * @param fieldName - The field name to validate
 * @returns true if valid, false otherwise
 * 
 * @example
 * validateFieldName("total_revenue") // returns true
 * validateFieldName("Total Revenue") // returns false
 * validateFieldName("123_sales") // returns false
 */
export function validateFieldName(fieldName: string): boolean {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }
  
  return /^[a-z][a-z0-9_]*$/.test(fieldName);
}

/**
 * Check if a field name is already in safe/sanitized format
 * 
 * @param fieldName - The field name to check
 * @returns true if already sanitized, false otherwise
 */
export function isFieldNameSafe(fieldName: string): boolean {
  if (!fieldName) {
    return false;
  }
  
  // Check if already sanitized (no changes needed)
  return fieldName === sanitizeFieldName(fieldName);
}

/**
 * Get a friendly error message for invalid field names
 * 
 * @param fieldName - The invalid field name
 * @returns User-friendly error message
 */
export function getFieldNameError(fieldName: string): string | null {
  if (!fieldName) {
    return 'Field name cannot be empty';
  }
  
  if (!validateFieldName(fieldName)) {
    if (/^[A-Z]/.test(fieldName)) {
      return 'Field name must start with a lowercase letter';
    }
    if (/^[0-9]/.test(fieldName)) {
      return 'Field name cannot start with a number';
    }
    if (/[A-Z]/.test(fieldName)) {
      return 'Field name must be lowercase';
    }
    if (/\s/.test(fieldName)) {
      return 'Field name cannot contain spaces';
    }
    if (/[^a-z0-9_]/.test(fieldName)) {
      return 'Field name can only contain lowercase letters, numbers, and underscores';
    }
    return 'Invalid field name format';
  }
  
  return null;
}
