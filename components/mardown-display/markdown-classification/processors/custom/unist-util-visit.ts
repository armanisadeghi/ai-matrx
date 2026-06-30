import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

interface HeadingNode extends Node {
  type: 'heading';
  depth: number;
}

interface ListNode extends Node {
  type: 'list';
  children: ListItemNode[];
}

interface ListItemNode extends Node {
  type: 'listItem';
  children: ParagraphNode[];
}

interface ParagraphNode extends Node {
  type: 'paragraph';
  children: Node[];
}

function isHeadingNode(node: Node): node is HeadingNode {
  return node.type === 'heading';
}

function isListNode(node: Node): node is ListNode {
  return node.type === 'list';
}

type AstSectionItem = string | Record<string, string>;

interface AstSection {
  title: string;
  items: AstSectionItem[];
}

interface AstTransformResult {
  sections: AstSection[];
}

// Extract plain text from a node, ignoring formatting
function getTextContent(node: Node & { value?: string; children?: Node[] }) {
  let text = '';
  if (node.type === 'text') {
    text += node.value;
  }
  if (node.children) {
    node.children.forEach(child => {
      text += getTextContent(child);
    });
  }
  return text.trim();
}

// Clean title by removing emojis and numbering (e.g., "🔍 1. " -> "Keyword Research")
function cleanTitle(text) {
  return text.replace(/[^a-zA-Z\s()]+|\d+\.\s/g, '').trim();
}

// Transform AST to simple data structure
export function transformAst(ast: Node): AstTransformResult {
  const result: AstTransformResult = { sections: [] };
  let currentSection: AstSection | null = null;

  visit(ast, node => {
    // Handle headings for section titles
    if (isHeadingNode(node) && node.depth === 3) {
      const rawTitle = getTextContent(node);
      const title = cleanTitle(rawTitle); // Remove emojis and numbering
      currentSection = { title, items: [] };
      result.sections.push(currentSection);
    }

    // Handle lists under headings
    if (isListNode(node) && currentSection) {
      const section = currentSection;
      node.children.forEach(listItem => {
        const paragraph = listItem.children[0]; // List item contains a paragraph
        const children = paragraph.children;

        // Check for bolded text
        const strongNode = children.find(child => child.type === 'strong');
        if (strongNode) {
          const key = getTextContent(strongNode);
          // Get text after bolded part (or all text if no other text)
          const value = children
            .filter(child => child !== strongNode)
            .map(getTextContent)
            .join(' ')
            .trim()
            .replace(/^[:]/, '') // Remove leading colon if present
            .trim();
          section.items.push({ [key]: value || getTextContent(paragraph) });
        } else {
          // No bolded text, store as plain string
          section.items.push(getTextContent(paragraph));
        }
      });
    }
  });

  return result;
}

