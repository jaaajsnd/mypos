require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const APP_URL = process.env.APP_URL || 'http://localhost:10000';
const MYPOS_USERNAME = process.env.MYPOS_USERNAME || '@username';
const PAYMENT_BASE_URL = process.env.PAYMENT_BASE_URL || 'https://mypos.com';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Telegram error:', error.message);
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'active', message: 'myPOS Payment Gateway Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/test', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>myPOS Test</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { text-align: center; margin-bottom: 30px; }
          button { width: 100%; padding: 15px; background: #000; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
          button:hover { background: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>myPOS Test</h1>
          <form method="POST" action="/checkout">
            <input type="hidden" name="amount" value="10.00">
            <input type="hidden" name="currency" value="EUR">
            <input type="hidden" name="order_id" value="TEST-123">
            <input type="hidden" name="return_url" value="https://google.com">
            <input type="hidden" name="cart_items" value='{"items":[{"title":"Test Product","quantity":1,"price":1000,"line_price":1000}]}'>
            <button type="submit">Start Test Checkout €10.00</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.body;
  
  if (!amount || !currency) {
    return res.status(400).send('Missing required parameters');
  }

  let cartData = null;
  if (cart_items) {
    try {
      cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }

  const paymentLink = `${PAYMENT_BASE_URL}/${MYPOS_USERNAME}/${amount}`;

  res.send(`
    <html>
      <head>
        <title>Checkout - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7f7f7; color: #333; line-height: 1.6; }
          .checkout-container { display: flex; min-height: 100vh; }
          .order-summary { width: 50%; background: #fafafa; padding: 60px 80px; border-right: 1px solid #e1e1e1; }
          .cart-items { margin-bottom: 30px; }
          .cart-item { display: flex; gap: 15px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e1e1e1; }
          .item-image { width: 64px; height: 64px; background: #e1e1e1; border-radius: 8px; position: relative; }
          .item-quantity { position: absolute; top: -8px; right: -8px; background: #717171; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
          .item-details { flex: 1; }
          .item-name { font-weight: 500; font-size: 14px; }
          .item-price { font-weight: 500; font-size: 14px; }
          .summary-section { padding: 20px 0; border-top: 1px solid #e1e1e1; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .summary-row.total { font-size: 18px; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e1e1e1; }
          .payment-form { width: 50%; background: white; padding: 60px 80px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
          .form-group { margin-bottom: 12px; }
          label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
          input { width: 100%; padding: 12px 14px; border: 1px solid #d9d9d9; border-radius: 5px; font-size: 14px; }
          input:focus { outline: none; border-color: #2c6ecb; }
          .form-row { display: flex; gap: 12px; }
          .form-row .form-group { flex: 1; }
          .pay-button { width: 100%; padding: 18px; background: #2c6ecb; color: white; border: none; border-radius: 5px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px; }
          .pay-button:hover { background: #1f5bb5; }
          @media (max-width: 1000px) { .checkout-container { flex-direction: column-reverse; } .order-summary, .payment-form { width: 100%; padding: 30px 20px; } }
        </style>
      </head>
      <body>
        <div class="checkout-container">
          <div class="order-summary">
            <div class="cart-items" id="cart-items"></div>
            <div class="summary-section">
              <div class="summary-row"><span>Subtotal</span><span>€${amount}</span></div>
              <div class="summary-row"><span>Shipping</span><span>Free</span></div>
              <div class="summary-row total"><span>Total</span><span>€${amount}</span></div>
            </div>
          </div>
          <div class="payment-form">
            <div class="section">
              <div class="section-title">Contact</div>
              <div class="form-group"><label for="email">Email address</label><input type="email" id="email" required></div>
            </div>
            <div class="section">
              <div class="section-title">Shipping address</div>
              <div class="form-row">
                <div class="form-group"><label for="firstName">First name</label><input type="text" id="firstName" required></div>
                <div class="form-group"><label for="lastName">Last name</label><input type="text" id="lastName" required></div>
              </div>
              <div class="form-group"><label for="address">Address</label><input type="text" id="address" required></div>
              <div class="form-row">
                <div class="form-group"><label for="postalCode">Postal code</label><input type="text" id="postalCode" required></div>
                <div class="form-group"><label for="city">City</label><input type="text" id="city" required></div>
              </div>
            </div>
            <button class="pay-button" onclick="startPayment()">Complete order</button>
          </div>
        </div>
        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function displayCartItems() {
            const container = document.getElementById('cart-items');
            if (!cartData || !cartData.items) {
              container.innerHTML = '<p>No products</p>';
              return;
            }
            container.innerHTML = cartData.items.map(item => \`
              <div class="cart-item">
                <div class="item-image"><div class="item-quantity">\${item.quantity}</div></div>
                <div class="item-details"><div class="item-name">\${item.title || item.product_title}</div></div>
                <div class="item-price">€\${(item.price / 100).toFixed(2)}</div>
              </div>
            \`).join('');
          }

          displayCartItems();

          async function startPayment() {
            const customerData = {
              firstName: document.getElementById('firstName').value.trim(),
              lastName: document.getElementById('lastName').value.trim(),
              email: document.getElementById('email').value.trim(),
              address: document.getElementById('address').value.trim(),
              postalCode: document.getElementById('postalCode').value.trim(),
              city: document.getElementById('city').value.trim()
            };
            
            if (!customerData.firstName || !customerData.email) {
              alert('Please fill in all fields');
              return;
            }

            await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                amount: '${amount}', 
                customerData, 
                cartData, 
                orderId: '${order_id || ''}',
                paymentLink: '${paymentLink}'
              })
            });

            window.location.href = '${paymentLink}';
          }
        </script>
      </body>
    </html>
  `);
});

app.post('/api/notify', async (req, res) => {
  try {
    const { amount, customerData, cartData, orderId, paymentLink } = req.body;

    let productsText = '';
    if (cartData && cartData.items) {
      productsText = '\n\n<b>🛒 Products:</b>\n';
      cartData.items.forEach(item => {
        const itemPrice = (item.line_price || (item.price * item.quantity)) / 100;
        productsText += `• ${item.quantity}x ${item.title} - €${itemPrice.toFixed(2)}\n`;
      });
    }

    const message = `
<b>🛒 NEW CHECKOUT - myPOS</b>

<b>💰 Amount:</b> €${amount}
<b>👤 Customer:</b> ${customerData.firstName} ${customerData.lastName}
<b>📧 Email:</b> ${customerData.email}
<b>📍 Address:</b> ${customerData.address}, ${customerData.postalCode} ${customerData.city}${productsText}

<b>🔗 Payment Link:</b> ${paymentLink}

<i>⏳ Waiting for payment...</i>
    `.trim();

    await sendTelegramMessage(message);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
