import axios from 'axios';

/**
 * Sends airtime via Statum API
 */
export const sendAirtime = async (phone, amount) => {
    try {
        let formattedPhone = phone.trim();
        if (formattedPhone.startsWith('0')) {
            formattedPhone = `254${formattedPhone.slice(1)}`;
        } else if (formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.replace('+', '');
        }

        const consumerKey = process.env.STATUM_CONSUMER_KEY;
        const consumerSecret = process.env.STATUM_CONSUMER_SECRET;
        
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

        console.log(`[STATUM SUCCESS] ${formattedPhone}:`, response.data);
        return response.data;
    } catch (error) {
        console.error("[STATUM ERROR]:", error.response?.data || error.message);
        throw error;
    }
};

/**
 * Fetches the current Statum Wallet Balance
 */
export const getStatumBalance = async () => {
    try {
        const consumerKey = process.env.STATUM_CONSUMER_KEY;
        const consumerSecret = process.env.STATUM_CONSUMER_SECRET;
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

        const response = await axios.get('https://api.statum.co.ke/api/v2/account-balance', {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        return response.data;
    } catch (error) {
        return { available_balance: 0 };
    }
};