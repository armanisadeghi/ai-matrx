import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function mount() { await act(async () => { root.render(<HtmlPageRenderPreview {...props} />); }); }

let mockDirty = true;
let mockUrl = 'https://mymatrx.com/p/1';
jest.mock('@/lib/redux/hooks', () => ({ useAppSelector: () => ({ dirty: mockDirty, name: 'Test page' }) }));
jest.mock('@/features/code/redux/tabsSlice', () => ({ selectTabById: () => () => null }));
jest.mock('@/features/html-pages/services/htmlPageService', () => ({ HTMLPageService: { getPage: async () => ({ id: 'p1', url: mockUrl, updated_at: 'now' }) } }));
jest.mock('@/components/errors/ErrorAlchemyMenu', () => ({ ErrorAlchemyMenu: () => null }));
import { HtmlPageRenderPreview } from './HtmlPageRenderPreview';
const code = '<button onclick="this.textContent=\'Working\'">Run</button>';
const props = { rowId: 'p1', sourceTabId: 'html-page:p1', language: 'html', code };
it('renders the real dirty consumer with executable opaque srcDoc', async () => {
 mockDirty = true;
 await mount();
 const frame = container.querySelector('iframe')!;
 expect(frame.getAttribute('srcdoc')).toBe(code);
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-forms');
 expect(frame.getAttribute('src')).toBeNull();
});
it('renders the real clean consumer with the separate published origin', async () => {
 mockDirty = false; mockUrl = 'https://mymatrx.com/p/1';
 await mount();
 expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://mymatrx.com/p/1?preview=1');
 expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups allow-forms');
});
it('isolates a clean URL that resolves to the application origin', async () => {
 mockDirty = false; mockUrl = window.location.origin + '/p/1';
 await mount();
 expect(container.querySelector('iframe')?.getAttribute('src')).toContain('/p/1?preview=1');
 expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-forms');
});
