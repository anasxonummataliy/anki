import { api } from 'sdk';
import { processPollAnswer, finishTestAttempt } from '../lib/tests.js';
import { MESSAGES } from '../lib/messages.js';
import { getTestFeedbackKeyboard, getTestCompletedKeyboard } from '../lib/keyboards.js';

/**
 * Handles incoming poll_answer updates from Telegram.
 * Triggered when a user votes on an interactive quiz poll.
 * @param {import('telegram-typings').PollAnswer} pollAnswer
 */
export default async function (pollAnswer) {
  if (!pollAnswer || !pollAnswer.poll_id || !pollAnswer.user) return;

  const pollId = pollAnswer.poll_id;
  const userId = pollAnswer.user.id;
  const selectedOptionId = pollAnswer.option_ids?.[0];

  if (selectedOptionId === undefined) return;

  const result = await processPollAnswer({
    pollId,
    userId,
    selectedOptionId,
  });

  if (!result) return; // Not an active quiz for this user or duplicate answer

  const { isCorrect, correctAnswer, selectedAnswer, questionIndex, totalQuestions, isLast, chatId } = result;

  const feedbackText = MESSAGES.testAnswerFeedback({
    isCorrect,
    correctAnswer,
    selectedAnswer,
    questionIndex,
    totalQuestions,
  });

  if (isLast) {
    // If it was the last question, conclude test immediately and show summary
    const summary = await finishTestAttempt(userId);
    if (summary) {
      await api.sendMessage({
        chat_id: chatId,
        text: feedbackText,
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
    // Send feedback with button for next question
    await api.sendMessage({
      chat_id: chatId,
      text: feedbackText,
      parse_mode: 'HTML',
      reply_markup: getTestFeedbackKeyboard(false),
    });
  }
}
