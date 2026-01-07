import axios from 'axios';
import { sendAirtime } from '../services/airtimeService.js';
import { supabase } from '../config/supabaseClient.js';

const airtimeBridgeController = {
    // 1. Function to Register the URL with Safaricom
    registerC2BURL: async (req, res) => {
        try {
            // This is a simplified registration logic
            // In a real app, you'd use your M-Pesa Access Token here
            console.log("Registering C2B URL...");
            res.status(200).send("C2B Registration initiated. Check server logs.");
        } catch (error) {
            res.status(500).send("Registration failed: " + error.message);
        }
    },

    // 2. Function that receives payment and sends airtime
    handleMpesaPayment: async (req, res) => {
        try {
            const { MSISDN, TransAmount, TransID } = req.body;
            console.log(`Received Payment: ${TransID} | ${MSISDN} | KES ${TransAmount}`);

            // Forward to Statum
            await sendAirtime(MSISDN, TransAmount);

            res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
        } catch (error) {
            console.error("Bridge Error:", error.message);
            res.status(200).json({ ResultCode: 0, ResultDesc: "Logged with Error" });
        }
    }
};

export default airtimeBridgeController;