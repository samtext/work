import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { getTimeStamp } from '../utils/timestamp.utils.js';
import { authToken } from '../middlewares/authorization.js';

dotenv.config();
const router = express.Router();

router.post("/lipaNaMpesa", authToken, async (req, res) => {
  try {
    // ------ STK PUSH SENDING REQUEST
    const number = req.body.phoneNumber.replace(/^0/, ''); // remove leading 0 if any
    const phoneNumber = `254${number}`;
    const amount = req.body.amount;
    const timestamp = getTimeStamp();

    // Get access_token properly (req.authData must be set by middleware)
    const access_token = req.authData;
    if (!access_token) {
      return res.status(401).json({ error: "Access token missing" });
    }

    // Callback URL: Ensure it's set correctly
    const callbackURL = process.env.CALLBACK_URL || req.callbackUrl || 'https://af7c352a3cc7a8e8-197-232-6-149.serveousercontent.com/callback';  // Ensure the URL is correct
    console.log('Using Callback URL:', callbackURL);

    const password = Buffer.from(`${process.env.BusinessShortCode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const stkUrl = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'; // Production URL

    const body = {
      "BusinessShortCode": process.env.BusinessShortCode,
      "Password": password,
      "Timestamp": timestamp,
      "TransactionType": "CustomerBuyGoodsOnline",
      "Amount": amount,  // Use dynamic amount from form
      "PartyA": phoneNumber,
      "PartyB": "4938110",
      "PhoneNumber": phoneNumber,
      "CallBackURL": callbackURL,  // Ensure the callback URL is set correctly
      "AccountReference": "CMT1234RT",
      "TransactionDesc": "Unlimited Internet"
    };

    // STK PUSH Request
    console.log('STK Push Request Body:', body);
    const response = await axios.post(stkUrl, body, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const stkResponse = response.data;
    console.log('STK Push Response:', stkResponse);

    // ------ Checking Status of a Transaction
    const queryEndpoint = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

    let resultCode, resultDesc;

    if (stkResponse.ResponseCode === '0') {
      const requestID = stkResponse.CheckoutRequestID;

      const queryPayload = {
        "BusinessShortCode": process.env.BusinessShortCode,
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": requestID
      };

      // Retry mechanism with longer interval (60 seconds)
      const timer = setInterval(async () => {
        try {
          const status = await axios.post(queryEndpoint, queryPayload, {
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json'
            }
          });

          resultCode = status.data.ResultCode;
          resultDesc = status.data.ResultDesc;

          console.log('Query response:', resultCode, resultDesc);

          // Handle different result codes
          if (resultCode === '0') {
            // Payment successful
            res.render('success', {
              type: "Successful",
              heading: "Payment Request Successful",
              desc: "The payment request was processed successfully."
            });
            clearInterval(timer); // Stop querying once payment is successful
          } else if (resultCode === '1032') {
            // User cancelled the payment
            res.render('failed', {
              type: "cancelled",
              heading: "Request cancelled by the User",
              desc: "The user cancelled the request. Please try again and enter your pin to confirm payment."
            });
            clearInterval(timer);
          } else if (resultCode === '1') {
            // Insufficient balance
            res.render('failed', {
              type: "failed",
              heading: "Request failed due to insufficient balance",
              desc: "Please deposit funds on your M-PESA or use Overdraft (Fuliza) to complete the transaction."
            });
            clearInterval(timer);
          } else if (resultCode === '2029') {
            // Failed due to an unresolved reason type
            res.render('failed', {
              type: "failed",
              heading: "Payment request failed",
              desc: `${resultDesc}. Please try again to complete the transaction.`
            });
            clearInterval(timer);
          } else {
            // Other failure codes
            res.render('failed', {
              type: "failed",
              heading: "Payment request failed",
              desc: `${resultDesc}. Please try again to complete the transaction.`
            });
            clearInterval(timer);
          }

        } catch (error) {
          console.error('Error in STK Push query:', error.response ? error.response.data : error.message);

          // Log full error response
          if (error.response) {
            console.log('Full error response:', error.response.data);
          }

          res.render('failed', {
            type: "failed",
            heading: "Error sending the push request",
            desc: error.response?.data?.errorMessage || error.message
          });
        }
      }, 15000); // Retry every 15 seconds

    }

  } catch (error) {
    console.error("STK Push Error:", error.response?.data || error.message);
    const errorData = error.response?.data;
    const errorMessage = errorData?.errorMessage || "An error occurred";

    res.render('failed', {
      type: "failed",
      heading: "Error sending the push request",
      desc: errorMessage
    });
  }
});

export default router;
