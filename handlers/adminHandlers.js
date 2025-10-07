// handlers/adminHandlers.js
const { sendGroupNotification, sendGroupPhotoNotification } = require('../utils/notifications');
const supabase = require('../services/supabase');
const { adminReplyKeyboard, cancelKeyboard } = require('../utils/keyboards');

const handleStartNewReferral = (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    conversationState[chatId] = { step: 'awaiting_referral_code', data: {} };
    bot.sendMessage(chatId, "Please enter the new customer's referral code:", {
        reply_markup: cancelKeyboard
    });
};

const handleAdminConversation = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    const currentState = conversationState[chatId];

    switch (currentState.step) {
        case 'awaiting_referral_code':
            await handleReferralCodeStep(bot, msg, currentState);
            break;
        case 'awaiting_customer_name':
            await handleCustomerNameStep(bot, msg, currentState);
            break;
        case 'awaiting_customer_phone':
            await handleCustomerPhoneStep(bot, msg, currentState, conversationState);
            break;
        case 'awaiting_referral_id_for_update':
            await handleAskForStatus(bot, msg, conversationState);
            break;

        case 'awaiting_new_status':
            await handleProcessStatusUpdate(bot, msg, conversationState);
            break;

        case 'awaiting_withdrawal_id_for_payout':
            await handleProcessPayout(bot, msg, conversationState);
            break;
        case 'awaiting_payout_screenshot':
            await handlePayoutScreenshot(bot, msg, conversationState);
            break;
    }
};

const handleReferralCodeStep = async (bot, msg, currentState) => {
    const chatId = msg.chat.id;
    const referralCode = msg.text.trim();

    try {
        const { data: referrer, error } = await supabase
            .from('users')
            .select('id, first_name, telegram_id, username, referral_code')
            .eq('referral_code', referralCode)
            .single();

        if (error || !referrer) {
            if (error && error.code !== 'PGRST116') {
                console.error('Supabase query error:', error);
            }
            bot.sendMessage(chatId, "⚠️ Invalid referral code. Please check the code and try again, or press Cancel.");
            return;
        }

        currentState.data.referrer_id = referrer.id;
        currentState.data.referrer_chat_id = referrer.telegram_id;
        currentState.data.referrer_name = referrer.first_name;
        currentState.step = 'awaiting_customer_name';

        const confirmationMessage = `✅ Referral code accepted for user: *${referrer.first_name}*.\n\nEnter the new customer's name (optional, type 'skip' to omit).`;

        bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });

    } catch (err) {
        console.error('An unexpected error occurred in handleReferralCodeStep:', err);
        bot.sendMessage(chatId, "❌ A server error occurred. Please try again later.");
    }
};

const handleCustomerNameStep = async (bot, msg, currentState) => {
    if (msg.text.trim().toLowerCase() !== 'skip') {
        currentState.data.new_customer_name = msg.text.trim();
    }
    currentState.step = 'awaiting_customer_phone';
    bot.sendMessage(msg.chat.id, "Enter the customer's phone number (optional, type 'skip' to omit).");
};

