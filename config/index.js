// config/index.js

require('dotenv').config();

const config = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    adminTelegramId: process.env.ADMIN_TELEGRAM_ID,
    telegramGroupId: process.env.TELEGRAM_GROUP_ID,
};

module.exports = config;