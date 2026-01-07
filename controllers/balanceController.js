import axios from 'axios';
import { supabase } from '../config/supabaseClient.js';
import { getAccessToken } from '../middlewares/authorization.js';

const balanceController = {
    // 1. TRIGGER: Request balance from Safaricom
    getTillBalance: async (req, res) => {
        try {
            const auth = await getAccessToken();
            const url = "https://api.safaricom.co.ke/mpesa/accountbalance/v1/query";

            // Trim values to prevent common credential errors
            const payload = {
                "Initiator": process.env.MPESA_INITIATOR_NAME.trim(),
                "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL.trim(),
                "CommandID": "AccountBalance",
                "PartyA": process.env.BusinessShortCode.trim(), 
                "IdentifierType": "4", // '4' for Shortcode/Organization/Till
                "Remarks": "Routine Balance Check",
                "QueueTimeOutURL": process.env.MPESA_BALANCE_RESULT_URL.trim(),
                "ResultURL": process.env.MPESA_BALANCE_RESULT_URL.trim() 
            };

            console.log("--- INITIATING BALANCE REQUEST ---");
            console.log("Target Shortcode:", payload.PartyA);

            const response = await axios.post(url, payload, {
                headers: { 
                    'Authorization': `Bearer ${auth}`,
                    'Content-Type': 'application/json' 
                }
            });

            // Render the intermediate waiting page
            res.render('till_balance', { 
                data: response.data,
                title: "Balance Request Status" 
            });

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("BALANCE REQUEST FAILED:", errorData);
            
            res.status(500).render('till_balance', { 
                data: { 
                    ResponseCode: "1", 
                    ResponseDescription: "Request Failed",
                    errorMessage: error.response?.data?.errorMessage || "API connection failed"
                }, 
                title: "Request Error"
            });
        }
    },

    // 2. CALLBACK: Receive the actual balance from Safaricom
    handleBalanceCallback: async (req, res) => {
        try {
            const result = req.body.Result;
            console.log("--- RECEIVED BALANCE CALLBACK FROM SAFARICOM ---");
            
            if (result && result.ResultCode === 0) {
                // Safaricom sends balance in format: "Working Account|KES|500.00|500.00|0.00|0.00&Utility Account|..."
                const balanceParams = result.ResultParameters.ResultParameter;
                const accountBalanceParam = balanceParams.find(p => p.Key === 'AccountBalance');
                
                if (!accountBalanceParam) throw new Error("AccountBalance parameter missing in callback");

                const balanceData = accountBalanceParam.Value;
                console.log("Raw Balance String:", balanceData);

                // Split by '&' if multiple accounts exist (Working, Utility, etc.)
                const accounts = balanceData.split('&');
                
                for (const acc of accounts) {
                    const parts = acc.split('|');
                    const account_type = parts[0];
                    const currency = parts[1];
                    const balanceAmount = parseFloat(parts[2]);

                    console.log(`Updating ${account_type}: ${currency} ${balanceAmount}`);

                    // Use upsert to update the row if account_type exists, otherwise insert
                    const { error } = await supabase
                        .from('balances')
                        .upsert({
                            account_type: account_type,
                            amount: balanceAmount,
                            currency: currency,
                            updated_at: new Date().toISOString() // Force update timestamp
                        }, { 
                            onConflict: 'account_type' 
                        });

                    if (error) console.error(`Supabase Sync Error for ${account_type}:`, error.message);
                }

                console.log("✅ SUCCESS: Balances synced to Supabase.");
            } else {
                console.warn("❌ Balance Query Rejected:", result?.ResultDesc || "Unknown error");
            }

            // Always acknowledge receipt to Safaricom to prevent retries
            res.status(200).json({ ResponseCode: "0", ResponseDesc: "Success" });

        } catch (error) {
            console.error("CRITICAL CALLBACK ERROR:", error.message);
            // Still respond 200 to Safaricom to stop them from retrying a broken payload
            res.status(200).json({ ResponseCode: "1", ResponseDesc: "Internal processing error" });
        }
    }
};

export default balanceController;