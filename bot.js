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
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const SITE_URL = 'https://vizaai.uz';

// ---------------------------------------------------------------
// TIL (uz / ru)
// ---------------------------------------------------------------
const userLang = new Map();
function getLang(chatId) { return userLang.get(chatId) || 'uz'; }

const T = {
  uz: {
    welcome: "Assalomu alaykum! VizaAI botiga xush kelibsiz 👋\n\nBu yerda viza imkoniyatingizni tekshirasiz, davlat bo'yicha hujjatlarni olasiz, hujjat fotosini AI bilan tahlil qilasiz va video darslik yoki tur paketini tanlaysiz.\n\n🔥 *Eng ommabop*: Shengen video kursi — 199 000 so'm. Yoki barcha kurslar paketi — 999 000 so'm (1 700 000 o'rniga)!\n\nBoshlash uchun kerakli tugmani bosing:",
    menu_chance: "🧠 Viza imkoniyati testi",
    menu_services: "🗂️ Viza xizmatlari",
    menu_docs: "📸 Hujjatni AI tekshirish",
    menu_courses: "🎓 Video darsliklar",
    menu_tours: "✈️ Tur paketlar",
    menu_ai: "🤖 AI yordamchi",
    menu_other: "🚩 Boshqa imkoniyatlar",
    menu_lang: "🌐 Til / Язык",
    menu_featured: "🔥 Barcha kurslar (-40%)",
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
    purchase_pay: "To'lov qilish uchun rekvizitlarga o'ting va skrinshotni shu yerga yuboring. Tasdiqlangach, kurs kanaliga havola yuboriladi.",
    tour_request_ok: "So'rovingiz qabul qilindi! Tur agentligi hamkorimiz siz bilan tez orada bog'lanadi.",
    lead_ok: "✅ So'rovingiz qabul qilindi! Tez orada operatorlarimiz siz bilan bog'lanadi.",
    ai_error: "Kechirasiz, hozir javob berolmayapman. Birozdan keyin qayta urinib ko'ring.",
    chance_start: "Viza imkoniyati testini boshlaymiz — savollarga tugma orqali javob bering.",
    chance_result_head: "PROFIL MOSLIGI",
    chance_disclaimer: "⚠️ Bu ball viza berilish kafolati emas. Yakuniy qarorni konsullik yoki elchixona qabul qiladi.",
    chance_cta: "\n\n💡 Profilingizni kuchaytirish uchun mos video kursimiz bor — \"Video darsliklar\" bo'limini ko'ring!",
  },
  ru: {
    welcome: "Здравствуйте! Добро пожаловать в бот VizaAI 👋\n\nЗдесь вы можете проверить визовые шансы, получить документы по стране, проанализировать фото документа через AI и выбрать видеокурс или турпакет.\n\n🔥 *Самый популярный*: курс по Шенгену — 199 000 сум. Или пакет всех курсов — 999 000 сум (вместо 1 700 000)!\n\nНажмите нужную кнопку, чтобы начать:",
    menu_chance: "🧠 Тест визовых шансов",
    menu_services: "🗂️ Визовые услуги",
    menu_docs: "📸 Проверка документа AI",
    menu_courses: "🎓 Видеокурсы",
    menu_tours: "✈️ Турпакеты",
    menu_ai: "🤖 AI-помощник",
    menu_other: "🚩 Другие возможности",
    menu_lang: "🌐 Til / Язык",
    menu_featured: "🔥 Все курсы (-40%)",
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
    purchase_pay: "Перейдите к оплате по реквизитам и отправьте скриншот сюда. После подтверждения будет отправлена ссылка на канал курса.",
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
    ["Anketa","Visa application form to'ldiriladi","Заполняется форма Visa application form"],
    ["Pasport","Kamida 6 oy amal qilishi kerak","Должен действовать минимум 6 месяцев"],
    ["ID karta","Ikkala tomoni skanerlanadi","Сканируются обе стороны"],
    ["Foto 3x4","Oq fonda, so'nggi 6 oylik","На белом фоне, не старше 6 месяцев"],
    ["Aviabilet bron","Bordi-keldi bron","Бронь в обе стороны"],
    ["Hotel bron","Butun sayohat davri uchun","На весь период поездки"],
    ["Sug'urta","Xalqaro sayohat sug'urtasi","Международная туристическая страховка"],
    ["Bank spravka","6 oylik karta aylanmasi","Оборот по карте за 6 месяцев"],
    ["Sayohat rejasi","Kunlik marshrut","Ежедневный маршрут"],
  ]},
  { key:"schengen", flag:"🇪🇺", name:"Shengen", nameRu:"Шенген", items:[
    ["Pasport","Kamida 3 oy amal qilishi kerak","Должен действовать минимум 3 месяца"],
    ["Anketa, foto va yig'im","VIDEX shakli, foto, konsullik yig'imi","Форма VIDEX, фото, консульский сбор"],
    ["Moliyaviy hujjatlar","Bank hisob ko'chirmasi","Банковская выписка"],
    ["Ish/o'qish holati","Ish yoki o'qish joyidan spravka","Справка с места работы или учёбы"],
    ["Aviabilet va turar joy","Bron nusxalari","Копии брони"],
    ["Tibbiy sug'urta","Kamida €30 000 qamrovli","Покрытие не менее €30 000"],
    ["Sayohat maqsadi","Turizm/qarindosh/biznes hujjati","Документ о туризме/родственниках/бизнесе"],
    ["Qo'shimcha hujjatlar","Eski pasport, nikoh va h.k.","Старый паспорт, свидетельство о браке и т.д."],
    ["Voyaga yetmaganlar uchun","Agar kerak bo'lsa","Если требуется"],
  ]},
  { key:"usa", flag:"🇺🇸", name:"AQSH", nameRu:"США", items:[
    ["Pasport","Amaldagi va eski pasportlar","Действующий и старые паспорта"],
    ["DS-160 tasdiqnomasi","Shtrix-kodli sahifa","Страница со штрихкодом"],
    ["Sobesedovaniya bron","Elchixona uchrashuvi","Встреча в посольстве"],
    ["Konsullik yig'imi","MRV to'lov kvitansiyasi","Квитанция об оплате MRV"],
    ["Foto 5x5 sm","Zaxira fotosurat","Запасная фотография"],
    ["Bank hisob ko'chirmasi","So'nggi 3-6 oylik","За последние 3–6 месяцев"],
    ["Ish/o'qish ma'lumotnomasi","Bandlik holatini tasdiqlash","Подтверждение занятости"],
    ["Mulk va oila hujjatlari","Qo'shimcha bog'liqlik dalili","Дополнительное доказательство связей"],
    ["Sayohat rejasi","Taxminiy marshrut","Примерный маршрут"],
  ]},
  { key:"uk", flag:"🇬🇧", name:"Buyuk Britaniya", nameRu:"Великобритания", items:[
    ["Pasport hujjatlari","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
    ["Bank kartalari aylanmasi","12 va 4 oylik spravkalar","Справки за 12 и 4 месяца"],
    ["Ish va daromad ma'lumotlari","mygov.uz, soliq.uz","Через mygov.uz, soliq.uz"],
    ["Biznes hujjatlari","Ish beruvchi tomonidan","Со стороны работодателя"],
    ["Mulk va aktivlar","Ko'chmas mulk, avtomobil","Недвижимость, автомобиль"],
    ["Manzil va sayohat tarixi","mygov.uz orqali","Через mygov.uz"],
    ["Oila hujjatlari","Kerak bo'lganda taqdim etiladi","Предоставляется при необходимости"],
    ["Sayohat hujjatlari","Reja, sug'urta, bilet, bron","План, страховка, билет, бронь"],
  ]},
  { key:"brazil", flag:"🇧🇷", name:"Braziliya", nameRu:"Бразилия", items:[
    ["Pasport","Kamida 6 oy amal qilishi kerak","Должен действовать минимум 6 месяцев"],
    ["Anketa va foto","E-konsullik portali orqali","Через портал электронного консульства"],
    ["Uchrashuv tasdiqnomasi","Konsullikka yozilish","Запись в консульство"],
    ["Moliyaviy hujjatlar","3 oylik bank ko'chirmasi","Банковская выписка за 3 месяца"],
    ["Ish/tadbirkorlik holati","NOC, payslip yoki biznes hujjat","NOC, расчётный лист или бизнес-документ"],
    ["Aviabilet va turar joy","Bron nusxalari","Копии брони"],
    ["Sayohat sug'urtasi","Majburiy hujjat","Обязательный документ"],
    ["Sayohat rejasi va cover letter","Maqsad va marshrut","Цель и маршрут"],
    ["Qo'shimcha hujjatlar","Holatga qarab talab qilinadi","Требуется в зависимости от ситуации"],
  ]},
];

