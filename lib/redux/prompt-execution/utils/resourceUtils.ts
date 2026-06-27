/**
 * Resource Management Utilities
 * 
 * Centralized functions for handling resources (files, images, URLs, etc.)
 * Used across the app for consistent resource management.
 * 
 * @module resourceUtils
 */

import type { Resource } from '@/features/agents/resources/types';

/**
 * Serialize resources for API consumption
 * Converts resource objects into a formatted string for message context
 * 
 * @example
 * ```typescript
 * const resources = [
 *   { type: 'file', data: { filename: 'report.pdf' } },
 *   { type: 'image_url', data: { url: 'https://...', filename: 'chart.png' } }
 * ];
 * 
 * const serialized = serializeResourcesForAPI(resources);
 * // Returns: "[Attachment 1: report.pdf]\n[Image 2: chart.png]"
 * ```
 */
export function serializeResourcesForAPI(resources: Resource[]): string {
  const serialized = resources.map((resource, index) => {
    const attachmentNumber = index + 1;
    
    switch (resource.type) {
      case 'file': {
        const filename = 
          resource.data.filename || 
          resource.data.details?.filename || 
          'file';
        return `[Attachment ${attachmentNumber}: ${filename}]`;
      }
      
      case 'image_url': {
        const display = resource.data.alt || resource.data.url;
        return `[Image ${attachmentNumber}: ${display}]`;
      }
      
      case 'file_url': {
        const filename = resource.data.filename || 'file';
        return `[File URL ${attachmentNumber}: ${filename}]`;
      }
      
      case 'webpage': {
        const title = resource.data.title || resource.data.url;
        return `[Webpage ${attachmentNumber}: ${title}]`;
      }
      
      case 'youtube': {
        const title = resource.data.title || resource.data.videoId;
        return `[YouTube ${attachmentNumber}: ${title}]`;
      }
      
      case 'audio': {
        const filename = resource.data.filename || 'audio';
        return `[Audio ${attachmentNumber}: ${filename}]`;
      }
      
      case 'note': {
        const label = resource.data.label;
        return `[Note ${attachmentNumber}: ${label}]`;
      }
      
      case 'task': {
        const title = resource.data.title;
        return `[Task ${attachmentNumber}: ${title}]`;
      }
      
      case 'project': {
        const name = resource.data.name;
        return `[Project ${attachmentNumber}: ${name}]`;
      }
      
      case 'table': {
        const tableName = resource.data.table_name;
        return `[Table ${attachmentNumber}: ${tableName}]`;
      }
      
      default:
        return `[Resource ${attachmentNumber}]`;
    }
  }).filter(Boolean);
  
  return serialized.join('\n');
}

/**
 * Validate a resource object
 * Ensures resource has required fields and valid structure
 */
export function validateResource(resource: Resource): {
  valid: boolean;
  error?: string;
} {
  if (!resource || typeof resource !== 'object') {
    return { valid: false, error: 'Resource must be an object' };
  }
  
  if (!resource.type) {
    return { valid: false, error: 'Resource type is required' };
  }
  
  if (!resource.data) {
    return { valid: false, error: 'Resource data is required' };
  }
  
  // Type-specific validation
  switch (resource.type) {
    case 'file':
      if (!resource.data.filename && !resource.data.url && !resource.data.details?.filename) {
        return { 
          valid: false, 
          error: 'File resource must have filename or url' 
        };
      }
      break;
      
    case 'file_url':
      if (!resource.data.url) {
        return { 
          valid: false, 
          error: 'File URL resource must have url' 
        };
      }
      break;
      
    case 'image_url':
      if (!resource.data.url) {
        return { valid: false, error: 'Image resource must have url' };
      }
      break;
      
    case 'webpage':
      if (!resource.data.url) {
        return { valid: false, error: 'Webpage resource must have url' };
      }
      break;
      
    case 'youtube':
      if (!resource.data.videoId && !resource.data.url) {
        return { 
          valid: false, 
          error: 'YouTube resource must have videoId or url' 
        };
      }
      break;
      
    case 'audio':
      if (!resource.data.filename && !resource.data.url) {
        return { 
          valid: false, 
          error: 'Audio resource must have filename or url' 
        };
      }
      break;
      
    case 'note':
      if (!resource.data.id || !resource.data.label) {
        return { 
          valid: false, 
          error: 'Note resource must have id and label' 
        };
      }
      break;
      
    case 'task':
      if (!resource.data.id || !resource.data.title) {
        return { 
          valid: false, 
          error: 'Task resource must have id and title' 
        };
      }
      break;
      
    case 'project':
      if (!resource.data.id || !resource.data.name) {
        return { 
          valid: false, 
          error: 'Project resource must have id and name' 
        };
      }
      break;
      
    case 'table':
      if (!resource.data.table_id || !resource.data.table_name) {
        return { 
          valid: false, 
          error: 'Table resource must have table_id and table_name' 
        };
      }
      break;
  }
  
  return { valid: true };
}

/**
 * Get resource display name
 * Returns a human-readable name for the resource
 */
export function getResourceDisplayName(resource: Resource): string {
  switch (resource.type) {
    case 'file':
      return resource.data.filename || 
             resource.data.details?.filename || 
             'Untitled File';
    
    case 'image_url':
      return resource.data.alt || resource.data.url || 'Image';
    
    case 'file_url':
      return resource.data.filename || 'File';
    
    case 'webpage':
      return resource.data.title || resource.data.url || 'Webpage';
    
    case 'youtube':
      return resource.data.title || 
             `Video: ${resource.data.videoId}` || 
             'YouTube Video';
    
    case 'audio':
      return resource.data.filename || 'Audio File';
    
    case 'note':
      return resource.data.label;
    
    case 'task':
      return resource.data.title;
    
    case 'project':
      return resource.data.name;
    
    case 'table':
      return resource.data.table_name;
    
    default:
      return 'Resource';
  }
}

