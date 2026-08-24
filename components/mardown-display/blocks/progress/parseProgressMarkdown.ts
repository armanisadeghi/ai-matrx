// THE SHAPES COME FROM THE REGISTRY (`pnpm shape:types`) — this file never
// re-declares a registered kind's fields (`check:kind-type-twins`).
import type {
  ProgressPhase,
  ProgressStep,
  ProgressTracker,
} from "@/features/content-ir/kinds/generated/kinds.generated";


export type ProgressItem = Omit<ProgressStep, "__kind" | "id"> & { id: string };

export type ProgressCategory = Omit<
  ProgressPhase,
  "__kind" | "id" | "steps"
> & { id: string; steps: ProgressItem[] };

export type ProgressTrackerData = Omit<
  ProgressTracker,
  "__kind" | "phases"
> & { phases: ProgressCategory[] };

/**
 * Parses markdown content into structured progress tracker data
 * 
 * Expected format:
 * ### Title
 * Description (optional)
 * 
 * **Category Name** (percentage% complete)
 * - [x] Completed task
 * - [ ] Incomplete task
 * - [ ] Task with priority {high} and hours (2h)
 * - [ ] Optional task [optional]
 * 
 * **Another Category**
 * - [x] Another completed task
 * - [ ] Another task
 */
export function parseProgressMarkdown(content: string): ProgressTrackerData {
  const lines = content.split('\n').filter(line => line.trim());
  
  let title = 'Progress Tracker';
  let description: string | undefined;
  const phases: ProgressCategory[] = [];
  let currentCategory: ProgressCategory | null = null;
  let itemIdCounter = 1;
  let categoryIdCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;

    // Parse main title (### Title)
    if (line.startsWith('### ')) {
      title = line.replace('### ', '').trim();
      continue;
    }

    // Parse description (first non-heading line after title)
    if (!description && !line.startsWith('**') && !line.startsWith('- ') && !line.startsWith('#')) {
      description = line;
      continue;
    }

    // Parse category headers (**Category Name** or **Category Name** (percentage% complete))
    if (line.startsWith('**') && line.includes('**')) {
      // Save previous category if exists
      if (currentCategory && currentCategory.steps.length > 0) {
        phases.push(currentCategory);
      }

      // Extract category name and optional completion percentage
      const categoryMatch = line.match(/^\*\*([^*]+)\*\*(?:\s*\((\d+)%\s*complete\))?/);
      if (categoryMatch) {
        const categoryName = categoryMatch[1].trim();
        const completion_percentage = categoryMatch[2] ? parseInt(categoryMatch[2]) : undefined;
        
        currentCategory = {
          id: `category-${categoryIdCounter++}`,
          name: categoryName,
          steps: [],
          completion_percentage
        };
      }
      continue;
    }

    // Parse progress steps (- [x] or - [ ])
    if ((line.startsWith('- [x]') || line.startsWith('- [ ]')) && currentCategory) {
      const item = parseProgressItem(line, `item-${itemIdCounter++}`);
      if (item) {
        currentCategory.steps.push(item);
      }
      continue;
    }
  }

  // Add the last category if it exists
  if (currentCategory && currentCategory.steps.length > 0) {
    phases.push(currentCategory);
  }

  // If no phases were found, create a default one with all steps
  if (phases.length === 0 && lines.some(line => line.startsWith('- ['))) {
    const defaultCategory: ProgressCategory = {
      id: 'category-1',
      name: 'Tasks',
      steps: []
    };

    for (const line of lines) {
      if (line.startsWith('- [')) {
        const item = parseProgressItem(line, `item-${itemIdCounter++}`);
        if (item) {
          defaultCategory.steps.push(item);
        }
      }
    }

    if (defaultCategory.steps.length > 0) {
      phases.push(defaultCategory);
    }
  }

  // Calculate overall statistics
  const total_items = phases.reduce((sum, cat) => sum + cat.steps.length, 0);
  const completed_items = phases.reduce((sum, cat) =>
    sum + cat.steps.filter(item => item.completed).length, 0);
  const overall_progress = total_items > 0 ? Math.round((completed_items / total_items) * 100) : 0;

  return {
    title,
    description,
    phases,
    overall_progress,
    total_items,
    completed_items
  };
}

/**
 * Parses a single progress item line into a ProgressItem
 * 
 * Formats supported:
 * - [x] Completed task
 * - [ ] Incomplete task
 * - [ ] Task with priority {high}
 * - [ ] Task with hours (2h)
 * - [ ] Optional task [optional]
 * - [ ] Complex task {high} (3h) [optional]
 */
