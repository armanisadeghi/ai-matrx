interface RemovalDetail {
  attribute: string;
  match_type: string;
  trigger_value: string;
  text: string;
  html_length: number;
}

interface OverviewData {
  uuid: string;
  website: string;
  url: string;
  unique_page_name: string;
  page_title: string;
  has_structured_content: boolean;
  table_count: number;
  code_block_count: number;
  list_count: number;
  outline: { [key: string]: string[] };
  char_count: number;
  char_count_formatted: number;
  metadata?: object | null;
}

interface ExtractedLinks {
  internal: string[];
  external: string[];
  images: string[];
  documents: string[];
  others: string[];
  audio: string[];
  videos: string[];
  archives: string[];
}

interface ScrapedResultHashes {
  minhash?: number[] | string;
  simhash?: number | string;
  outline_simhash?: number | string;
}

interface ScrapedPageItem {
  /** true = scraped successfully, false = failed */
  success: boolean;
  /** Human-readable reason when success is false */
  failure_reason: string | null;
  url: string;
  overview: OverviewData | null;
  structured_data: object | null;
  organized_data: object | null;
  text_data: string | null;
  /** Full markdown with links/images — render with ScrapedContentPretty */
  markdown_renderable?: string | null;
  main_image: string | null;
  hashes: ScrapedResultHashes | null;
  content_filter_removal_details: RemovalDetail[] | null;
  links: ExtractedLinks | null;
  scraped_at: string;
}

interface ScrapeMetadata {
  execution_time_ms?: number | null;
}

interface ScrapedPagesResponse {
  response_type: "scraped_pages";
  metadata: ScrapeMetadata;
  results: ScrapedPageItem[];
}

// Header analysis interfaces
interface Header {
  tag: string;
  text: string;
}

interface GroupedHeaders {
  [key: string]: string[];
}

interface HeaderAnalysisResult {
  headers: Header[];
  groupedHeaders: GroupedHeaders;
  totalHeaders: number;
  hasProperH1: boolean;
  hasProperHierarchy: boolean;
  h1Count: number;
  hierarchyIssues: string[];
}

// SEO analysis interfaces
interface TitleAnalysis {
  length: number;
  status: "Too short" | "Too long" | "Good length";
  statusClass: string;
  title: string;
}

interface ContentMetrics {
  charCount: number;
  estimatedWordCount: number;
  hasStructuredContent: boolean;
  tableCount: number;
  codeBlockCount: number;
  listCount: number;
  contentLengthStatus: "short" | "acceptable" | "good";
  contentLengthClass: string;
  contentLengthMessage: string;
}

interface SEOSuggestion {
  type: "title" | "heading" | "content" | "structure";
  message: string;
  priority: "high" | "medium" | "low";
}

interface SEOAnalysisResult {
  titleAnalysis: TitleAnalysis;
  contentMetrics: ContentMetrics;
  headerAnalysis: HeaderAnalysisResult;
  suggestions: SEOSuggestion[];
  seoScore: number;
}

/**
 * Utility class for handling nested JSON data extraction and processing
 */
class ScraperDataUtils {
  /**
   * Extracts top-level properties from the data object
   */
  static getTopLevel(data: unknown): Partial<ScrapedPagesResponse> {
    if (!data || typeof data !== "object") {
      return {};
    }
    return {
      response_type: (data as ScrapedPagesResponse).response_type,
      metadata: (data as ScrapedPagesResponse).metadata,
      results: (data as ScrapedPagesResponse).results,
    };
  }

  /**
   * Extracts metadata properties
   */
  static getMetadata(metadata: unknown): Partial<ScrapeMetadata> {
    if (!metadata || typeof metadata !== "object") {
      return {};
    }
    return {
      execution_time_ms: (metadata as ScrapeMetadata).execution_time_ms,
    };
  }

  /**
   * Extracts results array and maps to simplified objects
   */
  static getResults(results: unknown): ScrapedPageItem[] {
    if (!Array.isArray(results)) {
      return [];
    }
    return results.map((result) => ({
      success: result.success,
      failure_reason: result.failure_reason ?? null,
      url: result.url,
      overview: result.overview,
      structured_data: result.structured_data,
      organized_data: result.organized_data,
      text_data: result.text_data,
      markdown_renderable: result.markdown_renderable ?? null,
      main_image: result.main_image,
      hashes: result.hashes ?? null,
      content_filter_removal_details: result.content_filter_removal_details,
      links: result.links,
      scraped_at: result.scraped_at,
    }));
  }

