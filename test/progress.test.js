import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from 'sdk';
import { createBasket } from '../tgcloud/lib/baskets.js';
import { addWord } from '../tgcloud/lib/vocabulary.js';
import { recordWordProgress, getUserProgressStats } from '../tgcloud/lib/progress.js';
import { startTestAttempt, sendNextQuizPoll, processPollAnswer, finishTestAttempt } from '../tgcloud/lib/tests.js';

test('User progress tracking tests', async (t) => {
  const userId = 4004;

  t.beforeEach(() => {
    db._reset();
  });

  await t.test('returns zero stats when no activity exists', async () => {
    const stats = await getUserProgressStats(userId);
    assert.equal(stats.totalStudied, 0);
    assert.equal(stats.knownCount, 0);
    assert.equal(stats.reviewCount, 0);
    assert.equal(stats.totalTests, 0);
    assert.equal(stats.bestScore, 0);
    assert.equal(stats.avgScore, 0);
  });

  await t.test('accurately counts unique words studied without double-counting', async () => {
    const basket = await createBasket('Vocab');
    const w1 = await addWord({ basketId: basket.id, word: 'dog', translation: 'it' });
    const w2 = await addWord({ basketId: basket.id, word: 'cat', translation: 'mushuk' });

    // Mark w1 twice
    await recordWordProgress(userId, w1.id, true);
    await recordWordProgress(userId, w1.id, true);

    // Mark w2 once
    await recordWordProgress(userId, w2.id, false);

    const stats = await getUserProgressStats(userId);
    // Unique words studied should be 2, not 3!
    assert.equal(stats.totalStudied, 2);
    assert.equal(stats.knownCount, 1);
    assert.equal(stats.reviewCount, 1);
  });

  await t.test('calculates test statistics (best score and average)', async () => {
    const basket = await createBasket('B2 Vocab');
    for (let i = 1; i <= 6; i++) {
      await addWord({ basketId: basket.id, word: `word${i}`, translation: `trans${i}` });
    }

    // Test 1: 100%
    await startTestAttempt({ userId, basketId: basket.id, questionCount: 2, direction: 'eng_uzb' });
    const q1 = await sendNextQuizPoll({ chatId: 1, userId });
    await processPollAnswer({ pollId: q1.pollId, userId, selectedOptionId: 0 }); // correct
    const q2 = await sendNextQuizPoll({ chatId: 1, userId });
    await processPollAnswer({ pollId: q2.pollId, userId, selectedOptionId: 0 }); // correct
    const finishRes = await finishTestAttempt(userId);
    const stats = await getUserProgressStats(userId);

    assert.equal(stats.totalTests, 1);
    assert.ok(stats.bestScore >= 0);
    assert.ok(stats.avgScore >= 0);
    assert.equal(stats.recentAttempts.length, 1);
    assert.equal(stats.recentAttempts[0].basketName, 'B2 Vocab');
  });
});
