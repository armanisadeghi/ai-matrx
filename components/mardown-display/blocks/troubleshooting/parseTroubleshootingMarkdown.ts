import type {
  TroubleshootingGuide,
  TroubleshootingIssue as TroubleshootingIssueKind,
  TroubleshootingSolution as TroubleshootingSolutionKind,
  TroubleshootingStep as TroubleshootingStepKind,
} from "@/features/content-ir/kinds/generated/kinds.generated";

/**
 * THE SHAPES COME FROM THE REGISTRY. The parser adds `id` (a render key) and
 * narrows the registry's free-text `difficulty`/`priority`/`severity` to the
 * vocabularies this renderer actually draws — a narrowing, never a re-declaration.
 */
export type TroubleshootingStep = Omit<
  TroubleshootingStepKind,
  "__kind" | "links" | "difficulty"
> & {
  id: string;
  links?: { title: string; url: string }[];
  difficulty?: "easy" | "medium" | "hard";
};

export type TroubleshootingSolution = Omit<
  TroubleshootingSolutionKind,
  "__kind" | "steps" | "priority"
> & {
  id: string;
  steps: TroubleshootingStep[];
  priority?: "low" | "medium" | "high";
};

export type TroubleshootingIssue = Omit<
  TroubleshootingIssueKind,
  "__kind" | "solutions" | "severity"
> & {
  id: string;
  solutions: TroubleshootingSolution[];
  severity?: "low" | "medium" | "high" | "critical";
};

export type TroubleshootingData = Omit<
  TroubleshootingGuide,
  "__kind" | "issues"
> & { issues: TroubleshootingIssue[] };

/**
 * Parses markdown content into structured troubleshooting data
 * 
 * Expected format:
 * ### Title
 * Description (optional)
 * 
 * **Symptom:** Description of the problem
 * 
 * **Possible Causes:**
 * 1. First cause
 * 2. Second cause
 * 
 * **Solutions:**
 * 1. **Solution Title**: Description
 *    - Step 1 description
 *      ```
 *      command here
 *      ```
 *    - Step 2 description [link](url)
 * 
 * **Related Issues:**
 * - Issue 1
 * - Issue 2
 */
