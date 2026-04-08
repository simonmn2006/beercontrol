// server/routes/billing.js
const express = require('express');
const { db }  = require('../db');
const router  = express.Router();

function getStripe() {
  const secretKeyRow = db.prepare("SELECT value FROM settings WHERE key='stripe_secret_key'").get();
  if (!secretKeyRow || !secretKeyRow.value) return null;
  return require('stripe')(secretKeyRow.value);
}

// ── Webhook Route (MUST use raw body parser) ──
router.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const stripe = getStripe();
  const whSecretRow = db.prepare("SELECT value FROM settings WHERE key='stripe_webhook_secret'").get();
  
  if (!stripe || !whSecretRow || !whSecretRow.value) {
    console.error('Stripe not configured');
    return res.status(400).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whSecretRow.value);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const restIdStr = session.client_reference_id;
      if (restIdStr) {
        const restId = parseInt(restIdStr, 10);
        const subId = session.subscription;
        const cusId = session.customer;
        // Update database
        db.prepare(`UPDATE restaurants SET stripe_customer_id=?, stripe_subscription_id=?, active=1 WHERE id=?`)
          .run(cusId, subId, restId);
        console.log(`[Stripe] Checkout completed for restaurant ${restId}`);
      }
      break;
    }
    
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (subId) {
        // Find restaurant
        const rest = db.prepare("SELECT id FROM restaurants WHERE stripe_subscription_id=?").get(subId);
        if (rest) {
          // Record payment
          db.prepare(`
            INSERT INTO payments (restaurant_id, stripe_invoice_id, amount, currency, status, receipt_url, hosted_invoice_url)
            VALUES (?, ?, ?, ?, 'succeeded', ?, ?)
          `).run(
            rest.id,
            invoice.id,
            invoice.amount_paid / 100, // Stripe uses cents
            invoice.currency.toUpperCase(),
            invoice.receipt_url || null,
            invoice.hosted_invoice_url || null
          );
          
          // Extend renewal_date by 1 month (or based on standard logic, let's just make it +31 days)
          db.prepare(`UPDATE restaurants SET active=1, renewal_date=date(datetime('now', '+31 days')) WHERE id=?`)
            .run(rest.id);
          console.log(`[Stripe] Payment succeeded for rest ${rest.id}, sub ${subId}`);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoiceFail = event.data.object;
      const subFailId = invoiceFail.subscription;
      if (subFailId) {
        // Find restaurant
        const rest = db.prepare("SELECT id, name, renewal_date, grace_period_days, admin_billing_alerts FROM restaurants WHERE stripe_subscription_id=?").get(subFailId);
        if (rest) {
          const grace = rest.grace_period_days || 7;
          // Check if today > renewal_date + grace_period_days
          const exceedsGrace = db.prepare("SELECT date('now') > date(?, '+' || ? || ' days') as suspended").get(rest.renewal_date, grace).suspended;
          
          if (exceedsGrace) {
            db.prepare("UPDATE restaurants SET active=0 WHERE id=?").run(rest.id);
            console.log(`[Stripe] Payment failed for sub ${subFailId}: account suspended exceeding ${grace} days grace.`);
            
            // Admin Alert via Email
            if (rest.admin_billing_alerts) {
              const { sendMail } = require('../mail');
              sendMail({
                subject: `⚠️ Payment Alert: ${rest.name}`,
                html: `<h3>Payment Overdue</h3>
                       <p>Restaurant <b>${rest.name}</b> (ID: ${rest.id}) has failed their subscription payment.</p>
                       <p>Grace period of ${grace} days has been exceeded. The account has been <b>suspended</b>.</p>
                       <p><a href="${process.env.APP_URL || 'http://localhost:3333'}/app#adminRestaurantDetail?id=${rest.id}">View Restaurant Details</a></p>`
              }).catch(e => console.error('[Mail] Failed to alert admin:', e.message));
            }
          } else {
            console.log(`[Stripe] Payment failed for sub ${subFailId}: account remains active within grace period.`);
          }
          
          // Record failed payment
          db.prepare(`
            INSERT INTO payments (restaurant_id, stripe_invoice_id, amount, currency, status, hosted_invoice_url)
            VALUES (?, ?, ?, ?, 'failed', ?)
          `).run(
            rest.id,
            invoiceFail.id,
            invoiceFail.amount_due / 100,
            invoiceFail.currency.toUpperCase(),
            invoiceFail.hosted_invoice_url || null
          );
        }
      }
      break;
    }
  }

  res.json({received: true});
});

// ── JSON routes (For checkout session creation) ──
// We apply express.json() manually to the rest
router.use(express.json());

router.post('/create-checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured in settings.' });

  const { plan, restaurant_id } = req.body;
  if (!plan || !restaurant_id) return res.status(400).json({ error: 'Missing plan or restaurant_id' });

  // Lookup Price ID from settings
  const priceIdKey = `stripe_price_${plan.toLowerCase()}`;
  const priceIdRow = db.prepare("SELECT value FROM settings WHERE key=?").get(priceIdKey);
  
  if (!priceIdRow || !priceIdRow.value) {
    return res.status(400).json({ error: `Stripe Price ID for plan '${plan}' not configured in Admin Settings.` });
  }

  const price_id = priceIdRow.value;

  const rest = db.prepare("SELECT name FROM restaurants WHERE id=?").get(restaurant_id);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'sepa_debit'],
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/app?checkout=success`,
      cancel_url: `${req.headers.origin}/app?checkout=canceled`,
      client_reference_id: restaurant_id.toString(),
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
