// app/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { brokerCache } from '@/lib/server/brokerCache';
import { getUser } from '@/utils/supabase/auth';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get auth token from broker cache
  const authToken = await brokerCache.getValue(
    { source: 'api', mappedItemId: 'auth_token' },
    user.id
  );

  if (!authToken) {
    return NextResponse.json({ error: 'No auth token' }, { status: 401 });
  }

  // Use the broker value to make API call
  const response = await fetch('https://external-api.com/data', {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });

  const data = await response.json();
  return NextResponse.json(data);
}