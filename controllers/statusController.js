import axios from 'axios';
import { getAccessToken } from '../middlewares/authorization.js';

// Global object to track active UI connections by ConversationID
let activeConnections = {};

const statusController = {
    /**
     * Sends the Status Query to M-Pesa
     */
    queryTransactionStatus: async (req, res) => {
        try {
            const { transactionId } = req.body;
            const auth = await getAccessToken();

            const url = "https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query";

            const payload = {
                "Initiator": process.env.MPESA_INITIATOR_NAME,
                "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL,
                "CommandID": "TransactionStatusQuery",
                "TransactionID": transactionId,
                "PartyA": process.env.MPESA_STORE_NUMBER,
                "IdentifierType": "4",
                "ResultURL": process.env.MPESA_STATUS_RESULT_URL,
                "QueueTimeOutURL": process.env.MPESA_STATUS_TIMEOUT_URL,
                "Remarks": "Checking reversal status",
                "Occasion": "SupportQuery"
            };

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log("STATUS QUERY SENT:", response.data);

            const queryParams = new URLSearchParams({
                id: transactionId,
                desc: response.data.ResponseDescription,
                conv: response.data.ConversationID,
                orig: response.data.OriginatorConversationID,
                code: response.data.ResponseCode
            }).toString();

            res.redirect(`/admin/transaction-status?${queryParams}`);

        } catch (error) {
            console.error("STATUS QUERY ERROR:", error.response?.data || error.message);
            res.status(500).json({ error: "Failed to initiate status query" });
        }
    },

    /**
     * NEW: SSE Stream endpoint
     * Your browser will "listen" here for the real-time pull
     */
    streamStatus: (req, res) => {
        const { conversationId } = req.params;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Store this connection using the ConversationID
        activeConnections[conversationId] = res;

        // Cleanup when the user closes the page
        req.on('close', () => {
            delete activeConnections[conversationId];
        });
    },

    renderStatusPage: (req, res) => {
        try {
            res.render('admin/transaction-status', {
                transactionId: req.query.id || "N/A",
                responseDescription: req.query.desc || "No active query",
                conversationId: req.query.conv || "N/A",
                originatorId: req.query.orig || "N/A",
                responseCode: req.query.code || "1"
            });
        } catch (err) {
            console.error("VIEW RENDER ERROR:", err.message);
            res.status(500).send("The view 'admin/transaction-status' was not found.");
        }
    },

    /**
     * UPDATED: Now "pushes" the pulled data to your screen
     */
    handleStatusCallback: async (req, res) => {
        try {
            const result = req.body.Result;
            console.log("--- M-PESA STATUS REPORT ---", JSON.stringify(result, null, 2));
            
            const params = result.ResultParameters?.ResultParameter || [];
            
            // 1. Pull the Transaction Status
            const statusParam = params.find(p => p.Key === "TransactionStatus");
            
            // 2. Pull the Sender Name (Payer Party Public Name)
            const senderNameParam = params.find(p => p.Key === "PayerPartyPublicName");
            
            // 3. Pull the Amount
            const amountParam = params.find(p => p.Key === "Amount");
            
            console.log("--- EXTRACTED DETAILS ---");
            if (statusParam) console.log("FINAL STATUS:", statusParam.Value);
            if (senderNameParam) console.log("SENDER NAME:", senderNameParam.Value);
            if (amountParam) console.log("AMOUNT:", amountParam.Value);

            const conversationId = result.ConversationID;

            // If a browser is currently viewing this transaction status page, send data to it
            if (activeConnections[conversationId]) {
                const pulledData = JSON.stringify({
                    status: statusParam?.Value || "Unknown",
                    sender: senderNameParam?.Value || "Not Found",
                    amount: amountParam?.Value || "0"
                });

                // This sends the data directly to the user's browser
                activeConnections[conversationId].write(`data: ${pulledData}\n\n`);
                
                // Optional: end the stream after sending data
                // activeConnections[conversationId].end();
                // delete activeConnections[conversationId];
            }

            res.status(200).json({ ResponseCode: "0", ResponseDesc: "Success" });
        } catch (error) {
            console.error("STATUS CALLBACK ERROR:", error.message);
            res.status(500).send("Error");
        }
    }
};

export default statusController;