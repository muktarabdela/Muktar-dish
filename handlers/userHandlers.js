// handlers/userHandlers.js
const { sendGroupNotification } = require('../utils/notifications');
const config = require('../config');
const supabase = require('../services/supabase');
const { userReplyKeyboard, adminReplyKeyboard, accountInlineKeyboard, cancelKeyboard } = require('../utils/keyboards');
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
    const userName = msg.from.username;

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
                        referral_code: referralCode,
                        username: userName
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
        // Fetch user data including payment info
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, referral_code, payment_method, payment_account_name, payment_account_number, balance')
            .eq('telegram_id', telegramId)
            .single();

        if (userError || !user) {
            console.error('Could not find user in handleMyAccount:', userError?.message);
            throw new Error('Could not find user.');
        }

        const { data: referrals, error: referralsError } = await supabase
            .from('referrals')
            .select('status')
            .eq('referrer_id', user.id);

        if (referralsError) throw referralsError;

        const completedReferrals = referrals.filter(r => r.status === 'Done' || r.status === 'Paid').length;
        const pendingReferrals = referrals.filter(r => r.status === 'Pending').length;
        const totalReferrals = referrals.length;

        // --- NEW: Structured Message Construction ---

        const balance = user.balance || 0;
        const escapedReferralCode = escapeMarkdownV2(user.referral_code);

        // Header and Core Details
        let accountSummary = `👤 *Your Account Dashboard*\n\n` +
            `🔑 *Your Referral Code*\n\`${escapedReferralCode}\`\n\n` +
            `💰 *Current Balance*\n\`${balance} birr\`\n\n` +
            `📈 *Referral Statistics*\n` +
            `   \\- Total: ${totalReferrals}\n` +
            `   \\- Completed: ${completedReferrals}\n` +
            `   \\- Pending: ${pendingReferrals}\n` +
            `\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\n\n`; // Markdown separator

        let options = {
            parse_mode: 'MarkdownV2',
        };

        // Payment Information Section
        if (user.payment_method && user.payment_account_number) {
            const escapedPaymentName = escapeMarkdownV2(user.payment_account_name);
            const escapedPaymentNumber = escapeMarkdownV2(user.payment_account_number);

            accountSummary += `💳 *Payment Information*\n` +
                `   \\- *Method:* ${escapeMarkdownV2(user.payment_method)}\n` +
                `   \\- *Name:* ${escapedPaymentName}\n` +
                `   \\- *Account:* ${escapedPaymentNumber}`;

            options.reply_markup = userReplyKeyboard; // Show main keyboard

        } else {
            accountSummary += `💳 *Payment Information*\n` +
                `You have not added a payment method yet\\. To withdraw your earnings, please add one\\.`;

            options.reply_markup = accountInlineKeyboard; // Show 'Add Payment Method' button
        }

        bot.sendMessage(chatId, accountSummary, options);

    } catch (error) {
        console.error('Error in handleMyAccount:', error.message);
        bot.sendMessage(chatId, 'Could not fetch your account details.');
    }
};

const handleAddPaymentMethod = (bot, callbackQuery, userState) => {
    const chatId = callbackQuery.message.chat.id;

    // Set the user's state to expect a payment method choice
    userState[chatId] = { expecting: 'payment_method_choice' };

    const message = "Please choose your payment method.\n\nSend `TE` for Telebirr\nSend `CB` for CBE\n\nOr press Cancel to go back.";

    // Send the message and replace the main keyboard with the cancel keyboard
    bot.sendMessage(chatId, message, {
        reply_markup: cancelKeyboard
    });

    bot.answerCallbackQuery(callbackQuery.id);
};

const handleWithdrawRequest = async (bot, msg, userState) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const minimumWithdrawal = 50;

    try {
        // 1. Fetch all necessary user data
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, balance, payment_method, payment_account_name, payment_account_number')
            .eq('telegram_id', telegramId)
            .single();

        if (userError || !user) throw new Error('Could not find user.');

        // 2. Check for payment method
        if (!user.payment_method) {
            bot.sendMessage(chatId, 'You need to add a payment method before you can withdraw.', {
                reply_markup: accountInlineKeyboard
            });
            return;
        }

        // 3. Check for sufficient balance
        if (user.balance < minimumWithdrawal) {
            bot.sendMessage(chatId, `Your balance is too low. You need at least ${minimumWithdrawal} birr to withdraw. Your current balance is ${user.balance} birr.`);
            return;
        }

        // 4. If checks pass, start the withdrawal conversation
        userState[chatId] = {
            expecting: 'withdrawal_amount',
            balance: user.balance // Store the current balance in the state
        };

        const promptMessage = `💰 Your current balance is *${user.balance} birr*.

Your payment will be sent to:
- Method: ${user.payment_method}
- Name: ${user.payment_account_name}
- Account: ${user.payment_account_number}

Please enter the amount you would like to withdraw.`;

        bot.sendMessage(chatId, promptMessage, {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard // Show the cancel button
        });

    } catch (error) {
        console.error('Error in handleWithdrawRequest:', error.message);
        bot.sendMessage(chatId, 'Could not start your withdrawal request.');
    }
};

