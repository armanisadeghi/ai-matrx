import { MarkdownTableData } from "@/components/mardown-display/types";
import { parseMarkdownTable as parseCanonicalTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { findTableEnd, findTableStart } from "./gfm-table-lines";




type NormalizedTableData = Array<{ [key: string]: string }>;

export const parseMarkdownTable = (content: string): { 
    markdown: MarkdownTableData | null,
    data: NormalizedTableData | null 
} => {
    try {
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        // THE table rule (gfm-table-lines) finds the table — pipe-led or pipe-less —
        // and THE parser reads it: an escaped `\|` stays in its cell.
        const tableStartIndex = findTableStart(lines);
        if (tableStartIndex === -1) return { markdown: null, data: null };
        const tableLines = lines.slice(tableStartIndex, findTableEnd(lines, tableStartIndex));

        // For streaming, we need at least 3 lines (header, separator, and 1+ rows) to process
        if (tableLines.length < 3) return { markdown: null, data: null };

        const parsed = parseCanonicalTable(tableLines.join('\n'));
        if (!parsed || parsed.headers.length === 0 || parsed.rows.length === 0) return { markdown: null, data: null };
        const { headers, rows } = parsed;

        // Convert to normalized data
        const normalizedData = rows.map(row => {
            const rowData: { [key: string]: string } = {};
            headers.forEach((header, index) => {
                // Only assign if we have a corresponding cell, otherwise empty string
                rowData[header] = index < row.length ? row[index] : '';
            });
            return rowData;
        });

        return { 
            markdown: { headers, rows },
            data: normalizedData 
        };
    } catch (error) {
        // Silently fail for streaming case - we'll try again with more data
        return { markdown: null, data: null };
    }
};

// // Example usage in a streaming context
// let buffer = '';

// function processStreamChunk(chunk: string) {
//     buffer += chunk;
//     const result = parseMarkdownTable(buffer);
    
//     if (result.markdown && result.data) {
//         console.log('Parsed table:', result);
//         // Optionally clear buffer if you only want to process each table once
//         // buffer = '';
//     }
// }

// // Simulating streaming chunks
// const chunks = [
//     '| Name | Age | City |\n',
//     '|------|-----|------|\n',
//     '| John | 25  | NY    |\n',
//     '| Jane | 30  | LA    |\n'
// ];

// chunks.forEach(chunk => processStreamChunk(chunk));