// Position interface for start and end coordinates
export interface Position {
    start: {
      line: number;
      column: number;
      offset: number;
    };
    end: {
      line: number;
      column: number;
      offset: number;
    };
  }
  
  // Union type for all possible node types
  export type NodeType =
    | 'root'
    | 'paragraph'
    | 'text'
    | 'strong'
    | 'thematicBreak'
    | 'heading'
    | 'list'
    | 'listItem'
    | 'blockquote'
    | 'link'
    | 'image'
    | 'code'
    | 'html'
    | 'emphasis'
    | 'inlineCode'
    | 'break'
    | 'delete'
    | 'footnote'
    | 'footnoteDefinition'
    | 'footnoteReference'
    | 'definition'
    | 'table'
    | 'tableRow'
    | 'tableCell';
  
  // Base interface for common properties
  export interface BaseAstNode {
    type: NodeType;
    position?: Position;
  }
  
  // Specific node interfaces
  export interface RootNode extends BaseAstNode {
    type: 'root';
    children: AstNode[];
  }
  
  export interface ParagraphNode extends BaseAstNode {
    type: 'paragraph';
    children: AstNode[];
  }
  
  export interface TextNode extends BaseAstNode {
    type: 'text';
    value: string;
  }
  
  export interface StrongNode extends BaseAstNode {
    type: 'strong';
    children: AstNode[];
  }
  
  export interface ThematicBreakNode extends BaseAstNode {
    type: 'thematicBreak';
  }
  
  export interface HeadingNode extends BaseAstNode {
    type: 'heading';
    depth: number;
    children: AstNode[];
  }
  
  export interface ListNode extends BaseAstNode {
    type: 'list';
    ordered: boolean;
    start: number | null;
    spread: boolean;
    children: AstNode[];
  }
  
  export interface ListItemNode extends BaseAstNode {
    type: 'listItem';
    spread: boolean;
    checked: boolean | null;
    children: AstNode[];
  }
  
  // Added new node interfaces
  export interface BlockquoteNode extends BaseAstNode {
    type: 'blockquote';
    children: AstNode[];
  }
  
  export interface LinkNode extends BaseAstNode {
    type: 'link';
    url: string;
    title?: string | null;
    children: AstNode[];
  }
  
  export interface ImageNode extends BaseAstNode {
    type: 'image';
    url: string;
    title?: string | null;
    alt?: string;
  }
  
  export interface CodeNode extends BaseAstNode {
    type: 'code';
    value: string;
    lang?: string | null;
    meta?: string | null;
  }
  
  export interface HtmlNode extends BaseAstNode {
    type: 'html';
    value: string;
  }
  
  export interface EmphasisNode extends BaseAstNode {
    type: 'emphasis';
    children: AstNode[];
  }
  
  export interface InlineCodeNode extends BaseAstNode {
    type: 'inlineCode';
    value: string;
  }
  
  export interface BreakNode extends BaseAstNode {
    type: 'break';
  }
  
  export interface DeleteNode extends BaseAstNode {
    type: 'delete';
    children: AstNode[];
  }
  
  export interface TableNode extends BaseAstNode {
    type: 'table';
    align?: Array<'left' | 'right' | 'center' | null>;
    children: AstNode[];
  }
  
  export interface TableRowNode extends BaseAstNode {
    type: 'tableRow';
    children: AstNode[];
  }
  
  export interface TableCellNode extends BaseAstNode {
    type: 'tableCell';
    children: AstNode[];
  }
  
  export interface DefinitionNode extends BaseAstNode {
    type: 'definition';
    identifier: string;
    label?: string;
    url: string;
    title?: string | null;
  }
  
  // Union type for all possible AST nodes
  export type AstNode =
    | RootNode
    | ParagraphNode
    | TextNode
    | StrongNode
    | ThematicBreakNode
    | HeadingNode
    | ListNode
    | ListItemNode
    | BlockquoteNode
    | LinkNode
    | ImageNode
    | CodeNode
    | HtmlNode
    | EmphasisNode
    | InlineCodeNode
    | BreakNode
    | DeleteNode
    | TableNode
    | TableRowNode
    | TableCellNode
    | DefinitionNode;

  // Type guard for Root node
  export function isRoot(node: AstNode): node is RootNode {
    return node.type === 'root';
  }

  // Type guard for checking if a node has children
  export function hasChildren(node: AstNode): node is AstNode & { children: AstNode[] } {
    return 'children' in node && Array.isArray(node.children);
  }