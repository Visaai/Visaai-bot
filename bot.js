// bot.js — VizaAI Telegram bot (yakuniy versiya)
// - Bir ekran (edit-in-place) navigatsiya: eski menyular "uchib ketadi"
// - Kengaytirilgan viza imkoniyati testi (12 savol)
// - Chuqurlashtirilgan AI hujjat tahlili
// - Kurslarni faol reklama qilish (start + AI javoblarida)
// - To'liq UZ/RU
//
// O'rnatish: npm install node-telegram-bot-api @anthropic-ai/sdk dotenv
// .env: TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=sk-ant-... ADMIN_CHAT_ID=...
// Talab: Node.js 18+ (global fetch kerak)
// Ishga tushirish: node bot.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https'); // Node.js o'zida mavjud — hech qanday o'rnatish shart emas
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

// Har safar yangi bot.js olganingizda, shu sanani /version orqali tekshiring —
// agar eski sana ko'rinsa, demak Render hali eng so'nggi kodni yuklamagan.
const BOT_VERSION = '2026-07-23-v9 (media_type tuzatish + til tanlash + stateless hujjat tahlili)';
const botStartedAt = new Date().toLocaleString('uz-UZ');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Bir nechta admin — .env faylida vergul bilan ajratib yoziladi:
// ADMIN_CHAT_IDS=111111111,222222222,333333333
// (Eski ADMIN_CHAT_ID ham ishlaydi — orqaga moslik uchun)
//
// Bundan tashqari, quyidagi ro'yxatga ID'larni to'g'ridan-to'g'ri shu yerga
// (kodga) qo'shish ham mumkin — Render sozlamalariga tegishning hojati yo'q,
// shunchaki shu faylni GitHub'ga qayta yuklasangiz yetarli.
const HARD_CODED_ADMIN_IDS = [
  '1053467069', // so'ralgan admin
];

const ADMIN_CHAT_IDS = Array.from(new Set([
  ...(process.env.ADMIN_CHAT_IDS || process.env.ADMIN_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean),
  ...HARD_CODED_ADMIN_IDS,
]));
const ADMIN_CHAT_ID = ADMIN_CHAT_IDS[0] || null; // ba'zi eski kod joylarida hali ishlatiladi

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}
function notifyAdmins(text) {
  ADMIN_CHAT_IDS.forEach(id => {
    bot.sendMessage(id, text).catch(() => {});
  });
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const SITE_URL = 'https://vizaai.uz';
const PAYMENT_CARD_NUMBER = '9860 1766 1886 7038'; // A.Sobirov
const PAYMENT_CARD_HOLDER = 'A.Sobirov';
const ADMIN_CONTACT_USERNAME = '@A_Sobirov39';
// Telegram Markdown rejimida "_" belgisi qiya shrift (italic) belgisi hisoblanadi —
// juft bo'lmasa butun xabarni buzadi. Shu sabab, Markdown ishlatiladigan joylarda
// escaped (qochirilgan) versiyasidan foydalanamiz.
const ADMIN_CONTACT_USERNAME_MD = ADMIN_CONTACT_USERNAME.replace(/_/g, '\\_');

// ---------------------------------------------------------------
// FOYDALANUVCHILAR BAZASI
// Asosiy: JSON fayl (tezkor, lekin Render qayta deploy qilganda o'chib ketishi mumkin).
// Qo'shimcha: agar MONGODB_URI muhit o'zgaruvchisi sozlangan bo'lsa, MongoDB
// orqali HAQIQIY DOIMIY saqlanadi — redeploy qilinsa ham ma'lumot yo'qolmaydi.
// MONGODB_URI yo'q bo'lsa, bot avvalgidek fayl orqali ishlayveradi (ogohlantirish bilan).
// ---------------------------------------------------------------
const DB_FILE = path.join(__dirname, 'users_data.json');
const MONGODB_URI = process.env.MONGODB_URI || '';
let mongoCollection = null;

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}
function saveDB() {
  // 1) Fayl orqali — tezkor, zaxira sifatida
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(usersDB, null, 2));
  } catch (e) {
    console.error("Baza saqlashda xato (fayl):", e.message);
  }
  // 2) MongoDB orqali — haqiqiy doimiy saqlash (agar sozlangan bo'lsa)
  if (mongoCollection) {
    const ops = Object.entries(usersDB).map(([chatId, data]) => ({
      updateOne: { filter: { _id: chatId }, update: { $set: data }, upsert: true },
    }));
    if (ops.length) {
      mongoCollection.bulkWrite(ops).catch(e => console.error('MongoDB saqlashda xato:', e.message));
    }
  }
}
let usersDB = loadDB(); // { [chatId]: { name, username, phone, joinedAt, promoCode, referredBy, purchases:[], callNote } }

async function initMongoDB() {
  if (!MONGODB_URI) {
    console.log("⚠️ MONGODB_URI sozlanmagan — bot faqat fayl orqali ishlaydi (redeploy'da ma'lumot yo'qolishi mumkin).");
    return;
  }
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('vizaai');
    mongoCollection = db.collection('users');
    const allUsers = await mongoCollection.find({}).toArray();
    allUsers.forEach(doc => {
      const { _id, ...userData } = doc;
      if (!usersDB[_id]) usersDB[_id] = userData; // MongoDB ustuvor, lekin faylda yo'q bo'lsa qo'shamiz
    });
    console.log(`✅ MongoDB'ga ulandi — ${allUsers.length} ta foydalanuvchi yuklandi. Ma'lumotlar endi redeploy'da yo'qolmaydi.`);
    saveDB(); // birlashtirilgan holatni darhol saqlaymiz
  } catch (e) {
    console.error('❌ MongoDB ulanishda xato:', e.message);
  }
}
initMongoDB();

function getUser(chatId) {
  const key = String(chatId);
  if (!usersDB[key]) {
    usersDB[key] = {
      name: '', username: '', phone: '', joinedAt: new Date().toISOString(),
      promoCode: 'VIZA' + key.slice(-5), referredBy: null, purchases: [], callNote: '',
      interestedIn: '', chanceScorePct: null, docChecksCount: 0,
    };
    saveDB();
  }
  return usersDB[key];
}
function isRegistered(chatId) {
  const u = usersDB[String(chatId)];
  return !!(u && u.phone);
}
function findUserByPromoCode(code) {
  const norm = (code || '').trim().toUpperCase();
  return Object.entries(usersDB).find(([, u]) => u.promoCode === norm);
}

// ---------------------------------------------------------------
// ADMIN PROFIL KARTOCHKASI — har bir muhim bosqichda (test tugagach,
// xarid qilganda/qilmaganda) sizga qisqa, tuzilgan xulosa keladi.
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// FAYLNI YUKLAB OLISH — Node.js o'zining "https" moduli orqali
// (tashqi kutubxonaga bog'liq emas, hech qachon "topilmadi" xatosi
// bo'lmaydi — bu oldingi fetch/node-fetch muammosini butunlay yechadi)
// ---------------------------------------------------------------
// Anthropic API faqat aniq shu 4 ta media_type qiymatini qabul qiladi.
// Telegram/server ba'zan "image/jpeg; charset=binary" kabi qo'shimcha
// matn bilan qaytarishi mumkin — buni tozalab, xavfsiz standart qiymatga
// (image/jpeg) tushiramiz agar tanib bo'lmasa.
const ALLOWED_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function sanitizeImageMediaType(raw) {
  const base = (raw || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_IMAGE_MEDIA_TYPES.includes(base)) return base;
  if (base === 'image/jpg') return 'image/jpeg'; // keng tarqalgan noto'g'ri yozilish
  return 'image/jpeg'; // xavfsiz standart — Telegram fotolari deyarli doim JPEG
}

function downloadFileAsBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Juda ko\'p qayta yo\'naltirish (redirect)'));
    https.get(url, (res) => {
      // Ba'zi serverlar faylni qayta yo'naltirishi mumkin — buni ham qo'llab-quvvatlaymiz
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFileAsBuffer(res.headers.location, redirectCount + 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Fayl yuklab olinmadi (HTTP ${res.statusCode})`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/jpeg',
      }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function sendAdminProfileCard(chatId, event) {
  if (ADMIN_CHAT_IDS.length === 0) return;
  const u = usersDB[String(chatId)];
  if (!u) return;

  const lastPurchase = u.purchases[u.purchases.length - 1];
  const purchaseLine = lastPurchase
    ? (lastPurchase.status === 'confirmed' ? `✅ Sotib oldi — ${lastPurchase.name}` : `⏳ Qiziqdi, lekin hali to'lamadi — ${lastPurchase.name}`)
    : '❌ Hali hech narsa sotib olmadi';

  const chanceLine = u.chanceScorePct !== null ? `${u.chanceScorePct}%` : "o'tmagan";
  const phoneDisplay = u.phone || "❗️ RO'YXATDAN O'TMAGAN";

  const card =
`📱📱📱 ${phoneDisplay} 📱📱📱

👤 Foydalanuvchi-${chatId} — ${u.name || ''}
📌 Hodisa: ${event}

🌍 Qiziqqan yo'nalish: ${u.interestedIn || 'hali aniqlanmagan'}
🧠 Viza AI tahlili: ${chanceLine}
📸 Hujjat tekshiruvi: ${u.docChecksCount} marta
🎬 Kurs holati: ${purchaseLine}
🎁 Promo: ${u.referredBy ? `kiritgan (${u.referredBy})` : "kiritmagan"}

☎️ Qo'ng'iroqdan keyin izoh: /izoh_${chatId} <matn>`;

  notifyAdmins(card);
}


// ---------------------------------------------------------------
// TIL (uz / ru)
// ---------------------------------------------------------------
const userLang = new Map();
function getLang(chatId) { return userLang.get(chatId) || 'uz'; }

const T = {
  uz: {
    welcome: "Assalomu alaykum! VizaAI botiga xush kelibsiz 👋\n\nBu AI botda siz nimalar qila olasiz:\n\n✅ Viza olish imkoniyatingizni AI orqali aniqlash\n✅ Hujjatlaringizni AI yordamida tekshirish\n✅ Har bir davlat uchun kerakli hujjatlar ro'yxatini topish\n✅ Sayohatda foydali bo'ladigan barcha lifehacklarni olish\n\n🔥 SUPER TAKLIF: 999 000 so'mga — barcha viza kurslari + sayohatda arzon qiladigan lifehacklar to'plami!\n\nBoshlash uchun kerakli tugmani bosing:",
    menu_chance: "🧠 Viza imkoniyati testi",
    menu_services: "🗂️ Viza xizmatlari",
    menu_docs: "📸 Hujjatni AI tekshirish",
    menu_courses: "🎓 Video darsliklar",
    menu_tours: "✈️ Tur paketlar",
    menu_ai: "🤖 AI yordamchi",
    menu_other: "🚩 Boshqa imkoniyatlar",
    menu_admin: "☎️ Admin bilan bog'lanish",
    menu_lang: "🌐 Til / Язык",
    menu_featured: "🔥 Super taklif (-61%)",
    back: "⬅️ Orqaga",
    to_menu: "🏠 Bosh menyu",
    ask_ai_prompt: "Savolingizni yozing — AI javob beradi.",
    services_head: "Qaysi viza turi kerak?",
    svc_travel_head: "Qaysi mamlakat uchun hujjatlar kerak?",
    svc_work_head: "Qaysi davlatga ishga borasiz?",
    svc_student_head: "Qaysi davlatga o'qishga borasiz?",
    faq_head: "Savolni tanlang:",
    doc_prompt: "Hujjat (pasport, bank hujjati, anketa va h.k.) fotosini shu yerga yuboring — AI batafsil tahlil qiladi: turi, sifati, muammolari va tavsiyalar bilan.\n\n⚠️ Bu AI tahlili — rasmiy tekshiruv emas.",
    doc_analyzing: "🔎 Hujjat batafsil tahlil qilinmoqda...",
    courses_head: "Qaysi davlat kursi kerak? Narxni bosing:",
    tours_head: "Qaysi yo'nalish tur paketi kerak?",
    other_head: "Boshqa imkoniyatlar:",
    ref_program: "🎁 Do'stni taklif qilish",
    partner_program: "🤝 Hamkor bo'lish",
    lang_set: "Til o'zbekchaga o'zgartirildi ✅",
    purchase_thanks: "Xaridni tanladingiz",
    purchase_pay: "To'lov qilish uchun quyidagi rekvizitlardan foydalaning.",
    card_label: "Karta",
    fullname_label: "F.I.Sh",
    payment_confirmed: "✅ To'lovingiz tasdiqlandi!",
    join_channel: "kursi uchun admin sizni tez orada kanalga qo'shadi",
    thanks: "Xaridingiz uchun rahmat! 🎉",
    payment_confirmed_tour: "bo'yicha to'lovingiz tasdiqlandi! Tez orada operator bog'lanadi.",
    tour_request_ok: "So'rovingiz qabul qilindi! Tur agentligi hamkorimiz siz bilan tez orada bog'lanadi.",
    lead_ok: "✅ So'rovingiz qabul qilindi! Tez orada operatorlarimiz siz bilan bog'lanadi.",
    ai_error: "Kechirasiz, hozir javob berolmayapman. Birozdan keyin qayta urinib ko'ring.",
    chance_start: "Viza imkoniyati testini boshlaymiz — savollarga tugma orqali javob bering.",
    chance_result_head: "PROFIL MOSLIGI",
    chance_disclaimer: "⚠️ Bu ball viza berilish kafolati emas. Yakuniy qarorni konsullik yoki elchixona qabul qiladi.",
    chance_cta: "\n\n💡 Profilingizni kuchaytirish uchun mos video kursimiz bor — \"Video darsliklar\" bo'limini ko'ring!",
  },
  ru: {
    welcome: "Здравствуйте! Добро пожаловать в бот VizaAI 👋\n\nЧто вы можете делать в этом AI-боте:\n\n✅ Узнать свои шансы на визу через AI\n✅ Проверить документы с помощью AI\n✅ Найти список нужных документов по каждой стране\n✅ Получить все полезные лайфхаки для путешествий\n\n🔥 СУПЕР-ПРЕДЛОЖЕНИЕ: за 999 000 сум — все визовые курсы + сборник лайфхаков для экономии в путешествиях!\n\nНажмите нужную кнопку, чтобы начать:",
    menu_chance: "🧠 Тест визовых шансов",
    menu_services: "🗂️ Визовые услуги",
    menu_docs: "📸 Проверка документа AI",
    menu_courses: "🎓 Видеокурсы",
    menu_tours: "✈️ Турпакеты",
    menu_ai: "🤖 AI-помощник",
    menu_other: "🚩 Другие возможности",
    menu_admin: "☎️ Связаться с админом",
    menu_lang: "🌐 Til / Язык",
    menu_featured: "🔥 Супер-предложение (-61%)",
    back: "⬅️ Назад",
    to_menu: "🏠 Главное меню",
    ask_ai_prompt: "Напишите ваш вопрос — AI ответит.",
    services_head: "Какая виза вам нужна?",
    svc_travel_head: "Для какой страны нужны документы?",
    svc_work_head: "В какую страну едете работать?",
    svc_student_head: "В какую страну едете учиться?",
    faq_head: "Выберите вопрос:",
    doc_prompt: "Отправьте фото документа (паспорт, банковский документ, анкета и т.д.) — AI подробно проанализирует: тип, качество, проблемы и рекомендации.\n\n⚠️ Это AI-анализ — не официальная проверка.",
    doc_analyzing: "🔎 Документ подробно анализируется...",
    courses_head: "Какой курс по стране нужен? Нажмите цену:",
    tours_head: "Какое направление турпакета интересует?",
    other_head: "Другие возможности:",
    ref_program: "🎁 Пригласить друга",
    partner_program: "🤝 Стать партнёром",
    lang_set: "Язык изменён на русский ✅",
    purchase_thanks: "Вы выбрали покупку",
    purchase_pay: "Для оплаты используйте реквизиты ниже.",
    card_label: "Карта",
    fullname_label: "Ф.И.О",
    payment_confirmed: "✅ Ваша оплата подтверждена!",
    join_channel: "— админ скоро добавит вас в канал курса",
    thanks: "Спасибо за покупку! 🎉",
    payment_confirmed_tour: "оплата подтверждена! Скоро с вами свяжется оператор.",
    tour_request_ok: "Заявка принята! Наш партнёр-турагентство скоро свяжется с вами.",
    lead_ok: "✅ Заявка принята! Скоро наши операторы свяжутся с вами.",
    ai_error: "Извините, сейчас не могу ответить. Попробуйте немного позже.",
    chance_start: "Начинаем тест визовых шансов — отвечайте кнопками.",
    chance_result_head: "СООТВЕТСТВИЕ ПРОФИЛЯ",
    chance_disclaimer: "⚠️ Этот балл не является гарантией визы. Окончательное решение принимает консульство или посольство.",
    chance_cta: "\n\n💡 Чтобы усилить профиль, у нас есть подходящий видеокурс — загляните в раздел \"Видеокурсы\"!",
  },
};

// ---------------------------------------------------------------
// SAYTDAGI HAQIQIY MA'LUMOTLAR
// ---------------------------------------------------------------
const COUNTRIES = [
  { key:"japan", flag:"🇯🇵", name:"Yaponiya", nameRu:"Япония", items:[
    ["Anketa","Анкета","Visa application form to'ldiriladi","Заполняется форма Visa application form"],
    ["Pasport","Паспорт","Kamida 6 oy amal qilishi kerak","Должен действовать минимум 6 месяцев"],
    ["ID karta","ID-карта","Ikkala tomoni skanerlanadi","Сканируются обе стороны"],
    ["Foto 3x4","Фото 3x4","Oq fonda, so'nggi 6 oylik","На белом фоне, не старше 6 месяцев"],
    ["Aviabilet bron","Бронь авиабилета","Bordi-keldi bron","Бронь в обе стороны"],
    ["Hotel bron","Бронь отеля","Butun sayohat davri uchun","На весь период поездки"],
    ["Sug'urta","Страховка","Xalqaro sayohat sug'urtasi","Международная туристическая страховка"],
    ["Bank spravka","Банковская справка","6 oylik karta aylanmasi","Оборот по карте за 6 месяцев"],
    ["Sayohat rejasi","План поездки","Kunlik marshrut","Ежедневный маршрут"],
  ]},
  { key:"schengen", flag:"🇪🇺", name:"Shengen", nameRu:"Шенген", items:[
    ["Pasport","Паспорт","Kamida 3 oy amal qilishi kerak","Должен действовать минимум 3 месяца"],
    ["Anketa, foto va yig'im","Анкета, фото и сбор","VIDEX shakli, foto, konsullik yig'imi","Форма VIDEX, фото, консульский сбор"],
    ["Moliyaviy hujjatlar","Финансовые документы","Bank hisob ko'chirmasi","Банковская выписка"],
    ["Ish/o'qish holati","Статус работы/учёбы","Ish yoki o'qish joyidan spravka","Справка с места работы или учёбы"],
    ["Aviabilet va turar joy","Авиабилет и проживание","Bron nusxalari","Копии брони"],
    ["Tibbiy sug'urta","Медицинская страховка","Kamida €30 000 qamrovli","Покрытие не менее €30 000"],
    ["Sayohat maqsadi","Цель поездки","Turizm/qarindosh/biznes hujjati","Документ о туризме/родственниках/бизнесе"],
    ["Qo'shimcha hujjatlar","Дополнительные документы","Eski pasport, nikoh va h.k.","Старый паспорт, свидетельство о браке и т.д."],
    ["Voyaga yetmaganlar uchun","Для несовершеннолетних","Agar kerak bo'lsa","Если требуется"],
  ]},
  { key:"usa", flag:"🇺🇸", name:"AQSH", nameRu:"США", items:[
    ["Pasport","Паспорт","Amaldagi va eski pasportlar","Действующий и старые паспорта"],
    ["DS-160 tasdiqnomasi","Подтверждение DS-160","Shtrix-kodli sahifa","Страница со штрихкодом"],
    ["Sobesedovaniya bron","Запись на собеседование","Elchixona uchrashuvi","Встреча в посольстве"],
    ["Konsullik yig'imi","Консульский сбор","MRV to'lov kvitansiyasi","Квитанция об оплате MRV"],
    ["Foto 5x5 sm","Фото 5x5 см","Zaxira fotosurat","Запасная фотография"],
    ["Bank hisob ko'chirmasi","Банковская выписка","So'nggi 3-6 oylik","За последние 3–6 месяцев"],
    ["Ish/o'qish ma'lumotnomasi","Справка о работе/учёбе","Bandlik holatini tasdiqlash","Подтверждение занятости"],
    ["Mulk va oila hujjatlari","Документы об имуществе и семье","Qo'shimcha bog'liqlik dalili","Дополнительное доказательство связей"],
    ["Sayohat rejasi","План поездки","Taxminiy marshrut","Примерный маршрут"],
  ]},
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya", nameRu:"Великобритания", items:[
    ["Pasport hujjatlari","Паспортные документы","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
    ["Bank kartalari aylanmasi","Оборот по банковским картам","12 va 4 oylik spravkalar","Справки за 12 и 4 месяца"],
    ["Ish va daromad ma'lumotlari","Данные о работе и доходе","mygov.uz, soliq.uz","Через mygov.uz, soliq.uz"],
    ["Biznes hujjatlari","Бизнес-документы","Ish beruvchi tomonidan","Со стороны работодателя"],
    ["Mulk va aktivlar","Имущество и активы","Ko'chmas mulk, avtomobil","Недвижимость, автомобиль"],
    ["Manzil va sayohat tarixi","Адрес и история поездок","mygov.uz orqali","Через mygov.uz"],
    ["Oila hujjatlari","Семейные документы","Kerak bo'lganda taqdim etiladi","Предоставляется при необходимости"],
    ["Sayohat hujjatlari","Документы поездки","Reja, sug'urta, bilet, bron","План, страховка, билет, бронь"],
  ]},
  { key:"brazil", flag:"🇧🇷", name:"Braziliya", nameRu:"Бразилия", items:[
    ["Pasport","Паспорт","Kamida 6 oy amal qilishi kerak","Должен действовать минимум 6 месяцев"],
    ["Anketa va foto","Анкета и фото","E-konsullik portali orqali","Через портал электронного консульства"],
    ["Uchrashuv tasdiqnomasi","Подтверждение записи","Konsullikka yozilish","Запись в консульство"],
    ["Moliyaviy hujjatlar","Финансовые документы","3 oylik bank ko'chirmasi","Банковская выписка за 3 месяца"],
    ["Ish/tadbirkorlik holati","Статус работы/бизнеса","NOC, payslip yoki biznes hujjat","NOC, расчётный лист или бизнес-документ"],
    ["Aviabilet va turar joy","Авиабилет и проживание","Bron nusxalari","Копии брони"],
    ["Sayohat sug'urtasi","Туристическая страховка","Majburiy hujjat","Обязательный документ"],
    ["Sayohat rejasi va cover letter","План поездки и cover letter","Maqsad va marshrut","Цель и маршрут"],
    ["Qo'shimcha hujjatlar","Дополнительные документы","Holatga qarab talab qilinadi","Требуется в зависимости от ситуации"],
  ]},
];

const WORK_CHECKLIST = [
  ["Pasport hujjatlari","Паспортные документы","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
  ["Bank kartalari aylanmasi","Оборот по банковским картам","12 va 4 oylik spravkalar","Справки за 12 и 4 месяца"],
  ["Ish va daromad ma'lumotlari","Данные о работе и доходе","mygov.uz, soliq.uz orqali","Через mygov.uz, soliq.uz"],
  ["Biznes hujjatlari","Бизнес-документы","Ish beruvchi tomonidan taqdim etiladi","Предоставляется работодателем"],
  ["Mulk va aktivlar","Имущество и активы","Ko'chmas mulk, avtomobil guvohnomasi","Недвижимость, свидетельство на авто"],
  ["Manzil va sayohat tarixi","Адрес и история поездок","mygov.uz orqali tasdiqlanadi","Подтверждается через mygov.uz"],
  ["Oila hujjatlari","Семейные документы","Kerak bo'lganda taqdim etiladi","Предоставляется при необходимости"],
  ["Sayohat hujjatlari","Документы поездки","Reja, sug'urta, bilet, bron","План, страховка, билет, бронь"],
];

const STUDENT_CHECKLIST = [
  ["Pasport va ID","Паспорт и ID","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
  ["Bank kartalari aylanmasi","Оборот по банковским картам","Shaxsiy hisob ko'chirmasi","Личная банковская выписка"],
  ["O'qish hujjatlari","Документы об учёбе","Study certificate, no objection certificate","Study certificate, no objection certificate"],
  ["Homiyning hujjatlari","Документы спонсора","Pasport, ish, daromad, bank aylanmasi, mulk","Паспорт, работа, доход, оборот, имущество"],
  ["Qo'llab-quvvatlash xati","Письмо поддержки","Homiy tomonidan yozilgan xat","Письмо от спонсора"],
  ["Sayohat hujjatlari","Документы поездки","Reja, aviabilet, mehmonxona bron","План, авиабилет, бронь отеля"],
  ["Tibbiy sug'urta","Медицинская страховка","Butun o'qish davri uchun","На весь период учёбы"],
  ["Ota-ona roziligi","Согласие родителей","18 yoshgacha bo'lganlar uchun (notarial)","Для лиц до 18 лет (нотариально)"],
  ["Oila hujjatlari","Семейные документы","Nikoh/farzand guvohnomasi (agar kerak bo'lsa)","Свидетельство о браке/рождении (если нужно)"],
];

const WORK_COUNTRIES = [
  { key:"bulgaria", flag:"🇧🇬", name:"Bolgariya", nameRu:"Болгария" },
  { key:"turkey", flag:"🇹🇷", name:"Turkiya", nameRu:"Турция" },
  { key:"latvia", flag:"🇱🇻", name:"Latviya", nameRu:"Латвия" },
  { key:"germany", flag:"🇩🇪", name:"Germaniya", nameRu:"Германия" },
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya", nameRu:"Великобритания" },
  { key:"poland", flag:"🇵🇱", name:"Polsha", nameRu:"Польша" },
  { key:"slovakia", flag:"🇸🇰", name:"Slovakiya", nameRu:"Словакия" },
  { key:"korea", flag:"🇰🇷", name:"Janubiy Koreya", nameRu:"Южная Корея" },
];

const STUDENT_COUNTRIES = [
  { key:"korea", flag:"🇰🇷", name:"Janubiy Koreya", nameRu:"Южная Корея" },
  { key:"turkey", flag:"🇹🇷", name:"Turkiya", nameRu:"Турция" },
  { key:"germany", flag:"🇩🇪", name:"Germaniya", nameRu:"Германия" },
  { key:"spain", flag:"🇪🇸", name:"Ispaniya", nameRu:"Испания" },
  { key:"lithuania", flag:"🇱🇹", name:"Litva", nameRu:"Литва" },
  { key:"latvia", flag:"🇱🇻", name:"Latviya", nameRu:"Латвия" },
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya", nameRu:"Великобритания" },
  { key:"usa", flag:"🇺🇸", name:"AQSH", nameRu:"США" },
  { key:"canada", flag:"🇨🇦", name:"Kanada", nameRu:"Канада" },
  { key:"australia", flag:"🇦🇺", name:"Avstraliya", nameRu:"Австралия" },
  { key:"malaysia", flag:"🇲🇾", name:"Malayziya", nameRu:"Малайзия" },
  { key:"china", flag:"🇨🇳", name:"Xitoy", nameRu:"Китай" },
];

const FAQ_DATA = [
  ["VizaAI orqali viza olish kafolatlanadimi?", "Yo'q — hech qanday xizmat yoki agentlik vizani 100% kafolatlay olmaydi, yakuniy qarorni faqat konsullik yoki elchixona qabul qiladi. VizaAI hujjatlaringizni to'g'ri va to'liq tayyorlashda yordam berib, rad javobi ehtimolini kamaytiradi.",
   "Гарантируется ли получение визы через VizaAI?", "Нет — ни один сервис или агентство не может гарантировать визу на 100%, окончательное решение принимает только консульство или посольство. VizaAI помогает правильно и полно подготовить документы, снижая вероятность отказа."],
  ["Bepul va pullik xizmatlar orasidagi farq nima?", "Checklist, AI chat va ariza tayyorligini tekshirish har doim bepul. Video darslik va mutaxassis bilan shaxsiy konsultatsiya — pullik, chuqurroq va shaxsiylashtirilgan yordam beradi.",
   "В чём разница между бесплатными и платными услугами?", "Чек-лист, AI-чат и проверка готовности заявки всегда бесплатны. Видеокурсы и личная консультация со специалистом — платные, дают более глубокую и персональную помощь."],
  ["Xizmat qancha vaqt oladi?", "Checklist va AI yordamchidan darhol foydalanishingiz mumkin. Premium konsultatsiya odatda so'rovdan keyin 1 ish kuni ichida boshlanadi.",
   "Сколько времени занимает услуга?", "Чек-листом и AI-помощником можно пользоваться сразу. Премиум-консультация обычно начинается в течение 1 рабочего дня после заявки."],
  ["Hujjatlarim xavfsizmi?", "Ha. Hujjatlaringiz faqat sizning arizangizni tayyorlashda ishlatiladi va roziligingizsiz uchinchi shaxslarga berilmaydi.",
   "Безопасны ли мои документы?", "Да. Ваши документы используются только для подготовки вашей заявки и не передаются третьим лицам без вашего согласия."],
  ["To'lovni qanday amalga oshiraman?", "Kursni tanlaganingizdan so'ng, to'lov rekvizitlari (karta raqami) yuboriladi. To'lovdan so'ng, chek skrinshotini to'g'ridan-to'g'ri adminga yuborasiz — u sizni kurs kanaliga qo'shadi.",
   "Как произвести оплату?", "После выбора курса вам придут реквизиты для оплаты (номер карты). После оплаты отправьте скриншот чека напрямую администратору — он добавит вас в канал курса."],
  ["Qaysi davlatlar bilan ishlaysiz?", "Ispaniya, Fransiya, Germaniya, Kombo (Litva/Belgiya/Avstriya/Bolgariya/Lyuksemburg/Niderlandiya), Yaponiya, AQSH, Buyuk Britaniya, Hong Kong, Avstraliya va Kanada uchun to'liq tayyor kurslar bor. Boshqa istalgan davlat bo'yicha AI yordamchi orqali maslahat olishingiz mumkin.",
   "С какими странами вы работаете?", "Есть готовые курсы по Испании, Франции, Германии, Комбо (Литва/Бельгия/Австрия/Болгария/Люксембург/Нидерланды), Японии, США, Великобритании, Гонконгу, Австралии и Канаде. По любой другой стране можно получить совет через AI-помощника."],
  ["AI yordamchidan kuniga necha marta foydalansam bo'ladi?", "Bepul tarifda kuniga 5 ta savol berishingiz mumkin. Istalgan kursni sotib olgach, bu limit 25 tagacha oshadi.",
   "Сколько раз в день можно пользоваться AI-помощником?", "На бесплатном тарифе — 5 вопросов в день. После покупки любого курса лимит увеличивается до 25."],
  ["Promo kod nima uchun kerak?", "Ro'yxatdan o'tganingizda sizga shaxsiy promo kod beriladi. Do'stingizga bering — u kursni sotib olganda ikkalangiz ham chegirma olasiz. Promo kodingizni \"Boshqa imkoniyatlar\" bo'limidan ko'rishingiz mumkin.",
   "Зачем нужен промокод?", "При регистрации вам выдаётся личный промокод. Поделитесь им с другом — при покупке курса вы оба получите скидку. Свой промокод можно посмотреть в разделе \"Другие возможности\"."],
];

const SINGLE_COURSE_DESC = {
  uz: "🎬 Video darslik + hujjatlarni aynan qayerdan, qanday olish sirlari (bosqichma-bosqich)",
  ru: "🎬 Видеоурок + секреты, где и как именно получить каждый документ (пошагово)",
};

const COURSE_CHANNELS = {
  kurs_ispaniya:   { name: 'Ispaniya vizasi: to‘liq kurs',       nameRu: 'Виза Испании: полный курс',       price: '249 000 so‘m', link: 'HAVOLA_BU_YERGA_ISPANIYA' },
  kurs_france:     { name: 'Fransiya vizasi: to‘liq kurs',       nameRu: 'Виза Франции: полный курс',       price: '249 000 so‘m', link: 'HAVOLA_BU_YERGA_FRANCE' },
  kurs_germany:    { name: 'Germaniya vizasi: to‘liq kurs',      nameRu: 'Виза Германии: полный курс',      price: '249 000 so‘m', link: 'HAVOLA_BU_YERGA_GERMANY' },
  kurs_combo:      { name: 'Kombo: Litva/Belgiya/Avstriya/Bolgariya/Lyuksemburg/Niderlandiya', nameRu: 'Комбо: Литва/Бельгия/Австрия/Болгария/Люксембург/Нидерланды', shortName: 'Kombo (Litva/Belgiya va h.k.)', shortNameRu: 'Комбо (Литва/Бельгия и др.)', price: '249 000 so‘m', link: 'HAVOLA_BU_YERGA_COMBO' },
  kurs_yaponiya:   { name: 'Yaponiya turistik vizasi',          nameRu: 'Туристическая виза Японии',       price: '199 000 so‘m', link: 'HAVOLA_BU_YERGA_YAPONIYA' },
  kurs_aqsh:       { name: 'AQSH B1/B2: anketa va suhbat',      nameRu: 'США B1/B2: анкета и собеседование', price: '349 000 so‘m', link: 'HAVOLA_BU_YERGA_AQSH' },
  kurs_uk:         { name: 'Buyuk Britaniya visitor vizasi',    nameRu: 'Виза посетителя Великобритании',  price: '249 000 so‘m', link: 'HAVOLA_BU_YERGA_UK' },
  kurs_hongkong:   { name: 'Hong Kong vizasi',                  nameRu: 'Виза Гонконга',                   price: '89 000 so‘m',  link: 'HAVOLA_BU_YERGA_HONGKONG' },
  kurs_avstraliya: { name: 'Avstraliya visitor vizasi',         nameRu: 'Виза посетителя Австралии',       price: '349 000 so‘m', link: 'HAVOLA_BU_YERGA_AVSTRALIYA' },
  kurs_kanada:     { name: 'Kanada visitor vizasi',             nameRu: 'Виза посетителя Канады',          price: '349 000 so‘m', link: 'HAVOLA_BU_YERGA_KANADA' },
  kurs_barchasi:   {
    name: 'Barcha video darsliklar paketi', nameRu: 'Пакет всех видеокурсов',
    price: '999 000 so‘m', link: 'HAVOLA_BU_YERGA_BARCHASI',
    desc: `Paketga kiradi:
🎓 12-15 davlat bo'yicha to'liq viza darsliklari
✈️ Eng arzon aviabilet olish sirlari
🏨 Arzon mehmonxona topish sirlari
📶 Arzon eSIM olish yo'llari
🚗 Arzon kruiz, rent car va transfer buyurtma qilish
💡 Sayohatda kerak bo'ladigan TOP 50 lifehack`,
    descRu: `В пакет входит:
🎓 Полные видеокурсы по 12-15 странам
✈️ Секреты самых дешёвых авиабилетов
🏨 Секреты поиска недорогих отелей
📶 Как получить дешёвый eSIM
🚗 Недорогой круиз, аренда авто и трансфер
💡 ТОП-50 лайфхаков для путешествий`,
  },
};

const TOUR_PACKAGES = {
  tur_turkiya:  { name: 'Turkiya turi',  nameRu: 'Тур в Турцию',   price: '599$' },
  tur_vetnam:   { name: 'Vyetnam turi',  nameRu: 'Тур во Вьетнам', price: '699$' },
  tur_europa:   { name: 'Yevropa turi',  nameRu: 'Тур в Европу',   price: '1799$' },
  tur_yaponiya: { name: 'Yaponiya turi', nameRu: 'Тур в Японию',   price: '1250$' },
};

// ---------------------------------------------------------------
// SAYOHAT BYUDJETI KALKULYATORI — taxminiy narxlar (aviabilet,
// mehmonxona/kecha, kunlik xarajat) — Toshkentdan boshlab hisoblangan
// ---------------------------------------------------------------
const BUDGET_COUNTRIES = [
  { key: 'spain',   flag: '🇪🇸', name: 'Ispaniya',   nameRu: 'Испания',   flight: 500, hotelPerNight: 45, dailyBudget: 35 },
  { key: 'france',  flag: '🇫🇷', name: 'Fransiya',   nameRu: 'Франция',   flight: 520, hotelPerNight: 55, dailyBudget: 40 },
  { key: 'germany', flag: '🇩🇪', name: 'Germaniya',  nameRu: 'Германия',  flight: 480, hotelPerNight: 50, dailyBudget: 38 },
  { key: 'japan',   flag: '🇯🇵', name: 'Yaponiya',   nameRu: 'Япония',    flight: 650, hotelPerNight: 60, dailyBudget: 45 },
  { key: 'usa',     flag: '🇺🇸', name: 'AQSH',       nameRu: 'США',       flight: 750, hotelPerNight: 70, dailyBudget: 50 },
  { key: 'uk',      flag: '🇬🇧', name: 'Buyuk Britaniya', nameRu: 'Великобритания', flight: 550, hotelPerNight: 65, dailyBudget: 45 },
  { key: 'hongkong',flag: '🇭🇰', name: 'Hong Kong',  nameRu: 'Гонконг',   flight: 480, hotelPerNight: 55, dailyBudget: 35 },
  { key: 'australia', flag: '🇦🇺', name: 'Avstraliya', nameRu: 'Австралия', flight: 900, hotelPerNight: 60, dailyBudget: 42 },
  { key: 'canada',  flag: '🇨🇦', name: 'Kanada',     nameRu: 'Канада',    flight: 800, hotelPerNight: 60, dailyBudget: 42 },
];

// ---------------------------------------------------------------
// AI SYSTEM PROMPT — kurslarni faol targ'ib qiluvchi
// ---------------------------------------------------------------
function buildSystemPrompt(lang, chatId) {
  const langName = lang === 'ru' ? 'ruscha (rus tilida)' : "o'zbekcha";
  const u = usersDB[String(chatId)];

  let historyBlock = '';
  if (u) {
    const parts = [];
    if (u.interestedIn) parts.push(`Qiziqqan yo'nalishi: ${u.interestedIn}`);
    if (u.chanceScorePct !== null && u.chanceScorePct !== undefined) parts.push(`Viza imkoniyati testi natijasi: ${u.chanceScorePct}%`);
    if (u.docHistory && u.docHistory.length) {
      const docsList = u.docHistory.map(d => d.type).join(', ');
      parts.push(`Ilgari yuborgan hujjatlari: ${docsList}`);
    }
    if (u.purchases && u.purchases.length) {
      const confirmed = u.purchases.filter(p => p.status === 'confirmed').map(p => p.name);
      if (confirmed.length) parts.push(`Sotib olgan kurslari: ${confirmed.join(', ')}`);
    }
    if (parts.length) {
      historyBlock = `\n\nMIJOZ HAQIDA MA'LUMOT (avvalgi muloqotdan, shuni hisobga olib javob bering, lekin qayta so'ramang):\n- ${parts.join('\n- ')}\n`;
    }
  }

  return `Siz VizaAI — viza va sayohat tayyorgarligi bo'yicha Telegram yordamchisiz. ${langName} tilda, qisqa (3-6 gap) va aniq javob bering.

VIZAAI HAQIDA:
- Bepul: hujjatlar checklisti, AI yordamchi (shu chat), viza imkoniyati testi.
- PULLIK VIDEO KURSLAR (bularni faol tavsiya qiling — bu bizning asosiy daromad manbai):
  Ispaniya (199 000), Fransiya (199 000), Germaniya (199 000), Kombo: Litva/Belgiya/Avstriya/Bolgariya/Lyuksemburg/Niderlandiya (199 000),
  Yaponiya (149 000), AQSH B1/B2 (299 000), Buyuk Britaniya (199 000),
  Hong Kong (59 000), Avstraliya (299 000), Kanada (299 000),
  yoki BARCHA KURSLAR PAKETI — 999 000 so'm (2 580 000 o'rniga, ~60% chegirma).
- Tur paketlar: Turkiya ($599), Vyetnam ($699), Yevropa ($1799), Yaponiya ($1250).
- Premium konsultatsiya — hamkor mutaxassis bilan shaxsiy maslahat.
${historyBlock}
MUHIM QOIDA — KURSLARNI REKLAMA QILISH:
Deyarli har bir javobingiz oxirida, mavzuga mos keladigan aniq video kursni **qisqa va tabiiy** tarzda eslatib o'ting.
Masalan: agar Shengen haqida so'ralsa — aniq qaysi davlat kerakligini so'rang yoki mos kursni ayting: Ispaniya/Fransiya/Germaniya (har biri 199 000 so'm) yoki Litva/Belgiya/Avstriya/Bolgariya/Lyuksemburg/Niderlandiya uchun Kombo kurs (199 000 so'm).
Agar umumiy savol bo'lsa — "Barcha kurslar paketini ko'rib chiqing — 999 000 so'mga 9 ta davlat kursi, 40% chegirma bilan."
Bu majburiy emas, lekin JUDA tavsiya etiladi — bizning maqsadimiz odamlarni kurslarga yo'naltirish.

QOIDALAR:
- Viza kafolatlanishi haqida HECH QACHON va'da bermang.
- Agar savol viza/sayohat/hujjatlarga aloqasi bo'lmasa, muloyimlik bilan mavzuga qaytaring.`;
}

// ---------------------------------------------------------------
// FOYDALANUVCHI HOLATI
// ---------------------------------------------------------------
const userState = new Map(); // chatId -> { mode, chanceStep, chanceScore, chanceAnswers, screenMsgId, pendingPayload, docCheckCountry, docCheckMatched }
function getState(chatId) {
  if (!userState.has(chatId)) userState.set(chatId, { mode: 'idle', chanceStep: 0, chanceScore: {}, chanceAnswers: {}, screenMsgId: null, pendingPayload: null, docCheckCountry: null, docCheckMatched: [] });
  return userState.get(chatId);
}
function clearPendingState(chatId) {
  const s = getState(chatId);
  s.mode = 'idle'; s.chanceStep = 0; s.chanceScore = {}; s.chanceAnswers = {};
  s.docCheckCountry = null; s.docCheckMatched = [];
  // pendingPayload ataylab tozalanmaydi — registratsiyadan keyin ishlatiladi,
  // handleStartPayload chaqirilgach qo'lda tozalanadi (kerak bo'lsa)
}

const conversations = new Map();
const pendingPurchases = new Map();

// ---------------------------------------------------------------
// BIR-EKRAN NAVIGATSIYA — eski menyu xabari tahrirlanadi (uchib ketadi)
// ---------------------------------------------------------------
async function renderScreen(chatId, text, keyboard, opts = {}) {
  const s = getState(chatId);
  const options = { reply_markup: keyboard, parse_mode: opts.parse_mode };

  if (s.screenMsgId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: s.screenMsgId, ...options });
      return;
    } catch (e) {
      // Tahrirlab bo'lmadi (masalan eski xabar o'chirilgan) — yangisini yuboramiz
    }
  }
  const sent = await bot.sendMessage(chatId, text, options);
  s.screenMsgId = sent.message_id;
}

