export const getKeysAtPath = (data, path: string[] = []) => {
    try {
        let currentData = data;

        // Navigate to the current path
        for (const key of path) {
            if (key === "All") continue;

            // Handle "Item X" and "Object X" formats
            if (key.startsWith("Item ")) {
                const index = parseInt(key.replace("Item ", ""));
                currentData = currentData[index];
            } else if (key.startsWith("Object ")) {
                const index = parseInt(key.replace("Object ", ""));
                currentData = currentData[index];
            } else {
                currentData = currentData[key];
            }
        }

        // Return keys at current level
        if (currentData && typeof currentData === "object") {
            if (Array.isArray(currentData)) {
                if (currentData.length === 0) {
                    return ["All"]; // Empty array
                }

                // Always show array items as "Item X"
                return ["All", ...currentData.map((_, index) => `Item ${index}`)];
            } else {
                // For regular objects with keys
                const keys = Object.keys(currentData);
                if (keys.length > 0) {
                    return ["All", ...keys];
                } else {
                    // Empty object
                    return ["All"];
                }
            }
        }

        return ["All"];
    } catch (error) {
        console.error("Error getting keys at path:", error);
        return ["All"];
    }
};

export const getDataAtPath = (data, path: string[] = []) => {
    try {
        let currentData = data;

        // Navigate through the path, but skip 'All' selections
        for (const key of path) {
            if (key === "All") continue;

            // Handle various key formats
            if (key.startsWith("Item ")) {
                const index = parseInt(key.replace("Item ", ""));
                currentData = currentData[index];
            } else if (key.startsWith("Object ")) {
                const index = parseInt(key.replace("Object ", ""));
                currentData = currentData[index];
            } else {
                currentData = currentData[key];
            }
        }

        return currentData;
    } catch (error) {
        console.error("Error getting data at path:", error);
        return null;
    }
};

// Helper to handle complex array structures
export const getNextLevelOptions = (data) => {
    if (!data || typeof data !== "object") return ["All"];

    if (Array.isArray(data)) {
        if (data.length === 0) return ["All"];

        // Special handling for arrays of arrays or arrays of objects
        return ["All", ...data.map((_, index) => `Item ${index}`)];
    } else {
        const keys = Object.keys(data);
        if (keys.length === 0) return ["All"];
        return ["All", ...keys];
    }
};

// Generate a comprehensive path description
export const generatePathDescription = (currentPath) => {
    if (currentPath.length === 0) return "Root object";

    const pathElements: string[] = [];

    // Iterate through all path elements
    for (let i = 0; i < currentPath.length; i++) {
        const [_, key] = currentPath[i];
        if (key === "All") continue; // Skip "All" selections

        // Ensure key is treated as a string
        const keyStr = String(key);

        if (keyStr.startsWith("Item ")) {
            // For array items
            const index = parseInt(keyStr.replace("Item ", ""));
            pathElements.push(`Item ${index}`);
        } else if (keyStr.startsWith("Object ")) {
            // For object items in arrays
            const index = parseInt(keyStr.replace("Object ", ""));
            pathElements.push(`Object ${index}`);
        } else {
            // For normal object keys
            pathElements.push(`"${keyStr}"`);
        }
    }

    return pathElements.length > 0 ? pathElements.join(" → ") : "Root object";
};


export const generateAccessPath = (currentPath) => {
    if (currentPath.length === 0) return "data";

    // Start with the base
    let accessPath = "data";

    // Iterate through all path elements
    for (let i = 0; i < currentPath.length; i++) {
        const [_, key] = currentPath[i];
        if (key === "All") continue; // Skip "All" selections

        // Ensure key is treated as a string
        const keyStr = String(key);

        if (keyStr.startsWith("Item ")) {
            // For array items
            const index = parseInt(keyStr.replace("Item ", ""));
            accessPath += `[${index}]`;
        } else if (keyStr.startsWith("Object ")) {
            // For object items in arrays
            const index = parseInt(keyStr.replace("Object ", ""));
            accessPath += `[${index}]`;
        } else {
            // For normal object keys
            accessPath += `["${keyStr}"]`;
        }
    }

    return accessPath;
};

// Convert current path to enhanced bookmark format
export const convertToEnhancedBookmark = (currentPath, ignorePrefix = undefined) => {
    try {
        // Build the full access path first
        const fullAccessPath = generateAccessPath(currentPath);
        
        // Parse the full access path to get the array representation
        const fullPathArray = parseAccessPathToArray(fullAccessPath);

        // If ignorePrefix is provided, try to parse it and remove matching prefix
        if (ignorePrefix && typeof ignorePrefix === 'string') {
            try {
                const prefixArray = parseAccessPathToArray(ignorePrefix);
                
                // Check if the beginning of fullPathArray matches prefixArray (with wildcard support)
                if (Array.isArray(prefixArray) && prefixArray.length > 0 && prefixArray.length <= fullPathArray.length) {
                    let matches = true;
                    for (let i = 0; i < prefixArray.length; i++) {
                        // "*" acts as a wildcard that matches any value
                        if (prefixArray[i] !== "*" && fullPathArray[i] !== prefixArray[i]) {
                            matches = false;
                            break;
                        }
                    }
                    
                    // If it matches, remove the prefix
                    if (matches) {
                        return fullPathArray.slice(prefixArray.length);
                    }
                }
            } catch (parseError) {
                // If prefix parsing fails, just ignore it and return the full path
                console.warn('Failed to parse ignorePrefix:', ignorePrefix, parseError);
            }
        }

        return fullPathArray;
    } catch (error) {
        // If anything goes wrong, fall back to a safe default
        console.error('Error in convertToEnhancedBookmark:', error);
        return [];
    }
};

// Helper function to parse access path string to array
export const parseAccessPathToArray = (accessPath) => {
    if (!accessPath) return [];
    
    // Handle paths like: data[0]["result"]["section_texts"] or data[*]["result"]
    // Split by brackets and quotes, then clean up
    const parts: (string | number)[] = [];
    
    // Remove 'data' prefix if it exists
    let path = accessPath;
    if (path.startsWith('data')) {
        parts.push('data');
        path = path.substring(4);
    }
    
    // Parse the rest of the path
    const regex = /\[([^\]]+)\]/g;
    let match;
    
    while ((match = regex.exec(path)) !== null) {
        let value = match[1];
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        // Handle wildcards
        if (value === "*") {
            parts.push("*");
        }
        // Convert to number if it's a numeric string
        else if (/^\d+$/.test(value)) {
            parts.push(parseInt(value));
        } else {
            parts.push(value);
        }
    }
    
    return parts;
};

// Generate enhanced bookmark object
export const generateEnhancedBookmarkObject = (currentPath, name, ignorePrefix = undefined) => {
    const pathArray = convertToEnhancedBookmark(currentPath, ignorePrefix);
    
    return {
        name: name,
        path: pathArray
    };
};
