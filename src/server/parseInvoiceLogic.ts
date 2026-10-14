import { GoogleGenAI, Type } from '@google/genai';

export interface ParseInvoiceRequest {
  text?: string;
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

export interface ParsedInvoiceItem {
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

export interface ParseInvoiceResponse {
  supplier: string;
  invoiceNumber?: string;
  date?: string;
  totalInvoiceAmountUSD?: number;
  totalInvoiceAmountBs?: number;
  items: ParsedInvoiceItem[];
  notes?: string;
  fallback?: boolean;
}



export async function processInvoiceWithOpenAI(
  payload: ParseInvoiceRequest,
  customKey?: string
): Promise<ParseInvoiceResponse> {
  const apiKey = (customKey || process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const rate = payload.exchangeRate || 877.90;

  if (!apiKey) {
    throw new Error('No se ha configurado la clave de OpenAI (VITE_OPENAI_API_KEY o OPENAI_API_KEY).');
  }

  const catalogSummary = payload.catalog
    .slice(0, 40)
    .map((c) => `- [${c.code}] ${c.name} (Costo actual: $${c.costUSD}, Precio actual: $${c.priceUSD}, Unidad: ${c.unit})`)
    .join('\n');

  const systemInstructions = `Eres un asistente de visión artificial y contabilidad experto para bodegas y minimarkets en Venezuela ("Cuaderno Digital").
Tu misión es procesar la imagen o texto de la factura de compra de un proveedor mayorista (Empresas Polar, PepsiCo Venezuela, Alimentos Mary, Distribuidora, etc.).
Tasa BCV oficial: ${rate} Bs/USD.

Extrae en formato JSON estricto:
{
  "supplier": "Nombre de la empresa o distribuidor",
  "invoiceNumber": "Número de factura si está visible",
  "date": "Fecha del documento",
  "totalInvoiceAmountUSD": 0.0,
  "notes": "Notas del despacho",
  "items": [
    {
      "productName": "Nombre comercial del producto",
      "quantity": 1,
      "costUSD": 1.0,
      "unit": "paq./bot./lata/und.",
      "category": "Víveres Secos / Bebidas / etc."
    }
  ]
}`;

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];

  let imageUrl: string | undefined = undefined;
  if (payload.imageBase64 && payload.mimeType) {
    imageUrl = `data:${payload.mimeType};base64,${payload.imageBase64}`;
  }

  if (imageUrl) {
    contentParts.push({
      type: 'text',
      text: 'Analiza visualmente la factura de proveedor y extrae en formato JSON la lista de productos (nombre, cantidad y costo unitario en USD), el proveedor, número y fecha.'
    });
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: imageUrl,
        detail: 'high'
      }
    });
  }

  if (payload.text && payload.text.trim()) {
    contentParts.push({
      type: 'text',
      text: `Texto de la factura:\n${payload.text.trim()}`
    });
  }

  if (payload.catalog.length > 0) {
    contentParts.push({
      type: 'text',
      text: `Catálogo de productos de la bodega:\n${catalogSummary}`
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
            content: contentParts
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[OpenAI Server] Error HTTP ${response.status}: ${errText}`);
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI no devolvió texto en su respuesta.');
    }

    const parsed = JSON.parse(content.trim());
    const rawItems: any[] = Array.isArray(parsed.productos)
      ? parsed.productos
      : Array.isArray(parsed.items)
      ? parsed.items
      : [];

    const items: ParsedInvoiceItem[] = rawItems.map((raw) => {
      const productName = String(raw.nombre || raw.productName || 'Producto').trim();
      const quantity = Math.max(1, Number(raw.cantidad || raw.quantity) || 1);
      const rawCost = Number(raw.costo_unitario ?? raw.costUSD ?? 1.0);
      const costUSD = Math.max(0.01, Number(rawCost.toFixed(2)) || 1.0);
      const costBs = Number((costUSD * rate).toFixed(2));
      const margin = 30;
      const suggestedUSD = Number((costUSD * 1.3).toFixed(2));
      const suggestedBs = Number((suggestedUSD * rate).toFixed(2));

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
      Number(parsed.totalInvoiceAmountUSD) ||
      Number(items.reduce((acc, i) => acc + i.quantity * i.costUSD, 0).toFixed(2));

    return {
      supplier: parsed.supplier || 'Proveedor Mayorista',
      invoiceNumber: parsed.invoiceNumber || undefined,
      date: parsed.date || new Date().toLocaleDateString('es-VE'),
      totalInvoiceAmountUSD: totalUSD,
      totalInvoiceAmountBs: Number((totalUSD * rate).toFixed(2)),
      items,
      notes: parsed.notes || 'Factura procesada con OpenAI gpt-4o-mini',
      fallback: false
    };
  } catch (err: any) {
    console.error('[OpenAI Server] Fallo al procesar:', err);
    throw new Error(err?.message || 'Error al procesar la factura con OpenAI');
  }
}

export async function processInvoiceWithGemini(
  payload: ParseInvoiceRequest
): Promise<ParseInvoiceResponse | { fallback: boolean; message: string }> {
  const openAIKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAIKey) {
    try {
      const openAiResult = await processInvoiceWithOpenAI(payload, openAIKey);
      if (openAiResult) {
        return openAiResult;
      }
    } catch {
      // Continue to Gemini
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No se encontró clave de API configurada para procesar la factura.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const catalogSummary = payload.catalog
    .slice(0, 50)
    .map((c) => `- ID: ${c.id} | Código: ${c.code} | Nombre: ${c.name} | Costo actual: $${c.costUSD} | Precio actual: $${c.priceUSD} | Stock actual: ${c.currentStock} | Unidad: ${c.unit} | Categoría: ${c.category}`)
    .join('\n');

  const systemPrompt = `
Eres un asistente contable y de visión artificial experto para bodegas y minimarkets en Venezuela ("Cuaderno Digital").
Tu misión es procesar una factura de compra, nota de entrega, recibo o comprobante de mercancía de un proveedor mayorista (ej: Empresas Polar, PepsiCo / Pepsi Cola, Alimentos Mary, Cargill, Monaca, Distribuidora local, etc.), ya sea provisto en imagen/foto, archivo PDF o texto transcrito.
Tasa oficial BCV de referencia: ${payload.exchangeRate} Bs/$ USD.

Instrucciones exactas de extracción:
1. Extrae el nombre del Proveedor o Distribuidora (ej: Empresas Polar, PepsiCo Venezuela, Distribuidora El Sol, etc.).
2. Extrae el número de factura/nota de entrega y la fecha si están visibles.
3. Extrae la tabla completa de artículos recibidos:
   - Nombre comercial exacto del producto (ej: Harina PAN Blanca 1kg, Pepsi Cola 2L, Arroz Mary Tradicional 1kg).
   - Cantidad Comprada / Recibida (número de unidades a sumar al stock).
   - Costo Unitario de Compra en USD ($). Si la factura viene en Bolívares (Bs), conviértelo a USD dividiendo entre la tasa ${payload.exchangeRate}. Si viene en USD, calcula también su equivalente en Bs.
   - Costo Unitario en Bs: costUSD * ${payload.exchangeRate}.
   - Margen de ganancia recomendado: 30% (o entre 25% y 35%).
   - Precio de venta al público sugerido en USD: costUSD * (1 + 0.30), redondeado a 2 decimales.
   - Precio de venta sugerido en Bs: suggestedPriceUSD * ${payload.exchangeRate}.
   - Compara con el catálogo existente provisto abajo. Si coincide con un producto existente, coloca su productId y productCode, y marca isNewProduct: false. Si es un producto nuevo que no está en el catálogo, márcalo como isNewProduct: true y asígnale una categoría apropiada (Víveres Secos, Lácteos y Charcutería, Bebidas y Refrescos, Limpieza y Aseo, etc.).
   - Unidad de empaque (paq., bot., lata, und., kg, etc.).

Catálogo de productos existentes en el negocio:
${catalogSummary || '(Catálogo actualmente vacío)'}
`;

  try {
    const parts: any[] = [];

    if (payload.imageBase64 && payload.mimeType) {
      parts.push({
        inlineData: {
          mimeType: payload.mimeType,
          data: payload.imageBase64
        }
      });
    }

    if (payload.text && payload.text.trim()) {
      parts.push({
        text: `Texto o transcripción de la factura de proveedor:\n${payload.text}`
      });
    } else if (!payload.imageBase64) {
      throw new Error('No se proporcionó imagen ni texto de factura para analizar.');
    }

    parts.push({
      text: 'Analiza la factura de proveedor con OCR/Visión y extrae la lista completa de productos, cantidades compradas, costos unitarios ($ USD y Bs) y precios sugeridos de venta con margen del 30%.'
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplier: {
              type: Type.STRING,
              description: 'Nombre del proveedor o distribuidora (ej: Empresas Polar, PepsiCo Venezuela, Distribuidora Central)'
            },
            invoiceNumber: {
              type: Type.STRING,
              description: 'Número de factura o nota de entrega si aparece'
            },
            date: {
              type: Type.STRING,
              description: 'Fecha de emisión o entrega'
            },
            totalInvoiceAmountUSD: {
              type: Type.NUMBER,
              description: 'Monto total de la factura en USD'
            },
            totalInvoiceAmountBs: {
              type: Type.NUMBER,
              description: 'Monto total de la factura en Bolívares'
            },
            notes: {
              type: Type.STRING,
              description: 'Resumen o notas del procesamiento'
            },
            items: {
              type: Type.ARRAY,
              description: 'Lista de artículos comprados',
              items: {
                type: Type.OBJECT,
                properties: {
                  productId: {
                    type: Type.STRING,
                    description: 'ID del producto en el catálogo si fue emparejado'
                  },
                  productName: {
                    type: Type.STRING,
                    description: 'Nombre comercial del producto'
                  },
                  productCode: {
                    type: Type.STRING,
                    description: 'Código de producto o SKU'
                  },
                  quantity: {
                    type: Type.NUMBER,
                    description: 'Cantidad de unidades compradas a sumar al inventario'
                  },
                  unit: {
                    type: Type.STRING,
                    description: 'Unidad de despacho (paq., bot., und., kg, etc.)'
                  },
                  costUSD: {
                    type: Type.NUMBER,
                    description: 'Costo unitario de compra en USD'
                  },
                  costBs: {
                    type: Type.NUMBER,
                    description: 'Costo unitario de compra en Bolívares'
                  },
                  suggestedPriceUSD: {
                    type: Type.NUMBER,
                    description: 'Precio de venta sugerido en USD (con margen 30%)'
                  },
                  suggestedPriceBs: {
                    type: Type.NUMBER,
                    description: 'Precio de venta sugerido en Bs'
                  },
                  marginPercent: {
                    type: Type.NUMBER,
                    description: 'Margen de ganancia aplicado (30%)'
                  },
                  category: {
                    type: Type.STRING,
                    description: 'Categoría (Víveres Secos, Lácteos y Charcutería, Bebidas y Refrescos, Limpieza y Aseo, etc.)'
                  },
                  isNewProduct: {
                    type: Type.BOOLEAN,
                    description: 'Verdadero si es un artículo nuevo que no existía en el catálogo'
                  }
                },
                required: ['productName', 'quantity', 'costUSD', 'suggestedPriceUSD']
              }
            }
          },
          required: ['supplier', 'items']
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim()) as ParseInvoiceResponse;
      // Enrich with Bs and calculated values if model missed any
      const rate = payload.exchangeRate || 65.0;
      parsed.items = parsed.items.map((item) => {
        const costUSD = item.costUSD || 1.0;
        const costBs = item.costBs || Number((costUSD * rate).toFixed(2));
        const suggestedUSD = item.suggestedPriceUSD || Number((costUSD * 1.3).toFixed(2));
        const suggestedBs = item.suggestedPriceBs || Number((suggestedUSD * rate).toFixed(2));

        // Catalog cross-check
        let isNew = item.isNewProduct;
        let matchedId = item.productId;
        let matchedCode = item.productCode;

        if (matchedId) {
          isNew = false;
        } else {
          const match = payload.catalog.find(c => c.name.toLowerCase() === item.productName.toLowerCase());
          if (match) {
            matchedId = match.id;
            matchedCode = match.code;
            isNew = false;
          } else {
            isNew = true;
          }
        }

        return {
          ...item,
          productId: matchedId,
          productCode: matchedCode,
          costUSD,
          costBs,
          suggestedPriceUSD: suggestedUSD,
          suggestedPriceBs: suggestedBs,
          marginPercent: item.marginPercent || 30,
          isNewProduct: isNew
        };
      });

      if (!parsed.totalInvoiceAmountBs && parsed.totalInvoiceAmountUSD) {
        parsed.totalInvoiceAmountBs = Number((parsed.totalInvoiceAmountUSD * rate).toFixed(2));
      }

      return parsed;
    }

    throw new Error('No se obtuvo respuesta del modelo de visión.');
  } catch (error: any) {
    console.error('Invoice parse error:', error);
    throw new Error(error?.message || 'Error al procesar la factura con IA.');
  }
}

