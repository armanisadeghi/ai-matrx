import type {
  ResearchChallenge as ResearchChallengeKind,
  ResearchFinding as ResearchFindingKind,
  ResearchRecommendation as ResearchRecommendationKind,
  ResearchSection as ResearchSectionKind,
} from "@/features/content-ir/kinds/generated/kinds.generated";

/**
 * THE SHAPES COME FROM THE REGISTRY (`pnpm shape:types`). The markdown parser
 * adds only `id` — a render key the wire format has no reason to carry.
 * Nothing here re-declares a registry field (`check:kind-type-twins`).
 */
export type ResearchFinding = Omit<ResearchFindingKind, "__kind"> &
  Required<
    Pick<
      ResearchFindingKind,
      | "primarySource"
      | "additionalSources"
      | "urls"
      | "significance"
      | "futureImplications"
      | "confidenceLevel"
    >
  > & { id: string };

export type ResearchSection = Omit<ResearchSectionKind, "__kind" | "findings"> & {
  id: string;
  findings: ResearchFinding[];
};

export type ResearchChallenge = Omit<ResearchChallengeKind, "__kind"> &
  Required<Pick<ResearchChallengeKind, "category">> & { id: string };

export type ResearchRecommendation = Omit<ResearchRecommendationKind, "__kind"> &
  Required<Pick<ResearchRecommendationKind, "target">> & { id: string };

interface UnrecognizedSection {
  id: string;
  title: string;
  content: string;
  rawLines: string[];
}

interface ParsedSection {
  id: string;
  title: string;
  content: string;
  rawLines: string[];
  level: number;
  recognized: boolean;
}

interface ResearchData {
  title: string;
  overview: string;
  researchScope?: string;
  keyFocusAreas?: string;
  analysisPeriod?: string;
  executiveSummary?: string;
  introduction: string;
  researchQuestions: string[];
  sections: ResearchSection[];
  convergentThemes: Array<{theme: string; description: string}>;
  conflictingEvidence?: {
    disagreement: string;
    perspectives: string;
    resolution: string;
  };
  shortTermOutlook: string[];
  mediumTermOutlook: string[];
  longTermVision: string[];
  challenges: ResearchChallenge[];
  recommendations: ResearchRecommendation[];
  conclusion: string;
  keyTakeaways: string[];
  methodology?: {
    searchStrategy: string;
    selectionCriteria: string;
    analysisFramework: string;
  };
  sourceQuality?: {
    peerReviewed: number;
    industryReports: number;
    expertInterviews: number;
    governmentPubs: number;
  };
  limitations: string[];
  metadata: {
    researchDate?: string;
    lastUpdated?: string;
    confidenceRating?: string;
    biasAssessment?: string;
  };
  // Debug and raw data
  allSections: ParsedSection[];
  unrecognizedSections: UnrecognizedSection[];
  rawContent: string;
  parsingStats: {
    totalLines: number;
    processedLines: number;
    recognizedSections: number;
    unrecognizedSections: number;
  };
}

