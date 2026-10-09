import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdmin, requireAdmin } from '../tgcloud/lib/admin.js';
import { ADMIN_IDS } from '../tgcloud/lib/config.js';

test('Admin authorization tests', async (t) => {
  await t.test('isAdmin returns false for random user IDs', () => {
    assert.equal(isAdmin(999999999), false);
    assert.equal(isAdmin(null), false);
    assert.equal(isAdmin(undefined), false);
    assert.equal(isAdmin(''), false);
  });

  await t.test('isAdmin returns true when ID is in ADMIN_IDS', () => {
    ADMIN_IDS.add(123456789);
    assert.equal(isAdmin(123456789), true);
    assert.equal(isAdmin('123456789'), true);
  });

  await t.test('requireAdmin throws for unauthorized user', () => {
    assert.throws(
      () => requireAdmin(55555),
      (err) => err.status === 403
    );
  });

  await t.test('requireAdmin does not throw for authorized user', () => {
    ADMIN_IDS.add(123456789);
    assert.doesNotThrow(() => requireAdmin(123456789));
  });
});
