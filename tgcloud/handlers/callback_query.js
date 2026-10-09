import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { isAdmin } from '../lib/admin.js';
import { getBasketsPaginated, getBasketById, deleteBasketCascade } from '../lib/baskets.js';
import { getWordsPaginated, deleteWordCascade } from '../lib/vocabulary.js';
import {
  startFlashcardSession,
  revealCurrentCard,
  answerCurrentCard,
  navigateFlashcard,
} from '../lib/flashcards.js';
import {
  startTestAttempt,
  sendNextQuizPoll,
  resumePausedTest,
  finishTestAttempt,
} from '../lib/tests.js';
import { getSession, setSession, clearSession } from '../lib/sessions.js';
import { MESSAGES } from '../lib/messages.js';
import {
  getMainMenuKeyboard,
  getBasketsListKeyboard,
  getBasketDetailKeyboard,
  getDirectionKeyboard,
  getTestCountKeyboard,
  getFlashcardKeyboard,
  getAdminPanelKeyboard,
  getAdminBasketDetailKeyboard,
  getDeleteBasketConfirmKeyboard,
  getCancelKeyboard,
  getFlowControlKeyboard,
  getTestCompletedKeyboard,
} from '../lib/keyboards.js';
import { baskets, vocabulary, userProgress, testAttempts } from '../schema.js';
import { escapeHtml } from '../lib/utils.js';

/**
 * Handles incoming callback_query updates from Telegram inline buttons.
 * @param {import('telegram-typings').CallbackQuery} query
 */
