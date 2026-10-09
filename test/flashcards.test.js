import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from 'sdk';
import { createBasket } from '../tgcloud/lib/baskets.js';
import { addWord } from '../tgcloud/lib/vocabulary.js';
import {
  startFlashcardSession,
  revealCurrentCard,
  answerCurrentCard,
  navigateFlashcard,
} from '../tgcloud/lib/flashcards.js';
import { getUserProgressStats } from '../tgcloud/lib/progress.js';

test('Flashcard study mode tests', async (t) => {
  let basket;
  const userId = 1001;

  t.beforeEach(async () => {
    db._reset();
    basket = await createBasket('A1 Vocabulary');
  });

  await t.test('startFlashcardSession rejects empty basket gracefully', async () => {
    await assert.rejects(
      async () => startFlashcardSession({ userId, basketId: basket.id }),
      /hali so'zlar mavjud emas/
    );
  });

  await t.test('supports eng_uzb direction', async () => {
    await addWord({ basketId: basket.id, word: 'dog', translation: 'kuchuk' });
    const card = await startFlashcardSession({
      userId,
      basketId: basket.id,
      direction: 'eng_uzb',
    });

    assert.equal(card.isComplete, false);
    assert.equal(card.isEngToUzb, true);
    assert.equal(card.questionText, 'dog');
    assert.equal(card.answerText, 'kuchuk');
  });

  await t.test('supports uzb_eng direction', async () => {
    await addWord({ basketId: basket.id, word: 'sun', translation: 'quyosh' });
    const card = await startFlashcardSession({
      userId,
      basketId: basket.id,
      direction: 'uzb_eng',
    });

    assert.equal(card.isComplete, false);
    assert.equal(card.isEngToUzb, false);
    assert.equal(card.questionText, 'quyosh');
    assert.equal(card.answerText, 'sun');
  });

  await t.test('reveal and answer flow with progress tracking', async () => {
    const w1 = await addWord({ basketId: basket.id, word: 'water', translation: 'suv' });
    const w2 = await addWord({ basketId: basket.id, word: 'fire', translation: 'olov' });

    let state = await startFlashcardSession({
      userId,
      basketId: basket.id,
      direction: 'eng_uzb',
      randomize: false,
    });
    assert.equal(state.revealed, false);

    // Reveal card
    state = await revealCurrentCard(userId);
    assert.equal(state.revealed, true);

    // Mark card 1 as "known"
    state = await answerCurrentCard(userId, true);
    assert.equal(state.currentIndex, 2);
    assert.equal(state.stats.known, 1);
    assert.equal(state.stats.review, 0);

    // Mark card 2 as "review"
    state = await answerCurrentCard(userId, false);
    assert.equal(state.isComplete, true);
    assert.equal(state.stats.known, 1);
    assert.equal(state.stats.review, 1);

    // Verify user progress persisted in database
    const progress = await getUserProgressStats(userId);
    assert.equal(progress.totalStudied, 2);
    assert.equal(progress.knownCount, 1);
    assert.equal(progress.reviewCount, 1);
  });

  await t.test('navigateFlashcard allows next and prev navigation', async () => {
    await addWord({ basketId: basket.id, word: 'one', translation: 'bir' });
    await addWord({ basketId: basket.id, word: 'two', translation: 'ikki' });

    await startFlashcardSession({ userId, basketId: basket.id, direction: 'eng_uzb', randomize: false });

    // Navigate next
    let card = await navigateFlashcard(userId, 'next');
    assert.equal(card.currentIndex, 2);

    // Navigate prev
    card = await navigateFlashcard(userId, 'prev');
    assert.equal(card.currentIndex, 1);
  });
});
