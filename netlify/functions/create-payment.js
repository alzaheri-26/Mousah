// Creates a Mollie payment for an order.
// The price is always re-read from Supabase server-side, never trusted from the client.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;
  const SITE_URL = process.env.SITE_URL || (event.headers.origin || '');

  try {
    const body = JSON.parse(event.body || '{}');
    const { productId, qty, name, phone, address, notes } = body;

    if (!productId || !qty || !name || !phone || !address) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Ontbrekende gegevens' }) };
    }

    const prodRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=*`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const products = await prodRes.json();
    const product = products && products[0];
    if (!product) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Product niet gevonden' }) };
    }

    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    const total = (Number(product.price) * quantity).toFixed(2);

    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        qty: quantity,
        total: total,
        customer_name: name,
        phone: phone,
        address: address,
        notes: notes || '',
        status: 'open'
      })
    });
    const orderData = await orderRes.json();
    const order = orderData && orderData[0];
    if (!order) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Bestelling kon niet worden aangemaakt' }) };
    }

    const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: total },
        description: `Bestelling: ${product.name} (x${quantity})`,
        redirectUrl: `${SITE_URL}/bedankt.html?order=${order.id}`,
        webhookUrl: `${SITE_URL}/.netlify/functions/mollie-webhook`,
        metadata: { orderId: order.id }
      })
    });
    const molliePayment = await mollieRes.json();

    if (!molliePayment || !molliePayment._links) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Mollie-betaling kon niet worden aangemaakt', details: molliePayment }) };
    }

    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mollie_payment_id: molliePayment.id })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl: molliePayment._links.checkout.href })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Serverfout', details: String(err) }) };
  }
};
