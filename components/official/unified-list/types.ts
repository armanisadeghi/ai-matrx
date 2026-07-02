/**
 * Unified List Layout System - Type Definitions
 * 
 * A comprehensive, type-safe configuration system for list/grid pages
 * that supports both flat and hierarchical data structures.
 * 
 * Features:
 * - Mobile-first design with safe area handling
 * - Voice input integration
 * - Dynamic filtering and sorting
 * - Hierarchical navigation (folders, breadcrumbs)
 * - Customizable actions and modals
 * - Type-safe configuration
 */

import { ReactNode, ComponentType } from 'react';
import { LucideIcon } from 'lucide-react';

// ============================================================================
// CORE DATA TYPES
// ============================================================================

/**
 * Base item interface that all list items must extend
 */
export interface BaseListItem {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Hierarchical item interface for nested data structures
 */
export interface HierarchicalListItem extends BaseListItem {
  parentId?: string | null;
  children?: HierarchicalListItem[];
  type?: 'folder' | 'item';
  path?: string[]; // Breadcrumb path
}

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

/**
 * Main configuration object for UnifiedListLayout
 */
export interface UnifiedListLayoutConfig<T extends BaseListItem> {
  // Page Identity
  page: {
    title: string;
    icon?: LucideIcon;
    description?: string;
    emptyMessage?: string;
    emptyAction?: {
      label: string;
      onClick: () => void;
    };
  };

  // Search Configuration
  search: SearchConfig<T>;

  // Filter Configuration (optional)
  filters?: FilterConfig<T>;

  // Actions Configuration
  actions: ActionConfig[];

  // Layout Options
  layout: LayoutConfig;

  // Item Actions (CRUD operations)
  itemActions?: ItemActionsConfig<T>;

  // Hierarchy Configuration (for nested data)
  hierarchy?: HierarchyConfig<T>;

  // Voice Input Configuration
  voice?: VoiceConfig;

  // Advanced Options
  advanced?: AdvancedConfig<T>;
}

// ============================================================================
// SEARCH CONFIGURATION
// ============================================================================

export interface SearchConfig<T extends BaseListItem> {
  enabled: boolean;
  placeholder: string;
  
  /**
   * Filter function for search
   * @param item - The item to filter
   * @param searchTerm - The search term (lowercase)
   * @returns true if item matches search
   */
  filterFn: (item: T, searchTerm: string) => boolean;
  
  /**
   * Optional: Custom search component
   */
  customComponent?: ComponentType<SearchComponentProps>;
}

export interface SearchComponentProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onVoiceClick?: () => void;
}

// ============================================================================
// FILTER CONFIGURATION
// ============================================================================

export interface FilterConfig<T extends BaseListItem> {
  /**
   * Sort options available to the user
   */
  sortOptions: SortOption<T>[];

  /**
   * Default sort option value
   */
  defaultSort?: string;

  /**
   * Custom filter definitions
   */
  customFilters?: FilterDefinition<T>[];

  /**
   * Optional: Custom filter modal component
   */
  customComponent?: ComponentType<FilterModalComponentProps<T>>;
}

export interface SortOption<T extends BaseListItem> {
  value: string;
  label: string;
  
  /**
   * Sort function
   * @returns negative if a < b, positive if a > b, 0 if equal
   */
  sortFn: (a: T, b: T) => number;
}

export interface FilterDefinition<T extends BaseListItem> {
  id: string;
  label: string;
  type: 'select' | 'multiselect' | 'tags' | 'toggle' | 'custom';
  
  /**
   * Options for select/multiselect/tags types
   */
  options?: Array<{ value: string; label: string }>;
  
  /**
   * Filter function
   * @param item - The item to filter
   * @param value - The filter value (type depends on filter type)
   * @returns true if item passes filter
   */
  filterFn: (item: T, value: unknown) => boolean;

  /**
   * Default value for this filter
   */
  defaultValue?: unknown;
  
  /**
   * Custom component for rendering this filter
   */
  component?: ComponentType<CustomFilterComponentProps<T>>;
  
