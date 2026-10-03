/**
 * Canvas types whose finished card already prints the payload's own title in
 * its header (TimelineBlock, ResearchBlock, ResourceCollectionBlock,
 * TroubleshootingBlock, cookingRecipeDisplay, MultipleChoiceQuiz,
 * ComparisonTableBlock, DecisionTreeBlock, InteractiveDiagramBlock,
 * ProgressTrackerBlock, MathProblemBlock). `ArtifactBlock` drops its own
 * title label for these so the title shows once.
 */
const OWN_TITLE_TYPES: ReadonlySet<string> = new Set([
  "timeline",
  "research",
  "resources",
  "troubleshooting",
  "recipe",
  "quiz",
  "comparison",
  "decision-tree",
  "diagram",
  "progress",
  "math_problem",
]);

/**
 * True when the label above the card would repeat the card's own header: the
 * type prints its payload title and that title is the label's text.
 */
export function artifactTitleRepeatsCard(
  canvasType: string,
  artifactTitle: string,
  payloadTitle: unknown,
): boolean {
  if (!OWN_TITLE_TYPES.has(canvasType)) return false;
  if (typeof payloadTitle !== "string") return false;
  return payloadTitle.trim().toLowerCase() === artifactTitle.trim().toLowerCase();
}
