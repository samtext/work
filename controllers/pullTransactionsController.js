import axios from 'axios';
import { supabase } from '../config/supabaseClient.js'; 
import { getAccessToken } from '../middlewares/authorization.js'; 
import { sendAirtime, getStatumBalance } from '../services/airtimeService.js'; 

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
            
            // --- STATUM BALANCE INTEGRATION (FIXED TO USE SERVICE) ---
            let statumBalance = "0.00";
            try {
                // Fetching data from the smart service we updated
                const balanceData = await getStatumBalance();
                
                // Statum v2 usually returns 'available_balance', v1 used 'balance'
                // We handle both to be safe
                if (balanceData) {
                    statumBalance = balanceData.available_balance || balanceData.balance || balanceData.data?.balance || "0.00";
                }
                
                console.log(`[STATUM] Sync Successful: KES ${statumBalance}`);
            } catch (balanceError) {
                console.error("[STATUM SYNC ERROR]: Dashboard failed to fetch balance.");
                statumBalance = "0.00";
            }

            // --- SAFARICOM PULL ---
            const response = await axios.post(`https://api.safaricom.co.ke/pulltransactions/v1/query`, 
                { ShortCode: shortCode, StartDate: startDate, EndDate: endDate, OffSetValue: "0" },
                { headers: { 'Authorization': `Bearer ${auth}`, 'Content-Type': 'application/json' }}
            );

            let mpesaTransactions = [];
            if (response.data?.Response?.[0]) {
                mpesaTransactions = response.data.Response[0].map(tx => ({
                    MpesaReceiptNumber: tx.transactionId || tx.MpesaReceiptNumber,
                    Amount: tx.amount || tx.Amount,
                    PhoneNumber: tx.msisdn || tx.PhoneNumber,
                    CustomerName: tx.sender || tx.CustomerName || 'M-Pesa User',
                    TransactionDate: tx.trxDate || tx.TransactionDate
                }));
            }

            const { data: localTx } = await supabase.from('transactions').select('checkout_request_id'); 
            const localReceipts = new Set(localTx?.map(t => t.checkout_request_id) || []);

            // Process Sync and Airtime
            for (const tx of mpesaTransactions) {
                if (!localReceipts.has(tx.MpesaReceiptNumber)) {
                    console.log(`[SYNCING] Found new transaction: ${tx.MpesaReceiptNumber} from ${tx.PhoneNumber}`);
                    
                    const { error: dbError } = await supabase.from('transactions').upsert([{
                        checkout_request_id: tx.MpesaReceiptNumber,
                        amount: tx.Amount,
                        phone_number: tx.PhoneNumber,
                        customer_name: tx.CustomerName, 
                        status: 'success',
                        service_name: 'Auto-Sync Pull'
                    }], { onConflict: 'checkout_request_id' });

                    if (!dbError) {
                        if (parseFloat(tx.Amount) >= 5) {
                            console.log(`[AIRTIME] Triggering for ${tx.PhoneNumber} (KES ${tx.Amount})...`);
                            sendAirtime(tx.PhoneNumber, tx.Amount)
                                .then(() => console.log(`[AIRTIME SUCCESS] Delivered to ${tx.PhoneNumber}`))
                                .catch(e => console.error(`[AIRTIME FAILURE] Could not send to ${tx.PhoneNumber}:`, e.message));
                        } else {
                            console.log(`[AIRTIME SKIP] Amount KES ${tx.Amount} is too low for ${tx.PhoneNumber}`);
                        }
                    } else {
                        console.error(`[DB ERROR] Could not save transaction ${tx.MpesaReceiptNumber}:`, dbError.message);
                    }
                }
            }

            // --- CRITICAL FIX FOR AUTO-SYNC ---
            if (typeof res.render !== 'function') {
                return; 
            }

            res.render('index', { 
                transactions: mpesaTransactions, 
                balance: statumBalance, 
                available_balance: statumBalance, 
                title: "Auri Pay Reconciliation", 
                error: null 
            });
        } catch (error) {
            console.error("Critical Dashboard Error:", error.message);
            if (typeof res.render === 'function') {
                res.status(500).render('index', { transactions: [], balance: "0.00", available_balance: "0.00", error: error.message });
            }
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