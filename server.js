import express from 'express';
import axios from 'axios';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import basicAuth from 'express-basic-auth'; 
import nodemailer from 'nodemailer';
import router from './controllers/lipaNaMpesa.js';
import { callback } from './controllers/lipaCallback.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

// --- KEEP YOUR ORIGINAL STATIC ROUTE ---
app.use('/static', express.static(path.join(__dirname, 'public')));

// --- ADDITION FOR PWA: SERVE MANIFEST AND SW FROM ROOT ---
// This ensures the browser can find /manifest.json and /sw.js directly
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- EMAIL ALERT CONFIG ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.ALERT_EMAIL_USER,
        pass: process.env.ALERT_EMAIL_PASS 
    }
});

const sendAlert = (offendingIp) => {
    const mailOptions = {
        from: `"Auri Pay Security" <${process.env.ALERT_EMAIL_USER}>`,
        to: process.env.NOTIFY_EMAIL,
        subject: '⚠️ SECURITY ALERT: Unauthorized Access Blocked',
        html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Auri Pay Security Alert</h2><p>Blocked IP: ${offendingIp}</p></div>`
    };
    transporter.sendMail(mailOptions, (error) => {
        if (error) console.error("Email Error:", error);
    });
};

// --- SECURITY: IP WHITELIST ---
const ipWhitelist = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const allowedIp = process.env.ALLOWED_IP || '197.232.6.149';
    if (clientIp.includes(allowedIp) || clientIp.includes('127.0.0.1') || clientIp === '::1') {
        next();
    } else {
        sendAlert(clientIp);
        res.status(403).send('<div style="text-align:center;"><h1>Page Not Found</h1></div>');
    }
};

// --- ROUTES ---
app.use(router);
app.use(callback);

// 1. HOME (Marketplace Catalog)
app.get("/", (req, res) => {
  res.render('index'); 
});

// 2. PAYMENT PAGE (The M-Pesa Form)
app.get("/service-payment", (req, res) => {
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

app.get("/dashboard", (req, res) => {
  res.redirect('/admin/dashboard');
});

// SECURED ADMIN
app.use('/admin', ipWhitelist, basicAuth({
    users: { [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'auri2025' },
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
  console.log(`Auri Pay Server running on port ${port}`);
});