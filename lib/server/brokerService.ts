// lib/server/brokerService.ts
import { BrokerIdentifier } from '../redux/brokerSlice/types';
import { brokerCache } from './brokerCache';
import { cookies } from 'next/headers';

export async function getServerBroker(idArgs: BrokerIdentifier, providedSessionId?: string) {
  if (providedSessionId) {
    return await brokerCache.getValue(idArgs, providedSessionId);
  }
  
  const cookiesObj = await cookies();
  const sessionId = cookiesObj.get('session-id')?.value;
  return await brokerCache.getValue(idArgs, sessionId);
}

export async function getServerBrokers(identifiers: BrokerIdentifier[]) {
  const cookiesObj = await cookies();
  const sessionId = cookiesObj.get('session-id')?.value;
  const values: Record<string, unknown> = {};
  
  await Promise.all(
    identifiers.map(async (idArgs) => {
      const key = JSON.stringify(idArgs);
      values[key] = await brokerCache.getValue(idArgs, sessionId);
    })
  );
  
  return values;
}