// Kontent xabarlari (AI javobi, hujjat tahlili, xarid tasdig'i) — alohida, yangi
// xabar sifatida yuboriladi (bular "natija", navigatsiya emas), lekin keyingi
// navigatsiya ularni ham "orqaga" tugmasi bosilganda tozalaydi.
async function sendContent(chatId, text, opts = {}) {
  const sent = await bot.sendMessage(chatId, text, { parse_mode: opts.parse_mode, reply_markup: opts.reply_markup });
  return sent;
}

// ---------------------------------------------------------------
// VIZA IMKONIYATI TESTI — 12 ta savol, 4 toifa (site Smart Lab'ga mos)
// ---------------------------------------------------------------
const CHANCE_QUESTIONS = [
  // --- Maqsad ---
  { key:'purpose', q:{uz:"Safar maqsadingiz?", ru:"Цель поездки?"},
    options:[
      {uz:"Turistik",ru:"Туристическая",points:10},
      {uz:"Ishchi",ru:"Рабочая",points:8},
      {uz:"Talaba",ru:"Студенческая",points:8},
      {uz:"Biznes",ru:"Бизнес",points:9},
    ]},
  // --- Bandlik / barqarorlik ---
  { key:'employment', q:{uz:"Hozirgi bandlik holatingiz?", ru:"Ваш текущий статус занятости?"},
    options:[
      {uz:"Rasmiy ishlayman",ru:"Официально работаю",points:20},
      {uz:"Tadbirkorman",ru:"Предприниматель",points:18},
      {uz:"Talabaman",ru:"Студент",points:12},
      {uz:"Frilanser",ru:"Фрилансер",points:10},
      {uz:"Ishsizman",ru:"Безработный",points:5},
    ]},
  { key:'employmentDuration', q:{uz:"Hozirgi ish/o'qish joyingizda necha oydan beri siz?", ru:"Сколько месяцев вы на текущей работе/учёбе?"},
    options:[
      {uz:"6 oy yoki ko'proq",ru:"6 месяцев и более",points:15},
      {uz:"3–5 oy",ru:"3–5 месяцев",points:9},
      {uz:"1–2 oy",ru:"1–2 месяца",points:4},
    ]},
  // --- Moliya ---
  { key:'income', q:{uz:"Oylik rasmiy daromadingiz?", ru:"Ваш официальный ежемесячный доход?"},
    options:[
      {uz:"$2000 dan yuqori",ru:"Более $2000",points:25},
      {uz:"$1000–2000",ru:"$1000–2000",points:20},
      {uz:"$500–1000",ru:"$500–1000",points:12},
      {uz:"$500 dan kam",ru:"Менее $500",points:5},
    ]},
  { key:'bankTurnover', q:{uz:"Bank hisobingizdagi aylanma necha oylik?", ru:"За сколько месяцев оборот на вашем счёте?"},
    options:[
      {uz:"6 oy yoki ko'proq",ru:"6 месяцев и более",points:20},
      {uz:"3–5 oy",ru:"3–5 месяцев",points:14},
      {uz:"1–2 oy",ru:"1–2 месяца",points:7},
      {uz:"Aylanma yo'q",ru:"Оборота нет",points:0},
    ]},
  { key:'payer', q:{uz:"Safar xarajatini kim to'laydi?", ru:"Кто оплачивает поездку?"},
    options:[
      {uz:"O'zim",ru:"Сам",points:10},
      {uz:"Homiy",ru:"Спонсор",points:7},
      {uz:"Kompaniya",ru:"Компания",points:9},
    ]},
  // --- Oila / qaytish asoslari ---
  { key:'maritalStatus', q:{uz:"Oilaviy holatingiz?", ru:"Семейное положение?"},
    options:[
      {uz:"Turmush qurganman",ru:"Женат/замужем",points:10},
      {uz:"Turmush qurmaganman",ru:"Не женат/не замужем",points:6},
    ]},
  { key:'familyTravel', q:{uz:"Oilangiz siz bilan boradimi?", ru:"Едет ли семья с вами?"},
    options:[
      {uz:"Yo'q, O'zbekistonda qoladi",ru:"Нет, остаётся в Узбекистане",points:10},
      {uz:"Ha, birga boradi",ru:"Да, едет со мной",points:5},
    ]},
  { key:'assets', q:{uz:"Mulk yoki uzoq muddatli majburiyatingiz bormi (uy, biznes)?", ru:"Есть ли имущество или долгосрочные обязательства (дом, бизнес)?"},
    options:[
      {uz:"Ha, bor",ru:"Да, есть",points:15},
      {uz:"Qisman",ru:"Частично",points:8},
      {uz:"Yo'q",ru:"Нет",points:0},
    ]},
  // --- Safar tarixi ---
  { key:'travelRegion', q:{uz:"Ilgari qaysi mintaqaga sayohat qilgansiz?", ru:"В какой регион вы раньше путешествовали?"},
    options:[
      {uz:"Shengen (Yevropa)",ru:"Шенген (Европа)",points:20},
      {uz:"AQSH/UK/Kanada/Avstraliya",ru:"США/Великобритания/Канада/Австралия",points:18},
      {uz:"Yaqin davlatlar (Rossiya, Turkiya va h.k.)",ru:"Соседние страны (Россия, Турция и т.д.)",points:10},
      {uz:"Hech qayerga chiqmaganman",ru:"Никогда не выезжал(а)",points:3},
    ]},
  { key:'rejection', q:{uz:"Oldin viza rad javobi bo'lganmi?", ru:"Были ли раньше отказы в визе?"},
    options:[
      {uz:"Yo'q",ru:"Не было",points:10},
      {uz:"Bo'lgan, sababi bartaraf etilgan",ru:"Был, причина устранена",points:6},
      {uz:"Bo'lgan, hali ham dolzarb",ru:"Был, причина ещё актуальна",points:0},
    ]},
  // --- Qo'shimcha chuqurlik ---
  { key:'language', q:{uz:"Chet tilini bilish darajangiz?", ru:"Уровень владения иностранным языком?"},
    options:[
      {uz:"B1 va undan yuqori",ru:"B1 и выше",points:15},
      {uz:"A2",ru:"A2",points:9},
      {uz:"A1 yoki bilmayman",ru:"A1 или не знаю",points:3},
    ]},
  { key:'jobLevel', q:{uz:"Lavozimingiz qanday?", ru:"Какая у вас должность?"},
    options:[
      {uz:"Rahbar/yuqori lavozim",ru:"Руководитель/высокая должность",points:15},
      {uz:"O'rta bo'g'in menejer",ru:"Менеджер среднего звена",points:11},
      {uz:"Oddiy xodim",ru:"Рядовой сотрудник",points:7},
      {uz:"Ishim yo'q",ru:"Не работаю",points:0},
    ]},
  { key:'addressStability', q:{uz:"Necha yildan beri hozirgi manzilda yashaysiz?", ru:"Сколько лет вы живёте по текущему адресу?"},
    options:[
      {uz:"3 yildan ko'p",ru:"Более 3 лет",points:10},
      {uz:"1–3 yil",ru:"1–3 года",points:6},
      {uz:"1 yildan kam",ru:"Менее 1 года",points:2},
    ]},
];
const CHANCE_MAX_SCORE = CHANCE_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);

