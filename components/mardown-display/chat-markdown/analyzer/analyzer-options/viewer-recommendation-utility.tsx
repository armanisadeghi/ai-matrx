// Viewer Recommendation Utility
// Analyzes data structures and recommends the best existing viewer

export interface ViewerRecommendation {
  viewerName: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  matchedPattern: string;
  sampleCount?: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// Pattern detection functions for each viewer (ordered by specificity)

// 1. SectionGroupTab - Most specific structure
const detectSectionGroupPattern = (data: unknown): ViewerRecommendation | null => {
  const record = asRecord(data);
  if (
    record &&
    Array.isArray(record.sections) &&
    record.sections.length > 0 &&
    record.sections.every((section: unknown) => {
      const s = asRecord(section);
      return (
        s &&
        typeof s.position === 'number' &&
        Array.isArray(s.lines) &&
        s.lines.every((line: unknown) => {
          const l = asRecord(line);
          return (
            l &&
            typeof l.position === 'number' &&
            typeof l.category === 'string' &&
            typeof l.line === 'string' &&
            l.metadata &&
            l.segmentation
          );
        })
      );
    })
  ) {
    return {
      viewerName: 'SectionGroupTab',
      confidence: 'high',
      reasoning: 'Data structure matches SectionGroup with sections containing lines with metadata and segmentation',
      matchedPattern: 'SectionGroup',
      sampleCount: record.sections.length
    };
  }
  return null;
};

// 2. SectionViewer/SectionViewerWithSidebar - ClassifiedSection pattern
const detectClassifiedSectionPattern = (data: unknown): ViewerRecommendation | null => {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item: unknown) => {
      const i = asRecord(item);
      return (
        i &&
        typeof i.section === 'string' &&
        Array.isArray(i.content) &&
        i.content.every((c: unknown) => typeof c === 'string')
      );
    })
  ) {
    return {
      viewerName: 'SectionViewer / SectionViewerWithSidebar',
      confidence: 'high',
      reasoning: 'Data structure matches ClassifiedSection[] with section (string) and content (string[])',
      matchedPattern: 'ClassifiedSection[]',
      sampleCount: data.length
    };
  }
  return null;
};

// 3. section-viewer-V2 - SectionData pattern
const detectSectionDataPattern = (data: unknown): ViewerRecommendation | null => {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item: unknown) => {
      const i = asRecord(item);
      return (
        i &&
        typeof i.section === 'string' &&
        Array.isArray(i.content) &&
        i.content.every((c: unknown) => typeof c === 'string') &&
        !i.section_type // Distinguish from ClassifiedSection which might have section_type
      );
    })
  ) {
    return {
      viewerName: 'section-viewer-V2',
      confidence: 'high',
      reasoning: 'Data structure matches SectionData[] with section (string) and content (string[])',
      matchedPattern: 'SectionData[]',
      sampleCount: data.length
    };
  }
  return null;
};

// 4. sections-viewer - ContentSection pattern
const detectContentSectionPattern = (data: unknown): ViewerRecommendation | null => {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((section: unknown) => {
      const s = asRecord(section);
      return (
        s &&
        typeof s.type === 'string' &&
        Array.isArray(s.children) &&
        s.children.every((item: unknown) => {
          const c = asRecord(item);
          return c && typeof c.type === 'string' && typeof c.content === 'string';
        })
      );
    })
  ) {
    return {
      viewerName: 'sections-viewer',
      confidence: 'high',
      reasoning: 'Data structure matches ContentSection[] with type and children array containing ContentItems',
      matchedPattern: 'ContentSection[]',
      sampleCount: data.length
    };
  }
  return null;
};

// 5. lines-viewer - LineItem pattern
const detectLineItemPattern = (data: unknown): ViewerRecommendation | null => {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item: unknown) => {
      const i = asRecord(item);
      return i && typeof i.type === 'string' && typeof i.content === 'string' && !i.children; // Distinguish from ContentSection children
    })
  ) {
    return {
      viewerName: 'lines-viewer',
      confidence: 'high',
      reasoning: 'Data structure matches LineItem[] with type (string) and content (string)',
      matchedPattern: 'LineItem[]',
      sampleCount: data.length
    };
  }
  return null;
};

// 6. FlatSectionViewer - Flat section pattern (specific key-value object)
const detectFlatSectionPattern = (data: unknown): ViewerRecommendation | null => {
  const record = asRecord(data);
  if (
    record &&
    Object.keys(record).length > 0 &&
    Object.values(record).every(value => typeof value === 'string') &&
    // Check if keys follow section naming patterns
    Object.keys(record).some(key =>
      key.includes('_section') ||
      key.includes('header_') ||
      key.includes('paragraph') ||
      key.includes('text') ||
      /[a-zA-Z_]+_\d+$/.test(key) // Pattern with numbers like header_h2_section_2
    )
  ) {
    return {
      viewerName: 'FlatSectionViewer',
      confidence: 'high',
      reasoning: 'Data structure is a flat object with section-like keys and string content - perfect for FlatSectionViewer with consistent numbering and raw/rendered toggle',
      matchedPattern: 'Flat Section Object',
      sampleCount: Object.keys(record).length
    };
  }
  return null;
};

