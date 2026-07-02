import { AstNode, NodeType } from '../types';
import type { JsonValue } from '@/types/json';

// Update MarkdownConfig to use NodeType for type fields
export type MarkdownConfig = {
  type: string; // Top-level type, not necessarily NodeType
  sections: {
    key: string;
    match: {
      type: NodeType;
      depth?: number;
      containsStrong?: boolean;
      text?: string;
      textIncludes?: string;
      textStarts?: string;
      regex?: string;
      follows?: {
        type: NodeType;
        depth?: number;
        textStarts?: string;
        regex?: string;
      };
    };
    extraction: {
      type: 'text' | 'list' | 'nested' | 'next_node' | 'lines';
      target?: string;
      matchNext?: {
        type: NodeType;
        depth?: number;
        text?: string;
        textIncludes?: string;
        textStarts?: string;
        containsStrong?: boolean;
        regex?: string;
      };
      structure?: {
        [key: string]: {
          match: {
            type: NodeType;
            depth?: number;
            text?: string;
            textIncludes?: string;
            textStarts?: string;
            regex?: string;
            containsStrong?: boolean;
            follows?: {
              type: NodeType;
              depth?: number;
              textStarts?: string;
              regex?: string;
            };
          };
          extract: {
            key: string;
            type: 'text' | 'list' | 'lines';
            target?: string;
            matchNext?: {
              type: NodeType;
              depth?: number;
              text?: string;
              textIncludes?: string;
              textStarts?: string;
              containsStrong?: boolean;
              regex?: string;
            };
          }[];
        };
      };
      stopConditions?: {
        type: NodeType;
        depth?: number;
        textIncludes?: string;
        containsStrong?: boolean;
        textStarts?: string;
        regex?: string;
      }[];
    };
  }[];
  fallback: {
    appendTo: string;
  };
};

// Update StructureEntry
type StructureEntry = {
  match: {
    type: NodeType;
    depth?: number;
    text?: string;
    textIncludes?: string;
    textStarts?: string;
    regex?: string;
    containsStrong?: boolean;
    follows?: {
      type: NodeType;
      depth?: number;
      textStarts?: string;
      regex?: string;
    };
  };
  extract: {
    key: string;
    type: 'text' | 'list' | 'lines';
    target?: string;
    matchNext?: {
      type: NodeType;
      depth?: number;
      text?: string;
      textIncludes?: string;
      textStarts?: string;
      containsStrong?: boolean;
      regex?: string;
    };
  }[];
};

// Update NodeMatchCriteria
type NodeMatchCriteria = {
  type?: NodeType;
  depth?: number;
  text?: string;
  textIncludes?: string;
  textStarts?: string;
  regex?: string;
  containsStrong?: boolean;
};

// Update MarkdownProcessor
export interface MarkdownProcessor {
  ast: AstNode;
  config: MarkdownConfig;
}

export interface MarkdownProcessorResult {
  extracted: Record<string, JsonValue>;
  miscellaneous: string[];
}

// Helper function to check if a node has children
function hasChildren(node: AstNode): node is AstNode & { children: AstNode[] } {
  return 'children' in node && Array.isArray(node.children);
}

// Updated extractTextFromNode
function extractTextFromNode(node: AstNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (node.type === 'strong' && hasChildren(node)) {
    return node.children.map(extractTextFromNode).join('');
  }
  if (hasChildren(node)) {
    return node.children.map(extractTextFromNode).join('');
  }
  return '';
}

// Updated nodeMatches
function nodeMatches(node: AstNode | undefined, criteria: NodeMatchCriteria | undefined): boolean {
  if (!node || !criteria) return false;
  if (criteria.type && node.type !== criteria.type) return false;
  if (criteria.depth !== undefined && (node.type !== 'heading' || node.depth !== criteria.depth)) return false;
  const nodeText = extractTextFromNode(node);
  if (criteria.text && nodeText !== criteria.text) return false;
  if (criteria.textIncludes && !nodeText?.includes(criteria.textIncludes)) return false;
  if (criteria.textStarts && !nodeText?.startsWith(criteria.textStarts)) return false;
  if (criteria.containsStrong) {
    if (!hasChildren(node) || !node.children.some(child => child.type === 'strong')) return false;
  }
  if (criteria.regex) {
    return new RegExp(criteria.regex).test(nodeText);
  }
  return true;
}

