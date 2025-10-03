const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const {
    handleStartCommand,
    handleMyAccount,
    handleHowItWorks,
    handleUpdate
} = require('./handlers/userHandlers');
const { handleViewAllReferrals, handleStartNewReferral, handleMarkAsDone, handlePayout } = require('./handlers/ adminHandlers');
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

console.log('Bot has been started...');

bot.onText(/\/start/, (msg) => {
    handleStartCommand(bot, msg);
});

bot.on('message', (msg) => {
    const text = msg.text;

    if (text === '/start') {
        return;
    }

    switch (text) {
        // User handlers
        case '👤 My Account':
            handleMyAccount(bot, msg);
            break;
        case '❓ How it Works':
            handleHowItWorks(bot, msg);
            break;
        case '🔄 Update':
            handleUpdate(bot, msg);
            break;

        // --- ADD ADMIN HANDLERS ---
        case '➕ Start New Referral':
            handleStartNewReferral(bot, msg);
            break;
        case '📋 View All Referrals':
            handleViewAllReferrals(bot, msg);
            break;
        case '✅ Mark as Done':
            handleMarkAsDone(bot, msg);
            break;
        case '💸 Payout':
            handlePayout(bot, msg);
            break;
    }
});
