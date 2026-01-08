import axios from 'axios';
import { supabase } from '../config/supabaseClient.js'; 
import { getAccessToken } from '../middlewares/authorization.js'; 
import { sendAirtime } from '../services/airtimeService.js';

const pullTransactions = {
    getPullDashboard: async (req, res) => {
        try {
            const formatPullDate = (date) => {
                const pad = (n) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            };

            const now = new Date();
            const startDate = formatPullDate(new Date(Date.now() - 47 * 60 * 60 * 1000));
            const endDate = formatPullDate(now);
            const auth = await getAccessToken(); 
            const shortCode = process.env.MPESA_STORE_NUMBER?.trim() || process.env.BusinessShortCode?.trim();
            
            const response = await axios.post(`https://api.safaricom.co.ke/pulltransactions/v1/query`, 
                { ShortCode: shortCode, StartDate: startDate, EndDate: endDate, OffSetValue: "0" },
                { headers: { 'Authorization': `Bearer ${auth}`, 'Content-Type': 'application/json' }}
            );

            let mpesaTransactions = [];
            if (response.data?.Response?.[0]) {
                mpesaTransactions = response.data.Response[0].map(tx => ({
                    MpesaReceiptNumber: tx.transactionId,
                    Amount: tx.amount,
                    PhoneNumber: tx.msisdn,
                    CustomerName: tx.sender,
                    TransactionDate: tx.trxDate
                }));
            }

            const { data: localTx } = await supabase.from('transactions').select('checkout_request_id'); 
            const localReceipts = new Set(localTx?.map(t => t.checkout_request_id) || []);

            // Process Sync and Airtime
            for (const tx of mpesaTransactions) {
                if (!localReceipts.has(tx.MpesaReceiptNumber)) {
                    console.log(`[SYNCING] Found missing TX: ${tx.MpesaReceiptNumber}`);
                    
                    const { error: dbError } = await supabase.from('transactions').upsert([{
                        checkout_request_id: tx.MpesaReceiptNumber,
                        amount: tx.Amount,
                        phone_number: tx.PhoneNumber,
                        customer_name: tx.CustomerName, 
                        status: 'success',
                        service_name: 'Auto-Sync Pull'
                    }], { onConflict: 'checkout_request_id' });

                    if (!dbError && parseFloat(tx.Amount) >= 5) {
                        sendAirtime(tx.PhoneNumber, tx.Amount).catch(e => console.log("Airtime Background Error"));
                    }
                }
            }

            res.render('pull_dashboard', { transactions: mpesaTransactions, title: "M-Pesa Reconciliation", error: null });
        } catch (error) {
            res.status(500).render('pull_dashboard', { transactions: [], error: error.message });
        }
    },

    syncMissingTransaction: async (req, res) => {
        try {
            const tx = req.body;
            await supabase.from('transactions').insert([{
                checkout_request_id: tx.MpesaReceiptNumber,
                amount: tx.Amount,
                phone_number: tx.PhoneNumber,
                status: 'success'
            }]);
            if (parseFloat(tx.Amount) >= 5) await sendAirtime(tx.PhoneNumber, tx.Amount);
            res.status(200).json({ message: "Synced" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    },

    registerPull: async (req, res) => {
        try {
            const auth = await getAccessToken();
            const resData = await axios.post("https://api.safaricom.co.ke/pulltransactions/v1/register", {
                ShortCode: process.env.MPESA_STORE_NUMBER,
                RequestType: "Pull",
                NominatedNumber: "254712071385",
                CallBackURL: process.env.MPESA_PULL_CALLBACK_URL
            }, { headers: { 'Authorization': `Bearer ${auth}` }});
            res.json(resData.data);
        } catch (e) { res.status(500).send(e.message); }
    }
};

export default pullTransactions;