const handleConversation = async (bot, msg, userState) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const text = msg.text.trim().toUpperCase();
    const state = userState[chatId];

    if (!state) return;

    // Stage 1: Waiting for payment method choice (TE or CB)
    if (state.expecting === 'payment_method_choice') {
        let selectedMethod = '';
        if (text === 'TE') {
            selectedMethod = 'Telebirr';
        } else if (text === 'CB') {
            selectedMethod = 'CBE';
        } else {
            bot.sendMessage(chatId, "Invalid choice. Please send either `TE` or `CB`.");
            return;
        }

        // Update state to wait for the account name
        userState[chatId] = {
            expecting: 'account_name',
            method: selectedMethod
        };
        bot.sendMessage(chatId, `Great! Please send the name on your ${selectedMethod} account.`);
    }
    // Stage 2: Waiting for the account name
    else if (state.expecting === 'account_name') {
        const accountName = msg.text.trim();

        // Update state to wait for the payment number
        userState[chatId] = {
            expecting: 'payment_number',
            method: state.method,
            accountName: accountName
        };
        bot.sendMessage(chatId, `Thanks! Now, please send your ${state.method} account/phone number.`);
    }
    // Stage 3: Waiting for the payment number
    else if (state.expecting === 'payment_number') {
        const paymentNumber = msg.text.trim();
        const paymentMethod = state.method;
        const accountName = state.accountName;

        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .update({
                payment_method: paymentMethod,
                payment_account_name: accountName,
                payment_account_number: paymentNumber
            })
            .eq('telegram_id', telegramId);

        if (insertError) {
            console.error('Error updating user:', insertError.message);
            bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
            return;
        }


        bot.sendMessage(chatId, `✅ Your ${state.method} payment information has been saved.`, {
            reply_markup: userReplyKeyboard
        });

        delete userState[chatId];

        handleMyAccount(bot, msg);
    }
    // Stage 4: Waiting for withdrawal amount
    else if (state.expecting === 'withdrawal_amount') {
        const amountToWithdraw = parseFloat(msg.text.trim());
        const currentBalance = state.balance;
        const minimumWithdrawal = 50;

        // Validation 1: Check if it's a valid number
        if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
            bot.sendMessage(chatId, "Invalid amount. Please enter a positive number.");
            return;
        }

        // Validation 2: Check if it's more than their balance
        if (amountToWithdraw > currentBalance) {
            bot.sendMessage(chatId, `You cannot withdraw more than your available balance. Your balance is ${currentBalance} birr. Please enter a different amount.`);
            return;
        }

        // Validation 3: Check if it's less than the minimum
        if (amountToWithdraw < minimumWithdrawal) {
            bot.sendMessage(chatId, `The minimum withdrawal amount is ${minimumWithdrawal} birr. Please enter a higher amount.`);
            return;
        }

        try {
            // Fetch user ID for the database operations
            const { data: user, error: userError } = await supabase
                .from('users')
                .select(
                    'id, first_name, username, referral_code, payment_method, payment_account_name, payment_account_number'
                )
                .eq('telegram_id', telegramId)
                .single();

            if (userError || !user) throw new Error('User not found during withdrawal processing.');

            // Create the withdrawal request record
            await supabase.from('withdrawal_requests').insert({
                user_id: user.id,
                amount: amountToWithdraw,
                status: 'pending'
            });

            // Update the user's balance
            const newBalance = currentBalance - amountToWithdraw;
            await supabase.from('users').update({ balance: newBalance }).eq('id', user.id);

            // Success!
            const userMessage = `✅ *Withdrawal Request Submitted* ✅\n\n` +
                `Your request to withdraw *${amountToWithdraw} birr* has been received and is now pending.\n\n` +
                `*Your New Balance:* ${newBalance} birr\n\n` +
                `*Funds will be sent to:*\n` +
                `  - Method: ${user.payment_method}\n` +
                `  - Name: ${user.payment_account_name}\n` +
                `  - Account: ${user.payment_account_number}`;

            bot.sendMessage(chatId, userMessage, {
                parse_mode: 'Markdown',
                reply_markup: userReplyKeyboard
            });

            const adminMessage = `💰 *New Withdrawal Request* 💰\n\n` +
                `*User:* ${user.first_name}\n` +
                `*user name:* @${user.username}\n` +
                `*user code:* ${user.referral_code}\n` +
                `*Amount:* ${amountToWithdraw} birr\n\n` +
                `*Payment Details:*\n` +
                `  - Method: ${user.payment_method}\n` +
                `  - Name: ${user.payment_account_name}\n` +
                `  - Account: ${user.payment_account_number}`;

            bot.sendMessage(config.adminTelegramId, adminMessage, { parse_mode: 'Markdown' });

            const groupWithdrawalMessage = `💰 *New Withdrawal Request*\n\n` +
                `*${user.first_name}* has requested to withdraw *${amountToWithdraw} birr*.`;
            await sendGroupNotification(bot, groupWithdrawalMessage);

            // Clear the state to end the conversation
            delete userState[chatId];

        } catch (error) {
            console.error('Error processing withdrawal:', error.message);
            bot.sendMessage(chatId, 'Sorry, something went wrong while processing your request. Please try again.');
            delete userState[chatId]; // Also clear state on error
        }
    }
};
// ... (other handlers remain the same)

const handleHowItWorks = (bot, msg) => {
    const chatId = msg.chat.id;

    const howItWorksMessage = `💡 *How the Referral Program Works* 💡

It's simple! Just follow these three steps:

1️⃣ *Share Your Code*
   Give your unique referral code (from the 'My Account' section) to friends, family, or anyone who needs a dish installation.

2️⃣ *Your Friend Makes Contact*
   When your friend calls to book the service, they *must* provide your referral code. This is the most important step to ensure you get your reward!

3️⃣ *You Get Rewarded!*
   After their installation is successfully completed, you will earn a commission of *50 to 100 birr*. Your account balance will be updated automatically.

------------------------------------

💸 *How to Get Your Earnings*
You can withdraw your balance once you reach the minimum amount. Rewards can be paid out via Telebirr, CBE, or even as a discount on your own services.

Happy sharing!`;

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
    handleAddPaymentMethod,  // <-- Add this
    handleWithdrawRequest, // <-- Add this
    handleConversation,      // <-- Add this
};