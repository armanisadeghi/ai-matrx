import { NextRequest, NextResponse } from 'next/server';
import { getAppData } from '@/utils/server/appDataCache';

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const params = await context.params;
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing ID parameter' },
        { status: 400 }
      );
    }
    
    console.log('API route fetching app with ID:', id);
    
    // Use the cached app data utility
    const data = await getAppData(null, id);

    if (!data) {
      return NextResponse.json(
        { error: "App not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
} 