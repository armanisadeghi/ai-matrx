import { createClient } from '@/utils/supabase/server';
import { resolveAccess } from '@/utils/permissions/requireAccess';
import { getTopicServer } from './server';
import type { Database } from '@/types/database.types';

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/utils/permissions/requireAccess', () => ({
  resolveAccess: jest.fn(),
}));

const TOPIC_ID = '0d59c395-8c19-43df-90df-8ca384f3edc3';
const TOPIC_ROW: Database['research']['Tables']['rs_topic']['Row'] = {
  agent_config: {},
  analyses_per_keyword: 3,
  autonomy_level: 'semi',
  consecutive_refresh_failures: 0,
  created_at: '2026-09-22T00:00:00Z',
  created_by: '11111111-1111-1111-1111-111111111111',
  custom_fields: {},
  default_search_params: {},
  default_search_provider: 'google',
  deleted_at: null,
  description: 'A research topic',
  good_scrape_threshold: 1,
  id: TOPIC_ID,
  intent_brief: null,
  intent_key: null,
  last_refresh_at: null,
  last_refresh_error: null,
  last_refresh_outcome: null,
  last_refresh_trigger: null,
  max_auto_tag_calls: 0,
  max_documents: 1,
  max_keyword_syntheses: 3,
  max_keywords: 3,
  max_tag_consolidations: 0,
  max_topic_syntheses: 1,
  metadata: {},
  name: 'Allowed research topic',
  next_refresh_at: null,
  organization_id: '22222222-2222-2222-2222-222222222222',
  outputs: {},
  refresh_claim_expires_at: null,
  refresh_claim_token: null,
  refresh_interval_hours: null,
  scrapes_per_keyword: 5,
  status: 'draft',
  tag_suggestions: null,
  template_id: null,
  tone_profile: null,
  updated_at: null,
  updated_by: null,
  version: 1,
  videos_per_keyword: 0,
  visibility: 'personal',
};

const mockResolveAccess = jest.mocked(resolveAccess);
const mockCreateClient = jest.mocked(createClient);

function readableTopicClient() {
  const single = jest.fn().mockResolvedValue({ data: TOPIC_ROW, error: null });
  const eq = jest.fn(() => ({ single }));
  const is = jest.fn(() => ({ eq }));
  const select = jest.fn(() => ({ is }));
  const from = jest.fn(() => ({ select }));
  const schema = jest.fn(() => ({ from }));
  return { client: { schema }, schema, from, select, is, eq, single };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTopicServer product access gate', () => {
  it('loads a topic only after ordinary product view access is confirmed', async () => {
    mockResolveAccess.mockResolvedValue({
      level: 'view',
      isOwner: false,
      exists: true,
    });
    const { client, schema, from, select, is, eq } = readableTopicClient();
    mockCreateClient.mockResolvedValue(client as never);

    await expect(getTopicServer(TOPIC_ID)).resolves.toMatchObject({
      id: TOPIC_ID,
      name: 'Allowed research topic',
    });

    expect(mockResolveAccess).toHaveBeenCalledWith('research_topic', TOPIC_ID);
    expect(schema).toHaveBeenCalledWith('research');
    expect(from).toHaveBeenCalledWith('rs_topic');
    expect(select).toHaveBeenCalledWith('*');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
    expect(eq).toHaveBeenCalledWith('id', TOPIC_ID);
  });

  it('returns null without reading when product access is denied', async () => {
    mockResolveAccess.mockResolvedValue({
      level: 'none',
      isOwner: false,
      exists: true,
    });

    await expect(getTopicServer(TOPIC_ID)).resolves.toBeNull();

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('treats an access-resolution failure as no access so AccessGate can remediate it', async () => {
    // resolveResourceAccess deliberately converts RPC/transport failures to
    // NO_ACCESS. The layout receives null and asks AccessGate for the real
    // state; this server reader must never fall through to private content.
    mockResolveAccess.mockResolvedValue({
      level: 'none',
      isOwner: false,
      exists: false,
    });

    await expect(getTopicServer(TOPIC_ID)).resolves.toBeNull();

    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
