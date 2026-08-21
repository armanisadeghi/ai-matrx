/**
 * ContextVersionManager
 * 
 * Manages versioned context for iterative editing workflows.
 * Ensures only ONE full version exists in the context window at any time
 * by replacing old versions with tombstones.
 * 
 * Usage:
 * ```typescript
 * const manager = new ContextVersionManager('code', 'typescript');
 * manager.initialize(initialCode);
 * 
 * // Later, after applying edits
 * manager.addVersion(newCode, 'Added error handling');
 * 
 * // Get context string to inject before each message
 * const contextString = manager.buildContextString();
 * ```
 */

export interface ContextVersion {
  version: number;
  content: string;
  timestamp: Date;
  changesSummary?: string;
  isCurrent: boolean;
}

export interface ContextMetadata {
  type: 'code' | 'text' | 'json' | 'markdown' | 'other';
  language?: string;
  filename?: string;
  [key: string]: any;
}

export class ContextVersionManager {
  private versions: ContextVersion[] = [];
  private currentVersion: number = 0;
  private metadata: ContextMetadata;
  
  constructor(
    type: ContextMetadata['type'] = 'code',
    language?: string,
    filename?: string
  ) {
    this.metadata = { type, language, filename };
  }
  
  /**
   * Initialize with first version
   */
  initialize(content: string): ContextVersion {
    if (this.versions.length > 0) {
      throw new Error('Context already initialized. Use addVersion() to update.');
    }
    
    const version: ContextVersion = {
      version: 1,
      content,
      timestamp: new Date(),
      isCurrent: true,
    };
    
    this.versions.push(version);
    this.currentVersion = 1;
    return version;
  }
  
  /**
   * Add a new version (marks all previous versions as stale)
   */
  addVersion(content: string, changesSummary?: string): ContextVersion {
    if (this.versions.length === 0) {
      return this.initialize(content);
    }
    
    // Mark all previous versions as not current
    this.versions.forEach(v => v.isCurrent = false);
    
    const version: ContextVersion = {
      version: ++this.currentVersion,
      content,
      timestamp: new Date(),
      changesSummary,
      isCurrent: true,
    };
    
    this.versions.push(version);
    return version;
  }
  
  /**
   * Get the current (latest) version
   */
  getCurrentVersion(): ContextVersion {
    const current = this.versions.find(v => v.isCurrent);
    if (!current) {
      throw new Error('No current version found. Initialize context first.');
    }
    return current;
  }
  
  /**
   * Get all versions
   */
  getAllVersions(): ContextVersion[] {
    return [...this.versions];
  }
  
  /**
   * Get stale (non-current) versions
   */
  getStaleVersions(): ContextVersion[] {
    return this.versions.filter(v => !v.isCurrent);
  }
  
  /**
   * Build the context string to inject before each message
   * 
   * This includes:
   * - Tombstones for stale versions (compact summaries)
   * - Full content of current version
   * 
   * This is what gets injected into the message before sending to AI,
   * but is NOT stored in the conversation history.
   */
  buildContextString(): string {
    const current = this.getCurrentVersion();
    const staleVersions = this.getStaleVersions();
    
    let context = '';
    
    // Add tombstones for stale versions
    if (staleVersions.length > 0) {
      context += '=== PREVIOUS VERSIONS (Removed for brevity) ===\n\n';
      
      staleVersions.forEach(v => {
        context += `Version ${v.version} (${v.timestamp.toISOString()})\n`;
        if (v.changesSummary) {
          context += `Changes: ${v.changesSummary}\n`;
        }
        context += 'Content: [REMOVED - See current version below]\n\n';
      });
      
      context += '=== END PREVIOUS VERSIONS ===\n\n';
    }
    
    // Add current version with clear delimiters
    const typeLabel = this.getTypeLabel();
    
    context += `=== CURRENT ${typeLabel.toUpperCase()} (Version ${current.version}) ===\n`;
    
    if (this.metadata.filename) {
      context += `File: ${this.metadata.filename}\n`;
    }
    if (this.metadata.language) {
      context += `Language: ${this.metadata.language}\n`;
    }
    if (current.changesSummary) {
      context += `Latest Changes: ${current.changesSummary}\n`;
    }
    
    context += `\n${current.content}\n`;
    context += `=== END CURRENT ${typeLabel.toUpperCase()} ===\n`;
    
    return context;
  }
  
  /**
   * Get a compact summary for display purposes
   */
  getSummary(): string {
    const current = this.getCurrentVersion();
    const staleCount = this.getStaleVersions().length;
    
    let summary = `v${current.version}`;
    if (staleCount > 0) {
      summary += ` (${staleCount} previous version${staleCount !== 1 ? 's' : ''})`;
    }
    if (current.changesSummary) {
      summary += `: ${current.changesSummary}`;
    }
    
    return summary;
  }
  
  /**
   * Get statistics about the context
   */
  getStats(): {
    totalVersions: number;
    currentVersion: number;
    staleVersions: number;
    currentContentLength: number;
    totalHistoricalContentLength: number;
  } {
    const current = this.getCurrentVersion();
    const stale = this.getStaleVersions();
    
    return {
      totalVersions: this.versions.length,
      currentVersion: this.currentVersion,
      staleVersions: stale.length,
      currentContentLength: current.content.length,
      totalHistoricalContentLength: stale.reduce((sum, v) => sum + v.content.length, 0),
    };
  }
  
  /**
   * Reset to a specific version (makes it current)
   */
  resetToVersion(versionNumber: number): ContextVersion {
    const targetVersion = this.versions.find(v => v.version === versionNumber);
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found`); // access-errors: ok — in-memory version array lookup; .find verified no such version exists locally
    }
    
    // Mark all as not current
    this.versions.forEach(v => v.isCurrent = false);
    
    // Mark target as current
    targetVersion.isCurrent = true;
    
    return targetVersion;
  }
  
  /**
   * Clear all versions (useful for reset)
   */
  clear(): void {
    this.versions = [];
    this.currentVersion = 0;
  }
  
  /**
   * Get a human-readable type label
   */
  private getTypeLabel(): string {
    switch (this.metadata.type) {
      case 'code': return 'Code';
      case 'text': return 'Text';
      case 'json': return 'JSON';
      case 'markdown': return 'Markdown';
      default: return 'Content';
    }
  }
}

/**
 * Special variable name that signals dynamic context management
 * 
 * When a prompt defines a variable with this name, the system will:
 * 1. NOT include it in the initial variables
 * 2. Inject it before EACH message send
 * 3. NOT store it in conversation history
 * 4. Manage it with version tracking
 */
export const DYNAMIC_CONTEXT_VARIABLE = 'dynamic_context';

/**
 * Check if a variable name is the dynamic context variable
 */
export function isDynamicContextVariable(variableName: string): boolean {
  return variableName === DYNAMIC_CONTEXT_VARIABLE;
}

/**
 * Filter out dynamic context variable from a variables object
 */
export function filterDynamicContext(variables: Record<string, string>): Record<string, string> {
  const filtered = { ...variables };
  delete filtered[DYNAMIC_CONTEXT_VARIABLE];
  return filtered;
}

