import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

const app = express();
dotenv.config();

const url = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

/**
 * UPDATED: Using correct .env keys from your file (CONSUMER_KEY)
 * and added .trim() to prevent hidden character errors.
 */
const getAuthString = () => {
    const key = (process.env.CONSUMER_KEY || '').trim();
    const secret = (process.env.CONSUMER_SECRET || '').trim();
    return Buffer.from(`${key}:${secret}`).toString('base64');
};

// --- NEW REUSABLE FUNCTION ---
export async function getAccessToken() {
    const auth = getAuthString();
    const result = await axios.get(url, {
        headers: {
            Authorization: `Basic ${auth}`,
        },
    });
    return result.data.access_token;
}

// --- UPDATED ORIGINAL MIDDLEWARE ---
export async function authToken(req, res, next) { 
    try {
        // Now calling the reusable function to avoid code duplication
        req.authData = await getAccessToken();
        next();
    } catch (error) {
        // Enhanced logging to see the EXACT reason for the 400 error
        console.error('Authentication Error Details:', error.response?.data || error.message);

        if (axios.isAxiosError(error)) {
            if (error.response && error.response.status === 400) {
                return res.status(400).json({ 
                    error: "Request Failed: Invalid Authentication Details", 
                    details: error.response.data.errorMessage || error.message 
                });
            } else {
                return res.status(500).json({ error: "Error fetching data", details: error.message });
            }
        } else {
            return res.status(500).json({ error: "Internal Server Error", details: error.message });
        }
    }
}