  /**
   * Optional: Extract options dynamically from items
   */
  extractOptions?: (items: T[]) => Array<{ value: string; label: string }>;
}

export interface FilterModalComponentProps<T extends BaseListItem> {
  isOpen: boolean;
  onClose: () => void;
  items: T[];
  currentFilters: Record<string, unknown>;
  onFiltersChange: (filters: Record<string, unknown>) => void;
  sortBy: string;
  onSortChange: (sortBy: string) => void;
}

export interface CustomFilterComponentProps<T extends BaseListItem> {
  filter: FilterDefinition<T>;
  value: unknown;
  onChange: (value: unknown) => void;
  items: T[];
}

// ============================================================================
// ACTIONS CONFIGURATION
// ============================================================================

export interface ActionConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  
  /**
   * Button variant
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  
  /**
   * Show on mobile floating action bar
   */
  showOnMobile?: boolean;
  
  /**
   * Show on desktop action bar
   */
  showOnDesktop?: boolean;
  
  /**
   * Optional modal component to show when action is clicked
   */
  modal?: ComponentType<ActionModalProps>;
  
  /**
   * Optional badge (e.g., for notifications)
   */
  badge?: string | number;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Tooltip text
   */
  tooltip?: string;
}

export interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

export interface LayoutConfig {
  /**
   * Grid columns (Tailwind classes)
   * @example "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
   */
  gridCols: string;
  
  /**
   * Gap between items (Tailwind classes)
   * @example "gap-6"
   */
  gap: string;
  
  /**
   * Additional container classes
   */
  containerClass?: string;
  
  /**
   * View modes available
   */
  viewModes?: Array<'grid' | 'list' | 'tree'>;
  
  /**
   * Default view mode
   */
  defaultViewMode?: 'grid' | 'list' | 'tree';
}

// ============================================================================
// ITEM ACTIONS CONFIGURATION
// ============================================================================

export interface ItemActionsConfig<T extends BaseListItem> {
  /**
   * View action (navigate to detail page)
   */
  onView?: (id: string) => void;
  
  /**
   * Edit action (navigate to edit page)
   */
  onEdit?: (id: string) => void;
  
  /**
   * Delete action (with confirmation)
   */
  onDelete?: (id: string) => Promise<void>;
  
  /**
   * Duplicate action
   */
  onDuplicate?: (id: string) => Promise<void>;
  
  /**
   * Share action
   */
  onShare?: (id: string) => void;
  
  /**
   * Custom actions specific to the item type
   */
  customActions?: CustomItemAction<T>[];
  
  /**
   * Delete confirmation config
   */
  deleteConfirmation?: {
    title: string;
    message: (itemName: string) => string;
    confirmLabel?: string;
    cancelLabel?: string;
  };
}

export interface CustomItemAction<T extends BaseListItem> {
  id: string;
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  onClick: (item: T) => void | Promise<void>;
  disabled?: (item: T) => boolean;
  variant?: 'default' | 'destructive' | 'ghost';
}

// ============================================================================
// HIERARCHY CONFIGURATION
// ============================================================================

export interface HierarchyConfig<T extends BaseListItem> {
  /**
   * Enable hierarchical navigation
   */
  enabled: boolean;
  
  /**
   * Function to determine if item is a folder
   */
  isFolder: (item: T) => boolean;
  
  /**
   * Function to get children of an item
   */
  getChildren?: (item: T) => T[];
  
  /**
   * Function to get parent of an item
   */
  getParent?: (item: T) => T | null;
  
  /**
   * Breadcrumb configuration
   */
  breadcrumbs?: {
    enabled: boolean;
    homeLabel?: string;
    separator?: ReactNode;
    onNavigate: (path: string[]) => void;
  };
  
  /**
   * Folder navigation
   */
  folderNavigation?: {
    onFolderClick: (folderId: string) => void;
    onBackClick?: () => void;
    currentFolderId?: string | null;
  };
  
