import axios from 'axios';
import { supabase } from '../config/supabaseClient.js';
import { getAccessToken } from '../middlewares/authorization.js';

const reversalController = {
    /**
     * Trigger this when the admin clicks "Reverse" for a 3 KES transaction.
     * Expects { transactionId: "SGE8P4F6LW", amount: 3 } in req.body
     */
    initiateReversal: async (req, res) => {
        try {
            const { transactionId, amount } = req.body; 
            const auth = await getAccessToken();

            const url = "https://api.safaricom.co.ke/mpesa/reversal/v1/request";

            const payload = {
                "Initiator": process.env.MPESA_INITIATOR_NAME,
                "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL,
                "CommandID": "TransactionReversal",
                "TransactionID": transactionId, 
                "Amount": amount, // This will be 3 as per your requirement
                "ReceiverParty": process.env.MPESA_STORE_NUMBER,
                "RecieverIdentifierType": "11", 
                "ResultURL": process.env.MPESA_REVERSAL_RESULT_URL,
                "QueueTimeOutURL": process.env.MPESA_REVERSAL_TIMEOUT_URL,
                "Remarks": `Reversing transaction ${transactionId} for amount ${amount}`,
                "Occasion": "CustomerRefund"
            };

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            // Log the initial acceptance from Safaricom
            console.log("REVERSAL INITIATED:", response.data);
            res.status(200).json(response.data);

        } catch (error) {
            console.error("REVERSAL INITIATION ERROR:", error.response?.data || error.message);
            res.status(500).json(error.response?.data || { error: "Failed to initiate reversal" });
        }
    },

    /**
     * Safaricom calls this once they check if the reversal is possible.
     */
    handleReversalCallback: async (req, res) => {
        try {
            const { ResultCode, ResultDesc, TransactionID } = req.body.Result;

            if (ResultCode === 0) {
                // Success: Update your Supabase record
                await supabase
                    .from('transactions')
                    .update({ status: 'reversed' })
                    .eq('mpesa_receipt', TransactionID);
                
                console.log(`Successfully reversed ${TransactionID}`);
            } else {
                console.error(`Reversal failed: ${ResultDesc}`);
            }

            res.json({ ResponseCode: "0", ResponseDesc: "Success" });
        } catch (error) {
            console.error("Callback Error:", error.message);
            res.status(500).send("Error");
        }
    }
};

export default reversalController;