const handleCustomerPhoneStep = async (bot, msg, currentState, conversationState) => {
    const chatId = msg.chat.id;
    if (msg.text.trim().toLowerCase() !== 'skip') {
        currentState.data.new_customer_phone = msg.text.trim();
    }

    try {
        // Prepare the data for insertion into the 'referrals' table
        const { error } = await supabase.from('referrals').insert([
            {
                referrer_id: currentState.data.referrer_id,
                new_customer_name: currentState.data.new_customer_name,
                new_customer_phone: currentState.data.new_customer_phone,
            }
        ]);

        if (error) {
            throw error;
        }

        const customerName = currentState.data.new_customer_name || 'Not Provided';
        const customerPhone = currentState.data.new_customer_phone || 'Not Provided';
        const referrerName = currentState.data.referrer_name;

        // 1. Construct and send the detailed message to the ADMIN
        const adminMessage = `✅ *New Referral Created Successfully* ✅\n\n` +
            `*Referrer:* ${referrerName}\n` +
            `*New Customer Name:* ${customerName}\n` +
            `*New Customer Phone:* ${customerPhone}\n\n` +
            `The status has been set to 'Pending'.`;

        bot.sendMessage(chatId, adminMessage, {
            parse_mode: 'Markdown',
            reply_markup: adminReplyKeyboard
        });
        const groupMessage = `✅ *አዲስ ሪፈራል ተመዝግቧል*\n\n` +
            `*${referrerName}* አዲስ ደንበኛ ጠቁሟል: *${customerName}*`;
        await sendGroupNotification(bot, groupMessage);

        // 2. Construct and send the detailed message to the original REFERRER
        const userMessage = `🎉 *አዲስ ሪፈራል አግኝተዋል!* 🎉\n\n` +
            `አዲስ ደንበኛ, *${customerName}*, የእርስዎን የሪፈራል ኮድ በመጠቀም ተመዝግቧል።\n\n` +
            `*ሁኔታ:* በመጠባበቅ ላይ\n\n` +
            `የዲሽ ገጠማው ሲጠናቀቅ ክፍያዎ ገቢ ይደረግልዎታል። እናመሰግናለን`;

        bot.sendMessage(currentState.data.referrer_chat_id, userMessage, { parse_mode: 'Markdown' });
    } catch (dbError) {
        // Catch any database errors and inform the admin
        console.error('Supabase insert error:', dbError);
        bot.sendMessage(chatId, "❌ Something went wrong while saving the referral. Please try again.", {
            reply_markup: adminReplyKeyboard
        });

    } finally {
        delete conversationState[chatId];
    }
};