  /**
   * Tree view configuration (for sidebar)
   */
  treeView?: {
    enabled: boolean;
    collapsible: boolean;
    defaultExpanded?: boolean;
    onNodeClick: (nodeId: string) => void;
    renderNode?: ComponentType<TreeNodeProps<T>>;
  };
}

export interface TreeNodeProps<T extends BaseListItem> {
  node: T;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  onClick: () => void;
  isSelected: boolean;
}

// ============================================================================
// VOICE CONFIGURATION
// ============================================================================

export interface VoiceConfig {
  /**
   * Enable voice input for search
   */
  enabled: boolean;
  
  /**
   * Auto-transcribe after recording
   */
  autoTranscribe?: boolean;
  
  /**
   * Custom transcription complete handler
   */
  onTranscriptionComplete?: (text: string) => void;
  
  /**
   * Custom error handler
   */
  onError?: (error: Error) => void;
}

// ============================================================================
// ADVANCED CONFIGURATION
// ============================================================================

export interface AdvancedConfig<T extends BaseListItem> {
  /**
   * Enable virtualization for large lists
   */
  virtualization?: {
    enabled: boolean;
    itemHeight: number;
    overscan?: number;
  };
  
  /**
   * Custom loading state
   */
  loadingComponent?: ComponentType;
  
  /**
   * Custom error state
   */
  errorComponent?: ComponentType<{ error: Error; onRetry?: () => void }>;
  
  /**
   * Custom empty state
   */
  emptyComponent?: ComponentType<{ onCreate?: () => void }>;
  
  /**
   * Enable pagination
   */
  pagination?: {
    enabled: boolean;
    pageSize: number;
    serverSide?: boolean;
  };
  
  /**
   * Enable selection
   */
  selection?: {
    enabled: boolean;
    multiple: boolean;
    onSelectionChange: (selectedIds: string[]) => void;
  };
  
  /**
   * Custom CSS classes
   */
  customClasses?: {
    container?: string;
    header?: string;
    grid?: string;
    card?: string;
  };
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props for the main UnifiedListLayout component
 */
export interface UnifiedListLayoutProps<T extends BaseListItem> {
  /**
   * Configuration object
   */
  config: UnifiedListLayoutConfig<T>;
  
  /**
   * Array of items to display
   */
  items: T[];
  
  /**
   * Render function for each item
   */
  renderCard: (item: T, actions: RenderCardActions<T>) => ReactNode;
  
  /**
   * Optional: Loading state
   */
  isLoading?: boolean;
  
  /**
   * Optional: Error state
   */
  error?: Error;
  
  /**
   * Optional: Retry function for error state
   */
  onRetry?: () => void;
  
  /**
   * Optional: Custom header content
   */
  headerContent?: ReactNode;
}

/**
 * Actions passed to the renderCard function
 */
export interface RenderCardActions<T extends BaseListItem> {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onShare?: () => void;
  customActions: Array<{
    id: string;
    onClick: () => void;
    disabled: boolean;
  }>;
  
  // State flags
  isNavigating: boolean;
  isAnyNavigating: boolean;
  isDeleting: boolean;
  isDuplicating: boolean;
}

// ============================================================================
// INTERNAL STATE TYPES
// ============================================================================

/**
 * Internal state for the UnifiedListLayout component
 */
export interface UnifiedListLayoutState {
  searchTerm: string;
  sortBy: string;
  filterValues: Record<string, unknown>;
  viewMode: 'grid' | 'list' | 'tree';
  selectedIds: string[];
  navigatingId: string | null;
  deletingIds: Set<string>;
  duplicatingIds: Set<string>;
  currentFolderId: string | null;
  expandedFolderIds: Set<string>;
  isFilterModalOpen: boolean;
  activeActionModal: string | null;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Filter state for a single filter
 */
export interface FilterState {
  id: string;
  value: unknown;
  active: boolean;
}

/**
 * Navigation state for transitions
 */
export interface NavigationState {
  isNavigating: boolean;
  targetId: string | null;
  targetPath: string | null;
}

/**
 * Delete confirmation state
 */
export interface DeleteConfirmationState {
  isOpen: boolean;
  itemId: string | null;
  itemName: string | null;
}