const WORK_CHECKLIST = [
  ["Pasport hujjatlari","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
  ["Bank kartalari aylanmasi","12 va 4 oylik spravkalar","Справки за 12 и 4 месяца"],
  ["Ish va daromad ma'lumotlari","mygov.uz, soliq.uz orqali","Через mygov.uz, soliq.uz"],
  ["Biznes hujjatlari","Ish beruvchi tomonidan taqdim etiladi","Предоставляется работодателем"],
  ["Mulk va aktivlar","Ko'chmas mulk, avtomobil guvohnomasi","Недвижимость, свидетельство на авто"],
  ["Manzil va sayohat tarixi","mygov.uz orqali tasdiqlanadi","Подтверждается через mygov.uz"],
  ["Oila hujjatlari","Kerak bo'lganda taqdim etiladi","Предоставляется при необходимости"],
  ["Sayohat hujjatlari","Reja, sug'urta, bilet, bron","План, страховка, билет, бронь"],
];

const STUDENT_CHECKLIST = [
  ["Pasport va ID","Xalqaro pasport, ID karta","Загранпаспорт, ID-карта"],
  ["Bank kartalari aylanmasi","Shaxsiy hisob ko'chirmasi","Личная банковская выписка"],
  ["O'qish hujjatlari","Study certificate, no objection certificate","Study certificate, no objection certificate"],
  ["Homiyning hujjatlari","Pasport, ish, daromad, bank aylanmasi, mulk","Паспорт, работа, доход, оборот, имущество"],
  ["Qo'llab-quvvatlash xati","Homiy tomonidan yozilgan xat","Письмо от спонсора"],
  ["Sayohat hujjatlari","Reja, aviabilet, mehmonxona bron","План, авиабилет, бронь отеля"],
  ["Tibbiy sug'urta","Butun o'qish davri uchun","На весь период учёбы"],
  ["Ota-ona roziligi","18 yoshgacha bo'lganlar uchun (notarial)","Для лиц до 18 лет (нотариально)"],
  ["Oila hujjatlari","Nikoh/farzand guvohnomasi (agar kerak bo'lsa)","Свидетельство о браке/рождении (если нужно)"],
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
  ["Qaysi davlatlar bilan ishlaysiz?", "Yaponiya, Shengen, AQSH, Buyuk Britaniya va Braziliya uchun to'liq tayyor yo'riqnomalar bor. Boshqa istalgan davlat bo'yicha AI yordamchi orqali maslahat olishingiz mumkin.",
   "С какими странами вы работаете?", "Есть готовые полные инструкции по Японии, Шенгену, США, Великобритании и Бразилии. По любой другой стране можно получить совет через AI-помощника."],
  ["To'lovni qanday amalga oshiraman?", "Pullik xizmatlar (video darslik, premium konsultatsiya) uchun to'lov usullari tez orada e'lon qilinadi.",
   "Как произвести оплату?", "Способы оплаты платных услуг (видеокурсы, премиум-консультация) будут объявлены в ближайшее время."],
];

const COURSE_CHANNELS = {
  kurs_shengen:    { name: 'Shengen vizasi: to‘liq kurs',       nameRu: 'Виза Шенген: полный курс',        price: '199 000 so‘m', link: 'HAVOLA_BU_YERGA_SHENGEN' },
  kurs_yaponiya:   { name: 'Yaponiya turistik vizasi',          nameRu: 'Туристическая виза Японии',       price: '149 000 so‘m', link: 'HAVOLA_BU_YERGA_YAPONIYA' },
  kurs_aqsh:       { name: 'AQSH B1/B2: anketa va suhbat',      nameRu: 'США B1/B2: анкета и собеседование', price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_AQSH' },
  kurs_uk:         { name: 'Buyuk Britaniya visitor vizasi',    nameRu: 'Виза посетителя Великобритании',  price: '199 000 so‘m', link: 'HAVOLA_BU_YERGA_UK' },
  kurs_talaba:     { name: 'Talaba vizasi: qabuldan vizagacha', nameRu: 'Студенческая виза: от поступления до визы', price: '159 000 so‘m', link: 'HAVOLA_BU_YERGA_TALABA' },
  kurs_ishchi:     { name: 'Ishchi vizaga tayyorgarlik',        nameRu: 'Подготовка к рабочей визе',       price: '169 000 so‘m', link: 'HAVOLA_BU_YERGA_ISHCHI' },
  kurs_hongkong:   { name: 'Hong Kong vizasi',                  nameRu: 'Виза Гонконга',                   price: '59 000 so‘m',  link: 'HAVOLA_BU_YERGA_HONGKONG' },
  kurs_avstraliya: { name: 'Avstraliya visitor vizasi',         nameRu: 'Виза посетителя Австралии',       price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_AVSTRALIYA' },
  kurs_kanada:     { name: 'Kanada visitor vizasi',             nameRu: 'Виза посетителя Канады',          price: '299 000 so‘m', link: 'HAVOLA_BU_YERGA_KANADA' },
  kurs_barchasi:   { name: 'Barcha video darsliklar paketi',    nameRu: 'Пакет всех видеокурсов',          price: '999 000 so‘m', link: 'HAVOLA_BU_YERGA_BARCHASI' },
};

const TOUR_PACKAGES = {
  tur_turkiya:  { name: 'Turkiya turi',  nameRu: 'Тур в Турцию',   price: '599$' },
  tur_vetnam:   { name: 'Vyetnam turi',  nameRu: 'Тур во Вьетнам', price: '699$' },
  tur_europa:   { name: 'Yevropa turi',  nameRu: 'Тур в Европу',   price: '1799$' },
  tur_yaponiya: { name: 'Yaponiya turi', nameRu: 'Тур в Японию',   price: '1250$' },
};

// ---------------------------------------------------------------
// AI SYSTEM PROMPT — kurslarni faol targ'ib qiluvchi
// ---------------------------------------------------------------
function buildSystemPrompt(lang) {
  const langName = lang === 'ru' ? 'ruscha (rus tilida)' : "o'zbekcha";
  return `Siz VizaAI — viza va sayohat tayyorgarligi bo'yicha Telegram yordamchisiz. ${langName} tilda, qisqa (3-6 gap) va aniq javob bering.

VIZAAI HAQIDA:
- Bepul: hujjatlar checklisti, AI yordamchi (shu chat), viza imkoniyati testi.
- PULLIK VIDEO KURSLAR (bularni faol tavsiya qiling — bu bizning asosiy daromad manbai):
  Shengen (199 000 so'm), Yaponiya (149 000), AQSH B1/B2 (299 000), Buyuk Britaniya (199 000),
  Talaba vizasi (159 000), Ishchi viza (169 000), Hong Kong (59 000), Avstraliya (299 000), Kanada (299 000),
  yoki BARCHA KURSLAR PAKETI — 999 000 so'm (1 700 000 o'rniga, ~40% chegirma).
- Tur paketlar: Turkiya ($599), Vyetnam ($699), Yevropa ($1799), Yaponiya ($1250).
- Premium konsultatsiya — hamkor mutaxassis bilan shaxsiy maslahat.

MUHIM QOIDA — KURSLARNI REKLAMA QILISH:
Deyarli har bir javobingiz oxirida, mavzuga mos keladigan aniq video kursni **qisqa va tabiiy** tarzda eslatib o'ting.
Masalan: agar Shengen haqida so'ralsa — "Shengen bo'yicha to'liq video kursimiz bor (199 000 so'm) — barcha bosqichlarni bosqichma-bosqich ko'rsatadi."
Agar umumiy savol bo'lsa — "Barcha kurslar paketini ko'rib chiqing — 999 000 so'mga 9 ta davlat kursi, 40% chegirma bilan."
Bu majburiy emas, lekin JUDA tavsiya etiladi — bizning maqsadimiz odamlarni kurslarga yo'naltirish.

QOIDALAR:
- Viza kafolatlanishi haqida HECH QACHON va'da bermang.
- Agar savol viza/sayohat/hujjatlarga aloqasi bo'lmasa, muloyimlik bilan mavzuga qaytaring.`;
}

// ---------------------------------------------------------------
// FOYDALANUVCHI HOLATI
// ---------------------------------------------------------------
const userState = new Map(); // chatId -> { mode, chanceStep, chanceScore, screenMsgId }
function getState(chatId) {
  if (!userState.has(chatId)) userState.set(chatId, { mode: 'idle', chanceStep: 0, chanceScore: {}, screenMsgId: null });
  return userState.get(chatId);
}
function clearPendingState(chatId) {
  const s = getState(chatId);
  s.mode = 'idle'; s.chanceStep = 0; s.chanceScore = {};
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
  { key:'travelHistory', q:{uz:"Oxirgi 5 yilda nechta xorijiy safar qilgansiz?", ru:"Сколько поездок за границу было за 5 лет?"},
    options:[
      {uz:"3 va undan ko'p",ru:"3 и более",points:20},
      {uz:"1–2 marta",ru:"1–2 раза",points:12},
      {uz:"Hech qachon",ru:"Ни разу",points:5},
    ]},
  { key:'priorVisa', q:{uz:"Shengen/AQSH/UK/Yaponiya vizasi bo'lganmi?", ru:"Была ли виза Шенгена/США/Великобритании/Японии?"},
    options:[
      {uz:"Ha, muddatida qaytganman",ru:"Да, вернулся вовремя",points:15},
      {uz:"Yo'q",ru:"Нет",points:5},
    ]},
  { key:'rejection', q:{uz:"Oldin viza rad javobi bo'lganmi?", ru:"Были ли раньше отказы в визе?"},
    options:[
      {uz:"Yo'q",ru:"Не было",points:10},
      {uz:"Bo'lgan, sababi bartaraf etilgan",ru:"Был, причина устранена",points:6},
      {uz:"Bo'lgan, hali ham dolzarb",ru:"Был, причина ещё актуальна",points:0},
    ]},
];
const CHANCE_MAX_SCORE = CHANCE_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);

function chanceQuestionKeyboard(stepIdx, lang) {
  const step = CHANCE_QUESTIONS[stepIdx];
  const rows = step.options.map((o, i) => ([{ text: o[lang], callback_data: `chance_ans_${stepIdx}_${i}` }]));
  return { inline_keyboard: rows };
}
function chanceQuestionText(stepIdx, lang) {
  const step = CHANCE_QUESTIONS[stepIdx];
  return `[${stepIdx + 1}/${CHANCE_QUESTIONS.length}] ${step.q[lang]}`;
}
function computeChanceResult(chatId) {
  const s = getState(chatId);
  const lang = getLang(chatId);
  const total = Object.values(s.chanceScore).reduce((a, b) => a + b, 0);
  const pct = Math.round((total / CHANCE_MAX_SCORE) * 100);
  let verdict;
  if (lang === 'ru') {
    verdict = pct >= 80 ? 'Профиль выглядит сильным' : pct >= 60 ? 'Профиль хороший, есть отдельные риски' : pct >= 40 ? 'Профиль средний' : 'Профиль нужно серьёзно усилить';
  } else {
    verdict = pct >= 80 ? "Profil kuchli ko'rinadi" : pct >= 60 ? 'Profil yaxshi, ayrim xavflar bor' : pct >= 40 ? "Profil o'rtacha" : 'Profilni jiddiy kuchaytirish kerak';
  }
  const t = T[lang];
  return `📊 ${t.chance_result_head}: ${pct}%\n\n${verdict}\n\n${t.chance_disclaimer}${t.chance_cta}`;
}

// ---------------------------------------------------------------
// ASOSIY MENYU
// ---------------------------------------------------------------
function mainMenuKeyboard(chatId) {
  const t = T[getLang(chatId)];
  return {
    inline_keyboard: [
      [{ text: t.menu_featured, callback_data: 'buy_course_kurs_barchasi' }],
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
  return { inline_keyboard: [[{ text: t.to_menu, callback_data: 'menu' }]] };
}
async function sendMainMenu(chatId) {
  const t = T[getLang(chatId)];
  await renderScreen(chatId, t.welcome, mainMenuKeyboard(chatId), { parse_mode: 'Markdown' });
}

// ---------------------------------------------------------------
// DEEP-LINK PAYLOAD ISHLASH (saytdan t.me/Bot?start=XXX orqali kelganda)
// ---------------------------------------------------------------
async function triggerCoursePurchase(chatId, key, fromUser) {
  const lang = getLang(chatId);
  const t = T[lang];
  const course = COURSE_CHANNELS[key];
  if (!course) return sendMainMenu(chatId);
  const name = lang === 'ru' ? course.nameRu : course.name;
  const userLabel = `${fromUser.first_name || ''} (@${fromUser.username || 'username yo\'q'}, ID: ${chatId})`;
  pendingPurchases.set(String(chatId), { kind: 'course', key, name, userLabel });

  await renderScreen(chatId,
    `${t.purchase_thanks}: "${name}" — ${course.price} 🎬\n\n${t.purchase_pay}\n\n💳 Karta: XXXX XXXX XXXX XXXX\n👤 F.I.Sh`,
    backButton(chatId)
  );
  if (ADMIN_CHAT_ID) {
    await bot.sendMessage(ADMIN_CHAT_ID, `💰 Saytdan kurs xaridi!\n\nKurs: ${name} (${course.price})\nXaridor: ${userLabel}\n\nTasdiqlash: /tasdiqla ${chatId}`);
  }
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const payload = match && match[1] ? match[1].trim() : null;
  clearPendingState(chatId);
  getState(chatId).screenMsgId = null;

  if (!payload) return sendMainMenu(chatId);

  // Kurs sotib olish — saytdan to'g'ridan-to'g'ri
  if (payload.startsWith('kurs_')) {
    return triggerCoursePurchase(chatId, payload, msg.from);
  }

  // Video darsliklar ro'yxati
  if (payload === 'courses') {
    const lang = getLang(chatId);
    const t = T[lang];
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_course_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return renderScreen(chatId, t.courses_head, { inline_keyboard: rows });
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

  if (!data.startsWith('chance_ans_')) clearPendingState(chatId);

  if (data === 'menu') return sendMainMenu(chatId);

  if (data === 'lang') {
    return renderScreen(chatId, "Tilni tanlang / Выберите язык:", { inline_keyboard: [[
      { text: "🇺🇿 O'zbekcha", callback_data: 'setlang_uz' },
      { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
    ]] });
  }
  if (data === 'setlang_uz' || data === 'setlang_ru') {
    userLang.set(chatId, data === 'setlang_uz' ? 'uz' : 'ru');
    return sendMainMenu(chatId);
  }

  // ---- Viza imkoniyati testi ----
  if (data === 'chance') {
    const s = getState(chatId);
    s.mode = 'chance'; s.chanceStep = 0; s.chanceScore = {};
    return renderScreen(chatId, `${t.chance_start}\n\n${chanceQuestionText(0, lang)}`, chanceQuestionKeyboard(0, lang));
  }
  if (data.startsWith('chance_ans_')) {
    const parts = data.split('_');
    const stepIdx = +parts[2], optIdx = +parts[3];
    const s = getState(chatId);
    if (s.mode !== 'chance' || s.chanceStep !== stepIdx) return;
    const question = CHANCE_QUESTIONS[stepIdx];
    s.chanceScore[question.key] = question.options[optIdx].points;
    s.chanceStep += 1;

    if (s.chanceStep < CHANCE_QUESTIONS.length) {
      return renderScreen(chatId, chanceQuestionText(s.chanceStep, lang), chanceQuestionKeyboard(s.chanceStep, lang));
    }
    const resultText = computeChanceResult(chatId);
    clearPendingState(chatId);
    return renderScreen(chatId, resultText, backButton(chatId));
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
    const list = c.items.map((it, i) => `${i + 1}. ${it[0]} — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId));
  }
  if (data.startsWith('chk_work_')) {
    const c = WORK_COUNTRIES.find(x => x.key === data.replace('chk_work_', ''));
    if (!c) return;
    const list = WORK_CHECKLIST.map((it, i) => `${i + 1}. ${it[0]} — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId));
  }
  if (data.startsWith('chk_student_')) {
    const c = STUDENT_COUNTRIES.find(x => x.key === data.replace('chk_student_', ''));
    if (!c) return;
    const list = STUDENT_CHECKLIST.map((it, i) => `${i + 1}. ${it[0]} — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return renderScreen(chatId, `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}\n\n${list}`, backButton(chatId));
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
    return renderScreen(chatId, `❓ ${q}\n\n${a}`, { inline_keyboard: [[{ text: t.back, callback_data: 'svc_faq' }]] });
  }

  // ---- Hujjatni AI tekshirish ----
  if (data === 'docs') {
    getState(chatId).mode = 'doc';
    return renderScreen(chatId, t.doc_prompt, backButton(chatId));
  }

  // ---- Video darsliklar ----
  if (data === 'courses') {
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_course_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return renderScreen(chatId, t.courses_head, { inline_keyboard: rows });
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

    await renderScreen(chatId, `"${name}" — ${tour.price} 🧳\n\n${t.tour_request_ok}`, backButton(chatId));
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `🧳 Yangi tur so'rovi!\n\nTur: ${name} (${tour.price})\nMijoz: ${userLabel}`);
    }
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
      [{ text: t.ref_program, url: `${SITE_URL}#cta` }],
      [{ text: t.partner_program, url: `${SITE_URL}#cta` }],
      [{ text: t.to_menu, callback_data: 'menu' }],
    ] });
  }
});