export function parseTroubleshootingMarkdown(content: string): TroubleshootingData {
  const lines = content.split('\n').filter(line => line.trim());
  
  let title = 'Troubleshooting Guide';
  let description: string | undefined;
  const issues: TroubleshootingIssue[] = [];
  let currentIssue: TroubleshootingIssue | null = null;
  let currentSection: 'causes' | 'solutions' | 'related' | null = null;
  let currentSolution: TroubleshootingSolution | null = null;
  let currentStep: TroubleshootingStep | null = null;
  let issueIdCounter = 1;
  let solutionIdCounter = 1;
  let stepIdCounter = 1;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;

    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block - add to current step if exists
        if (currentStep && codeBlockContent.length > 0) {
          if (!currentStep.commands) currentStep.commands = [];
          currentStep.commands.push(codeBlockContent.join('\n'));
        }
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Parse main title (### Title)
    if (line.startsWith('### ')) {
      title = line.replace('### ', '').trim();
      continue;
    }

    // Parse description (first non-heading line after title)
    if (!description && !line.startsWith('**') && !line.startsWith('- ') && !line.startsWith('#') && !currentIssue) {
      description = line;
      continue;
    }

    // Parse symptom (**Symptom:** Description)
    if (line.startsWith('**Symptom:**')) {
      // Save previous issue if exists
      if (currentIssue) {
        if (currentSolution && currentStep) {
          currentSolution.steps.push(currentStep);
          currentStep = null;
        }
        if (currentSolution) {
          currentIssue.solutions.push(currentSolution);
          currentSolution = null;
        }
        issues.push(currentIssue);
      }

      const symptom = line.replace('**Symptom:**', '').trim();
      currentIssue = {
        id: `issue-${issueIdCounter++}`,
        symptom: symptom || 'Unknown Issue',
        causes: [],
        solutions: []
      };
      currentSection = null;
      continue;
    }

    // Parse possible causes section
    if (line.startsWith('**Possible Causes:**')) {
      currentSection = 'causes';
      continue;
    }

    // Parse solutions section
    if (line.startsWith('**Solutions:**')) {
      currentSection = 'solutions';
      continue;
    }

    // Parse related issues section
    if (line.startsWith('**Related Issues:**')) {
      currentSection = 'related';
      continue;
    }

    // Parse content based on current section
    if (currentIssue) {
      if (currentSection === 'causes') {
        // Parse causes (numbered or bulleted list)
        const causeMatch = line.match(/^(?:\d+\.\s*|-\s*)(.+)$/);
        if (causeMatch) {
          currentIssue.causes.push(causeMatch[1].trim());
        }
      } else if (currentSection === 'solutions') {
        // Parse solutions
        const solutionMatch = line.match(/^(\d+)\.\s*\*\*([^*]+)\*\*:?\s*(.*)$/);
        if (solutionMatch) {
          // Save previous solution if exists
          if (currentSolution && currentStep) {
            currentSolution.steps.push(currentStep);
            currentStep = null;
          }
          if (currentSolution) {
            currentIssue.solutions.push(currentSolution);
          }

          currentSolution = {
            id: `solution-${solutionIdCounter++}`,
            title: solutionMatch[2].trim(),
            description: solutionMatch[3].trim() || undefined,
            steps: []
          };
        } else {
          // Parse solution steps
          const stepMatch = line.match(/^(?:\s*-\s*)(.+)$/);
          if (stepMatch && currentSolution) {
            // Save previous step if exists
            if (currentStep) {
              currentSolution.steps.push(currentStep);
            }

            const stepText = stepMatch[1].trim();
            const step = parseStepText(stepText, `step-${stepIdCounter++}`);
            currentStep = step;
          } else if (currentStep && line.startsWith('  ')) {
            // Additional step content (indented)
            const additionalContent = line.trim();
            if (additionalContent) {
              currentStep.description += ' ' + additionalContent;
            }
          }
        }
      } else if (currentSection === 'related') {
        // Parse related issues
        const relatedMatch = line.match(/^(?:-\s*)(.+)$/);
        if (relatedMatch) {
          if (!currentIssue.relatedIssues) currentIssue.relatedIssues = [];
          currentIssue.relatedIssues.push(relatedMatch[1].trim());
        }
      }
    }
  }

  // Save the last issue
  if (currentIssue) {
    if (currentSolution && currentStep) {
      currentSolution.steps.push(currentStep);
    }
    if (currentSolution) {
      currentIssue.solutions.push(currentSolution);
    }
    issues.push(currentIssue);
  }

  // If no issues were parsed, create a default structure
  if (issues.length === 0) {
    issues.push({
      id: 'issue-1',
      symptom: 'General Issue',
      description: 'No specific symptoms identified',
      causes: ['Unknown cause'],
      solutions: [{
        id: 'solution-1',
        title: 'General Solution',
        description: 'Review the content for troubleshooting steps',
        steps: [{
          id: 'step-1',
          title: 'Review Documentation',
          description: 'Check the relevant documentation for guidance'
        }]
      }]
    });
  }

  return {
    title,
    description,
    issues
  };
}

/**
 * Parses step text to extract title, description, links, and metadata
 */
