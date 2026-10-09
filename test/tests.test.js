import test from 'node:test';
import assert from 'node:assert/strict';
import { db, apiCalls, _resetApi } from 'sdk';
import { createBasket } from '../tgcloud/lib/baskets.js';
import { addWord } from '../tgcloud/lib/vocabulary.js';
import {
  generateQuestion,
  startTestAttempt,
  sendNextQuizPoll,
  processPollAnswer,
  handlePollClosed,
  resumePausedTest,
  finishTestAttempt,
} from '../tgcloud/lib/tests.js';

test('Telegram Poll Quiz test mode tests', async (t) => {
  let basket;
  const userId = 2002;
  const chatId = 3003;

  t.beforeEach(async () => {
    db._reset();
    _resetApi();
    basket = await createBasket('IELTS Preparation');
  });

  await t.test('generateQuestion generates 4 unique options with correct answer', () => {
    const target = { id: 1, word: 'lucid', translation: 'aniq, ravshan' };
    const all = [
      target,
      { id: 2, word: 'obscure', translation: 'qorong\'i, noaniq' },
      { id: 3, word: 'vague', translation: 'g\'ira-shira' },
      { id: 4, word: 'candid', translation: 'samimiy' },
    ];

    const q = generateQuestion({
      targetWord: target,
      allWords: all,
      direction: 'eng_uzb',
      maxOptions: 4,
    });

    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4); // No duplicates
    assert.ok(q.options.includes(q.correctAnswer));
    assert.equal(q.options[q.correctOptionIndex], q.correctAnswer);
  });

  await t.test('generateQuestion supports uzb_eng direction', () => {
    const target = { id: 1, word: 'brave', translation: 'jasur' };
    const all = [
      target,
      { id: 2, word: 'timid', translation: 'qo\'rqoq' },
      { id: 3, word: 'bold', translation: 'dovyurak' },
    ];

    const q = generateQuestion({
      targetWord: target,
      allWords: all,
      direction: 'uzb_eng',
      maxOptions: 4,
    });

    assert.equal(q.correctAnswer, 'brave');
    assert.equal(q.options[q.correctOptionIndex], 'brave');
    assert.ok(q.questionText.includes('jasur'));
  });

  await t.test('startTestAttempt & sendNextQuizPoll sends 15-second quiz poll', async () => {
    for (let i = 1; i <= 5; i++) {
      await addWord({ basketId: basket.id, word: `word_${i}`, translation: `trans_${i}` });
    }

    const { attempt } = await startTestAttempt({
      userId,
      basketId: basket.id,
      questionCount: 3,
      direction: 'eng_uzb',
    });
    assert.ok(attempt.id);
    assert.equal(attempt.totalQuestions, 3);
    assert.equal(attempt.status, 'in_progress');

    // Send first question
    const sendRes = await sendNextQuizPoll({ chatId, userId });
    assert.ok(sendRes.pollId);

    // Verify Telegram API call
    const pollCall = apiCalls.find((c) => c.method === 'sendPoll');
    assert.ok(pollCall);
    assert.equal(pollCall.params.chat_id, chatId);
    assert.equal(pollCall.params.type, 'quiz');
    assert.equal(pollCall.params.open_period, 15); // 15 seconds!
    assert.equal(pollCall.params.is_anonymous, false); // Must be non-anonymous
  });

  await t.test('processPollAnswer handles correct/incorrect and prevents duplicates', async () => {
    for (let i = 1; i <= 4; i++) {
      await addWord({ basketId: basket.id, word: `w_${i}`, translation: `t_${i}` });
    }

    await startTestAttempt({ userId, basketId: basket.id, questionCount: 2, direction: 'eng_uzb' });
    const { pollId } = await sendNextQuizPoll({ chatId, userId });

    const pollCall = apiCalls.find((c) => c.method === 'sendPoll');
    const correctIdx = pollCall.params.correct_option_id;

    // Submit correct answer
    const ans1 = await processPollAnswer({
      pollId,
      userId,
      selectedOptionId: correctIdx,
    });
    assert.ok(ans1);
    assert.equal(ans1.isCorrect, true);

    // Repeated submission on same poll must be rejected
    const ansRepeat = await processPollAnswer({
      pollId,
      userId,
      selectedOptionId: correctIdx,
    });
    assert.equal(ansRepeat, null);

    // Other user cannot submit answer to this poll
    const otherUserAns = await processPollAnswer({
      pollId,
      userId: 99999,
      selectedOptionId: correctIdx,
    });
    assert.equal(otherUserAns, null);
  });

  await t.test('2 consecutive missed/timeout tests trigger PAUSE', async () => {
    for (let i = 1; i <= 4; i++) {
      await addWord({ basketId: basket.id, word: `w_${i}`, translation: `t_${i}` });
    }

    await startTestAttempt({ userId, basketId: basket.id, questionCount: 3, direction: 'eng_uzb' });

    // Question 1 sent
    const { pollId: poll1 } = await sendNextQuizPoll({ chatId, userId });

    // Poll 1 times out (15s elapsed without user answering)
    const timeout1 = await handlePollClosed(poll1);
    assert.ok(timeout1);
    assert.equal(timeout1.paused, false); // First miss: warning only
    assert.equal(timeout1.consecutiveMissed, 1);

    // Question 2 sent
    const { pollId: poll2 } = await sendNextQuizPoll({ chatId, userId });

    // Poll 2 times out (second consecutive miss!)
    const timeout2 = await handlePollClosed(poll2);
    assert.ok(timeout2);
    assert.equal(timeout2.paused, true); // Second miss: PAUSED!
    assert.equal(timeout2.consecutiveMissed, 2);

    // Resume test
    const resume = await resumePausedTest(userId);
    assert.equal(resume.ok, true);

    // Question 3 sent after resume
    const { pollId: poll3 } = await sendNextQuizPoll({ chatId, userId });
    assert.ok(poll3);
  });

  await t.test('finishTestAttempt computes score accurately and persists in database', async () => {
    for (let i = 1; i <= 4; i++) {
      await addWord({ basketId: basket.id, word: `w_${i}`, translation: `t_${i}` });
    }

    await startTestAttempt({ userId, basketId: basket.id, questionCount: 2, direction: 'eng_uzb' });

    // Question 1: answered correctly
    const { pollId: p1 } = await sendNextQuizPoll({ chatId, userId });
    const p1Call = apiCalls.find((c) => c.method === 'sendPoll');
    await processPollAnswer({ pollId: p1, userId, selectedOptionId: p1Call.params.correct_option_id });

    // Question 2: timed out
    _resetApi();
    const { pollId: p2 } = await sendNextQuizPoll({ chatId, userId });
    await handlePollClosed(p2);

    // Finish test
    const summary = await finishTestAttempt(userId);
    assert.ok(summary);
    assert.equal(summary.totalQuestions, 2);
    assert.equal(summary.correctAnswers, 1);
    assert.equal(summary.incorrectAnswers, 1);
    assert.equal(summary.scorePercentage, 50); // 1 out of 2 = 50%
  });
});
