// bot.js — VizaAI Telegram bot (to'liq menyuli versiya)
// O'rnatish: npm install node-telegram-bot-api @anthropic-ai/sdk dotenv
// .env: TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=sk-ant-... ADMIN_CHAT_ID=...
// Ishga tushirish: node bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const SITE_URL = 'https://vizaai.uz';

// ---------------------------------------------------------------
// TIL (uz / ru) — har bir foydalanuvchi uchun tanlangan til
// ---------------------------------------------------------------
const userLang = new Map(); // chatId -> 'uz' | 'ru'
function getLang(chatId) { return userLang.get(chatId) || 'uz'; }

const T = {
  uz: {
    welcome: "Assalomu alaykum! VizaAI botiga xush kelibsiz 👋\n\nBu yerda viza imkoniyatingizni tekshirasiz, davlat bo'yicha hujjatlarni olasiz, hujjat fotosini AI bilan tahlil qilasiz, safarni rejalashtirasiz va video darslik yoki tur paketini tanlaysiz.\n\nBoshlash uchun kerakli tugmani bosing:",
    menu_chance: "🧠 Viza imkoniyati testi",
    menu_services: "🗂️ Viza xizmatlari",
    menu_docs: "📸 Hujjatni AI tekshirish",
    menu_courses: "🎓 Video darsliklar",
    menu_tours: "✈️ Tur paketlar",
    menu_ai: "🤖 AI yordamchi",
    menu_other: "🚩 Boshqa imkoniyatlar",
    menu_lang: "🌐 Til / Язык",
    back: "⬅️ Orqaga",
    ask_ai_prompt: "Savolingizni yozing — AI javob beradi.",
    services_head: "Qaysi viza turi kerak?",
    doc_prompt: "Hujjat (pasport, bank hujjati va h.k.) fotosini shu yerga yuboring — AI sifat va turini tekshirib beradi.\n\n⚠️ Demo tekshiruv: matn/sana chuqur tahlili emas, faqat texnik sifat baholanadi.",
    courses_head: "Qaysi davlat kursi kerak? Narxni bosing:",
    tours_head: "Qaysi yo'nalish tur paketi kerak?",
    other_head: "Boshqa imkoniyatlar:",
    ref_program: "🎁 Do'stni taklif qilish",
    partner_program: "🤝 Hamkor bo'lish",
    lang_set: "Til o'zbekchaga o'zgartirildi ✅",
  },
  ru: {
    welcome: "Здравствуйте! Добро пожаловать в бот VizaAI 👋\n\nЗдесь вы можете проверить свои визовые шансы, получить документы по стране, проанализировать фото документа через AI, спланировать поездку и выбрать видеокурс или турпакет.\n\nНажмите нужную кнопку, чтобы начать:",
    menu_chance: "🧠 Тест визовых шансов",
    menu_services: "🗂️ Визовые услуги",
    menu_docs: "📸 Проверка документа AI",
    menu_courses: "🎓 Видеокурсы",
    menu_tours: "✈️ Турпакеты",
    menu_ai: "🤖 AI-помощник",
    menu_other: "🚩 Другие возможности",
    menu_lang: "🌐 Til / Язык",
    back: "⬅️ Назад",
    ask_ai_prompt: "Напишите ваш вопрос — AI ответит.",
    services_head: "Какая виза вам нужна?",
    doc_prompt: "Отправьте фото документа (паспорт, банковский документ и т.д.) — AI проверит качество и тип.\n\n⚠️ Демо-проверка: без глубокого анализа текста/дат, только техническое качество.",
    courses_head: "Какой курс по стране нужен? Нажмите цену:",
    tours_head: "Какое направление турпакета интересует?",
    other_head: "Другие возможности:",
    ref_program: "🎁 Пригласить друга",
    partner_program: "🤝 Стать партнёром",
    lang_set: "Язык изменён на русский ✅",
  },
};

