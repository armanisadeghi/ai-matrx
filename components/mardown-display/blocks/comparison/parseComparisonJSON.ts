interface ComparisonCriterion {
  name: string;
  values: (string | number | boolean)[];
  type: 'cost' | 'rating' | 'text' | 'boolean';
  weight?: number;
  higherIsBetter?: boolean;
}

interface ComparisonTableData {
  title: string;
  description?: string;
  items: string[];
  criteria: ComparisonCriterion[];
}

// Shape of a single criterion as it arrives from unvalidated user/LLM JSON —
// values are genuinely unknown until normalizeValues() type-guards them.
interface RawCriterion {
  name: string;
  values: unknown[];
  type?: ComparisonCriterion['type'];
  weight?: number;
  higherIsBetter?: boolean;
}

/**
 * Parses JSON content into structured comparison table data
 * 
 * Expected JSON format:
 * {
 *   "comparison": {
 *     "title": "Cloud Providers Comparison",
 *     "description": "Comparing major cloud providers",
 *     "items": ["AWS", "Azure", "GCP"],
 *     "criteria": [
 *       {
 *         "name": "Price",
 *         "values": ["$$", "$$$", "$$"],
 *         "type": "cost",
 *         "weight": 2
 *       },
 *       {
 *         "name": "Performance",
 *         "values": [9, 8, 9],
 *         "type": "rating"
 *       }
 *     ]
 *   }
 * }
 */
