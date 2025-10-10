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
            { text: '👤የኔ አካውንት' },
            // { text: '🔄 Update' }
        ],
        [
            { text: '❓ እንዴት ይሰራል' },
            { text: '💵 ወጭ' }
        ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

const accountInlineKeyboard = {
    inline_keyboard: [
        [
            { text: '💳 የክፍያ መንገድ ያስገቡ', callback_data: 'add_payment_method' },
        ]
    ]
};

const adminReplyKeyboard = {
    keyboard: [
        [{ text: '➕ Start New Referral' }],
        [{ text: '📋 View All Referrals' }, { text: '👥 All Users' }], // Added 'All Users'
        [{ text: '🔄 Update Status' }, { text: '💸 Payout' }]
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