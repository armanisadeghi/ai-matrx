// Utility function to format diagram type names nicely
export const formatDiagramType = (type: string): string => {
  const typeMap: Record<string, string> = {
    flowchart: "Flow Chart",
    mindmap: "Mind Map",
    orgchart: "Organizational Chart",
    network: "Network Diagram",
    system: "System Architecture",
    process: "Process Flow",
    pedigree: "Family Pedigree",
    timeline: "Timeline",
    erd: "Entity Relationship Diagram",
    sequence: "Sequence Diagram",
  };

  return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
};
