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
            
            // --- STATUM V2 BALANCE INTEGRATION ---
            let statumBalance = "0.00";
            let organizationName = "Statum Account";
            let topUpCode = "N/A";
            let apiStatus = "Active";

            try {
                const balanceData = await getStatumBalance();
                
                // Check if balanceData exists and isn't an error string
                if (balanceData && typeof balanceData === 'object') {
                    const details = balanceData.organization?.details;
                    
                    statumBalance = details?.available_balance || "0.00";
                    organizationName = balanceData.organization?.name || "Statum User";
                    topUpCode = details?.mpesa_account_top_up_code || "N/A";
                    
                    console.log(`[STATUM] Data Fetched: KES ${statumBalance}`);
                }
            } catch (balanceError) {
                // This catches the 404 without breaking the rest of the dashboard
                console.warn("[STATUM] Balance path locked or 404. Check permissions.");
                apiStatus = "Balance Pending Support";
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
                    console.log(`[SYNCING] Found new transaction: ${tx.MpesaReceiptNumber}`);
                    
                    const { error: dbError } = await supabase.from('transactions').upsert([{
                        checkout_request_id: tx.MpesaReceiptNumber,
                        amount: tx.Amount,
                        phone_number: tx.PhoneNumber,
                        customer_name: tx.CustomerName, 
                        status: 'success',
                        service_name: 'Auto-Sync Pull'
                    }], { onConflict: 'checkout_request_id' });

                    if (!dbError && parseFloat(tx.Amount) >= 5) {
                        sendAirtime(tx.PhoneNumber, tx.Amount)
                            .then(() => console.log(`[AIRTIME SUCCESS] ${tx.PhoneNumber}`))
                            .catch(e => console.error(`[AIRTIME FAILURE] ${tx.PhoneNumber}:`, e.message));
                    }
                }
            }

            if (typeof res.render !== 'function') return; 

            // Pass everything to the view
            res.render('index', { 
                transactions: mpesaTransactions, 
                balance: statumBalance, 
                available_balance: statumBalance,
                org_name: organizationName,
                mpesa_code: topUpCode,
                api_status: apiStatus, // Useful for showing a "Pending" label on UI
                title: "Auri Pay Reconciliation", 
                error: null 
            });

        } catch (error) {
            console.error("Critical Dashboard Error:", error.message);
            if (typeof res.render === 'function') {
                res.status(500).render('index', { 
                    transactions: [], balance: "0.00", available_balance: "0.00", 
                    org_name: "System Error", mpesa_code: "N/A", error: error.message 
                });
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