export function parseComparisonJSON(content: string): ComparisonTableData {
  try {
    // First, try to extract JSON from markdown code blocks
    let jsonContent = content.trim();
    
    // Remove markdown code block syntax if present
    const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1].trim();
    }
    
    // Parse the JSON
    const parsed = JSON.parse(jsonContent);
    
    // Extract comparison data
    const comparisonData = parsed.comparison || parsed;
    
    if (!comparisonData) {
      throw new Error('No comparison data found in JSON');
    }
    
    // Validate required fields
    if (!comparisonData.title || !comparisonData.items || !comparisonData.criteria) {
      throw new Error('Missing required fields: title, items, or criteria');
    }
    
    // Validate that all criteria have the same number of values as items
    for (const criterion of comparisonData.criteria) {
      if (criterion.values.length !== comparisonData.items.length) {
        throw new Error(`Criterion "${criterion.name}" has ${criterion.values.length} values but there are ${comparisonData.items.length} items`);
      }
    }
    
    // Process and normalize criteria
    const processedCriteria: ComparisonCriterion[] = (comparisonData.criteria as RawCriterion[]).map((criterion) => {
      // Determine type if not specified
      const type: ComparisonCriterion['type'] = criterion.type || inferTypeFromValues(criterion.values);

      // Normalize values based on type
      const normalizedValues = normalizeValues(criterion.values, type);

      return {
        name: criterion.name,
        values: normalizedValues,
        type: type,
        weight: criterion.weight || 1,
        higherIsBetter: criterion.higherIsBetter !== undefined ? criterion.higherIsBetter : getDefaultHigherIsBetter(type)
      };
    });
    
    return {
      title: comparisonData.title,
      description: comparisonData.description,
      items: comparisonData.items,
      criteria: processedCriteria
    };
    
  } catch (error) {
    console.error('Error parsing comparison JSON:', error);
    throw new Error(`Failed to parse comparison JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Infers the data type from an array of values
 */
function inferTypeFromValues(values: unknown[]): ComparisonCriterion['type'] {
  if (values.length === 0) return 'text';

  // Check if all values are boolean
  if (values.every(v => typeof v === 'boolean')) {
    return 'boolean';
  }

  // Check if all values are numbers (ratings)
  if (values.every((v): v is number => typeof v === 'number')) {
    // If numbers are between 1-5, assume it's a rating
    if (values.every(v => v >= 1 && v <= 5)) {
      return 'rating';
    }
    // Otherwise, could be cost or general numeric
    return 'cost';
  }

  // Check if values look like cost indicators ($ symbols)
  if (values.every(v => typeof v === 'string' && /^\$+$/.test(v.trim()))) {
    return 'cost';
  }

  // Check if values contain cost-like numbers
  if (values.some(v => typeof v === 'string' && /\$\d+/.test(v))) {
    return 'cost';
  }

  // Default to text
  return 'text';
}

/**
 * Normalizes values based on their type
 */
function normalizeValues(values: unknown[], type: ComparisonCriterion['type']): (string | number | boolean)[] {
  return values.map(value => {
    switch (type) {
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase().trim();
          return ['true', 'yes', '1', 'on', 'enabled', 'available', 'supported'].includes(lowerValue);
        }
        if (typeof value === 'number') return value > 0;
        return false;
        
      case 'rating':
        if (typeof value === 'number') {
          // Clamp rating between 1 and 5
          return Math.max(1, Math.min(5, value));
        }
        if (typeof value === 'string') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            return Math.max(1, Math.min(5, numValue));
          }
        }
        return 1; // Default rating
        
      case 'cost':
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          // Handle $ symbols
          if (/^\$+$/.test(value.trim())) {
            return value.trim();
          }
          // Handle numeric costs
          const match = value.match(/\$?(\d+(?:\.\d+)?)/);
          if (match) {
            return parseFloat(match[1]);
          }
          // Handle relative cost terms
          const lowerValue = value.toLowerCase().trim();
          if (['free', 'none', 'no cost'].includes(lowerValue)) return 0;
          if (['cheap', 'low', 'inexpensive'].includes(lowerValue)) return '$';
          if (['moderate', 'medium', 'average'].includes(lowerValue)) return '$$';
          if (['expensive', 'high', 'premium'].includes(lowerValue)) return '$$$';
          return value;
        }
        if (typeof value === 'boolean') return value;
        return String(value);

      case 'text':
      default:
        return String(value);
    }
  });
}

/**
 * Gets the default "higher is better" setting for a given type
 */
function getDefaultHigherIsBetter(type: ComparisonCriterion['type']): boolean {
  switch (type) {
    case 'rating':
    case 'boolean':
      return true; // Higher ratings and true values are better
    case 'cost':
      return false; // Lower costs are usually better
    case 'text':
    default:
      return true; // Default to higher is better
  }
}

/**
 * Validates that the parsed comparison table has the minimum required structure
 */
export function validateComparisonTable(comparison: ComparisonTableData): boolean {
  if (!comparison.title || !comparison.items || !comparison.criteria) {
    return false;
  }
  
  if (comparison.items.length === 0 || comparison.criteria.length === 0) {
    return false;
  }
  
  // Check that all criteria have the correct number of values
  for (const criterion of comparison.criteria) {
    if (!criterion.name || !criterion.values || criterion.values.length !== comparison.items.length) {
      return false;
    }
    
    if (!['cost', 'rating', 'text', 'boolean'].includes(criterion.type)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Creates a sample comparison table for testing/demo purposes
 */
export function createSampleComparisonTable(): ComparisonTableData {
  return {
    title: 'Cloud Providers Comparison',
    description: 'Comparing major cloud service providers across key criteria',
    items: ['AWS', 'Microsoft Azure', 'Google Cloud Platform'],
    criteria: [
      {
        name: 'Price',
        values: ['$$', '$$$', '$$'],
        type: 'cost',
        weight: 2,
        higherIsBetter: false
      },
      {
        name: 'Performance',
        values: [9, 8, 9],
        type: 'rating',
        weight: 3,
        higherIsBetter: true
      },
      {
        name: 'Ease of Use',
        values: [7, 8, 9],
        type: 'rating',
        weight: 2,
        higherIsBetter: true
      },
      {
        name: 'Global Presence',
        values: [true, true, true],
        type: 'boolean',
        weight: 1,
        higherIsBetter: true
      },
      {
        name: 'Support Quality',
        values: ['Good', 'Excellent', 'Very Good'],
        type: 'text',
        weight: 2,
        higherIsBetter: true
      }
    ]
  };
}

/**
 * Converts comparison table data back to JSON format
 */
export function comparisonToJSON(comparison: ComparisonTableData): string {
  const jsonData = {
    comparison: {
      title: comparison.title,
      description: comparison.description,
      items: comparison.items,
      criteria: comparison.criteria.map(criterion => ({
        name: criterion.name,
        values: criterion.values,
        type: criterion.type,
        weight: criterion.weight,
        higherIsBetter: criterion.higherIsBetter
      }))
    }
  };
  
  return JSON.stringify(jsonData, null, 2);
}

/**
 * Attempts to parse either JSON or create from template
 */
export function parseComparisonContent(content: string): ComparisonTableData {
  // First try to parse as JSON
  try {
    return parseComparisonJSON(content);
  } catch (jsonError) {
    // If JSON parsing fails, try to create a simple comparison from text
    console.warn('JSON parsing failed, attempting to create simple comparison:', jsonError);
    
    // Create a basic comparison table from the content
    return {
      title: 'Comparison Table',
      description: 'Generated from content',
      items: ['Item A', 'Item B', 'Item C'],
      criteria: [
        {
          name: 'Criterion 1',
          values: ['Good', 'Better', 'Best'],
          type: 'text' as const,
          weight: 1,
          higherIsBetter: true
        }
      ]
    };
  }
}
