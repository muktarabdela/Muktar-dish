// utils/referralCodeGenerator.js

const supabase = require('../services/supabase');

/**
 * Generates a unique referral code.
 * The code consists of two random uppercase letters and three random digits (e.g., 'AB-123').
 * @returns {Promise<string>} A unique referral code.
 */
const generateUniqueReferralCode = async () => {
    let referralCode;
    let isUnique = false;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // Keep generating a new code until a unique one is found
    while (!isUnique) {
        // 1. Generate two random letters from A-Z.
        const randomLetter1 = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        const randomLetter2 = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        const letters = `${randomLetter1}${randomLetter2}`;

        // 2. Generate a 3-digit random number.
        const randomDigits = Math.floor(100 + Math.random() * 900);
        referralCode = `${letters}-${randomDigits}`;

        // 3. Check if this code already exists in the database.
        const { data, error } = await supabase
            .from('users')
            .select('referral_code')
            .eq('referral_code', referralCode)
            .single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 indicates that no row was found, which means the code is unique.
            // Any other error suggests a problem with the database query.
            console.error('Error checking for unique code:', error);
            throw new Error('Could not verify referral code uniqueness.');
        }

        // If data is null, no existing user has this code, so it's unique.
        if (!data) {
            isUnique = true;
        }
    }

    return referralCode;
};

module.exports = {
    generateUniqueReferralCode,
};