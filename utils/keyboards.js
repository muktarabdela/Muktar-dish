// utils/keyboards.js

const userReplyKeyboard = {
    keyboard: [
        // First row
        [
            { text: '👤 My Account' },
            { text: '🔄 Update' }
        ],
        // Second row
        [
            { text: '❓ How it Works' }
        ]
    ],
    resize_keyboard: true, // Makes the keyboard fit nicely
    one_time_keyboard: false // Keeps the keyboard open until the user closes it
};
// --- ADD THE ADMIN KEYBOARD ---
const adminReplyKeyboard = {
    keyboard: [
        [{ text: '➕ Start New Referral' }],
        [{ text: '📋 View All Referrals' }, { text: '✅ Mark as Done' }],
        [{ text: '💸 Payout' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};
module.exports = {
    userReplyKeyboard,
    adminReplyKeyboard
};