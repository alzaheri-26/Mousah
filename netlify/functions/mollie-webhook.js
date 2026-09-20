// Mollie calls this URL (form-encoded) whenever a payment's status changes.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;

  try {
    const params = new URLSearchParams(event.body);
    const paymentId = params.get('id');
    if (!paymentId) return { statusCode: 400, body: 'Missing id' };

    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MOLLIE_API_KEY}` }
    });
    const payment = await res.json();
    const status = payment.status || 'unknown';
    const orderId = payment.metadata && payment.metadata.orderId;

    if (orderId) {
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: status })
      });
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'error' };
  }
};
