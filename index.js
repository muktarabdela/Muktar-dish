// index.js

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const {
    handleStartCommand,
    handleMyAccount,
    handleHowItWorks,
    handleUpdate,
    handleAddPaymentMethod,
    handleWithdrawRequest,
    handleConversation
} = require('./handlers/userHandlers');
const {
    handleViewAllReferrals,
    handleStartNewReferral,
    handlePayout,
    handleAdminConversation,
    handleUpdateStatus,
    handleProcessPayout
} = require('./handlers/adminHandlers');
const { userReplyKeyboard, adminReplyKeyboard } = require('./utils/keyboards'); // Import adminReplyKeyboard
// Optional proxy support (disabled by default)
let botOptions = { polling: true };

if (config.USE_PROXY === 'true') {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
    botOptions.request = { agent };
}
const bot = new TelegramBot(config.telegramBotToken, botOptions);


bot.on("polling_error", (msg) => console.log(msg));


// A single state object for ALL conversations (admin and user)
const conversationState = {};

console.log('Bot has been started...');

bot.onText(/\/start/, (msg) => {
    handleStartCommand(bot, msg);
});

const isAdmin = (chatId) => {
    return String(config.adminTelegramId) === String(chatId);
};

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && text.startsWith('/start')) {
        return;
    }

    if (isAdmin(chatId)) {
        // 1. Handle admin cancellation first.
        if (text === '✖️ Cancel') {
            if (conversationState[chatId]) {
                delete conversationState[chatId];
                bot.sendMessage(chatId, 'Operation cancelled.', {
                    reply_markup: adminReplyKeyboard // Show the main admin keyboard
                });
            }
            return; // Stop processing
        }

        // 2. If the admin is in a conversation, route the message to the handler.
        if (conversationState[chatId]) {
            handleAdminConversation(bot, msg, conversationState);
            return; // Stop processing
        }

        // 3. If there's no active conversation, treat it as a new command.
        switch (text) {
            case '➕ Start New Referral':
                handleStartNewReferral(bot, msg, conversationState); // Pass state object
                break;
            case '📋 View All Referrals':
                handleViewAllReferrals(bot, msg);
                break;
            // case '🔄 Update Status':
            //     handleUpdateStatus(bot, msg, conversationState);
            //     break;
            case '💸 Payout':
                // Pass the conversation state to start the process
                handlePayout(bot, msg, conversationState);
                break;
        }
    } else { // --- Regular User Logic (using the same conversationState object) ---
        if (text === '✖️ Cancel') {
            if (conversationState[chatId]) {
                delete conversationState[chatId];
                bot.sendMessage(chatId, 'Action cancelled.', {
                    reply_markup: userReplyKeyboard
                });
                handleMyAccount(bot, msg);
            }
            return;
        }

        if (conversationState[chatId]) {
            handleConversation(bot, msg, conversationState);
            return;
        }

        switch (text) {
            case '👤የኔ አካውንት':
                handleMyAccount(bot, msg);
                break;
            case '❓ እንዴት ይሰራል':
                handleHowItWorks(bot, msg);
                break;
            case '🔄 Update':
                handleUpdate(bot, msg);
                break;
            case '💵 ወጭ':
                handleWithdrawRequest(bot, msg, conversationState);
                break;
        }
    }
});

bot.on('callback_query', (callbackQuery) => {
    const data = callbackQuery.data;
    if (data === 'add_payment_method') {
        handleAddPaymentMethod(bot, callbackQuery, conversationState);
    }
});