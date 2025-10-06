const config = require('../config');

/**
 * Sends a text message to the main Telegram group.
 * @param {TelegramBot} bot The bot instance.
 * @param {string} message The message to send.
 */
const sendGroupNotification = async (bot, message) => {
    try {
        await bot.sendMessage(config.telegramGroupId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Failed to send group notification:', error.message);
    }
};

/**
 * Sends a photo with a caption to the main Telegram group.
 * @param {TelegramBot} bot The bot instance.
 * @param {string} photoFileId The file_id of the photo.
 * @param {string} caption The caption for the photo.
 */
const sendGroupPhotoNotification = async (bot, photoFileId, caption) => {
    try {
        await bot.sendPhoto(config.telegramGroupId, photoFileId, {
            caption: caption,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Failed to send group photo notification:', error.message);
    }
};


module.exports = {
    sendGroupNotification,
    sendGroupPhotoNotification
};