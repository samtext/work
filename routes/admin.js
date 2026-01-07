import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import pullTransactions from '../controllers/pullTransactionsController.js'; 
import balanceController from '../controllers/balanceController.js';
import reversalController from '../controllers/reversalController.js'; 
// Import the new status controller
import statusController from '../controllers/statusController.js'; 
// NEW: Import the Airtime Bridge Controller
import airtimeBridgeController from '../controllers/airtimeBridgeController.js';

const router = express.Router();

// 1. Your original Supabase dashboard
router.get("/dashboard", async (req, res) => {
    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const totalAmount = transactions
            .filter(t => t.status === 'success')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        const { data: balances, error: balError } = await supabase
            .from('balances')
            .select('*')
            .order('updated_at', { ascending: false });

        if (balError) console.error("Error fetching balances:", balError.message);

        res.render('admin_dashboard', { 
            transactions, 
            totalAmount, 
            balances: balances || [] 
        });
    } catch (error) {
        console.error("Dashboard Error:", error.message);
        res.status(500).send("Error loading dashboard");
    }
});

// 2. The Safaricom Pull Dashboard
router.get("/pull-transactions", pullTransactions.getPullDashboard);

// 3. One-time Registration for Transaction Pulling
router.get("/register-pull", pullTransactions.registerPull);

// 4. Balance Routes
router.get("/check-balance", balanceController.getTillBalance);

/**
 * Reversal Routes
 */
router.post("/reversal/initiate", reversalController.initiateReversal);
router.post("/api/reversal-result", reversalController.handleReversalCallback);
router.post("/api/reversal-timeout", reversalController.handleReversalCallback);

/**
 * NEW: Transaction Status Routes
 */
router.post("/status/check", statusController.queryTransactionStatus);
router.get("/transaction-status", statusController.renderStatusPage); 
router.get("/status-stream/:conversationId", statusController.streamStatus);
router.post("/api/status-result", statusController.handleStatusCallback);
router.post("/api/status-timeout", statusController.handleStatusCallback);

/**
 * NEW: M-Pesa to Statum Airtime Bridge
 * This is the URL you register with Safaricom as the "ConfirmationURL"
 */
// 1. Route to register your URL with Safaricom (Visit this once)
router.get("/register-airtime-callback", airtimeBridgeController.registerC2BURL);

// 2. The actual endpoint that receives payments and forwards to Statum
router.post("/api/mpesa-to-airtime", airtimeBridgeController.handleMpesaPayment);

// 3. Optional: Statum Callback for delivery reports
router.post("/api/statum-callback", (req, res) => {
    console.log("STATUM DELIVERY REPORT:", req.body);
    res.status(200).send("OK");
});

/**
 * Callback route for Safaricom to POST the balance results.
 */
router.post("/api/balance-result", balanceController.handleBalanceCallback);

/**
 * Internal API for the till_balance.ejs page to poll for the live balance.
 */
router.get("/api/get-latest-balances", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('balances')
            .select('*')
            .order('updated_at', { ascending: false });
            
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync Missing Route
router.post("/sync-missing", pullTransactions.syncMissingTransaction);

export default router;