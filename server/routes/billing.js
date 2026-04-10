// server/routes/billing.js
const express = require('express');
const { db }  = require('../db');
const router  = express.Router();

async function getStripe() {
  const secretKeyRow = await db.get("SELECT `value` FROM settings WHERE `key`='stripe_secret_key'");
  if (!secretKeyRow || !secretKeyRow.value) return null;
  return require('stripe')(secretKeyRow.value);
}

// ── Webhook Route (MUST use raw body parser) ──
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const stripe = await getStripe();
    const whSecretRow = await db.get("SELECT `value` FROM settings WHERE `key`='stripe_webhook_secret'");
    
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
          await db.run(`UPDATE restaurants SET stripe_customer_id=?, stripe_subscription_id=?, active=1 WHERE id=?`,
            [cusId, subId, restId]);
          console.log(`[Stripe] Checkout completed for restaurant ${restId}`);
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          // Find restaurant
          const rest = await db.get("SELECT id FROM restaurants WHERE stripe_subscription_id=?", [subId]);
          if (rest) {
            // Record payment
            await db.run(`
              INSERT INTO payments (restaurant_id, stripe_invoice_id, amount, currency, status, receipt_url, hosted_invoice_url)
              VALUES (?, ?, ?, ?, 'succeeded', ?, ?)
            `, [
              rest.id,
              invoice.id,
              invoice.amount_paid / 100, // Stripe uses cents
              invoice.currency.toUpperCase(),
              invoice.receipt_url || null,
              invoice.hosted_invoice_url || null
            ]);
            
            // Extend renewal_date by 1 month (or based on standard logic, let's just make it +31 days)
            await db.run(`UPDATE restaurants SET active=1, renewal_date=DATE_ADD(CURDATE(), INTERVAL 31 DAY) WHERE id=?`,
              [rest.id]);
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
          const rest = await db.get("SELECT id, name, renewal_date, grace_period_days, admin_billing_alerts FROM restaurants WHERE stripe_subscription_id=?", [subFailId]);
          if (rest) {
            const grace = rest.grace_period_days || 7;
            // Check if today > renewal_date + grace_period_days
            const exceedsGraceRow = await db.get("SELECT CURDATE() > DATE_ADD(?, INTERVAL ? DAY) as suspended", [rest.renewal_date, grace]);
            const exceedsGrace = exceedsGraceRow.suspended;
            
            if (exceedsGrace) {
              await db.run("UPDATE restaurants SET active=0 WHERE id=?", [rest.id]);
              console.log(`[Stripe] Payment failed for sub ${subFailId}: account suspended exceeding ${grace} days grace.`);
              
              // Admin Alert via Email
              if (rest.admin_billing_alerts) {
                try {
                  const { sendMail } = require('../mail');
                  await sendMail({
                    subject: `⚠️ Payment Alert: ${rest.name}`,
                    html: `<h3>Payment Overdue</h3>
                           <p>Restaurant <b>${rest.name}</b> (ID: ${rest.id}) has failed their subscription payment.</p>
                           <p>Grace period of ${grace} days has been exceeded. The account has been <b>suspended</b>.</p>
                           <p><a href="${process.env.APP_URL || 'http://localhost:3333'}/app#adminRestaurantDetail?id=${rest.id}">View Restaurant Details</a></p>`
                  });
                } catch (e) {
                  console.error('[Mail] Failed to alert admin:', e.message);
                }
              }
            } else {
              console.log(`[Stripe] Payment failed for sub ${subFailId}: account remains active within grace period.`);
            }
            
            // Record failed payment
            await db.run(`
              INSERT INTO payments (restaurant_id, stripe_invoice_id, amount, currency, status, hosted_invoice_url)
              VALUES (?, ?, ?, ?, 'failed', ?)
            `, [
              rest.id,
              invoiceFail.id,
              invoiceFail.amount_due / 100,
              invoiceFail.currency.toUpperCase(),
              invoiceFail.hosted_invoice_url || null
            ]);
          }
        }
        break;
      }
    }

    res.json({received: true});
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── JSON routes (For checkout session creation) ──
// We apply express.json() manually to the rest
router.use(express.json());

router.post('/create-checkout-session', async (req, res) => {
  try {
    const stripe = await getStripe();
    if (!stripe) return res.status(500).json({ error: 'Stripe is not configured in settings.' });

    const { plan, restaurant_id } = req.body;
    if (!plan || !restaurant_id) return res.status(400).json({ error: 'Missing plan or restaurant_id' });

    // Lookup Price ID from settings
    const priceIdKey = `stripe_price_${plan.toLowerCase()}`;
    const priceIdRow = await db.get("SELECT `value` FROM settings WHERE `key`=?", [priceIdKey]);
    
    if (!priceIdRow || !priceIdRow.value) {
      return res.status(400).json({ error: `Stripe Price ID for plan '${plan}' not configured in Admin Settings.` });
    }

    const price_id = priceIdRow.value;

    const rest = await db.get("SELECT name FROM restaurants WHERE id=?", [restaurant_id]);
    if (!rest) return res.status(404).json({ error: 'Restaurant not found' });

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