// --- Admin Referral Management ---
const handleViewAllReferrals = async (bot, msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "📋 Fetching all referrals, please wait...");

    try {
        // Query the 'referrals' table and join with the 'users' table
        // to get the referrer's name.
        const { data: referrals, error } = await supabase
            .from('referrals')
            .select(`
                id,
                new_customer_name,
                status,
                created_at,
                users (
                    first_name
                )
            `)
            .order('created_at', { ascending: false }); // Show the newest referrals first

        if (error) throw error;

        if (!referrals || referrals.length === 0) {
            bot.sendMessage(chatId, "There are currently no referrals in the system.");
            return;
        }

        // Format the list of referrals into a single message
        let message = '📋 *All Referrals*\n\n';
        referrals.forEach(ref => {
            const date = new Date(ref.created_at).toLocaleDateString('en-GB');
            const customer = ref.new_customer_name || 'N/A';
            const referrer = ref.users ? ref.users.first_name : 'Unknown';

            message += `*ID: ${ref.id}* | \`${ref.status}\`\n` +
                `*Referrer:* ${referrer}\n` +
                `*New Customer:* ${customer}\n` +
                `*Date:* ${date}\n\n---\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (dbError) {
        console.error("Error fetching referrals:", dbError);
        bot.sendMessage(chatId, "❌ An error occurred while fetching the referrals. Please try again.");
    }
};

// --- Admin Referral Marking ---
const handleUpdateStatus = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "📋 Fetching pending referrals, please wait...");

    try {
        // 1. Fetch only the referrals with 'Pending' status
        const { data: pendingReferrals, error } = await supabase
            .from('referrals')
            .select(`
                id,
                new_customer_name,
                status,
                created_at,
                users ( first_name )
            `)
            .eq('status', 'Pending')
            .order('created_at', { ascending: true }); // Show oldest first

        if (error) throw error;

        // 2. Handle the case where there are no pending referrals
        if (!pendingReferrals || pendingReferrals.length === 0) {
            bot.sendMessage(chatId, "There are no pending referrals to mark as done.", {
                reply_markup: adminReplyKeyboard
            });
            return; // Exit the function
        }

        // 3. Format the list of pending referrals
        let listMessage = '📝 *Pending Referrals*\n\n';
        // Format the message using the detailed layout
        pendingReferrals.forEach(ref => {
            const date = new Date(ref.created_at).toLocaleDateString('en-GB');
            const customer = ref.new_customer_name || 'N/A';
            const referrer = ref.users ? ref.users.first_name : 'Unknown';

            listMessage += `*ID: ${ref.id}* | \`${ref.status}\`\n` +
                `*Referrer:* ${referrer}\n` +
                `*New Customer:* ${customer}\n` +
                `*Date:* ${date}\n\n---\n\n`;
        });
        listMessage += `\n------------------------------------\n` +
            `Please reply with the ID of the referral you want to complete.`;

        // 4. Send the list and the prompt to the admin
        bot.sendMessage(chatId, listMessage, {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard // Show cancel keyboard for the conversation
        });

        // 5. Set the state to wait for the admin's response
        conversationState[chatId] = { step: 'awaiting_referral_id_for_update' };

    } catch (dbError) {
        console.error("Error fetching pending referrals:", dbError);
        bot.sendMessage(chatId, "❌ An error occurred while fetching the list. Please try again.", {
            reply_markup: adminReplyKeyboard
        });
    }
};
const handleAskForStatus = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    const referralId = parseInt(msg.text.trim(), 10);

    // 1. Validate if the input is a number
    if (isNaN(referralId)) {
        bot.sendMessage(chatId, "That's not a valid number. Please send only the numeric ID.");
        return; // Keep conversation open for another try
    }

    try {
        // 2. NEW: Check if the referral ID exists in the database
        const { data: referral, error } = await supabase
            .from('referrals')
            .select('status') // We only need the status for validation
            .eq('id', referralId)
            .single(); // We expect one result

        // 3. Handle cases where the ID is not found or an error occurs
        if (error || !referral) {
            bot.sendMessage(chatId, `❌ No referral found with ID *${referralId}*. Please check the ID and try again.`, {
                parse_mode: 'Markdown',
                reply_markup: adminReplyKeyboard
            });
            delete conversationState[chatId]; // End the conversation
            return;
        }

        // Optional: Check if the referral is already processed
        if (referral.status !== 'Pending') {
            bot.sendMessage(chatId, `This referral (ID: ${referralId}) has already been processed. Its status is '${referral.status}'.`, {
                reply_markup: adminReplyKeyboard
            });
            delete conversationState[chatId];
            return;
        }


        // 4. If validation passes, store the ID and ask for the new status
        conversationState[chatId].referralId = referralId;
        conversationState[chatId].step = 'awaiting_new_status';

        bot.sendMessage(chatId, `You selected referral ID *${referralId}*.\n\nWhich status do you want to set?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: 'Done' }, { text: 'Rejected' }],
                    [{ text: 'Pending' }]
                ],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });

    } catch (dbError) {
        console.error("Error validating referral ID:", dbError);
        bot.sendMessage(chatId, "❌ An error occurred while validating the ID. Please try again.", {
            reply_markup: adminReplyKeyboard
        });
        delete conversationState[chatId];
    }
};

const handleProcessStatusUpdate = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    const newStatus = msg.text.trim();
    const { referralId } = conversationState[chatId]; // Get ID from state

    // Supported statuses
    if (!['Done', 'Rejected', 'Pending'].includes(newStatus)) {
        bot.sendMessage(chatId, "Invalid status. Please choose from the keyboard.", { reply_markup: adminReplyKeyboard });
        delete conversationState[chatId];
        return;
    }

    try {
        // For 'Done', we need full details; for others, just the ID is enough.
        const { data: referral, error: fetchError } = await supabase
            .from('referrals')
            .select(`*, users (*)`).eq('id', referralId).single();

        if (fetchError || !referral) {
            throw new Error(`Referral with ID ${referralId} not found.`);
        }

        // --- Main Logic Switch ---
        switch (newStatus) {
            case 'Done':
                if (referral.status === 'Done') {
                    bot.sendMessage(chatId, `Referral ${referralId} is already marked as 'Done'.`, { reply_markup: adminReplyKeyboard });
                    break;
                }

                const reward = referral.reward_amount;
                const userToUpdate = referral.users;
                const newBalance = (userToUpdate.balance || 0) + reward;

                // 1. Update user balance
                await supabase.from('users').update({ balance: newBalance }).eq('id', userToUpdate.id);
                // 2. Update referral status
                await supabase.from('referrals').update({ status: 'Done' }).eq('id', referralId);

                // Admin confirmation
                bot.sendMessage(chatId, `✅ Success! Referral ID ${referralId} is now 'Done'.\nUser *${userToUpdate.first_name}* has been credited with *${reward} birr*.`, { parse_mode: 'Markdown', reply_markup: adminReplyKeyboard });
                // User notification
                const userDoneMessage = `🎉 ለ *${referral.new_customer_name}* ያደረጉት ሪፈራል በተሳካ ሁኔታ ተጠናቋል!\n\n*${reward} ብር* ወደ ሂሳብዎ ገቢ ተደርጓል። \n ከአካውንትዎ ወጪ ማድረግ ይችላሉ።`;
                bot.sendMessage(userToUpdate.telegram_id, userDoneMessage, { parse_mode: 'Markdown' });

                const groupDoneMessage = `✅ *ሪፈራል ተጠናቋል*\n\n` +
                    `በ *${userToUpdate.first_name}* ለ *${referral.new_customer_name}*  የተደረገው ሪፈራል ተጠናቋል። *${reward} ብር* ተከፍሏል።`;
                await sendGroupNotification(bot, groupDoneMessage);
                break;
            case 'Rejected':
                // 2. Update referral status
                const userToReject = referral.users;
                await supabase.from('referrals').update({ status: 'Rejected' }).eq('id', referralId);
                // Admin confirmation
                bot.sendMessage(chatId, `✅ Success! Referral ID ${referralId} is now 'Rejected'.`, { parse_mode: 'Markdown', reply_markup: adminReplyKeyboard });

                // User notification - CORRECTED LINE
                const userRejectedMessage = `❌ Your referral for *${referral.new_customer_name}* has been rejected.\n\nIf you have any questions, you can contact us @Muktar\\_abdela or call 0932874527.`;

                bot.sendMessage(userToReject.telegram_id, userRejectedMessage, { parse_mode: 'Markdown' });

                const groupRejectedMessage = `❌ *Referral Rejected*\n\n` +
                    `The referral for *${referral.new_customer_name}* by *${userToReject.first_name}* has been rejected.`;
                await sendGroupNotification(bot, groupRejectedMessage);
                break;
            case 'Pending':
                if (referral.status === newStatus) {
                    bot.sendMessage(chatId, `Referral ${referralId} is already set to '${newStatus}'.`, { reply_markup: adminReplyKeyboard });
                    break;
                }
                // Just update the status without any reward logic
                const { error } = await supabase.from('referrals').update({ status: newStatus }).eq('id', referralId);
                if (error) throw error;
                bot.sendMessage(chatId, `✅ Success! Referral ID ${referralId} has been updated to '${newStatus}'.`, { reply_markup: adminReplyKeyboard });
                break;
        }

    } catch (error) {
        console.error("Error updating referral status:", error.message);
        bot.sendMessage(chatId, `❌ An error occurred: ${error.message}`, { reply_markup: adminReplyKeyboard });
    } finally {
        delete conversationState[chatId]; // End conversation
    }
};


const handlePayout = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "💰 Fetching pending withdrawal requests, please wait...");

    try {
        // 1. Fetch pending requests and join with user data
        const { data: requests, error } = await supabase
            .from('withdrawal_requests')
            .select(`
                id,
                amount,
                requested_at,
                users (
                    first_name,
                    payment_method,
                    payment_account_name,
                    payment_account_number,
                    username
                )
            `)
            .eq('status', 'pending')
            .order('requested_at', { ascending: true });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            bot.sendMessage(chatId, "There are no pending payout requests.", {
                reply_markup: adminReplyKeyboard
            });
            return;
        }

        // 2. Format the list for the admin
        let listMessage = '💸 *Pending Payout Requests*\n\n';
        requests.forEach(req => {
            const date = new Date(req.requested_at).toLocaleDateString('en-GB');
            const userName = req.users ? req.users.first_name : 'Unknown';
            const user_name = req.users ? req.users.username : 'Unknown';
            const paymentAccountName = req.users ? req.users.payment_account_name : 'Unknown';
            const paymentAccountNumber = req.users ? req.users.payment_account_number : 'Unknown';

            const paymentInfo = req.users?.payment_method || 'Not Set';

            listMessage += `*ID: ${req.id}* | *${req.amount} birr*\n` +
                `*User:* ${userName}\n` +
                `*User Name:* @${user_name}\n` +
                `*Payment Account Name:* ${paymentAccountName}\n` +
                `*Payment Account Number:* ${paymentAccountNumber}\n` +
                `*Payment Info:* \`${paymentInfo}\`\n` +
                `*Requested On:* ${date}\n\n---\n\n`;
        });
        listMessage += `Please reply with the ID of the request you have paid.`;

        bot.sendMessage(chatId, listMessage, {
            parse_mode: 'Markdown',
            reply_markup: cancelKeyboard
        });

        // 3. Set conversation state to await the admin's ID selection
        conversationState[chatId] = { step: 'awaiting_withdrawal_id_for_payout' };

    } catch (dbError) {
        console.error("Error fetching withdrawal requests:", dbError);
        bot.sendMessage(chatId, "❌ An error occurred while fetching payout requests.", {
            reply_markup: adminReplyKeyboard
        });
    }
};

