import type {
  ResourceCategory as ResourceCategoryKind,
  ResourceCollection,
  ResourceItem as ResourceItemKind,
} from "@/features/content-ir/kinds/generated/kinds.generated";

/** THE SHAPES COME FROM THE REGISTRY; the parser only guarantees the render key. */
export type ResourceItem = Omit<ResourceItemKind, "__kind" | "id"> &
  Required<Pick<ResourceItemKind, "description" | "type">> & { id: string };

export type ResourceCategory = Omit<
  ResourceCategoryKind,
  "__kind" | "id" | "resources"
> & { id: string; resources: ResourceItem[] };

export type ResourceCollectionData = Omit<
  ResourceCollection,
  "__kind" | "categories"
> & { categories: ResourceCategory[] };

/**
 * Parses markdown content into structured resource collection data
 * 
 * Expected format:
 * ### Title
 * Description (optional)
 * 
 * **Category Name**
 * - [Resource Title](url) - Description
 * - [Resource Title](url) - Description (duration) [type] {difficulty} *rating*
 * 
 * **Another Category**
 * - [Resource Title](url) - Description
 */
export function parseResourcesMarkdown(content: string): ResourceCollectionData {
  const lines = content.split('\n').filter(line => line.trim());
  
  let title = 'Resource Collection';
  let description: string | undefined;
  const categories: ResourceCategory[] = [];
  let currentCategory: ResourceCategory | null = null;
  let resourceIdCounter = 1;
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

    // Parse category headers (**Category Name**)
    if (line.startsWith('**') && line.endsWith('**')) {
      // Save previous category if exists
      if (currentCategory && currentCategory.resources.length > 0) {
        categories.push(currentCategory);
      }

      const categoryName = line.replace(/^\*\*|\*\*$/g, '').trim();
      currentCategory = {
        id: `category-${categoryIdCounter++}`,
        name: categoryName,
        resources: []
      };
      continue;
    }

    // Parse resource items (- [Title](url) - Description)
    if (line.startsWith('- ') && currentCategory) {
      const resource = parseResourceLine(line, `resource-${resourceIdCounter++}`);
      if (resource) {
        currentCategory.resources.push(resource);
      }
      continue;
    }
  }

  // Add the last category if it exists
  if (currentCategory && currentCategory.resources.length > 0) {
    categories.push(currentCategory);
  }

  // If no categories were found, create a default one with all resources
  if (categories.length === 0 && lines.some(line => line.startsWith('- '))) {
    const defaultCategory: ResourceCategory = {
      id: 'category-1',
      name: 'Resources',
      resources: []
    };

    for (const line of lines) {
      if (line.startsWith('- ')) {
        const resource = parseResourceLine(line, `resource-${resourceIdCounter++}`);
        if (resource) {
          defaultCategory.resources.push(resource);
        }
      }
    }

    if (defaultCategory.resources.length > 0) {
      categories.push(defaultCategory);
    }
  }

  return {
    title,
    description,
    categories
  };
}

/**
 * Parses a single resource line into a ResourceItem
 * 
 * Formats supported:
 * - [Title](url) - Description
 * - [Title](url) - Description (2 hours)
 * - [Title](url) - Description [video]
 * - [Title](url) - Description {intermediate}
 * - [Title](url) - Description *4*
 * - [Title](url) - Description (2 hours) [video] {intermediate} *4*
 */