// ---------------------------------------------------------------
// ADMIN: to'lovni tasdiqlash
// ---------------------------------------------------------------
bot.onText(/\/tasdiqla (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
  const targetId = match[1].trim();
  const purchase = pendingPurchases.get(targetId);
  if (!purchase) return bot.sendMessage(chatId, "Bu chat_id kutilayotgan xaridlar ro'yxatida topilmadi.");

  if (purchase.kind === 'course') {
    const course = COURSE_CHANNELS[purchase.key];
    await bot.sendMessage(targetId, `✅ To'lovingiz tasdiqlandi!\n\n"${purchase.name}" kursi kanaliga qo'shiling:\n${course.link}\n\nRahmat! 🎉`);
  } else {
    await bot.sendMessage(targetId, `✅ "${purchase.name}" bo'yicha to'lovingiz tasdiqlandi! Tez orada operator bog'lanadi.`);
  }
  await bot.sendMessage(chatId, `Yuborildi: ${purchase.userLabel}`);
  pendingPurchases.delete(targetId);
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

  // ---- Hujjat fotosi — CHUQUR AI TAHLILI (Claude vision) ----
  if (msg.photo && s.mode === 'doc') {
    clearPendingState(chatId);
    const analyzing = await bot.sendMessage(chatId, t.doc_analyzing);
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileLink = await bot.getFileLink(fileId);
      const imgResp = await fetch(fileLink);
      const arrayBuf = await imgResp.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString('base64');
      const mediaType = imgResp.headers.get('content-type') || 'image/jpeg';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: `Siz tajribali hujjat tekshiruvchi AI'siz. ${lang === 'ru' ? 'Отвечайте на русском.' : "O'zbek tilida javob bering."}
Rasmni diqqat bilan ko'rib, quyidagi tuzilishda tahlil bering:
1) HUJJAT TURI — bu qanday hujjat ekanini aniqlang (pasport, bank hisob ko'chirmasi, anketa, bron, sug'urta va h.k.)
2) TEXNIK SIFAT — aniqlik, yorug'lik, kesilmaganlik, burchaklar to'liq ko'rinishi
3) MUAMMOLAR — ko'zga tashlangan aniq kamchiliklar (masalan xira, qirqilgan, muddati o'tgan ko'rinadi, imzo yo'q va h.k.) — agar muammo bo'lmasa aniq ayting
4) TAVSIYA — nima qilish kerakligi bo'yicha 1-2 aniq qadam
Har bir band uchun 1-2 gap, umumiy 6-8 gapdan oshmasin.
Shaxsiy ma'lumotlarni (ism, raqam, sana) hech qachon qaytarmang, faqat ularning MAVJUDLIGINI/SIFATINI baholang.
Oxirida albatta eslating: bu AI tahlili, rasmiy tekshiruv o'rnini bosmaydi.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: lang === 'ru' ? 'Проанализируйте этот документ подробно.' : 'Bu hujjatni batafsil tahlil qilib bering.' },
          ],
        }],
      });

      const feedback = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      await bot.deleteMessage(chatId, analyzing.message_id).catch(() => {});
      await sendContent(chatId, `📄 ${feedback}`, { reply_markup: backButton(chatId) });
    } catch (err) {
      console.error('Hujjat tahlili xatosi:', err);
      await sendContent(chatId, t.ai_error, { reply_markup: backButton(chatId) });
    }
    return;
  }

  // ---- Premium konsultatsiya / Hamkorlik — foydalanuvchi ism/telefon yozdi ----
  if ((s.mode === 'lead_consult' || s.mode === 'lead_partner') && text) {
    const kind = s.mode === 'lead_consult' ? 'Premium konsultatsiya' : 'Hamkorlik so\'rovi';
    clearPendingState(chatId);
    await sendContent(chatId, t.lead_ok, { reply_markup: backButton(chatId) });
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `📩 ${kind}!\n\nMa'lumot: ${text}\n\n👤 Yuboruvchi: ${userLabel}`);
    }
    return;
  }

  // ---- Saytdan kelgan lid xabari ----
  if (text.startsWith('🆕 Yangi lid')) {
    await bot.sendMessage(chatId, t.lead_ok);
    if (ADMIN_CHAT_ID) await bot.sendMessage(ADMIN_CHAT_ID, `📩 Yangi lid keldi:\n\n${text}\n\n👤 Yuboruvchi: ${userLabel}`);
    return;
  }

  // ---- AI yordamchi / erkin savol ----
  if (text) {
    try {
      await bot.sendChatAction(chatId, 'typing');
      const history = conversations.get(chatId) || [];
      history.push({ role: 'user', content: text });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: buildSystemPrompt(lang),
        messages: history,
      });

      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      history.push({ role: 'assistant', content: reply });
      conversations.set(chatId, history.slice(-10));

      await sendContent(chatId, reply, { reply_markup: backButton(chatId) });
    } catch (err) {
      console.error('AI xatosi:', err);
      await sendContent(chatId, t.ai_error, { reply_markup: backButton(chatId) });
    }
  }
});

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

console.log('VizaAI bot (yakuniy versiya) ishga tushdi ✅');
