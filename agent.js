// agent.js — VizaAI AI sotuv agenti (faqat KURS sotish)
//
// Har bir foydalanuvchi bilan gaplashib, mos video kursni sotadi (karta orqali).
// bot.js ichida ishlatiladi (INTEGRATSIYA allaqachon qilingan):
//   const { createAgent } = require('./agent');
//   const vizaAgent = createAgent({ anthropic, usersDB, getUser, getLang, saveDB,
//     notifyAdmins, triggerCoursePurchase, recommendCourse, COURSE_CHANNELS, bot });

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_LOOPS = 5;
const MAX_TOKENS = 600;

function createAgent(deps) {
  const {
    anthropic, usersDB, getUser, getLang, saveDB, notifyAdmins,
    triggerCoursePurchase, recommendCourse, COURSE_CHANNELS, bot,
  } = deps;
  const model = deps.model || DEFAULT_MODEL;

  // ---------------- SYSTEM PROMPT ----------------
  function buildSystem(lang, chatId) {
    const u = usersDB[String(chatId)] || {};
    const langName = lang === 'ru' ? 'ruscha (на русском)' : "o'zbekcha";

    const known = [];
    if (u.name) known.push(`Ism: ${u.name}`);
    if (u.interestedIn) known.push(`Qiziqishi: ${u.interestedIn}`);
    if (u.chanceScorePct != null) known.push(`Viza testi natijasi: ${u.chanceScorePct}%`);
    const confirmed = (u.purchases || []).filter(p => p.status === 'confirmed').map(p => p.name);
    if (confirmed.length) known.push(`Sotib olgan kurslari: ${confirmed.join(', ')}`);
    const knownBlock = known.length
      ? `\n\nMIJOZ HAQIDA BILGANLARING (qayta so'rama, hisobga ol):\n- ${known.join('\n- ')}\n`
      : '';

    const courseList = Object.entries(COURSE_CHANNELS)
      .map(([k, c]) => `${k} = ${c.name} (${c.price})`).join('\n');

    return `Sen — "VizaAI" (@VisaAi_Uz_Bot) ning shaxsiy konsultanti va savdo yordamchisisan.
VizaAI odamlarga chet elga TURISTIK viza olishga tayyorgarlik ko'radigan video kurslar sotadi.

TIL: ${langName} tilida javob ber. Ohang — samimiy, tirik, ishonchli. Qisqa yoz (Telegram uchun, 1–4 jumla),
oxirida bitta aniq keyingi qadam (CTA) bo'lsin. Emoji kam va o'rinli.

SENING MAQSADING — KURS SOTISH:
1) Iliq tanish, odam qaysi davlatga borishni orzu qilayotganini bil.
2) O'sha davlatga mos video kursimizni foydaga bog'lab taklif qil (kurs hujjat, anketa, suhbat, moliyaviy
   tayyorgarlikni o'rgatadi — agentlarga katta pul bermay, o'zi tayyorlaydi).
3) Odam sotib olmoqchi bo'lsa yoki narx/to'lovni so'rasa — DARHOL 'offer_course' tool'ini chaqir.
   Bu karta rekvizitini avtomatik ko'rsatadi. Narxni o'zingdan aytaverma — tool ko'rsatadi.
4) Savol/e'tiroz bo'lsa — samimiy javob ber, lekin baribir kursga yo'naltir.

MAVJUD KURS KALITLARI (offer_course uchun aynan shu key'lardan birini ber):
${courseList}

Agar davlat aniq bo'lmasa yoki umumiy savol bo'lsa — "kurs_barchasi" (barcha kurslar paketi) ni taklif qil.
${knownBlock}
QOIDALAR:
- Vizani "100% olib beramiz" deb VA'DA BERMA. Yakuniy qaror konsullikda — halol ayt, lekin tayyorgarlik
  shansni oshirishini tushuntir.
- Soxta narx aytma. To'lov faqat KARTA orqali (offer_course ko'rsatadi, chekni admin @A_Sobirov39 ga yuboradi).
- Bosim o'tkazma, spam qilma. "Yo'q" desa hurmat qil.
- Mijoz inson bilan gaplashmoqchi bo'lsa yoki murakkab holat bo'lsa — 'handoff_to_human' chaqir.
- Faqat viza/sayohat/kurs mavzusida gaplash.`;
  }

  const OUTREACH_UZ = "(Tizim: bu odam botdan ro'yxatdan o'tgan, lekin jim turibdi. Unga O'ZING birinchi bo'lib qisqa, iliq xabar yoz — tanish, qaysi davlatga borishni xohlashini so'ra, keyin mos kursni tabiiy taklif qil.)";
  const OUTREACH_RU = "(Система: человек зарегистрирован в боте, но молчит. Напиши ему первым — коротко и тепло познакомься, спроси в какую страну хочет поехать, затем естественно предложи подходящий курс.)";

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
          country: { type: 'string', description: 'Qaysi davlatga qiziqadi' },
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

    if (name === 'offer_course') {
      let key = args.course_key;
      if (!key || !COURSE_CHANNELS[key]) key = (recommendCourse ? recommendCourse(chatId) : 'kurs_barchasi');
      try {
        await triggerCoursePurchase(chatId, key, ctx.fromUser || { id: chatId });
        const c = COURSE_CHANNELS[key];
        return `"${c.name}" (${c.price}) uchun karta rekvizitlari mijozga ko'rsatildi. Mijozga: to'lovdan so'ng chek skrinshotini @A_Sobirov39 ga yuborishini ayt.`;
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
    return (u.agentHistory || []).slice(-16).map(m => ({ role: m.role, content: m.content }));
  }
  function saveHistory(chatId, userText, assistantText) {
    const u = getUser(chatId);
    u.agentHistory = (u.agentHistory || []);
    if (userText) u.agentHistory.push({ role: 'user', content: userText });
    if (assistantText) u.agentHistory.push({ role: 'assistant', content: assistantText });
    u.agentHistory = u.agentHistory.slice(-16);
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
    const messages = history.concat([{ role: 'user', content: firstText || '(salom)' }]);

    const ctx = { chatId, fromUser };
    let finalText = '';

    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      let resp;
      try {
        resp = await anthropic.messages.create({
          model, max_tokens: MAX_TOKENS,
          system: buildSystem(lang, chatId),
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
    saveHistory(chatId, opts.firstTouch ? '' : userText, finalText);
    return { text: finalText };
  }

  // ---------------- PROAKTIV: ro'yxatdan o'tgan, jim turganlarga o'zi yozadi ----------------
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
        await new Promise(r => setTimeout(r, 500)); // flood-limitdan qochish
      } catch (e) { /* bloklagan bo'lishi mumkin */ }
    }
    return sent;
  }

  return { runAgent, agentOutreach, outreachBatch, TOOLS };
}

module.exports = { createAgent };
