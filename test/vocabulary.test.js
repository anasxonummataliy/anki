import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from 'sdk';
import { createBasket } from '../tgcloud/lib/baskets.js';
import {
  addWord,
  getWordById,
  updateWord,
  deleteWordCascade,
  getWordsByBasketId,
  getWordsPaginated,
  findDuplicateWord,
  searchWords,
  parseBulkWords,
  importBulkWords,
} from '../tgcloud/lib/vocabulary.js';

test('Vocabulary management tests', async (t) => {
  let basket;

  t.beforeEach(async () => {
    db._reset();
    basket = await createBasket('Daily English');
  });

  await t.test('addWord creates vocabulary and supports optional definition/examples', async () => {
    // Required fields check
    await assert.rejects(async () => addWord({ basketId: basket.id, word: '', translation: 'tarjima' }));
    await assert.rejects(async () => addWord({ basketId: basket.id, word: 'word', translation: '' }));

    // Word with description=null as requested in TZ
    const wordWithoutDef = await addWord({
      basketId: basket.id,
      word: 'give up',
      translation: 'taslim bo\'lmoq',
      definition: null,
      exampleSentence: null,
    });
    assert.ok(wordWithoutDef.id);
    assert.equal(wordWithoutDef.definition, null);
    assert.equal(wordWithoutDef.exampleSentence, null);

    // Word with all optional fields
    const wordWithDef = await addWord({
      basketId: basket.id,
      word: 'overcome',
      translation: 'yengib o\'tmoq',
      definition: 'to successfully deal with a problem',
      exampleSentence: 'She overcame many difficulties.',
    });
    assert.equal(wordWithDef.definition, 'to successfully deal with a problem');
  });

  await t.test('findDuplicateWord detects existing words case-insensitively', async () => {
    await addWord({ basketId: basket.id, word: 'Resilient', translation: 'bardoshli' });

    const dup1 = await findDuplicateWord(basket.id, 'resilient');
    assert.ok(dup1);
    assert.equal(dup1.word, 'Resilient');

    const notDup = await findDuplicateWord(basket.id, 'fragile');
    assert.equal(notDup, null);
  });

  await t.test('updateWord updates word fields', async () => {
    const word = await addWord({ basketId: basket.id, word: 'hello', translation: 'salom' });
    const updated = await updateWord(word.id, {
      word: 'hi',
      translation: 'salom (norasmiy)',
      definition: 'informal greeting',
    });
    assert.equal(updated.word, 'hi');
    assert.equal(updated.translation, 'salom (norasmiy)');
    assert.equal(updated.definition, 'informal greeting');
  });

  await t.test('deleteWordCascade removes word', async () => {
    const word = await addWord({ basketId: basket.id, word: 'temp', translation: 'vaqtinchalik' });
    await deleteWordCascade(word.id);
    const found = await getWordById(word.id);
    assert.equal(found, null);
  });

  await t.test('searchWords finds words by word or translation', async () => {
    await addWord({ basketId: basket.id, word: 'brave', translation: 'jasur' });
    await addWord({ basketId: basket.id, word: 'coward', translation: 'qo\'rqoq' });

    const search1 = await searchWords('brav', basket.id);
    assert.equal(search1.length, 1);
    assert.equal(search1[0].word, 'brave');

    const search2 = await searchWords('jasur', basket.id);
    assert.equal(search2.length, 1);
    assert.equal(search2[0].word, 'brave');
  });

  await t.test('parseBulkWords handles pipe, comma, and hyphen formats', () => {
    const raw = `
apple | olma | a round fruit | I ate an apple
banana - banan
cat,mushuk,an animal,cute cat
invalidline
`;
    const { valid, errors } = parseBulkWords(raw);
    assert.equal(valid.length, 3);
    assert.equal(valid[0].word, 'apple');
    assert.equal(valid[0].translation, 'olma');
    assert.equal(valid[0].definition, 'a round fruit');
    assert.equal(valid[1].word, 'banana');
    assert.equal(valid[1].translation, 'banan');
    assert.equal(valid[2].word, 'cat');
    assert.equal(valid[2].translation, 'mushuk');
    assert.equal(errors.length, 1);
  });

  await t.test('importBulkWords imports multiple words into basket', async () => {
    const words = [
      { word: 'w1', translation: 't1' },
      { word: 'w2', translation: 't2' },
    ];
    const imported = await importBulkWords(basket.id, words);
    assert.equal(imported.length, 2);
    const all = await getWordsByBasketId(basket.id);
    assert.equal(all.length, 2);
  });
});
