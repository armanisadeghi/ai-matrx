/**
 * Revised parsing functions for Claude-generated fact check responses
 * This focuses on capturing content between known headings rather than specific sections.
 */

// Define all the possible section headers we expect
const KNOWN_HEADERS = [
    'FACT CHECK SUMMARY',
    'GENERAL OBSERVATIONS',
    'SPECIFIC CLAIMS ANALYSIS',
    'POTENTIAL CONCERNS',
    'RECOMMENDATIONS',
    'FACT CHECK TABLE',
    'OVERALL RATING'
  ];
  
  /**
   * Extract content from one heading to the next known heading
   */
  export function extractSection(content: string, startHeader: string): string {
    // Normalize content - ensure consistent newlines and spacing
    const normalizedContent = content.replace(/\r\n/g, '\n').trim();
    
    // Create pattern for the starting header (case insensitive, flexible whitespace)
    const startPattern = new RegExp(`##\\s*${startHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\n]*`, 'i');
    
    // Find the starting position
    const startMatch = normalizedContent.match(startPattern);
    if (!startMatch) {
      return ''; // Starting header not found
    }
    
    const startPos = startMatch.index! + startMatch[0].length;
    
    // Look for the next known header
    let endPos = normalizedContent.length;
    
    // Create a pattern to find any of the known headers that might come after this one
    const headersPattern = KNOWN_HEADERS.map(h => `##\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\n]*`).join('|');
    const nextHeaderPattern = new RegExp(`(${headersPattern})`, 'i');
    
    // Find all matches of headers
    const allHeaderMatches = [...normalizedContent.matchAll(new RegExp(nextHeaderPattern, 'gi'))];
    
    // Find the next header after our start position
    for (const match of allHeaderMatches) {
      if (match.index! > startPos) {
        endPos = match.index!;
        break;
      }
    }
    
    // Extract the content between start and end
    return normalizedContent.substring(startPos, endPos).trim();
  }
  
  /**
   * Extract the fact check summary section
   */
  export function extractFactCheckSummary(content: string): string {
    return extractSection(content, 'FACT CHECK SUMMARY');
  }
  
  /**
   * Extract the general observations section
   */
  export function extractGeneralObservations(content: string): string {
    const observations = extractSection(content, 'GENERAL OBSERVATIONS');
    return observations ? `### General Observations\n\n${observations}` : "";
  }
  
  /**
   * Extract the specific claims analysis section
   */
  export function extractSpecificClaimsAnalysis(content: string): string {
    const claims = extractSection(content, 'SPECIFIC CLAIMS ANALYSIS');
    return claims ? `### Specific Claims Analysis\n\n${claims}` : "";
  }
  
  /**
   * Extract the potential concerns section
   */
  export function extractPotentialConcerns(content: string): string {
    const concerns = extractSection(content, 'POTENTIAL CONCERNS');
    return concerns ? `### Potential Concerns\n\n${concerns}` : "";
  }
  
  /**
   * Extract the recommendations section
   */
  export function extractRecommendations(content: string): string {
    const recommendations = extractSection(content, 'RECOMMENDATIONS');
    return recommendations ? `## RECOMMENDATIONS\n\n${recommendations}` : "";
  }
  
  /**
   * Extract the fact check table section
   * This uses a more specific approach to handle tables better
   */
  export function extractFactCheckTable(content: string): string {
    // First look for the header
    const headerPattern = /##\s*FACT CHECK TABLE/i;
    const headerMatch = content.match(headerPattern);
    
    if (!headerMatch) {
      return "";
    }
    
    const tableSection = extractSection(content, 'FACT CHECK TABLE');
    
    // Make sure we have an actual table (at least one pipe character)
    return tableSection.includes('|') ? tableSection : "";
  }
  
  /**
   * Extract the overall rating section
   */
  export function extractOverallRating(content: string): string {
    const rating = extractSection(content, 'OVERALL RATING');
    return rating ? `## OVERALL RATING\n\n${rating}` : "";
  }
  
  /**
   * The trustworthiness rating the fact-check answer actually carries, on its
   * OWN scale.
   *
   * 🚨 Why this looks for the rating anywhere and on any scale: the bound agent
   * ("Fact Checker V2") writes `**Trustworthiness Rating: 8/10**` — it is not
   * under an `## OVERALL RATING` heading, and it is out of TEN. This function
   * used to search only inside `extractOverallRating(...)` and only match
   * `/5`, so it returned 0 on every real answer and the tab's Trustworthiness
   * stat read "Unknown" for as long as the tab has existed (found 2026-08-22).
   * Scale is REPORTED, never assumed: a 4 out of 5 and a 4 out of 10 are not
   * the same claim, and silently rescaling one into the other would be the
   * tab inventing a verdict the agent never gave.
   */
  export function extractRating(content: string): { value: number; outOf: number } | null {
    const searched = [extractOverallRating(content), content];
    for (const haystack of searched) {
      if (!haystack) continue;
      // `Rating: 8/10`, `**Trustworthiness Rating: 8/10**`, `rating — 4 / 5`.
      const labelled = haystack.match(/rating[^0-9\n]{0,20}(\d{1,2})\s*\/\s*(\d{1,2})/i);
      if (labelled) {
        return { value: parseInt(labelled[1], 10), outOf: parseInt(labelled[2], 10) };
      }
      // A bare `8/10` (or `4/5`) with no "rating" word nearby.
      const bare = haystack.match(/\b(\d{1,2})\s*\/\s*(5|10)\b/);
      if (bare) {
        return { value: parseInt(bare[1], 10), outOf: parseInt(bare[2], 10) };
      }
    }
    return null;
  }

  /**
   * Back-compat numeric accessor — the rating normalized to the 0-5 band the
   * old callers assumed. Prefer `extractRating`, which keeps the scale.
   */
  export function extractRatingValue(content: string): number {
    const rating = extractRating(content);
    if (!rating || rating.outOf <= 0) return 0;
    return Math.round((rating.value / rating.outOf) * 5);
  }
  
  /**
   * Get everything (for full display)
   */
  export function getFullFactCheck(content: string): string {
    return content.trim();
  }
  
  /**
   * Extract all sections at once and return an object
   */
  export function parseFactCheck(content: string): {
    summary: string;
    generalObservations: string;
    specificClaimsAnalysis: string;
    potentialConcerns: string;
    recommendations: string;
    factCheckTable: string;
    overallRating: string;
    /** The rating rescaled to 0-5 (0 when the answer carried none). */
    ratingValue: number;
    /** The rating AS GIVEN, with its own scale — null when absent. */
    rating: { value: number; outOf: number } | null;
    fullContent: string;
  } {
    return {
      summary: extractFactCheckSummary(content),
      generalObservations: extractGeneralObservations(content),
      specificClaimsAnalysis: extractSpecificClaimsAnalysis(content),
      potentialConcerns: extractPotentialConcerns(content),
      recommendations: extractRecommendations(content),
      factCheckTable: extractFactCheckTable(content),
      overallRating: extractOverallRating(content),
      ratingValue: extractRatingValue(content),
      rating: extractRating(content),
      fullContent: getFullFactCheck(content)
    };
  }