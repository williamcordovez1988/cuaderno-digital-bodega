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
      'Error: No se encontró la API Key de OpenAI (VITE_OPENAI_API_KEY). Configúrala en el archivo .env o en Vercel.'
    );
  }

  // Preparar imagen Base64 normalizada a data:image/jpeg;base64,... o data:image/png;base64,...
  let base64Image: string | undefined = undefined;
  if (payload.dataUrl) {
    if (
      payload.dataUrl.startsWith('data:image/jpeg;base64,') ||
      payload.dataUrl.startsWith('data:image/png;base64,') ||
      payload.dataUrl.startsWith('data:image/webp;base64,') ||
      payload.dataUrl.startsWith('data:image/gif;base64,')
    ) {
      base64Image = payload.dataUrl;
    } else if (payload.dataUrl.includes(',')) {
      const parts = payload.dataUrl.split(',');
      base64Image = `data:image/jpeg;base64,${parts[1]}`;
    }
  } else if (payload.imageBase64) {
    base64Image = `data:image/jpeg;base64,${payload.imageBase64}`;
  }

  if (!base64Image && (!payload.text || !payload.text.trim())) {
    throw new Error('No se detectó ninguna imagen ni texto de factura para enviar a la IA.');
  }

  // Construir payload con la estructura exacta solicitada
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: 'Analiza esta factura o lista de compras. Devuelve ÚNICAMENTE un objeto JSON con esta estructura exacta: { "productos": [ { "nombre": "string", "cantidad": number, "costo_unitario": number } ] }'
    }
  ];

  if (base64Image) {
    userContent.push({
      type: 'image_url',
      image_url: { url: base64Image }
    });
  }

  if (payload.text && payload.text.trim()) {
    userContent.push({
      type: 'text',
      text: `Texto adicional de la factura:\n${payload.text.trim()}`
    });
  }

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
        messages: [
          {
            role: 'user',
            content: userContent
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (response.ok) {
      const jsonResponse = await response.json();
      const content = jsonResponse.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('La respuesta de OpenAI no contuvo contenido.');
      }
      rawJsonResult = JSON.parse(content.trim());
      source = 'openai';
    } else {
      const errText = await response.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        // Not JSON
      }

      // Si hay error de proxy o geobloqueo en cliente directo, intentar fallback a /api/parse-invoice
      const isGeoBlocked =
        response.status === 403 &&
        (errText.includes('unsupported_country') || parsedErr?.error?.code === 'unsupported_country_region_territory');

      if (isGeoBlocked || response.status >= 500) {
        console.warn(`[OpenAI Direct] Código ${response.status}. Intentando vía endpoint /api/parse-invoice...`);
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

      // Transparencia total en el error real devuelto por la API
      const finalMsg = parsedErr?.error?.message || errText || `Error HTTP ${response.status} en la API de OpenAI`;
      throw new Error(`OpenAI API (${response.status}): ${finalMsg}`);
    }
  } catch (error: any) {
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
        // Continuar hacia el throw del error original
      }
      throw error;
    }
  }

  // Mapear y validar la lista de productos devuelta por OpenAI
  const rawProducts: any[] = Array.isArray(rawJsonResult?.productos)
    ? rawJsonResult.productos
    : Array.isArray(rawJsonResult?.items)
    ? rawJsonResult.items
    : Array.isArray(rawJsonResult?.products)
    ? rawJsonResult.products
    : [];

  if (rawProducts.length === 0) {
    throw new Error(
      'OpenAI analizó la imagen pero no detectó productos legibles. Asegúrate de que la foto de la factura esté bien iluminada y enfocada.'
    );
  }

  const items: ParsedOpenAIItem[] = rawProducts.map((p: any) => {
    const productName = String(p.nombre || p.productName || p.name || p.descripcion || 'Producto detectado').trim();
    const quantity = Math.max(1, Number(p.cantidad || p.quantity || p.qty || 1));
    const rawCost = Number(p.costo_unitario ?? p.costUSD ?? p.costo ?? p.price ?? 1.0);
    const costUSD = Math.max(0.01, Number(rawCost.toFixed(2)) || 1.0);
    const costBs = Number((costUSD * rate).toFixed(2));
    const margin = 30; // 30% margen comercial estándar sugerido
    const suggestedUSD = Number((costUSD * 1.3).toFixed(2));
    const suggestedBs = Number((suggestedUSD * rate).toFixed(2));

    // Emparejar con el catálogo real del negocio si coincide
    const matched = payload.catalog.find(
      (c) =>
        c.name.toLowerCase().trim() === productName.toLowerCase().trim() ||
        (p.productCode && c.code.toLowerCase() === String(p.productCode).toLowerCase())
    );

    return {
      productId: matched?.id,
      productName: matched ? matched.name : productName,
      productCode: matched?.code || p.productCode,
      quantity,
      unit: p.unidad || p.unit || matched?.unit || 'und.',
      costUSD,
      costBs,
      suggestedPriceUSD: suggestedUSD,
      suggestedPriceBs: suggestedBs,
      marginPercent: margin,
      category: matched?.category || p.categoria || p.category || 'Víveres Secos',
      isNewProduct: !matched
    };
  });

  const totalUSD =
    Number(rawJsonResult.totalInvoiceAmountUSD) ||
    Number(items.reduce((acc, i) => acc + i.quantity * i.costUSD, 0).toFixed(2));

  return {
    supplier: rawJsonResult.proveedor || rawJsonResult.supplier || 'Proveedor Detectado',
    invoiceNumber: rawJsonResult.numero_factura || rawJsonResult.invoiceNumber || undefined,
    date: rawJsonResult.fecha || rawJsonResult.date || new Date().toLocaleDateString('es-VE'),
    totalInvoiceAmountUSD: totalUSD,
    totalInvoiceAmountBs: Number((totalUSD * rate).toFixed(2)),
    items,
    notes: 'Factura extraída con OpenAI gpt-4o-mini',
    source,
    fallback: false
  };
}
