import React, { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server.node';
import { usePageSandbox } from '../use-page-sandbox';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const base = 'allow-scripts allow-same-origin allow-forms';
function Preview({ url }: { url: string | null }) {
 return <iframe title="hydration test" src={url ?? undefined} sandbox={usePageSandbox(url, base)} />;
}
it.each([null, window.location.origin + '/p/1', 'https://mymatrx.com/p/1'])('hydrates %s without an attribute mismatch and then preserves the correct capabilities', async url => {
 const host = document.createElement('div');
 host.innerHTML = renderToString(<Preview url={url} />);
 expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
 document.body.appendChild(host);
 const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
 let root: Root | undefined;
 try {
  await act(async () => { root = hydrateRoot(host, <Preview url={url} />); });
  expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe(url === 'https://mymatrx.com/p/1' ? base : 'allow-scripts allow-forms');
  expect(errors).not.toHaveBeenCalled();
 } finally { if (root) act(() => root!.unmount()); errors.mockRestore(); host.remove(); }
});