  /**
   * Extracts overview properties
   */
  static getOverview(overview: unknown): Partial<OverviewData> {
    if (!overview || typeof overview !== "object") {
      return {};
    }
    return {
      uuid: (overview as OverviewData).uuid,
      website: (overview as OverviewData).website,
      url: (overview as OverviewData).url,
      unique_page_name: (overview as OverviewData).unique_page_name,
      page_title: (overview as OverviewData).page_title,
      has_structured_content: (overview as OverviewData).has_structured_content,
      table_count: (overview as OverviewData).table_count,
      code_block_count: (overview as OverviewData).code_block_count,
      list_count: (overview as OverviewData).list_count,
      outline: (overview as OverviewData).outline,
      char_count: (overview as OverviewData).char_count,
      char_count_formatted: (overview as OverviewData).char_count_formatted,
      metadata: (overview as OverviewData).metadata,
    };
  }

  /**
   * Extracts outline headings and their content
   */
  static getOutline(outline: unknown): { [key: string]: string[] } {
    if (!outline || typeof outline !== "object") {
      return {};
    }
    return Object.keys(outline).reduce(
      (acc, key) => {
        acc[key] = (outline as { [key: string]: string[] })[key];
        return acc;
      },
      {} as { [key: string]: string[] },
    );
  }

  /**
   * Analyzes page title for SEO
   */
  static analyzeTitleSEO(title: unknown): TitleAnalysis {
    const titleStr = typeof title === "string" ? title : "";
    const length = titleStr.length;

    let status: "Too short" | "Too long" | "Good length";
    let statusClass: string;

    if (length < 30) {
      status = "Too short";
      statusClass = "text-yellow-500 dark:text-yellow-400";
    } else if (length > 60) {
      status = "Too long";
      statusClass = "text-red-500 dark:text-red-400";
    } else {
      status = "Good length";
      statusClass = "text-green-500 dark:text-green-400";
    }

    return {
      length,
      status,
      statusClass,
      title: titleStr,
    };
  }

  /**
   * Analyzes content metrics for SEO
   */
  static analyzeContentMetrics(overview: unknown): ContentMetrics {
    const overviewData = this.getOverview(overview);

    const charCount = overviewData.char_count || 0;
    const estimatedWordCount = Math.round(charCount / 5.5);
    const hasStructuredContent = overviewData.has_structured_content || false;
    const tableCount = overviewData.table_count || 0;
    const codeBlockCount = overviewData.code_block_count || 0;
    const listCount = overviewData.list_count || 0;

    let contentLengthStatus: "short" | "acceptable" | "good";
    let contentLengthClass: string;
    let contentLengthMessage: string;

    if (charCount < 1000) {
      contentLengthStatus = "short";
      contentLengthClass = "bg-red-500";
      contentLengthMessage =
        "Content is likely too short for competitive SEO rankings";
    } else if (charCount < 2500) {
      contentLengthStatus = "acceptable";
      contentLengthClass = "bg-yellow-500";
      contentLengthMessage =
        "Content length is acceptable but could be improved";
    } else {
      contentLengthStatus = "good";
      contentLengthClass = "bg-green-500";
      contentLengthMessage = "Content length is good for SEO purposes";
    }

    return {
      charCount,
      estimatedWordCount,
      hasStructuredContent,
      tableCount,
      codeBlockCount,
      listCount,
      contentLengthStatus,
      contentLengthClass,
      contentLengthMessage,
    };
  }

  /**
   * Generates SEO suggestions based on analysis
   */
  static generateSEOSuggestions(
    titleAnalysis: TitleAnalysis,
    contentMetrics: ContentMetrics,
    headerAnalysis: HeaderAnalysisResult,
  ): SEOSuggestion[] {
    const suggestions: SEOSuggestion[] = [];

    // Title suggestions
    if (titleAnalysis.length < 30) {
      suggestions.push({
        type: "title",
        message:
          "Page title is too short. Consider expanding it to 50-60 characters for better SEO.",
        priority: "high",
      });
    } else if (titleAnalysis.length > 60) {
      suggestions.push({
        type: "title",
        message:
          "Page title exceeds recommended length. Consider shortening to 50-60 characters to prevent truncation in search results.",
        priority: "high",
      });
    }

    // H1 suggestions
    if (headerAnalysis.h1Count === 0) {
      suggestions.push({
        type: "heading",
        message:
          "Missing H1 heading. Add a primary H1 heading that includes target keywords.",
        priority: "high",
      });
    } else if (headerAnalysis.h1Count > 1) {
      suggestions.push({
        type: "heading",
        message:
          "Multiple H1 headings detected. Consider using only one H1 for optimal SEO structure.",
        priority: "medium",
      });
    }

    // Heading structure suggestions
    const h2Count = headerAnalysis.groupedHeaders.H2?.length || 0;
    if (h2Count === 0) {
      suggestions.push({
        type: "structure",
        message:
          "No H2 headings found. Consider adding H2 subheadings to improve content structure.",
        priority: "medium",
      });
    }

    // Content suggestions
    if (contentMetrics.charCount < 1000) {
      suggestions.push({
        type: "content",
        message:
          "Content length is short. Consider expanding to at least 1,000-1,500 characters for better search ranking potential.",
        priority: "medium",
      });
    }

    if (contentMetrics.listCount === 0) {
      suggestions.push({
        type: "structure",
        message:
          "No lists detected. Consider adding bulleted or numbered lists to improve readability and SEO.",
        priority: "low",
      });
    }

    return suggestions;
  }

