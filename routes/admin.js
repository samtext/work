import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

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

        // res.locals.env is already set in server.js
        res.render('admin_dashboard', { transactions, totalAmount });
    } catch (error) {
        console.error("Dashboard Error:", error.message);
        res.status(500).send("Error loading dashboard");
    }
});

export default router;