export const parseResearchMarkdown = (content: string): ResearchData | null => {
  try {
    const originalContent = content;
    const cleanContent = content
      .replace(/<research>/g, '')
      .replace(/<\/research>/g, '')
      .trim();

    const lines = cleanContent.split('\n');
    const totalLines = lines.length;

    // First pass: Parse all sections
    const allSections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;
    let currentContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          currentSection.rawLines = [...currentContent];
          allSections.push(currentSection);
        }
        
        // Start new section
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        currentSection = {
          id: `section-${allSections.length}`,
          title,
          content: '',
          rawLines: [],
          level,
          recognized: false
        };
        currentContent = [];
      } else {
        // Add content to current section
        currentContent.push(line);
      }
    }
    
    // Save last section
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      currentSection.rawLines = [...currentContent];
      allSections.push(currentSection);
    }

    // Second pass: Categorize and extract data
    let title = '';
    let overview = '';
    let researchScope = '';
    let keyFocusAreas = '';
    let analysisPeriod = '';
    let executiveSummary = '';
    let introduction = '';
    const researchQuestions: string[] = [];
    const sections: ResearchSection[] = [];
    const convergentThemes: Array<{theme: string; description: string}> = [];
    let conflictingEvidence: ResearchData['conflictingEvidence'];
    const shortTermOutlook: string[] = [];
    const mediumTermOutlook: string[] = [];
    const longTermVision: string[] = [];
    const challenges: ResearchChallenge[] = [];
    const recommendations: ResearchRecommendation[] = [];
    let conclusion = '';
    const keyTakeaways: string[] = [];
    let methodology: ResearchData['methodology'];
    let sourceQuality: ResearchData['sourceQuality'];
    const limitations: string[] = [];
    const metadata: ResearchData['metadata'] = {};
    const unrecognizedSections: UnrecognizedSection[] = [];

    let recognizedSections = 0;

    for (const section of allSections) {
      const titleLower = section.title.toLowerCase();
      
      // Extract title from first level 1 header
      if (section.level === 1 && !title) {
        title = section.title;
        section.recognized = true;
        recognizedSections++;
        continue;
      }
      
      // Categorize sections
      if (titleLower.includes('overview')) {
        overview = section.content;
        section.recognized = true;
        recognizedSections++;
        
        // Extract metadata from overview
        const scopeMatch = section.content.match(/\*\*Research Scope:\*\*\s*(.+)/);
        if (scopeMatch) researchScope = scopeMatch[1].trim();
        
        const focusMatch = section.content.match(/\*\*Key Focus Areas:\*\*\s*(.+)/);
        if (focusMatch) keyFocusAreas = focusMatch[1].trim();
        
        const periodMatch = section.content.match(/\*\*Analysis Period:\*\*\s*(.+)/);
        if (periodMatch) analysisPeriod = periodMatch[1].trim();
      }
      
      else if (titleLower.includes('executive summary')) {
        executiveSummary = section.content;
        section.recognized = true;
        recognizedSections++;
      }
      
      else if (titleLower.includes('introduction')) {
        introduction = section.content;
        section.recognized = true;
        recognizedSections++;
        
        // Extract research questions
        const questionMatches = section.content.match(/^\d+\.\s+(.+)$/gm);
        if (questionMatches) {
          researchQuestions.push(...questionMatches.map(q => q.replace(/^\d+\.\s+/, '')));
        }
      }
      
      else if (titleLower.includes('key research') || titleLower.includes('research and discoveries')) {
        section.recognized = true;
        recognizedSections++;
        
        // Parse research findings - this is where most content should be
        const researchSection: ResearchSection = {
          id: section.id,
          title: section.title,
          findings: []
        };
        
        // Look for subsections within this section
        const findingMatches = section.content.match(/####\s+Research Finding \d+:\s*\*\*(.+?)\*\*/g);
        if (findingMatches) {
          findingMatches.forEach((match, index) => {
            const titleMatch = match.match(/\*\*(.+?)\*\*/);
            if (titleMatch) {
              // This is a simplified finding - in reality we'd parse all the details
              const finding: ResearchFinding = {
                id: `finding-${index}`,
                title: titleMatch[1],
                primarySource: '',
                additionalSources: [],
                urls: [],
                keyDetails: '',
                significance: '',
                futureImplications: '',
                confidenceLevel: 'MEDIUM'
              };
              researchSection.findings.push(finding);
            }
          });
        } else {
          // If no structured findings found, create a general finding with the content
          const finding: ResearchFinding = {
            id: `finding-general`,
            title: 'General Research Content',
            primarySource: 'Multiple Sources',
            additionalSources: [],
            urls: [],
            keyDetails: section.content,
            significance: 'Contains research findings and discoveries',
            futureImplications: 'See detailed content',
            confidenceLevel: 'MEDIUM'
          };
          researchSection.findings.push(finding);
        }
        
        sections.push(researchSection);
      }
      
      else if (titleLower.includes('conclusion')) {
        conclusion = section.content;
        section.recognized = true;
        recognizedSections++;
        
        // Extract key takeaways
        const takeawayMatches = section.content.match(/^\d+\.\s+(.+)$/gm);
        if (takeawayMatches) {
          keyTakeaways.push(...takeawayMatches.map(t => t.replace(/^\d+\.\s+/, '')));
        }
      }
      
      else if (titleLower.includes('methodology')) {
        section.recognized = true;
        recognizedSections++;
        
        // Parse methodology
        const strategyMatch = section.content.match(/\*\*Search Strategy:\*\*\s*(.+)/);
        const criteriaMatch = section.content.match(/\*\*Source Selection Criteria:\*\*\s*(.+)/);
        const frameworkMatch = section.content.match(/\*\*Analysis Framework:\*\*\s*(.+)/);
        
        methodology = {
          searchStrategy: strategyMatch ? strategyMatch[1].trim() : '',
          selectionCriteria: criteriaMatch ? criteriaMatch[1].trim() : '',
          analysisFramework: frameworkMatch ? frameworkMatch[1].trim() : ''
        };
      }
      
      else {
        // Unrecognized section
        unrecognizedSections.push({
          id: section.id,
          title: section.title,
          content: section.content,
          rawLines: section.rawLines
        });
      }
    }

    return {
      title: title || 'Research Analysis',
      overview: overview || 'No overview found',
      researchScope,
      keyFocusAreas,
      analysisPeriod,
      executiveSummary,
      introduction: introduction || 'No introduction found',
      researchQuestions,
      sections,
      convergentThemes,
      conflictingEvidence,
      shortTermOutlook,
      mediumTermOutlook,
      longTermVision,
      challenges,
      recommendations,
      conclusion: conclusion || 'No conclusion found',
      keyTakeaways,
      methodology,
      sourceQuality,
      limitations,
      metadata,
      // Debug data
      allSections,
      unrecognizedSections,
      rawContent: originalContent,
      parsingStats: {
        totalLines,
        processedLines: allSections.length,
        recognizedSections,
        unrecognizedSections: unrecognizedSections.length
      }
    };

  } catch (error) {
    console.error('Error parsing research markdown:', error);
    return null;
  }
};