function parseStepText(text: string, id: string): TroubleshootingStep {
  let title = '';
  let description = text;
  const links: { title: string; url: string }[] = [];
  let difficulty: TroubleshootingStep['difficulty'] | undefined;
  let estimatedTime: string | undefined;

  // Extract title if text starts with bold formatting
  const titleMatch = text.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
  if (titleMatch) {
    title = titleMatch[1].trim();
    description = titleMatch[2].trim();
  } else {
    // Use first few words as title if no explicit title
    const words = text.split(' ');
    title = words.slice(0, 4).join(' ');
    if (title.length < text.length) {
      title += '...';
    }
  }

  // Extract links [title](url)
  const linkMatches = description.match(/\[([^\]]+)\]\(([^)]+)\)/g);
  if (linkMatches) {
    linkMatches.forEach(linkMatch => {
      const linkParts = linkMatch.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkParts) {
        links.push({
          title: linkParts[1],
          url: linkParts[2]
        });
        // Remove link from description
        description = description.replace(linkMatch, linkParts[1]);
      }
    });
  }

  // Extract difficulty from parentheses (easy), (medium), (hard)
  const difficultyMatch = description.match(/\((easy|medium|hard)\)/i);
  if (difficultyMatch) {
    difficulty = difficultyMatch[1].toLowerCase() as TroubleshootingStep['difficulty'];
    description = description.replace(/\((easy|medium|hard)\)/i, '').trim();
  }

  // Extract time estimates (5 min), (1 hour), etc.
  const timeMatch = description.match(/\((\d+(?:\.\d+)?\s*(?:min|minute|hour|hr)s?)\)/i);
  if (timeMatch) {
    estimatedTime = timeMatch[1];
    description = description.replace(/\((\d+(?:\.\d+)?\s*(?:min|minute|hour|hr)s?)\)/i, '').trim();
  }

  return {
    id,
    title: title || 'Step',
    description: description || 'No description provided',
    links: links.length > 0 ? links : undefined,
    difficulty,
    estimatedTime
  };
}

/**
 * Infers severity from symptom and description text
 */
function inferSeverity(symptom: string, description?: string): TroubleshootingIssue['severity'] {
  const text = `${symptom} ${description || ''}`.toLowerCase();
  
  if (text.includes('critical') || text.includes('crash') || text.includes('fatal') || text.includes('data loss')) {
    return 'critical';
  } else if (text.includes('error') || text.includes('fail') || text.includes('broken') || text.includes('urgent')) {
    return 'high';
  } else if (text.includes('warning') || text.includes('slow') || text.includes('issue') || text.includes('problem')) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Validates that the parsed troubleshooting guide has the minimum required structure
 */
export function validateTroubleshootingGuide(guide: TroubleshootingData): boolean {
  if (!guide.title || guide.issues.length === 0) {
    return false;
  }

  for (const issue of guide.issues) {
    if (!issue.symptom || issue.solutions.length === 0) {
      return false;
    }

    for (const solution of issue.solutions) {
      if (!solution.title || solution.steps.length === 0) {
        return false;
      }

      for (const step of solution.steps) {
        if (!step.title || !step.description) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Creates a sample troubleshooting guide for testing/demo purposes
 */
export function createSampleTroubleshootingGuide(): TroubleshootingData {
  return {
    title: 'API Connection Issues',
    description: 'Common problems and solutions for API connectivity',
    issues: [
      {
        id: 'issue-1',
        symptom: 'Timeout errors when calling API',
        description: 'Requests to the API are timing out after 30 seconds',
        severity: 'high',
        causes: [
          'Network connectivity issues',
          'Server overload',
          'Authentication problems',
          'Rate limiting'
        ],
        solutions: [
          {
            id: 'solution-1',
            title: 'Check Network Connection',
            description: 'Verify that your network connection is working properly',
            priority: 'high',
            successRate: 85,
            steps: [
              {
                id: 'step-1',
                title: 'Test with curl',
                description: 'Use curl to test the API endpoint directly',
                commands: ['curl -X GET https://api.example.com/health'],
                difficulty: 'easy',
                estimatedTime: '2 min'
              },
              {
                id: 'step-2',
                title: 'Check DNS Resolution',
                description: 'Verify that the API domain resolves correctly',
                commands: ['nslookup api.example.com', 'dig api.example.com'],
                difficulty: 'easy',
                estimatedTime: '1 min'
              }
            ]
          },
          {
            id: 'solution-2',
            title: 'Verify API Credentials',
            description: 'Ensure your API key and credentials are valid',
            priority: 'medium',
            successRate: 90,
            steps: [
              {
                id: 'step-3',
                title: 'Check API Key',
                description: 'Verify that your API key is valid and not expired',
                difficulty: 'easy',
                estimatedTime: '3 min',
                links: [
                  {
                    title: 'API Key Management',
                    url: 'https://example.com/api-keys'
                  }
                ]
              }
            ]
          }
        ],
        relatedIssues: [
          'Slow response times',
          'Authentication failures'
        ]
      }
    ]
  };
}