function parseResourceLine(line: string, id: string): ResourceItem | null {
  // Remove leading "- "
  const content = line.replace(/^- /, '').trim();
  
  // Extract title and URL using regex
  const titleUrlMatch = content.match(/^\[([^\]]+)\]\(([^)]+)\)/);
  if (!titleUrlMatch) {
    return null;
  }

  const title = titleUrlMatch[1].trim();
  const url = titleUrlMatch[2].trim();
  
  // Get the rest of the content after the title/URL
  const restContent = content.substring(titleUrlMatch[0].length).trim();
  
  // Extract description (everything before the first parenthesis, bracket, or asterisk)
  let description = '';
  const descMatch = restContent.match(/^[-–—]\s*([^([{*]+)/);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  // Extract duration from parentheses (2 hours), (45 min), etc.
  let duration: string | undefined;
  const durationMatch = restContent.match(/\(([^)]+(?:hour|hr|min|minute|sec|second)[^)]*)\)/i);
  if (durationMatch) {
    duration = durationMatch[1].trim();
  }

  // Extract type from square brackets [video], [article], etc.
  let type: ResourceItem['type'] = 'other';
  const typeMatch = restContent.match(/\[([^\]]+)\]/);
  if (typeMatch) {
    const typeString = typeMatch[1].toLowerCase().trim();
    const validTypes = ['documentation', 'tool', 'video', 'article', 'course', 'book', 'tutorial', 'other'];
    if (validTypes.includes(typeString)) {
      type = typeString as ResourceItem['type'];
    } else {
      // Map common variations
      const typeMap: Record<string, ResourceItem['type']> = {
        'doc': 'documentation',
        'docs': 'documentation',
        'vid': 'video',
        'tut': 'tutorial',
        'guide': 'tutorial',
        'app': 'tool',
        'software': 'tool',
        'blog': 'article',
        'post': 'article',
        'class': 'course',
        'lesson': 'course'
      };
      type = typeMap[typeString] || 'other';
    }
  }

  // Extract difficulty from curly braces {beginner}, {intermediate}, {advanced}
  let difficulty: ResourceItem['difficulty'] | undefined;
  const difficultyMatch = restContent.match(/\{([^}]+)\}/);
  if (difficultyMatch) {
    const difficultyString = difficultyMatch[1].toLowerCase().trim();
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    if (validDifficulties.includes(difficultyString)) {
      difficulty = difficultyString as ResourceItem['difficulty'];
    } else {
      // Map common variations
      const difficultyMap: Record<string, ResourceItem['difficulty']> = {
        'basic': 'beginner',
        'intro': 'beginner',
        'easy': 'beginner',
        'medium': 'intermediate',
        'mid': 'intermediate',
        'hard': 'advanced',
        'expert': 'advanced',
        'pro': 'advanced'
      };
      difficulty = difficultyMap[difficultyString];
    }
  }

  // Extract rating from asterisks *4*, *5*, etc.
  let rating: number | undefined;
  const ratingMatch = restContent.match(/\*(\d+(?:\.\d+)?)\*/);
  if (ratingMatch) {
    const ratingValue = parseFloat(ratingMatch[1]);
    if (ratingValue >= 1 && ratingValue <= 5) {
      rating = ratingValue;
    }
  }

  // Extract tags from hashtags (if any)
  const tags: string[] = [];
  const tagMatches = restContent.match(/#(\w+)/g);
  if (tagMatches) {
    tags.push(...tagMatches.map(tag => tag.substring(1)));
  }

  return {
    id,
    title,
    url,
    description: description || title, // Fallback to title if no description
    type,
    duration,
    difficulty,
    rating,
    tags: tags.length > 0 ? tags : undefined,
    isFavorite: false,
    isCompleted: false
  };
}

/**
 * Validates that the parsed resource collection has the minimum required structure
 */
export function validateResourceCollection(collection: ResourceCollectionData): boolean {
  if (!collection.title || collection.categories.length === 0) {
    return false;
  }

  for (const category of collection.categories) {
    if (!category.name || category.resources.length === 0) {
      return false;
    }

    for (const resource of category.resources) {
      if (!resource.title || !resource.url || !resource.description) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Creates a sample resource collection for testing/demo purposes
 */
export function createSampleResourceCollection(): ResourceCollectionData {
  return {
    title: 'Learning Resources',
    description: 'A curated collection of learning materials and tools',
    categories: [
      {
        id: 'category-1',
        name: 'Documentation',
        description: 'Official documentation and references',
        resources: [
          {
            id: 'resource-1',
            title: 'Official Docs',
            url: 'https://example.com',
            description: 'Comprehensive documentation',
            type: 'documentation',
            difficulty: 'beginner',
            rating: 5
          },
          {
            id: 'resource-2',
            title: 'API Reference',
            url: 'https://api.example.com',
            description: 'Complete API guide',
            type: 'documentation',
            difficulty: 'intermediate',
            rating: 4
          }
        ]
      },
      {
        id: 'category-2',
        name: 'Tools',
        description: 'Essential development tools',
        resources: [
          {
            id: 'resource-3',
            title: 'Development Tool',
            url: 'https://tool.example.com',
            description: 'Essential development tool',
            type: 'tool',
            difficulty: 'intermediate'
          }
        ]
      }
    ]
  };
}
