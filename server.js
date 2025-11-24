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
const MYPOS_SID = process.env.MYPOS_CLIENT_ID || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_WALLET = process.env.MYPOS_WALLET || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_SECRET = process.env.MYPOS_CLIENT_SECRET || 'a0JxT5j1veAoP7gaSlhDQNJes236D38iZquYUmllkgUY3a9A';
const MYPOS_KEY_INDEX = 1;
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

// Checkout page with Embedded SDK
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
  const orderId = order_id || `ORDER-${sessionId}`;

  // Prepare purchase data for SDK
  const purchaseData = {
    SID: MYPOS_SID,
    WalletNumber: MYPOS_WALLET,
    Amount: parseFloat(amount).toFixed(2),
    Currency: currency.toUpperCase(),
    OrderID: orderId,
    URL_OK: `${APP_URL}/payment/success?session_id=${sessionId}`,
    URL_Cancel: `${APP_URL}/payment/cancel?session_id=${sessionId}`,
    URL_Notify: `${APP_URL}/webhook/mypos`,
    KeyIndex: MYPOS_KEY_INDEX,
    Note: cartData && cartData.items ? cartData.items.map(i => i.title).join(', ') : 'Order'
  };

  // Store session
  pendingPayments.set(sessionId, {
    amount,
    currency,
    orderId,
    cartData,
    return_url,
    created_at: new Date()
  });

  res.send(`
    <html>
      <head>
        <title>Payment - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://www.mypos.com/vmp/js/mypos-embedded-1.0.2.js"></script>
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
          #mypos-container {
            margin: 20px 0;
            min-height: 200px;
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
          <div class="description">Order ${orderId}</div>
          
          <div id="error-message" class="error"></div>
          <div id="loading-message" class="loading">Processing payment...</div>
          
          <!-- Success Popup -->
          <div id="success-popup-overlay" class="success-popup-overlay"></div>
          <div id="success-popup" class="success-popup">
            <div class="success-icon">✓</div>
            <div class="success-title">Payment Successful!</div>
            <div class="success-text">Your payment has been processed successfully.</div>
          </div>
          
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

          <div class="section">
            <div class="section-title">Payment Details</div>
            <div id="mypos-container"></div>
          </div>
          
          <div class="secure">
            🔒 Secure payment with MyPOS
          </div>
          
          ${return_url ? `<a href="${return_url}" class="back-button">← Back to store</a>` : ''}
        </div>

        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};
          const sessionId = '${sessionId}';
          const purchaseData = ${JSON.stringify(purchaseData)};

          function validateCustomerInfo() {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('email').value.trim();
            const address = document.getElementById('address').value.trim();
            const postalCode = document.getElementById('postalCode').value.trim();
            const city = document.getElementById('city').value.trim();
            const country = document.getElementById('country').value.trim();
            
            if (!firstName || !lastName || !email || !address || !postalCode || !city || !country) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ Please fill in all required fields';
              return false;
            }
            
            return {
              firstName,
              lastName,
              email,
              phone: document.getElementById('phone').value.trim(),
              address,
              postalCode,
              city,
              country
            };
          }

          // Add customer data to purchase
          purchaseData.CustomerEmail = '';
          purchaseData.CustomerFirstNames = '';
          purchaseData.CustomerLastName = '';
          purchaseData.CustomerAddress = '';
          purchaseData.CustomerCity = '';
          purchaseData.CustomerZIPCode = '';
          purchaseData.CustomerCountry = 'IRL';
          purchaseData.CustomerPhone = '';

          // Initialize MyPOS Embedded Checkout
          try {
            const checkout = new MYPOSSDK.Checkout({
              container: 'mypos-container',
              paymentData: purchaseData,
              signature: '', // Will be generated on backend
              development: false, // Set to true for testing
              onSuccess: function(data) {
                console.log('Payment successful:', data);
                
                // Show success popup
                document.getElementById('loading-message').style.display = 'none';
                document.getElementById('success-popup-overlay').classList.add('show');
                document.getElementById('success-popup').classList.add('show');
                
                // Redirect after 2 seconds
                setTimeout(() => {
                  const returnUrl = '${return_url || APP_URL}';
                  const separator = returnUrl.includes('?') ? '&' : '?';
                  window.location.href = returnUrl + separator + 'session_id=' + sessionId;
                }, 2000);
              },
              onError: function(error) {
                console.error('Payment error:', error);
                document.getElementById('loading-message').style.display = 'none';
                document.getElementById('error-message').style.display = 'block';
                document.getElementById('error-message').innerHTML = '✗ Payment failed: ' + (error.message || 'Please try again');
              },
              onCancel: function() {
                console.log('Payment cancelled');
                document.getElementById('loading-message').style.display = 'none';
                document.getElementById('error-message').style.display = 'block';
                document.getElementById('error-message').innerHTML = '✗ Payment was cancelled';
              },
              onSubmit: function() {
                const customerData = validateCustomerInfo();
                if (!customerData) {
                  return false; // Prevent submission
                }
                
                // Update purchase data with customer info
                purchaseData.CustomerEmail = customerData.email;
                purchaseData.CustomerFirstNames = customerData.firstName;
                purchaseData.CustomerLastName = customerData.lastName;
                purchaseData.CustomerAddress = customerData.address;
                purchaseData.CustomerCity = customerData.city;
                purchaseData.CustomerZIPCode = customerData.postalCode;
                purchaseData.CustomerPhone = customerData.phone;
                
                document.getElementById('loading-message').style.display = 'block';
                return true; // Allow submission
              }
            });
          } catch (error) {
            console.error('Failed to initialize MyPOS SDK:', error);
            document.getElementById('error-message').style.display = 'block';
            document.getElementById('error-message').innerHTML = '✗ Failed to load payment form. Please refresh the page.';
          }

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

// Payment success
app.get('/payment/success', (req, res) => {
  const { session_id } = req.query;
  const session = pendingPayments.get(session_id);
  const returnUrl = session?.return_url || '/';
  
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
    // Verify signature here if needed
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
  console.log(`💳 MyPOS Embedded SDK configured`);
  console.log(`🔗 Checkout URL: ${APP_URL}/checkout`);
});
