import axios from 'axios';

/**
 * Sends airtime via Statum API
 * @param {string} phone - User's phone number
 * @param {string|number} amount - Amount in KES
 */
export const sendAirtime = async (phone, amount) => {
    try {
        // Ensure phone number starts with 254
        let formattedPhone = phone.trim();
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `254${formattedPhone.slice(1)}`;
        } else if (formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.replace('+', '');
        }

        // Use credentials from your .env file
        const consumerKey = process.env.STATUM_CONSUMER_KEY || "243d72cd194ac99498e8df294f9af02f6e1";
        const consumerSecret = process.env.STATUM_CONSUMER_SECRET || "mUn6maKkXKkxddR4hodD243Vl9Wh";
        
        // Generate Basic Auth Header
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

        const payload = {
            "phone_number": formattedPhone,
            "amount": amount.toString()
        };

        const response = await axios.post('https://api.statum.co.ke/api/v2/airtime', payload, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Statum Success for ${formattedPhone}:`, response.data);
        return response.data; // Returns { status_code: 200, description: "...", request_id: "..." }
    } catch (error) {
        console.error("Statum API Error:", error.response?.data || error.message);
        throw error;
    }
};