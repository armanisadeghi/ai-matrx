'use client';

import { ComponentEntry } from '../parts/component-list';
import { createTabbedDemo } from '../parts/tabbed-demo-wrapper';
import ScreenshotDemo from '../need-wrappers/screenshot-demo';
import ContextCollectorDemo from '../need-wrappers/screenshot-with-context';

// Code examples for each component
const screenshotCode = `import { useScreenshot } from '@/hooks/useScreenshot';

// Initialize the hook with options
const { captureScreen, isCapturing, error } = useScreenshot({
  excludeSelectors: ['.no-capture'] // Elements with this class won't be captured
});

// Capture the screen
const handleCapture = async () => {
  try {
    const data = await captureScreen();
    // data contains:
    // - fullSize: Full resolution image as data URL
    // - compressed: Compressed image (better for previews)
    // - thumbnail: Small thumbnail image
    // - imageDataForAPI: Data formatted for API submission
    // - metadata: Information about the capture
    console.log(data);
  } catch (err) {
    console.error('Failed to capture:', err);
  }
};`;

const contextCollectorCode = `import { useContextCollection } from '@/hooks/useContextCollection';

// Help documentation that will be included in context
const helpDocs = {
  pageHelp: "Page-level help information...",
  sectionHelp: "Section-specific help information..."
};

// Initialize the hook with help docs
const { collectContext, isCollecting, lastContext } = useContextCollection(helpDocs);

// Collect the page context including screenshot
const handleCollect = async () => {
  try {
    await collectContext();
    // lastContext contains:
    // - screenshot: The captured screenshot (same format as useScreenshot)
    // - url: Current page URL
    // - title: Page title
    // - helpDocs: The help documentation provided
    // - domStructure: Basic DOM structure for context
    console.log(lastContext);
  } catch (err) {
    console.error('Failed to collect context:', err);
  }
};`;

// Create a tabbed demo with both screenshot components
export default createTabbedDemo([
  {
    id: 'screenshot',
    label: 'Screenshot Tool',
    component: ScreenshotDemo,
    codeExample: screenshotCode,
    description: 'A versatile screenshot capture tool that creates multiple formats including full-size, compressed, and thumbnail versions. Ideal for applications that need to capture the current page state.'
  },
  {
    id: 'context-collector',
    label: 'Context Collector',
    component: ContextCollectorDemo,
    codeExample: contextCollectorCode,
    description: 'An enhanced screenshot tool that collects additional page context including DOM structure and help documentation. Perfect for AI assistance features or support tools.'
  }
]); 