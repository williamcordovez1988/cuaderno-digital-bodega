import { GoogleGenAI, Type } from '@google/genai';

export interface ParseSaleRequest {
  text: string;
  catalog: Array<{
    id: string;
    name: string;
    code: string;
    priceUSD: number;
    unit: string;
    currentStock: number;
  }>;
  knownCustomers: Array<{
    id: string;
    name: string;
    alias?: string;
  }>;
}

export interface ParsedItem {
  productId?: string;
  productName: string;
  productCode?: string;
  quantity: number;
  unit?: string;
  priceUSD?: number;
  rawMention: string;
}

export interface ParseSaleResponse {
  customerName?: string;
  customerId?: string;
  isCreditOrDebt: boolean;
  paymentMethodHint?: string;
  items: ParsedItem[];
  confidence: 'high' | 'medium' | 'low';
  aiNotes?: string;
}

export async function processSaleWithGemini(
  payload: ParseSaleRequest
): Promise<ParseSaleResponse | { fallback: boolean; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { fallback: true, message: 'No GEMINI_API_KEY configured' };
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
    .map((c) => `- ID: ${c.id} | Código: ${c.code} | Nombre: ${c.name} | Precio: $${c.priceUSD} | Stock: ${c.currentStock} | Unidad: ${c.unit}`)
    .join('\n');

  const customersSummary = payload.knownCustomers
    .map((c) => `- ID: ${c.id} | Nombre: ${c.name} (Alias: ${c.alias || ''})`)
    .join('\n');

  const prompt = `
Eres el asistente inteligente de mostrador para el "Cuaderno Digital" de una bodega de abarrotes venezolana.
El bodeguero o cajero escribió o dictó una nota rápida de venta tal como lo haría en su libreta de papel:
"${payload.text}"

Tu tarea es analizar el texto con máxima precisión y extraer:
1. El cliente (si se menciona por nombre, apodo o relación, ej. "María vecina", "Doña Carmen", "Chucho", "Pedro"). Coteja con la lista de clientes conocidos.
2. Si es una venta al fiado / a crédito (ej: "se lo lleva fiado", "anótaselo", "debe", "pasa a pagar el viernes").
3. Los productos y las cantidades compradas (ej: "2 arroz", "1 pasta larga", "medio cartón de huevos", "3 azúcar", "500g queso").
4. Para cada producto, debes emparejarlo con el artículo más adecuado del catálogo de la bodega.

Catálogo de productos disponibles en la bodega:
${catalogSummary}

Clientes registrados en la bodega:
${customersSummary}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Analiza notas de venta rápidas de bodegas venezolanas y retorna un JSON estructurado con cliente identificado, productos con cantidades emparejados al catálogo, y si es fiado.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: {
              type: Type.STRING,
              description: 'Nombre o alias del cliente mencionado, o string vacío si no se menciona ninguno.'
            },
            customerId: {
              type: Type.STRING,
              description: 'ID del cliente si coincide con alguno de la lista conocida, o string vacío.'
            },
            isCreditOrDebt: {
              type: Type.BOOLEAN,
              description: 'Verdadero si el texto indica que se fía, se anota en cuenta, debe o se pagará después.'
            },
            paymentMethodHint: {
              type: Type.STRING,
              description: 'Si se menciona explícitamente el método de pago: "pago_movil", "efectivo_usd", "efectivo_bs", "fiado", o string vacío.'
            },
            confidence: {
              type: Type.STRING,
              description: '"high", "medium" o "low"'
            },
            aiNotes: {
              type: Type.STRING,
              description: 'Breve nota explicativa de lo detectado.'
            },
            items: {
              type: Type.ARRAY,
              description: 'Lista de artículos detectados',
              items: {
                type: Type.OBJECT,
                properties: {
                  rawMention: {
                    type: Type.STRING,
                    description: 'Cómo se mencionó en el texto, ej: "2 arroz Mary"'
                  },
                  productId: {
                    type: Type.STRING,
                    description: 'ID del producto en el catálogo si fue emparejado'
                  },
                  productName: {
                    type: Type.STRING,
                    description: 'Nombre del producto en el catálogo'
                  },
                  productCode: {
                    type: Type.STRING,
                    description: 'Código del producto (SKU), ej: "PAN-001"'
                  },
                  quantity: {
                    type: Type.NUMBER,
                    description: 'Cantidad numérica (ej: 2, 1, 0.5 para medio cartón o medio kilo)'
                  },
                  unit: {
                    type: Type.STRING,
                    description: 'Unidad, ej: "paq.", "Kg", "bot.", "und."'
                  },
                  priceUSD: {
                    type: Type.NUMBER,
                    description: 'Precio unitario en USD según el catálogo'
                  }
                },
                required: ['rawMention', 'productName', 'quantity']
              }
            }
          },
          required: ['isCreditOrDebt', 'items', 'confidence']
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim()) as ParseSaleResponse;
      return parsed;
    }
    return { fallback: true, message: 'Empty response from model' };
  } catch (error) {
    console.error('Gemini error while parsing sale text:', error);
    return { fallback: true, message: String(error) };
  }
}
