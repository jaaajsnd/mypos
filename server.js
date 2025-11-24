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

// MyPOS credentials
const MYPOS_CLIENT_ID = process.env.MYPOS_CLIENT_ID || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_CLIENT_SECRET = process.env.MYPOS_CLIENT_SECRET || 'a0JxT5j1veAoP7gaSlhDQNJes236D38iZquYUmllkgUY3a9A';
const MYPOS_API_URL = 'https://www.mypos.com/vmp/checkout-demo';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage
const pendingPayments = new Map();

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'MyPOS Payment Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Test MyPOS connection
app.get('/test-mypos', (req, res) => {
  res.json({
    status: 'success',
    message: 'MyPOS configured',
    client_id: MYPOS_CLIENT_ID ? 'Present' : 'Missing'
  });
});

// Checkout page
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
          .success-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 9999;
            text-align: center;
            display: none;
            min-width: 400px;
          }
          .success-popup.show {
            display: block;
          }
          .success-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9998;
            display: none;
          }
          .success-popup-overlay.show {
            display: block;
          }
          .success-icon {
            font-size: 60px;
            color: #4CAF50;
            margin-bottom: 20px;
          }
          .success-title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
          }
          .success-text {
            font-size: 16px;
            color: #666;
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
          <div id="loading-message" class="loading">Processing payment...</div>
          
          <!-- Success Popup -->
          <div id="success-popup-overlay" class="success-popup-overlay"></div>
          <div id="success-popup" class="success-popup">
            <div class="success-icon">✓</div>
            <div class="success-title">Payment Successful!</div>
            <div class="success-text">Your payment has been processed successfully.</div>
          </div>
          
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
              Pay Now
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

              if (data.status === 'success' && data.paymentUrl) {
                window.location.href = data.paymentUrl;
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

          // Input validation styling
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

// Create MyPOS payment
app.post('/api/create-mypos-payment', async (req, res) => {
  try {
    const { sessionId, customerData, cartData, amount, currency, orderId, returnUrl } = req.body;
    
    console.log('Creating MyPOS payment:', { amount, currency, orderId });

    // Store payment info
    pendingPayments.set(sessionId, {
      customerData,
      cartData,
      amount,
      currency,
      orderId,
      returnUrl,
      created_at: new Date()
    });

    // Prepare MyPOS payment request
    const myposData = {
      IPCmethod: 'IPCPurchase',
      IPCVersion: '1.4',
      IPCLanguage: 'en',
      SID: MYPOS_CLIENT_ID,
      Amount: amount,
      Currency: currency.toUpperCase(),
      OrderID: orderId || sessionId,
      URL_OK: `${APP_URL}/payment/success?session_id=${sessionId}`,
      URL_Cancel: `${APP_URL}/payment/cancel`,
      URL_Notify: `${APP_URL}/webhook/mypos`,
      CustomerEmail: customerData.email,
      CustomerFirstName: customerData.firstName,
      CustomerLastName: customerData.lastName,
      CustomerAddress: customerData.address,
      CustomerCity: customerData.city,
      CustomerZIPCode: customerData.postalCode,
      CustomerPhone: customerData.phone || '',
      CartItems: '1',
      Article_1: cartData && cartData.items ? cartData.items.map(i => i.title).join(', ') : 'Order',
      Quantity_1: '1',
      Price_1: amount,
      Currency_1: currency.toUpperCase()
    };

    // Create signature
    const signatureString = Object.keys(myposData)
      .filter(key => key !== 'Signature')
      .sort()
      .map(key => myposData[key])
      .join('');
    
    const signature = crypto
      .createHmac('sha256', MYPOS_CLIENT_SECRET)
      .update(signatureString)
      .digest('hex');

    myposData.Signature = signature;

    // Build payment URL
    const paymentUrl = MYPOS_API_URL + '?' + new URLSearchParams(myposData).toString();

    console.log('MyPOS payment URL created');

    res.json({
      status: 'success',
      paymentUrl: paymentUrl,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Error creating MyPOS payment:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Payment success
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

// Payment cancel
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

// MyPOS webhook
app.post('/webhook/mypos', (req, res) => {
  try {
    console.log('MyPOS webhook received:', req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`💳 MyPOS configured`);
  console.log(`🔗 Checkout URL: ${APP_URL}/checkout`);
});
