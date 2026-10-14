import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, Customer, Sale, PaymentMethod } from '../firebase/types';
import { ExtractedCartItem, parseSaleTextLocally, parseSaleTextWithGemini } from '../services/nlpService';

interface RegistroDiarioProps {
  products: Product[];
  customers: Customer[];
  recentSales: Sale[];
  exchangeRate: number;
  onUpdateExchangeRate: (rate: number) => void;
  onCompleteSale: (
    saleData: {
      customerName: string;
      customerId?: string;
      items: ExtractedCartItem[];
      totalUSD: number;
      totalBs: number;
      exchangeRate: number;
      paymentMethod: PaymentMethod;
      status: 'saldada' | 'fiado';
      notes?: string;
    },
    customer: Customer | null
  ) => Promise<void>;
  onShowToast: (msg: string, icon?: string) => void;
  onOpenCashChangeModal?: (totalUSD: number, totalBs: number) => void;
  isEmployee?: boolean;
}

export const RegistroDiario: React.FC<RegistroDiarioProps> = ({
  products,
  customers,
  recentSales,
  exchangeRate,
  onUpdateExchangeRate,
  onCompleteSale,
  onShowToast,
  onOpenCashChangeModal,
  isEmployee = false
}) => {
  // Input note state
  const [noteText, setNoteText] = useState(
    'María compró 2 arroz Mary, 1 pasta Primor, 1 Harina PAN y medio cartón de huevos'
  );
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Cart / Detected state
  const [cartItems, setCartItems] = useState<ExtractedCartItem[]>([]);
  const [identifiedCustomer, setIdentifiedCustomer] = useState<Customer | null>(null);
  const [customerNameText, setCustomerNameText] = useState('María Rodríguez');
  const [isFiadoDetected, setIsFiadoDetected] = useState(false);

  // Inline Tasa editing
  const [tasaInput, setTasaInput] = useState(exchangeRate.toFixed(2));

  // Manual Add Product Modal or Selector
  const [showAddManual, setShowAddManual] = useState(false);
  const [selectedAddProductId, setSelectedAddProductId] = useState('');

  // Quick Inventory Search in Cuaderno Diario
  const [quickInventorySearch, setQuickInventorySearch] = useState('');

  const quickSearchResults = useMemo(() => {
    if (!quickInventorySearch.trim()) return [];
    const term = quickInventorySearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
  }, [products, quickInventorySearch]);

  // Speech recognition ref
  const recognitionRef = useRef<any>(null);

  // Parse text whenever noteText changes (debounced local heuristic)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (noteText.trim()) {
        const local = parseSaleTextLocally(noteText, products, customers, exchangeRate);
        setCartItems(local.items);
        setIdentifiedCustomer(local.customer);
        if (local.detectedCustomerName) {
          setCustomerNameText(local.detectedCustomerName);
        }
        setIsFiadoDetected(local.isCreditOrDebt);
      } else {
        setCartItems([]);
        setIdentifiedCustomer(null);
        setCustomerNameText('Consumidor Final');
        setIsFiadoDetected(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [noteText, products, customers, exchangeRate]);

  // Handle Gemini AI deep re-processing
  const handleReprocessWithGemini = async () => {
    if (!noteText.trim()) {
      onShowToast('Escribe o dicta una venta en la hoja primero', 'error');
      return;
    }

    setIsProcessingAI(true);
    try {
      const res = await parseSaleTextWithGemini(noteText, products, customers, exchangeRate);
      setCartItems(res.items);
      setIdentifiedCustomer(res.customer);
      if (res.detectedCustomerName) {
        setCustomerNameText(res.detectedCustomerName);
      }
      setIsFiadoDetected(res.isCreditOrDebt);
      onShowToast(
        `¡IA completada! ${res.items.length} productos identificados para ${res.detectedCustomerName || 'el cliente'}.`,
        'auto_awesome'
      );
    } catch (e) {
      console.warn('Gemini error', e);
      onShowToast('Reconocimiento local actualizado.', 'check');
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Web Speech API Voice Dictation
  const toggleVoiceDictation = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onShowToast('Tu navegador no soporta dictado por voz nativo.', 'warning');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-VE';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        onShowToast('Escuchando... habla claramente', 'mic');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setNoteText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event);
        setIsListening(false);
        onShowToast('Error o tiempo límite en dictado por voz', 'warning');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  // Quantity Steppers (+ / - buttons)
  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const current = item.quantity || 0;
          const newQty = Math.max(1, Number((current + delta).toFixed(2)));
          const isFixed = item.pricingType === 'fixed_bs' && (item.fixedPriceBs || 0) > 0;
          const unitPriceBs = isFixed ? (item.fixedPriceBs || 0) : Number((item.priceUSD * exchangeRate).toFixed(2));
          const unitPriceUSD = isFixed ? Number(((item.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : item.priceUSD;
          const subBs = Number((newQty * unitPriceBs).toFixed(2));
          const subUSD = Number((newQty * unitPriceUSD).toFixed(2));
          return {
            ...item,
            quantity: newQty,
            priceUSD: unitPriceUSD,
            subtotalUSD: subUSD,
            subtotalBs: subBs
          };
        }
        return item;
      })
    );
  };

  // Direct keyboard quantity editing (typing directly, erasing, numbers like '10')
  const handleDirectQuantityChange = (productId: string, valStr: string) => {
    const parsed = parseFloat(valStr);
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const qty = isNaN(parsed) ? 0 : Math.max(0, parsed);
          const isFixed = item.pricingType === 'fixed_bs' && (item.fixedPriceBs || 0) > 0;
          const unitPriceBs = isFixed ? (item.fixedPriceBs || 0) : Number((item.priceUSD * exchangeRate).toFixed(2));
          const unitPriceUSD = isFixed ? Number(((item.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : item.priceUSD;
          const subBs = Number((qty * unitPriceBs).toFixed(2));
          const subUSD = Number((qty * unitPriceUSD).toFixed(2));
          return {
            ...item,
            quantity: qty,
            priceUSD: unitPriceUSD,
            subtotalUSD: subUSD,
            subtotalBs: subBs
          };
        }
        return item;
      })
    );
  };

  const handleQuantityBlur = (productId: string) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const qty = item.quantity <= 0 ? 1 : item.quantity;
          const isFixed = item.pricingType === 'fixed_bs' && (item.fixedPriceBs || 0) > 0;
          const unitPriceBs = isFixed ? (item.fixedPriceBs || 0) : Number((item.priceUSD * exchangeRate).toFixed(2));
          const unitPriceUSD = isFixed ? Number(((item.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : item.priceUSD;
          const subBs = Number((qty * unitPriceBs).toFixed(2));
          const subUSD = Number((qty * unitPriceUSD).toFixed(2));
          return {
            ...item,
            quantity: qty,
            priceUSD: unitPriceUSD,
            subtotalUSD: subUSD,
            subtotalBs: subBs
          };
        }
        return item;
      })
    );
  };

  // Remove item
  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((i) => i.productId !== productId));
    onShowToast('Producto removido');
  };

  // Add manual product to cart
  const handleAddManualProduct = () => {
    if (!selectedAddProductId) return;
    const prod = products.find((p) => p.id === selectedAddProductId);
    if (!prod) return;

    setCartItems((prev) => {
      const isFixed = prod.pricingType === 'fixed_bs' && (prod.fixedPriceBs || 0) > 0;
      const unitPriceBs = isFixed ? (prod.fixedPriceBs || 0) : Number((prod.priceUSD * exchangeRate).toFixed(2));
      const unitPriceUSD = isFixed ? Number(((prod.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : prod.priceUSD;

      const exists = prev.find((i) => i.productId === prod.id);
      if (exists) {
        return prev.map((i) => {
          if (i.productId === prod.id) {
            const newQty = i.quantity + 1;
            const subBs = Number((newQty * unitPriceBs).toFixed(2));
            const subUSD = Number((newQty * unitPriceUSD).toFixed(2));
            return {
              ...i,
              quantity: newQty,
              priceUSD: unitPriceUSD,
              subtotalUSD: subUSD,
              subtotalBs: subBs
            };
          }
          return i;
        });
      }

      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          productCode: prod.code,
          quantity: 1,
          unit: prod.unit,
          priceUSD: unitPriceUSD,
          subtotalUSD: unitPriceUSD,
          subtotalBs: unitPriceBs,
          stock: prod.currentStock,
          pricingType: prod.pricingType,
          fixedPriceBs: prod.fixedPriceBs
        }
      ];
    });

    setSelectedAddProductId('');
    setShowAddManual(false);
    onShowToast(`Agregado: ${prod.name}`);
  };

  // Add Product from Quick Inventory Search directly into sale cart
  const handleAddProductFromQuickSearch = (prod: Product) => {
    const isFixed = prod.pricingType === 'fixed_bs' && (prod.fixedPriceBs || 0) > 0;
    const unitPriceBs = isFixed ? (prod.fixedPriceBs || 0) : Number((prod.priceUSD * exchangeRate).toFixed(2));
    const unitPriceUSD = isFixed ? Number(((prod.fixedPriceBs || 0) / exchangeRate).toFixed(2)) : prod.priceUSD;

    setCartItems((prev) => {
      const exists = prev.find((i) => i.productId === prod.id);
      if (exists) {
        return prev.map((i) => {
          if (i.productId === prod.id) {
            const newQty = i.quantity + 1;
            const subBs = Number((newQty * unitPriceBs).toFixed(2));
            const subUSD = Number((newQty * unitPriceUSD).toFixed(2));
            return {
              ...i,
              quantity: newQty,
              priceUSD: unitPriceUSD,
              subtotalUSD: subUSD,
              subtotalBs: subBs
            };
          }
          return i;
        });
      }

      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          productCode: prod.code,
          quantity: 1,
          unit: prod.unit,
          priceUSD: unitPriceUSD,
          subtotalUSD: unitPriceUSD,
          subtotalBs: unitPriceBs,
          stock: prod.currentStock,
          pricingType: prod.pricingType,
          fixedPriceBs: prod.fixedPriceBs
        }
      ];
    });

    onShowToast(`+1 ${prod.name} agregado a la venta (${prod.currentStock} disponibles)`, 'add_shopping_cart');
  };

  // Calculate totals
  const totalUSD = Number(cartItems.reduce((acc, item) => acc + item.subtotalUSD, 0).toFixed(2));
  const totalBs = Number((totalUSD * exchangeRate).toFixed(2));

  // Process Checkout (Direct processing with auto-registration of new customers)
  const handleCheckout = async (method: PaymentMethod) => {
    if (cartItems.length === 0) {
      onShowToast('No hay productos en la lista para cobrar', 'warning');
      return;
    }

    const isFiado = method === 'fiado';
    // Clean and determine customer name
    let clientName = (customerNameText.trim() || (isFiado ? 'Cliente Fiado' : 'Consumidor Final'));

    // Search existing customer in list to prevent duplicate customer records
    let targetCustomer = identifiedCustomer;
    if (!targetCustomer && clientName && clientName.toLowerCase() !== 'consumidor final') {
      const normClient = clientName.toLowerCase().trim();
      targetCustomer = customers.find(
        (c) =>
          c.name.toLowerCase().trim() === normClient ||
          (c.alias && c.alias.toLowerCase().trim() === normClient) ||
          (normClient.length >= 3 && (c.name.toLowerCase().includes(normClient) || normClient.includes(c.name.toLowerCase())))
      ) || null;
    }

    if (targetCustomer) {
      clientName = targetCustomer.name;
    }

    await onCompleteSale(
      {
        customerName: clientName,
        customerId: targetCustomer?.id,
        items: cartItems,
        totalUSD,
        totalBs,
        exchangeRate,
        paymentMethod: method,
        status: isFiado ? 'fiado' : 'saldada',
        notes: noteText
      },
      targetCustomer
    );

    // Reset notebook for next transaction
    setNoteText('');
    setCartItems([]);
    setIdentifiedCustomer(null);
    setCustomerNameText('');
    setIsFiadoDetected(false);
  };

  // Shift & Date calculations
  const todayStr = new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());

  const currentHour = new Date().getHours();
  const shiftText = currentHour < 14 ? 'Turno Mañana' : 'Turno Tarde';

  // Metrics from recent sales
  const salesTodayCount = recentSales.length;
  const totalPaidTodayUSD = recentSales
    .filter((s) => s.status === 'saldada')
    .reduce((acc, s) => acc + s.totalUSD, 0);
  const totalFiadosTodayUSD = recentSales
    .filter((s) => s.status === 'fiado')
    .reduce((acc, s) => acc + s.totalUSD, 0);

  return (
    <div className="flex flex-col gap-6">
      
      {/* Top Banner: Day, Shift & Exchange Rate */}
      <section className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-[#E8E2D8]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[#554336] text-xs font-bold uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">calendar_today</span>
            <span className="capitalize">{todayStr}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#dbc2b0]" />
            <span className="text-[#006c4a] font-bold">{shiftText}</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-[#111c2d] tracking-tight mt-1">
            Registro Diario de Ventas
          </h1>
          <p className="text-xs text-[#554336]">
            Mostrador en vivo con reconocimiento de lenguaje natural y conversión automática en Bolívares.
          </p>
        </div>

        {/* Tasa del Día Widget */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-[#f0f3ff] px-4 py-2 rounded-xl border border-[#dbc2b0]/30 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#8d4b00] text-[20px]">currency_exchange</span>
            <span className="text-xs font-bold text-[#111c2d]">Tasa Oficial:</span>
          </div>
          {isEmployee ? (
            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-lg border border-[#dbc2b0]/40 font-numeric-tally font-extrabold text-xs text-[#111c2d]">
              <span>{exchangeRate.toFixed(2)} Bs/$</span>
              <span className="text-[10px] text-[#00714e] font-bold bg-[#82f5c1]/30 px-1.5 py-0.2 rounded">BCV Fijada</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-[#dbc2b0]/40">
                <span className="text-xs font-bold text-[#554336]">Bs</span>
                <input
                  type="number"
                  step="0.05"
                  value={tasaInput}
                  onChange={(e) => setTasaInput(e.target.value)}
                  className="w-16 text-xs font-extrabold text-[#111c2d] bg-transparent focus:outline-none text-right font-numeric-tally"
                />
                <span className="text-[11px] text-[#554336]">/$</span>
              </div>
              <button
                onClick={() => {
                  const val = parseFloat(tasaInput);
                  if (!isNaN(val) && val > 0) {
                    onUpdateExchangeRate(val);
                    onShowToast(`Tasa del día actualizada a ${val.toFixed(2)} Bs/$`);
                  }
                }}
                type="button"
                className="px-3 py-1 rounded-lg bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">check</span>
                Actualizar
              </button>
            </>
          )}
        </div>
      </section>

      {/* Quick Ledger Stats Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cobrado Hoy */}
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-[#E8E2D8]">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#554336] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#006c4a]" />
              Total Cobrado Hoy
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black font-heading text-[#111c2d] font-numeric-tally">
                ${totalPaidTodayUSD.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-[#006c4a] font-numeric-tally">
                {(totalPaidTodayUSD * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#85f8c4]/30 flex items-center justify-center text-[#006c4a]">
            <span className="material-symbols-outlined text-[26px]">payments</span>
          </div>
        </div>

        {/* Fiados Activos */}
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-[#E8E2D8]">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ba1a1a]" />
              Total en Fiados
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black font-heading text-[#ba1a1a] font-numeric-tally">
                ${totalFiadosTodayUSD.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-[#ba1a1a]/80 font-numeric-tally">
                {(totalFiadosTodayUSD * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#ffdad6]/50 flex items-center justify-center text-[#ba1a1a]">
            <span className="material-symbols-outlined text-[26px]">menu_book</span>
          </div>
        </div>

        {/* Operaciones del Turno */}
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-[#E8E2D8]">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#554336] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0051d5]" />
              Operaciones del Turno
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black font-heading text-[#111c2d] font-numeric-tally">
                {salesTodayCount} ventas
              </span>
              <span className="text-xs font-semibold text-[#554336]">
                Promedio: ${salesTodayCount > 0 ? (totalPaidTodayUSD / salesTodayCount).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#dbe1ff]/50 flex items-center justify-center text-[#0051d5]">
            <span className="material-symbols-outlined text-[26px]">receipt_long</span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda Rápida de Inventario en el Cuaderno Diario */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">manage_search</span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-extrabold text-sm text-[#111c2d]">
                  Búsqueda Rápida de Inventario & Precios
                </h3>
                <span className="px-2 py-0.2 rounded-full bg-[#82f5c1]/50 text-[#006c4a] text-[10px] font-bold">
                  En Vivo
                </span>
              </div>
              <p className="text-[11px] text-[#554336]">
                Consulta stock al instante y agrega productos directamente al mostrador
              </p>
            </div>
          </div>

          {/* Botones de búsqueda rápida con 1 clic */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[10px] font-bold text-[#887364] uppercase tracking-wider mr-0.5 shrink-0">
              Rápidos:
            </span>
            {['Arroz', 'Pasta', 'Azúcar', 'Harina', 'Café', 'Huevos'].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setQuickInventorySearch(chip)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  quickInventorySearch.toLowerCase() === chip.toLowerCase()
                    ? 'bg-[#8d4b00] text-white shadow-xs'
                    : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e4e9f5]'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Campo de Búsqueda */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#887364] text-[20px]">
            search
          </span>
          <input
            type="text"
            value={quickInventorySearch}
            onChange={(e) => setQuickInventorySearch(e.target.value)}
            placeholder="Buscar producto por nombre (ejemplo: 'arroz', 'pasta', 'azúcar')..."
            className="w-full pl-11 pr-10 py-2.5 rounded-xl bg-[#f0f3ff] text-[#111c2d] placeholder:text-[#554336]/70 text-xs font-medium border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
          />
          {quickInventorySearch && (
            <button
              type="button"
              onClick={() => setQuickInventorySearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#887364] hover:text-[#111c2d] cursor-pointer"
              title="Limpiar búsqueda"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Panel de Resultados en Tiempo Real */}
        {quickInventorySearch.trim() && (
          <div className="flex flex-col gap-2 pt-1 border-t border-[#F0EBE3] animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#554336] font-medium">
                Encontrados <strong>{quickSearchResults.length}</strong> productos para "{quickInventorySearch}":
              </span>
              {quickSearchResults.filter((p: Product) => p.currentStock <= 5).length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] font-bold text-[11px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  {quickSearchResults.filter((p: Product) => p.currentStock <= 5).length} con Stock Bajo
                </span>
              )}
            </div>

            {quickSearchResults.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#f0f3ff]/60 text-center text-xs text-[#554336] italic border border-[#dbc2b0]/20">
                No hay productos en inventario que coincidan con "{quickInventorySearch}".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {quickSearchResults.map((prod: Product) => {
                  const isZero = prod.currentStock <= 0;
                  const isLowStock = prod.currentStock <= 5;
                  const priceBs =
                    prod.pricingType === 'fixed_bs' && (prod.fixedPriceBs || 0) > 0
                      ? (prod.fixedPriceBs || 0)
                      : prod.priceUSD * exchangeRate;
                  const priceUSD =
                    prod.pricingType === 'fixed_bs' && (prod.fixedPriceBs || 0) > 0
                      ? Number(((prod.fixedPriceBs || 0) / exchangeRate).toFixed(2))
                      : prod.priceUSD;

                  return (
                    <div
                      key={prod.id}
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-2 transition-all shadow-2xs ${
                        isZero
                          ? 'bg-[#ffdad6]/25 border-[#ba1a1a]/30'
                          : isLowStock
                          ? 'bg-[#fff5f2] border-[#ba1a1a]/40 ring-1 ring-[#ba1a1a]/20'
                          : 'bg-white border-[#E8E2D8] hover:border-[#8d4b00]/30'
                      }`}
                    >
                      <div>
                        {/* Nombre del producto */}
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-heading font-bold text-xs text-[#111c2d] truncate" title={prod.name}>
                            {prod.name}
                          </h4>
                          <span className="font-mono text-[10px] text-[#8d4b00] font-semibold shrink-0">
                            {prod.code}
                          </span>
                        </div>

                        {/* Cantidad disponible en stock & Alerta visual */}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {isZero ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#ba1a1a] text-white text-[10px] font-black tracking-wide flex items-center gap-1 shadow-2xs">
                              <span className="material-symbols-outlined text-[12px]">block</span>
                              Agotado (0 unidades restantes)
                            </span>
                          ) : isLowStock ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/40 text-[10px] font-black tracking-wide flex items-center gap-1 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-pulse" />
                              <span className="material-symbols-outlined text-[12px]">warning</span>
                              Stock Bajo: {prod.currentStock} unidades restantes
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-[#85f8c4]/40 text-[#004d34] border border-[#006c4a]/20 text-[10px] font-extrabold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#006c4a]" />
                              {prod.name.split(' ')[0]}: {prod.currentStock} unidades restantes
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Precio y Botón + Añadir */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#F0EBE3] mt-1">
                        <div className="flex flex-col">
                          <span className="font-black text-xs text-[#111c2d] font-numeric-tally">
                            ${priceUSD.toFixed(2)} USD
                          </span>
                          <span className="text-[10px] font-bold text-[#006c4a] font-numeric-tally">
                            {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddProductFromQuickSearch(prod)}
                          disabled={isZero}
                          className="px-2.5 py-1 rounded-lg bg-[#8d4b00] hover:bg-[#b15f00] text-white text-[11px] font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                          title="Añadir a la cuenta actual"
                        >
                          <span className="material-symbols-outlined text-[14px]">add_shopping_cart</span>
                          <span>+ Añadir</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Central Notebook Workspace (2-Column Ledger Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: The Interactive Digital Notebook Sheet (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-[#FAF8F5] rounded-2xl shadow-sm border border-[#E2D9CC] overflow-hidden">
          
          {/* Notebook Sheet Binding Header */}
          <div className="px-5 py-3.5 bg-[#F4EFEA] border-b border-[#E2D9CC] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#8d4b00] text-[22px]">draw</span>
              <div>
                <h2 className="font-heading font-bold text-base text-[#111c2d] leading-tight">
                  Anotar Venta Rápida
                </h2>
                <p className="text-xs text-[#554336]">Cuaderno de mostrador en tiempo real</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReprocessWithGemini}
                disabled={isProcessingAI}
                className="px-2.5 py-1 rounded-full bg-[#85f8c4] hover:bg-[#82f5c1] text-[#002114] text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
              >
                <span className={`material-symbols-outlined text-[15px] ${isProcessingAI ? 'animate-spin' : ''}`}>
                  {isProcessingAI ? 'sync' : 'auto_awesome'}
                </span>
                <span>{isProcessingAI ? 'Analizando con Gemini...' : 'IA Reconocimiento'}</span>
              </button>
            </div>
          </div>

          {/* Realistic Ruled Lined Notepad Surface */}
          <div className="p-5 flex flex-col gap-4 relative">
            <div className="relative bg-white rounded-xl p-4 shadow-sm border border-[#E8E2D8]">
              {/* Subtle red margin line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#ba1a1a]/20 pointer-events-none" />
              
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleReprocessWithGemini();
                  }
                }}
                rows={4}
                placeholder="Escribe libremente como en tu libreta: 'María compró 2 arroz Mary, 1 pasta Primor y medio cartón de huevos'..."
                className="w-full bg-transparent pl-8 font-sans text-base text-[#111c2d] focus:outline-none resize-none leading-relaxed placeholder:text-[#887364]/60 font-medium"
              />

              <div className="mt-2 pt-2 pl-8 flex items-center justify-between text-[#554336] text-xs border-t border-[#F0EBE3]">
                <span className="flex items-center gap-1 text-[#554336]">
                  <span className="material-symbols-outlined text-[15px] text-[#8d4b00]">tips_and_updates</span>
                  Detecta cliente, productos, unidades y si es fiado automáticamente.
                </span>
                <span className="opacity-60 hidden sm:inline">Ctrl + Enter para IA</span>
              </div>
            </div>

            {/* Micro-actions Under Notepad */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all ${
                    isListening
                      ? 'bg-[#ffdad6] text-[#ba1a1a] ring-2 ring-[#ba1a1a]'
                      : 'bg-white hover:bg-[#f0f3ff] text-[#111c2d] border border-[#E8E2D8]'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isListening ? 'animate-pulse text-[#ba1a1a]' : 'text-[#8d4b00]'}`}>
                    mic
                  </span>
                  <span>{isListening ? 'Escuchando...' : 'Dictar por Voz'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNoteText('')}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-[#554336] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/20 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">backspace</span>
                  <span>Limpiar</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleReprocessWithGemini}
                disabled={isProcessingAI}
                className="px-4 py-2 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                <span>Reprocesar Texto</span>
              </button>
            </div>

            {/* Customer Identification Banner (Auto-Extracted) */}
            <div className="mt-1 p-3.5 rounded-xl bg-[#F5EFEB] border border-[#E2D9CC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] flex items-center justify-center text-[#8d4b00] font-bold shrink-0">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#554336] uppercase tracking-wider block">
                    Cliente Identificado
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customerNameText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerNameText(val);
                        const match = customers.find(c => c.name.toLowerCase().includes(val.toLowerCase()));
                        setIdentifiedCustomer(match || null);
                      }}
                      placeholder="Nombre del cliente (ej. Joselo vecino)..."
                      className="font-heading font-bold text-base text-[#111c2d] bg-transparent border-b border-[#8d4b00]/30 focus:border-[#8d4b00] focus:outline-none"
                    />
                    {identifiedCustomer && (
                      <span className="w-2 h-2 rounded-full bg-[#006c4a]" title="Cliente registrado en sistema" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {identifiedCustomer ? (
                  <>
                    <span className="px-2 py-0.5 rounded-full bg-[#82f5c1] text-[#00714e] text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">verified</span>
                      Cliente Frecuente
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                        identifiedCustomer.currentDebtUSD > 0
                          ? 'bg-[#ffdad6] text-[#ba1a1a]'
                          : 'bg-white text-[#006c4a]'
                      }`}
                    >
                      {identifiedCustomer.currentDebtUSD > 0
                        ? `Debe: $${identifiedCustomer.currentDebtUSD.toFixed(2)}`
                        : 'Sin deuda previa'}
                    </span>
                  </>
                ) : customerNameText.trim() && customerNameText.trim().toLowerCase() !== 'consumidor final' ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-xs font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">person_add</span>
                    Nuevo Cliente ({customerNameText.trim()}) • Registro automático
                  </span>
                ) : (
                  <span className="text-xs text-[#554336] font-medium">
                    Consumidor Final • Mostrador directo
                  </span>
                )}
              </div>
            </div>

            {/* Quick customer picker dropdown if not matched */}
            {!identifiedCustomer && customers.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-1">
                <span className="text-[11px] font-bold text-[#554336] shrink-0">Sugerir:</span>
                {customers.slice(0, 5).map((cust) => (
                  <button
                    key={cust.id}
                    onClick={() => {
                      setIdentifiedCustomer(cust);
                      setCustomerNameText(cust.name);
                    }}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-[#ffdcc3] text-[#111c2d] border border-[#E8E2D8] whitespace-nowrap text-xs transition-colors"
                  >
                    {cust.name}
                  </button>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* Right Column: Smart Detected Items Cart & Summation (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl shadow-sm border border-[#E8E2D8] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8] mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#006c4a] text-[22px]">
                playlist_add_check
              </span>
              <h3 className="font-heading font-bold text-base text-[#111c2d]">
                Artículos Reconocidos
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#111c2d] text-xs font-bold">
              {cartItems.length} productos
            </span>
          </div>

          {/* Cart Items List */}
          <div className="flex flex-col gap-2 mb-4 max-h-[320px] overflow-y-auto pr-1">
            {cartItems.length === 0 ? (
              <div className="py-8 text-center text-[#554336] flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[32px] text-[#887364]/40">
                  shopping_cart
                </span>
                <p className="text-xs font-medium">
                  Escribe en la hoja de la izquierda o agrega productos manualmente para armar la cuenta.
                </p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div
                  key={item.productId}
                  className="p-3 rounded-xl bg-[#f0f3ff]/60 border border-[#dbc2b0]/20 flex items-center justify-between gap-3 hover:bg-[#f0f3ff] transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#111c2d] truncate">
                        {item.productName}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#82f5c1]/40 text-[#00714e] font-semibold shrink-0">
                        Stock: {item.stock}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#554336]">
                      {item.unit} • ${item.priceUSD.toFixed(2)} c/u
                    </span>
                  </div>

                  {/* Quantity Stepper with Editable Input */}
                  <div className="flex items-center gap-0.5 sm:gap-1 bg-white px-1 py-0.5 rounded-lg border border-[#dbc2b0]/30 shadow-xs">
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.productId, -1)}
                      className="w-6 h-6 flex items-center justify-center text-[#111c2d] hover:bg-[#f0f3ff] active:bg-[#e7eeff] rounded font-bold text-sm transition-colors cursor-pointer"
                      title="Restar 1"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => handleDirectQuantityChange(item.productId, e.target.value)}
                      onBlur={() => handleQuantityBlur(item.productId)}
                      onFocus={(e) => e.target.select()}
                      className="w-10 sm:w-12 text-center text-xs font-bold text-[#111c2d] font-numeric-tally bg-transparent focus:bg-[#f0f3ff] rounded py-0.5 border border-transparent focus:border-[#8d4b00] focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="1"
                      title="Escribe la cantidad deseada directamente con el teclado"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.productId, 1)}
                      className="w-6 h-6 flex items-center justify-center text-[#111c2d] hover:bg-[#f0f3ff] active:bg-[#e7eeff] rounded font-bold text-sm transition-colors cursor-pointer"
                      title="Sumar 1"
                    >
                      +
                    </button>
                  </div>

                  {/* Price */}
                  <div className="flex flex-col text-right min-w-[75px] shrink-0">
                    <span className="font-extrabold text-xs text-[#111c2d] font-numeric-tally">
                      ${item.subtotalUSD.toFixed(2)}
                    </span>
                    <span className="text-[10px] font-bold text-[#006c4a] font-numeric-tally">
                      {item.subtotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                    </span>
                  </div>

                  {/* Delete Item */}
                  <button
                    onClick={() => handleRemoveItem(item.productId)}
                    className="p-1 text-[#887364] hover:text-[#ba1a1a] transition-colors"
                    title="Eliminar"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Quick Add Extra Item Button */}
          {showAddManual ? (
            <div className="p-3 mb-4 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/30 flex flex-col gap-2">
              <span className="text-xs font-bold text-[#111c2d]">Seleccionar Producto del Catálogo:</span>
              <select
                value={selectedAddProductId}
                onChange={(e) => setSelectedAddProductId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-[#dbc2b0] focus:outline-none focus:ring-1 focus:ring-[#8d4b00]"
              >
                <option value="">-- Elige un producto --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - ${p.priceUSD.toFixed(2)} (Stock: {p.currentStock})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddManual(false)}
                  className="px-2.5 py-1 text-xs text-[#554336] hover:underline"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddManualProduct}
                  disabled={!selectedAddProductId}
                  className="px-3 py-1 rounded-lg bg-[#8d4b00] text-white text-xs font-bold disabled:opacity-50"
                >
                  Agregar a la cuenta
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddManual(true)}
              type="button"
              className="w-full py-2 mb-4 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-[#554336] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-[#dbc2b0]/20"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>+ Agregar producto manual</span>
            </button>
          )}

          {/* Totals Panel */}
          <div className="p-4 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/30 flex flex-col gap-1 mb-4">
            <div className="flex items-center justify-between text-[#554336] text-xs font-semibold">
              <span>Subtotal {cartItems.length} ítems:</span>
              <span>${totalUSD.toFixed(2)} USD (Exento IGTF)</span>
            </div>
            <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-[#dbc2b0]/20">
              <span className="font-heading font-extrabold text-sm text-[#111c2d]">
                Total a Cobrar:
              </span>
              <div className="text-right">
                <div className="text-3xl font-black font-heading text-[#006c4a] font-numeric-tally">
                  ${totalUSD.toFixed(2)}
                </div>
                <div className="text-base font-extrabold text-[#111c2d] font-numeric-tally mt-0.5">
                  {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </div>
              </div>
            </div>
          </div>

          {/* Payment Action Buttons Grid (Tactile Touch First) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Pago Móvil Button */}
            <button
              type="button"
              onClick={() => handleCheckout('pago_movil')}
              disabled={cartItems.length === 0}
              className="h-16 px-3 rounded-xl bg-[#0051d5] hover:bg-[#003ea8] text-white flex items-center justify-center gap-2.5 shadow-sm active:scale-95 transition-all text-left disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">phonelink_ring</span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold">Pago Móvil</span>
                <span className="text-[11px] opacity-90 font-numeric-tally">
                  {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
            </button>

            {/* Efectivo USD Button */}
            <button
              type="button"
              onClick={() => {
                if (onOpenCashChangeModal && totalUSD > 0) {
                  onOpenCashChangeModal(totalUSD, totalBs);
                } else {
                  handleCheckout('efectivo_usd');
                }
              }}
              disabled={cartItems.length === 0}
              className="h-16 px-3 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white flex items-center justify-center gap-2.5 shadow-sm active:scale-95 transition-all text-left disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">attach_money</span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold">Efectivo $</span>
                <span className="text-[11px] opacity-90 font-numeric-tally">Calcula cambio</span>
              </div>
            </button>

            {/* Efectivo Bolívares Button */}
            <button
              type="button"
              onClick={() => handleCheckout('efectivo_bs')}
              disabled={cartItems.length === 0}
              className="h-16 px-3 rounded-xl bg-[#111c2d] hover:bg-[#263143] text-white flex items-center justify-center gap-2.5 shadow-sm active:scale-95 transition-all text-left disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">local_atm</span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold">Efectivo Bs</span>
                <span className="text-[11px] opacity-90 font-numeric-tally">Exacto en caja</span>
              </div>
            </button>

            {/* Fiado / Debe Button */}
            <button
              type="button"
              onClick={() => handleCheckout('fiado')}
              disabled={cartItems.length === 0}
              className={`h-16 px-3 rounded-xl bg-[#ba1a1a] hover:bg-[#93000a] text-white flex items-center justify-center gap-2.5 shadow-md active:scale-95 transition-all text-left disabled:opacity-50 ring-2 ring-[#ffdad6] cursor-pointer ${
                isFiadoDetected ? 'animate-pulse' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">menu_book</span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold">Fiado / Debe</span>
                <span className="text-[11px] opacity-95 truncate max-w-[100px]">
                  {identifiedCustomer ? identifiedCustomer.name : (customerNameText.trim() || 'Anotar Libreta')}
                </span>
              </div>
            </button>
          </div>

        </div>

      </div>

      {/* Bottom Section: Recent Registered Transactions Ledger */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E2D8]">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#8d4b00] text-[20px]">history</span>
            <h3 className="font-heading font-bold text-base text-[#111c2d]">
              Últimas Ventas Registradas
            </h3>
          </div>
          <span className="text-xs text-[#554336] font-semibold">
            {recentSales.length} operaciones registradas hoy
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recentSales.slice(0, 3).map((sale) => (
            <div
              key={sale.id}
              className="p-4 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 flex items-center justify-between"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-[#111c2d] truncate">
                    {sale.customerName}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      sale.paymentMethod === 'pago_movil'
                        ? 'bg-[#dbe1ff] text-[#0051d5]'
                        : sale.paymentMethod === 'efectivo_usd'
                        ? 'bg-[#85f8c4]/50 text-[#006c4a]'
                        : sale.paymentMethod === 'fiado'
                        ? 'bg-[#ffdad6] text-[#ba1a1a]'
                        : 'bg-[#e7eeff] text-[#111c2d]'
                    }`}
                  >
                    {sale.paymentMethod === 'pago_movil'
                      ? 'Pago Móvil'
                      : sale.paymentMethod === 'efectivo_usd'
                      ? 'Efectivo $'
                      : sale.paymentMethod === 'fiado'
                      ? 'Fiado / Debe'
                      : 'Efectivo Bs'}
                  </span>
                </div>
                <span className="text-xs text-[#554336] truncate mt-0.5">
                  {sale.items.map((i) => `${i.quantity} ${i.productName}`).join(', ')}
                </span>
                <span className="text-[10px] text-[#554336]/70 mt-1">{sale.time}</span>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`font-black font-heading text-sm font-numeric-tally ${
                    sale.status === 'fiado' ? 'text-[#ba1a1a]' : 'text-[#111c2d]'
                  }`}
                >
                  ${sale.totalUSD.toFixed(2)}
                </span>
                <span className="block text-[11px] font-bold text-[#554336] font-numeric-tally">
                  {sale.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
