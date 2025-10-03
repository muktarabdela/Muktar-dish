// utils/referralCodeGenerator.js

const supabase = require('../services/supabase');

/**
 * Generates a unique referral code for a user.
 * @param {string} firstName - The user's first name.
 * @param {string} [lastName] - The user's last name (optional).
 * @returns {Promise<string>} A unique referral code (e.g., 'AB-123').
 */
const generateUniqueReferralCode = async (firstName, lastName) => {
    // Create initials. Use the first two letters of the first name if no last name is provided.
    const firstInitial = firstName ? firstName.charAt(0).toUpperCase() : 'X';
    const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : (firstName ? firstName.charAt(1).toUpperCase() : 'Y');
    const initials = `${firstInitial}${lastInitial}`;

    let referralCode;
    let isUnique = false;

    // Keep generating a new code until a unique one is found
    while (!isUnique) {
        const randomDigits = Math.floor(100 + Math.random() * 900); // Generates a 3-digit number
        referralCode = `${initials}-${randomDigits}`;

        // Check if this code already exists in the database
        const { data, error } = await supabase
            .from('users')
            .select('referral_code')
            .eq('referral_code', referralCode)
            .single(); // .single() is efficient for checking existence

        if (error && error.code !== 'PGRST116') {
            // PGRST116 is the error for "No rows found", which is what we want.
            // Any other error means something went wrong with the query.
            console.error('Error checking for unique code:', error);
            throw new Error('Could not verify referral code uniqueness.');
        }

        // If data is null, the code is unique
        if (!data) {
            isUnique = true;
        }
    }

    return referralCode;
};

module.exports = {
    generateUniqueReferralCode,
};