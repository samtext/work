import express from 'express';
import axios from 'axios';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import basicAuth from 'express-basic-auth'; 
import router from './controllers/lipaNaMpesa.js';
import { callback } from './controllers/lipaCallback.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- SECURITY: IP WHITELIST MIDDLEWARE ---
const ipWhitelist = (req, res, next) => {
    // Check for IP in headers (if behind proxy) or socket
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const allowedIp = process.env.ALLOWED_IP || '197.232.6.149';

    // Allow your specific IP and Localhost for development
    if (clientIp.includes(allowedIp) || clientIp.includes('127.0.0.1') || clientIp === '::1') {
        next();
    } else {
        console.log(`[SECURITY] Blocked access attempt from IP: ${clientIp}`);
        res.status(403).send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h1 style="color:red;">403 Forbidden</h1>
                <p>Access Denied: This dashboard is restricted to the administrator's WiFi network.</p>
                <small>Your IP: ${clientIp}</small>
            </div>
        `);
    }
};

// --- ROUTES ---

// Public Routes
app.use(router);
app.use(callback);

app.get("/", async (req, res) => {
  res.render('payment', { failedMessage: null, successMessage: null });
});

app.get("/receipt", (req, res) => {
    res.render('receipt_form', { 
        checkoutId: req.query.checkoutId || "",
        env: {
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
        }
    });
});

// Secure Redirect
app.get("/dashboard", (req, res) => {
  res.redirect('/admin/dashboard');
});

// --- SECURED ADMIN ROUTE (Double Protection: IP + Password) ---
app.use('/admin', ipWhitelist, basicAuth({
    users: { 
        [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'auri2025' 
    },
    challenge: true,
    realm: 'AuriAdminControl',
}), (req, res, next) => {
    res.locals.env = {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    };
    next();
}, adminRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Admin restricted to IP: ${process.env.ALLOWED_IP || '197.232.6.149'}`);
});