  /**
   * Calculates SEO score based on various factors
   */
  static calculateSEOScore(
    titleAnalysis: TitleAnalysis,
    contentMetrics: ContentMetrics,
    headerAnalysis: HeaderAnalysisResult,
  ): number {
    let score = 0;
    let maxScore = 100;

    // Title score (20 points)
    if (titleAnalysis.status === "Good length") {
      score += 20;
    } else if (titleAnalysis.status === "Too short") {
      score += 10;
    } // Too long gets 0 points

    // H1 score (20 points)
    if (headerAnalysis.hasProperH1) {
      score += 20;
    } else if (headerAnalysis.h1Count > 0) {
      score += 10;
    }

    // Content length score (25 points)
    if (contentMetrics.contentLengthStatus === "good") {
      score += 25;
    } else if (contentMetrics.contentLengthStatus === "acceptable") {
      score += 15;
    } else {
      score += 5;
    }

    // Header hierarchy score (20 points)
    if (headerAnalysis.hasProperHierarchy) {
      score += 20;
    } else {
      score += Math.max(0, 20 - headerAnalysis.hierarchyIssues.length * 5);
    }

    // Structure score (15 points)
    let structureScore = 0;
    if (contentMetrics.hasStructuredContent) structureScore += 5;
    if (contentMetrics.listCount > 0) structureScore += 5;
    if (contentMetrics.tableCount > 0) structureScore += 3;
    if ((headerAnalysis.groupedHeaders.H2?.length || 0) > 0)
      structureScore += 2;

    score += Math.min(structureScore, 15);

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Performs complete SEO analysis
   */
  static performSEOAnalysis(
    overview: unknown,
    structuredData: unknown = {},
  ): SEOAnalysisResult {
    const overviewData = this.getOverview(overview);
    const titleAnalysis = this.analyzeTitleSEO(overviewData.page_title);
    const contentMetrics = this.analyzeContentMetrics(overview);
    const headerAnalysis = this.analyzeHeaders(overviewData.outline);
    const suggestions = this.generateSEOSuggestions(
      titleAnalysis,
      contentMetrics,
      headerAnalysis,
    );
    const seoScore = this.calculateSEOScore(
      titleAnalysis,
      contentMetrics,
      headerAnalysis,
    );

    return {
      titleAnalysis,
      contentMetrics,
      headerAnalysis,
      suggestions,
      seoScore,
    };
  }

  /**
   * Analyzes headers from outline data
   */
  static analyzeHeaders(outline: unknown): HeaderAnalysisResult {
    const outlineData = this.getOutline(outline);

    // Extract headers from outline, filtering out "unassociated"
    const headers: Header[] = Object.keys(outlineData)
      .filter((key) => key !== "unassociated")
      .map((key) => {
        const [tag, text] = key.split(": ");
        return { tag: tag.toUpperCase(), text: text || key };
      })
      .filter((header) => /^H[1-6]$/.test(header.tag));

    // Group headers by tag
    const groupedHeaders: GroupedHeaders = headers.reduce((acc, header) => {
      acc[header.tag] = acc[header.tag] || [];
      acc[header.tag].push(header.text);
      return acc;
    }, {} as GroupedHeaders);

    // Analyze header structure
    const h1Count = groupedHeaders.H1?.length || 0;
    const hasProperH1 = h1Count === 1;

    // Check hierarchy (should not skip levels)
    const hierarchyIssues: string[] = [];
    const headerLevels = Object.keys(groupedHeaders).sort();

    if (h1Count === 0) {
      hierarchyIssues.push("No H1 tag found");
    } else if (h1Count > 1) {
      hierarchyIssues.push(`Multiple H1 tags found (${h1Count})`);
    }

    // Check for skipped levels
    for (let i = 1; i < headerLevels.length; i++) {
      const currentLevel = parseInt(headerLevels[i].replace("H", ""));
      const previousLevel = parseInt(headerLevels[i - 1].replace("H", ""));

      if (currentLevel - previousLevel > 1) {
        hierarchyIssues.push(
          `Skipped from ${headerLevels[i - 1]} to ${headerLevels[i]}`,
        );
      }
    }

    const hasProperHierarchy = hierarchyIssues.length === 0;

    return {
      headers,
      groupedHeaders,
      totalHeaders: headers.length,
      hasProperH1,
      hasProperHierarchy,
      h1Count,
      hierarchyIssues,
    };
  }

  /**
   * Gets header distribution statistics
   */
  static getHeaderDistribution(groupedHeaders: GroupedHeaders): {
    [key: string]: { count: number; percentage: number };
  } {
    const totalHeaders = Object.values(groupedHeaders).reduce(
      (sum, headers) => sum + headers.length,
      0,
    );

    if (totalHeaders === 0) {
      return {};
    }

    return Object.entries(groupedHeaders).reduce(
      (acc, [tag, headers]) => {
        acc[tag] = {
          count: headers.length,
          percentage: Math.round((headers.length / totalHeaders) * 100),
        };
        return acc;
      },
      {} as { [key: string]: { count: number; percentage: number } },
    );
  }

  /**
   * Extracts metadata from overview
   */
  static getOverviewMetadata(metadata: unknown): Partial<object> {
    if (!metadata || typeof metadata !== "object") {
      return {};
    }
    return {
      json_ld: (metadata as any)["json-ld"],
      opengraph: (metadata as any).opengraph,
      meta_tags: (metadata as any).meta_tags,
      canonical_url: (metadata as any).canonical_url,
      structured_data: (metadata as any).structured_data,
      robots_directives: (metadata as any).robots_directives,
    };
  }

  /**
   * Extracts structured data (ordered lists)
   */
  static getStructuredData(structuredData: unknown): object {
    if (!structuredData || typeof structuredData !== "object") {
      return {};
    }
    return (structuredData as any)["Ordered Lists"] || {};
  }

  /**
   * Extracts organized data by headings
   */
  static getOrganizedData(organizedData: unknown): Record<string, unknown> {
    if (!organizedData || typeof organizedData !== "object") {
      return {};
    }
    const source = organizedData as Record<string, unknown>;
    return Object.keys(source).reduce(
      (acc, key) => {
        acc[key] = source[key];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  /**
   * Extracts text data
   */
  static getTextData(textData: unknown): string {
    return typeof textData === "string" ? textData : "";
  }

  /**
   * Extracts links by type
   */
  static getLinks(links: unknown): Partial<ExtractedLinks> {
    if (!links || typeof links !== "object") {
      return {};
    }
    return {
      internal: (links as ExtractedLinks).internal || [],
      external: (links as ExtractedLinks).external || [],
      images: (links as ExtractedLinks).images || [],
      documents: (links as ExtractedLinks).documents || [],
      others: (links as ExtractedLinks).others || [],
      audio: (links as ExtractedLinks).audio || [],
      videos: (links as ExtractedLinks).videos || [],
      archives: (links as ExtractedLinks).archives || [],
    };
  }

  /**
   * Extracts content filter removal details
   */
  static getContentFilterRemovalDetails(details: unknown): RemovalDetail[] {
    if (!Array.isArray(details)) {
      return [];
    }
    return details.map((detail) => ({
      attribute: detail.attribute,
      match_type: detail.match_type,
      trigger_value: detail.trigger_value,
      text: detail.text,
      html_length: detail.html_length,
    }));
  }

  /**
   * Processes the entire data structure and returns all components
   */
  static processFullData(data: unknown): {
    topLevel: Partial<ScrapedPagesResponse>;
    metadata: Partial<ScrapeMetadata>;
    results: Array<{
      success: boolean;
      failure_reason: string | null;
      url: string;
      overview: Partial<OverviewData>;
      structured_data: object;
      organized_data: object;
      text_data: string;
      markdown_renderable?: string | null;
      main_image: string | null;
      hashes: ScrapedResultHashes | null;
      content_filter_removal_details: RemovalDetail[];
      links: Partial<ExtractedLinks>;
      scraped_at: string;
      overview_metadata: Partial<object>;
      outline: { [key: string]: string[] };
    }>;
  } {
    const topLevel = this.getTopLevel(data);
    const metadata = this.getMetadata(topLevel.metadata);
    const results = this.getResults(topLevel.results);

    const processedResults = results.map((result) => ({
      ...result,
      overview: this.getOverview(result.overview),
      structured_data: this.getStructuredData(result.structured_data),
      organized_data: this.getOrganizedData(result.organized_data),
      text_data: this.getTextData(result.text_data),
      markdown_renderable: result.markdown_renderable ?? null,
      links: this.getLinks(result.links),
      content_filter_removal_details: this.getContentFilterRemovalDetails(
        result.content_filter_removal_details,
      ),
      overview_metadata: this.getOverviewMetadata(result.overview?.metadata),
      outline: this.getOutline(result.overview?.outline),
    }));

    return {
      topLevel,
      metadata,
      results: processedResults,
    };
  }
}

export default ScraperDataUtils;
