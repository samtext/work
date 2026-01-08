import axios from 'axios';
import { sendAirtime } from '../services/airtimeService.js';
import { getAccessToken } from '../middlewares/authorization.js';

const airtimeBridgeController = {
    /**
     * 1. Register your URL with Safaricom
     * Visit /admin/register-airtime-callback ONCE in your browser to activate
     */
    registerC2BURL: async (req, res) => {
        try {
            const auth = await getAccessToken();
            const shortCode = process.env.MPESA_STORE_NUMBER || process.env.BusinessShortCode;
            
            // This is the URL Safaricom will push data to
            // Ensure this matches your live Render/Production URL
            const confirmationURL = `${process.env.BASE_URL}/admin/api/mpesa-to-airtime`;
            const validationURL = `${process.env.BASE_URL}/admin/api/mpesa-to-airtime`;

            console.log(`[C2B] Registering URLs for Shortcode: ${shortCode}`);

            const response = await axios.post(
                "https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl",
                {
                    ShortCode: shortCode.trim(),
                    ResponseType: "Completed", // Safaricom will complete the TX if your server is slow
                    ConfirmationURL: confirmationURL,
                    ValidationURL: validationURL
                },
                {
                    headers: {
                        Authorization: `Bearer ${auth}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            console.log("[C2B REGISTRATION SUCCESS]:", response.data);
            res.status(200).send(`C2B Registered Successfully! Safaricom will now send payments to: ${confirmationURL}`);
        } catch (error) {
            console.error("[C2B REGISTRATION ERROR]:", error.response?.data || error.message);
            res.status(500).send(`Registration Failed: ${error.response?.data?.errorMessage || error.message}`);
        }
    },

    /**
     * 2. The actual endpoint that receives payments and forwards to Statum
     * This runs AUTOMATICALLY every time a user pays.
     */
    handleMpesaPayment: async (req, res) => {
        try {
            // Note: Safaricom C2B uses TransID, TransAmount, and MSISDN
            const { MSISDN, TransAmount, TransID, FirstName, MiddleName } = req.body;
            
            console.log(`[AUTOMATIC MPESA] ID: ${TransID} | From: ${MSISDN} | Amt: ${TransAmount}`);

            // Trigger airtime if amount is 5 or more
            if (parseFloat(TransAmount) >= 5) {
                // We don't 'await' here so we can respond to Safaricom instantly (avoid timeouts)
                sendAirtime(MSISDN, TransAmount).catch(err => 
                    console.error(`[AIRTIME BACKGROUND ERROR] ${MSISDN}:`, err.message)
                );
            }
            
            // Safaricom REQUIRES this specific JSON response
            res.status(200).json({ 
                ResultCode: 0, 
                ResultDesc: "Success" 
            });
        } catch (error) {
            console.error("[BRIDGE ERROR]:", error.message);
            // Even if we fail, we tell Safaricom 'Accepted' so they don't keep retrying
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
};

export default airtimeBridgeController;