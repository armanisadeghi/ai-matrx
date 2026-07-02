import { NextRequest, NextResponse } from 'next/server';
import { getAppData } from '@/utils/server/appDataCache';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  try {
    const resolvedParams = await params;
    const { slug } = resolvedParams;
    
    
    if (!slug) {
      console.error(`[API-DEBUG ${requestId}] Missing slug parameter`);
      return NextResponse.json(
        { error: 'Missing slug parameter', requestId },
        { status: 400 }
      );
    }
    
    
    try {
      // Use the cached app data utility
      const data = await getAppData(slug);
      const endTime = Date.now();
      
      if (!data) {
        console.error(`[API-DEBUG ${requestId}] App not found with slug: ${slug}`);
        return NextResponse.json(
          { error: "App not found", slug, requestId },
          { status: 404 }
        );
      }

      const responseData = {
        app_config: data.app_config,
        applets: data.applets,
      };


      return NextResponse.json(responseData, {
        headers: {
          'x-request-id': requestId,
          'x-processing-time': `${endTime - startTime}ms`
        }
      });
    } catch (fetchError: unknown) {
      console.error(`[API-DEBUG ${requestId}] Error fetching app data:`, fetchError);

      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      return NextResponse.json(
        {
          error: `Error fetching app data: ${message}`,
          details: String(fetchError),
          requestId
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const endTime = Date.now();
    console.error(`[API-DEBUG ${requestId}] Unhandled error in API route (${endTime - startTime}ms):`, error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An unhandled error occurred',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
        requestId
      },
      {
        status: 500,
        headers: {
          'x-request-id': requestId,
          'x-processing-time': `${endTime - startTime}ms`
        }
      }
    );
  }
} 