import { supabase } from '../config/supabaseClient.js';
import axios from 'axios';

// --- YOUR EXISTING CODE ---
export const getDashboard = async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalAmount = transactions
      .filter(t => t.status === 'success')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    res.render('admin_dashboard', { 
      transactions, 
      totalAmount 
    });
  } catch (error) {
    console.error("Dashboard Error:", error.message);
    res.status(500).send("Error loading dashboard");
  }
};

// --- NEW PULL TRANSACTIONS LOGIC ---
export const getPullDashboard = async (req, res) => {
  try {
    // 1. Setup Timeframe (Last 48 hours for Safaricom Pull)
    const now = new Date();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const formatDate = (date) => date.toISOString().replace(/[-T:.Z]/g, "").substring(0, 14);

    // 2. Fetch from Safaricom API
    // Note: Ensure you have a function to get your Access Token
    const auth = await getAccessToken(); 
    const pullUrl = `https://api.safaricom.co.ke/mpesa/pulltransactions/v1/query?ShortCode=${process.env.MPESA_SHORTCODE}&StartDate=${formatDate(twoDaysAgo)}&EndDate=${formatDate(now)}&OffSet=0&Limit=50`;

    const safaricomRes = await axios.get(pullUrl, {
      headers: { Authorization: `Bearer ${auth}` }
    });

    const mpesaTransactions = safaricomRes.data.Transactions || [];

    // 3. Fetch our local transactions to compare
    const { data: localTx } = await supabase
      .from('transactions')
      .select('mpesa_receipt_number'); // Adjust column name to match your DB

    const localReceipts = new Set(localTx.map(t => t.mpesa_receipt_number));

    // 4. Mark which transactions are missing locally
    const processedTransactions = mpesaTransactions.map(tx => ({
      ...tx,
      isMissing: !localReceipts.has(tx.MpesaReceiptNumber)
    }));

    res.render('pull_dashboard', { 
      transactions: processedTransactions,
      title: "Reconciliation Dashboard"
    });

  } catch (error) {
    console.error("Pull Dashboard Error:", error.message);
    res.status(500).render('pull_dashboard', { 
      transactions: [], 
      error: "Could not sync with Safaricom." 
    });
  }
};