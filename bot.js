// bot.js — VizaAI Telegram bot
// O'rnatish: npm install node-telegram-bot-api @anthropic-ai/sdk dotenv
// .env faylida: TELEGRAM_BOT_TOKEN=... ANTHROPIC_API_KEY=sk-ant-... ADMIN_CHAT_ID=...
// Ishga tushirish: node bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // sizning shaxsiy yoki jamoa chat ID'ingiz
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const SYSTEM_PROMPT = `Siz VizaAI — viza va sayohat tayyorgarligi bo'yicha Telegram yordamchisiz.
O'zbek tilida, qisqa (3-5 gap) va aniq javob bering. Viza kafolatlanishi haqida hech qachon
va'da bermang — yakuniy qaror doim konsullik/elchixonaga tegishli ekanini eslatib turing.
Agar savol viza/sayohat/hujjatlarga aloqasi bo'lmasa, muloyimlik bilan mavzuga qaytaring.`;

// Har bir foydalanuvchi uchun suhbat tarixi (oddiy xotira, real loyihada DB kerak)
const conversations = new Map();

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // /start buyrug'i
  if (text === '/start') {
    return bot.sendMessage(chatId,
      'Salom! Men VizaAI yordamchisiman 🤖\n\nViza, hujjatlar yoki sayohat tayyorgarligi haqida savolingizni yozing — javob beraman.\n\nSaytimiz: https://vizaai.uz'
    );
  }

  // Saytdan kelgan lid xabarini aniqlash (ular "🆕 Yangi lid" bilan boshlanadi)
  if (text.startsWith('🆕 Yangi lid')) {
    // Foydalanuvchiga tasdiq yuboramiz
    await bot.sendMessage(chatId, '✅ So\'rovingiz qabul qilindi! Tez orada operatorlarimiz siz bilan bog\'lanadi.');

    // Adminga forward qilamiz (agar ADMIN_CHAT_ID sozlangan bo'lsa)
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID,
        `📩 Yangi lid keldi:\n\n${text}\n\n👤 Yuboruvchi: ${msg.from.first_name || ''} (@${msg.from.username || 'username yo\'q'})`
      );
    }
    return;
  }

  // Oddiy savol — AI orqali javob beramiz
  if (text && !text.startsWith('/')) {
    try {
      await bot.sendChatAction(chatId, 'typing');

      const history = conversations.get(chatId) || [];
      history.push({ role: 'user', content: text });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: history,
      });

      const reply = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      history.push({ role: 'assistant', content: reply });
      // Xotirani cheklaymiz (oxirgi 10 xabar)
      conversations.set(chatId, history.slice(-10));

      await bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error('AI xatosi:', err);
      await bot.sendMessage(chatId, 'Kechirasiz, hozir javob berolmayapman. Birozdan keyin qayta urinib ko\'ring, yoki @your_manager ga yozing.');
    }
  }
});

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

console.log('VizaAI bot ishga tushdi ✅');
