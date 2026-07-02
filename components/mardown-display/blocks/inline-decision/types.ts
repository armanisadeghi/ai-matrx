export interface InlineDecisionOption {
    id: string;
    label: string;
    text: string;
  }

  export interface InlineDecision {
    id: string;
    prompt: string;
    options: InlineDecisionOption[];
  }

  /** Runtime guard: proves an unknown value (serverData / metadata field) is a real InlineDecision before rendering. */
  export function isInlineDecision(value: unknown): value is InlineDecision {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.id === "string" &&
      typeof v.prompt === "string" &&
      Array.isArray(v.options) &&
      v.options.every(
        (opt) =>
          opt &&
          typeof opt === "object" &&
          typeof (opt as Record<string, unknown>).id === "string" &&
          typeof (opt as Record<string, unknown>).label === "string" &&
          typeof (opt as Record<string, unknown>).text === "string",
      )
    );
  }