/**
 * FIELD NAME → KEY, THE PURE RULE (DATA-V2-BASICS-2).
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
