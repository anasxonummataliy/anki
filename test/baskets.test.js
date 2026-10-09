import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from 'sdk';
import {
  createBasket,
  getBasketById,
  getAllBaskets,
  getBasketsPaginated,
  updateBasketName,
  updateBasketDescription,
  deleteBasketCascade,
} from '../tgcloud/lib/baskets.js';
import { addWord, getWordsByBasketId } from '../tgcloud/lib/vocabulary.js';

test('Basket management tests', async (t) => {
  t.beforeEach(() => {
    db._reset();
  });

  await t.test('createBasket creates basket and enforces non-empty name', async () => {
    await assert.rejects(
      async () => createBasket('   '),
      /bo'sh bo'lishi mumkin emas/
    );

    const basket = await createBasket('Unit 1', 'Introductory vocabulary');
    assert.ok(basket.id);
    assert.equal(basket.name, 'Unit 1');
    assert.equal(basket.description, 'Introductory vocabulary');
  });

  await t.test('getBasketById returns basket with word count', async () => {
    const basket = await createBasket('IELTS Words');
    await addWord({ basketId: basket.id, word: 'ephemeral', translation: 'o\'tkinchi' });
    await addWord({ basketId: basket.id, word: 'ubiquitous', translation: 'hamma joyda mavjud' });

    const found = await getBasketById(basket.id);
    assert.equal(found.name, 'IELTS Words');
    assert.equal(found.wordCount, 2);
  });

  await t.test('updateBasketName updates name and rejects empty string', async () => {
    const basket = await createBasket('Old Name');
    await assert.rejects(async () => updateBasketName(basket.id, ''));

    const updated = await updateBasketName(basket.id, 'New Name');
    assert.equal(updated.name, 'New Name');
  });

  await t.test('updateBasketDescription updates description', async () => {
    const basket = await createBasket('Basket');
    const updated = await updateBasketDescription(basket.id, 'Updated description');
    assert.equal(updated.description, 'Updated description');
  });

  await t.test('getBasketsPaginated paginates correctly', async () => {
    for (let i = 1; i <= 7; i++) {
      await createBasket(`Basket ${i}`);
    }

    const page1 = await getBasketsPaginated(1, 5);
    assert.equal(page1.items.length, 5);
    assert.equal(page1.total, 7);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.hasNext, true);
    assert.equal(page1.hasPrev, false);

    const page2 = await getBasketsPaginated(2, 5);
    assert.equal(page2.items.length, 2);
    assert.equal(page2.hasNext, false);
    assert.equal(page2.hasPrev, true);
  });

  await t.test('deleteBasketCascade deletes basket and its words without leaving orphans', async () => {
    const basket = await createBasket('To Delete');
    await addWord({ basketId: basket.id, word: 'abandon', translation: 'tashlab ketmoq' });
    await addWord({ basketId: basket.id, word: 'abolish', translation: 'bekor qilmoq' });

    const res = await deleteBasketCascade(basket.id);
    assert.equal(res.wordsCount, 2);

    const found = await getBasketById(basket.id);
    assert.equal(found, null);

    const words = await getWordsByBasketId(basket.id);
    assert.equal(words.length, 0);
  });
});
