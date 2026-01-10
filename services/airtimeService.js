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

        // Updated variables to match your shared .env
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
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log(`[STATUM SUCCESS]:`, response.data);
        return response.data;
    } catch (error) {
        console.error("[STATUM ERROR]:", error.response?.data || error.message);
        throw error;
    }
};

/**
 * Fetches the current Statum Wallet Balance
 * UPDATED: Optimized to handle "404 Path Errors" by trying both account-information and account-balance
 */
export const getStatumBalance = async () => {
    // Standard variables from your .env
    const consumerKey = process.env.STATUM_CONSUMER_KEY;
    const consumerSecret = process.env.STATUM_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const config = {
        headers: { 
            'Authorization': `Basic ${auth}`, 
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
        }
    };

    try {
        /**
         * TRY PATH 1: account-information
         * This is the most common v2 path for newer accounts.
         */
        const response = await axios.get('https://api.statum.co.ke/api/v2/account-information', config);
        console.log(`[STATUM BALANCE FETCHED]:`, response.data);
        return response.data; 

    } catch (error) {
        // If the first path fails with a 404, we immediately try the fallback path
        if (error.response?.status === 404) {
            try {
                /**
                 * TRY PATH 2: account-balance with command_id
                 * Legacy fallback for the v2 gateway.
                 */
                const fallback = await axios.get('https://api.statum.co.ke/api/v2/account-balance?command_id=balance', config);
                console.log(`[STATUM BALANCE FETCHED (FALLBACK)]:`, fallback.data);
                return fallback.data;
            } catch (fallbackError) {
                console.error("[STATUM BALANCE ERROR]: All API paths failed (404). Please check your Statum Portal permissions.");
            }
        } else {
            console.error("[STATUM BALANCE ERROR]:", error.response?.data || error.message);
        }
        
        // Return 0 if all attempts fail to prevent the frontend from crashing
        return { available_balance: 0 };
    }
};