// ---------------------------------------------------------------
// SAYTDAGI HAQIQIY MA'LUMOTLAR (index.html bilan bir xil manba)
// ---------------------------------------------------------------
const COUNTRIES = [
  { key:"japan", flag:"🇯🇵", name:"Yaponiya", items:[
    ["Anketa","Visa application form to'ldiriladi"],
    ["Pasport","Kamida 6 oy amal qilishi kerak"],
    ["ID karta","Ikkala tomoni skanerlanadi"],
    ["Foto 3x4","Oq fonda, so'nggi 6 oylik"],
    ["Aviabilet bron","Bordi-keldi bron"],
    ["Hotel bron","Butun sayohat davri uchun"],
    ["Sug'urta","Xalqaro sayohat sug'urtasi"],
    ["Bank spravka","6 oylik karta aylanmasi"],
    ["Sayohat rejasi","Kunlik marshrut"],
  ]},
  { key:"schengen", flag:"🇪🇺", name:"Shengen", items:[
    ["Pasport","Kamida 3 oy amal qilishi kerak"],
    ["Anketa, foto va yig'im","VIDEX shakli, foto, konsullik yig'imi"],
    ["Moliyaviy hujjatlar","Bank hisob ko'chirmasi"],
    ["Ish/o'qish holati","Ish yoki o'qish joyidan spravka"],
    ["Aviabilet va turar joy","Bron nusxalari"],
    ["Tibbiy sug'urta","Kamida €30 000 qamrovli"],
    ["Sayohat maqsadi","Turizm/qarindosh/biznes hujjati"],
    ["Qo'shimcha hujjatlar","Eski pasport, nikoh va h.k."],
    ["Voyaga yetmaganlar uchun","Agar kerak bo'lsa"],
  ]},
  { key:"usa", flag:"🇺🇸", name:"AQSH", items:[
    ["Pasport","Amaldagi va eski pasportlar"],
    ["DS-160 tasdiqnomasi","Shtrix-kodli sahifa"],
    ["Sobesedovaniya bron","Elchixona uchrashuvi"],
    ["Konsullik yig'imi","MRV to'lov kvitansiyasi"],
    ["Foto 5x5 sm","Zaxira fotosurat"],
    ["Bank hisob ko'chirmasi","So'nggi 3-6 oylik"],
    ["Ish/o'qish ma'lumotnomasi","Bandlik holatini tasdiqlash"],
    ["Mulk va oila hujjatlari","Qo'shimcha bog'liqlik dalili"],
    ["Sayohat rejasi","Taxminiy marshrut"],
  ]},
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya", items:[
    ["Pasport hujjatlari","Xalqaro pasport, ID karta"],
    ["Bank kartalari aylanmasi","12 va 4 oylik spravkalar"],
    ["Ish va daromad ma'lumotlari","mygov.uz, soliq.uz"],
    ["Biznes hujjatlari","Ish beruvchi tomonidan"],
    ["Mulk va aktivlar","Ko'chmas mulk, avtomobil"],
    ["Manzil va sayohat tarixi","mygov.uz orqali"],
    ["Oila hujjatlari","Kerak bo'lganda taqdim etiladi"],
    ["Sayohat hujjatlari","Reja, sug'urta, bilet, bron"],
  ]},
  { key:"brazil", flag:"🇧🇷", name:"Braziliya", items:[
    ["Pasport","Kamida 6 oy amal qilishi kerak"],
    ["Anketa va foto","E-konsullik portali orqali"],
    ["Uchrashuv tasdiqnomasi","Konsullikka yozilish"],
    ["Moliyaviy hujjatlar","3 oylik bank ko'chirmasi"],
    ["Ish/tadbirkorlik holati","NOC, payslip yoki biznes hujjat"],
    ["Aviabilet va turar joy","Bron nusxalari"],
    ["Sayohat sug'urtasi","Majburiy hujjat"],
    ["Sayohat rejasi va cover letter","Maqsad va marshrut"],
    ["Qo'shimcha hujjatlar","Holatga qarab talab qilinadi"],
  ]},
];

const WORK_CHECKLIST = [
  ["Pasport hujjatlari","Xalqaro pasport, ID karta"],
  ["Bank kartalari aylanmasi","12 va 4 oylik spravkalar"],
  ["Ish va daromad ma'lumotlari","mygov.uz, soliq.uz orqali"],
  ["Biznes hujjatlari","Ish beruvchi tomonidan taqdim etiladi"],
  ["Mulk va aktivlar","Ko'chmas mulk, avtomobil guvohnomasi"],
  ["Manzil va sayohat tarixi","mygov.uz orqali tasdiqlanadi"],
  ["Oila hujjatlari","Kerak bo'lganda taqdim etiladi"],
  ["Sayohat hujjatlari","Reja, sug'urta, bilet, bron"],
];

