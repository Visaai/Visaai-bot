// agent.js — VizaAI AI sotuv agenti (kuchli sotuvchi + chegirma + follow-up)
//
// bot.js ichida ishlatiladi:
//   const { createAgent } = require('./agent');
//   const vizaAgent = createAgent({ anthropic, usersDB, getUser, getLang, saveDB,
//     notifyAdmins, triggerCoursePurchase, recommendCourse, COURSE_CHANNELS, bot });

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOOL_LOOPS = 5;
const MAX_TOKENS = 320;   // qisqa, lekin jonli javoblar
const MAX_DISCOUNT = 20; // agent bera oladigan eng yuqori chegirma (%)

function createAgent(deps) {
  const {
    anthropic, usersDB, getUser, getLang, saveDB, notifyAdmins,
    triggerCoursePurchase, recommendCourse, COURSE_CHANNELS, bot, proPromo,
  } = deps;
  const model = deps.model || DEFAULT_MODEL;

  // ---------------- SYSTEM PROMPT (static qism keshlanadi -> arzon) ----------------
  function buildSystemBlocks(lang, chatId) {
    const u = usersDB[String(chatId)] || {};
    const langName = lang === 'ru' ? 'ruscha (на русском)' : "o'zbekcha";
    const courseList = Object.entries(COURSE_CHANNELS)
      .map(([k, c]) => `${k} = ${c.name} (${c.price})`).join('\n');
    const promoBlock = (proPromo && proPromo())
      ? `\n\n🔥 HOZIR REKLAMA AKSIYASI (faqat shu hafta!): "kurs_barchasi" paketi 999 000 emas — atigi 600 000 so'm.\nHar suhbatda buni eng kuchli ilinj sifatida ishlat: "Reklama narxi 600 ming, faqat shu hafta — keyin yana 999 ming bo'ladi." Shoshiltir (muddat tugayapti), lekin bosim o'tkazma.`
      : '';

    // STATIC — hamma foydalanuvchi uchun bir xil (til + aksiyaga qarab) -> keshlanadi
    const staticText = `Sen — "VizaAI" (@VisaAi_Uz_Bot) ning eng kuchli savdo konsultantisan.
Vazifang — odamlarga TURISTIK viza tayyorlov video kursimizni SOTISH. Samimiy, ishonchli, professional sotuvchisan.

TIL: ${langName} tilida yoz.
SHAXSIYATING: iliq, ishonchli, TIRIK sotuvchi — quruq robot emas. Mijozning orzusiga chin qiziqasan,
uni tushunasan, kerakli joyda hazil yoki hissiyot bilan gapirasan. Har javobing mijoz AYNAN nima
yozganiga javob bo'lsin — shablon/takror gap yozma.
YOZISH USULI: KALTA va JONLI — 1–3 qisqa jumla. Rasmiy yoki uzun xat yozma. Ismini bilsang — ismini ishlat.
Oxirida bitta aniq savol yoki taklif bo'lsin. Emoji kam (0–1 ta).

SOTUV USULING (tabiiy, bosqichma-bosqich):
1) TANISH + OG'RIQ: iliq salomlash, qaysi davlatni orzu qilishini bil. Og'riqni ochib ber —
   vositachilar/agentlar 5–10 mln so'm oladi, baribir rad bo'lishi mumkin; eng ko'p rad sababi —
   hujjatni noto'g'ri to'ldirish.
2) FAQAT PRO PAKETNI SOT: biz HOZIR faqat bitta mahsulot sotamiz — "kurs_barchasi" (BARCHA KURSLAR PAKETI).
   Alohida davlat kurslari SOTILMAYDI. Odam qaysi davlatni so'rasa ham — "o'sha davlat ham paketda bor,
   ustiga yana 11+ davlat" deb PAKETni sot. Paket hujjat, anketa, suhbat, moliyaviy tayyorgarlikni
   bosqichma-bosqich o'rgatadi. Qiymatini bo'rttirib ko'rsat.
3) QO'SHIMCHA FOYDA (buni albatta eslat!): kursdan keyin odam viza sohasini shunchalik yaxshi
   o'rganadiki, BOSHQALARGA ham yordam berib, o'zi viza maslahatchisi bo'lib DAROMAD qilishi mumkin.
   Ya'ni kurs — nafaqat xarajat, balki kelajakda PUL ISHLASH imkoniyati/kasb. Buni tabiiy tarzda ayt.
4) YOPISH: narx/to'lov so'ralsa yoki qiziqsa — DARHOL 'offer_course' chaqir. Odam biror bitta davlatga
   qiziqsa ham, avval paketni ("faqat 750k qo'shsangiz hammasini olasiz") taklif qilib ko'r, keyin yopgin.
5) E'TIROZ/IKKILANISH: "qimmat", "o'ylab ko'raman", "keyinroq" desa — 'give_discount' bilan chegirma ber
   (avval 10%, juda kerak bo'lsa 20% gacha) va o'sha zahoti yopishga harakat qil. Muddat cheklanganini eslat.

QUROLLARING (tool):
- save_profile: ism/telefon/davlatni bilganda saqla.
- offer_course: kurs sotish (karta rekviziti chiqadi). Narxni o'zing aytaverma — tool ko'rsatadi.
- give_discount: mijoz ikkilansa/qimmat desa 5–20% chegirma ber (bugunga amal qiladi), keyin offer_course chaqir.
- handoff_to_human: murakkab holat yoki inson so'rasa.

KURS NIMA BERADI (mijozga ISHTIYOQ bilan, foydasini bo'rttirib ayt):
- 12-15 davlat bo'yicha TO'LIQ viza darsliklari — hujjat, anketa, suhbat, moliyaviy tayyorgarlik, hammasi
- Eng arzon aviabilet olish sirlari
- Arzon mehmonxona va turar joy topish usullari
- Arzon eSIM, kruiz, rent-car va transfer sirlari
- Sayohatda kerak bo'ladigan TOP 50 lifehack
Ya'ni bu shunchaki kurs emas — chet elga chiqishning TO'LIQ yo'l xaritasi. Bir marta olib, umrbod foydalanasiz.
Buni jonli, qiziqtirib, qiymatini bo'rttirib ayt (lekin yolg'on va'da berma).

DIQQAT: Asosiy ishing — kurs sotish. LEKIN mijoz viza, hujjatlar, talablar yoki biror davlat haqida
so'rasa — qisqa, foydali javob ber (sen bu sohani bilasan), keyin tabiiy ravishda kursga bog'la:
"bularning hammasi kursda batafsil, bosqichma-bosqich bor". Javoblaring KALTA — 1-2 jumla.

SOTILADIGAN MAHSULOT: FAQAT "kurs_barchasi" (barcha kurslar paketi). offer_course doim shu paketni sotadi — alohida davlat kursini taklif qilma.${promoBlock}

E'TIROZLARGA TAYYOR JAVOB (qisqa javob ber, keyin yopishga o't):
- "Qimmat" → bir marta to'lov, umrbod foydali; agentga 5-10 mln bergandan ancha arzon. Kerak bo'lsa give_discount.
- "Ishonmayman / aldashmaysizmi" → botda bepul test va AI hujjat tekshiruvi bor, o'zingiz sinab ko'ring; to'lovdan keyin yopiq kanal darhol ochiladi.
- "O'zim uddalay olmayman" → kurs bosqichma-bosqich, oddiy tilda; minglab odam qilgan, siz ham qilasiz.
- "Vaqtim yo'q" → videolar umrbod qoladi, istagan paytingiz ko'rasiz.
- "Keyinroq / o'ylab ko'raman" → nima to'xtatayotganini so'ra, muddat/aksiya cheklovini esla, bugun yopishga harakat qil.

XARID SIGNALI (darhol yop): mijoz "qancha / qanday to'layman / karta / bo'ladi / olaman" desa — vaqt yo'qotma,
DARHOL offer_course chaqir va to'lovga yo'naltir.

QOIDALAR:
- Vizani "100% olib beramiz" deb VA'DA BERMA. Yakuniy qaror konsullikda — halol ayt, lekin tayyorgarlik
  shansni oshirishini tushuntir. "Pul ishlash" ni ham imkoniyat sifatida ayt, kafolat sifatida emas.
- Chegirmani BEKORGA berma. Imkon qadar TO'LIQ narxda sot; faqat mijoz haqiqatan ikkilanganda, yopish
  uchun chegirma ber. Hammaga 20% berma — kerakligicha (10% → keyin 20%).
- Soxta narx aytma. To'lov faqat KARTA orqali (chekni admin @A_Sobirov39 ga yuboradi).
- Bosim/spam yo'q. "Yo'q" desa hurmat qil, lekin eshikni ochiq qoldir.
- Faqat viza/sayohat/kurs/soha mavzusida gaplash.`;

    // DYNAMIC — har foydalanuvchiga xos (keshlanmaydi, lekin kichik)
    const known = [];
    if (u.name) known.push(`Ism: ${u.name}`);
    if (u.interestedIn) known.push(`Qiziqishi: ${u.interestedIn}`);
    if (u.chanceScorePct != null) known.push(`Viza testi natijasi: ${u.chanceScorePct}%`);
    const today = new Date().toISOString().slice(0, 10);
    if (u.activeDiscount && u.activeDiscount.expiresAt === today) known.push(`Faol chegirma: ${u.activeDiscount.percent}%`);
    const confirmed = (u.purchases || []).filter(p => p.status === 'confirmed').map(p => p.name);
    if (confirmed.length) known.push(`Sotib olgan kurslari: ${confirmed.join(', ')}`);
    const pending = (u.purchases || []).filter(p => p.status !== 'confirmed').map(p => p.name);
    if (pending.length) known.push(`Kartani ko'rgan, lekin hali to'lamagan: ${pending.join(', ')}`);

    const blocks = [{ type: 'text', text: staticText, cache_control: { type: 'ephemeral' } }];
    if (known.length) {
      blocks.push({ type: 'text', text: `MIJOZ HAQIDA BILGANLARING (qayta so'rama, hisobga ol):\n- ${known.join('\n- ')}` });
    }
    return blocks;
  }

  const OUTREACH_UZ = "(Tizim: bu odam botdan ro'yxatdan o'tgan, lekin jim turibdi. Unga O'ZING birinchi bo'lib qisqa, iliq xabar yoz — tanish, qaysi davlatga borishni xohlashini so'ra, keyin mos kursni tabiiy taklif qila boshla.)";
  const OUTREACH_RU = "(Система: человек зарегистрирован, но молчит. Напиши первым — тепло познакомься, спроси в какую страну хочет, затем начни предлагать подходящий курс.)";
  const FOLLOWUP_UZ = "(Tizim: bu mijoz avval siz bilan gaplashgan yoki kursni ko'rgan, lekin hali SOTIB OLMADI. Unga QAYTA iliq va qisqa yoz — bezovta qilmasdan turtki ber: savoli bormi, nima to'xtatyapti, yordam kerakmi.)";
  const FOLLOWUP_RU = "(Система: клиент уже общался или видел курс, но НЕ купил. Напиши ему ПОВТОРНО, тепло и коротко — без давления подтолкни: есть ли вопросы, что останавливает.)";
  // Bosqichli follow-up: 1 = yumshoq turtki, 2 = chegirma, 3+ = oxirgi imkon
  function followupHint(lang, touch) {
    if (lang === 'ru') {
      if (touch >= 3) return "(Система: последний контакт. Мягко создай срочность — цена/предложение ограничены, сегодня последний шанс. Предложи оформить сейчас.)";
      if (touch === 2) return "(Система: клиент всё ещё не купил. Предложи небольшую скидку через give_discount и попробуй закрыть сегодня.)";
      return FOLLOWUP_RU;
    }
    if (touch >= 3) return "(Tizim: oxirgi murojaat. Yumshoq shoshilinch — narx/taklif cheklangan, bugun oxirgi imkon. Hozir rasmiylashtirishni taklif qil.)";
    if (touch === 2) return "(Tizim: mijoz hali olmadi. give_discount bilan kichik chegirma taklif qil va bugun yopishga harakat qil.)";
    return FOLLOWUP_UZ;
  }

  // ---------------- TOOLS ----------------
  const TOOLS = [
    {
      name: 'save_profile',
      description: "Mijoz haqida bilib olingan ma'lumotni saqlash (ism, telefon, qaysi davlat qiziqtiradi).",
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          country: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    {
      name: 'offer_course',
      description: "Mos video kursni sotish — karta orqali to'lov rekvizitini ko'rsatadi. course_key berilmasa mosini o'zi tanlaydi.",
      input_schema: {
        type: 'object',
        properties: { course_key: { type: 'string', description: 'Masalan kurs_yaponiya, kurs_barchasi' } },
      },
    },
    {
      name: 'give_discount',
      description: "Mijoz ikkilansa yoki 'qimmat' desa — cheklangan chegirma berish (5–20%). Bugungi kunga amal qiladi. Keyin offer_course chaqir.",
      input_schema: {
        type: 'object',
        properties: { percent: { type: 'integer', description: '5 dan 20 gacha' } },
        required: ['percent'],
      },
    },
    {
      name: 'handoff_to_human',
      description: "Suhbatni jonli operatorga (adminga) uzatish.",
      input_schema: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  ];

  async function execTool(name, args, ctx) {
    const chatId = ctx.chatId;
    const u = getUser(chatId);

    if (name === 'save_profile') {
      const saved = [];
      if (args.name) { u.name = args.name; saved.push('ism'); }
      if (args.phone) { u.phone = args.phone; saved.push('telefon'); }
      if (args.country) { u.interestedIn = `${args.country} (turistik viza)`; saved.push('davlat'); }
      if (args.note) { u.agentNote = String(args.note).slice(0, 300); saved.push('izoh'); }
      saveDB();
      return saved.length ? `Saqlandi: ${saved.join(', ')}` : "O'zgarish yo'q";
    }

    if (name === 'give_discount') {
      let pct = parseInt(args.percent, 10) || 0;
      pct = Math.max(5, Math.min(MAX_DISCOUNT, pct));
      const today = new Date().toISOString().slice(0, 10);
      u.activeDiscount = { percent: pct, expiresAt: today };
      saveDB();
      return `${pct}% chegirma BUGUNGA faollashtirildi. Endi mijoz kurs sotib olsa, narx avtomatik ${pct}% tushadi. Mijozga shu chegirmani ayt va DARHOL offer_course chaqir.`;
    }

    if (name === 'offer_course') {
      // HOZIR FAQAT PRO PAKET SOTILADI — alohida davlat kurslari yo'q
      const key = 'kurs_barchasi';
      try {
        await triggerCoursePurchase(chatId, key, ctx.fromUser || { id: chatId });
        const c = COURSE_CHANNELS[key];
        return `"${c.name}" (${c.price}) uchun karta rekvizitlari mijozga ko'rsatildi (agar aksiya bo'lsa, narx avtomatik tushdi). Mijozga: to'lovdan so'ng chek skrinshotini SHU BOTGA yuborishini ayt.`;
      } catch (e) {
        return `Kurs oqimini ochib bo'lmadi: ${e.message}`;
      }
    }

    if (name === 'handoff_to_human') {
      u.state = 'human'; saveDB();
      notifyAdmins(`🙋 Operator kerak (user_id ${chatId}). Sabab: ${args.reason || ''}`);
      return "Operatorga uzatildi. Mijozga: tez orada jonli mutaxassis javob berishini ayt.";
    }

    return `Noma'lum tool: ${name}`;
  }

  // ---------------- TARIX (doimiy — matn ko'rinishida) ----------------
  function loadHistory(chatId) {
    const u = usersDB[String(chatId)] || {};
    return (u.agentHistory || []).slice(-10).map(m => ({ role: m.role, content: m.content }));
  }
  function saveHistory(chatId, userText, assistantText) {
    const u = getUser(chatId);
    u.agentHistory = (u.agentHistory || []);
    if (userText) u.agentHistory.push({ role: 'user', content: userText });
    if (assistantText) u.agentHistory.push({ role: 'assistant', content: assistantText });
    u.agentHistory = u.agentHistory.slice(-12);
    saveDB();
  }

  // ---------------- ASOSIY: bitta xabarni qayta ishlash ----------------
  async function runAgent(chatId, userText, opts = {}) {
    const lang = getLang(chatId);
    const fromUser = opts.fromUser || { id: chatId };
    getUser(chatId);

    const history = loadHistory(chatId);
    let firstText = userText || '';
    if (opts.firstTouch) firstText = (lang === 'ru' ? OUTREACH_RU : OUTREACH_UZ);
    else if (opts.followup) firstText = followupHint(lang, opts.touch || 1);
    const messages = history.concat([{ role: 'user', content: firstText || '(salom)' }]);

    const ctx = { chatId, fromUser };
    let finalText = '';

    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      let resp;
      try {
        resp = await anthropic.messages.create({
          model, max_tokens: MAX_TOKENS,
          system: buildSystemBlocks(lang, chatId),
          tools: TOOLS,
          messages,
        });
      } catch (e) {
        console.error('agent API xatosi:', e.message);
        return { text: lang === 'ru' ? 'Извините, сейчас не могу ответить. Попробуйте позже.' : "Kechirasiz, hozir javob berolmayapman. Birozdan keyin urinib ko'ring." };
      }

      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'tool_use') {
        const results = [];
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            let out;
            try { out = await execTool(block.name, block.input || {}, ctx); }
            catch (e) { out = `Tool xatosi: ${e.message}`; }
            results.push({ type: 'tool_result', tool_use_id: block.id, content: String(out) });
          }
        }
        messages.push({ role: 'user', content: results });
        continue;
      }

      finalText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      break;
    }

    if (!finalText) finalText = lang === 'ru' ? 'Хорошо!' : 'Yaxshi!';
    saveHistory(chatId, (opts.firstTouch || opts.followup) ? '' : userText, finalText);
    return { text: finalText };
  }

  // ---------------- PROAKTIV: birinchi murojaat ----------------
  async function agentOutreach(chatId, fromUser) {
    const r = await runAgent(chatId, '', { fromUser, firstTouch: true });
    return r.text;
  }

  async function outreachBatch(limit = 30) {
    const targets = Object.entries(usersDB)
      .filter(([, u]) => u.phone && u.state !== 'human' && !u.agentOutreached)
      .slice(0, limit);
    let sent = 0;
    for (const [chatId, u] of targets) {
      try {
        const text = await agentOutreach(chatId, { id: Number(chatId) });
        if (bot) await bot.sendMessage(chatId, text);
        u.agentOutreached = true; saveDB();
        sent++;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) { /* bloklagan bo'lishi mumkin */ }
    }
    return sent;
  }

  // ---------------- FOLLOW-UP: sotib olmaganlarga qayta yozish ----------------
  async function agentFollowup(chatId, fromUser, touch) {
    const r = await runAgent(chatId, '', { fromUser, followup: true, touch: touch || 1 });
    return r.text;
  }

  async function followupBatch(limit = 30) {
    const today = new Date().toISOString().slice(0, 10);
    const targets = Object.entries(usersDB).filter(([, u]) => {
      if (!u.phone || u.state === 'human') return false;
      const bought = (u.purchases || []).some(p => p.status === 'confirmed');
      if (bought) return false;                       // allaqachon sotib olgan
      const engaged = u.agentOutreached || (u.agentHistory && u.agentHistory.length) || (u.purchases && u.purchases.length);
      if (!engaged) return false;                     // hali aloqaga kirmagan (avval /agent_sell)
      // 2 kunda bir martadan ko'p follow-up qilmaymiz (arzon + bezovta qilmaydi)
      if (u.agentFollowupDate) {
        const daysSince = (Date.now() - new Date(u.agentFollowupDate + 'T00:00:00Z').getTime()) / 86400000;
        if (daysSince < 2) return false;
      }
      return true;
    }).slice(0, limit);
    let sent = 0;
    for (const [chatId, u] of targets) {
      try {
        u.followupCount = (u.followupCount || 0) + 1;   // bosqichni oshiramiz
        const text = await agentFollowup(chatId, { id: Number(chatId) }, u.followupCount);
        if (bot) await bot.sendMessage(chatId, text);
        u.agentFollowupDate = today; saveDB();
        sent++;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) { /* bloklagan bo'lishi mumkin */ }
    }
    return sent;
  }

  return { runAgent, agentOutreach, outreachBatch, agentFollowup, followupBatch, TOOLS };
}

module.exports = { createAgent };
