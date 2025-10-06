// utils/keyboards.js

const cancelKeyboard = {
    keyboard: [
        [{ text: '✖️ Cancel' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
};

const userReplyKeyboard = {
    keyboard: [
        [
            { text: '👤 My Account' },
            { text: '🔄 Update' }
        ],
        [
            { text: '❓ How it Works' },
            { text: '💵 Withdraw' }
        ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

const accountInlineKeyboard = {
    inline_keyboard: [
        [
            { text: '💳 Add Payment Method', callback_data: 'add_payment_method' },
        ]
    ]
};

const adminReplyKeyboard = {
    keyboard: [
        [{ text: '➕ Start New Referral' }],
        [{ text: '📋 View All Referrals' }, { text: '🔄 Update Status' }],
        [{ text: '💸 Payout' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};



module.exports = {
    userReplyKeyboard,
    adminReplyKeyboard,
    accountInlineKeyboard,
    cancelKeyboard,
};