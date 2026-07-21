// bot.js — VizaAI Telegram bot (to'liq versiya: AI matn+hujjat tahlili, viza imkoniyati
// kalkulyatori, to'liq UZ/RU, pullik kurslar, holatlarni tozalash)
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
    to_menu: "🏠 Bosh menyu",
    ask_ai_prompt: "Savolingizni yozing — AI javob beradi. (Bosh menyuga qaytish uchun pastdagi tugmani bosing.)",
    services_head: "Qaysi viza turi kerak?",
    svc_travel_head: "Qaysi mamlakat uchun hujjatlar kerak?",
    svc_work_head: "Qaysi davlatga ishga borasiz?",
    svc_student_head: "Qaysi davlatga o'qishga borasiz?",
    faq_head: "Savolni tanlang:",
    doc_prompt: "Hujjat (pasport, bank hujjati, anketa va h.k.) fotosini shu yerga yuboring — AI ko'rib, sifati va mos-mosligini tahlil qiladi.\n\n⚠️ Bu AI tahlili — rasmiy tekshiruv emas, taxminiy tavsiya beradi.",
    doc_analyzing: "🔎 Hujjat tahlil qilinmoqda...",
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
    chance_start: "Viza imkoniyati testini boshlaymiz — 6 ta qisqa savol. Har biriga tugma orqali javob bering.",
    chance_result_head: "PROFIL MOSLIGI",
    chance_disclaimer: "⚠️ Bu ball viza berilish kafolati emas. Yakuniy qarorni konsullik yoki elchixona qabul qiladi.",
  },
  ru: {
    welcome: "Здравствуйте! Добро пожаловать в бот VizaAI 👋\n\nЗдесь вы можете проверить визовые шансы, получить документы по стране, проанализировать фото документа через AI, спланировать поездку и выбрать видеокурс или турпакет.\n\nНажмите нужную кнопку, чтобы начать:",
    menu_chance: "🧠 Тест визовых шансов",
    menu_services: "🗂️ Визовые услуги",
    menu_docs: "📸 Проверка документа AI",
    menu_courses: "🎓 Видеокурсы",
    menu_tours: "✈️ Турпакеты",
    menu_ai: "🤖 AI-помощник",
    menu_other: "🚩 Другие возможности",
    menu_lang: "🌐 Til / Язык",
    back: "⬅️ Назад",
    to_menu: "🏠 Главное меню",
    ask_ai_prompt: "Напишите ваш вопрос — AI ответит. (Чтобы вернуться в меню, нажмите кнопку ниже.)",
    services_head: "Какая виза вам нужна?",
    svc_travel_head: "Для какой страны нужны документы?",
    svc_work_head: "В какую страну едете работать?",
    svc_student_head: "В какую страну едете учиться?",
    faq_head: "Выберите вопрос:",
    doc_prompt: "Отправьте фото документа (паспорт, банковский документ, анкета и т.д.) — AI проверит качество и соответствие.\n\n⚠️ Это AI-анализ — не официальная проверка, а примерная рекомендация.",
    doc_analyzing: "🔎 Документ анализируется...",
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
    chance_start: "Начинаем тест визовых шансов — 6 коротких вопросов. Отвечайте кнопками.",
    chance_result_head: "СООТВЕТСТВИЕ ПРОФИЛЯ",
    chance_disclaimer: "⚠️ Этот балл не является гарантией визы. Окончательное решение принимает консульство или посольство.",
  },
};

// ---------------------------------------------------------------
// SAYTDAGI HAQIQIY MA'LUMOTLAR (index.html bilan bir xil manba)
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

