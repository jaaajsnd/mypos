require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// MyPOS configuration
const IS_PRODUCTION = process.env.MYPOS_PRODUCTION === 'true';
const MYPOS_CHECKOUT_URL = IS_PRODUCTION 
  ? 'https://www.mypos.com/vmp/checkout'
  : 'https://www.mypos.com/vmp/checkout-demo';

// MyPOS credentials
const MYPOS_SID = process.env.MYPOS_CLIENT_ID || '1223015';
const MYPOS_WALLET = process.env.MYPOS_WALLET || '40850018397';
const MYPOS_PRIVATE_KEY = process.env.MYPOS_PRIVATE_KEY;
const MYPOS_KEY_INDEX = 2;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage
const pendingPayments = new Map();

// Generate MyPOS signature
function generateMyPOSSignature(data) {
  try {
    const sortedKeys = Object.keys(data)
      .filter(key => key !== 'Signature')
      .sort();
    
    const concatenated = sortedKeys
      .map(key => String(data[key]))
      .join('-');
    
    console.log('Concatenated:', concatenated.substring(0, 100) + '...');
    
    const base64Concatenated = Buffer.from(concatenated, 'utf8').toString('base64');
    
    console.log('Base64:', base64Concatenated.substring(0, 50) + '...');
    
    const signature = crypto.sign('sha256', Buffer.from(base64Concatenated, 'utf8'), {
      key: MYPOS_PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING
    });
    
    const signatureBase64 = signature.toString('base64');
    
    console.log('✅ Signature generated:', signatureBase64.length, 'chars');
    
    return signatureBase64;
  } catch (error) {
    console.error('❌ Signature generation failed:', error.message);
    throw error;
  }
}

app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'MyPOS Payment Gateway is running',
    mode: IS_PRODUCTION ? 'PRODUCTION' : 'TEST',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/test-signature', (req, res) => {
  try {
    if (!MYPOS_PRIVATE_KEY) {
      return res.status(500).json({
        status: 'error',
        message: 'MYPOS_PRIVATE_KEY not configured'
      });
    }

    const testData = {
      IPCmethod: 'IPCPurchase',
      IPCVersion: '1.4',
      IPCLanguage: 'en',
      SID: MYPOS_SID,
      WalletNumber: MYPOS_WALLET,
      KeyIndex: MYPOS_KEY_INDEX,
      Source: 'SDK',
      Amount: '1.00',
      Currency: 'EUR',
      OrderID: 'TEST-' + Date.now()
    };

    const signature = generateMyPOSSignature(testData);

    res.json({
      status: 'success',
      message: 'Signature generation works!',
      mode: IS_PRODUCTION ? 'PRODUCTION' : 'TEST',
      checkoutUrl: MYPOS_CHECKOUT_URL,
      testData: testData,
      signature: signature.substring(0, 50) + '...',
      signatureLength: signature.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`💳 MyPOS Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'TEST'}`);
  console.log(`🏪 Store ID: ${MYPOS_SID}`);
  console.log(`💰 Wallet: ${MYPOS_WALLET}`);
  console.log(`🔑 Key Index: ${MYPOS_KEY_INDEX}`);
  console.log(`🔗 Checkout URL: ${MYPOS_CHECKOUT_URL}`);
  console.log(`🧪 Test signature: ${APP_URL}/test-signature`);
});
