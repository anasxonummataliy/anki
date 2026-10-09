import test from 'node:test';
import assert from 'node:assert/strict';
import { db, apiCalls, _resetApi } from 'sdk';
import messageHandler from '../tgcloud/handlers/message.js';
import callbackQueryHandler from '../tgcloud/handlers/callback_query.js';
import { ADMIN_IDS } from '../tgcloud/lib/config.js';
import { createBasket } from '../tgcloud/lib/baskets.js';

test('Telegram Handlers & Callback Query edge cases tests', async (t) => {
  const adminId = 99991;
  const regularUserId = 88881;
  ADMIN_IDS.add(adminId);

  t.beforeEach(() => {
    db._reset();
    _resetApi();
  });

  await t.test('/start responds with welcome message and keyboard', async () => {
    await messageHandler({
      text: '/start',
      from: { id: regularUserId, first_name: 'Alisher' },
      chat: { id: 100 },
    });

    const msgCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(msgCall);
    assert.ok(msgCall.params.text.includes('Alisher'));
    assert.ok(msgCall.params.text.includes('Vocabulary Bot'));
  });

  await t.test('/admin denies non-admin user', async () => {
    await messageHandler({
      text: '/admin',
      from: { id: regularUserId },
      chat: { id: 100 },
    });

    const msgCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(msgCall);
    assert.ok(msgCall.params.text.includes('Ruxsat berilmadi'));
  });

  await t.test('/admin allows authorized admin user', async () => {
    await messageHandler({
      text: '/admin',
      from: { id: adminId },
      chat: { id: 100 },
    });

    const msgCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(msgCall);
    assert.ok(msgCall.params.text.includes('Admin boshqaruv paneli'));
  });

  await t.test('callback_query acknowledges query even on invalid/unknown data', async () => {
    await callbackQueryHandler({
      id: 'query_123',
      data: 'invalid_random_callback_data',
      from: { id: regularUserId },
      message: { chat: { id: 100 }, message_id: 200 },
    });

    const ackCall = apiCalls.find((c) => c.method === 'answerCallbackQuery');
    assert.ok(ackCall);
    assert.equal(ackCall.params.callback_query_id, 'query_123');
  });

  await t.test('admin callbacks reject unauthorized users safely', async () => {
    await callbackQueryHandler({
      id: 'query_124',
      data: 'admin_stats',
      from: { id: regularUserId },
      message: { chat: { id: 100 }, message_id: 200 },
    });

    const sendCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(sendCall);
    assert.ok(sendCall.params.text.includes('Ruxsat berilmadi'));
  });

  await t.test('handles non-existent basket selection gracefully', async () => {
    await callbackQueryHandler({
      id: 'query_125',
      data: 'basket_select_99999',
      from: { id: regularUserId },
      message: { chat: { id: 100 }, message_id: 200 },
    });

    const sendCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(sendCall);
    assert.ok(sendCall.params.text.includes('Savat topilmadi'));
  });

  await t.test('flow_cancel resets state to idle', async () => {
    await callbackQueryHandler({
      id: 'query_126',
      data: 'flow_cancel',
      from: { id: adminId },
      message: { chat: { id: 100 }, message_id: 200 },
    });

    const sendCall = apiCalls.find((c) => c.method === 'sendMessage');
    assert.ok(sendCall);
    assert.ok(sendCall.params.text.includes('Amal bekor qilindi'));
  });
});
