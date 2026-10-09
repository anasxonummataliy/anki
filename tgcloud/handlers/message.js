import { api } from 'sdk';
import { isAdmin } from '../lib/admin.js';
import { createBasket, updateBasketName, updateBasketDescription, getBasketsPaginated, getBasketById } from '../lib/baskets.js';
import { addWord, findDuplicateWord, parseBulkWords, importBulkWords, searchWords } from '../lib/vocabulary.js';
import { getUserProgressStats } from '../lib/progress.js';
import { getSession, setSession, clearSession } from '../lib/sessions.js';
import { MESSAGES } from '../lib/messages.js';
import {
  getMainMenuKeyboard,
  getBasketsListKeyboard,
  getAdminPanelKeyboard,
  getCancelKeyboard,
  getFlowControlKeyboard,
} from '../lib/keyboards.js';
import { escapeHtml } from '../lib/utils.js';

/**
 * Handles incoming message updates from Telegram.
 * @param {import('telegram-typings').Message} message
 */
export default async function (message) {
  if (!message || !message.text) return;

  const text = message.text.trim();
  const userId = message.from.id;
  const chatId = message.chat.id;
  const firstName = message.from.first_name || 'Foydalanuvchi';
  const isAdminUser = isAdmin(userId);

  // 1. Commands
  if (text === '/start') {
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.welcome(firstName),
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(isAdminUser),
    });
    return;
  }

  if (text === '/help' || text === 'ℹ️ Yordam') {
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.help(),
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(isAdminUser),
    });
    return;
  }

  if (text === '/admin' || text === '⚙️ Admin panel') {
    if (!isAdminUser) {
      await api.sendMessage({
        chat_id: chatId,
        text: MESSAGES.accessDenied(),
        parse_mode: 'HTML',
      });
      return;
    }
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: '⚙️ <b>Admin boshqaruv paneli</b>\n\nKerakli bo\'limni tanlang:',
      parse_mode: 'HTML',
      reply_markup: getAdminPanelKeyboard(),
    });
    return;
  }

  if (text === '📚 Vocabulary savatlari') {
    await clearSession(userId);
    const paginated = await getBasketsPaginated(1, 5);
    if (paginated.items.length === 0) {
      await api.sendMessage({
        chat_id: chatId,
        text: '📚 Hozircha hech qanday vocabulary savatlari yaratilmagan.',
        reply_markup: getMainMenuKeyboard(isAdminUser),
      });
      return;
    }
    await api.sendMessage({
      chat_id: chatId,
      text: `📚 <b>Vocabulary savatlari</b> (Jami: ${paginated.total} ta):\n\nO'rganmoqchi bo'lgan savatingizni tanlang:`,
      parse_mode: 'HTML',
      reply_markup: getBasketsListKeyboard(paginated.items, paginated.page, paginated.totalPages, false),
    });
    return;
  }

  if (text === '🗂 Mening natijalarim') {
    const stats = await getUserProgressStats(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: MESSAGES.userProgress(stats),
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(isAdminUser),
    });
    return;
  }

  // 2. Check active conversational sessions
  const session = await getSession(userId);

  // Admin Workflows
  if (session.state.startsWith('admin_')) {
    if (!isAdminUser) {
      await clearSession(userId);
      await api.sendMessage({ chat_id: chatId, text: MESSAGES.accessDenied(), parse_mode: 'HTML' });
      return;
    }

    // Creating a new basket
    if (session.state === 'admin_add_basket_name') {
      const basketName = text;
      await setSession(userId, 'admin_add_basket_desc', { basketName });
      await api.sendMessage({
        chat_id: chatId,
        text: `📝 Endi <b>${escapeHtml(basketName)}</b> savati uchun qisqacha tavsif yozing (yoki o'tkazib yuborish uchun <code>-</code> yuboring):`,
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    if (session.state === 'admin_add_basket_desc') {
      const description = text === '-' ? null : text;
      const { basketName } = session.data;
      const newBasket = await createBasket(basketName, description);
      await clearSession(userId);

      await api.sendMessage({
        chat_id: chatId,
        text: `✅ <b>«${escapeHtml(newBasket.name)}» savati muvaffaqiyatli yaratildi!</b>`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ So\'z qo\'shish', callback_data: `admin_add_word_${newBasket.id}` }],
            [{ text: '📋 Savatni ko\'rish', callback_data: `admin_basket_view_${newBasket.id}` }],
            [{ text: '📦 Barcha savatlar', callback_data: 'admin_baskets_1' }],
          ],
        },
      });
      return;
    }

    // Renaming a basket
    if (session.state === 'admin_rename_basket') {
      const { basketId } = session.data;
      await updateBasketName(basketId, text);
      await clearSession(userId);
      await api.sendMessage({
        chat_id: chatId,
        text: `✅ Savat nomi yangilandi: <b>${escapeHtml(text)}</b>`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '📋 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]],
        },
      });
      return;
    }

    // Editing basket description
    if (session.state === 'admin_edit_basket_desc') {
      const { basketId } = session.data;
      const desc = text === '-' ? null : text;
      await updateBasketDescription(basketId, desc);
      await clearSession(userId);
      await api.sendMessage({
        chat_id: chatId,
        text: `✅ Savat tavsifi yangilandi.`,
        reply_markup: {
          inline_keyboard: [[{ text: '📋 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]],
        },
      });
      return;
    }

    // Adding a vocabulary word - Step 1: Word
    if (session.state === 'admin_add_word_word') {
      const { basketId } = session.data;
      const dup = await findDuplicateWord(basketId, text);
      let dupWarning = '';
      if (dup) {
        dupWarning = `⚠️ <i>Diqqat: Ushbu so'z savatda allaqachon mavjud! («${escapeHtml(dup.translation)}»)</i>\n\n`;
      }

      await setSession(userId, 'admin_add_word_translation', { basketId, word: text });
      await api.sendMessage({
        chat_id: chatId,
        text: `${dupWarning}🇺🇿 <b>2-qadam:</b> «${escapeHtml(text)}» so'zining o'zbekcha tarjimasini kiriting:`,
        parse_mode: 'HTML',
        reply_markup: getCancelKeyboard(),
      });
      return;
    }

    // Step 2: Translation
    if (session.state === 'admin_add_word_translation') {
      const { basketId, word } = session.data;
      await setSession(userId, 'admin_add_word_definition', { basketId, word, translation: text });
      await api.sendMessage({
        chat_id: chatId,
        text: `📖 <b>3-qadam:</b> Inglizcha izoh (definition) kiriting yoki o'tkazib yuborish uchun tugmani bosing:`,
        parse_mode: 'HTML',
        reply_markup: getFlowControlKeyboard(true),
      });
      return;
    }

    // Step 3: Definition
    if (session.state === 'admin_add_word_definition') {
      const { basketId, word, translation } = session.data;
      const definition = text === '-' ? null : text;
      await setSession(userId, 'admin_add_word_example', { basketId, word, translation, definition });
      await api.sendMessage({
        chat_id: chatId,
        text: `💬 <b>4-qadam:</b> Misol jumlani (example sentence) kiriting yoki o'tkazib yuborish uchun tugmani bosing:`,
        parse_mode: 'HTML',
        reply_markup: getFlowControlKeyboard(true),
      });
      return;
    }

    // Step 4: Example sentence
    if (session.state === 'admin_add_word_example') {
      const { basketId, word, translation, definition } = session.data;
      const exampleSentence = text === '-' ? null : text;

      await addWord({
        basketId,
        word,
        translation,
        definition,
        exampleSentence,
      });

      await clearSession(userId);

      await api.sendMessage({
        chat_id: chatId,
        text: `✅ <b>So'z muvaffaqiyatli saqlandi!</b>\n\n🔤 So'z: <b>${escapeHtml(word)}</b>\n🇺🇿 Tarjima: <b>${escapeHtml(translation)}</b>\n${definition ? `📖 Izoh: <i>${escapeHtml(definition)}</i>\n` : ''}${exampleSentence ? `💬 Misol: <i>${escapeHtml(exampleSentence)}</i>` : ''}`,
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

    // Bulk Import
    if (session.state === 'admin_bulk_import') {
      const { basketId } = session.data;
      const { valid, errors } = parseBulkWords(text);

      if (valid.length === 0) {
        await api.sendMessage({
          chat_id: chatId,
          text: `❌ Hech qanday to'g'ri formatdagi so'z topilmadi.\n\n${errors.slice(0, 5).join('\n')}`,
          reply_markup: getCancelKeyboard(),
        });
        return;
      }

      const imported = await importBulkWords(basketId, valid);
      await clearSession(userId);

      let reportMsg = `✅ <b>${imported.length} ta so'z muvaffaqiyatli yuklandi!</b>\n`;
      if (errors.length > 0) {
        reportMsg += `\n⚠️ <i>Xatoliklar (${errors.length} ta):</i>\n${errors.slice(0, 5).join('\n')}`;
      }

      await api.sendMessage({
        chat_id: chatId,
        text: reportMsg,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 So\'zlar ro\'yxati', callback_data: `admin_words_${basketId}_1` }],
            [{ text: '📁 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }],
          ],
        },
      });
      return;
    }

    // Word Search
    if (session.state === 'admin_search_word') {
      const { basketId } = session.data;
      const results = await searchWords(text, basketId);
      await clearSession(userId);

      if (results.length === 0) {
        await api.sendMessage({
          chat_id: chatId,
          text: `🔍 «${escapeHtml(text)}» bo'yicha hech narsa topilmadi.`,
          reply_markup: {
            inline_keyboard: [[{ text: '📋 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]],
          },
        });
        return;
      }

      let resMsg = `🔍 <b>Qidiruv natijalari (${results.length} ta):</b>\n\n`;
      const inline_keyboard = [];
      results.slice(0, 10).forEach((item, idx) => {
        resMsg += `${idx + 1}. <b>${escapeHtml(item.word)}</b> — ${escapeHtml(item.translation)}\n`;
        inline_keyboard.push([
          { text: `🗑 O'chirish: ${item.word}`, callback_data: `admin_del_word_${item.id}_${basketId}` },
        ]);
      });
      inline_keyboard.push([{ text: '📋 Savatga qaytish', callback_data: `admin_basket_view_${basketId}` }]);

      await api.sendMessage({
        chat_id: chatId,
        text: resMsg,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard },
      });
      return;
    }
  }

  // Default unrecognized message
  await api.sendMessage({
    chat_id: chatId,
    text: "Menyudan kerakli bo'limni tanlang 👇",
    reply_markup: getMainMenuKeyboard(isAdminUser),
  });
}
