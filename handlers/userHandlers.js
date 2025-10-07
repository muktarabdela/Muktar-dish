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
            const referralCode = await generateUniqueReferralCode();
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
            const welcomeMessage = `🎉 እንኳን ደህና መጡ, ${firstName}!\n\nአሁን የሙክታር ዲሽ የሪፈራል ፕሮግራም አባል ሆነዋል።\n\nየእርስዎ ልዩ የሪፈራል ኮድ: \n\n\`${newUser.referral_code}\`\n\nይህን ኮድ ለጓደኞችዎ ያጋሩ!`;

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
            `🔑 *የሪፈራል ኮድ*\n\`${escapedReferralCode}\`\n\n` +
            `💰 *ያለዎት ቀሪ ሂሳብ*\n\`${balance} ብር\`\n\n` +
            `📈 *Referral Statistics*\n` +
            `   \\- ጠቅላላ: ${totalReferrals}\n` +
            `   \\- የተጠናቀቀ: ${completedReferrals}\n` +
            `   \\- በመጠባበቅ ላይ: ${pendingReferrals}\n` +
            `\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\n\n`; // Markdown separator

        let options = {
            parse_mode: 'MarkdownV2',
        };

        // Payment Information Section
        if (user.payment_method && user.payment_account_number) {
            const escapedPaymentName = escapeMarkdownV2(user.payment_account_name);
            const escapedPaymentNumber = escapeMarkdownV2(user.payment_account_number);

            accountSummary += `💳 *የክፍያ መረጃ*\n` +
                `   \\- *ክፍያ መንገድ:* ${escapeMarkdownV2(user.payment_method)}\n` +
                `   \\- *ስም:* ${escapedPaymentName}\n` +
                `   \\- *አካውንት:* ${escapedPaymentNumber}`;

            options.reply_markup = userReplyKeyboard; // Show main keyboard

        } else {
            accountSummary += `💳 *የክፍያ መረጃ*\n` +
                `እስካሁን የክፍያ መንገድ አላስገቡም።\\ ገቢዎን ወጪ ለማድረግ እባክዎ የክፍያ መንገድ ያስገቡ።\\.`;

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

    const message = "እባክዎ የክፍያ ዘዴዎን ይምረጡ።\n\nለ ቴሌብር `TE` ይላኩ \nለ ኢትዮጵያ ንግድ ባንክ `CB` ይላኩ\n\nወይም ለመመለስ Cancel የሚለውን ይጫኑ።";

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
            bot.sendMessage(chatId, 'ወጪ ከማድረግዎ በፊት የክፍያ መንገድ ማስገባት አለብዎት።', {
                reply_markup: accountInlineKeyboard
            });
            return;
        }

        // 3. Check for sufficient balance
        if (user.balance < minimumWithdrawal) {
            bot.sendMessage(chatId, `ያለዎት ቀሪ ሂሳብዎ በጣም ዝቅተኛ ነው። ወጪ ለማድረግ ቢያንስ ${minimumWithdrawal} ብር ያስፈልግዎታል. የእርስዎ የአሁን ቀሪ ሂሳብ ${user.balance} ብር ነው.`);
            return;
        }

        // 4. If checks pass, start the withdrawal conversation
        userState[chatId] = {
            expecting: 'withdrawal_amount',
            balance: user.balance // Store the current balance in the state
        };

        const promptMessage = `💰 ያለዎት ቀሪ ሂሳብ *${user.balance} ብር ነው*.

ክፍያዎ ወደ ሚከተለው ይላካል:
- ክፍያ መንገድ: ${user.payment_method}
- ስም: ${user.payment_account_name}
- አካውንት: ${user.payment_account_number}

እባክዎ ወጪ ማድረግ የሚፈልጉትን የገንዘብ መጠን ያስገቡ።`;

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
        bot.sendMessage(chatId, `በጣም ጥሩ! እባክዎ የ ${selectedMethod} አካውንትዎን ስም ያስገቡ።`);
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
        bot.sendMessage(chatId, `እናመሰግናለን! አሁን እባክዎ የ ${state.method} አካውንትዎን/ስልክ ያስገቡ።`);
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


        bot.sendMessage(chatId, `✅ የ ${state.method} ክፍያ መረጃዎ ተመዝግቧል።`, {
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
            bot.sendMessage(chatId, `You cannot withdraw more than your available balance. Your balance is ${currentBalance} ብር. Please enter a different amount.`);
            return;
        }

        // Validation 3: Check if it's less than the minimum
        if (amountToWithdraw < minimumWithdrawal) {
            bot.sendMessage(chatId, `ዝቅተኛው ወጪ ማድረግ የሚቻለው የገንዘብ መጠን ${minimumWithdrawal} ብር ነው። እባክዎ ከዚህ በላይ የሆነ መጠን ያስገቡ።`);
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
            const userMessage = `✅ *ገንዘብ የማውጣት ጥያቄዎ ተልኳል* ✅\n\n` +
                `*${amountToWithdraw} ብር* ወጪ ለማድረግ የላኩት ጥያቄ ተቀብለናል፤ አሁን በመጠባበቅ ላይ ነው።\n\n` +
                `*አዲሱ ቀሪ ሂሳብዎ :* ${newBalance} ብር\n\n` +
                `*ገንዘቡ የሚላከው ወደ:*\n` +
                `  - ክፍያ መንገድ: ${user.payment_method}\n` +
                `  - ስም: ${user.payment_account_name}\n` +
                `  - አካውንት: ${user.payment_account_number}`;

            bot.sendMessage(chatId, userMessage, {
                parse_mode: 'Markdown',
                reply_markup: userReplyKeyboard
            });

            const adminMessage = `💰 *New Withdrawal Request* 💰\n\n` +
                `*User:* ${user.first_name}\n` +
                `*user name:* @${user.username}\n` +
                `*user code:* ${user.referral_code}\n` +
                `*Amount:* ${amountToWithdraw} ብር\n\n` +
                `*Payment Details:*\n` +
                `  - ክፍያ መንገድ: ${user.payment_method}\n` +
                `  - ስም: ${user.payment_account_name}\n` +
                `  - አካውንት: ${user.payment_account_number}`;

            bot.sendMessage(config.adminTelegramId, adminMessage, { parse_mode: 'Markdown' });

            const groupWithdrawalMessage = `💰 *አዲስ ገንዘብ የማውጣት ጥያቄ*\n\n` +
                `${user.first_name} ${amountToWithdraw} ብር ወጪ ለማድረግ ጠይቋል።`;
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

    const howItWorksMessage = `💡 *የሪፈራል ፕሮግራሙ እንዴት ይሰራል* 💡

በጣም ቀላል ነው! እነዚህን ሶስት ደረጃዎች ብቻ ይከተሉ:

1️⃣ *ኮድዎን ያጋሩ*
    ለጓደኞችዎ፣ ለቤተሰብዎ ወይም የዲሽ ገጠማ አገልግሎት ለሚፈልግ ማንኛውም ሰው ከ 'የእኔ አካውንት' ክፍል ውስጥ የሚገኘውን ልዩ የሪፈራል ኮድዎን ይስጡ።

2️⃣ *ጓደኛዎ አገልግሎቱን ሲጠይቅ/ወደ ሲደውል*
    ጓደኛዎ አገልግሎቱን ለማግኘት ሲደውል የእርስዎን የሪፈራል ኮድ መስጠት አለበት። ሽልማትዎን እንዲያገኙ ለማረጋገጥ ይህ በጣም አስፈላጊው እርምጃ ነው!

3️⃣ * እርስዎ ይሸለማሉ!*
    የዲሽ ገጠማው በተሳካ ሁኔታ ከተጠናቀቀ በኋላ ከ50 እስከ 100 ብር ኮሚሽን ያገኛሉ። የእርስዎ አካውንት ቀሪ ሂሳብ በራስ-ሰር ይስተካከላል።
------------------------------------

💸 *ገቢዎን እንዴት ማግኘት ይችላሉ*
ዝቅተኛውን መጠን ሲያሟሉ ገቢዎን ወጪ ማድረግ ይችላሉ። ሽልማቶች በቴሌብር፣ በኢትዮጵያ ንግድ ባንክ (CBE)።
መልካም ማጋራት!`;

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