/**
 * Get resource icon name (lucide-react)
 * Returns appropriate icon name for the resource type
 */
export function getResourceIcon(resource: Resource): string {
  switch (resource.type) {
    case 'file':
      return 'File';
    case 'image_url':
      return 'Image';
    case 'file_url':
      return 'FileText';
    case 'webpage':
      return 'Globe';
    case 'youtube':
      return 'Video';
    case 'audio':
      return 'AudioLines';
    case 'note':
      return 'StickyNote';
    case 'task':
      return 'CheckSquare';
    case 'project':
      return 'FolderKanban';
    case 'table':
      return 'Table';
    default:
      return 'Paperclip';
  }
}

/**
 * Calculate total size of resources
 * Returns total size in bytes (only for resources that have size information)
 */
export function getTotalResourceSize(resources: Resource[]): number {
  return resources.reduce((total, resource) => {
    let size = 0;
    
    switch (resource.type) {
      case 'file':
        // Only FileResourceData.size exists (not in details)
        size = resource.data.size || 0;
        break;
      case 'image_url':
        // Image URLs typically don't have size info
        size = 0;
        break;
      case 'audio':
        // AudioResourceData doesn't have size property
        size = 0;
        break;
      // Other resource types don't have size property
      default:
        size = 0;
    }
    
    return total + (typeof size === 'number' ? size : 0);
  }, 0);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if resource is an image
 */
export function isImageResource(resource: Resource): boolean {
  if (resource.type === 'image_url') return true;
  
  if (resource.type === 'file') {
    const filename = resource.data.filename || resource.data.details?.filename || '';
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
  }
  
  if (resource.type === 'file_url') {
    const filename = resource.data.filename || '';
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
  }
  
  return false;
}

/**
 * Get resource preview URL
 * Returns URL for preview if available
 */
export function getResourcePreviewUrl(resource: Resource): string | null {
  switch (resource.type) {
    case 'image_url':
      return resource.data.url;
    
    case 'file':
      if (isImageResource(resource)) {
        return resource.data.url || null;
      }
      return null;
    
    case 'file_url':
      if (isImageResource(resource)) {
        return resource.data.url;
      }
      return null;
    
    default:
      return null;
  }
}

/**
 * Deduplicate resources
 * Removes duplicate resources based on content
 */
export function deduplicateResources(resources: Resource[]): Resource[] {
  const seen = new Set<string>();
  
  return resources.filter(resource => {
    // Create a unique key for the resource based on type-specific identifiers
    let key: string;
    
    switch (resource.type) {
      case 'file':
        key = JSON.stringify({
          type: resource.type,
          url: resource.data.url,
          filename: resource.data.filename || resource.data.details?.filename
        });
        break;
      
      case 'image_url':
        key = JSON.stringify({
          type: resource.type,
          url: resource.data.url
        });
        break;
      
      case 'file_url':
        key = JSON.stringify({
          type: resource.type,
          url: resource.data.url,
          filename: resource.data.filename
        });
        break;
      
      case 'webpage':
        key = JSON.stringify({
          type: resource.type,
          url: resource.data.url
        });
        break;
      
      case 'youtube':
        key = JSON.stringify({
          type: resource.type,
          videoId: resource.data.videoId,
          url: resource.data.url
        });
        break;
      
      case 'audio':
        key = JSON.stringify({
          type: resource.type,
          id: resource.data.id,
          url: resource.data.url
        });
        break;
      
      case 'note':
        key = JSON.stringify({
          type: resource.type,
          id: resource.data.id
        });
        break;
      
      case 'task':
        key = JSON.stringify({
          type: resource.type,
          id: resource.data.id
        });
        break;
      
      case 'project':
        key = JSON.stringify({
          type: resource.type,
          id: resource.data.id
        });
        break;
      
      case 'table':
        key = JSON.stringify({
          type: resource.type,
          table_id: resource.data.table_id,
          row_id: resource.data.row_id,
          column_name: resource.data.column_name
        });
        break;
      
      default:
        // Fallback for any unknown types
        key = JSON.stringify(resource);
    }
    
    if (seen.has(key)) {
      return false;
    }
    
    seen.add(key);
    return true;
  });
}

/**
 * Sort resources by type and name
 */
export function sortResources(resources: Resource[]): Resource[] {
  const typeOrder = [
    'note',
    'task',
    'project',
    'table',
    'image_url',
    'file',
    'file_url',
    'audio',
    'webpage',
    'youtube'
  ];
  
  return [...resources].sort((a, b) => {
    // Sort by type first
    const typeIndexA = typeOrder.indexOf(a.type);
    const typeIndexB = typeOrder.indexOf(b.type);
    
    // Handle unknown types (put them at the end)
    const indexA = typeIndexA === -1 ? typeOrder.length : typeIndexA;
    const indexB = typeIndexB === -1 ? typeOrder.length : typeIndexB;
    
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    
    // Then sort by name
    const nameA = getResourceDisplayName(a);
    const nameB = getResourceDisplayName(b);
    
    return nameA.localeCompare(nameB);
  });
}

