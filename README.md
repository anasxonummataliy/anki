# 📚 Vocabulary Telegram Bot

Ingliz tili so'z boyligini oshirish, mavzuli savatlar (baskets) yaratish, interaktiv flashcardlar orqali yodlash va 15 soniyalik Telegram Quiz testlari orqali bilimlarni mustahkamlash uchun mo'ljallangan Telegram Serverless boti.

Loyiha rasmiy [Telegram Serverless](https://core.telegram.org/bots/serverless) platformasida JavaScript (ES Modules) va ichki SQLite ma'lumotlar bazasida ishlaydi.

---

## 🌟 Asosiy imkoniyatlar

1. **📚 Vocabulary savatlari (Baskets):**
   - Admin tomonidan mavzulashtirilgan savatlar yaratish (masalan: *Unit 1*, *IELTS Vocabulary*, *Phrasal Verbs*).
   - Savatlarni qayta nomlash, tavsifini o'zgartirish va tasdiqlash orqali to'liq o'chirish (cascade deletion).
   - So'zlar sonini ko'rsatuvchi sahifalangan (pagination) interfeys.

2. **📖 So'zlar boshqaruvi (Vocabulary Management):**
   - So'z yoki ibora kiritish (word / phrase).
   - O'zbekcha tarjima (translation).
   - Ixtiyoriy inglizcha izoh (definition — *None/null bo'lishi mumkin*).
   - Ixtiyoriy misol jumla (example sentence).
   - Qadam-ba-qadam suhbat rejimi (Conversational Add Flow) orqali kiritish, bekor qilish (`Cancel`) va o'tkazib yuborish (`Skip`).
   - Takroriy (dublikat) so'zlarni avtomatik tekshirish.
   - Ommaviy yuklash (Bulk Import: `word | translation | definition | example` yoki `word - translation`).

3. **🃏 Flashcard o'rganish rejimi:**
   - Uch xil yo'nalish:
     - 🇬🇧 English ➡️ 🇺🇿 O'zbekcha
     - 🇺🇿 O'zbekcha ➡️ 🇬🇧 English
     - 🔀 Aralash (Mixed)
   - Kartani ko'rish, «👁 Tarjimani ko'rish», «✅ Bilaman», «🔄 Qayta takrorlash» va oldingi/keyingi navigatsiya.
   - O'rganish natijalarini ma'lumotlar bazasida avtomatik saqlash.

4. **📝 Telegram Quiz Poll test rejimi:**
   - Rasmiy **Telegram Native Poll (Quiz)** formati (`api.sendPoll`).
   - Har bir savol uchun aniq **15 soniya** vaqt beriladi (`open_period: 15`).
   - 4 ta variant (bitta to'g'ri va boshqa so'zlardan olingan chalg'ituvchi variantlar).
   - **Ketma-ket 2 ta test bajarilmasa Pauza bo'lishi:** Foydalanuvchi ketma-ket 2 ta savolga 15 soniya ichida javob bermasa, test avtomatik ravishda **PAUZA** holatiga o'tadi va davom ettirish tugmasi (`▶️ Davom ettirish`) taqdim etiladi.
   - Bir nechta yo'nalishlar (Eng ➡️ Uzb, Uzb ➡️ Eng, Aralash).
   - Test yakunida ballar, to'g'ri/noto'g'ri javoblar va foiz ko'rsatkichli hisobot.

5. **🗂 Foydalanuvchi statistikasi (My Progress):**
   - Jami o'rganilgan noyob so'zlar soni (dublikatlarsiz).
   - O'zlashtirilgan («Bilaman») va takrorlash kerak bo'lgan so'zlar.
   - Topshirilgan testlar soni, eng yuqori ball va o'rtacha natija.
   - Oxirgi testlar tarixi.

6. **⚙️ Xavfsiz Admin Panel:**
   - Bot egasi Telegram ID raqami bo'yicha server tomonida to'liq tekshiriladi (`isAdmin`).
   - Soxta ID yoki tugma ko'rinishiga tayanilmaydi.
   - Umumiy bot statistikasi (foydalanuvchilar, savatlar, so'zlar, testlar).

---

## 📁 Loyiha tuzilmasi

```
.
├── tgcloud/                    # Serverless platformaga yuklanadigan kodlar
│   ├── schema.js               # SQLite ma'lumotlar bazasi jadvallari
│   ├── handlers/               # Telegram Update handlerlari
│   │   ├── message.js          # Yangi xabarlar va buyruqlar (/start, /help, /admin)
│   │   ├── callback_query.js   # Inline tugmalar bosilgandagi harakatlar
│   │   ├── poll.js             # Poll yopilgandagi (15s timeout) hodisalar
│   │   └── poll_answer.js      # Foydalanuvchi quizga javob berganidagi hodisalar
│   └── lib/                    # Yordamchi modullar va biznes mantiq
│       ├── admin.js            # Admin huquqlarini tekshirish
│       ├── baskets.js          # Savatlar CRUD va kaskadli o'chirish
│       ├── config.js           # Konfiguratsiya (Admin ID, timeoutlar)
│       ├── flashcards.js       # Flashcard darslik mantig'i
│       ├── keyboards.js        # Telegram klaviaturalari (Inline va Reply)
│       ├── messages.js         # O'zbek tilidagi xabar shablonlari
│       ├── progress.js         # Foydalanuvchi statistikasi va hisob-kitoblari
│       ├── sessions.js         # Serverless seanslar holati (sessions)
│       ├── tests.js            # Quiz savollar generatsiyasi, scoring, pauza
│       ├── utils.js            # HTML escape, progress bar, shuffle
│       └── vocabulary.js       # So'zlar CRUD, qidiruv va bulk parser
├── test/                       # Node.js native unit testlari (45 ta test)
│   ├── admin.test.js
│   ├── baskets.test.js
│   ├── flashcards.test.js
│   ├── handlers.test.js
│   ├── progress.test.js
│   ├── tests.test.js
│   └── vocabulary.test.js
├── docs/                       # Telegram Serverless SDK hujjatlari
├── tgcloud.jsonc               # tgcloud konfiguratsiyasi
├── package.json
└── README.md
```

---

## 🛠 Talablar (Prerequisites)

- **Node.js**: versiya 18 yoki undan yuqori
- **Telegram akkaunt** va **@BotFather**

---

## 🚀 Ishga tushirish va Deploy qilish qo'llanmasi

### 1-qadam: Bot yaratish va Serverlessni yoqish

1. Telegramda [@BotFather](https://t.me/BotFather) botiga kiring.
2. `/newbot` buyrug'i orqali yangi bot yarating.
3. Bot yaratilgach, `@BotFather`da bot sozlamalariga kiring:
   - **Bot Settings** yoki botingiz menyusi ➡️ **Serverless** bo'limiga o'ting.
   - **Serverless** funksiyasini yoqing (**Turn On**).
4. **Serverless** ➡️ **CLI Access** ➡️ **Access token** tugmasini bosing va CLI tokeningizni oling (Token ko'rinishi: `app<id>:<secret>`).

### 2-qadam: Admin Telegram ID raqamini aniqlash

O'zingizning shaxsiy Telegram raqamingizni aniqlang:
- Telegramda [@userinfobot](https://t.me/userinfobot) botiga `/start` yuborsangiz, sizga `Id` raqamingizni beradi (masalan: `123456789`).

Ushbu ID raqamni quyidagi ikki usuldan birida o'rnating:
1. `tgcloud/lib/config.js` faylidagi `ADMIN_IDS` ga qo'shing.
2. Yoki `.env` faylida:
   ```bash
   ADMIN_TELEGRAM_ID=123456789
   ```

### 3-qadam: Bog'lash va Tizimga kirish (`login`)

Terminalda loyiha papkasida quyidagi buyruqni ishga tushiring:
```bash
npx tgcloud login
```
Sizdan `@BotFather`dan olgan CLI Access tokeningizni kiritish so'raladi. Token muvaffaqiyatli saqlangach, loyiha bot bilan bog'lanadi.

### 4-qadam: Kodlarni Serverlessga yuklash (`push`)

O'zgarishlar holatini tekshirish uchun:
```bash
npm run status
# yoki: npx tgcloud status
```

Barcha modullarni bulutga yuklash uchun:
```bash
npm run deploy
# yoki: npx tgcloud push
```
`push` barcha handlerlar, kutubxonalar va schemani bitta atomik operatsiyada Telegram serveriga yuklaydi va webhookni avtomatik sozlaydi.

### 5-qadam: Ma'lumotlar bazasini initsializatsiya qilish (`migrate`)

Schema jadvallarini (`baskets`, `vocabulary`, `user_progress`, `test_attempts`, `test_answers`, `user_sessions`, `active_polls`) yaratish uchun:
```bash
npm run migrate
# yoki: npx tgcloud migrate
```
CLI barcha yangi jadvallarni ko'rsatadi va sizdan tasdiqlashni so'raydi. Tasdiqlaganingizdan so'ng bazada jadvallar yaratiladi.

**Tabriklaymiz!** Botingiz to'liq ishga tushdi. Telegramda botingizga `/start` yuborib tekshirishingiz mumkin.

---

## 🧪 Mahalliy testlarni ishga tushirish

Loyiha barcha asosiy biznes mantiqlar, ruxsatlar, test savollari generatsiyasi, timeoutlar va kaskadli o'chirishlarni qamrab oluvchi to'liq unit testlar to'plamiga ega.

Testlarni ishga tushirish uchun:
```bash
npm test
```
*(45 ta test muvaffaqiyatli o'tishi kerak)*.

---

## 💡 Ommaviy so'z yuklash (Bulk Import) formati

Admin panelda savat ichidagi «📥 Ommaviy yuklash» tugmasini bosib, quyidagi formatlarda bir nechta so'zlarni bitta xabarda yuborish mumkin:

**Format 1 (To'liq):**
```text
overcome | yengib o'tmoq | to deal with a problem | She overcame difficulties
achieve | erishmoq | to reach a goal | He achieved success
```

**Format 2 (Soddalashtirilgan):**
```text
apple - olma
book - kitob
water - suv
```

---

## ⚠️ Telegram Serverless o'ziga xosliklari va cheklovlari

1. **V8 Isolate muhiti:**
   - Serverless har bir yangilanish (update) uchun yengil V8 izolyatsiyasida ishlaydi.
   - Global xotira (in-memory) o'zgaruvchilari har so'rovda saqlanib qolmaydi. Shu sababli barcha seanslar holati `user_sessions` jadvalida saqlanadi.
2. **Foreign Keys (Tashqi kalitlar):**
   - Telegram Serverless SQLite bazasida `PRAGMA foreign_keys` o'chirilgan bo'ladi. Shu sababli `.references()` ishlatilmaydi; kaskadli o'chirish va yaxlitlik ilova kodi darajasida (`deleteBasketCascade`) ta'minlanadi.
3. **Telegram Quiz Poll:**
   - Foydalanuvchi javobini aniqlash uchun quiz anonim bo'lmasligi shart (`is_anonymous: false`).
   - Telegram Poll minimal vaqti 5 soniya, maksimal 600 soniya. Loyihada foydalanuvchi talabiga ko'ra **15 soniya** (`open_period: 15`) o'rnatilgan.
4. **Deploy va Migrate alohida:**
   - `tgcloud push` faqat kodlarni yuklaydi, bazaga teginmaydi. Bazadagi jadvallar o'zgarishini qo'llash uchun doimo `tgcloud migrate` ishga tushiriladi.

---

## ❓ Muammolarni bartaraf etish (Troubleshooting)

- **`Unauthorized admin access`:**
  - O'z Telegram ID raqamingizni `tgcloud/lib/config.js` yoki `.env`dagi `ADMIN_TELEGRAM_ID`ga to'g'ri kiritganingizni tekshiring.
- **Webhook ishlamay qolsa:**
  - `npx tgcloud webhook` orqali webhook holatini tekshiring. Agar sinxron bo'lmasa, `npx tgcloud webhook sync` buyrug'ini bering.
- **`Token invalid or expired`:**
  - `@BotFather` ➡️ your bot ➡️ Serverless ➡️ CLI Access orqali yangi token oling va `npx tgcloud login` qiling.
