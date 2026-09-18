/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { useScopeTypeTables } from './useScopeTypeTables';
import { scopesService } from '@/features/scopes/service/scopesService';
jest.mock('@/features/scopes/service/scopesService', () => ({ scopesService: {
  listContextItemsForTypes: jest.fn(), listContextValuesForScopes: jest.fn(),
} }));
jest.mock('@/features/scopes/types', () => ({ isScopesRpcErr: (r: { error?: unknown }) => Boolean(r.error) }));

it('does not restart or cancel an in-flight fetch when equal ID sets get new array identities', async () => {
  let resolveItems!: (value: Awaited<ReturnType<typeof scopesService.listContextItemsForTypes>>) => void;
  const items = jest.mocked(scopesService.listContextItemsForTypes);
  const values = jest.mocked(scopesService.listContextValuesForScopes);
  items.mockImplementation(() => new Promise(resolve => { resolveItems = resolve; }));
  values.mockResolvedValue({ ok: true, data: { values: [] } });
  const host = document.createElement('div'); const root = createRoot(host);
  let current!: ReturnType<typeof useScopeTypeTables>;
  function Harness() { current = useScopeTypeTables(['type-b', 'type-a'], ['scope-a']); return null; }
  const rerender = () => act(() => root.render(<Harness />));
  rerender();
  rerender(); rerender();
  expect(items).toHaveBeenCalledTimes(1);
  await act(async () => { resolveItems({ ok: true, data: { items: [] } }); });
  expect(current.status).toBe('ready');
  rerender();
  expect(items).toHaveBeenCalledTimes(1);
  expect(values).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});