export default async function (query) {
  if (!query || !query.data) return;

  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;

  // Always answer callback query to dismiss loading animation on Telegram client
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch (e) {
    // ignore
  }

  // No-op buttons (e.g. page numbers)
  if (data === 'noop') return;

  // 1. Navigation & Main Menu
  if (data === 'menu_main') {
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.welcome(query.from.first_name || 'Foydalanuvchi'),
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(isAdmin(userId)),
    });
    return;
  }

  // 2. User Baskets Browser
  if (data.startsWith('baskets_page_')) {
    const page = parseInt(data.replace('baskets_page_', ''), 10) || 1;
    const paginated = await getBasketsPaginated(page, 5);

    if (paginated.items.length === 0) {
      await api.sendMessage({
        chat_id: chatId,
        text: '📚 Hozircha hech qanday vocabulary savatlari yaratilmagan.',
        reply_markup: getMainMenuKeyboard(isAdmin(userId)),
      });
      return;
    }

    const text = `📚 <b>Vocabulary savatlari</b> (Jami: ${paginated.total} ta)\n\nO'rganmoqchi bo'lgan savatingizni tanlang:`;
    const reply_markup = getBasketsListKeyboard(paginated.items, paginated.page, paginated.totalPages, false);

    if (messageId) {
      try {
        await api.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup });
        return;
      } catch {
        // Fall back to send
      }
    }
    await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
    return;
  }

  // 3. Basket Selection View
  if (data.startsWith('basket_select_')) {
    const basketId = parseInt(data.replace('basket_select_', ''), 10);
    const basket = await getBasketById(basketId);

    if (!basket) {
      await api.sendMessage({ chat_id: chatId, text: "⚠️ Savat topilmadi yoki o'chirilgan." });
      return;
    }

    const text = MESSAGES.basketDetail(basket, basket.wordCount);
    const reply_markup = getBasketDetailKeyboard(basket.id, basket.wordCount);

    if (messageId) {
      try {
        await api.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup });
        return;
      } catch {}
    }
    await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
    return;
  }

  // 4. View Words List (User Mode)
  if (data.startsWith('words_view_')) {
    const [, , basketIdStr, pageStr] = data.split('_');
    const basketId = parseInt(basketIdStr, 10);
    const page = parseInt(pageStr, 10) || 1;

    const basket = await getBasketById(basketId);
    const wordsPage = await getWordsPaginated(basketId, page, 5);

    let text = `📖 <b>${escapeHtml(basket?.name || '')} — So'zlar ro'yxati</b>\n\n`;
    if (wordsPage.items.length === 0) {
      text += `<i>Savatda so'zlar mavjud emas.</i>`;
    } else {
      wordsPage.items.forEach((item, idx) => {
        const num = (wordsPage.page - 1) * 5 + idx + 1;
        text += `${num}. <b>${escapeHtml(item.word)}</b> — ${escapeHtml(item.translation)}\n`;
        if (item.definition) text += `   📖 <i>Izoh:</i> ${escapeHtml(item.definition)}\n`;
        if (item.exampleSentence) text += `   💬 <i>Misol:</i> ${escapeHtml(item.exampleSentence)}\n`;
      });
    }

    const inline_keyboard = [];
    const navRow = [];
    if (wordsPage.page > 1) {
      navRow.push({ text: '⬅️ Oldingi', callback_data: `words_view_${basketId}_${wordsPage.page - 1}` });
    }
    navRow.push({ text: `📄 ${wordsPage.page}/${wordsPage.totalPages}`, callback_data: 'noop' });
    if (wordsPage.page < wordsPage.totalPages) {
      navRow.push({ text: 'Keyingi ➡️', callback_data: `words_view_${basketId}_${wordsPage.page + 1}` });
    }
    if (navRow.length > 1) inline_keyboard.push(navRow);
    inline_keyboard.push([{ text: '⬅️ Savatga qaytish', callback_data: `basket_select_${basketId}` }]);

    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard },
    });
    return;
  }

  // 5. Flashcards Flow
  if (data.startsWith('start_fc_dir_')) {
    const basketId = parseInt(data.replace('start_fc_dir_', ''), 10);
    const basket = await getBasketById(basketId);
    if (!basket || basket.wordCount === 0) {
      await api.sendMessage({ chat_id: chatId, text: MESSAGES.emptyBasket() });
      return;
    }

    const text = `🃏 <b>Flashcard yo'nalishini tanlang:</b>\n\nQaysi tildan qaysi tilga o'rganmoqchisiz?`;
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: getDirectionKeyboard('fc', basketId),
    });
    return;
  }

  if (data.startsWith('fc_start_')) {
    const parts = data.split('_');
    const basketId = parseInt(parts[2], 10);
    const direction = `${parts[3]}_${parts[4]}`; // eng_uzb or uzb_eng or mixed

    const cardState = await startFlashcardSession({
      userId,
      basketId,
      direction: direction.startsWith('mixed') ? 'mixed' : direction,
      randomize: true,
    });

    const text = MESSAGES.flashcardCard(cardState);
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: getFlashcardKeyboard(cardState.revealed),
    });
    return;
  }

  if (data === 'fc_reveal') {
    const cardState = await revealCurrentCard(userId);
    if (cardState && !cardState.isComplete) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: MESSAGES.flashcardCard(cardState),
        parse_mode: 'HTML',
        reply_markup: getFlashcardKeyboard(true),
      });
    }
    return;
  }

  if (data === 'fc_known' || data === 'fc_review') {
    const isKnown = data === 'fc_known';
    const cardState = await answerCurrentCard(userId, isKnown);

    if (cardState.isComplete) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: MESSAGES.flashcardSummary(cardState.total, cardState.stats),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Qayta boshlash', callback_data: `start_fc_dir_${cardState.basketId}` }],
            [{ text: '📚 Savatga qaytish', callback_data: `basket_select_${cardState.basketId}` }],
            [{ text: '🏠 Asosiy menyu', callback_data: 'menu_main' }],
          ],
        },
      });
    } else {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: MESSAGES.flashcardCard(cardState),
        parse_mode: 'HTML',
        reply_markup: getFlashcardKeyboard(false),
      });
    }
    return;
  }

  if (data === 'fc_prev' || data === 'fc_next') {
    const cardState = await navigateFlashcard(userId, data === 'fc_prev' ? 'prev' : 'next');
    if (cardState && !cardState.isComplete) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: MESSAGES.flashcardCard(cardState),
        parse_mode: 'HTML',
        reply_markup: getFlashcardKeyboard(cardState.revealed),
      });
    }
    return;
  }

  if (data === 'fc_exit') {
    const session = await getSession(userId);
    const basketId = session.data?.basketId;
    await clearSession(userId);
    if (basketId) {
      const basket = await getBasketById(basketId);
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: MESSAGES.basketDetail(basket, basket.wordCount),
        parse_mode: 'HTML',
        reply_markup: getBasketDetailKeyboard(basket.id, basket.wordCount),
      });
    } else {
      await api.sendMessage({
        chat_id: chatId,
        text: 'Mashg\'ulot yakunlandi.',
        reply_markup: getMainMenuKeyboard(isAdmin(userId)),
      });
    }
    return;
  }

  // 6. Tests Flow
  if (data.startsWith('start_test_dir_')) {
    const basketId = parseInt(data.replace('start_test_dir_', ''), 10);
    const basket = await getBasketById(basketId);
    if (!basket || basket.wordCount === 0) {
      await api.sendMessage({ chat_id: chatId, text: MESSAGES.emptyBasket() });
      return;
    }

    const text = `📝 <b>Test yo'nalishini tanlang:</b>\n\nSavollar qaysi tilda tuzilsin?`;
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: getDirectionKeyboard('test', basketId),
    });
    return;
  }

  if (data.startsWith('test_choose_cnt_')) {
    const parts = data.split('_');
    const basketId = parseInt(parts[3], 10);
    const direction = `${parts[4]}_${parts[5]}`;
    const basket = await getBasketById(basketId);

    const text = `❓ <b>Savollar sonini tanlang:</b>\n\nUshbu savatda jami <b>${basket.wordCount}</b> ta so'z bor:`;
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: getTestCountKeyboard(basketId, direction, basket.wordCount),
    });
    return;
  }

  if (data.startsWith('test_launch_')) {
    const [, , basketIdStr, dir1, dir2, countStr] = data.split('_');
    const basketId = parseInt(basketIdStr, 10);
    const direction = dir1 === 'mixed' ? 'mixed' : `${dir1}_${dir2}`;
    const questionCount = parseInt(countStr, 10);

    // Start attempt in DB & session
    await startTestAttempt({
      userId,
      basketId,
      questionCount,
      direction,
    });

    await api.sendMessage({
      chat_id: chatId,
      text: `🚀 <b>Test boshlandi!</b>\n\nHar bir savolga javob berish uchun <b>15 soniya</b> vaqt beriladi. Omad!`,
      parse_mode: 'HTML',
    });

    // Send first question poll
    await sendNextQuizPoll({ chatId, userId });
    return;
  }

  if (data === 'test_next') {
    // Send next question poll
    await sendNextQuizPoll({ chatId, userId });
    return;
  }

  if (data === 'test_resume') {
    const res = await resumePausedTest(userId);
    if (res.ok) {
      await api.sendMessage({
        chat_id: chatId,
        text: `▶️ <b>Test davom ettirilmoqda...</b>`,
        parse_mode: 'HTML',
      });
      await sendNextQuizPoll({ chatId, userId });
    }
    return;
  }

  if (data === 'test_finish') {
    const summary = await finishTestAttempt(userId);
    if (summary) {
      await api.sendMessage({
        chat_id: chatId,
        text: MESSAGES.testSummary(summary),
        parse_mode: 'HTML',
        reply_markup: getTestCompletedKeyboard(summary.attempt.basketId),
      });
    }
    return;
  }

  if (data === 'test_cancel') {
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: 'Test bekor qilindi.',
      reply_markup: getMainMenuKeyboard(isAdmin(userId)),
    });
    return;
  }

  // 7. Conversational Flow Cancelling
  if (data === 'flow_cancel') {
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: '❌ Amal bekor qilindi.',
      reply_markup: getMainMenuKeyboard(isAdmin(userId)),
    });
    return;
  }

  // 8. Admin Callbacks (Strictly Authorized)
  if (data.startsWith('admin_')) {
    if (!isAdmin(userId)) {
      await api.sendMessage({ chat_id: chatId, text: MESSAGES.accessDenied(), parse_mode: 'HTML' });
      return;
    }

    if (data === 'admin_main') {
      await clearSession(userId);
      await api.sendMessage({
        chat_id: chatId,
        text: '⚙️ <b>Admin boshqaruv paneli</b>\n\nKerakli bo\'limni tanlang:',
        parse_mode: 'HTML',
        reply_markup: getAdminPanelKeyboard(),
      });
      return;
    }

    if (data === 'admin_stats') {
      const totalBaskets = await db.$count(baskets);
      const totalWords = await db.$count(vocabulary);
      const totalTests = await db.$count(testAttempts);
      const studiedUsers = await db.select({ userId: userProgress.userId }).from(userProgress).all();
      const uniqueUsers = new Set(studiedUsers.map((u) => u.userId)).size;

      const text = MESSAGES.adminStats({
        totalBaskets,
        totalWords,
        totalTests,
        totalUsersStudied: uniqueUsers,
      });

      await api.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Admin panelga qaytish', callback_data: 'admin_main' }]],
        },
      });
      return;
    }

    if (data.startsWith('admin_baskets_')) {
      const page = parseInt(data.replace('admin_baskets_', ''), 10) || 1;
      const paginated = await getBasketsPaginated(page, 5);

      const text = `📦 <b>Savatlar boshqaruvi</b> (Jami: ${paginated.total} ta):\n\nTahrirlash yoki so'z qo'shish uchun savatni tanlang:`;
      const reply_markup = getBasketsListKeyboard(paginated.items, paginated.page, paginated.totalPages, true);

      if (messageId) {
        try {
          await api.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup });
          return;
        } catch {}
      }
      await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
      return;
    }

    if (data.startsWith('admin_basket_view_')) {
      const basketId = parseInt(data.replace('admin_basket_view_', ''), 10);
      const basket = await getBasketById(basketId);

      if (!basket) {
        await api.sendMessage({ chat_id: chatId, text: 'Savat topilmadi.' });
        return;
      }

      const text = `📁 <b>Savat: ${escapeHtml(basket.name)}</b>\n\n📝 Tavsif: ${basket.description ? escapeHtml(basket.description) : '<i>Yo\'q</i>'}\n📊 So'zlar soni: <b>${basket.wordCount}</b> ta`;
      const reply_markup = getAdminBasketDetailKeyboard(basket.id);

      if (messageId) {
        try {
          await api.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup });
          return;
        } catch {}
      }
      await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
      return;
    }

    if (data === 'admin_new_basket') {
      await setSession(userId, 'admin_add_basket_name', {});
      await api.sendMessage({
        chat_id: chatId,
        text: '➕ <b>Yangi savat yaratish</b>\n\nIltimos, yangi savat nomini kiriting (masalan: <i>Unit 1</i> yoki <i>IELTS Vocabulary</i>):',
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_rename_')) {
      const basketId = parseInt(data.replace('admin_rename_', ''), 10);
      await setSession(userId, 'admin_rename_basket', { basketId });
      await api.sendMessage({
        chat_id: chatId,
        text: '✏️ <b>Savat nomini o\'zgartirish</b>\n\nSavat uchun yangi nom kiriting:',
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_edit_desc_')) {
      const basketId = parseInt(data.replace('admin_edit_desc_', ''), 10);
      await setSession(userId, 'admin_edit_basket_desc', { basketId });
      await api.sendMessage({
        chat_id: chatId,
        text: '📝 <b>Savat tavsifini tahrirlash</b>\n\nYangi tavsifni yozing (yoki o\'tkazib yuborish uchun tugmani bosing):',
        parse_mode: 'HTML',
        reply_markup: getFlowControlKeyboard(true),
      });
      return;
    }

    if (data.startsWith('admin_del_basket_ask_')) {
      const basketId = parseInt(data.replace('admin_del_basket_ask_', ''), 10);
      const basket = await getBasketById(basketId);
      await api.sendMessage({
        chat_id: chatId,
        text: `⚠️ <b>Haqiqatan ham «${escapeHtml(basket?.name || '')}» savatini o'chirmoqchimisiz?</b>\n\nUshbu savatdagi barcha ${basket?.wordCount || 0} ta so'z va ularning barcha natijalari o'chiriladi. Bu amalni qaytarib bo'lmaydi!`,
        parse_mode: 'HTML',
        reply_markup: getDeleteBasketConfirmKeyboard(basketId),
      });
      return;
    }

    if (data.startsWith('admin_del_basket_exec_')) {
      const basketId = parseInt(data.replace('admin_del_basket_exec_', ''), 10);
      const res = await deleteBasketCascade(basketId);
      await api.sendMessage({
        chat_id: chatId,
        text: `✅ Savat va undagi ${res.wordsCount} ta so'z muvaffaqiyatli o'chirildi!`,
        reply_markup: getAdminPanelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_add_word_')) {
      const basketId = parseInt(data.replace('admin_add_word_', ''), 10);
      await setSession(userId, 'admin_add_word_word', { basketId });
      await api.sendMessage({
        chat_id: chatId,
        text: '🔤 <b>1-qadam:</b> Inglizcha so\'z yoki iborani kiriting:\n(Masalan: <code>overcome</code> yoki <code>give up</code>)',
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_bulk_import_')) {
      const basketId = parseInt(data.replace('admin_bulk_import_', ''), 10);
      await setSession(userId, 'admin_bulk_import', { basketId });
      await api.sendMessage({
        chat_id: chatId,
        text: MESSAGES.bulkImportHelp(),
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_search_')) {
      const basketId = parseInt(data.replace('admin_search_', ''), 10);
      await setSession(userId, 'admin_search_word', { basketId });
      await api.sendMessage({
        chat_id: chatId,
        text: '🔍 Qidirmoqchi bo\'lgan so\'z yoki tarjimani kiriting:',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (data.startsWith('admin_words_')) {
      const [, , basketIdStr, pageStr] = data.split('_');
      const basketId = parseInt(basketIdStr, 10);
      const page = parseInt(pageStr, 10) || 1;

      const basket = await getBasketById(basketId);
      const wordsPage = await getWordsPaginated(basketId, page, 5);

      let text = `📋 <b>${escapeHtml(basket?.name || '')} — So'zlar</b> (Jami: ${wordsPage.total} ta):\n\n`;
      const inline_keyboard = [];

      wordsPage.items.forEach((item, idx) => {
        const num = (wordsPage.page - 1) * 5 + idx + 1;
        text += `${num}. <b>${escapeHtml(item.word)}</b> — ${escapeHtml(item.translation)}\n`;
        inline_keyboard.push([
          { text: `🗑 O'chirish: ${item.word}`, callback_data: `admin_del_word_${item.id}_${basketId}` },
        ]);
      });

      const navRow = [];
      if (wordsPage.page > 1) {
        navRow.push({ text: '⬅️ Oldingi', callback_data: `admin_words_${basketId}_${wordsPage.page - 1}` });
      }
      navRow.push({ text: `📄 ${wordsPage.page}/${wordsPage.totalPages}`, callback_data: 'noop' });
      if (wordsPage.page < wordsPage.totalPages) {
        navRow.push({ text: 'Keyingi ➡️', callback_data: `admin_words_${basketId}_${wordsPage.page + 1}` });
      }
      if (navRow.length > 1) inline_keyboard.push(navRow);

      inline_keyboard.push([{ text: '➕ So\'z qo\'shish', callback_data: `admin_add_word_${basketId}` }]);
      inline_keyboard.push([{ text: '⬅️ Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]);

      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard },
      });
      return;
    }

    if (data.startsWith('admin_del_word_')) {
      const [, , , wordIdStr, basketIdStr] = data.split('_');
      const wordId = parseInt(wordIdStr, 10);
      const basketId = parseInt(basketIdStr, 10);

      await deleteWordCascade(wordId);
      await api.sendMessage({
        chat_id: chatId,
        text: '✅ So\'z o\'chirildi.',
      });

      // Redirect back to words list
      const wordsPage = await getWordsPaginated(basketId, 1, 5);
      const basket = await getBasketById(basketId);
      let text = `📋 <b>${escapeHtml(basket?.name || '')} — So'zlar</b> (Jami: ${wordsPage.total} ta):\n\n`;
      const inline_keyboard = [];
      wordsPage.items.forEach((item, idx) => {
        text += `${idx + 1}. <b>${escapeHtml(item.word)}</b> — ${escapeHtml(item.translation)}\n`;
        inline_keyboard.push([
          { text: `🗑 O'chirish: ${item.word}`, callback_data: `admin_del_word_${item.id}_${basketId}` },
        ]);
      });
      inline_keyboard.push([{ text: '⬅️ Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]);

      await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard } });
      return;
    }
  }

  // Fallback for flow skip
  if (data === 'flow_skip') {
    const session = await getSession(userId);
    if (session.state === 'admin_add_word_definition') {
      await setSession(userId, 'admin_add_word_example', { ...session.data, definition: null });
      await api.sendMessage({
        chat_id: chatId,
        text: '💬 <b>4-qadam:</b> Misol jumlani (example sentence) kiriting yoki o\'tkazib yuboring:',
        parse_mode: 'HTML',
        reply_markup: getFlowControlKeyboard(true),
      });
      return;
    }
    if (session.state === 'admin_add_word_example') {
      const { basketId, word, translation, definition } = session.data;
      const { addWord } = await import('../lib/vocabulary.js');
      await addWord({ basketId, word, translation, definition, exampleSentence: null });
      await clearSession(userId);
      await api.sendMessage({
        chat_id: chatId,
        text: `✅ <b>So'z muvaffaqiyatli saqlandi!</b>\n\n🔤 So'z: <b>${escapeHtml(word)}</b>\n🇺🇿 Tarjima: <b>${escapeHtml(translation)}</b>`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Yana so\'z qo\'shish', callback_data: `admin_add_word_${basketId}` }],
            [{ text: '📋 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }],
          ],
        },
      });
      return;
    }
  }
}
