// handlers/userHandlers.js

const config = require('../config');
const supabase = require('../services/supabase');
const { userReplyKeyboard, adminReplyKeyboard } = require('../utils/keyboards');
const { generateUniqueReferralCode } = require('../utils/referralCodeGenerator');


const escapeMarkdownV2 = (text) => {
    if (typeof text !== 'string') return text;
    // List of characters to escape
    const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escapedText = text;
    charsToEscape.forEach(char => {
        escapedText = escapedText.split(char).join(`\\${char}`);
    });
    return escapedText;
};

const handleStartCommand = async (bot, msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name;

    const isAdmin = telegramId === config.adminTelegramId;
    const keyboard = isAdmin ? adminReplyKeyboard : userReplyKeyboard;

    if (isAdmin) {
        bot.sendMessage(chatId, `Welcome back, Admin ${firstName}!`, {
            reply_markup: keyboard,
        });
        return;
    }

    try {
        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
        }
        if (!user) {
            console.log(`New user detected: ${firstName} (ID: ${telegramId})`);
            const referralCode = await generateUniqueReferralCode(firstName, lastName);
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([
                    {
                        telegram_id: telegramId,
                        first_name: firstName,
                        last_name: lastName,
                        referral_code: referralCode
                    },
                ])
                .select()
                .single();

            if (insertError) {
                throw insertError;
            }
            const welcomeMessage = `🎉 Welcome, ${firstName}!\n\nYou are now part of the Muktar Dish Referral Program.\n\nYour unique referral code is: \n\n\`${newUser.referral_code}\`\n\nShare this code with your friends!`;

            bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard // Use the dynamic keyboard
            });
        } else {
            console.log(`Existing user returned: ${firstName} (ID: ${telegramId})`);

            const welcomeBackMessage = `👋 Welcome back, ${firstName}!\n\nYour referral code is: \`${user.referral_code}\``;

            bot.sendMessage(chatId, welcomeBackMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard // Use the dynamic keyboard
            });
        }

    } catch (error) {
        console.error('Error in handleStartCommand:', error.message);
        bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
    }
};

const handleMyAccount = async (bot, msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, referral_code')
            .eq('telegram_id', telegramId)
            .single();

        if (userError || !user) throw new Error('Could not find user.');

        const { data: referrals, error: referralsError } = await supabase
            .from('referrals')
            .select('status')
            .eq('referrer_id', user.id);

        if (referralsError) throw referralsError;

        const completedReferrals = referrals.filter(r => r.status === 'Done' || r.status === 'Paid').length;
        const pendingReferrals = referrals.filter(r => r.status === 'Pending').length;
        const totalReferrals = referrals.length;
        const balance = completedReferrals * 50;

        // Escape the user's referral code to make it safe
        const escapedReferralCode = escapeMarkdownV2(user.referral_code);

        // This is the corrected message string with proper formatting and escaped parentheses
        const accountSummary =
            `👤 *My Account Summary*

Referral Code: \`${escapedReferralCode}\`
Balance: *${balance} birr*
Total Referrals: ${totalReferrals} \\(${completedReferrals} completed, ${pendingReferrals} pending\\)`;

        // Send the message using 'MarkdownV2'
        bot.sendMessage(chatId, accountSummary, { parse_mode: 'MarkdownV2' });

    } catch (error) {
        console.error('Error in handleMyAccount:', error.message);
        bot.sendMessage(chatId, 'Could not fetch your account details.');
    }
};

const handleHowItWorks = (bot, msg) => {
    const chatId = msg.chat.id;

    const howItWorksMessage = `💡 How Referral Works
Share my number + your unique referral code with a friend.
When they call for an installation, make sure they give me your code.
After the work is completed, you will earn a reward of 50–100 birr.
👉 Rewards can be paid in cash, airtime, or as a service discount.`;
    // Send a NEW message with the instructions
    bot.sendMessage(chatId, howItWorksMessage, { parse_mode: 'Markdown' });
};

const handleUpdate = (bot, msg) => {
    const chatId = msg.chat.id;
    const updateMessage = `🔄 Update your account information.`;
    bot.sendMessage(chatId, updateMessage, { parse_mode: 'Markdown' });
};


module.exports = {
    handleStartCommand,
    handleMyAccount,
    handleHowItWorks,
    handleUpdate,
};