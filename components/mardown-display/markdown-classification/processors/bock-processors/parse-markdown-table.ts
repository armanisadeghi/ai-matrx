import { MarkdownTableData } from "@/components/mardown-display/types";
import { unwrapCodeSpans } from "@/lib/markdown/code-ranges";

type NormalizedTableData = Array<{ [key: string]: string }>;

interface TableState {
    isComplete: boolean;
    completeRows: string[][];
    bufferRow: string[];
    totalRows: number;
    completeRowCount: number;
}

// Cache for table content to prevent unnecessary updates during streaming
const tableCache = new Map<string, { 
    markdown: MarkdownTableData | null; 
    data: NormalizedTableData | null; 
    hash: string; 
}>();

/*
- Example Input:

```markdown
| **Name** | Age |
| --- | --- |
| *Alice* | 25 |
| Bob |  |
```

- Example Output:

```json
{
  "markdown": {
    "headers": ["**Name**", "Age"],
    "rows": [["*Alice*", "25"], ["Bob", ""]]
  },
  "data": [
    { "Name": "Alice", "Age": "25" },
    { "Name": "Bob", "Age": "" }
  ]
}
```
*/

// Function to analyze table completion state for controlled row release
const analyzeTableCompletion = (content: string, isStreamActive: boolean = false): TableState => {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    const tableStartIndex = lines.findIndex(line => line.trim().startsWith("|"));
    if (tableStartIndex === -1) {
        return { isComplete: false, completeRows: [], bufferRow: [], totalRows: 0, completeRowCount: 0 };
    }

    const tableLines = lines.slice(tableStartIndex);
    if (tableLines.length < 3) {
        return { isComplete: false, completeRows: [], bufferRow: [], totalRows: 0, completeRowCount: 0 };
    }

    // Skip header and separator
    const dataLines = tableLines.slice(2);
    const completeRows: string[][] = [];
    let bufferRow: string[] = [];
    let totalRows = 0;

    const processRow = (line: string) => {
        const cells = line.split("|").map(cell => cell.trim());
        if (cells.length > 0 && cells[0] === "") cells.shift();
        if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
        return cells;
    };

    for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i].trim();
        
        if (line.startsWith("|") && line.includes("|", 1)) {
            totalRows++;
            const row = processRow(line);
            
            // Check if this looks like a complete row (has content or is intentionally empty)
            const isCompleteRow = line.endsWith("|") || i < dataLines.length - 1;
            
            if (isCompleteRow) {
                completeRows.push(row);
            } else if (isStreamActive) {
                // During streaming, buffer the incomplete row
                bufferRow = row;
            } else {
                // Not streaming, include the row
                completeRows.push(row);
            }
        }
    }

    // Table is complete if not streaming or if we're not in the middle of streaming
    const isComplete = !isStreamActive || bufferRow.length === 0;

    return {
        isComplete,
        completeRows,
        bufferRow,
        totalRows,
        completeRowCount: completeRows.length
    };
};

