import express from 'express';
import axios from 'axios';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import router from './controllers/lipaNaMpesa.js'
import {callback} from './controllers/lipaCallback.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

app.use(router);
app.use(callback);

app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get("/", async(req, res) => {
  res.render('payment', {failedMessage: null, successMessage: null});
});

app.get("/dashboard", async(req, res) => {
  res.redirect('/admin/dashboard');
});

// NEW RECEIPT ROUTE
app.get("/receipt", (req, res) => {
    res.render('receipt_form', { 
        checkoutId: req.query.checkoutId || "",
        env: {
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
        }
    });
});

app.use('/admin', (req, res, next) => {
    res.locals.env = {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    };
    next();
}, adminRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});