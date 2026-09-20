exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  try {
    const body = JSON.parse(event.body || '{}');
    const { password, action, payload } = body;

    if (!password || password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Onjuist wachtwoord' }) };
    }

    const sbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    };

    if (action === 'upload_image') {
      const path = `products/${Date.now()}-${payload.fileName}`;
      const binary = Buffer.from(payload.base64Data, 'base64');
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/product-images/${path}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': payload.contentType || 'image/jpeg'
          },
          body: binary
        }
      );
      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        return { statusCode: 500, body: JSON.stringify({ error: 'Upload mislukt', details: t }) };
      }
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
      return { statusCode: 200, body: JSON.stringify({ url: publicUrl }) };
    }

    if (action === 'save_product') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([payload])
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Opslaan mislukt', details: data }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true, product: data[0] }) };
    }

    if (action === 'delete_product') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(payload.id)}`, {
        method: 'DELETE',
        headers: sbHeaders
      });
      if (!res.ok) {
        const t = await res.text();
        return { statusCode: 500, body: JSON.stringify({ error: 'Verwijderen mislukt', details: t }) };
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'save_settings') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Opslaan mislukt', details: data }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true, settings: data[0] }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Onbekende actie' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Serverfout', details: String(err) }) };
  }
};