export const parseMarkdownTable = (
    content: string,
    isStreamActive: boolean = false
): {
    markdown: MarkdownTableData | null;
    data: NormalizedTableData | null;
} => {
    try {
        // Analyze table completion state
        const tableState = analyzeTableCompletion(content, isStreamActive);
        
        // Create cache key based on complete row count and streaming state
        const contentHash = `${tableState.completeRowCount}-${tableState.isComplete}`;
        const cacheKey = `table-${contentHash}`;
        
        // Check cache for stable content
        const cached = tableCache.get(cacheKey);
        
        const lines = content.split("\n").filter((line) => line.trim().length > 0);
        const tableStartIndex = lines.findIndex((line) => line.trim().startsWith("|"));
        
        if (tableStartIndex === -1) return { markdown: null, data: null };

        const tableLines = lines.slice(tableStartIndex);
        if (tableLines.length < 3) return { markdown: null, data: null };

        // More robust separator validation
        const separatorLine = tableLines[1].trim();
        if (!separatorLine.includes("-") || !separatorLine.match(/^\|[:\s|\-]+\|?$/)) {
            if (!isStreamActive && process.env.NODE_ENV === 'development') {
                console.warn("Invalid table separator format:", separatorLine);
            }
            return { markdown: null, data: null };
        }

        // Process rows, preserving empty cells
        const processRow = (line: string) => {
            const cells = line.split("|").map((cell) => cell.trim());
            if (cells.length > 0 && cells[0] === "") cells.shift();
            if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
            return cells;
        };

        const headers = processRow(tableLines[0]);
        if (headers.length === 0) return { markdown: null, data: null };

        // Use controlled row release - only show complete rows during streaming
        let rowsToProcess: string[][];
        if (isStreamActive) {
            // Only use complete rows during streaming
            rowsToProcess = tableState.completeRows;
        } else {
            // Not streaming, process all rows normally
            rowsToProcess = tableLines
                .slice(2)
                .map(processRow)
                .filter((row) => row.some((cell) => cell.length > 0));
        }

        if (rowsToProcess.length === 0) return { markdown: null, data: null };

        // Light validation for table structure
        const hasValidStructure = rowsToProcess.every(row => 
            row.length > 0 && row.length <= Math.max(headers.length * 2, 10)
        );
        
        if (!hasValidStructure) {
            if (!isStreamActive && process.env.NODE_ENV === 'development') {
                console.warn("Table structure validation failed - inconsistent row lengths");
            }
            return { markdown: null, data: null };
        }

        // Clean markdown formatting for normalized data - preserve links in a structured way
        const cleanText = (text: string) => {
            return unwrapCodeSpans(text)
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/\*([^*]+)\*/g, "$1")
                .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
                // Keep links as "text|url" format for JSON data
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1|$2")
                .replace(/#{1,6}\s*/g, "")
                .trim();
        };

        // Convert to normalized data with cleaned text
        const normalizedData = rowsToProcess.map((row) => {
            const rowData: { [key: string]: string } = {};
            headers.forEach((header, index) => {
                const cleanHeader = cleanText(header);
                rowData[cleanHeader] = index < row.length ? cleanText(row[index]) : "";
            });
            return rowData;
        });

        const result = {
            markdown: { headers, rows: rowsToProcess },
            data: normalizedData,
        };

        // Cache the result for stable content
        if (isStreamActive) {
            tableCache.set(cacheKey, {
                markdown: result.markdown,
                data: result.data,
                hash: contentHash
            });
        }

        return result;
    } catch (error) {
        return { markdown: null, data: null };
    }
};



export const parseMarkdownTables = (
    content: string
): Array<{
    markdown: MarkdownTableData | null;
    data: NormalizedTableData | null;
    startIndex: number;
}> => {
    try {
        const lines = content.split("\n");
        const tables: Array<{
            markdown: MarkdownTableData | null;
            data: NormalizedTableData | null;
            startIndex: number;
        }> = [];

        let currentIndex = 0;
        while (currentIndex < lines.length) {
            // Find the start of a table
            const tableStartIndex = lines
                .slice(currentIndex)
                .findIndex((line) => line.trim().startsWith("|"));
            if (tableStartIndex === -1) break;

            // Adjust the global index
            const globalStartIndex = currentIndex + tableStartIndex;
            const tableLines = lines.slice(globalStartIndex);
            if (tableLines.length < 3) {
                currentIndex = globalStartIndex + 1;
                continue;
            }

            if (!tableLines[1].includes("-")) {
                currentIndex = globalStartIndex + 1;
                continue;
            }

            // Process rows, preserving empty cells
            const processRow = (line: string) => {
                const cells = line.split("|").map((cell) => cell.trim());
                if (cells.length > 0 && cells[0] === "") cells.shift();
                if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
                return cells;
            };

            const headers = processRow(tableLines[0]);
            if (headers.length === 0) {
                currentIndex = globalStartIndex + 1;
                continue;
            }

            const rows = tableLines
                .slice(2)
                .map(processRow)
                .filter((row) => row.some((cell) => cell.length > 0));

            // Stop processing this table when a non-table line is encountered
            const tableEndIndex = tableLines.findIndex((line, i) => i >= 2 && !line.trim().startsWith("|"));
            const tableLength = tableEndIndex === -1 ? tableLines.length : tableEndIndex + 2;

            if (rows.length === 0) {
                currentIndex = globalStartIndex + tableLength;
                continue;
            }

            // Clean markdown formatting for normalized data - preserve links in a structured way
            const cleanText = (text: string) => {
                return unwrapCodeSpans(text)
                    .replace(/\*\*([^*]+)\*\*/g, "$1")
                    .replace(/\*([^*]+)\*/g, "$1")
                    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
                    // Keep links as "text|url" format for JSON data
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1|$2")
                    .replace(/#{1,6}\s*/g, "")
                    .trim();
            };

            // Convert to normalized data
            const normalizedData = rows.map((row) => {
                const rowData: { [key: string]: string } = {};
                headers.forEach((header, index) => {
                    const cleanHeader = cleanText(header);
                    rowData[cleanHeader] = index < row.length ? cleanText(row[index]) : "";
                });
                return rowData;
            });

            tables.push({
                markdown: { headers, rows },
                data: normalizedData,
                startIndex: globalStartIndex,
            });

            // Move to the end of the current table
            currentIndex = globalStartIndex + tableLength;
        }

        return tables;
    } catch (error) {
        return [];
    }
};