// Updated extractData
function extractData(
  node: AstNode,
  ast: AstNode,
  index: number,
  extraction: MarkdownConfig['sections'][number]['extraction'],
  processed: Set<number>
): JsonValue {
  switch (extraction.type) {
    case 'text':
      let text = extractTextFromNode(node).trim();
      if (extraction.target === 'strong') {
        if (hasChildren(node)) {
          const strongNode = node.children.find(child => child.type === 'strong');
          return strongNode ? extractTextFromNode(strongNode).trim() : '';
        }
        return '';
      } else if (extraction.target === 'substringAfterColon') {
        const parts = text.split(':', 2);
        return parts.length > 1 ? parts[1].trim() : text;
      } else if (extraction.target === 'firstLine') {
        return text.split('\n')[0].trim();
      } else if (extraction.target === 'afterFirstLine') {
        const lines = text.split('\n');
        return lines.slice(1).map(line => line.trim()).filter(line => line.length > 0);
      }
      return text;

    case 'list':
      const nextIndex = extraction.matchNext ? index + 1 : index;
      if (ast.type === 'root' && hasChildren(ast) && nextIndex < ast.children.length) {
        const targetNode = ast.children[nextIndex];
        if (targetNode && nodeMatches(targetNode, extraction.matchNext || { type: targetNode.type })) {
          processed.add(nextIndex);
          if (targetNode.type === 'list' && hasChildren(targetNode)) {
            return targetNode.children
              .map(item => extractTextFromNode(item).trim())
              .filter(text => text.length > 0);
          }
        }
      }
      return [];

    case 'next_node':
      if (ast.type === 'root' && hasChildren(ast) && index + 1 < ast.children.length) {
        const nextNode = ast.children[index + 1];
        if (nextNode && nodeMatches(nextNode, extraction.matchNext || { type: nextNode.type })) {
          processed.add(index + 1);
          return extractTextFromNode(nextNode).trim();
        }
      }
      return '';

    case 'lines':
      const linesText = extractTextFromNode(node).trim();
      const lines = linesText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      if (extraction.target === 'afterFirstLine') {
        return lines.slice(1);
      }
      return lines;

    case 'nested':
      const results: JsonValue[] = [];
      if (ast.type !== 'root' || !hasChildren(ast)) return results;

      let currentIndex = index + 1;
      while (currentIndex < ast.children.length) {
        const currNode = ast.children[currentIndex];

        // Check stop conditions
        if (extraction.stopConditions?.some(cond => nodeMatches(currNode, cond))) {
          break;
        }

        // Check each structure definition
        let foundMatch = false;
        for (const [structKey, struct] of Object.entries(extraction.structure || {}) as [string, StructureEntry][]) {
          // Check if this node matches the structure's match criteria
          const matchesDirectly = nodeMatches(currNode, struct.match);

          // Check follows condition
          let matchesFollows = true;
          if (struct.match.follows) {
            const prevNode = currentIndex > 0 ? ast.children[currentIndex - 1] : undefined;
            matchesFollows = prevNode !== undefined && nodeMatches(prevNode, struct.match.follows);
          }

          if (matchesDirectly && matchesFollows) {
            foundMatch = true;

            // Handle list nodes specially
            if (currNode.type === 'list' && struct.extract.some(ex => ex.matchNext?.type === 'listItem')) {
              const item: Record<string, JsonValue> = {};
              if (hasChildren(currNode)) {
                currNode.children.forEach((listItem: AstNode) => {
                  struct.extract.forEach(ex => {
                    if (ex.matchNext?.type === 'listItem') {
                      const itemText = extractTextFromNode(listItem).trim();
                      let matches = true;

                      if (ex.matchNext.containsStrong) {
                        const hasStrong = hasChildren(listItem) && listItem.children.some(
                          child => child.type === 'strong' ||
                            (hasChildren(child) && child.children.some(c => c.type === 'strong'))
                        );
                        matches = matches && hasStrong;
                      }

                      if (ex.matchNext.textIncludes) {
                        matches = matches && itemText.includes(ex.matchNext.textIncludes);
                      }

                      if (!matches) return;

                      let value = itemText;
                      if (ex.target === 'substringAfterColon') {
                        const parts = itemText.split(':');
                        if (parts.length > 1) {
                          value = parts.slice(1).join(':').trim();
                        }
                      }

                      item[ex.key] = value;
                    }
                  });
                });
              }
              if (Object.keys(item).length > 0) {
                results.push(item);
              }
            } else {
              // General node handling
              const item: Record<string, JsonValue> = {};
              for (const ex of struct.extract) {
                if (ex.type === 'text') {
                  let text: string | string[] = extractTextFromNode(currNode).trim();
                  if (ex.target === 'substringAfterColon') {
                    const parts = text.split(':');
                    text = parts.length > 1 ? parts.slice(1).join(':').trim() : text;
                  } else if (ex.target === 'firstLine') {
                    text = text.split('\n')[0].trim();
                  } else if (ex.target === 'afterFirstLine') {
                    const lines = text.split('\n');
                    text = lines.slice(1).map(l => l.trim()).filter(l => l.length > 0);
                  }
                  item[ex.key] = text;
                } else if (ex.type === 'list' && ex.matchNext) {
                  const nextIdx = currentIndex + 1;
                  if (nextIdx < ast.children.length) {
                    const nextNode = ast.children[nextIdx];
                    if (nextNode && nodeMatches(nextNode, ex.matchNext)) {
                      if (nextNode.type === 'list' && hasChildren(nextNode)) {
                        const listItems = nextNode.children
                          .map(item => extractTextFromNode(item).trim())
                          .filter(text => text.length > 0);
                        item[ex.key] = listItems;
                        processed.add(nextIdx);
                      }
                    }
                  }
                } else if (ex.type === 'lines' && ex.matchNext) {
                  const nextIdx = currentIndex + 1;
                  if (nextIdx < ast.children.length) {
                    const nextNode = ast.children[nextIdx];
                    if (nextNode && nodeMatches(nextNode, ex.matchNext)) {
                      const text = extractTextFromNode(nextNode).trim();
                      const lines = text
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                      item[ex.key] = lines;
                      processed.add(nextIdx);
                    }
                  }
                }
              }
              if (Object.keys(item).length > 0) {
                results.push(item);
              }
            }

            processed.add(currentIndex);
            break;
          }
        }

        currentIndex++;
      }

      return results;

    default:
      return null;
  }
}

