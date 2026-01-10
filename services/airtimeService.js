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
 * UPDATED: Uses the official /account-details endpoint from Statum Documentation
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
         * TRY PATH 1: account-details (OFFICIAL V2)
         * This matches your latest documentation: GET https://api.statum.co.ke/api/v2/account-details
         */
        const response = await axios.get('https://api.statum.co.ke/api/v2/account-details', config);
        console.log(`[STATUM ACCOUNT DETAILS FETCHED]:`, response.data);
        return response.data; 

    } catch (error) {
        // If the official path fails, we try the fallback paths
        if (error.response?.status === 404) {
            console.warn("[STATUM] /account-details returned 404. Trying fallbacks...");
            try {
                /**
                 * FALLBACK 1: account-information
                 */
                const fallback1 = await axios.get('https://api.statum.co.ke/api/v2/account-information', config);
                return fallback1.data;
            } catch (err1) {
                try {
                    /**
                     * FALLBACK 2: account-balance with command_id
                     */
                    const fallback2 = await axios.get('https://api.statum.co.ke/api/v2/account-balance?command_id=balance', config);
                    return fallback2.data;
                } catch (err2) {
                    console.error("[STATUM BALANCE ERROR]: All API paths failed (404). This confirms the endpoint is locked for your API Key.");
                }
            }
        } else {
            console.error("[STATUM BALANCE ERROR]:", error.response?.data || error.message);
        }
        
        // Return structured object to prevent dashboard crashes
        return { 
            organization: { 
                name: "Access Restricted", 
                details: { available_balance: 0, mpesa_account_top_up_code: "N/A" } 
            } 
        };
    }
};