// 7. IntelligentViewer - Key-Value Object pattern (generic fallback)
const detectKeyValuePattern = (data: unknown): ViewerRecommendation | null => {
  const record = asRecord(data);
  if (
    record &&
    Object.keys(record).length > 0 &&
    Object.values(record).every(value => typeof value === 'string')
  ) {
    return {
      viewerName: 'IntelligentViewer',
      confidence: 'medium',
      reasoning: 'Data structure is a flat object with string values - suitable for key-value rendering',
      matchedPattern: 'Key-Value Object',
      sampleCount: Object.keys(record).length
    };
  }
  return null;
};

// 8. IntelligentViewer - Section-with-Children pattern
const detectSectionWithChildrenPattern = (data: unknown): ViewerRecommendation | null => {
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item: unknown) => {
      const i = asRecord(item);
      return (
        i &&
        typeof i.type === 'string' &&
        Array.isArray(i.children) &&
        i.children.every((child: unknown) => {
          const c = asRecord(child);
          return c && typeof c.type === 'string' && typeof c.content === 'string';
        })
      );
    }) &&
    // This is similar to ContentSection but we need to distinguish
    // IntelligentViewer handles this pattern but sections-viewer is more specific
    !data.every((section: unknown) => {
      const s = asRecord(section);
      const children = s?.children;
      return Array.isArray(children) && children.every((item: unknown) => {
        const c = asRecord(item);
        return c && typeof c.type === 'string' && ['header_h1', 'header_h2', 'header_h3', 'bullet', 'paragraph', 'line_break'].includes(c.type);
      });
    })
  ) {
    return {
      viewerName: 'IntelligentViewer',
      confidence: 'low',
      reasoning: 'Data structure has type and children pattern but may be better handled by sections-viewer',
      matchedPattern: 'Section-with-Children (Generic)',
      sampleCount: data.length
    };
  }
  return null;
};

// Main recommendation function
export const getViewerRecommendation = (data: unknown): ViewerRecommendation => {
  // Try detectors in order of specificity (most specific first)
  const detectors = [
    detectSectionGroupPattern,
    detectClassifiedSectionPattern,
    detectSectionDataPattern,
    detectContentSectionPattern,
    detectLineItemPattern,
    detectFlatSectionPattern, // Check for flat sections before generic key-value
    detectKeyValuePattern,
    detectSectionWithChildrenPattern
  ];

  for (const detector of detectors) {
    const recommendation = detector(data);
    if (recommendation) {
      return recommendation;
    }
  }

  // Fallback recommendation
  return {
    viewerName: 'IntelligentViewer',
    confidence: 'low',
    reasoning: 'No specific pattern detected - IntelligentViewer will attempt to handle with fallbacks',
    matchedPattern: 'Unknown Structure'
  };
};

// Helper function to get multiple recommendations (useful for debugging)
export const getAllViewerRecommendations = (data: unknown): ViewerRecommendation[] => {
  const detectors = [
    { name: 'SectionGroup', fn: detectSectionGroupPattern },
    { name: 'ClassifiedSection', fn: detectClassifiedSectionPattern },
    { name: 'SectionData', fn: detectSectionDataPattern },
    { name: 'ContentSection', fn: detectContentSectionPattern },
    { name: 'LineItem', fn: detectLineItemPattern },
    { name: 'FlatSection', fn: detectFlatSectionPattern },
    { name: 'Key-Value', fn: detectKeyValuePattern },
    { name: 'Section-with-Children', fn: detectSectionWithChildrenPattern }
  ];

  const recommendations: ViewerRecommendation[] = [];

  for (const detector of detectors) {
    const recommendation = detector.fn(data);
    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  return recommendations;
};

// Quick analysis function for debugging
export const analyzeDataStructure = (data: unknown): {
  dataType: string;
  isArray: boolean;
  arrayLength?: number;
  topLevelKeys?: string[];
  sampleStructure?: unknown;
  recommendations: ViewerRecommendation[];
} => {
  const isArray = Array.isArray(data);
  const dataType = typeof data;

  const result: {
    dataType: string;
    isArray: boolean;
    arrayLength?: number;
    topLevelKeys?: string[];
    sampleStructure?: unknown;
    recommendations: ViewerRecommendation[];
  } = {
    dataType,
    isArray,
    recommendations: getAllViewerRecommendations(data)
  };

  if (isArray) {
    result.arrayLength = data.length;
    if (data.length > 0) {
      result.sampleStructure = {
        firstItem: data[0],
        keysInFirstItem: typeof data[0] === 'object' && data[0] !== null ? Object.keys(data[0] as object) : null
      };
    }
  } else if (dataType === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    result.topLevelKeys = Object.keys(record);
    result.sampleStructure = {
      keyCount: Object.keys(record).length,
      firstFewKeys: Object.keys(record).slice(0, 3),
      valueTypes: Object.values(record).slice(0, 3).map(v => typeof v)
    };
  }

  return result;
};
