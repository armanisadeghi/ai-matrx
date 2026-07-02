import { NextRequest, NextResponse } from 'next/server';
import { WebClient, type WebAPIPlatformError } from '@slack/web-api';

function isWebAPIPlatformError(error: unknown): error is WebAPIPlatformError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'slack_webapi_platform_error'
  );
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { endpoint, method, token, body } = await request.json();

    if (!endpoint || !method || !token) {
      return NextResponse.json(
          { ok: false, error: 'Missing required parameters' },
          { status: 400 }
      );
    }

    // Initialize the Slack Web Client with the provided token
    const client = new WebClient(token);

    // Call the appropriate Slack API method
    // We're using a dynamic approach to call methods like client.conversations.list, client.chat.postMessage, etc.
    // Dynamic string-path dispatch has no static type to walk — `unknown` is
    // narrowed by the `typeof apiMethod !== 'function'` runtime guard below,
    // which is the real safety net (not the type annotation).
    const parts: string[] = endpoint.split('.');

    let cursor: unknown = client;
    for (const part of parts) {
      if (typeof cursor !== 'object' || cursor === null) {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    if (typeof cursor !== 'function') {
      return NextResponse.json(
          { ok: false, error: `Invalid Slack API endpoint: ${endpoint}` },
          { status: 400 }
      );
    }
    const apiMethod = cursor as (args: Record<string, unknown>) => Promise<unknown>;

    // Call the API method with the provided body
    const result = await apiMethod(body || {});

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error calling Slack API:', error);
    return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: isWebAPIPlatformError(error) ? error.data : undefined,
        },
        { status: 500 }
    );
  }
}