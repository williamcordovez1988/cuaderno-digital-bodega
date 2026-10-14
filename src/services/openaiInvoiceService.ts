/**
 * Servicio de Lectura Inteligente de Facturas con IA utilizando OpenAI (gpt-4o-mini)
 * Endpoint: https://api.openai.com/v1/chat/completions
 * Modelo: gpt-4o-mini
 * Formato: response_format: { type: "json_object" }
 */

export interface ProcessInvoiceInput {
  text?: string;
  dataUrl?: string; // base64 data URL e.g. "data:image/jpeg;base64,..."
  imageBase64?: string;
  mimeType?: string;
  exchangeRate: number;
  catalog: Array<{
    id: string;
    name: string;
    code: string;
    costUSD: number;
    priceUSD: number;
    unit: string;
    category: string;
    currentStock: number;
  }>;
}

export interface ParsedOpenAIItem {
  productId?: string;
  productName: string;
  productCode?: string;
  quantity: number;
  unit: string;
  costUSD: number;
  costBs?: number;
  suggestedPriceUSD: number;
  suggestedPriceBs?: number;
  marginPercent?: number;
  category?: string;
  isNewProduct?: boolean;
}

export interface ParsedOpenAIInvoice {
  supplier: string;
  invoiceNumber?: string;
  date?: string;
  totalInvoiceAmountUSD?: number;
  totalInvoiceAmountBs?: number;
  items: ParsedOpenAIItem[];
  notes?: string;
  source?: 'openai' | 'proxy' | 'fallback';
  fallback?: boolean;
}

/**
 * Obtiene la API Key de OpenAI desde import.meta.env o localStorage
 */
export function getOpenAIApiKey(): string {
  const envKey = (import.meta.env.VITE_OPENAI_API_KEY || '').trim();
  if (envKey && envKey !== 'tu_clave_de_openai_aqui' && !envKey.startsWith('MY_')) {
    return envKey;
  }
  const localKey = (
    localStorage.getItem('bodega_openai_api_key') ||
    localStorage.getItem('VITE_OPENAI_API_KEY') ||
    ''
  ).trim();
  if (localKey) {
    return localKey;
  }
  return '';
}

/**
 * Guarda una API Key de OpenAI en localStorage para persistencia en el navegador
 */
export function setStoredOpenAIApiKey(key: string): void {
  localStorage.setItem('bodega_openai_api_key', key.trim());
}

/**
 * Procesa la factura enviando la imagen real a OpenAI gpt-4o-mini con response_format json_object.
 * NO utiliza datos mock predeterminados de Polar.
 */
