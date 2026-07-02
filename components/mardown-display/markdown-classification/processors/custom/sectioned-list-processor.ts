import { v4 as uuidv4 } from 'uuid';

// Define interfaces for the AST (simplified for clarity)
interface Position {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
}

interface AstNode {
    type: string;
    children?: AstNode[];
    value?: string;
    position?: Position;
    ordered?: boolean;
    start?: number;
    spread?: boolean;
    checked?: boolean | null;
    depth?: number;
    align?: (string | null)[];
}

// Define interfaces for the output structure
interface ListItem {
    id: string;
    text: string;
    subItems?: ListItem[];
}

interface Section {
    id: string;
    title: string;
    type: 'heading' | 'list' | 'table' | 'paragraph';
    depth?: number; // For headings
    content: string | ListItem[] | { headers: string[]; rows: string[][] };
}

interface OutputContent {
    sections: Section[];
    hasNestedLists: boolean;
}

// Helper function to extract text from a node and its children
function extractText(node: AstNode): string {
    if (node.type === 'text') {
        return node.value || '';
    }
    if (node.type === 'inlineCode') {
        return `\`${node.value || ''}\``;
    }
    if (node.type === 'strong') {
        return `**${node.children ? node.children.map(extractText).join('') : ''}**`;
    }
    if (node.type === 'emphasis') {
        return `*${node.children ? node.children.map(extractText).join('') : ''}*`;
    }
    if (node.children) {
        return node.children.map(extractText).join('');
    }
    return '';
}

// Helper function to extract clean heading text
function extractHeadingText(heading: AstNode): string {
    if (!heading.children) {
        return '';
    }
    return heading.children
        .map(child => extractText(child))
        .join('')
        .trim();
}

// Helper function to process list items and detect nested lists
function processList(list: AstNode, hasNestedLists: { value: boolean }): ListItem[] {
    if (list.type !== 'list' || !list.children) {
        return [];
    }

    const items: ListItem[] = [];
    for (const listItem of list.children) {
        if (listItem.type === 'listItem' && listItem.children) {
            const item: ListItem = { id: uuidv4(), text: '' };
            for (const child of listItem.children) {
                if (child.type === 'paragraph') {
                    item.text = extractText(child).trim();
                } else if (child.type === 'list') {
                    item.subItems = processList(child, hasNestedLists);
                    if (item.subItems.length > 0) {
                        hasNestedLists.value = true;
                    }
                }
            }
            if (item.text || item.subItems) {
                items.push(item);
            }
        }
    }
    return items;
}

// Helper function to process tables
function processTable(table: AstNode): { headers: string[]; rows: string[][] } {
    if (table.type !== 'table' || !table.children) {
        return { headers: [], rows: [] };
    }

    const headers: string[] = [];
    const rows: string[][] = [];

    for (let i = 0; i < table.children.length; i++) {
        const row = table.children[i];
        if (row.type !== 'tableRow' || !row.children) {
            continue;
        }
        const cells = row.children
            .filter(cell => cell.type === 'tableCell')
            .map(cell => extractText(cell).trim());
        if (i === 0) {
            headers.push(...cells);
        } else {
            rows.push(cells);
        }
    }

    return { headers, rows };
}

interface SectionedListProcessorInput {
    ast: AstNode;
    config?: Record<string, unknown>;
}

export function sectionedListProcessor({ ast, config }: SectionedListProcessorInput): OutputContent {
    if (config && Object.keys(config).length > 0) {
        console.warn(
            "IntroOutroListProcessor Does NOT use configs but a config was provided. Config was: ",
            JSON.stringify(config, null, 2)
        );
    }

    const output: OutputContent = {
        sections: [],
        hasNestedLists: false,
    };
    const hasNestedLists = { value: false };

    if (ast.type !== 'root' || !ast.children) {
        throw new Error('Invalid AST: Expected root node with children');
    }

    let currentSection: Section | null = null;

    for (let i = 0; i < ast.children.length; i++) {
        const node = ast.children[i];

        // Handle headings
        if (node.type === 'heading' && node.depth) {
            const title = extractHeadingText(node);
            currentSection = {
                id: uuidv4(),
                title,
                type: 'heading',
                depth: node.depth,
                content: '',
            };
            output.sections.push(currentSection);
            continue;
        }

        // Handle paragraphs
        if (node.type === 'paragraph') {
            const text = extractText(node).trim();
            if (text) {
                output.sections.push({
                    id: uuidv4(),
                    title: '',
                    type: 'paragraph',
                    content: text,
                });
            }
            continue;
        }

        // Handle lists
        if (node.type === 'list') {
            const listItems = processList(node, hasNestedLists);
            if (listItems.length > 0) {
                output.sections.push({
                    id: uuidv4(),
                    title: currentSection?.title || '',
                    type: 'list',
                    content: listItems,
                });
            }
            continue;
        }

        // Handle tables
        if (node.type === 'table') {
            const tableData = processTable(node);
            if (tableData.headers.length > 0 || tableData.rows.length > 0) {
                output.sections.push({
                    id: uuidv4(),
                    title: currentSection?.title || '',
                    type: 'table',
                    content: tableData,
                });
            }
            continue;
        }

        // Skip thematic breaks and other unhandled nodes
    }

    output.hasNestedLists = hasNestedLists.value;
    return output;
}

export default sectionedListProcessor;