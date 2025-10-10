// config/index.js

require('dotenv').config();

const config = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminTelegramId: process.env.ADMIN_TELEGRAM_ID,
    telegramGroupId: process.env.TELEGRAM_GROUP_ID,
    USE_PROXY: process.env.USE_PROXY
};

module.exports = config;