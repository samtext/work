import { supabase } from '../config/supabaseClient.js';

export const getDashboard = async (req, res) => {
  try {
    // Fetch all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate total amount for successful transactions
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