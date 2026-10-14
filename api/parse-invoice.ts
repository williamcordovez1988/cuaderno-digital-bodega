export default async function handler(req: any, res: any) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const payload = req.body || {};
  const apiKey = (payload.apiKey || process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const rate = payload.exchangeRate || 877.90;

  if (!apiKey) {
    return res.status(400).json({ error: 'Falta la API Key de OpenAI (OPENAI_API_KEY)' });
  }

  // Preparar imagen
  let imageUrl: string | undefined = undefined;
  if (payload.dataUrl && payload.dataUrl.startsWith('data:image/')) {
    imageUrl = payload.dataUrl;
  } else if (payload.imageBase64) {
    const mime = payload.mimeType || 'image/jpeg';
    imageUrl = `data:${mime};base64,${payload.imageBase64}`;
  }

  const systemInstructions = `Eres un asistente de visión artificial y contabilidad experto para bodegas y minimarkets en Venezuela ("Cuaderno Digital").
Tu misión es analizar la imagen de la factura comercial o nota de entrega del proveedor y extraer en formato JSON estricto todos los productos, cantidades y costos unitarios reales.

Tasa oficial BCV de referencia: ${rate} Bs/USD.

Estructura OBLIGATORIA de la respuesta en formato JSON:
{
  "supplier": "Nombre de la distribuidora o proveedor",
  "invoiceNumber": "Número de factura o nota de entrega",
  "date": "Fecha de la factura",
  "totalInvoiceAmountUSD": 0.0,
  "notes": "Notas del despacho",
  "items": [
    {
      "productName": "Nombre comercial real del producto",
      "quantity": 1,
      "costUSD": 0.0,
      "unit": "paq./bot./lata/und./kg",
      "category": "Víveres Secos / Bebidas y Refrescos / Lácteos y Charcutería / Limpieza y Aseo"
    }
  ]
}

Reglas estrictas de extracción:
1. Extrae los productos REALES que aparecen visualmente en la imagen de la factura.
2. Si el costo unitario está en Bolívares (Bs), conviértelo a USD dividiendo entre ${rate} Bs/USD.
3. Si el costo unitario ya está en USD, usa el valor en USD directo.
4. "quantity" debe ser la cantidad de unidades compradas / recibidas a ingresar al stock.
5. "costUSD" debe ser el costo unitario de compra por unidad.`;

  const userContent: any[] = [
    {
      type: 'text',
      text: 'Analiza detalladamente esta factura con visión artificial y extrae la lista de productos (nombre, cantidad y costo unitario), el proveedor, número y fecha en formato JSON.'
    }
  ];

  if (imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: imageUrl,
        detail: 'high'
      }
    });
  }

  if (payload.text && payload.text.trim()) {
    userContent.push({
      type: 'text',
      text: `Texto adicional o transcripción:\n${payload.text.trim()}`
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemInstructions
          },
          {
            role: 'user',
            content: userContent
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'Respuesta vacía de OpenAI' });
    }

    const parsed = JSON.parse(content.trim());
    const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];

    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((raw: any) => {
      const productName = String(raw.productName || 'Producto detectado').trim();
      const quantity = Math.max(1, Number(raw.quantity) || 1);
      const costUSD = Math.max(0.01, Number(raw.costUSD) || 1.0);
      const costBs = Number((costUSD * rate).toFixed(2));
      const margin = 30;
      const suggestedUSD = Number((costUSD * 1.3).toFixed(2));
      const suggestedBs = Number((suggestedUSD * rate).toFixed(2));

      const matched = catalog.find(
        (c: any) =>
          c.name?.toLowerCase().trim() === productName.toLowerCase().trim() ||
          (raw.productCode && c.code?.toLowerCase() === String(raw.productCode).toLowerCase())
      );

      return {
        productId: matched?.id,
        productName,
        productCode: matched?.code || raw.productCode,
        quantity,
        unit: raw.unit || matched?.unit || 'und.',
        costUSD,
        costBs,
        suggestedPriceUSD: suggestedUSD,
        suggestedPriceBs: suggestedBs,
        marginPercent: margin,
        category: matched?.category || raw.category || 'Víveres Secos',
        isNewProduct: !matched
      };
    });

    const totalUSD =
      Number(parsed.totalInvoiceAmountUSD) ||
      Number(items.reduce((acc: number, i: any) => acc + i.quantity * i.costUSD, 0).toFixed(2));

    return res.status(200).json({
      supplier: parsed.supplier || 'Proveedor Mayorista',
      invoiceNumber: parsed.invoiceNumber || undefined,
      date: parsed.date || new Date().toLocaleDateString('es-VE'),
      totalInvoiceAmountUSD: totalUSD,
      totalInvoiceAmountBs: Number((totalUSD * rate).toFixed(2)),
      items,
      notes: parsed.notes || 'Factura extraída con OpenAI gpt-4o-mini',
      source: 'proxy',
      fallback: false
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error en el servidor procesando la factura' });
  }
}