function chanceQuestionKeyboard(stepIdx, lang) {
  const step = CHANCE_QUESTIONS[stepIdx];
  const rows = step.options.map((o, i) => ([{ text: o[lang], callback_data: `chance_ans_${stepIdx}_${i}` }]));
  return { inline_keyboard: rows };
}
function chanceQuestionText(stepIdx, lang, chatId) {
  const step = CHANCE_QUESTIONS[stepIdx];
  const u = chatId ? usersDB[String(chatId)] : null;
  const name = u && u.name ? u.name : '';
  let prefix = '';
  if (name && stepIdx === 0) {
    prefix = lang === 'ru' ? `${name}, отлично! ` : `${name}, ajoyib! `;
  }
  return `${prefix}[${stepIdx + 1}/${CHANCE_QUESTIONS.length}] ${step.q[lang]}`;
}
const CHANCE_CATEGORIES = [
  { key: 'finance', keys: ['income', 'bankTurnover', 'payer'],
    label: { uz: "Moliyaviy holat", ru: "Финансовое положение" },
    tip: { uz: "Bank aylanmangizni va daromad hujjatlaringizni kuchaytiring", ru: "Усильте оборот по счёту и документы о доходах" } },
  { key: 'stability', keys: ['employment', 'employmentDuration', 'jobLevel', 'addressStability', 'language'],
    label: { uz: "Ish/turmush barqarorligi", ru: "Стабильность работы/жизни" },
    tip: { uz: "Uzoq muddatli ish joyi va manzil turg'unligini hujjat bilan ko'rsating", ru: "Подтвердите документами долгосрочную работу и стабильность проживания" } },
  { key: 'family', keys: ['maritalStatus', 'familyTravel', 'assets'],
    label: { uz: "Oila va qaytish asoslari", ru: "Семья и основания для возвращения" },
    tip: { uz: "Mulk yoki oilaviy bog'liqliklaringizni hujjat bilan tasdiqlang", ru: "Подтвердите документами имущество или семейные связи" } },
  { key: 'travelHistory', keys: ['travelRegion', 'rejection'],
    label: { uz: "Sayohat tarixi", ru: "История поездок" },
    tip: { uz: "Aniq va batafsil sayohat rejasi tayyorlang, bu tajriba yo'qligini qoplaydi", ru: "Подготовьте чёткий план поездки — это компенсирует отсутствие опыта" } },
];

function analyzeChanceCategories(chanceScore, lang) {
  const results = CHANCE_CATEGORIES.map(cat => {
    let earned = 0, max = 0;
    cat.keys.forEach(k => {
      const q = CHANCE_QUESTIONS.find(q => q.key === k);
      if (!q) return;
      earned += chanceScore[k] || 0;
      max += Math.max(...q.options.map(o => o.points));
    });
    return { ...cat, pct: max ? Math.round((earned / max) * 100) : 0 };
  });
  const sorted = [...results].sort((a, b) => b.pct - a.pct);
  const strong = sorted.slice(0, 2).filter(c => c.pct >= 60);
  const weak = [...sorted].reverse().slice(0, 2).filter(c => c.pct < 70);
  return { strong, weak };
}

// ---------------------------------------------------------------
// MAMLAKATLAR BO'YICHA ALOHIDA VIZA IMKONIYATI — har biri o'z
// qoidasiga ega (Hong Kong har doim 100%, Yaponiya ish bilan 95%,
// Shengen davlatlari safar tarixiga qarab farq qiladi va h.k.)
// ---------------------------------------------------------------
const COUNTRY_CHANCE_LIST = [
  { key: 'hongkong', name: { uz: 'Hong Kong', ru: 'Гонконг' }, flag: '🇭🇰' },
  { key: 'japan', name: { uz: 'Yaponiya', ru: 'Япония' }, flag: '🇯🇵' },
  { key: 'schengen', name: { uz: 'Shengen davlatlari (Ispaniya/Fransiya/Germaniya va h.k.)', ru: 'Страны Шенгена (Испания/Франция/Германия и др.)' }, flag: '🇪🇺' },
  { key: 'usa', name: { uz: 'AQSH', ru: 'США' }, flag: '🇺🇸' },
  { key: 'uk', name: { uz: 'Buyuk Britaniya', ru: 'Великобритания' }, flag: '🇬🇧' },
  { key: 'canada', name: { uz: 'Kanada', ru: 'Канада' }, flag: '🇨🇦' },
  { key: 'australia', name: { uz: 'Avstraliya', ru: 'Австралия' }, flag: '🇦🇺' },
];

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function calculateCountryScores(chatId) {
  const s = getState(chatId);
  const answers = s.chanceAnswers || {};
  const scoreMap = s.chanceScore || {};

  const baseTotal = Object.values(scoreMap).reduce((a, b) => a + b, 0);
  const basePct = Math.round((baseTotal / CHANCE_MAX_SCORE) * 100);

  const travelRegionIdx = answers['travelRegion']; // 0=Shengen,1=USA/UK/CA/AU,2=yaqin,3=hech qayerga
  const visitedSchengen = travelRegionIdx === 0;

  const employmentIdx = answers['employment']; // 0 = "Rasmiy ishlayman"
  const incomeIdx = answers['income']; // 0 yoki 1 = eng yaxshi ikkita variant
  const hasGoodJob = employmentIdx === 0 && (incomeIdx === 0 || incomeIdx === 1);

  const results = {};
  results.hongkong = clamp(basePct + 32, 55, 96); // deyarli hamma vaqt yuqori, lekin endi mutlaq 100% emas
  results.japan = hasGoodJob ? 90 : clamp(basePct + 10, 50, 87);

  // Barcha Shengen davlatlari — yuqori, lekin avvalgidan biroz pastroq
  results.schengen = clamp(basePct + 18 + (visitedSchengen ? 8 : 0), 50, 95);

  // AQSH/UK/Kanada/Avstraliya — bir xil, optimistik baholash
  const standardBoosted = clamp(basePct + 18, 45, 95);
  results.usa = standardBoosted;
  results.uk = standardBoosted;
  results.canada = standardBoosted;
  results.australia = standardBoosted;

  return { results, visitedSchengen, basePct };
}

function recommendCourse(chatId) {
  const u = getUser(chatId);
  const s = getState(chatId);
  const interestedIn = (u.interestedIn || '').toLowerCase();
  const countryMap = [
    ['ispaniya', 'kurs_ispaniya'], ['fransiya', 'kurs_france'], ['germaniya', 'kurs_germany'],
    ['litva', 'kurs_combo'], ['belgiya', 'kurs_combo'], ['avstriya', 'kurs_combo'],
    ['bolgariya', 'kurs_combo'], ['lyuksemburg', 'kurs_combo'], ['niderlandiya', 'kurs_combo'],
    ['shengen', 'kurs_france'], // aniq davlat bilinmasa — Fransiya bosh kurs sifatida tavsiya etiladi
    ['yaponiya', 'kurs_yaponiya'], ['aqsh', 'kurs_aqsh'], ['buyuk britaniya', 'kurs_uk'],
    ['hong kong', 'kurs_hongkong'], ['avstraliya', 'kurs_avstraliya'], ['kanada', 'kurs_kanada'],
  ];
  for (const [kw, key] of countryMap) {
    if (interestedIn.includes(kw)) return key;
  }
  return 'kurs_barchasi';
}

// AI javobida qaysi kurs tilga olinganini aniqlaydi — topilsa, shu xabarga
// to'g'ridan-to'g'ri "Sotib olish" tugmasi qo'shiladi.
function detectMentionedCourse(replyText) {
  const lower = replyText.toLowerCase();
  const keywordMap = [
    [['ispaniya', 'испани'], 'kurs_ispaniya'],
    [['fransiya', 'франци'], 'kurs_france'],
    [['germaniya', 'германи'], 'kurs_germany'],
    [['litva', 'литв', 'belgiya', 'бельги', 'avstriya', 'австри', 'bolgariya', 'болгари', 'lyuksemburg', 'люксембург', 'niderlandiya', 'нидерланд', 'kombo', 'комбо'], 'kurs_combo'],
    [['shengen', 'шенген'], 'kurs_france'], // aniq davlat aytilmasa — Fransiya
    [['yaponiya', 'япони'], 'kurs_yaponiya'],
    [['aqsh', 'сша', 'b1/b2', 'b1-b2'], 'kurs_aqsh'],
    [['buyuk britaniya', 'великобритан'], 'kurs_uk'],
    [['hong kong', 'гонконг'], 'kurs_hongkong'],
    [['avstraliya', 'австрал'], 'kurs_avstraliya'],
    [['kanada', 'канад'], 'kurs_kanada'],
    [['barcha kurslar', 'barcha video darslik', 'пакет всех', '999'], 'kurs_barchasi'],
  ];
  for (const [keywords, key] of keywordMap) {
    if (keywords.some(kw => lower.includes(kw))) return key;
  }
  return null;
}

