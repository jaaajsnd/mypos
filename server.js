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
const MYPOS_SID = process.env.MYPOS_CLIENT_ID || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_WALLET = process.env.MYPOS_WALLET || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_PRIVATE_KEY = process.env.MYPOS_PRIVATE_KEY;
const MYPOS_KEY_INDEX = 1;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage
const pendingPayments = new Map();

// Generate MyPOS signature
function generateMyPOSSignature(data) {
  try {
    const concatenated = Object.keys(data)
      .filter(key => key !== 'Signature')
      .sort()
      .map(key => String(data[key]))
      .join('');

    console.log('Data to sign:', concatenated.substring(0, 100) + '...');

    const hash = crypto.createHash('sha256').update(concatenated, 'utf8').digest();

    const signature = crypto.sign('sha256', hash, {
      key: MYPOS_PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING
    });

    const signatureBase64 = signature.toString('base64');
    
    console.log('✅ Signature generated');
    
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

app.get('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.query;
  
  if (!amount || !currency) {
    return res.status(400).send('Missing required parameters: amount and currency');
  }

  let cartData = null;
  if (cart_items) {
    try {
      cartData = JSON.parse(decodeURIComponent(cart_items));
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }

  const sessionId = Date.now().toString();

  res.send(`
    <html>
      <head>
        <title>Payment - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            margin: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
          }
          .amount {
            text-align: center;
            font-size: 48px;
            font-weight: bold;
            color: #000;
            margin: 20px 0;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .section {
            margin: 30px 0;
            padding: 20px 0;
            border-top: 1px solid #e0e0e0;
          }
          .section:first-child {
            border-top: none;
            padding-top: 0;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          label {
            display: block;
            font-size: 14px;
            color: #555;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
            font-family: inherit;
          }
          input:focus {
            outline: none;
            border-color: #000;
          }
          .form-row {
            display: flex;
            gap: 15px;
          }
          .form-row .form-group {
            flex: 1;
          }
          .pay-button {
            width: 100%;
            padding: 16px;
            background: #000;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
          }
          .pay-button:hover {
            background: #333;
          }
          .pay-button:disabled {
            background: #d9d9d9;
            cursor: not-allowed;
          }
          .secure {
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 20px;
          }
          .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            display: none;
          }
          .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #666;
          }
          .back-button {
            display: block;
            text-align: center;
            color: #666;
            text-decoration: none;
            margin-top: 20px;
            padding: 10px;
            font-size: 14px;
          }
          .back-button:hover {
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💳 Secure Checkout</h1>
          <div class="amount">€${amount}</div>
          <div class="description">Order ${order_id || ''}</div>
          
          <div id="error-message" class="error"></div>
          <div id="loading-message" class="loading">Redirecting to payment...</div>
          
          <form id="payment-form">
            <div class="section">
              <div class="section-title">Customer Information</div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="firstName">First Name *</label>
                  <input type="text" id="firstName" placeholder="Sean" required>
                </div>
                <div class="form-group">
                  <label for="lastName">Last Name *</label>
                  <input type="text" id="lastName" placeholder="O'Brien" required>
                </div>
              </div>
              
              <div class="form-group">
                <label for="email">Email *</label>
                <input type="email" id="email" placeholder="sean@example.ie" required>
              </div>
              
              <div class="form-group">
                <label for="phone">Phone Number</label>
                <input type="tel" id="phone" placeholder="+353 85 123 4567">
              </div>
            </div>

            <div class="section">
              <div class="section-title">Billing Address</div>
              
              <div class="form-group">
                <label for="address">Address *</label>
                <input type="text" id="address" placeholder="12 O'Connell Street" required>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="postalCode">Eircode *</label>
                  <input type="text" id="postalCode" placeholder="D01 F5P2" required>
                </div>
                <div class="form-group">
                  <label for="city">City *</label>
                  <input type="text" id="city" placeholder="Dublin" required>
                </div>
              </div>
              
              <div class="form-group">
                <label for="country">Country *</label>
                <input type="text" id="country" value="Ireland" required>
              </div>
            </div>

            <button type="submit" class="pay-button">
              Continue to Payment
            </button>
          </form>
          
          <div class="secure">
            🔒 Secure payment with MyPOS
          </div>
          
          ${return_url ? `<a href="${return_url}" class="back-button">← Back to store</a>` : ''}
        </div>

        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};
          const sessionId = '${sessionId}';

          document.getElementById('payment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const customerData = {
              firstName: document.getElementById('firstName').value.trim(),
              lastName: document.getElementById('lastName').value.trim(),
              email: document.getElementById('email').value.trim(),
              phone: document.getElementById('phone').value.trim(),
              address: document.getElementById('address').value.trim(),
              postalCode: document.getElementById('postalCode').value.trim(),
              city: document.getElementById('city').value.trim(),
              country: document.getElementById('country').value.trim()
            };
            
            if (!customerData.firstName || !customerData.lastName || !customerData.email || 
                !customerData.address || !customerData.postalCode || !customerData.city || !customerData.country) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ Please fill in all required fields';
              return;
            }

            document.getElementById('loading-message').style.display = 'block';
            document.querySelector('.pay-button').disabled = true;

            try {
              const response = await fetch('/api/create-mypos-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: sessionId,
                  customerData: customerData,
                  cartData: cartData,
                  amount: '${amount}',
                  currency: '${currency}',
                  orderId: '${order_id || ''}',
                  returnUrl: '${return_url || APP_URL}'
                })
              });

              const data = await response.json();
              console.log('Response:', data);

              if (data.status === 'success' && data.formHtml) {
                const div = document.createElement('div');
                div.innerHTML = data.formHtml;
                document.body.appendChild(div);
                const form = div.querySelector('form');
                if (form) {
                  form.submit();
                }
              } else {
                throw new Error(data.message || 'Payment could not be started');
              }
            } catch (error) {
              console.error('Error:', error);
              document.getElementById('loading-message').style.display = 'none';
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ ' + error.message;
              document.querySelector('.pay-button').disabled = false;
            }
          });

          const inputs = document.querySelectorAll('input[required]');
          inputs.forEach(input => {
            input.addEventListener('blur', function() {
              if (!this.value.trim()) {
                this.style.borderColor = '#f44336';
              } else {
                this.style.borderColor = '#ddd';
              }
            });
            
            input.addEventListener('input', function() {
              if (this.value.trim()) {
                this.style.borderColor = '#4CAF50';
              }
            });
          });
        </script>
      </body>
    </html>
  `);
});

app.post('/api/create-mypos-payment', async (req, res) => {
  try {
    const { sessionId, customerData, cartData, amount, currency, orderId, returnUrl } = req.body;
    
    console.log('=== Creating MyPOS Payment ===');
    console.log('Mode:', IS_PRODUCTION ? 'PRODUCTION' : 'TEST');
    console.log('Amount:', amount, currency);

    if (!MYPOS_PRIVATE_KEY) {
      throw new Error('MYPOS_PRIVATE_KEY not configured');
    }

    pendingPayments.set(sessionId, {
      customerData,
      cartData,
      amount,
      currency,
      orderId,
      returnUrl,
      created_at: new Date()
    });

    const paymentData = {
      IPCmethod: 'IPCPurchase',
      IPCVersion: '1.4',
      IPCLanguage: 'en',
      SID: MYPOS_SID,
      WalletNumber: MYPOS_WALLET,
      KeyIndex: MYPOS_KEY_INDEX,
      Source: 'SDK',
      Amount: parseFloat(amount).toFixed(2),
      Currency: currency.toUpperCase(),
      OrderID: orderId || sessionId,
      URL_OK: `${APP_URL}/payment/success?session_id=${sessionId}`,
      URL_Cancel: `${APP_URL}/payment/cancel`,
      URL_Notify: `${APP_URL}/webhook/mypos`,
      CustomerEmail: customerData.email,
      CustomerFirstNames: customerData.firstName,
      CustomerLastName: customerData.lastName,
      CustomerAddress: customerData.address,
      CustomerCity: customerData.city,
      CustomerZIPCode: customerData.postalCode,
      CustomerCountry: 'IRL',
      CustomerPhone: customerData.phone || '',
      Note: cartData && cartData.items ? cartData.items.map(i => i.title).join(', ') : 'Order'
    };

    console.log('Payment data prepared');

    const signature = generateMyPOSSignature(paymentData);
    paymentData.Signature = signature;

    const formHtml = `
      <form id="mypos-form" method="POST" action="${MYPOS_CHECKOUT_URL}">
        ${Object.keys(paymentData).map(key => 
          `<input type="hidden" name="${key}" value="${String(paymentData[key]).replace(/"/g, '&quot;')}">`
        ).join('\n')}
      </form>
      <script>
        console.log('Submitting to MyPOS ${IS_PRODUCTION ? 'PRODUCTION' : 'TEST'}...');
        document.getElementById('mypos-form').submit();
      </script>
    `;

    console.log('✅ Payment form generated');

    res.json({
      status: 'success',
      formHtml: formHtml
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.get('/payment/success', (req, res) => {
  const { session_id } = req.query;
  const session = pendingPayments.get(session_id);
  const returnUrl = session?.returnUrl || '/';
  
  res.send(`
    <html>
      <head>
        <title>Payment Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .success-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .checkmark {
            color: #4CAF50;
            font-size: 60px;
            margin-bottom: 20px;
          }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="success-box">
          <div class="checkmark">✓</div>
          <h1>Payment Successful!</h1>
          <p>Your payment has been processed successfully.</p>
          <p>You will receive a confirmation email shortly.</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '${returnUrl}';
          }, 3000);
        </script>
      </body>
    </html>
  `);
});

app.get('/payment/cancel', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Payment Cancelled</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #333; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Payment Cancelled</h1>
          <p>Your payment has been cancelled.</p>
        </div>
      </body>
    </html>
  `);
});

app.post('/webhook/mypos', (req, res) => {
  try {
    console.log('MyPOS webhook received:', req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`💳 MyPOS Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'TEST'}`);
  console.log(`🔗 Checkout URL: ${MYPOS_CHECKOUT_URL}`);
  console.log(`🧪 Test signature: ${APP_URL}/test-signature`);
});