// ---------------------------------------------------------------
// KURS KANALLARI (video darsliklar)
// ---------------------------------------------------------------
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
// AI SYSTEM PROMPT — VizaAI xizmati haqida to'liq ma'lumot bilan
// ---------------------------------------------------------------
function buildSystemPrompt(lang) {
  const langName = lang === 'ru' ? 'ruscha (rus tilida)' : "o'zbekcha";
  return `Siz VizaAI — viza va sayohat tayyorgarligi bo'yicha Telegram yordamchisiz. ${langName} tilda, qisqa (3-6 gap) va aniq javob bering.

VIZAAI HAQIDA TO'LIQ MA'LUMOT (savol shu haqida bo'lsa ishlating):
- VizaAI — AI yordamida viza hujjatlarini tayyorlash, tekshirish va sayohat rejalashtirish platformasi (sayt: ${SITE_URL}).
- Bepul xizmatlar: har bir davlat/toifa uchun hujjatlar checklisti (bot menyusidagi "Viza xizmatlari"), AI yordamchi (shu chat), viza imkoniyati testi.
- Pullik xizmatlar — video darsliklar (bot menyusidagi "Video darsliklar"): Shengen (199 000 so'm), Yaponiya (149 000), AQSH B1/B2 (299 000), Buyuk Britaniya (199 000), Talaba vizasi (159 000), Ishchi viza (169 000), Hong Kong (59 000), Avstraliya (299 000), Kanada (299 000), yoki barcha kurslar paketi (999 000 so'm, alohida sotib olishdan ancha arzon).
- Tur paketlar: Turkiya ($599), Vyetnam ($699), Yevropa ($1799), Yaponiya ($1250).
- Premium konsultatsiya — hamkor mutaxassis bilan shaxsiy maslahat (saytda "Premium konsultatsiya" tugmasi orqali).

QOIDALAR:
- Viza kafolatlanishi haqida HECH QACHON va'da bermang — yakuniy qaror doim konsullik/elchixonaga tegishli ekanini eslatib turing.
- Agar foydalanuvchining savoli tegishli video kursga mos kelsa (masalan aynan bitta davlat haqida chuqur/qadam-baqadam yordam so'rasa), o'sha kursni **tabiiy va foydali tarzda**, majburlamasdan tavsiya qiling — masalan "Bu mavzu bo'yicha to'liq video kursimiz ham bor, xohlasangiz 'Video darsliklar' menyusidan ko'rishingiz mumkin."
- Agar savol viza/sayohat/hujjatlarga aloqasi bo'lmasa, muloyimlik bilan mavzuga qaytaring.`;
}

// ---------------------------------------------------------------
// FOYDALANUVCHI HOLATI (state machine)
// mode: 'idle' | 'ai' | 'doc' | 'chance'
// ---------------------------------------------------------------
const userState = new Map(); // chatId -> { mode, chanceStep, chanceScore: {} }
function getState(chatId) {
  if (!userState.has(chatId)) userState.set(chatId, { mode: 'idle', chanceStep: 0, chanceScore: {} });
  return userState.get(chatId);
}
// Har qanday menyu navigatsiyasida oldingi "kutilayotgan" so'rovlarni bekor qilamiz
function clearPendingState(chatId) {
  const s = getState(chatId);
  s.mode = 'idle';
  s.chanceStep = 0;
  s.chanceScore = {};
}

const conversations = new Map();
const pendingPurchases = new Map();

// ---------------------------------------------------------------
// VIZA IMKONIYATI TESTI — savollar va ballash
// ---------------------------------------------------------------
const CHANCE_QUESTIONS = [
  {
    q: { uz: "Hozirgi bandlik holatingiz?", ru: "Ваш текущий статус занятости?" },
    options: [
      { uz: "Rasmiy ishlayman", ru: "Официально работаю", points: 20 },
      { uz: "Tadbirkorman", ru: "Предприниматель", points: 18 },
      { uz: "Talabaman", ru: "Студент", points: 12 },
      { uz: "Ishsizman", ru: "Безработный", points: 5 },
    ],
    key: 'employment',
  },
  {
    q: { uz: "Oylik rasmiy daromadingiz?", ru: "Ваш официальный ежемесячный доход?" },
    options: [
      { uz: "$2000 dan yuqori", ru: "Более $2000", points: 30 },
      { uz: "$1000–2000", ru: "$1000–2000", points: 25 },
      { uz: "$500–1000", ru: "$500–1000", points: 15 },
      { uz: "$500 dan kam", ru: "Менее $500", points: 5 },
    ],
    key: 'income',
  },
  {
    q: { uz: "Bank hisobingizdagi aylanma necha oylik?", ru: "За сколько месяцев оборот на вашем счёте?" },
    options: [
      { uz: "6 oy yoki ko'proq", ru: "6 месяцев и более", points: 20 },
      { uz: "3–5 oy", ru: "3–5 месяцев", points: 15 },
      { uz: "1–2 oy", ru: "1–2 месяца", points: 8 },
      { uz: "Aylanma yo'q", ru: "Оборота нет", points: 0 },
    ],
    key: 'bankTurnover',
  },
  {
    q: { uz: "Oxirgi 5 yilda nechta xorijiy safar qilgansiz?", ru: "Сколько поездок за границу было за 5 лет?" },
    options: [
      { uz: "3 va undan ko'p", ru: "3 и более", points: 20 },
      { uz: "1–2 marta", ru: "1–2 раза", points: 12 },
      { uz: "Hech qachon", ru: "Ни разу", points: 5 },
    ],
    key: 'travelHistory',
  },
  {
    q: { uz: "Oldin viza rad javobi bo'lganmi?", ru: "Были ли раньше отказы в визе?" },
    options: [
      { uz: "Yo'q", ru: "Не было", points: 10 },
      { uz: "Bo'lgan, sababi bartaraf etilgan", ru: "Был, причина устранена", points: 6 },
      { uz: "Bo'lgan, hali ham dolzarb", ru: "Был, причина ещё актуальна", points: 0 },
    ],
    key: 'rejection',
  },
  {
    q: { uz: "O'zbekistonda qaytish asoslaringiz (uy, oila, ish)?", ru: "Есть ли основания для возвращения в Узбекистан (дом, семья, работа)?" },
    options: [
      { uz: "Ha, kuchli asoslarim bor", ru: "Да, есть весомые основания", points: 20 },
      { uz: "Qisman bor", ru: "Частично есть", points: 10 },
      { uz: "Yo'q/aniq emas", ru: "Нет/не уверен(а)", points: 0 },
    ],
    key: 'homeTies',
  },
];
const CHANCE_MAX_SCORE = CHANCE_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);