function computeChanceResult(chatId) {
  const s = getState(chatId);
  const lang = getLang(chatId);
  const t = T[lang];
  const total = Object.values(s.chanceScore).reduce((a, b) => a + b, 0);
  const pct = Math.round((total / CHANCE_MAX_SCORE) * 100);

  const u = getUser(chatId);
  u.chanceScorePct = pct;
  saveDB();

  let verdict;
  if (lang === 'ru') {
    verdict = pct >= 80 ? 'Профиль выглядит сильным' : pct >= 60 ? 'Профиль хороший, есть отдельные риски' : pct >= 40 ? 'Профиль средний' : 'Профиль нужно серьёзно усилить';
  } else {
    verdict = pct >= 80 ? "Profil kuchli ko'rinadi" : pct >= 60 ? 'Profil yaxshi, ayrim xavflar bor' : pct >= 40 ? "Profil o'rtacha" : 'Profilni jiddiy kuchaytirish kerak';
  }

  const { strong, weak } = analyzeChanceCategories(s.chanceScore, lang);
  const strongLabel = lang === 'ru' ? '✅ Сильные стороны:' : "✅ Kuchli tomonlaringiz:";
  const weakLabel = lang === 'ru' ? '⚠️ Обратите внимание:' : "⚠️ E'tibor bering:";

  const strongText = strong.length
    ? `\n\n${strongLabel}\n` + strong.map(c => `• ${c.label[lang]} (${c.pct}%)`).join('\n')
    : '';
  const weakText = weak.length
    ? `\n\n${weakLabel}\n` + weak.map(c => `• ${c.label[lang]} — ${c.tip[lang]}`).join('\n')
    : '';

  // ---- Har bir mamlakat bo'yicha alohida foiz ----
  const { results: countryResults, visitedSchengen } = calculateCountryScores(chatId);
  const countryLabel = lang === 'ru' ? '🌍 Ваши шансы по странам:' : "🌍 Mamlakatlar bo'yicha imkoniyatingiz:";
  const countryLines = COUNTRY_CHANCE_LIST.map(c => `${c.flag} ${c.name[lang]} — ${countryResults[c.key]}%`).join('\n');

  let notesText = '';
  if (!visitedSchengen) {
    notesText += lang === 'ru'
      ? "\n\n💡 Совет: если раньше вы уже были в любой стране Шенгена и вернулись вовремя — это дополнительно повышает шансы."
      : "\n\n💡 Maslahat: agar avval boshqa Shengen davlatiga borib, muddatida qaytgan bo'lsangiz — bu imkoniyatni yanada oshiradi.";
  }
  notesText += lang === 'ru'
    ? "\n💡 Венгрия: посольство перед выдачей визы может запросить УЖЕ ОПЛАЧЕННЫЕ авиабилет и отель."
    : "\n💡 Vengriya: elchixona viza berishdan oldin TO'LANGAN aviabilet va mehmonxona bronini so'rashi mumkin.";
  notesText += lang === 'ru'
    ? "\n💡 Болгария: при подаче заявки авиабилет и отель должны быть ОПЛАЧЕНЫ на 100%."
    : "\n💡 Bolgariya: ariza topshirilganda aviabilet va mehmonxona 100% TO'LANGAN bo'lishi SHART.";

  const courseKey = recommendCourse(chatId);
  const course = COURSE_CHANNELS[courseKey];
  const courseName = lang === 'ru' ? course.nameRu : course.name;
  const bundleName = lang === 'ru' ? COURSE_CHANNELS.kurs_barchasi.nameRu : COURSE_CHANNELS.kurs_barchasi.name;
  const isBundle = courseKey === 'kurs_barchasi';
  const strengthenLine = lang === 'ru'
    ? `\n\n💪 Пройдя курс и укрепив слабые стороны, вы можете довести свою визовую историю практически до 100%!`
    : `\n\n💪 Kursni o'tab, zaif tomonlaringizni mustahkamlasangiz, viza tarixingizni deyarli 100%gacha kuchaytirishingiz mumkin!`;
  const courseText = isBundle
    ? (lang === 'ru'
        ? `\n\n🎬 Рекомендуем: "${courseName}" — ${course.price}. Это сразу готовит вас по всем направлениям.${strengthenLine}`
        : `\n\n🎬 Sizga tavsiya etamiz: "${courseName}" — ${course.price}. Bu sizni barcha yo'nalishlarga bir yo'la tayyorlaydi.${strengthenLine}`)
    : (lang === 'ru'
        ? `\n\n🎬 Рекомендуем: "${courseName}" — ${course.price}. Этот курс даёт подготовку именно под вашу ситуацию. Или возьмите "${bundleName}" — ${COURSE_CHANNELS.kurs_barchasi.price} и будьте готовы сразу ко всем направлениям.${strengthenLine}`
        : `\n\n🎬 Sizga tavsiya etamiz: "${courseName}" — ${course.price}. Bu kurs aynan sizning holatingizga mos tayyorgarlikni beradi. Yoki "${bundleName}" — ${COURSE_CHANNELS.kurs_barchasi.price} olib, barcha yo'nalishlarga bir yo'la tayyor bo'ling.${strengthenLine}`);

  return `📊 ${t.chance_result_head}: ${pct}%\n\n${verdict}${strongText}${weakText}\n\n${countryLabel}\n${countryLines}${notesText}\n\n${t.chance_disclaimer}${courseText}`;
}

