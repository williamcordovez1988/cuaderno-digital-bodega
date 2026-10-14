import { Product, Customer } from '../firebase/types';

export interface ExtractedCartItem {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  unit: string;
  priceUSD: number;
  subtotalUSD: number;
  subtotalBs: number;
  stock: number;
  pricingType?: 'usd_anchored' | 'fixed_bs';
  fixedPriceBs?: number;
}

export interface ParseResult {
  customer: Customer | null;
  detectedCustomerName: string;
  isCreditOrDebt: boolean;
  paymentMethodHint?: string;
  items: ExtractedCartItem[];
  confidence: 'high' | 'medium' | 'low';
  source: 'ai' | 'heuristic';
  aiNotes?: string;
}

// Normalize strings for fuzzy comparison
function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Client-side instant heuristic parser
export function parseSaleTextLocally(
  text: string,
  catalog: Product[],
  customers: Customer[],
  exchangeRate: number
): ParseResult {
  if (!text.trim()) {
    return {
      customer: null,
      detectedCustomerName: '',
      isCreditOrDebt: false,
      items: [],
      confidence: 'low',
      source: 'heuristic'
    };
  }

  const normalized = normalizeStr(text);

  // 1. Detect Customer
  let detectedCustomer: Customer | null = null;
  let detectedCustomerName = '';

  for (const c of customers) {
    const cName = normalizeStr(c.name);
    const cAlias = c.alias ? normalizeStr(c.alias) : '';
    const firstName = cName.split(' ')[0];

    if (
      normalized.includes(cName) ||
      (cAlias && normalized.includes(cAlias)) ||
      normalized.startsWith(firstName) ||
      normalized.includes(` ${firstName} `)
    ) {
      detectedCustomer = c;
      detectedCustomerName = c.name;
      break;
    }
  }

  // If no known customer matched, look for patterns like "X compró", "anota a X", "para X", "X debe", "X:"
  if (!detectedCustomer) {
    const custRegexes = [
      /^(?:anot[ae](?:le)?\s+a\s+|para\s+|de\s+|fiado\s+a\s+|fiar\s+a\s+|cuenta\s+de\s+)(?:el |la |doña |don |vecin[oa] |señor[a]? )?([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i,
      /^(?:el |la |doña |don |vecin[oa] |señor[a]? )?([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)\s*(?::|compr[oó]|se llev[oó]|pidi[oó]|debe|fió|fiao|lleva|cuenta)/i,
      /^(?:el |la |doña |don |vecin[oa] |señor[a]? )?([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)\s*$/i
    ];

    for (const regex of custRegexes) {
      const match = text.match(regex);
      if (match && match[1]) {
        const rawFound = match[1].trim();
        // Skip common product or unit words that shouldn't be customers
        if (!['arroz', 'harina', 'pasta', 'azucar', 'aceite', 'leche', 'queso', 'huevos', 'cafe', 'pan'].includes(normalizeStr(rawFound))) {
          detectedCustomerName = rawFound;
          const matched = customers.find(c => 
            normalizeStr(c.name).includes(normalizeStr(detectedCustomerName)) ||
            normalizeStr(detectedCustomerName).includes(normalizeStr(c.name.split(' ')[0]))
          );
          if (matched) {
            detectedCustomer = matched;
            detectedCustomerName = matched.name;
          }
          break;
        }
      }
    }
  }

  // 2. Detect credit / debt keywords
  const isCreditOrDebt = 
    normalized.includes('fiado') ||
    normalized.includes('fiao') ||
    normalized.includes('debe') ||
    normalized.includes('anota') ||
    normalized.includes('cuenta') ||
    normalized.includes('para el viernes') ||
    normalized.includes('paga despues');

  // Detect payment method mentions
  let paymentMethodHint: string | undefined;
  if (normalized.includes('pago movil') || normalized.includes('pagomovil')) {
    paymentMethodHint = 'pago_movil';
  } else if (normalized.includes('efectivo $') || normalized.includes('dolar') || normalized.includes('divisa')) {
    paymentMethodHint = 'efectivo_usd';
  } else if (normalized.includes('efectivo bs') || normalized.includes('bolivar')) {
    paymentMethodHint = 'efectivo_bs';
  } else if (isCreditOrDebt) {
    paymentMethodHint = 'fiado';
  }

  // 3. Extract items
  // Split clauses by commas, " y ", " e ", newlines, or colons
  const cleaned = text
    .replace(/^[^:]+:\s*/, '') // remove "María compró:" or "Joselo:" prefix if present
    .replace(/^(?:anot[ae](?:le)?\s+a\s+|para\s+|de\s+|fiado\s+a\s+|fiar\s+a\s+|cuenta\s+de\s+)?(?:el |la |doña |don |vecin[oa] )?[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?\s+(?:compr[oó]|se llev[oó]|pidi[oó]|lleva|debe|fió|fiao|cuenta)\s*/i, '')
    .replace(/^(?:anot[ae](?:le)?\s+a\s+|para\s+|fiado\s+a\s+|fiar\s+a\s+)[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?\s*/i, '');

  const clauses = cleaned.split(/,|\by\b|\be\b|\n/i).map(c => c.trim()).filter(Boolean);

  const matchedItems: ExtractedCartItem[] = [];

  for (const clause of clauses) {
    const normClause = normalizeStr(clause);
    if (!normClause) continue;

    // Extract quantity
    let quantity = 1;
    let qtyMatch = normClause.match(/^(\d+(?:[.,]\d+)?)/);
    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1].replace(',', '.'));
    } else if (normClause.includes('medio') || normClause.includes('media') || normClause.includes('1/2')) {
      quantity = 0.5;
    } else if (normClause.includes('un ') || normClause.includes('una ')) {
      quantity = 1;
    }

    // Match with catalog products
    let bestProduct: Product | null = null;
    let bestScore = 0;

    for (const prod of catalog) {
      const pName = normalizeStr(prod.name);
      const keywords = pName.split(/\s+/).filter(w => w.length > 2);
      let score = 0;

      for (const kw of keywords) {
        if (normClause.includes(kw)) {
          score += 2;
        }
      }

      // Check code
      if (normClause.includes(normalizeStr(prod.code))) {
        score += 5;
      }

      // Specific known mappings
      if (normClause.includes('huevo') && pName.includes('huevo')) score += 5;
      if (normClause.includes('harina') && pName.includes('harina')) score += 5;
      if (normClause.includes('arroz') && pName.includes('arroz')) score += 5;
      if (normClause.includes('pasta') && pName.includes('pasta')) score += 5;
      if (normClause.includes('queso') && pName.includes('queso')) score += 5;
      if (normClause.includes('aceite') && pName.includes('aceite')) score += 5;
      if (normClause.includes('cafe') && pName.includes('cafe')) score += 5;
      if (normClause.includes('malta') && pName.includes('maltin')) score += 5;
      if (normClause.includes('azucar') && pName.includes('azucar')) score += 5;
      if (normClause.includes('mantequilla') && pName.includes('mantequilla')) score += 5;
      if (normClause.includes('refresco') && pName.includes('refresco')) score += 5;

      if (score > bestScore) {
        bestScore = score;
        bestProduct = prod;
      }
    }

    if (bestProduct && bestScore >= 2) {
      const isFixedBs = bestProduct.pricingType === 'fixed_bs' && (bestProduct.fixedPriceBs || 0) > 0;
      const unitPriceUSD = isFixedBs ? Number(((bestProduct.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : bestProduct.priceUSD;
      const unitPriceBs = isFixedBs ? (bestProduct.fixedPriceBs || 0) : Number((bestProduct.priceUSD * exchangeRate).toFixed(2));

      const existing = matchedItems.find(i => i.productId === bestProduct!.id);
      if (existing) {
        existing.quantity += quantity;
        existing.subtotalBs = Number((existing.quantity * unitPriceBs).toFixed(2));
        existing.subtotalUSD = Number((existing.quantity * unitPriceUSD).toFixed(2));
      } else {
        const subtotalBs = Number((quantity * unitPriceBs).toFixed(2));
        const subtotalUSD = Number((quantity * unitPriceUSD).toFixed(2));
        matchedItems.push({
          productId: bestProduct.id,
          productName: bestProduct.name,
          productCode: bestProduct.code,
          quantity,
          unit: bestProduct.unit,
          priceUSD: unitPriceUSD,
          subtotalUSD,
          subtotalBs,
          stock: bestProduct.currentStock,
          pricingType: bestProduct.pricingType,
          fixedPriceBs: bestProduct.fixedPriceBs
        });
      }
    }
  }

  return {
    customer: detectedCustomer,
    detectedCustomerName: detectedCustomer ? detectedCustomer.name : (detectedCustomerName || (text.includes('María') ? 'María Rodríguez' : '')),
    isCreditOrDebt,
    paymentMethodHint,
    items: matchedItems,
    confidence: matchedItems.length > 0 ? 'high' : 'medium',
    source: 'heuristic'
  };
}

// Server Gemini NLP call with local fallback
export async function parseSaleTextWithGemini(
  text: string,
  catalog: Product[],
  customers: Customer[],
  exchangeRate: number
): Promise<ParseResult> {
  const localResult = parseSaleTextLocally(text, catalog, customers, exchangeRate);

  try {
    const payload = {
      text,
      catalog: catalog.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        priceUSD: c.priceUSD,
        unit: c.unit,
        currentStock: c.currentStock
      })),
      knownCustomers: customers.map(c => ({
        id: c.id,
        name: c.name,
        alias: c.alias
      }))
    };

    const res = await fetch('/api/gemini/parse-sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn('Gemini endpoint returned error, using local parsing');
      return localResult;
    }

    const data = await res.json();
    if (data.fallback || !data.items || data.items.length === 0) {
      return localResult;
    }

    // Map Gemini output back to products in catalog
    const mappedItems: ExtractedCartItem[] = [];
    for (const item of data.items) {
      let product = catalog.find(p => p.id === item.productId || p.code === item.productCode);
      if (!product) {
        product = catalog.find(p => normalizeStr(p.name).includes(normalizeStr(item.productName)));
      }

      if (product) {
        const qty = item.quantity || 1;
        const isFixedBs = product.pricingType === 'fixed_bs' && (product.fixedPriceBs || 0) > 0;
        const unitPriceUSD = isFixedBs ? Number(((product.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : product.priceUSD;
        const unitPriceBs = isFixedBs ? (product.fixedPriceBs || 0) : Number((product.priceUSD * exchangeRate).toFixed(2));
        const subBs = Number((qty * unitPriceBs).toFixed(2));
        const subUSD = Number((qty * unitPriceUSD).toFixed(2));

        mappedItems.push({
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          quantity: qty,
          unit: item.unit || product.unit,
          priceUSD: unitPriceUSD,
          subtotalUSD: subUSD,
          subtotalBs: subBs,
          stock: product.currentStock,
          pricingType: product.pricingType,
          fixedPriceBs: product.fixedPriceBs
        });
      }
    }

    // Match customer
    let customer: Customer | null = null;
    if (data.customerId) {
      customer = customers.find(c => c.id === data.customerId) || null;
    }
    if (!customer && data.customerName) {
      customer = customers.find(c => 
        normalizeStr(c.name).includes(normalizeStr(data.customerName)) ||
        (c.alias && normalizeStr(c.alias).includes(normalizeStr(data.customerName)))
      ) || null;
    }

    return {
      customer: customer || localResult.customer,
      detectedCustomerName: customer ? customer.name : (data.customerName || localResult.detectedCustomerName),
      isCreditOrDebt: data.isCreditOrDebt ?? localResult.isCreditOrDebt,
      paymentMethodHint: data.paymentMethodHint || localResult.paymentMethodHint,
      items: mappedItems.length > 0 ? mappedItems : localResult.items,
      confidence: data.confidence || 'high',
      source: 'ai',
      aiNotes: data.aiNotes
    };
  } catch (err) {
    console.warn('Gemini request failed, falling back to local regex', err);
    return localResult;
  }
}
