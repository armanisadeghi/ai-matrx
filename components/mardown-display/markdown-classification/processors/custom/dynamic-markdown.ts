import { continuesTable, isGfmDelimiterRow, opensTable, rowCells } from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";
interface TableData {
    headers: string[];
    rows: string[][];
}

interface MarkdownTable {
    title: string;
    data: TableData;
}

interface SectionItem {
    name: string;
}

interface Section {
    title: string;
    intro: string;
    items: SectionItem[];
    tables: MarkdownTable[];
    outro: string;
}

interface ParsedContent {
    intro: string;
    sections: Section[];
    outro: string;
}

export function parseMarkdownContent(markdown: string): ParsedContent {
    const lines = markdown.split("\n");

    // Regex checks
    const isHeading = (line: string) => /^#{1,3}\s+/.test(line.trim());
    const isBoldHeading = (line: string) => /^\*\*[^*]+\*\*$/.test(line.trim());
    const isDivider = (line: string) => /^={3,}$/.test(line.trim());
    // Tables: THE GFM rule (gfm-table-lines) — pipe-less tables too, `\|` stays in its cell.
    const isTableSeparator = isGfmDelimiterRow;
    const isListItem = (line: string) => /^[*-]\s+|^\d+\.\s+/.test(line.trim());

    // Remove inline bold markers
    const extractBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, "$1");

    // Final data
    let intro = "";
    let outro = "";
    const sections: Section[] = [];

    // Current section state
    let currentSection: Section | null = null;
    // Once we see the first bullet in a section, all subsequent plain lines go to the section.outro
    let hasSeenFirstItem = false;

    // Table parsing
    let isParsingTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    // State: Are we still collecting the top-level intro? Once we see first heading or divider, we set this false.
    let collectingIntro = true;
    // After all sections, we set collectingOutro = true
    let collectingOutro = false;

    // Helper: finalize a table if we're in the middle of parsing one
    function finalizeTable() {
        if (!currentSection) return;
        if (tableHeaders.length > 0 && tableRows.length > 0) {
            currentSection.tables.push({
                title: currentSection.title,
                data: {
                    headers: tableHeaders.map(extractBold),
                    rows: tableRows.map((row) => row.map(extractBold)),
                },
            });
        }
        isParsingTable = false;
        tableHeaders = [];
        tableRows = [];
    }

    // Helper: finalize the current section
    function finalizeSection() {
        if (currentSection) {
            sections.push(currentSection);
            currentSection = null;
        }
        hasSeenFirstItem = false;
        isParsingTable = false;
        tableHeaders = [];
        tableRows = [];
    }

    // Process each line in sequence
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        let line = lines[lineIndex] ?? "";
        // Always work with the raw line for whitespace-checking, but let's define a trimmed version too
        const trimmed = line.trim();

        // If we hit a divider, that means we finalize the current section
        if (isDivider(trimmed)) {
            // If there's a table in progress, finalize it
            if (isParsingTable) {
                finalizeTable();
            }
            finalizeSection();

            // After a divider, we are no longer collecting top-level intro
            collectingIntro = false;
            collectingOutro = false;
            continue;
        }

        // Check if this line starts a new heading (###) or is a fully bold heading
        if (isHeading(trimmed) || isBoldHeading(trimmed)) {
            // If there's a table in progress, finalize it
            if (isParsingTable) {
                finalizeTable();
            }
            // If there's a section in progress, finalize it
            finalizeSection();

            // We are done with top-level intro
            collectingIntro = false;
            collectingOutro = false;

            // Extract the heading text
            let headingText = trimmed;
            if (isHeading(trimmed)) {
                // Remove the leading # or ## or ###
                headingText = headingText.replace(/^#{1,3}\s+/, "");
            } else {
                // It's a bold heading, remove ** around it
                headingText = headingText.replace(/^\*\*(.*)\*\*$/, "$1");
            }

            currentSection = {
                title: extractBold(headingText),
                intro: "",
                items: [],
                tables: [],
                outro: "",
            };
            continue;
        }

        // Check if line might belong to a table
        // If we see a table row and we're NOT parsing a table, that starts a new table
        if (!isParsingTable && opensTable(lines, lineIndex)) {
            isParsingTable = true;
            // The first table row is the headers
            tableHeaders = rowCells(trimmed);
            continue;
        }

        // If we are parsing a table
        if (isParsingTable) {
            // If this line is still a table row (and not a separator line)
            if (continuesTable(trimmed) && !isTableSeparator(trimmed)) {
                tableRows.push(rowCells(trimmed));
                continue;
            } else {
                // Table has ended if we hit a non-table row or a blank line
                finalizeTable();
            }
        }

        // If we get here, the line is not a heading, not a divider, not a table row
        // Check if it's a list item
        if (isListItem(trimmed)) {
            // We might be collecting top-level intro or outro
            if (!currentSection) {
                // We haven't started a section yet, so this belongs to top-level intro
                if (collectingIntro) {
                    if (intro) intro += "\n";
                    intro += extractBold(trimmed);
                } else if (collectingOutro) {
                    if (outro) outro += "\n";
                    outro += extractBold(trimmed);
                }
                continue;
            }

            // We have a current section
            const match = trimmed.match(/^([*-]|\d+\.)\s+(.*)/);
            if (match) {
                const itemText = extractBold(match[2]);
                currentSection.items.push({ name: itemText });
                hasSeenFirstItem = true;
            }
            continue;
        }

        // It's just a plain line (paragraph text)
        if (!currentSection) {
            // If no current section, it goes to the top-level intro or outro
            if (collectingIntro) {
                // add to global intro
                if (trimmed.length > 0) {
                    intro += (intro ? "\n" : "") + extractBold(trimmed);
                }
            } else {
                // That means we are collecting global outro
                collectingOutro = true;
                if (trimmed.length > 0) {
                    outro += (outro ? "\n" : "") + extractBold(trimmed);
                }
            }
        } else {
            // We have a current section
            // If we haven't seen any list items yet, treat these lines as intro
            if (!hasSeenFirstItem) {
                // Append to section intro
                if (currentSection.intro.length > 0 && trimmed.length > 0) {
                    currentSection.intro += " ";
                }
                currentSection.intro += extractBold(trimmed);
            } else {
                // After the first list item, we consider everything else part of section.outro
                if (trimmed.length > 0) {
                    if (currentSection.outro.length > 0) {
                        currentSection.outro += " ";
                    }
                    currentSection.outro += extractBold(trimmed);
                }
            }
        }
    }

    // End of file => finalize any table, finalize any section
    if (isParsingTable) {
        finalizeTable();
    }
    finalizeSection();

    // The leftover lines after the last divider/section are the global outro
    // but we already appended them as we went along.
    // If you need to handle them differently, you can do so here.

    return {
        intro: intro.trim(),
        sections,
        outro: outro.trim(),
    };
}