const STUDENT_CHECKLIST = [
  ["Pasport va ID","Xalqaro pasport, ID karta"],
  ["Bank kartalari aylanmasi","Shaxsiy hisob ko'chirmasi"],
  ["O'qish hujjatlari","Study certificate, no objection certificate"],
  ["Homiyning hujjatlari","Pasport, ish, daromad, bank aylanmasi, mulk"],
  ["Qo'llab-quvvatlash xati","Homiy tomonidan yozilgan xat"],
  ["Sayohat hujjatlari","Reja, aviabilet, mehmonxona bron"],
  ["Tibbiy sug'urta","Butun o'qish davri uchun"],
  ["Ota-ona roziligi","18 yoshgacha bo'lganlar uchun (notarial)"],
  ["Oila hujjatlari","Nikoh/farzand guvohnomasi (agar kerak bo'lsa)"],
];

const WORK_COUNTRIES = [
  { key:"bulgaria", flag:"🇧🇬", name:"Bolgariya" },
  { key:"turkey", flag:"🇹🇷", name:"Turkiya" },
  { key:"latvia", flag:"🇱🇻", name:"Latviya" },
  { key:"germany", flag:"🇩🇪", name:"Germaniya" },
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya" },
  { key:"poland", flag:"🇵🇱", name:"Polsha" },
  { key:"slovakia", flag:"🇸🇰", name:"Slovakiya" },
  { key:"korea", flag:"🇰🇷", name:"Janubiy Koreya" },
];

const STUDENT_COUNTRIES = [
  { key:"korea", flag:"🇰🇷", name:"Janubiy Koreya" },
  { key:"turkey", flag:"🇹🇷", name:"Turkiya" },
  { key:"germany", flag:"🇩🇪", name:"Germaniya" },
  { key:"spain", flag:"🇪🇸", name:"Ispaniya" },
  { key:"lithuania", flag:"🇱🇹", name:"Litva" },
  { key:"latvia", flag:"🇱🇻", name:"Latviya" },
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya" },
  { key:"usa", flag:"🇺🇸", name:"AQSH" },
  { key:"canada", flag:"🇨🇦", name:"Kanada" },
  { key:"australia", flag:"🇦🇺", name:"Avstraliya" },
  { key:"malaysia", flag:"🇲🇾", name:"Malayziya" },
  { key:"china", flag:"🇨🇳", name:"Xitoy" },
];

const FAQ_DATA = [
  ["VizaAI orqali viza olish kafolatlanadimi?", "Yo'q — hech qanday xizmat yoki agentlik vizani 100% kafolatlay olmaydi, yakuniy qarorni faqat konsullik yoki elchixona qabul qiladi. VizaAI hujjatlaringizni to'g'ri va to'liq tayyorlashda yordam berib, rad javobi ehtimolini kamaytiradi."],
  ["Bepul va pullik xizmatlar orasidagi farq nima?", "Checklist, AI chat va ariza tayyorligini tekshirish har doim bepul. Video darslik va mutaxassis bilan shaxsiy konsultatsiya — pullik, chuqurroq va shaxsiylashtirilgan yordam beradi."],
  ["Xizmat qancha vaqt oladi?", "Checklist va AI yordamchidan darhol foydalanishingiz mumkin. Premium konsultatsiya odatda so'rovdan keyin 1 ish kuni ichida boshlanadi."],
  ["Hujjatlarim xavfsizmi?", "Ha. Hujjatlaringiz faqat sizning arizangizni tayyorlashda ishlatiladi va roziligingizsiz uchinchi shaxslarga berilmaydi."],
  ["Qaysi davlatlar bilan ishlaysiz?", "Yaponiya, Shengen, AQSH, Buyuk Britaniya va Braziliya uchun to'liq tayyor yo'riqnomalar bor. Boshqa istalgan davlat bo'yicha AI yordamchi orqali maslahat olishingiz mumkin."],
  ["To'lovni qanday amalga oshiraman?", "Pullik xizmatlar (video darslik, premium konsultatsiya) uchun to'lov usullari tez orada e'lon qilinadi."],
];

