import DocumentationViewer from './DocumentationViewer';
import { getMarkdownContent } from './markdown-content';

export default async function DocumentationPage() {
  const { readme, systemAnalysis, quickStart, roadmap } = await getMarkdownContent();

  return (
    <DocumentationViewer
      readme={readme}
      systemAnalysis={systemAnalysis}
      quickStart={quickStart}
      roadmap={roadmap}
    />
  );
}
