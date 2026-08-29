// app/api/tools/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { serverToolsService } from '@/utils/supabase/server-tools-service';
import { filterAndSortBySearch } from '@ai-matrx/kit/search-scoring';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const ids = searchParams.get('ids');

    // If specific tool identifiers are requested
    if (ids) {
      const toolIdentifiers = ids.split(',').filter(id => id.trim());
      const filteredTools = await serverToolsService.fetchToolsByIds(toolIdentifiers);
      
      return NextResponse.json({
        tools: filteredTools,
        count: filteredTools.length
      });
    }

    // For now, just fetch all tools since we don't have server-side search/filter methods
    const tools = await serverToolsService.fetchTools();
    
    // Apply client-side filtering if needed
    let filteredTools = tools;
    
    if (category) {
      filteredTools = filteredTools.filter(tool => 
        tool.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (search) {
      filteredTools = filterAndSortBySearch(filteredTools, search, [
        { get: (t) => t.name, weight: 'title' },
        { get: (t) => t.description, weight: 'body' },
      ]);
    }

    return NextResponse.json({
      tools: filteredTools,
      count: filteredTools.length,
      totalCount: tools.length
    });

  } catch (error) {
    console.error('Error fetching tools:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch tools', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