// ---------------------------------------------------------------
// KURS KANALLARI (video darsliklar) — to'lovdan keyin shu havolalar yuboriladi
// ---------------------------------------------------------------
const COURSE_CHANNELS = {
  kurs_shengen:    { name: 'Shengen vizasi: to‘liq kurs',       price: '199 000 so‘m', link: 'HAVOLA_BU_YERGA_SHENGEN' },
  kurs_yaponiya:   { name: 'Yaponiya turistik vizasi',          price: '149 000 so‘m', link: 'HAVOLA_BU_YERGA_YAPONIYA' },
  kurs_aqsh:       { name: 'AQSH B1/B2: anketa va suhbat',      price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_AQSH' },
  kurs_uk:         { name: 'Buyuk Britaniya visitor vizasi',    price: '199 000 so‘m', link: 'HAVOLA_BU_YERGA_UK' },
  kurs_talaba:     { name: 'Talaba vizasi: qabuldan vizagacha', price: '159 000 so‘m', link: 'HAVOLA_BU_YERGA_TALABA' },
  kurs_ishchi:     { name: 'Ishchi vizaga tayyorgarlik',        price: '169 000 so‘m', link: 'HAVOLA_BU_YERGA_ISHCHI' },
  kurs_hongkong:   { name: 'Hong Kong vizasi',                  price: '59 000 so‘m',  link: 'HAVOLA_BU_YERGA_HONGKONG' },
  kurs_avstraliya: { name: 'Avstraliya visitor vizasi',         price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_AVSTRALIYA' },
  kurs_kanada:     { name: 'Kanada visitor vizasi',             price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_KANADA' },
  kurs_barchasi:   { name: 'Barcha video darsliklar paketi',    price: '999 000 so‘m', link: 'HAVOLA_BU_YERGA_BARCHASI' },
};

const TOUR_PACKAGES = {
  tur_turkiya: { name: 'Turkiya turi',  price: '599$' },
  tur_vetnam:  { name: 'Vyetnam turi',  price: '699$' },
  tur_europa:  { name: 'Yevropa turi',  price: '1799$' },
  tur_yaponiya:{ name: 'Yaponiya turi', price: '1250$' },
};

const SYSTEM_PROMPT = `Siz VizaAI — viza va sayohat tayyorgarligi bo'yicha Telegram yordamchisiz.
Foydalanuvchining tili: {{LANG}}. Shu tilda, qisqa (3-5 gap) va aniq javob bering.
Viza kafolatlanishi haqida hech qachon va'da bermang — yakuniy qaror doim konsullik/elchixonaga
tegishli ekanini eslatib turing. Agar savol viza/sayohat/hujjatlarga aloqasi bo'lmasa,
muloyimlik bilan mavzuga qaytaring.`;

const pendingPurchases = new Map(); // chatId -> { kind:'course'|'tour', key, name, userLabel }
const conversations = new Map();
const waitingForAiQuestion = new Set(); // chatId lar, "AI yordamchi" bosib, savol yozishni kutayotgan
const waitingForDoc = new Set(); // chatId lar, hujjat fotosini kutayotgan

// ---------------------------------------------------------------
// ASOSIY MENYU
// ---------------------------------------------------------------
function mainMenuKeyboard(chatId) {
  const t = T[getLang(chatId)];
  return {
    inline_keyboard: [
      [{ text: t.menu_chance, callback_data: 'chance' }],
      [{ text: t.menu_services, callback_data: 'services' }, { text: t.menu_docs, callback_data: 'docs' }],
      [{ text: t.menu_courses, callback_data: 'courses' }, { text: t.menu_tours, callback_data: 'tours' }],
      [{ text: t.menu_ai, callback_data: 'ai' }, { text: t.menu_other, callback_data: 'other' }],
      [{ text: t.menu_lang, callback_data: 'lang' }],
    ],
  };
}

function backButton(chatId) {
  const t = T[getLang(chatId)];
  return { inline_keyboard: [[{ text: t.back, callback_data: 'menu' }]] };
}

function sendMainMenu(chatId) {
  const t = T[getLang(chatId)];
  bot.sendMessage(chatId, t.welcome, { reply_markup: mainMenuKeyboard(chatId) });
}

// ---------------------------------------------------------------
// /start
// ---------------------------------------------------------------
bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id));

// ---------------------------------------------------------------
// TUGMA BOSILGANDA (callback_query)
// ---------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const t = T[getLang(chatId)];
  bot.answerCallbackQuery(query.id).catch(() => {});

  // ---- Asosiy menyuga qaytish ----
  if (data === 'menu') {
    return sendMainMenu(chatId);
  }

  // ---- Til almashtirish ----
  if (data === 'lang') {
    return bot.sendMessage(chatId, 'Tilni tanlang / Выберите язык:', {
      reply_markup: { inline_keyboard: [[
        { text: '🇺🇿 O\'zbekcha', callback_data: 'setlang_uz' },
        { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
      ]]},
    });
  }
  if (data === 'setlang_uz' || data === 'setlang_ru') {
    const lang = data === 'setlang_uz' ? 'uz' : 'ru';
    userLang.set(chatId, lang);
    await bot.sendMessage(chatId, T[lang].lang_set);
    return sendMainMenu(chatId);
  }

  // ---- Viza imkoniyati testi ----
  if (data === 'chance') {
    return bot.sendMessage(chatId,
      `🧠 Viza imkoniyati testini saytimizda to'liq (20+ savolli) shaklda topshirishingiz mumkin:\n${SITE_URL}#smartLab\n\nYoki shu yerda AI yordamchiga qisqacha holatingizni yozib bering — dastlabki tahlil beraman.`,
      { reply_markup: backButton(chatId) }
    );
  }

  // ---- Viza xizmatlari (sayt tab'lariga yo'naltirish + ichki navigatsiya) ----
  if (data === 'services') {
    return bot.sendMessage(chatId, t.services_head, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✈️ Sayohat viza', callback_data: 'svc_travel' }],
          [{ text: '💼 Ishchi viza', callback_data: 'svc_work' }],
          [{ text: '🎓 Student', callback_data: 'svc_student' }],
          [{ text: '❓ FAQ', callback_data: 'svc_faq' }],
          [{ text: t.back, callback_data: 'menu' }],
        ],
      },
    });
  }

  // ---- Sayohat viza: mamlakat tanlash ----
  if (data === 'svc_travel') {
    const rows = COUNTRIES.map(c => ([{ text: `${c.flag} ${c.name}`, callback_data: `chk_travel_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, 'Qaysi mamlakat uchun hujjatlar kerak?', { reply_markup: { inline_keyboard: rows } });
  }

  // ---- Ishchi viza: mamlakat tanlash ----
  if (data === 'svc_work') {
    const rows = WORK_COUNTRIES.map(c => ([{ text: `${c.flag} ${c.name}`, callback_data: `chk_work_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, 'Qaysi davlatga ishga borasiz?', { reply_markup: { inline_keyboard: rows } });
  }

  // ---- Student: mamlakat tanlash ----
  if (data === 'svc_student') {
    const rows = STUDENT_COUNTRIES.map(c => ([{ text: `${c.flag} ${c.name}`, callback_data: `chk_student_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, 'Qaysi davlatga o\'qishga borasiz?', { reply_markup: { inline_keyboard: rows } });
  }

  // ---- Checklist ko'rsatish (sayohat/ishchi/student) ----
  if (data.startsWith('chk_travel_')) {
    const key = data.replace('chk_travel_', '');
    const country = COUNTRIES.find(c => c.key === key);
    if (!country) return;
    const list = country.items.map((it, i) => `${i + 1}. *${it[0]}* — ${it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${country.flag} *${country.name}* — kerakli hujjatlar:\n\n${list}`,
      { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }
  if (data.startsWith('chk_work_')) {
    const key = data.replace('chk_work_', '');
    const country = WORK_COUNTRIES.find(c => c.key === key);
    if (!country) return;
    const list = WORK_CHECKLIST.map((it, i) => `${i + 1}. *${it[0]}* — ${it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${country.flag} *${country.name}* (ishchi viza) — kerakli hujjatlar:\n\n${list}`,
      { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }
  if (data.startsWith('chk_student_')) {
    const key = data.replace('chk_student_', '');
    const country = STUDENT_COUNTRIES.find(c => c.key === key);
    if (!country) return;
    const list = STUDENT_CHECKLIST.map((it, i) => `${i + 1}. *${it[0]}* — ${it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${country.flag} *${country.name}* (talaba vizasi) — kerakli hujjatlar:\n\n${list}`,
      { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }

  // ---- FAQ ro'yxati ----
  if (data === 'svc_faq') {
    const rows = FAQ_DATA.map((f, i) => ([{ text: f[0], callback_data: `faq_${i}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, 'Savolni tanlang:', { reply_markup: { inline_keyboard: rows } });
  }
  if (data.startsWith('faq_')) {
    const idx = +data.replace('faq_', '');
    const item = FAQ_DATA[idx];
    if (!item) return;
    return bot.sendMessage(chatId, `❓ *${item[0]}*\n\n${item[1]}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t.back, callback_data: 'svc_faq' }]] } });
  }

  // ---- Hujjatni AI tekshirish ----
  if (data === 'docs') {
    waitingForDoc.add(chatId);
    return bot.sendMessage(chatId, t.doc_prompt, { reply_markup: backButton(chatId) });
  }

  // ---- Video darsliklar ro'yxati ----
  if (data === 'courses') {
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => (
      [{ text: `${c.name} — ${c.price}`, callback_data: `buy_course_${key}` }]
    ));
    rows.push([{ text: t.back, callback_data: 'menu' }]);
    return bot.sendMessage(chatId, t.courses_head, { reply_markup: { inline_keyboard: rows } });
  }

  // ---- Tur paketlar ro'yxati ----
  if (data === 'tours') {
    const rows = Object.entries(TOUR_PACKAGES).map(([key, c]) => (
      [{ text: `${c.name} — ${c.price}`, callback_data: `buy_tour_${key}` }]
    ));
    rows.push([{ text: t.back, callback_data: 'menu' }]);
    return bot.sendMessage(chatId, t.tours_head, { reply_markup: { inline_keyboard: rows } });
  }

  // ---- Kurs sotib olish bosilganda ----
  if (data.startsWith('buy_course_')) {
    const key = data.replace('buy_course_', '');
    const course = COURSE_CHANNELS[key];
    if (!course) return;
    const userLabel = `${query.from.first_name || ''} (@${query.from.username || 'username yo\'q'}, ID: ${chatId})`;
    pendingPurchases.set(String(chatId), { kind: 'course', key, name: course.name, userLabel });

    await bot.sendMessage(chatId,
      `Xaridni tanladingiz: "${course.name}" — ${course.price} 🎬\n\nTo'lov qilish uchun rekvizitlarga o'ting va skrinshotni shu yerga yuboring. Tasdiqlangach, kurs kanaliga havola yuboriladi.\n\n💳 Karta: XXXX XXXX XXXX XXXX\n👤 Qabul qiluvchi: F.I.Sh`
    );
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID,
        `💰 Yangi kurs xaridi!\n\nKurs: ${course.name} (${course.price})\nXaridor: ${userLabel}\n\nTo'lov tekshirilgach:\n/tasdiqla ${chatId}`
      );
    }
    return;
  }

  // ---- Tur sotib olish bosilganda ----
  if (data.startsWith('buy_tour_')) {
    const key = data.replace('buy_tour_', '');
    const tour = TOUR_PACKAGES[key];
    if (!tour) return;
    const userLabel = `${query.from.first_name || ''} (@${query.from.username || 'username yo\'q'}, ID: ${chatId})`;
    pendingPurchases.set(String(chatId), { kind: 'tour', key, name: tour.name, userLabel });

    await bot.sendMessage(chatId,
      `"${tour.name}" — ${tour.price} 🧳\n\nSo'rovingiz qabul qilindi! Tur agentligi hamkorimiz siz bilan tez orada bog'lanadi.`
    );
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `🧳 Yangi tur so'rovi!\n\nTur: ${tour.name} (${tour.price})\nMijoz: ${userLabel}`);
    }
    return;
  }

  // ---- AI yordamchi ----
  if (data === 'ai') {
    waitingForAiQuestion.add(chatId);
    return bot.sendMessage(chatId, t.ask_ai_prompt, { reply_markup: backButton(chatId) });
  }

  // ---- Boshqa imkoniyatlar ----
  if (data === 'other') {
    return bot.sendMessage(chatId, t.other_head, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.ref_program, url: `${SITE_URL}#cta` }],
          [{ text: t.partner_program, url: `${SITE_URL}#cta` }],
          [{ text: t.back, callback_data: 'menu' }],
        ],
      },
    });
  }
});

