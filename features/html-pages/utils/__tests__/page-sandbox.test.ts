import { pageSandbox } from '../page-sandbox';
const base = 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-modals allow-downloads';
const opaque = 'allow-scripts allow-popups allow-forms allow-presentation allow-modals allow-downloads';
it.each([null, '', '/p/1', '//mymatrx.com/p/1', 'bad url', 'blob:https://app.example/id', 'data:text/html,hi', 'javascript:alert(1)', 'ftp://files.example/x', 'https://app.example/p/1'])('isolates draft or unsafe URL %s without dropping rendering capabilities', url => {
  expect(pageSandbox(url, base, 'https://app.example')).toBe(opaque);
});
it.each([null, '', 'bad origin', 'file:///app'])('isolates unknown application origin %s', origin => {
  expect(pageSandbox('https://mymatrx.com/p/1', base, origin)).toBe(opaque);
});
it('preserves the separate published page origin and every existing flag', () => {
  expect(pageSandbox('https://mymatrx.com/p/1', base, 'https://app.example')).toBe(base);
});
it('compares parsed origins, including default ports', () => {
  expect(pageSandbox('https://APP.example:443/p/1', base, 'https://app.example')).toBe(opaque);
});