function parseProgressItem(line: string, id: string): ProgressItem | null {
  // Check if task is completed
  const completed = line.startsWith('- [x]');
  
  // Extract the main text (everything after the checkbox)
  let text = line.replace(/^- \[[x ]\]\s*/, '').trim();
  
  if (!text) return null;

  // Extract priority from curly braces {high}, {medium}, {low}
  let priority: ProgressItem['priority'] | undefined;
  const priorityMatch = text.match(/\{(high|medium|low)\}/i);
  if (priorityMatch) {
    priority = priorityMatch[1].toLowerCase() as ProgressItem['priority'];
    text = text.replace(/\{(high|medium|low)\}/i, '').trim();
  }

  // Extract estimated hours from parentheses (2h), (1.5h), (30min)
  let estimated_hours: number | undefined;
  const hoursMatch = text.match(/\((\d+(?:\.\d+)?)\s*h(?:our)?s?\)/i);
  const minutesMatch = text.match(/\((\d+)\s*min(?:ute)?s?\)/i);
  
  if (hoursMatch) {
    estimated_hours = parseFloat(hoursMatch[1]);
    text = text.replace(/\((\d+(?:\.\d+)?)\s*h(?:our)?s?\)/i, '').trim();
  } else if (minutesMatch) {
    estimated_hours = Math.round((parseInt(minutesMatch[1]) / 60) * 10) / 10; // Convert minutes to hours, rounded to 1 decimal
    text = text.replace(/\((\d+)\s*min(?:ute)?s?\)/i, '').trim();
  }

  // Check if task is optional [optional]
  let optional = false;
  if (text.includes('[optional]')) {
    optional = true;
    text = text.replace(/\[optional\]/i, '').trim();
  }

  // Extract category if specified [category:name]
  let category: string | undefined;
  const categoryMatch = text.match(/\[category:([^\]]+)\]/i);
  if (categoryMatch) {
    category = categoryMatch[1].trim();
    text = text.replace(/\[category:[^\]]+\]/i, '').trim();
  }

  // Clean up any extra whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return {
    id,
    text,
    completed,
    optional: optional || undefined,
    priority,
    estimated_hours,
    category
  };
}

/**
 * Validates that the parsed progress tracker has the minimum required structure
 */
export function validateProgressTracker(tracker: ProgressTrackerData): boolean {
  if (!tracker.title || tracker.phases.length === 0) {
    return false;
  }

  for (const category of tracker.phases) {
    if (!category.name || category.steps.length === 0) {
      return false;
    }

    for (const item of category.steps) {
      if (!item.text || typeof item.completed !== 'boolean') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Creates a sample progress tracker for testing/demo purposes
 */
export function createSampleProgressTracker(): ProgressTrackerData {
  return {
    title: 'Learning Progress',
    description: 'Track your learning journey and skill development',
    phases: [
      {
        id: 'category-1',
        name: 'React Fundamentals',
        description: 'Core React concepts and patterns',
        steps: [
          {
            id: 'item-1',
            text: 'Components & JSX',
            completed: true,
            priority: 'high',
            estimated_hours: 2
          },
          {
            id: 'item-2',
            text: 'Props & State',
            completed: true,
            priority: 'high',
            estimated_hours: 3
          },
          {
            id: 'item-3',
            text: 'Event Handling',
            completed: true,
            priority: 'medium',
            estimated_hours: 2
          },
          {
            id: 'item-4',
            text: 'Lifecycle Methods',
            completed: false,
            priority: 'medium',
            estimated_hours: 4
          },
          {
            id: 'item-5',
            text: 'Hooks',
            completed: false,
            priority: 'high',
            estimated_hours: 6
          }
        ],
        completion_percentage: 60
      },
      {
        id: 'category-2',
        name: 'Advanced Topics',
        description: 'Advanced React patterns and optimization',
        steps: [
          {
            id: 'item-6',
            text: 'Context API',
            completed: true,
            priority: 'medium',
            estimated_hours: 3
          },
          {
            id: 'item-7',
            text: 'Performance Optimization',
            completed: false,
            priority: 'high',
            estimated_hours: 5
          },
          {
            id: 'item-8',
            text: 'Testing',
            completed: false,
            priority: 'medium',
            estimated_hours: 4
          },
          {
            id: 'item-9',
            text: 'Custom Hooks',
            completed: false,
            priority: 'low',
            estimated_hours: 3,
            optional: true
          }
        ],
        completion_percentage: 25
      }
    ],
    overall_progress: 43,
    total_items: 9,
    completed_items: 4
  };
}

/**
 * Calculates dynamic statistics for a progress tracker
 */
export function calculateProgressStats(tracker: ProgressTrackerData): {
  total_items: number;
  completed_items: number;
  overall_progress: number;
  categoryStats: Array<{
    id: string;
    name: string;
    completed_items: number;
    total_items: number;
    percentage: number;
  }>;
} {
  const total_items = tracker.phases.reduce((sum, cat) => sum + cat.steps.length, 0);
  const completed_items = tracker.phases.reduce((sum, cat) =>
    sum + cat.steps.filter(item => item.completed).length, 0);
  const overall_progress = total_items > 0 ? Math.round((completed_items / total_items) * 100) : 0;

  const categoryStats = tracker.phases.map(category => {
    const categoryCompleted = category.steps.filter(item => item.completed).length;
    const categoryTotal = category.steps.length;
    const percentage = categoryTotal > 0 ? Math.round((categoryCompleted / categoryTotal) * 100) : 0;
    
    return {
      id: category.id,
      name: category.name,
      completed_items: categoryCompleted,
      total_items: categoryTotal,
      percentage
    };
  });

  return {
    total_items,
    completed_items,
    overall_progress,
    categoryStats
  };
}