export async function processInvoiceWithOpenAI(
  payload: ProcessInvoiceInput
): Promise<ParsedOpenAIInvoice> {
  const apiKey = getOpenAIApiKey();
  const rate = payload.exchangeRate || 877.90;

  if (!apiKey) {
    throw new Error(
      'No se encontró la clave VITE_OPENAI_API_KEY. Por favor ingresa tu API Key de OpenAI en la barra superior del modal o configúrala en Vercel.'
    );
  }

  // Preparar imagen Base64
  let imageUrl: string | undefined = undefined;
  if (payload.dataUrl && payload.dataUrl.startsWith('data:image/')) {
    imageUrl = payload.dataUrl;
  } else if (payload.dataUrl && payload.dataUrl.startsWith('data:application/octet-stream')) {
    imageUrl = payload.dataUrl.replace('data:application/octet-stream', 'data:image/jpeg');
  } else if (payload.imageBase64) {
    const mime = payload.mimeType || 'image/jpeg';
    imageUrl = `data:${mime};base64,${payload.imageBase64}`;
  }

  if (!imageUrl && (!payload.text || !payload.text.trim())) {
    throw new Error('No se detectó ninguna imagen ni texto de factura para enviar a la IA.');
  }

  const catalogSummary = payload.catalog
    .slice(0, 40)
    .map((c) => `- [${c.code}] ${c.name} (Costo: $${c.costUSD}, Precio: $${c.priceUSD}, Unidad: ${c.unit})`)
    .join('\n');

  const systemInstructions = `Eres un asistente de visión artificial y contabilidad experto para bodegas y minimarkets en Venezuela ("Cuaderno Digital").
Tu misión es analizar la imagen de la factura o nota de entrega del proveedor y extraer en formato JSON estricto todos los productos, cantidades y costos unitarios reales.

Tasa oficial BCV de referencia: ${rate} Bs/USD.

Estructura OBLIGATORIA de la respuesta en formato JSON:
{
  "supplier": "Nombre de la distribuidora o proveedor que emite la factura",
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
2. Si el costo unitario está en Bolívares (Bs), conviértelo a USD dividiendo entre la tasa cambiaria ${rate} Bs/USD.
3. Si el costo unitario ya está en USD, usa el valor numérico en USD.
4. "quantity" debe ser la cantidad de unidades compradas / recibidas a ingresar al stock.
5. "costUSD" debe ser el costo unitario neto de compra por unidad.`;

  // Construir contenido para OpenAI Vision
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
    {
      type: 'text',
      text: 'Analiza la imagen de esta factura de proveedor comercial con visión artificial y extrae la lista completa de productos reales, cantidades y costos unitarios en formato JSON estricto.'
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
      text: `Transcripción o texto adicional:\n${payload.text.trim()}`
    });
  }

  if (payload.catalog.length > 0) {
    userContent.push({
      type: 'text',
      text: `Catálogo existente en la bodega:\n${catalogSummary}`
    });
  }

  // 1. Intentar llamada directa a la API de OpenAI
  let rawJsonResult: any = null;
  let source: 'openai' | 'proxy' = 'openai';

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

    if (response.ok) {
      const jsonResponse = await response.json();
      const content = jsonResponse.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('La respuesta de OpenAI no contuvo información de texto.');
      }
      rawJsonResult = JSON.parse(content.trim());
      source = 'openai';
    } else {
      const errText = await response.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        // Not json
      }

      const isGeoBlocked =
        response.status === 403 &&
        (errText.includes('unsupported_country') || parsedErr?.error?.code === 'unsupported_country_region_territory');

      // Si fue bloqueado por región (Venezuela) o hubo error de red, intentar vía endpoint del servidor / proxy Vercel
      if (isGeoBlocked || response.status === 403 || response.status >= 500) {
        console.warn(`[OpenAI Direct] Código ${response.status}. Intentando vía endpoint servidor /api/parse-invoice...`);
        try {
          const proxyRes = await fetch('/api/parse-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              apiKey
            })
          });

          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            if (proxyData && proxyData.items && proxyData.items.length > 0) {
              return proxyData;
            }
          }
        } catch {
          // Continuar con el error real
        }
      }

      // Mostrar el error real de OpenAI sin taparlo con datos mock
      const finalMsg = parsedErr?.error?.message || errText || `Error HTTP ${response.status} en OpenAI API`;
      throw new Error(`OpenAI API (${response.status}): ${finalMsg}`);
    }
  } catch (error: any) {
    // Si la llamada directa falló por CORS o red, intentar vía endpoint de servidor
    if (!rawJsonResult) {
      try {
        const proxyRes = await fetch('/api/parse-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            apiKey
          })
        });

        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData && proxyData.items && proxyData.items.length > 0) {
            return proxyData;
          }
        }
      } catch {
        // Fallback al error original
      }
      throw error;
    }
  }

  // Mapear y validar la lista de productos devuelta por OpenAI
  const rawItems: any[] = Array.isArray(rawJsonResult?.items) ? rawJsonResult.items : [];
  if (rawItems.length === 0) {
    throw new Error('OpenAI procesó la imagen pero no detectó productos legibles. Asegúrate de que la foto de la factura sea clara y nítida.');
  }

  const items: ParsedOpenAIItem[] = rawItems.map((raw: any) => {
    const productName = String(raw.productName || 'Producto detectado').trim();
    const quantity = Math.max(1, Number(raw.quantity) || 1);
    const costUSD = Math.max(0.01, Number(raw.costUSD) || 1.0);
    const costBs = Number((costUSD * rate).toFixed(2));
    const margin = 30; // 30% margen estándar sugerido
    const suggestedUSD = Number((costUSD * 1.3).toFixed(2));
    const suggestedBs = Number((suggestedUSD * rate).toFixed(2));

    // Emparejar con el catálogo real del negocio
    const matched = payload.catalog.find(
      (c) =>
        c.name.toLowerCase().trim() === productName.toLowerCase().trim() ||
        (raw.productCode && c.code.toLowerCase() === String(raw.productCode).toLowerCase())
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
    Number(rawJsonResult.totalInvoiceAmountUSD) ||
    Number(items.reduce((acc, i) => acc + i.quantity * i.costUSD, 0).toFixed(2));

  return {
    supplier: rawJsonResult.supplier || 'Proveedor Detectado',
    invoiceNumber: rawJsonResult.invoiceNumber || undefined,
    date: rawJsonResult.date || new Date().toLocaleDateString('es-VE'),
    totalInvoiceAmountUSD: totalUSD,
    totalInvoiceAmountBs: Number((totalUSD * rate).toFixed(2)),
    items,
    notes: rawJsonResult.notes || 'Factura extraída con OpenAI gpt-4o-mini.',
    source,
    fallback: false
  };
}
