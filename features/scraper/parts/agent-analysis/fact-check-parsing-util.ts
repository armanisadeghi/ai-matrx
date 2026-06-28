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
   * Extract rating as a number (for display in stats)
   */
  export function extractRatingValue(content: string): number {
    const ratingSection = extractOverallRating(content);
    
    // Try to find various forms of the rating
    // First try the standard format
    let ratingMatch = ratingSection.match(/\*\*rating\*\*:\s*(\d+)\/5/i);
    
    if (!ratingMatch) {
      // Try without the bold markdown
      ratingMatch = ratingSection.match(/rating:\s*(\d+)\/5/i);
    }
    
    if (!ratingMatch) {
      // Try finding just a number followed by /5
      ratingMatch = ratingSection.match(/(\d+)\/5/i);
    }
    
    if (!ratingMatch) {
      // Try finding a number after "rating" in any form
      ratingMatch = ratingSection.match(/rating.*?(\d+)/i);
    }
    
    return ratingMatch ? parseInt(ratingMatch[1], 10) : 0;
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
    ratingValue: number;
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
      fullContent: getFullFactCheck(content)
    };
  }