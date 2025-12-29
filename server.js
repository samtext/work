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
app.use('/static', express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- EMAIL ALERT CONFIG (Auri Pay) ---
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
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #d9534f;">Auri Pay Security Alert</h2>
                <p>An unauthorized IP address attempted to access your M-Pesa Dashboard.</p>
                <hr>
                <p><strong>Blocked IP:</strong> ${offendingIp}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p style="background: #f8f9fa; padding: 10px; border-radius: 5px;">
                    <strong>Status:</strong> Rejected by IP Range Whitelist.
                </p>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.error("Email Error:", error);
        else console.log('Security Alert Sent to ' + process.env.NOTIFY_EMAIL);
    });
};

// --- SECURITY: IP RANGE WHITELIST ---
const ipWhitelist = (req, res, next) => {
    // 1. Get the real client IP (first one in the list)
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    
    // 2. Define your Range (First two parts of your IP)
    const allowedRange = '197.232.'; 

    // 3. Validation
    const isLocal = clientIp.includes('127.0.0.1') || clientIp === '::1';
    const isMyWiFi = clientIp.startsWith(allowedRange);

    if (isLocal || isMyWiFi) {
        console.log(`[AUTH] Access granted to: ${clientIp}`);
        next();
    } else {
        console.log(`[SECURITY] Blocked access from: ${clientIp}`);
        sendAlert(clientIp);
        res.status(403).send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h1 style="color:#333;">404 Not Found</h1>
                <p>The requested URL was not found on this server.</p>
            </div>
        `);
    }
};

// --- ROUTES ---
app.use(router);
app.use(callback);

app.get("/", (req, res) => {
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

// --- SECURED ADMIN ROUTE ---
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