function chanceQuestionKeyboard(stepIdx, lang) {
  const step = CHANCE_QUESTIONS[stepIdx];
  const rows = step.options.map((o, i) => ([{ text: o[lang], callback_data: `chance_ans_${stepIdx}_${i}` }]));
  return { inline_keyboard: rows };
}

function sendChanceQuestion(chatId, stepIdx) {
  const lang = getLang(chatId);
  const step = CHANCE_QUESTIONS[stepIdx];
  const progress = `[${stepIdx + 1}/${CHANCE_QUESTIONS.length}]`;
  bot.sendMessage(chatId, `${progress} ${step.q[lang]}`, { reply_markup: chanceQuestionKeyboard(stepIdx, lang) });
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
  return `📊 *${t.chance_result_head}: ${pct}%*\n\n${verdict}\n\n${t.chance_disclaimer}`;
}

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
  return { inline_keyboard: [[{ text: t.to_menu, callback_data: 'menu' }]] };
}
function sendMainMenu(chatId) {
  const t = T[getLang(chatId)];
  bot.sendMessage(chatId, t.welcome, { reply_markup: mainMenuKeyboard(chatId) });
}

bot.onText(/\/start/, (msg) => { clearPendingState(msg.chat.id); sendMainMenu(msg.chat.id); });

