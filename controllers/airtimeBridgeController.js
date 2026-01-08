import { sendAirtime } from '../services/airtimeService.js';

const airtimeBridgeController = {
    registerC2BURL: async (req, res) => {
        try {
            // Logic to register confirmation URL with Safaricom would go here
            res.status(200).send("C2B Registration process initiated.");
        } catch (error) {
            res.status(500).send(error.message);
        }
    },

    handleMpesaPayment: async (req, res) => {
        try {
            const { MSISDN, TransAmount, TransID } = req.body;
            console.log(`[LIVE MPESA] ID: ${TransID} | From: ${MSISDN} | Amt: ${TransAmount}`);

            if (parseFloat(TransAmount) >= 5) {
                await sendAirtime(MSISDN, TransAmount);
            }
            
            res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
        } catch (error) {
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
};

export default airtimeBridgeController;