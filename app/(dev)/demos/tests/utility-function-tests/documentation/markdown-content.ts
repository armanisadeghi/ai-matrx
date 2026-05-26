// Simple markdown content loader for documentation viewer
// Fetches markdown files from Supabase Storage

// Base URL for documentation files in Supabase Storage
const DOCS_BASE_URL = 'https://db.matrxserver.com/storage/v1/object/public/app-assets/documentation';

// Cache the content to avoid re-fetching on every request
let markdownCache: {
  readme: string;
  systemAnalysis: string;
  quickStart: string;
  roadmap: string;
} | null = null;

async function fetchMarkdownFile(filename: string): Promise<string> {
  const url = `${DOCS_BASE_URL}/${filename}`;

  try {
    const response = await fetch(url, {
      // Cache for 5 minutes in production, no cache in development
      next: { revalidate: process.env.NODE_ENV === 'production' ? 300 : 0 }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${filename}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${filename}:`, error);
    throw error;
  }
}

export async function getMarkdownContent() {
  // Return cached content if available
  if (markdownCache) {
    return markdownCache;
  }

  try {
    const [readme, systemAnalysis, quickStart, roadmap] = await Promise.all([
      fetchMarkdownFile('README.md'),
      fetchMarkdownFile('SYSTEM_ANALYSIS.md'),
      fetchMarkdownFile('QUICK_START_GUIDE.md'),
      fetchMarkdownFile('DEVELOPMENT_ROADMAP.md'),
    ]);

    markdownCache = {
      readme,
      systemAnalysis,
      quickStart,
      roadmap,
    };

    return markdownCache;
  } catch (error) {
    console.error('Error loading markdown files from Supabase Storage:', error);

    // Return placeholder content if files can't be fetched
    return {
      readme: '# Documentation\n\nDocumentation files could not be loaded. Please check the console for errors.',
      systemAnalysis: '# System Analysis\n\nSystem analysis could not be loaded. Please check the console for errors.',
      quickStart: '# Quick Start\n\nQuick start guide could not be loaded. Please check the console for errors.',
      roadmap: '# Development Roadmap\n\nRoadmap could not be loaded. Please check the console for errors.',
    };
  }
}