// ---------------------------------------------------------------
// ASOSIY MENYU
// ---------------------------------------------------------------
function mainMenuKeyboard(chatId) {
  const t = T[getLang(chatId)];
  const adminUrl = `https://t.me/${ADMIN_CONTACT_USERNAME.replace('@', '')}`;
  return {
    inline_keyboard: [
      [{ text: t.menu_featured, callback_data: 'buy_course_kurs_barchasi' }],
      [{ text: t.menu_chance, callback_data: 'chance' }],
      [{ text: t.menu_services, callback_data: 'services' }, { text: t.menu_docs, callback_data: 'docs' }],
      [{ text: t.menu_courses, callback_data: 'courses' }, { text: t.menu_tours, callback_data: 'tours' }],
      [{ text: t.menu_ai, callback_data: 'ai' }, { text: t.menu_other, callback_data: 'other' }],
      [{ text: t.menu_admin, url: adminUrl }],
      [{ text: t.menu_lang, callback_data: 'lang' }],
    ],
  };
}
function backButton(chatId, backTarget) {
  const t = T[getLang(chatId)];
  if (backTarget) {
    return { inline_keyboard: [
      [{ text: t.back, callback_data: backTarget }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] };
  }
  return { inline_keyboard: [[{ text: t.to_menu, callback_data: 'menu' }]] };
}
async function sendMainMenu(chatId) {
  const t = T[getLang(chatId)];
  await renderScreen(chatId, t.welcome, mainMenuKeyboard(chatId));
}

// ---------------------------------------------------------------
// DEEP-LINK PAYLOAD ISHLASH (saytdan t.me/VisaAi_Uz_Bot?start=XXX orqali kelganda)
// ---------------------------------------------------------------
async function triggerCoursePurchase(chatId, key, fromUser) {
  const lang = getLang(chatId);
  const t = T[lang];
  const course = COURSE_CHANNELS[key];
  if (!course) return sendMainMenu(chatId);
  const name = lang === 'ru' ? course.nameRu : course.name;
  const desc = key === 'kurs_barchasi'
    ? (lang === 'ru' ? course.descRu : course.desc)
    : SINGLE_COURSE_DESC[lang];
  const userLabel = `${fromUser.first_name || ''} (@${fromUser.username || 'username yo\'q'}, ID: ${chatId})`;
  pendingPurchases.set(String(chatId), { kind: 'course', key, name, userLabel });

  const u = getUser(chatId);
  u.purchases.push({ key, name, price: course.price, status: 'pending', requestedAt: new Date().toISOString() });
  saveDB();

  const cardBlock = lang === 'ru'
    ? `💳 Карта (нажмите, чтобы скопировать):\n\`${PAYMENT_CARD_NUMBER}\`\n👤 ${PAYMENT_CARD_HOLDER}`
    : `💳 Karta (bosib nusxalang):\n\`${PAYMENT_CARD_NUMBER}\`\n👤 ${PAYMENT_CARD_HOLDER}`;
  const afterPayLine = lang === 'ru'
    ? `\n\n✅ После оплаты отправьте скриншот чека напрямую администратору, чтобы получить доступ к каналу курса: ${ADMIN_CONTACT_USERNAME_MD}`
    : `\n\n✅ To'lovdan so'ng chek skrinshotini to'g'ridan-to'g'ri adminga yuboring — shunda video darslik kanaliga ruxsat olasiz: ${ADMIN_CONTACT_USERNAME_MD}`;

  await renderScreen(chatId,
    `${t.purchase_thanks}: "${name}" — ${course.price} 🎬\n\n${desc}\n\n${t.purchase_pay}\n\n${cardBlock}${afterPayLine}`,
    backButton(chatId, 'courses'),
    { parse_mode: 'Markdown' }
  );

  // 2 soatdan keyin — agar hali to'lov tasdiqlanmagan bo'lsa, muloyim eslatma yuboramiz
  setTimeout(() => {
    if (!pendingPurchases.has(String(chatId))) return; // allaqachon tasdiqlangan yoki bekor qilingan
    const reminderLang = getLang(chatId);
    const reminderText = reminderLang === 'ru'
      ? `👋 Вы выбрали "${name}", но мы ещё не получили подтверждение оплаты.\n\nЕсли оплатили — просто напишите админу: ${ADMIN_CONTACT_USERNAME_MD}\nЕсли передумали или есть вопрос — тоже напишите, поможем.`
      : `👋 Siz "${name}" kursini tanlagan edingiz, lekin hali to'lov tasdiqlanmadi.\n\nAgar to'lov qilgan bo'lsangiz — adminga yozing: ${ADMIN_CONTACT_USERNAME_MD}\nSavolingiz yoki fikringiz o'zgargan bo'lsa ham — yozing, yordam beramiz.`;
    sendContent(chatId, reminderText, { reply_markup: backButton(chatId, 'courses'), parse_mode: 'Markdown' }).catch(() => {});
  }, 2 * 60 * 60 * 1000);
}

async function handleStartPayload(chatId, payload, fromUser) {
  if (!payload) return sendMainMenu(chatId);

  // Kurs sotib olish — saytdan to'g'ridan-to'g'ri
  if (payload.startsWith('kurs_')) {
    return triggerCoursePurchase(chatId, payload, fromUser);
  }

  // Video darsliklar ro'yxati
  if (payload === 'courses') {
    const lang = getLang(chatId);
    const t = T[lang];
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => {
      const label = lang === 'ru' ? (c.shortNameRu || c.nameRu) : (c.shortName || c.name);
      return [{ text: `${label} — ${c.price}`, callback_data: `buy_course_${key}` }];
    });
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    const head = `${t.courses_head}\n\n${SINGLE_COURSE_DESC[lang]}\n\n🔥 ${lang === 'ru' ? 'Пакет всех курсов' : 'Barcha kurslar paketi'} (999 000):\n${lang === 'ru' ? COURSE_CHANNELS.kurs_barchasi.descRu : COURSE_CHANNELS.kurs_barchasi.desc}`;
    return renderScreen(chatId, head, { inline_keyboard: rows });
  }

  // Tur paketlar ro'yxati
  if (payload === 'tours') {
    const lang = getLang(chatId);
    const t = T[lang];
    const rows = Object.entries(TOUR_PACKAGES).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_tour_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return renderScreen(chatId, t.tours_head, { inline_keyboard: rows });
  }

  // AI yordamchi — Ishchi viza konteksti bilan
  if (payload === 'ai_ishchi') {
    getState(chatId).mode = 'ai';
    const lang = getLang(chatId);
    const prompt = lang === 'ru'
      ? 'Вы пришли с сайта (раздел "Рабочая виза"). Напишите ваш вопрос — AI поможет и подберёт нужный видеокурс.'
      : "Siz saytdan keldingiz (\"Ishchi viza\" bo'limi). Savolingizni yozing — AI yordam beradi va mos video kursni tavsiya qiladi.";
    return renderScreen(chatId, prompt, backButton(chatId));
  }

  // Premium konsultatsiya — lid: ism so'raladi
  if (payload === 'consult' || payload === 'partner') {
    const s = getState(chatId);
    s.mode = payload === 'consult' ? 'lead_consult' : 'lead_partner';
    const lang = getLang(chatId);
    const text = payload === 'consult'
      ? (lang === 'ru' ? 'Вы выбрали Премиум-консультацию! Напишите, пожалуйста, ваше имя и телефон/Telegram — специалист свяжется с вами.' : "Siz Premium konsultatsiyani tanladingiz! Ismingiz va telefon/Telegram'ingizni yozing — mutaxassis siz bilan bog'lanadi.")
      : (lang === 'ru' ? 'Хотите стать партнёром VizaAI! Напишите название организации и телефон/Telegram для связи.' : "VizaAI'ga hamkor bo'lmoqchisiz! Tashkilotingiz nomi va telefon/Telegram'ingizni yozing.");
    return renderScreen(chatId, text, backButton(chatId));
  }

  // Noma'lum payload — asosiy menyu
  return sendMainMenu(chatId);
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const payload = match && match[1] ? match[1].trim() : null;
  clearPendingState(chatId);
  getState(chatId).screenMsgId = null;

  // ---- Ro'yxatdan o'tish shart — faqat telefon raqami kifoya ----
  if (!isRegistered(chatId)) {
    const s = getState(chatId);
    s.mode = 'registering';
    s.pendingPayload = payload; // ro'yxatdan o'tgach, shu joyga yo'naltiriladi
    const lang = getLang(chatId);
    const text = lang === 'ru'
      ? 'Добро пожаловать в VizaAI! 👋\n\nЧтобы продолжить, поделитесь номером телефона (или напишите его вручную) — это займёт 5 секунд.'
      : "VizaAI'ga xush kelibsiz! 👋\n\nDavom etish uchun telefon raqamingizni yuboring (yoki qo'lda yozing) — bu 5 soniya vaqt oladi.";
    return bot.sendMessage(chatId, text, {
      reply_markup: {
        keyboard: [[{ text: lang === 'ru' ? '📱 Отправить номер' : '📱 Raqamni yuborish', request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    });
  }

  return handleStartPayload(chatId, payload, msg.from);
});

// ---------------------------------------------------------------
// TUGMA BOSILGANDA
// ---------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const lang = getLang(chatId);
  const t = T[lang];
  bot.answerCallbackQuery(query.id).catch(() => {});

  try {

  // Til tanlash ro'yxatdan o'tishdan keyin bo'lsa — buni saqlab qolamiz,
  // chunki pastdagi clearPendingState buni tozalab yuboradi
  const stateBefore = getState(chatId);
  const wasPostRegLang = stateBefore.mode === 'post_reg_lang';
  const savedPendingPayload = stateBefore.pendingPayload;

  if (!data.startsWith('chance_ans_') && data !== 'doccheck_finish') clearPendingState(chatId);

  if (data === 'menu') return sendMainMenu(chatId);

  if (data === 'lang') {
    return renderScreen(chatId, "Tilni tanlang / Выберите язык:", { inline_keyboard: [[
      { text: "🇺🇿 O'zbekcha", callback_data: 'setlang_uz' },
      { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
    ]] });
  }
  if (data === 'setlang_uz' || data === 'setlang_ru') {
    const newLang = data === 'setlang_uz' ? 'uz' : 'ru';
    userLang.set(chatId, newLang);

    // Agar bu ro'yxatdan o'tishdan keyingi til tanlash bo'lsa —
    // xush kelibsiz + promo kod xabarini ko'rsatib, keyin davom etamiz
    if (wasPostRegLang) {
      const u = getUser(chatId);
      const tt = T[newLang];
      const welcomeBack = newLang === 'ru'
        ? `Вы зарегистрированы ✅\n\n🎁 Ваш промокод (нажмите, чтобы скопировать):\n\`${u.promoCode}\`\n\nПоделитесь им с другом — вы оба получите скидку.`
        : `Ro'yxatdan o'tdingiz ✅\n\n🎁 Sizning promo kodingiz (bosib nusxalang):\n\`${u.promoCode}\`\n\nDo'stingiz bilan bo'lishing — ikkalangiz ham chegirma olasiz.`;
      await bot.sendMessage(chatId, welcomeBack, { parse_mode: 'Markdown' });
      return handleStartPayload(chatId, savedPendingPayload, query.from);
    }
    return sendMainMenu(chatId);
  }

  // ---- Viza imkoniyati testi ----
  if (data === 'chance') {
    const s = getState(chatId);
    s.mode = 'chance'; s.chanceStep = 0; s.chanceScore = {}; s.chanceAnswers = {};
    return renderScreen(chatId, `${t.chance_start}\n\n${chanceQuestionText(0, lang, chatId)}`, chanceQuestionKeyboard(0, lang));
  }
  if (data.startsWith('chance_ans_')) {
    const parts = data.split('_');
    const stepIdx = +parts[2], optIdx = +parts[3];
    const s = getState(chatId);
    if (s.mode !== 'chance' || s.chanceStep !== stepIdx) return;
    const question = CHANCE_QUESTIONS[stepIdx];
    s.chanceScore[question.key] = question.options[optIdx].points;
    s.chanceAnswers = s.chanceAnswers || {};
    s.chanceAnswers[question.key] = optIdx;
    s.chanceStep += 1;

    if (s.chanceStep < CHANCE_QUESTIONS.length) {
      return renderScreen(chatId, chanceQuestionText(s.chanceStep, lang, chatId), chanceQuestionKeyboard(s.chanceStep, lang));
    }
    const resultText = computeChanceResult(chatId);
    clearPendingState(chatId);

    const recKey = recommendCourse(chatId);
    const recCourse = COURSE_CHANNELS[recKey];
    const recName = lang === 'ru' ? recCourse.nameRu : recCourse.name;
    const buyLabel = lang === 'ru' ? `🎬 Купить: ${recName} — ${recCourse.price}` : `🎬 Sotib olish: ${recName} — ${recCourse.price}`;
    return renderScreen(chatId, resultText, { inline_keyboard: [
      [{ text: buyLabel, callback_data: `buy_course_${recKey}` }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] });
  }

  // ---- Viza xizmatlari ----
  if (data === 'services') {
    return renderScreen(chatId, t.services_head, { inline_keyboard: [
      [{ text: '✈️ Sayohat viza', callback_data: 'svc_travel' }],
      [{ text: '💼 Ishchi viza', callback_data: 'svc_work' }],
      [{ text: '🎓 Student', callback_data: 'svc_student' }],
      [{ text: '❓ FAQ', callback_data: 'svc_faq' }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] });
  }
  if (data === 'svc_travel') {
    const rows = COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_travel_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return renderScreen(chatId, t.svc_travel_head, { inline_keyboard: rows });
  }
  if (data === 'svc_work') {
    const rows = WORK_COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_work_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return renderScreen(chatId, t.svc_work_head, { inline_keyboard: rows });
  }
  if (data === 'svc_student') {
    const rows = STUDENT_COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_student_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return renderScreen(chatId, t.svc_student_head, { inline_keyboard: rows });
  }
  if (data.startsWith('chk_travel_')) {
    const c = COUNTRIES.find(x => x.key === data.replace('chk_travel_', ''));
    if (!c) return;
    const u = getUser(chatId);
    u.interestedIn = `${c.name} (sayohat viza)`;
    saveDB();
    const list = c.items.map((it, i) => `${i + 1}. ${lang === 'ru' ? it[1] : it[0]} — ${lang === 'ru' ? it[3] : it[2]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId, 'svc_travel'));
  }
  if (data.startsWith('chk_work_')) {
    const c = WORK_COUNTRIES.find(x => x.key === data.replace('chk_work_', ''));
    if (!c) return;
    const u = getUser(chatId);
    u.interestedIn = `${c.name} (ishchi viza)`;
    saveDB();
    const list = WORK_CHECKLIST.map((it, i) => `${i + 1}. ${lang === 'ru' ? it[1] : it[0]} — ${lang === 'ru' ? it[3] : it[2]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId, 'svc_work'));
  }
  if (data.startsWith('chk_student_')) {
    const c = STUDENT_COUNTRIES.find(x => x.key === data.replace('chk_student_', ''));
    if (!c) return;
    const u = getUser(chatId);
    u.interestedIn = `${c.name} (talaba vizasi)`;
    saveDB();
    const list = STUDENT_CHECKLIST.map((it, i) => `${i + 1}. ${lang === 'ru' ? it[1] : it[0]} — ${lang === 'ru' ? it[3] : it[2]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId, 'svc_student'));
  }
  if (data === 'svc_faq') {
    const rows = FAQ_DATA.map((f, i) => ([{ text: lang === 'ru' ? f[2] : f[0], callback_data: `faq_${i}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return renderScreen(chatId, t.faq_head, { inline_keyboard: rows });
  }
  if (data.startsWith('faq_')) {
    const item = FAQ_DATA[+data.replace('faq_', '')];
    if (!item) return;
    const q = lang === 'ru' ? item[2] : item[0], a = lang === 'ru' ? item[3] : item[1];
    return renderScreen(chatId, `❓ ${q}\n\n${a}`, backButton(chatId, 'svc_faq'));
  }

  // ---- Hujjatni AI tekshirish ----
  if (data === 'docs') {
    const rows = COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `doccheck_${c.key}` }]));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    const head = lang === 'ru' ? 'Для какой страны хотите проверить документы?' : "Qaysi mamlakat uchun hujjatlarni tekshirmoqchisiz?";
    return renderScreen(chatId, head, { inline_keyboard: rows });
  }
  if (data.startsWith('doccheck_') && data !== 'doccheck_finish') {
    const key = data.replace('doccheck_', '');
    const country = COUNTRIES.find(c => c.key === key);
    if (!country) return;
    const s2 = getState(chatId);
    s2.mode = 'doc';
    s2.docCheckCountry = key;
    s2.docCheckMatched = [];
    const list = country.items.map((it, i) => `${i + 1}. ${lang === 'ru' ? it[1] : it[0]}`).join('\n');
    const firstItemName = lang === 'ru' ? country.items[0][1] : country.items[0][0];
    const askFirst = lang === 'ru'
      ? `\n\n📸 Начнём! Отправьте, пожалуйста: "${firstItemName}"`
      : `\n\n📸 Boshlaymiz! Iltimos, shuni yuboring: "${firstItemName}"`;
    const head = lang === 'ru'
      ? `${country.flag} ${country.nameRu} — необходимые документы:\n\n${list}${askFirst}`
      : `${country.flag} ${country.name} — kerakli hujjatlar:\n\n${list}${askFirst}`;
    return renderScreen(chatId, head, { inline_keyboard: [
      [{ text: lang === 'ru' ? '✅ Завершить проверку' : "✅ Tekshirishni yakunlash", callback_data: 'doccheck_finish' }],
      [{ text: t.back, callback_data: 'docs' }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] });
  }
  if (data === 'doccheck_finish') {
    const s2 = getState(chatId);
    const country = COUNTRIES.find(c => c.key === s2.docCheckCountry);
    if (!country) { clearPendingState(chatId); return sendMainMenu(chatId); }
    const matchedCount = (s2.docCheckMatched || []).length;
    const totalCount = country.items.length;
    const readyPct = Math.round((matchedCount / totalCount) * 100);

    const matchedNames = (s2.docCheckMatched || []).map(idx => lang === 'ru' ? country.items[idx][1] : country.items[idx][0]);
    const missingNames = country.items.filter((it, i) => !(s2.docCheckMatched || []).includes(i)).map(it => lang === 'ru' ? it[1] : it[0]);

    const matchedLabel = lang === 'ru' ? '✅ Получено:' : "✅ Qabul qilingan:";
    const missingLabel = lang === 'ru' ? '❌ Ещё не хватает:' : "❌ Hali yetishmayapti:";
    const matchedText = matchedNames.length ? `\n\n${matchedLabel}\n` + matchedNames.map(n => `• ${n}`).join('\n') : '';
    const missingText = missingNames.length ? `\n\n${missingLabel}\n` + missingNames.map(n => `• ${n}`).join('\n') : '';

    const head = lang === 'ru'
      ? `📊 Готовность документов (${country.nameRu}): ${readyPct}%${matchedText}${missingText}\n\n⚠️ Это AI-анализ, не официальная проверка.`
      : `📊 Hujjatlar tayyorligi (${country.name}): ${readyPct}%${matchedText}${missingText}\n\n⚠️ Bu AI tahlili, rasmiy tekshiruv emas.`;

    const u = getUser(chatId);
    u.docHistory = u.docHistory || [];
    u.docHistory.push({ type: `${country.name} — ${readyPct}% tayyor`, date: new Date().toISOString() });
    u.docHistory = u.docHistory.slice(-10);
    saveDB();

    clearPendingState(chatId);
    return renderScreen(chatId, head, backButton(chatId, 'docs'));
  }

  // ---- Video darsliklar ----
  if (data === 'courses') {
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => {
      const label = lang === 'ru' ? (c.shortNameRu || c.nameRu) : (c.shortName || c.name);
      return [{ text: `${label} — ${c.price}`, callback_data: `buy_course_${key}` }];
    });
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    const head = `${t.courses_head}\n\n${SINGLE_COURSE_DESC[lang]}\n\n🔥 ${lang === 'ru' ? 'Пакет всех курсов' : 'Barcha kurslar paketi'} (999 000):\n${lang === 'ru' ? COURSE_CHANNELS.kurs_barchasi.descRu : COURSE_CHANNELS.kurs_barchasi.desc}`;
    return renderScreen(chatId, head, { inline_keyboard: rows });
  }
  if (data === 'tours') {
    const rows = Object.entries(TOUR_PACKAGES).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_tour_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return renderScreen(chatId, t.tours_head, { inline_keyboard: rows });
  }
  if (data.startsWith('buy_course_')) {
    const key = data.replace('buy_course_', '');
    return triggerCoursePurchase(chatId, key, query.from);
  }
  if (data.startsWith('buy_tour_')) {
    const key = data.replace('buy_tour_', '');
    const tour = TOUR_PACKAGES[key];
    if (!tour) return;
    const name = lang === 'ru' ? tour.nameRu : tour.name;
    const userLabel = `${query.from.first_name || ''} (@${query.from.username || 'username yo\'q'}, ID: ${chatId})`;
    pendingPurchases.set(String(chatId), { kind: 'tour', key, name, userLabel });

    const u = getUser(chatId);
    u.purchases.push({ key, name, price: tour.price, status: 'pending', requestedAt: new Date().toISOString() });
    saveDB();

    await renderScreen(chatId, `"${name}" — ${tour.price} 🧳\n\n${t.tour_request_ok}`, backButton(chatId, 'tours'));
    u.interestedIn = `${name} (tur paket)`;
    saveDB();
    return;
  }

  // ---- AI yordamchi ----
  if (data === 'ai') {
    getState(chatId).mode = 'ai';
    return renderScreen(chatId, t.ask_ai_prompt, backButton(chatId));
  }

  // ---- Boshqa imkoniyatlar ----
  if (data === 'other') {
    return renderScreen(chatId, t.other_head, { inline_keyboard: [
      [{ text: lang === 'ru' ? '👤 Мой профиль' : '👤 Mening profilim', callback_data: 'my_profile' }],
      [{ text: lang === 'ru' ? '🎁 Мой промокод' : '🎁 Mening promo kodim', callback_data: 'promo_show' }],
      [{ text: lang === 'ru' ? '✅ Ввести промокод' : '✅ Promo kod kiritish', callback_data: 'promo_enter' }],
      [{ text: lang === 'ru' ? '🏆 Рейтинг рефералов' : "🏆 Referral reytingi", callback_data: 'referral_board' }],
      [{ text: lang === 'ru' ? '💰 Калькулятор бюджета' : "💰 Byudjet kalkulyatori", callback_data: 'budget_calc' }],
      [{ text: t.partner_program, callback_data: 'lead_partner_start' }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] });
  }
  if (data === 'my_profile') {
    const u = getUser(chatId);
    const joinedDate = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ') : '—';
    const confirmedPurchases = (u.purchases || []).filter(p => p.status === 'confirmed');
    const pendingPurchases_ = (u.purchases || []).filter(p => p.status !== 'confirmed');
    const referralCount = Object.values(usersDB).filter(other => other.referredBy === u.promoCode).length;

    const purchasesLines = confirmedPurchases.length
      ? confirmedPurchases.map(p => `   ✅ ${p.name}`).join('\n')
      : (lang === 'ru' ? '   — пока нет' : "   — hali yo'q");
    const pendingLines = pendingPurchases_.length
      ? '\n' + (lang === 'ru' ? '⏳ В ожидании:\n' : "⏳ Kutilmoqda:\n") + pendingPurchases_.map(p => `   • ${p.name}`).join('\n')
      : '';

    const text = lang === 'ru'
      ? `👤 Ваш профиль\n\n📅 Дата регистрации: ${joinedDate}\n🌍 Интересующее направление: ${u.interestedIn || 'ещё не выбрано'}\n🧠 Результат теста визы: ${u.chanceScorePct !== null && u.chanceScorePct !== undefined ? u.chanceScorePct + '%' : 'ещё не пройден'}\n📸 Проверок документов: ${u.docChecksCount}\n\n🎬 Купленные курсы:\n${purchasesLines}${pendingLines}\n\n🎁 Ваш промокод: \`${u.promoCode}\`\n👥 Приглашено друзей: ${referralCount}`
      : `👤 Sizning profilingiz\n\n📅 Ro'yxatdan o'tgan sana: ${joinedDate}\n🌍 Qiziqqan yo'nalish: ${u.interestedIn || "hali tanlanmagan"}\n🧠 Viza testi natijasi: ${u.chanceScorePct !== null && u.chanceScorePct !== undefined ? u.chanceScorePct + '%' : "hali topshirilmagan"}\n📸 Hujjat tekshiruvlari: ${u.docChecksCount}\n\n🎬 Sotib olingan kurslar:\n${purchasesLines}${pendingLines}\n\n🎁 Sizning promo kodingiz: \`${u.promoCode}\`\n👥 Taklif qilingan do'stlar: ${referralCount}`;

    return renderScreen(chatId, text, backButton(chatId, 'other'), { parse_mode: 'Markdown' });
  }
  if (data === 'referral_board') {
    const counts = {};
    Object.values(usersDB).forEach(other => {
      if (other.referredBy) counts[other.referredBy] = (counts[other.referredBy] || 0) + 1;
    });
    const nameByCode = {};
    Object.values(usersDB).forEach(other => { nameByCode[other.promoCode] = other.name || "Foydalanuvchi"; });

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const myCode = getUser(chatId).promoCode;
    const myCount = counts[myCode] || 0;
    const myRank = top.findIndex(([code]) => code === myCode);

    const listText = top.length
      ? top.map(([code, count], i) => `${i + 1}. ${nameByCode[code] || '???'} — ${count} ta`).join('\n')
      : (lang === 'ru' ? 'Пока никто не приглашал друзей.' : "Hali hech kim do'st taklif qilmagan.");

    const myLine = myRank === -1
      ? (lang === 'ru' ? `\n\nВаше место: вне топ-10 (${myCount} приглашений)` : `\n\nSizning o'rningiz: TOP-10dan tashqarida (${myCount} ta taklif)`)
      : (lang === 'ru' ? `\n\n🎯 Вы на ${myRank + 1}-м месте!` : `\n\n🎯 Siz ${myRank + 1}-o'rindasiz!`);

    const head = lang === 'ru' ? '🏆 Топ-10 по рефералам:\n\n' : "🏆 Referral bo'yicha TOP-10:\n\n";
    return renderScreen(chatId, `${head}${listText}${myLine}`, backButton(chatId, 'other'));
  }
  if (data === 'budget_calc') {
    const rows = BUDGET_COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `budgetcalc_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'other' }]);
    const head = lang === 'ru' ? '💰 Для какой страны рассчитать бюджет поездки?' : "💰 Qaysi davlat uchun sayohat byudjetini hisoblaymiz?";
    return renderScreen(chatId, head, { inline_keyboard: rows });
  }
  if (data.startsWith('budgetcalc_')) {
    const key = data.replace('budgetcalc_', '');
    const c = BUDGET_COUNTRIES.find(x => x.key === key);
    if (!c) return;
    const rows = [3, 5, 7, 14].map(days => ([{ text: `${days} ${lang === 'ru' ? 'дней' : 'kun'}`, callback_data: `budgetdays_${key}_${days}` }]));
    rows.push([{ text: t.back, callback_data: 'budget_calc' }]);
    const head = lang === 'ru' ? `${c.flag} ${c.nameRu} — на сколько дней едете?` : `${c.flag} ${c.name} — necha kunga borasiz?`;
    return renderScreen(chatId, head, { inline_keyboard: rows });
  }
  if (data.startsWith('budgetdays_')) {
    const [, key, daysStr] = data.split('_');
    const days = parseInt(daysStr, 10);
    const c = BUDGET_COUNTRIES.find(x => x.key === key);
    if (!c) return;
    const hotelTotal = c.hotelPerNight * days;
    const dailyTotal = c.dailyBudget * days;
    const total = c.flight + hotelTotal + dailyTotal;

    const text = lang === 'ru'
      ? `${c.flag} ${c.nameRu} — ${days} дней\n\n✈️ Авиабилет (туда-обратно): ~$${c.flight}\n🏨 Отель (${days} ноч. × $${c.hotelPerNight}): ~$${hotelTotal}\n🍽 Ежедневные расходы (${days} дн. × $${c.dailyBudget}): ~$${dailyTotal}\n\n💰 Примерный итог: ~$${total}\n\n⚠️ Это приблизительная оценка, реальная стоимость зависит от сезона и ваших привычек.\n\n💡 Курс "${lang === 'ru' ? c.nameRu : c.name}" научит бронировать всё это намного дешевле!`
      : `${c.flag} ${c.name} — ${days} kun\n\n✈️ Aviabilet (bordi-keldi): ~$${c.flight}\n🏨 Mehmonxona (${days} kecha × $${c.hotelPerNight}): ~$${hotelTotal}\n🍽 Kunlik xarajat (${days} kun × $${c.dailyBudget}): ~$${dailyTotal}\n\n💰 Taxminiy jami: ~$${total}\n\n⚠️ Bu taxminiy baho, haqiqiy narx mavsum va odatlaringizga qarab farq qiladi.\n\n💡 "${c.name}" kursi buni ancha arzonroq bron qilishni o'rgatadi!`;

    return renderScreen(chatId, text, backButton(chatId, 'budget_calc'));
  }
  if (data === 'promo_show') {
    const u = getUser(chatId);
    const msgText = lang === 'ru'
      ? `🎁 Ваш промокод (нажмите, чтобы скопировать):\n\`${u.promoCode}\`\n\nПоделитесь им с другом — вы оба получите скидку при оплате.`
      : `🎁 Sizning promo kodingiz (bosib nusxalang):\n\`${u.promoCode}\`\n\nDo'stingiz bilan bo'lishing — ikkalangiz ham to'lovda chegirma olasiz.`;
    return renderScreen(chatId, msgText, backButton(chatId), { parse_mode: 'Markdown' });
  }
  if (data === 'promo_enter') {
    getState(chatId).mode = 'promo_enter';
    const msgText = lang === 'ru' ? 'Введите промокод друга:' : "Do'stingizning promo kodini kiriting:";
    return renderScreen(chatId, msgText, backButton(chatId));
  }
  if (data === 'lead_partner_start') {
    getState(chatId).mode = 'lead_partner';
    const msgText = lang === 'ru'
      ? 'Хотите стать партнёром VizaAI! Напишите название организации и телефон/Telegram для связи.'
      : "VizaAI'ga hamkor bo'lmoqchisiz! Tashkilotingiz nomi va telefon/Telegram'ingizni yozing.";
    return renderScreen(chatId, msgText, backButton(chatId));
  }

  } catch (err) {
    console.error('callback_query xatosi:', err);
    notifyAdmins(`🔴 Bot xatosi (callback): ${err.message || err}\n\nchatId: ${chatId}, data: ${data}`);
    // Foydalanuvchiga ham xabar beramiz, jim qolmasin
    bot.sendMessage(chatId, lang === 'ru' ? 'Произошла ошибка. Попробуйте /start заново.' : 'Xatolik yuz berdi. Iltimos, /start orqali qaytadan boshlang.').catch(() => {});
  }
});

// ---------------------------------------------------------------
// ADMIN: to'lovni tasdiqlash
// ---------------------------------------------------------------
bot.onText(/\/tasdiqla (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;
  const targetId = match[1].trim();
  const purchase = pendingPurchases.get(targetId);
  if (!purchase) return bot.sendMessage(chatId, "Bu chat_id kutilayotgan xaridlar ro'yxatida topilmadi.");

  const targetLang = getLang(targetId);
  const tt = T[targetLang];

  if (purchase.kind === 'course') {
    await bot.sendMessage(targetId, `${tt.payment_confirmed}\n\n"${purchase.name}" ${tt.join_channel}\n\n${tt.thanks}`);
  } else {
    await bot.sendMessage(targetId, `✅ "${purchase.name}" — ${tt.payment_confirmed_tour}`);
  }

  // Bazada xarid holatini "tasdiqlangan" deb belgilash
  const u = usersDB[String(targetId)];
  if (u) {
    const rec = [...u.purchases].reverse().find(p => p.status === 'pending' && p.key === purchase.key);
    if (rec) { rec.status = 'confirmed'; rec.confirmedAt = new Date().toISOString(); saveDB(); }
  }

  await bot.sendMessage(chatId, `Yuborildi: ${purchase.userLabel}`);
  sendAdminProfileCard(targetId, `To'lov TASDIQLANDI: ${purchase.name} ✅`);
  pendingPurchases.delete(targetId);
});

// ---------------------------------------------------------------
// ADMIN: statistika — /stats
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// /id — istalgan kim ham o'zining chat_id'sini bilib olishi uchun
// (yangi admin qo'shishda shu ID'ni ADMIN_CHAT_IDS ro'yxatiga qo'shasiz)
// ---------------------------------------------------------------
bot.onText(/^\/id(?:@\w+)?$/, (msg) => {
  bot.sendMessage(msg.chat.id, `Sizning chat ID'ingiz: ${msg.chat.id}`);
});

// ---------------------------------------------------------------
// /version — qaysi kod versiyasi ishlab turganini tekshirish uchun.
// Har safar bot.js yangilanganda BOT_VERSION o'zgaradi — shu orqali
// Render'da haqiqatan eng so'nggi kod deploy bo'lganini bilib olasiz.
// ---------------------------------------------------------------
bot.onText(/^\/version$/, (msg) => {
  bot.sendMessage(msg.chat.id, `🤖 Bot versiyasi: ${BOT_VERSION}\n\nIshga tushgan vaqti: ${botStartedAt}`);
});

bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;

  const users = Object.entries(usersDB);
  const total = users.length;
  const withConfirmed = users.filter(([, u]) => u.purchases.some(p => p.status === 'confirmed')).length;
  const withPendingOnly = users.filter(([, u]) =>
    u.purchases.length > 0 && !u.purchases.some(p => p.status === 'confirmed')
  ).length;
  const noPurchaseAtAll = total - withConfirmed - withPendingOnly;

  // Daromad va kurslar bo'yicha hisoblash
  const priceToNumber = (priceStr) => parseInt((priceStr || '0').replace(/[^\d]/g, ''), 10) || 0;
  const courseCounts = {};
  let totalRevenue = 0;
  users.forEach(([, u]) => {
    (u.purchases || []).forEach(p => {
      if (p.status === 'confirmed') {
        totalRevenue += priceToNumber(p.price);
        courseCounts[p.name] = (courseCounts[p.name] || 0) + 1;
      }
    });
  });
  const topCourses = Object.entries(courseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `   • ${name}: ${count} ta`)
    .join('\n');

  const text = `📊 VizaAI bot statistikasi\n\n` +
    `👥 Jami ro'yxatdan o'tganlar: ${total}\n` +
    `✅ Xarid qilganlar (tasdiqlangan): ${withConfirmed}\n` +
    `⏳ So'rov yuborgan, lekin to'lamagan: ${withPendingOnly}\n` +
    `❌ Hech narsa so'ramaganlar: ${noPurchaseAtAll}\n\n` +
    `💰 Jami daromad (tasdiqlangan): ${totalRevenue.toLocaleString('ru-RU')} so'm\n\n` +
    (topCourses ? `🏆 Eng ko'p sotilgan kurslar:\n${topCourses}\n\n` : '') +
    `Kimga qo'ng'iroq qilish kerakligini ko'rish uchun: /qongiroq\n` +
    `Hammaga xabar yuborish uchun: /xabar <matn>`;
  bot.sendMessage(chatId, text);
});

