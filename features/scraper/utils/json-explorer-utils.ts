
export const getKeysAtPath = (data: unknown, path: string[] = []) => {
    try {
      let currentData: unknown = data;

      // Navigate to the current path
      for (const key of path) {
        if (key === 'All') continue;

        // Handle "Item X" and "Object X" formats
        if (key.startsWith('Item ')) {
          const index = parseInt(key.replace('Item ', ''));
          currentData = Array.isArray(currentData) ? currentData[index] : undefined;
        } else if (key.startsWith('Object ')) {
          const index = parseInt(key.replace('Object ', ''));
          currentData = Array.isArray(currentData) ? currentData[index] : undefined;
        } else {
          currentData = currentData && typeof currentData === 'object'
            ? (currentData as Record<string, unknown>)[key]
            : undefined;
        }
      }

      // Return keys at current level
      if (currentData && typeof currentData === 'object') {
        if (Array.isArray(currentData)) {
          if (currentData.length === 0) {
            return ['All']; // Empty array
          }

          // Always show array items as "Item X"
          return ['All', ...currentData.map((_, index) => `Item ${index}`)];
        } else {
          // For regular objects with keys
          const keys = Object.keys(currentData);
          if (keys.length > 0) {
            return ['All', ...keys];
          } else {
            // Empty object
            return ['All'];
          }
        }
      }

      return ['All'];
    } catch (error) {
      console.error("Error getting keys at path:", error);
      return ['All'];
    }
  };

  export const getDataAtPath = (data: unknown, path: string[] = []): unknown => {
    try {
      let currentData: unknown = data;

      // Navigate through the path, but skip 'All' selections
      for (const key of path) {
        if (key === 'All') continue;

        // Handle various key formats
        if (key.startsWith('Item ')) {
          const index = parseInt(key.replace('Item ', ''));
          currentData = Array.isArray(currentData) ? currentData[index] : undefined;
        } else if (key.startsWith('Object ')) {
          const index = parseInt(key.replace('Object ', ''));
          currentData = Array.isArray(currentData) ? currentData[index] : undefined;
        } else {
          currentData = currentData && typeof currentData === 'object'
            ? (currentData as Record<string, unknown>)[key]
            : undefined;
        }
      }

      return currentData;
    } catch (error) {
      console.error("Error getting data at path:", error);
      return null;
    }
  };

  // Helper to handle complex array structures
  export const getNextLevelOptions = (data: unknown) => {
    if (!data || typeof data !== 'object') return ['All'];

    if (Array.isArray(data)) {
      if (data.length === 0) return ['All'];

      // Special handling for arrays of arrays or arrays of objects
      return ['All', ...data.map((_, index) => `Item ${index}`)];
    } else {
      const keys = Object.keys(data);
      if (keys.length === 0) return ['All'];
      return ['All', ...keys];
    }
  };
