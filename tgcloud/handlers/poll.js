import { api } from 'sdk';
import { handlePollClosed, finishTestAttempt } from '../lib/tests.js';
import { MESSAGES } from '../lib/messages.js';
import { getTestPausedKeyboard, getTestFeedbackKeyboard, getTestCompletedKeyboard } from '../lib/keyboards.js';

/**
 * Handles poll state changes (e.g. poll closed when 15s timer expires).
 * @param {import('telegram-typings').Poll} poll
 */
export default async function (poll) {
  if (!poll || !poll.id || !poll.is_closed) return;

  const result = await handlePollClosed(poll.id);
  if (!result) return; // Poll was already answered normally or not an active quiz

  const { paused, consecutiveMissed, chatId, userId, isLast, attemptId } = result;

  if (paused) {
    // 2 consecutive questions timed out -> Pause test!
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.testPaused(),
      parse_mode: 'HTML',
      reply_markup: getTestPausedKeyboard(),
    });
  } else if (isLast) {
    // Timed out on last question -> finish test
    const summary = await finishTestAttempt(userId);
    if (summary) {
      await api.sendMessage({
        chat_id: chatId,
        text: MESSAGES.testTimeoutWarning(consecutiveMissed),
        parse_mode: 'HTML',
      });

      await api.sendMessage({
        chat_id: chatId,
        text: MESSAGES.testSummary(summary),
        parse_mode: 'HTML',
        reply_markup: getTestCompletedKeyboard(summary.attempt.basketId),
      });
    }
  } else {
    // 1 miss so far -> send warning and Next button
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.testTimeoutWarning(consecutiveMissed),
      parse_mode: 'HTML',
      reply_markup: getTestFeedbackKeyboard(false),
    });
  }
}
