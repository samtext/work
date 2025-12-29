import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { getTimeStamp } from '../utils/timestamp.utils.js';
import { authToken } from '../middlewares/authorization.js';
import { supabase } from '../config/supabaseClient.js'; 

dotenv.config();
const router = express.Router();

router.post("/lipaNaMpesa", authToken, async (req, res) => {
  try {
    const number = req.body.phoneNumber.replace(/[^0-9]/g, '').replace(/^0/, ''); 
    const phoneNumber = `254${number}`;
    const amount = Math.floor(req.body.amount); 
    const timestamp = getTimeStamp();
    const access_token = req.authData;

    const callbackURL = process.env.CALLBACK_URL || 'https://af7c352a3cc7a8e8-197-232-6-149.serveousercontent.com/callback';

    const password = Buffer.from(`${process.env.BusinessShortCode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const stkUrl = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'; 

    const body = {
      "BusinessShortCode": process.env.BusinessShortCode,
      "Password": password,
      "Timestamp": timestamp,
      "TransactionType": "CustomerBuyGoodsOnline",
      "Amount": amount, 
      "PartyA": phoneNumber,
      "PartyB": "4938110",
      "PhoneNumber": phoneNumber,
      "CallBackURL": callbackURL,
      "AccountReference": "CMT1234RT",
      "TransactionDesc": "Unlimited Internet"
    };

    const response = await axios.post(stkUrl, body, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' }
    });

    const stkResponse = response.data;

    if (stkResponse.ResponseCode === '0') {
      const requestID = stkResponse.CheckoutRequestID;

      await supabase.from('transactions').insert([{
        checkout_request_id: requestID,
        phone_number: phoneNumber,
        amount: amount,
        status: 'pending'
      }]);

      const queryEndpoint = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';
      const queryPayload = {
        "BusinessShortCode": process.env.BusinessShortCode,
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": requestID
      };

      const timer = setInterval(async () => {
        try {
          const status = await axios.post(queryEndpoint, queryPayload, {
            headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }
          });

          const resultCode = String(status.data.ResultCode);
          const resultDesc = status.data.ResultDesc;

          if (resultCode === '0') {
            clearInterval(timer);
            await supabase.from('transactions').update({ status: 'success' }).eq('checkout_request_id', requestID);
            
            // Render the success page for redirecting to receipt
            return res.render('success', { 
              checkoutId: requestID, 
              type: "Unlimited Internet", 
              heading: "Auri Online Services" 
            });

          } else if (resultCode === '1032') { 
            // Handles user cancellation specifically
            clearInterval(timer);
            await supabase.from('transactions').update({ status: 'cancelled' }).eq('checkout_request_id', requestID);
            
            return res.render('failed', { 
              type: "failed", 
              heading: "Request Cancelled", 
              desc: "Request Cancelled by user." 
            });

          } else if (resultCode) { 
            // Handles any other failure
            clearInterval(timer);
            await supabase.from('transactions').update({ status: 'failed' }).eq('checkout_request_id', requestID);
            
            return res.render('failed', { 
              type: "failed", 
              heading: "Payment Failed", 
              desc: resultDesc 
            });
          }
        } catch (error) { 
          // Polling continues if the transaction is still in progress
        }
      }, 15000);
    }
  } catch (error) {
    console.error("M-Pesa Error:", error.response?.data || error.message);
    res.render('failed', { 
        type: "failed", 
        heading: "Error", 
        desc: error.response?.data?.errorMessage || error.message 
    });
  }
});

export default router;