// ---------------------------------------------------------------
// ADMIN: qo'ng'iroq ro'yxati — sotib olmagan foydalanuvchilar
// ---------------------------------------------------------------
bot.onText(/\/qongiroq/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;

  const notBuyers = Object.entries(usersDB).filter(([, u]) =>
    !u.purchases.some(p => p.status === 'confirmed')
  );

  if (notBuyers.length === 0) {
    return bot.sendMessage(chatId, "Hozircha hammasi yaxshi — sotib olmagan ro'yxati bo'sh.");
  }

  const lines = notBuyers.slice(0, 50).map(([id, u]) => {
    const status = u.purchases.length > 0 ? `so'radi lekin to'lamadi (${u.purchases.length})` : "hech nima so'ramadi";
    const note = u.callNote ? ` | izoh: ${u.callNote}` : '';
    return `📱 ${u.phone || '—'} — ${u.name || '(ismsiz)'} — ${status}${note}\n   🆔 ID: ${id}\n   /tasdiqla ${id} — to'lovni tasdiqlash\n   /izoh_${id} <matn> — qo'ng'iroqdan keyin izoh yozish`;
  });

  const header = `☎️ Qo'ng'iroq qilinishi kerak (${notBuyers.length} kishi):\n\n`;
  const fullText = header + lines.join('\n\n');

  // Telegram xabar uzunligi cheklangan (~4096) — kerak bo'lsa bo'lib yuboramiz
  const chunks = fullText.match(/[\s\S]{1,3500}/g) || [fullText];
  chunks.forEach(chunk => bot.sendMessage(chatId, chunk));
});

// ---------------------------------------------------------------
// ADMIN: BARCHA foydalanuvchilarga bir vaqtda xabar yuborish
// Foydalanish: /xabar Matningiz shu yerda
// ---------------------------------------------------------------
bot.onText(/\/xabar (.+)/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;
  const broadcastText = match[1].trim();
  const allUsers = Object.keys(usersDB);

  if (allUsers.length === 0) {
    return bot.sendMessage(chatId, "Ro'yxatdan o'tgan foydalanuvchi yo'q.");
  }

  await bot.sendMessage(chatId, `⏳ ${allUsers.length} ta foydalanuvchiga yuborilmoqda...`);

  let sent = 0, failed = 0;
  for (const userId of allUsers) {
    try {
      await bot.sendMessage(userId, `📢 ${broadcastText}`);
      sent++;
    } catch (e) {
      failed++;
    }
    // Telegram'ning spam-cheklovidan qochish uchun har xabar orasida kichik tanaffus
    await new Promise(r => setTimeout(r, 60));
  }

  await bot.sendMessage(chatId, `✅ Yuborildi: ${sent} ta\n❌ Yuborilmadi: ${failed} ta (botni bloklaganlar)`);
});

// ---------------------------------------------------------------
// ADMIN: qo'ng'iroqdan keyingi izohni saqlash — /izoh_<chatId> <matn>
// ---------------------------------------------------------------
bot.onText(/\/izoh_(\d+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;
  const targetId = match[1];
  const note = match[2];
  const u = usersDB[targetId];
  if (!u) return bot.sendMessage(chatId, "Bunday foydalanuvchi topilmadi.");
  u.callNote = note;
  saveDB();
  bot.sendMessage(chatId, `✅ Izoh saqlandi: ${u.name || targetId} — "${note}"`);
});