// Updated processMarkdownWithConfig
export function processMarkdownWithConfig({ ast, config }: MarkdownProcessor): MarkdownProcessorResult {
  const result: MarkdownProcessorResult = {
    extracted: {},
    miscellaneous: [],
  };

  const processed = new Set<number>();
  let lastSectionKey: string | null = config?.fallback?.appendTo || null;

  // Pre-initialize suggestion arrays
  for (const section of config.sections) {
    if (section.extraction.type === 'nested') {
      result.extracted[section.key] = [];
    }
  }

  // Ensure ast is root node with children
  if (ast.type !== 'root' || !hasChildren(ast)) {
    return result;
  }

  // Process nodes
  ast.children.forEach((node, index) => {
    if (node.type === 'thematicBreak' || processed.has(index)) {
      return;
    }

    let matched = false;

    for (const section of config.sections) {
      if (nodeMatches(node, section.match)) {
        let contextValid = true;
        if (section.match.follows) {
          const prevNode = index > 0 ? ast.children[index - 1] : undefined;
          if (!prevNode || !nodeMatches(prevNode, section.match.follows)) {
            contextValid = false;
          }
        }

        if (contextValid) {
          try {
            const extractedData = extractData(node, ast, index, section.extraction, processed);

            // Handle nested extraction
            if (section.extraction.type === 'nested') {
              if (Array.isArray(extractedData) && extractedData.length > 0) {
                const existing = result.extracted[section.key];
                const targetArray: JsonValue[] = Array.isArray(existing)
                  ? existing
                  : existing !== undefined
                    ? [existing]
                    : [];
                extractedData.forEach(item => {
                  targetArray.push(item);
                });
                result.extracted[section.key] = targetArray;
              }
            } else {
              result.extracted[section.key] = extractedData;
            }

            lastSectionKey = section.key;
            processed.add(index);
            matched = true;
            break;
          } catch (error) {
            console.error(`Error processing section ${section.key}:`, error);
          }
        }
      }
    }

    // Handle unmatched nodes
    if (!matched) {
      const rawContent = extractTextFromNode(node).trim();
      if (rawContent !== '') {
        if (config.fallback && config.fallback.appendTo) {
          const appendKey = config.fallback.appendTo;
          const existingFallback = result.extracted[appendKey];
          const fallbackArray: JsonValue[] = Array.isArray(existingFallback)
            ? existingFallback
            : existingFallback !== undefined
              ? [existingFallback]
              : [];
          fallbackArray.push(rawContent);
          result.extracted[appendKey] = fallbackArray;
        } else {
          result.miscellaneous.push(rawContent);
        }
      }
      processed.add(index);
    }
  });

  return result;
}

export default processMarkdownWithConfig;