// ---------------------------------------------------------------
// ADMIN: to'lovni tasdiqlash — /tasdiqla <chat_id>
// ---------------------------------------------------------------
bot.onText(/\/tasdiqla (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_CHAT_ID)) return;

  const targetId = match[1].trim();
  const purchase = pendingPurchases.get(targetId);
  if (!purchase) {
    return bot.sendMessage(chatId, 'Bu chat_id kutilayotgan xaridlar ro\'yxatida topilmadi.');
  }

  if (purchase.kind === 'course') {
    const course = COURSE_CHANNELS[purchase.key];
    await bot.sendMessage(targetId,
      `✅ To'lovingiz tasdiqlandi!\n\n"${course.name}" kursi kanaliga qo'shiling:\n${course.link}\n\nXaridingiz uchun rahmat! 🎉`
    );
  } else {
    await bot.sendMessage(targetId, `✅ "${purchase.name}" bo'yicha to'lovingiz tasdiqlandi! Tez orada operator bog'lanadi.`);
  }
  await bot.sendMessage(chatId, `Yuborildi: ${purchase.userLabel}`);
  pendingPurchases.delete(targetId);
});

// ---------------------------------------------------------------
// ODDIY XABARLAR: hujjat fotosi, AI savol, saytdan lid
// ---------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (text.startsWith('/')) return; // buyruqlar yuqorida ishlanadi

  const userLabel = `${msg.from.first_name || ''} (@${msg.from.username || 'username yo\'q'}, ID: ${chatId})`;

  // ---- Hujjat fotosi kutilmoqda ----
  if (msg.photo && waitingForDoc.has(chatId)) {
    waitingForDoc.delete(chatId);
    const sizeKb = Math.round((msg.photo[msg.photo.length - 1].file_size || 0) / 1024);
    const quality = sizeKb > 80 && sizeKb < 8000 ? 'yaxshi ✅' : sizeKb <= 80 ? 'past (juda kichik fayl) ⚠️' : 'juda katta ⚠️';
    return bot.sendMessage(chatId,
      `📸 Fayl qabul qilindi (${sizeKb} KB).\nTexnik sifat: ${quality}\n\n⚠️ Bu demo tekshiruv — matn, sana va ma'lumotlarning chuqur tahlili uchun to'liq AI-server integratsiyasi kerak bo'ladi.`,
      { reply_markup: backButton(chatId) }
    );
  }

  // ---- Saytdan kelgan lid xabari ----
  if (text.startsWith('🆕 Yangi lid')) {
    await bot.sendMessage(chatId, '✅ So\'rovingiz qabul qilindi! Tez orada operatorlarimiz siz bilan bog\'lanadi.');
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `📩 Yangi lid keldi:\n\n${text}\n\n👤 Yuboruvchi: ${userLabel}`);
    }
    return;
  }

  // ---- AI yordamchi kutilayotgan savol yoki umumiy matn ----
  if (text) {
    try {
      await bot.sendChatAction(chatId, 'typing');
      const lang = getLang(chatId);
      const history = conversations.get(chatId) || [];
      history.push({ role: 'user', content: text });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT.replace('{{LANG}}', lang === 'ru' ? 'ruscha' : 'o\'zbekcha'),
        messages: history,
      });

      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      history.push({ role: 'assistant', content: reply });
      conversations.set(chatId, history.slice(-10));
      waitingForAiQuestion.delete(chatId);

      await bot.sendMessage(chatId, reply, { reply_markup: backButton(chatId) });
    } catch (err) {
      console.error('AI xatosi:', err);
      await bot.sendMessage(chatId, 'Kechirasiz, hozir javob berolmayapman. Birozdan keyin qayta urinib ko\'ring.');
    }
  }
});

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

console.log('VizaAI bot (menyuli versiya) ishga tushdi ✅');