// ---------------------------------------------------------------
// ODDIY XABARLAR: hujjat fotosi (chuqur AI tahlil), AI savol, saytdan lid
// ---------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (text.startsWith('/')) return;

  const lang = getLang(chatId);
  const t = T[lang];
  const s = getState(chatId);
  const userLabel = `${msg.from.first_name || ''} (@${msg.from.username || 'username yo\'q'}, ID: ${chatId})`;

  try {

  // ---- RO'YXATDAN O'TISH — telefon raqami qabul qilinmoqda ----
  if (s.mode === 'registering') {
    const phone = msg.contact ? msg.contact.phone_number : text.trim();
    if (!phone) {
      const hint = lang === 'ru' ? 'Пожалуйста, отправьте номер телефона.' : 'Iltimos, telefon raqamingizni yuboring.';
      return bot.sendMessage(chatId, hint);
    }
    const u = getUser(chatId);
    u.phone = phone;
    u.name = msg.from.first_name || '';
    u.username = msg.from.username || '';
    saveDB();

    // Endi tilni so'raymiz — pendingPayload saqlanib qoladi, til tanlangach davom etadi
    s.mode = 'post_reg_lang';

    await bot.sendMessage(chatId, "Rahmat! ✅ Tilni tanlang / Спасибо! Выберите язык:", {
      reply_markup: {
        remove_keyboard: true,
      },
    });
    await bot.sendMessage(chatId, "🇺🇿 / 🇷🇺", {
      reply_markup: { inline_keyboard: [[
        { text: "🇺🇿 O'zbekcha", callback_data: 'setlang_uz' },
        { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
      ]] },
    });

    notifyAdmins(`🆕 Yangi mijoz kirdi!\n\n👤 ${userLabel}\n📱 ${phone}\n\n⏳ 5 daqiqadan so'ng uning bot ichidagi faoliyati haqida qo'shimcha xabar keladi...`);

    // 5 daqiqadan keyin — mijoz shu vaqt ichida bot ichida nima qilgani haqida to'liq xulosa
    setTimeout(() => {
      sendAdminProfileCard(chatId, "Kirganidan 5 daqiqa o'tdi — bot ichidagi faoliyati");
    }, 5 * 60 * 1000);

    return;
  }

  // ---- PROMO KOD KIRITISH ----
  if (s.mode === 'promo_enter' && text) {
    clearPendingState(chatId);
    const found = findUserByPromoCode(text);
    const myCode = getUser(chatId).promoCode;

    if (!found) {
      const msgText = lang === 'ru' ? '❌ Такой промокод не найден. Проверьте и попробуйте снова через меню.' : "❌ Bunday promo kod topilmadi. Tekshirib, menyudan qayta urinib ko'ring.";
      return sendContent(chatId, msgText, { reply_markup: backButton(chatId) });
    }
    const [ownerId] = found;
    if (String(ownerId) === String(chatId)) {
      const msgText = lang === 'ru' ? "❌ Нельзя использовать свой собственный промокод." : "❌ O'zingizning promo kodingizni ishlata olmaysiz.";
      return sendContent(chatId, msgText, { reply_markup: backButton(chatId) });
    }
    const u = getUser(chatId);
    u.referredBy = text.trim().toUpperCase();
    saveDB();
    const msgText = lang === 'ru'
      ? `✅ Промокод принят! При покупке курса скидка будет применена автоматически.`
      : `✅ Promo kod qabul qilindi! Kurs sotib olganingizda chegirma avtomatik qo'llaniladi.`;
    return sendContent(chatId, msgText, { reply_markup: backButton(chatId) });
  }


  // Rasm ikki xil kelishi mumkin: siqilgan "Photo" (msg.photo) yoki original
  // sifatli "Fayl/Document" (msg.document) — ikkalasini ham qo'llab-quvvatlaymiz.
  // MUHIM: bu endi "holatsiz" (stateless) ishlaydi — foydalanuvchi oldin tugma
  // bosishi shart emas, istalgan payt rasm/hujjat yuborsa, avtomatik tahlil qilinadi.
  // (Avval "s.mode === 'doc'" talab qilinardi, lekin server qayta ishga tushganda
  // bu holat yo'qolib, foydalanuvchiga noto'g'ri xabar ko'rsatilishi mumkin edi.)
  const isImageDocument = msg.document && msg.document.mime_type && msg.document.mime_type.startsWith('image/');

  // ---- TO'LOV CHEKI — bot hech narsani tahlil qilmaydi/tekshirmaydi,
  // shunchaki foydalanuvchini to'g'ridan-to'g'ri adminga yuborishga yo'naltiradi ----
  if ((msg.photo || msg.document) && pendingPurchases.has(String(chatId))) {
    const confirmMsg = lang === 'ru'
      ? `Чтобы получить доступ к каналу курса, отправьте скриншот чека напрямую администратору: ${ADMIN_CONTACT_USERNAME}`
      : `Video darslik kanaliga ruxsat olish uchun, chek skrinshotini to'g'ridan-to'g'ri adminga yuboring: ${ADMIN_CONTACT_USERNAME}`;
    await sendContent(chatId, confirmMsg, { reply_markup: backButton(chatId) });
    return;
  }

  // ---- Rasm bo'lmagan fayl (masalan PDF) — aniq ko'rsatma beramiz ----
  if (msg.document && !isImageDocument && s.mode !== 'registering' && s.mode !== 'lead_consult' && s.mode !== 'lead_partner') {
    const hint = lang === 'ru'
      ? `Этот файл (${msg.document.mime_type || 'неизвестный формат'}) я пока не могу прочитать. Отправьте, пожалуйста, документ как изображение (JPG, PNG) — например, сделайте скриншот или экспортируйте страницу PDF как фото.`
      : `Bu fayl turini (${msg.document.mime_type || "noma'lum format"}) hozircha o'qiy olmayman. Iltimos, hujjatni rasm (JPG, PNG) sifatida yuboring — masalan, skrinshot oling yoki PDF sahifasini rasm sifatida eksport qiling.`;
    return sendContent(chatId, hint, { reply_markup: backButton(chatId) });
  }

  // ---- Hujjat fotosi/fayli — CHUQUR AI TAHLILI (Claude vision, aniq ma'lumotlar bilan) ----
  if ((msg.photo || isImageDocument) && s.mode !== 'registering' && s.mode !== 'lead_consult' && s.mode !== 'lead_partner') {
    const docCheckCountry = s.docCheckCountry; // clearPendingState hali chaqirilmagan, shuning uchun mavjud
    const docCheckMatchedBefore = (s.docCheckMatched || []).slice(); // nusxa olamiz, chunki keyingi qator uni tozalaydi
    clearPendingState(chatId);
    if (docCheckCountry) { getState(chatId).docCheckCountry = docCheckCountry; getState(chatId).docCheckMatched = docCheckMatchedBefore; }

    const analyzing = await bot.sendMessage(chatId, t.doc_analyzing);
    let stage = 'boshlanish';
    try {
      stage = 'faylni yuklab olish';
      const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
      const fileLink = await bot.getFileLink(fileId);
      const { buffer, contentType } = await downloadFileAsBuffer(fileLink);
      const sizeMb = buffer.length / (1024 * 1024);
      if (sizeMb > 4.5) throw new Error(`Rasm hajmi juda katta (${sizeMb.toFixed(1)}MB) — 4.5MB dan kichikroq rasm yuboring`);
      const base64 = buffer.toString('base64');
      const rawMediaType = (msg.document && msg.document.mime_type) || contentType;
      const mediaType = sanitizeImageMediaType(rawMediaType);

      const country = docCheckCountry ? COUNTRIES.find(c => c.key === docCheckCountry) : null;

      if (country) {
        // ---- CHECKLIST-ASOSLI TEKSHIRUV: hujjat qaysi bandga mos kelishini aniqlaydi ----
        stage = 'AI orqali checklistga solishtirish';
        const checklistText = country.items.map((it, i) => `${i + 1}. ${it[0]}`).join('\n');
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: `Siz hujjat tekshiruvchi AI'siz. Foydalanuvchi "${country.name}" vizasi uchun quyidagi hujjatlar ro'yxatidan birini yubordi:
${checklistText}

Rasmni ko'rib, u YUQORIDAGI ro'yxatdagi QAYSI raqamga (band raqamiga) eng mos kelishini aniqlang.
Javobingiz FAQAT shu formatda bo'lsin, boshqa hech narsa yozmang:
BAND: <raqam yoki "0" agar mos kelmasa>
SIFAT: <qisqa, 1 gap — aniq/sifatli yoki muammo bormi>`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: "Bu hujjat qaysi bandga mos keladi?" },
            ],
          }],
        });
        stage = "javobni qayta ishlash";
        const feedback = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        const bandMatch = feedback.match(/BAND:\s*(\d+)/i);
        const sifatMatch = feedback.match(/SIFAT:\s*([^\n]+)/i);
        const bandNum = bandMatch ? parseInt(bandMatch[1], 10) : 0;
        const sifatText = sifatMatch ? sifatMatch[1].trim() : '';

        await bot.deleteMessage(chatId, analyzing.message_id).catch(() => {});

        const sCur = getState(chatId);
        if (bandNum >= 1 && bandNum <= country.items.length) {
          const idx = bandNum - 1;
          if (!sCur.docCheckMatched.includes(idx)) sCur.docCheckMatched.push(idx);
          const itemName = lang === 'ru' ? country.items[idx][1] : country.items[idx][0];
          const readyPctNow = Math.round((sCur.docCheckMatched.length / country.items.length) * 100);

          // Keyingi yetishmayotgan hujjatni topamiz va aniq nomi bilan so'raymiz
          const nextMissingIdx = country.items.findIndex((it, i) => !sCur.docCheckMatched.includes(i));
          let nextPrompt;
          if (nextMissingIdx === -1) {
            nextPrompt = lang === 'ru'
              ? `\n\n🎉 Все документы получены! Нажмите "Завершить проверку" ниже.`
              : `\n\n🎉 Barcha hujjatlar qabul qilindi! Pastdagi "Tekshirishni yakunlash" tugmasini bosing.`;
          } else {
            const nextName = lang === 'ru' ? country.items[nextMissingIdx][1] : country.items[nextMissingIdx][0];
            nextPrompt = lang === 'ru'
              ? `\n\n📸 Следующий документ: "${nextName}"`
              : `\n\n📸 Keyingi hujjat: "${nextName}"`;
          }

          const progressText = lang === 'ru'
            ? `✅ Принято: "${itemName}"\n${sifatText}\n\nГотовность: ${readyPctNow}% (${sCur.docCheckMatched.length}/${country.items.length})${nextPrompt}`
            : `✅ Qabul qilindi: "${itemName}"\n${sifatText}\n\nTayyorlik: ${readyPctNow}% (${sCur.docCheckMatched.length}/${country.items.length})${nextPrompt}`;
          await sendContent(chatId, progressText, { reply_markup: { inline_keyboard: [
            [{ text: lang === 'ru' ? '✅ Завершить проверку' : "✅ Tekshirishni yakunlash", callback_data: 'doccheck_finish' }],
            [{ text: t.to_menu, callback_data: 'menu' }],
          ] } });
        } else {
          const noMatchText = lang === 'ru'
            ? `⚠️ Не удалось точно определить, к какому пункту относится этот документ. Попробуйте отправить более чёткое фото, или отправьте следующий документ.`
            : `⚠️ Bu hujjat ro'yxatdagi qaysi bandga tegishli ekanini aniq belgilay olmadim. Aniqroq rasm yuboring yoki keyingi hujjatni yuboring.`;
          await sendContent(chatId, noMatchText, { reply_markup: { inline_keyboard: [
            [{ text: lang === 'ru' ? '✅ Завершить проверку' : "✅ Tekshirishni yakunlash", callback_data: 'doccheck_finish' }],
            [{ text: t.to_menu, callback_data: 'menu' }],
          ] } });
        }
        return;
      }

      // ---- UMUMIY TAHLIL (checklist tanlanmagan bo'lsa — orqaga moslik) ----
      stage = 'AI orqali tahlil qilish';
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Siz hujjat tekshiruvchi va undan ma'lumot o'qib beruvchi AI'siz. ${lang === 'ru' ? 'Отвечайте на русском.' : "O'zbek tilida javob bering."}
Rasmni diqqat bilan o'qib, ANIQ shu tuzilishda javob bering (sarlavhalarni saqlang):

📄 Hujjat turi: (pasport, ID karta, bank hujjati, anketa va h.k.)
👤 F.I.Sh: (agar ko'rinsa)
📅 Tug'ilgan sana:
🔢 Hujjat raqami / PINFL:
📆 Amal qilish muddati:
✅ Sifat va muammolar: (aniqlik, yorug'lik, kesilmaganlik, muddati o'tganmi va h.k. — 1-2 gap)
💡 Tavsiya: (1 gap)

QOIDA: Agar biror maydonni rasmda aniq o'qiy olmasangiz, "aniq emas / ko'rinmayapti" deb yozing — hech qachon o'zingiz to'qib yozmang.
Oxiriga albatta shuni qo'shing: "⚠️ Bu AI orqali o'qilgan ma'lumot, xatolik bo'lishi mumkin — muhim raqamlarni (PINFL, hujjat raqami) qo'lda solishtirib tekshiring. Bu rasmiy tekshiruv emas."`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: lang === 'ru' ? 'Прочитайте и проанализируйте этот документ.' : "Bu hujjatni o'qib, tahlil qilib bering." },
          ],
        }],
      });

      stage = "javobni qayta ishlash";
      const feedback = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (!feedback) throw new Error('AI bo\'sh javob qaytardi');

      await bot.deleteMessage(chatId, analyzing.message_id).catch(() => {});
      await sendContent(chatId, `📄 ${feedback}`, { reply_markup: backButton(chatId) });

      const u = getUser(chatId);
      u.docChecksCount += 1;
      // Qisqa xotira — keyingi suhbatlarda AI shuni hisobga oladi
      const docTypeMatch = feedback.match(/Hujjat turi:\s*([^\n]+)/i);
      u.docHistory = u.docHistory || [];
      u.docHistory.push({ type: (docTypeMatch ? docTypeMatch[1].trim() : "noma'lum hujjat").slice(0, 60), date: new Date().toISOString() });
      u.docHistory = u.docHistory.slice(-10); // faqat oxirgi 10 tasi saqlanadi
      saveDB();
    } catch (err) {
      console.error(`Hujjat tahlili xatosi (bosqich: ${stage}):`, err);
      await bot.deleteMessage(chatId, analyzing.message_id).catch(() => {});
      await sendContent(chatId, t.ai_error, { reply_markup: backButton(chatId) });
      // Admin uchun ANIQ qaysi bosqichda va nima sababdan xato bo'lganini ko'rsatamiz
      notifyAdmins(`🔴 Hujjat tahlilida xato!\n\nBosqich: ${stage}\nXato: ${err.message || err}\n\nFoydalanuvchi: ${userLabel}`);
    }
    return;
  }

  // ---- Premium konsultatsiya / Hamkorlik — foydalanuvchi ism/telefon yozdi ----
  if ((s.mode === 'lead_consult' || s.mode === 'lead_partner') && text) {
    const kind = s.mode === 'lead_consult' ? 'Premium konsultatsiya' : 'Hamkorlik so\'rovi';
    clearPendingState(chatId);
    await sendContent(chatId, t.lead_ok, { reply_markup: backButton(chatId) });
    notifyAdmins(`📩 ${kind}!\n\nMa'lumot: ${text}\n\n👤 Yuboruvchi: ${userLabel}`);
    return;
  }

  // ---- Saytdan kelgan lid xabari ----
  if (text.startsWith('🆕 Yangi lid')) {
    await bot.sendMessage(chatId, t.lead_ok);
    notifyAdmins(`📩 Yangi lid keldi:\n\n${text}\n\n👤 Yuboruvchi: ${userLabel}`);
    return;
  }

  // ---- AI yordamchi / erkin savol ----
  if (text) {
    const u = getUser(chatId);
    const isPaying = (u.purchases || []).some(p => p.status === 'confirmed');
    const limit = isPaying ? 25 : 5;
    u.aiQuestionCount = (u.aiQuestionCount || 0) + 1;

    if (u.aiQuestionCount > limit) {
      const limitMsg = isPaying
        ? (lang === 'ru' ? `Вы использовали лимит в ${limit} вопросов. Обратитесь к нашему специалисту через "Премиум-консультацию".` : `Siz ${limit} ta savol limitidan foydalandingiz. "Premium konsultatsiya" orqali mutaxassisimizga murojaat qiling.`)
        : (lang === 'ru'
            ? `Вы использовали ${limit} бесплатных вопросов AI на сегодня 🙌\n\nВ платных тарифах (после покупки любого курса) лимит увеличивается до 25 вопросов. Также вы можете купить курс — там разбираются все детали.`
            : `Siz bugungi ${limit} ta bepul AI savolingizdan foydalandingiz 🙌\n\nPullik tariflarda (istalgan kursni sotib olganingizdan keyin) limit 25 tagacha oshadi. Yoki kursni sotib oling — u yerda barcha detallar ochib berilgan.`);
      u.aiQuestionCount -= 1; // hisoblamaymiz, chunki javob berilmadi
      saveDB();
      return sendContent(chatId, limitMsg, { reply_markup: { inline_keyboard: [
        [{ text: lang === 'ru' ? '🎬 Смотреть курсы' : "🎬 Kurslarni ko'rish", callback_data: 'courses' }],
        [{ text: t.to_menu, callback_data: 'menu' }],
      ] } });
    }
    saveDB();

    try {
      await bot.sendChatAction(chatId, 'typing');
      const history = conversations.get(chatId) || [];
      history.push({ role: 'user', content: text });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: buildSystemPrompt(lang, chatId),
        messages: history,
      });

      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      history.push({ role: 'assistant', content: reply });
      conversations.set(chatId, history.slice(-10));

      // Agar AI javobida biror kurs tilga olingan bo'lsa — "Sotib olish"
      // tugmasini to'g'ridan-to'g'ri shu xabarga qo'shamiz
      const recommendedKey = detectMentionedCourse(reply);
      const keyboard = { inline_keyboard: [] };
      if (recommendedKey) {
        const course = COURSE_CHANNELS[recommendedKey];
        const courseName = lang === 'ru' ? course.nameRu : course.name;
        const buyLabel = lang === 'ru' ? `🎬 Купить: ${courseName} — ${course.price}` : `🎬 Sotib olish: ${courseName} — ${course.price}`;
        keyboard.inline_keyboard.push([{ text: buyLabel, callback_data: `buy_course_${recommendedKey}` }]);
      }
      keyboard.inline_keyboard.push([{ text: t.to_menu, callback_data: 'menu' }]);

      await sendContent(chatId, reply, { reply_markup: keyboard });
    } catch (err) {
      console.error('AI xatosi:', err);
      await sendContent(chatId, t.ai_error, { reply_markup: backButton(chatId) });
    }
  }

  } catch (err) {
    console.error('message xatosi:', err);
    notifyAdmins(`🔴 Bot xatosi (message): ${err.message || err}\n\nchatId: ${chatId}`);
    bot.sendMessage(chatId, lang === 'ru' ? 'Произошла ошибка. Попробуйте /start заново.' : 'Xatolik yuz berdi. Iltimos, /start orqali qaytadan boshlang.').catch(() => {});
  }
});

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

// ---------------------------------------------------------------
// GLOBAL XAVFSIZLIK TARMOG'I — hech qanday kutilmagan xato butun
// botni butunlay o'chirib qo'ymasligi uchun oxirgi himoya chizig'i.
// ---------------------------------------------------------------
process.on('unhandledRejection', (err) => {
  console.error('Ushlanmagan promise xatosi:', err);
  notifyAdmins(`🔴 Kutilmagan bot xatosi (unhandledRejection): ${err && err.message ? err.message : err}`);
});
process.on('uncaughtException', (err) => {
  console.error('Ushlanmagan xato:', err);
  notifyAdmins(`🔴 Kutilmagan bot xatosi (uncaughtException): ${err && err.message ? err.message : err}`);
});

console.log(`VizaAI bot ishga tushdi ✅ | Versiya: ${BOT_VERSION}`);