const handleProcessPayout = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    const requestId = parseInt(msg.text.trim(), 10);

    if (isNaN(requestId)) {
        bot.sendMessage(chatId, "Invalid ID. Please reply with the numeric ID.");
        return;
    }

    try {
        const { data: request, error: fetchError } = await supabase
            .from('withdrawal_requests')
            .select('id')
            .eq('id', requestId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !request) {
            bot.sendMessage(chatId, `❌ No pending request found with ID *${requestId}*.`, {
                parse_mode: 'Markdown',
                reply_markup: adminReplyKeyboard
            });
            delete conversationState[chatId];
            return;
        }

        // NEW: Ask for screenshot instead of processing immediately
        conversationState[chatId] = {
            step: 'awaiting_payout_screenshot',
            payoutId: requestId // Store the ID
        };
        bot.sendMessage(chatId, `✅ Request ID ${requestId} is valid. Please upload the payment screenshot now.`, {
            reply_markup: cancelKeyboard
        });

    } catch (error) {
        console.error("Error in handleProcessPayout:", error.message);
        bot.sendMessage(chatId, `❌ An error occurred: ${error.message}`, { reply_markup: adminReplyKeyboard });
        delete conversationState[chatId];
    }
};
const handlePayoutScreenshot = async (bot, msg, conversationState) => {
    const chatId = msg.chat.id;
    const { payoutId } = conversationState[chatId];

    if (!msg.photo) {
        bot.sendMessage(chatId, "Please upload an image file as proof.");
        return;
    }

    try {
        const photoFileId = msg.photo[msg.photo.length - 1].file_id;

        const { data: request, error: fetchError } = await supabase
            .from('withdrawal_requests')
            .select(`amount, users(telegram_id, first_name)`)
            .eq('id', payoutId)
            .single();

        if (fetchError) throw fetchError;

        await supabase
            .from('withdrawal_requests')
            .update({ status: 'paid', processed_at: new Date() })
            .eq('id', payoutId);

        // Notify Admin
        bot.sendMessage(chatId, `✅ Success! Payout ID ${payoutId} is marked as 'paid'.`, {
            reply_markup: adminReplyKeyboard
        });

        // Notify User
        const userMessage = `🎉 የ *${request.amount} ብር* ክፍያዎ ተልኳል! \n የአካውንትዎን ቀሪ ሂሳብ ያረጋግጡ።`;
        bot.sendMessage(request.users.telegram_id, userMessage, { parse_mode: 'Markdown' });

        // NEW: Notify Group with Photo
        const groupCaption = `💸 *ክፍያ ተልኳል!*\n\n*${request.amount} ብር* ለ *${request.users.first_name}* ተልኳል።`;
        await sendGroupPhotoNotification(bot, photoFileId, groupCaption);

    } catch (error) {
        console.error("Error processing payout screenshot:", error.message);
        bot.sendMessage(chatId, `❌ An error occurred: ${error.message}`, { reply_markup: adminReplyKeyboard });
    } finally {
        delete conversationState[chatId];
    }
};



module.exports = {
    handleStartNewReferral,
    handleViewAllReferrals,
    handleUpdateStatus,
    handlePayout,
    handleAdminConversation,
    handleProcessPayout,
    handlePayoutScreenshot
};