// ---------------------------------------------------------------
// TUGMA BOSILGANDA
// ---------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const lang = getLang(chatId);
  const t = T[lang];
  bot.answerCallbackQuery(query.id).catch(() => {});

  // "chance_ans_" dan boshqa barcha navigatsiya tugmalari — oldingi kutilayotgan
  // so'rovlarni (AI savol kutish, hujjat kutish, test jarayoni) bekor qiladi.
  if (!data.startsWith('chance_ans_')) {
    clearPendingState(chatId);
  }

  if (data === 'menu') return sendMainMenu(chatId);

  if (data === 'lang') {
    return bot.sendMessage(chatId, "Tilni tanlang / Выберите язык:", {
      reply_markup: { inline_keyboard: [[
        { text: "🇺🇿 O'zbekcha", callback_data: 'setlang_uz' },
        { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
      ]] },
    });
  }
  if (data === 'setlang_uz' || data === 'setlang_ru') {
    const newLang = data === 'setlang_uz' ? 'uz' : 'ru';
    userLang.set(chatId, newLang);
    await bot.sendMessage(chatId, T[newLang].lang_set);
    return sendMainMenu(chatId);
  }

  // ---- Viza imkoniyati testi ----
  if (data === 'chance') {
    const s = getState(chatId);
    s.mode = 'chance'; s.chanceStep = 0; s.chanceScore = {};
    await bot.sendMessage(chatId, t.chance_start);
    return sendChanceQuestion(chatId, 0);
  }
  if (data.startsWith('chance_ans_')) {
    const [, , stepStr, optStr] = data.split('_');
    const stepIdx = +stepStr, optIdx = +optStr;
    const s = getState(chatId);
    if (s.mode !== 'chance' || s.chanceStep !== stepIdx) return; // eski/ noto'g'ri bosish
    const question = CHANCE_QUESTIONS[stepIdx];
    const chosen = question.options[optIdx];
    s.chanceScore[question.key] = chosen.points;
    s.chanceStep += 1;

    if (s.chanceStep < CHANCE_QUESTIONS.length) {
      return sendChanceQuestion(chatId, s.chanceStep);
    }
    // Test tugadi
    const resultText = computeChanceResult(chatId);
    clearPendingState(chatId);
    return bot.sendMessage(chatId, resultText, { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }

  // ---- Viza xizmatlari ----
  if (data === 'services') {
    return bot.sendMessage(chatId, t.services_head, {
      reply_markup: { inline_keyboard: [
        [{ text: '✈️ Sayohat viza', callback_data: 'svc_travel' }],
        [{ text: '💼 Ishchi viza', callback_data: 'svc_work' }],
        [{ text: '🎓 Student', callback_data: 'svc_student' }],
        [{ text: '❓ FAQ', callback_data: 'svc_faq' }],
        [{ text: t.to_menu, callback_data: 'menu' }],
      ] },
    });
  }
  if (data === 'svc_travel') {
    const rows = COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_travel_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, t.svc_travel_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data === 'svc_work') {
    const rows = WORK_COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_work_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, t.svc_work_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data === 'svc_student') {
    const rows = STUDENT_COUNTRIES.map(c => ([{ text: `${c.flag} ${lang === 'ru' ? c.nameRu : c.name}`, callback_data: `chk_student_${c.key}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, t.svc_student_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data.startsWith('chk_travel_')) {
    const key = data.replace('chk_travel_', '');
    const c = COUNTRIES.find(x => x.key === key);
    if (!c) return;
    const list = c.items.map((it, i) => `${i + 1}. *${it[0]}* — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${c.flag} *${lang === 'ru' ? c.nameRu : c.name}*\n\n${list}`, { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }
  if (data.startsWith('chk_work_')) {
    const key = data.replace('chk_work_', '');
    const c = WORK_COUNTRIES.find(x => x.key === key);
    if (!c) return;
    const list = WORK_CHECKLIST.map((it, i) => `${i + 1}. *${it[0]}* — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${c.flag} *${lang === 'ru' ? c.nameRu : c.name}*\n\n${list}`, { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }
  if (data.startsWith('chk_student_')) {
    const key = data.replace('chk_student_', '');
    const c = STUDENT_COUNTRIES.find(x => x.key === key);
    if (!c) return;
    const list = STUDENT_CHECKLIST.map((it, i) => `${i + 1}. *${it[0]}* — ${lang === 'ru' ? it[2] : it[1]}`).join('\n');
    return bot.sendMessage(chatId, `${c.flag} *${lang === 'ru' ? c.nameRu : c.name}*\n\n${list}`, { parse_mode: 'Markdown', reply_markup: backButton(chatId) });
  }
  if (data === 'svc_faq') {
    const rows = FAQ_DATA.map((f, i) => ([{ text: lang === 'ru' ? f[2] : f[0], callback_data: `faq_${i}` }]));
    rows.push([{ text: t.back, callback_data: 'services' }]);
    return bot.sendMessage(chatId, t.faq_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data.startsWith('faq_')) {
    const idx = +data.replace('faq_', '');
    const item = FAQ_DATA[idx];
    if (!item) return;
    const q = lang === 'ru' ? item[2] : item[0];
    const a = lang === 'ru' ? item[3] : item[1];
    return bot.sendMessage(chatId, `❓ *${q}*\n\n${a}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t.back, callback_data: 'svc_faq' }]] } });
  }

  // ---- Hujjatni AI tekshirish ----
  if (data === 'docs') {
    getState(chatId).mode = 'doc';
    return bot.sendMessage(chatId, t.doc_prompt, { reply_markup: backButton(chatId) });
  }

  // ---- Video darsliklar ----
  if (data === 'courses') {
    const rows = Object.entries(COURSE_CHANNELS).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_course_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return bot.sendMessage(chatId, t.courses_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data === 'tours') {
    const rows = Object.entries(TOUR_PACKAGES).map(([key, c]) => (
      [{ text: `${lang === 'ru' ? c.nameRu : c.name} — ${c.price}`, callback_data: `buy_tour_${key}` }]
    ));
    rows.push([{ text: t.to_menu, callback_data: 'menu' }]);
    return bot.sendMessage(chatId, t.tours_head, { reply_markup: { inline_keyboard: rows } });
  }
  if (data.startsWith('buy_course_')) {
    const key = data.replace('buy_course_', '');
    const course = COURSE_CHANNELS[key];
    if (!course) return;
    const name = lang === 'ru' ? course.nameRu : course.name;
    const userLabel = `${query.from.first_name || ''} (@${query.from.username || 'username yo\'q'}, ID: ${chatId})`;
    pendingPurchases.set(String(chatId), { kind: 'course', key, name, userLabel });

    await bot.sendMessage(chatId,
      `${t.purchase_thanks}: "${name}" — ${course.price} 🎬\n\n${t.purchase_pay}\n\n💳 Karta: XXXX XXXX XXXX XXXX\n👤 F.I.Sh`
    );
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `💰 Yangi kurs xaridi!\n\nKurs: ${name} (${course.price})\nXaridor: ${userLabel}\n\nTasdiqlash: /tasdiqla ${chatId}`);
    }
    return;
  }
  if (data.startsWith('buy_tour_')) {
    const key = data.replace('buy_tour_', '');
    const tour = TOUR_PACKAGES[key];
    if (!tour) return;
    const name = lang === 'ru' ? tour.nameRu : tour.name;
    const userLabel = `${query.from.first_name || ''} (@${query.from.username || 'username yo\'q'}, ID: ${chatId})`;
    pendingPurchases.set(String(chatId), { kind: 'tour', key, name, userLabel });

    await bot.sendMessage(chatId, `"${name}" — ${tour.price} 🧳\n\n${t.tour_request_ok}`);
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID, `🧳 Yangi tur so'rovi!\n\nTur: ${name} (${tour.price})\nMijoz: ${userLabel}`);
    }
    return;
  }

  // ---- AI yordamchi ----
  if (data === 'ai') {
    getState(chatId).mode = 'ai';
    return bot.sendMessage(chatId, t.ask_ai_prompt, { reply_markup: backButton(chatId) });
  }

  // ---- Boshqa imkoniyatlar ----
  if (data === 'other') {
    return bot.sendMessage(chatId, t.other_head, {
      reply_markup: { inline_keyboard: [
        [{ text: t.ref_program, url: `${SITE_URL}#cta` }],
        [{ text: t.partner_program, url: `${SITE_URL}#cta` }],
        [{ text: t.to_menu, callback_data: 'menu' }],
      ] },
    });
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
// ODDIY XABARLAR: hujjat fotosi, AI savol, saytdan lid
// ---------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (text.startsWith('/')) return;

  const lang = getLang(chatId);
  const t = T[lang];
  const s = getState(chatId);
  const userLabel = `${msg.from.first_name || ''} (@${msg.from.username || 'username yo\'q'}, ID: ${chatId})`;

  // ---- Hujjat fotosi — HAQIQIY AI TAHLILI (Claude vision) ----
  if (msg.photo && s.mode === 'doc') {
    clearPendingState(chatId);
    await bot.sendMessage(chatId, t.doc_analyzing);
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileLink = await bot.getFileLink(fileId);
      const imgResp = await fetch(fileLink);
      const arrayBuf = await imgResp.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString('base64');
      const mediaType = imgResp.headers.get('content-type') || 'image/jpeg';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `Siz hujjat tekshiruvchi AI'siz. ${lang === 'ru' ? 'Отвечайте на русском.' : "O'zbek tilida javob bering."}
Rasmda qanday hujjat ekanini aniqlang (pasport, bank hujjati, anketa va h.k.), sifatini (aniqlik, yorug'lik, kesilmaganligi) va ko'zga tashlanadigan muammolarni ayting.
Shaxsiy ma'lumotlarni (ism, raqam) qaytarmang yoki saqlamang — faqat texnik/formal fikr bildiring. 3-5 gap bilan javob bering.
Oxirida eslatib qo'ying: bu AI tahlili, rasmiy tekshiruv emas.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: lang === 'ru' ? 'Проверьте этот документ.' : 'Bu hujjatni tekshirib bering.' },
          ],
        }],
      });

      const feedback = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      await bot.sendMessage(chatId, `📄 ${feedback}`, { reply_markup: backButton(chatId) });
    } catch (err) {
      console.error('Hujjat tahlili xatosi:', err);
      await bot.sendMessage(chatId, t.ai_error, { reply_markup: backButton(chatId) });
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
        max_tokens: 450,
        system: buildSystemPrompt(lang),
        messages: history,
      });

      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      history.push({ role: 'assistant', content: reply });
      conversations.set(chatId, history.slice(-10));

      await bot.sendMessage(chatId, reply, { reply_markup: backButton(chatId) });
    } catch (err) {
      console.error('AI xatosi:', err);
      await bot.sendMessage(chatId, t.ai_error, { reply_markup: backButton(chatId) });
    }
  }
});

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

console.log('VizaAI bot (to\'liq versiya) ishga tushdi ✅');
