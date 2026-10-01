/**
 * Test double for a supabase-js RPC call as `readListRpc` uses it: awaitable, with chainable
 * `.order()` / `.range()`. It answers the whole mocked result for any page (no `count`), which
 * the reader takes as a complete single page. Paging itself is proven in
 * `lib/entity-list/__tests__/list-rpc-reads-never-truncate.test.ts`.
 */
export function asPagedRpc<T>(result: T | PromiseLike<T>): PromiseLike<T> & {
  order: () => ReturnType<typeof asPagedRpc<T>>;
  range: () => ReturnType<typeof asPagedRpc<T>>;
} {
  const settled = Promise.resolve(result);
  const builder = {
    then: settled.then.bind(settled),
    order: () => builder,
    range: () => builder,
  };
  return builder;
}
