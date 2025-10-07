// utils/referralCodeGenerator.js

const supabase = require('../services/supabase');

/**
 * Generates a unique 3-digit referral code.
 * The code will be a number between 100 and 999.
 * @returns {Promise<string>} A unique 3-digit referral code as a string.
 */
const generateUniqueReferralCode = async () => {
    let referralCode;
    let isUnique = false;
    let attempts = 0;
    // There are only 900 possible codes (100-999).
    // This limit prevents an infinite loop if all codes are used.
    const maxAttempts = 900;

    while (!isUnique && attempts < maxAttempts) {
        attempts++;
        // 1. Generate a random 3-digit number
        const randomDigits = Math.floor(100 + Math.random() * 900);
        referralCode = String(randomDigits); // Store as a string

        // 2. Check if this code already exists in the database
        const { data, error } = await supabase
            .from('users')
            .select('referral_code')
            .eq('referral_code', referralCode)
            .single(); // Efficiently checks for one matching record

        if (error && error.code !== 'PGRST116') {
            // 'PGRST116' means 'No rows found', which is the successful outcome we want.
            // Any other error indicates a problem with the Supabase query.
            console.error('Error checking for unique code:', error);
            throw new Error('Could not verify referral code uniqueness due to a database error.');
        }

        // 3. If data is null, the code is unique
        if (!data) {
            isUnique = true;
        }
    }

    // If the loop finished because all possible codes are taken
    if (!isUnique) {
        throw new Error('Could not generate a unique referral code. All possible codes are likely in use.');
    }

    return referralCode;
};

module.exports = {
    generateUniqueReferralCode,
};