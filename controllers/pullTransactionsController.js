import axios from 'axios';
import { supabase } from '../config/supabaseClient.js'; 
import { getAccessToken } from '../middlewares/authorization.js'; 

const pullTransactions = {
    getPullDashboard: async (req, res) => {
        try {
            // Updated Date Format for Pull API: YYYY-MM-DD HH:mm:ss
            const formatPullDate = (date) => {
                const pad = (n) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            };

            const now = new Date();
            // Using 47 hours to stay within the 48hr window
            const startDate = formatPullDate(new Date(Date.now() - 47 * 60 * 60 * 1000));
            const endDate = formatPullDate(now);
            
            const auth = await getAccessToken(); 
            
            /** * UPDATED: Using MPESA_STORE_NUMBER for Pulling Transactions.
             * This separates it from the STK Push logic.
             */
            const shortCode = process.env.MPESA_STORE_NUMBER ? process.env.MPESA_STORE_NUMBER.trim() : process.env.BusinessShortCode.trim();
            
            // Endpoint remains the same, but we switch to POST
            const pullUrl = `https://api.safaricom.co.ke/pulltransactions/v1/query`;
            
            // Payload body as required by the Daraja documentation
            const payload = {
                ShortCode: shortCode,
                StartDate: startDate,
                EndDate: endDate,
                OffSetValue: "0" 
            };

            console.log("-----------------------------------------");
            console.log("SENDING PULL QUERY TO SAFARICOM...");
            console.log("URL:", pullUrl);
            console.log("USING STORE NUMBER:", shortCode);
            console.log("PAYLOAD:", JSON.stringify(payload, null, 2));

            const safaricomRes = await axios.post(pullUrl, payload, {
                headers: { 
                    'Authorization': `Bearer ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log("HTTP STATUS:", safaricomRes.status);
            console.log("RAW RESPONSE DATA:", JSON.stringify(safaricomRes.data, null, 2));

            let mpesaTransactions = [];
            
            if (safaricomRes.data && safaricomRes.data.Response && Array.isArray(safaricomRes.data.Response)) {
                const rawTransactions = safaricomRes.data.Response[0] || [];
                
                mpesaTransactions = rawTransactions.map(tx => ({
                    ...tx,
                    MpesaReceiptNumber: tx.transactionId,
                    Amount: tx.amount,
                    PhoneNumber: tx.msisdn,
                    CustomerName: tx.sender, // Pulling the Customer Name / Sender Info
                    TransactionDate: tx.trxDate
                }));
            }

            console.log(`FOUND ${mpesaTransactions.length} TRANSACTIONS`);

            const { data: localTx } = await supabase.from('transactions').select('checkout_request_id'); 
            const localReceipts = new Set(localTx?.map(t => t.checkout_request_id) || []);

            const processedTransactions = mpesaTransactions.map(tx => ({
                ...tx,
                isMissing: !localReceipts.has(tx.MpesaReceiptNumber)
            }));

            // --- AUTO-SAVE LOGIC ---
            for (const tx of processedTransactions) {
                if (tx.isMissing) {
                    console.log(`Auto-syncing missing transaction: ${tx.MpesaReceiptNumber}`);
                    
                    const { data: exists } = await supabase
                        .from('transactions')
                        .select('checkout_request_id')
                        .eq('checkout_request_id', tx.MpesaReceiptNumber)
                        .single();

                    if (!exists) {
                        const { error: insertError } = await supabase
                            .from('transactions')
                            .insert([{
                                checkout_request_id: tx.MpesaReceiptNumber,
                                amount: tx.Amount,
                                phone_number: tx.PhoneNumber,
                                customer_name: tx.CustomerName, 
                                status: 'success',
                                service_name: 'M-Pesa Pull Auto-Sync',
                                created_at: tx.TransactionDate || new Date()
                            }]);
                        
                        if (insertError) console.error(`Error auto-saving ${tx.MpesaReceiptNumber}:`, insertError.message);
                    }
                }
            }

            res.render('pull_dashboard', { 
                transactions: processedTransactions,
                title: "M-Pesa Reconciliation",
                error: mpesaTransactions.length === 0 ? "No transactions found. If you just paid, wait 10 mins for indexing." : null
            });

        } catch (error) {
            const errorData = error.response?.data;
            console.error("SAFARICOM QUERY ERROR:", errorData || error.message);
            
            res.status(500).render('pull_dashboard', { 
                transactions: [], 
                error: `Safaricom Error: ${errorData?.ResponseMessage || errorData?.errorMessage || error.message}` 
            });
        }
    },

    syncMissingTransaction: async (req, res) => {
        try {
            const tx = req.body;
            const { error } = await supabase
                .from('transactions')
                .insert([{
                    checkout_request_id: tx.MpesaReceiptNumber,
                    amount: tx.Amount,
                    phone_number: tx.PhoneNumber,
                    customer_name: tx.CustomerName,
                    status: 'success',
                    service_name: 'M-Pesa Pull Sync',
                    created_at: tx.TransactionDate || new Date()
                }]);

            if (error) throw error;
            res.status(200).json({ message: "Synced successfully" });
        } catch (error) {
            console.error("Sync Error:", error.message);
            res.status(500).json({ error: error.message });
        }
    },

    registerPull: async (req, res) => {
        const url = "https://api.safaricom.co.ke/pulltransactions/v1/register";
        try {
            const auth = await getAccessToken(); 
            const storeNumber = process.env.MPESA_STORE_NUMBER ? process.env.MPESA_STORE_NUMBER.trim() : process.env.BusinessShortCode.trim();

            const data = {
                ShortCode: storeNumber,
                RequestType: "Pull", 
                NominatedNumber: "254712071385", 
                CallBackURL: process.env.MPESA_PULL_CALLBACK_URL
            };
            
            console.log("REGISTERING SHORTCODE (STORE):", data.ShortCode);

            const response = await axios.post(url, data, {
                headers: { 'Authorization': `Bearer ${auth}`, 'Content-Type': 'application/json' }
            });
            
            res.status(200).json(response.data);
        } catch (error) {
            console.error("REGISTRATION FAILED:", error.response?.data || error.message);
            res.status(500).json(error.response?.data || "Registration failed");
        }
    }
};

export default pullTransactions;