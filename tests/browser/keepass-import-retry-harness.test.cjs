const assert = require('node:assert/strict');
const test = require('node:test');
const { exactRetry, localOrigin, requireRuntimeConfig } = require('./keepass-import-retry-acceptance.cjs');

test('rejects remote origins and absent explicit authentication before browser launch', () => {
  assert.equal(localOrigin('http://127.0.0.1:3001'), true);
  assert.equal(localOrigin('https://www.aimatrx.com'), false);
  assert.equal(localOrigin('http://example.test:3001'), false);
  assert.throws(() => requireRuntimeConfig({ MATRX_KEEPASS_IMPORT_CANARY: 'RUN_UNDER_REVIEW', AI_ADMIN_USERNAME: 'admin@admin.com' }), /verified_admin_env_required/);
});

test('requires the replay to preserve key, immutable command bytes, and one server item id', () => {
  assert.equal(exactRetry({ key: 'key-a', bodyHash: 'body-a', id: 'item-a' }, { key: 'key-a', bodyHash: 'body-a', id: 'item-a' }), true);
  assert.equal(exactRetry({ key: 'key-a', bodyHash: 'body-a', id: 'item-a' }, { key: 'key-b', bodyHash: 'body-a', id: 'item-a' }), false);
  assert.equal(exactRetry({ key: 'key-a', bodyHash: 'body-a', id: 'item-a' }, { key: 'key-a', bodyHash: 'body-b', id: 'item-a' }), false);
  assert.equal(exactRetry({ key: 'key-a', bodyHash: 'body-a', id: 'item-a' }, { key: 'key-a', bodyHash: 'body-a', id: 'item-b' }), false);
});
