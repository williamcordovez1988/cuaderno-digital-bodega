import React, { useState, useEffect } from 'react';
import { Product } from '../firebase/types';

interface NuevoProductoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProduct: (product: Product) => Promise<void>;
  exchangeRate: number;
  initialProduct?: Product | null;
  onShowToast: (msg: string, icon?: string) => void;
}

export const NuevoProductoModal: React.FC<NuevoProductoModalProps> = ({
  isOpen,
  onClose,
  onSaveProduct,
  exchangeRate,
  initialProduct,
  onShowToast
}) => {
  const [barcode, setBarcode] = useState('7591031000123');
  const [name, setName] = useState('Harina PAN Blanca 1kg');
  const [category, setCategory] = useState('Víveres Secos');
  const [unit, setUnit] = useState('paq.');
  const [costUSD, setCostUSD] = useState(0.95);
  const [marginPercent, setMarginPercent] = useState(30);
  const [roundCents, setRoundCents] = useState(true);
  const [pricingType, setPricingType] = useState<'usd_anchored' | 'fixed_bs'>('usd_anchored');
  const [fixedPriceBs, setFixedPriceBs] = useState<number>(100);
  const [currentStock, setCurrentStock] = useState(24);
  const [minStock, setMinStock] = useState(6);
  const [supplier, setSupplier] = useState('Dist. Alimentos Mary');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialProduct) {
      setBarcode(initialProduct.barcode || '');
      setName(initialProduct.name);
      setCategory(initialProduct.category);
      setUnit(initialProduct.unit);
      setCostUSD(initialProduct.costUSD);
      setMarginPercent(initialProduct.marginPercent);
      setCurrentStock(initialProduct.currentStock);
      setMinStock(initialProduct.minStock);
      setSupplier(initialProduct.supplier);
      setPricingType(initialProduct.pricingType || 'usd_anchored');
      setFixedPriceBs(
        initialProduct.fixedPriceBs ||
          Number((initialProduct.priceUSD * exchangeRate).toFixed(2))
      );
    } else {
      setBarcode(`759${Math.floor(1000000000 + Math.random() * 9000000000)}`);
      setName('');
      setCategory('Víveres Secos');
      setUnit('paq.');
      setCostUSD(1.00);
      setMarginPercent(30);
      setCurrentStock(12);
      setMinStock(6);
      setSupplier('');
      setPricingType('usd_anchored');
      setFixedPriceBs(Number((1.30 * exchangeRate).toFixed(2)));
    }
  }, [initialProduct, isOpen, exchangeRate]);

  if (!isOpen) return null;

  // Calculate suggested sale price
  const calculatedPriceRaw = costUSD * (1 + marginPercent / 100);
  const calculatedPriceUSD = Number(calculatedPriceRaw.toFixed(2));
  let calculatedPriceBs = calculatedPriceUSD * exchangeRate;
  if (roundCents) {
    calculatedPriceBs = Math.round(calculatedPriceBs * 100) / 100;
  }

  // Active prices depending on pricingType
  const activePriceUSD =
    pricingType === 'fixed_bs'
      ? Number((fixedPriceBs / (exchangeRate || 1)).toFixed(2))
      : calculatedPriceUSD;

  const activePriceBs =
    pricingType === 'fixed_bs' ? fixedPriceBs : calculatedPriceBs;

  const costBs = Number((costUSD * exchangeRate).toFixed(2));
  const netProfitUSD = Number((activePriceUSD - costUSD).toFixed(2));
  const fixedBsMargin =
    costBs > 0
      ? Number((((fixedPriceBs - costBs) / costBs) * 100).toFixed(1))
      : 0;

  const handleSimulateScan = () => {
    const randomSKU = `759${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    setBarcode(randomSKU);
    onShowToast(`Código escaneado: ${randomSKU}`, 'qr_code_scanner');
  };

  const handleSave = async (andCreateAnother = false) => {
    if (!name.trim()) {
      onShowToast('Ingresa el nombre del producto', 'error');
      return;
    }

    if (pricingType === 'fixed_bs' && (!fixedPriceBs || fixedPriceBs <= 0)) {
      onShowToast('Ingresa un precio fijo en Bolívares válido', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const id = initialProduct ? initialProduct.id : `prod-${Date.now()}`;
      const code = initialProduct
        ? initialProduct.code
        : name.slice(0, 3).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);

      const productToSave: Product = {
        id,
        name: name.trim(),
        code,
        category,
        unit,
        costUSD,
        priceUSD: activePriceUSD,
        marginPercent: pricingType === 'fixed_bs' ? fixedBsMargin : marginPercent,
        currentStock,
        minStock,
        supplier: supplier.trim() || 'Distribuidor General',
        barcode,
        pricingType,
        fixedPriceBs: pricingType === 'fixed_bs' ? fixedPriceBs : undefined,
        updatedAt: new Date().toISOString()
      };

      await onSaveProduct(productToSave);
      onShowToast(
        pricingType === 'fixed_bs'
          ? `¡Producto "${name}" guardado a precio fijo de ${fixedPriceBs.toFixed(2)} Bs!`
          : `¡Producto "${name}" guardado en inventario ($${activePriceUSD.toFixed(2)})!`,
        'check_circle'
      );

      if (andCreateAnother) {
        setName('');
        setBarcode(`759${Math.floor(1000000000 + Math.random() * 9000000000)}`);
        setCurrentStock(12);
      } else {
        onClose();
      }
    } catch (e) {
      console.error(e);
      onShowToast('Error al guardar el producto', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-[#111c2d]/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#dbc2b0]/30 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#f0f3ff] border-b border-[#dbc2b0]/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[22px]">inventory_2</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-lg text-[#111c2d] tracking-tight leading-snug">
                  {initialProduct ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#85f8c4]/50 text-[#002114] text-xs font-semibold">
                  Anaquel
                </span>
              </div>
              <p className="text-xs text-[#554336] flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#006c4a]" />
                Tasa BCV Activa: <span className="font-bold text-[#111c2d]">{exchangeRate.toFixed(2)} Bs/$</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-lg bg-[#e7eeff] hover:bg-[#dee8ff] text-[#554336] hover:text-[#111c2d] flex items-center justify-center transition-colors"
            title="Cerrar (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Lector & Identificación Rápida */}
          <div className="p-4 rounded-xl bg-[#f0f3ff]/70 border border-[#dbc2b0]/20 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8d4b00] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">barcode_scanner</span>
                Lector & Identificación Rápida
              </span>
              <span className="text-[11px] font-semibold text-[#006c4a] flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                Pistola o cámara activa
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <label className="block text-xs font-semibold text-[#554336] mb-1">
                  Código de Barras / SKU
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8d4b00] text-[18px]">
                    qr_code_scanner
                  </span>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="7591031000123"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white text-[#111c2d] font-mono text-sm font-semibold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
                  />
                </div>
              </div>
              <div className="sm:col-span-5 flex items-end">
                <button
                  type="button"
                  onClick={handleSimulateScan}
                  className="w-full py-2 px-3 rounded-lg bg-white hover:bg-[#e7eeff] text-[#111c2d] text-xs font-bold border border-[#dbc2b0]/30 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">sync_alt</span>
                  Simular Escaneo
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#554336] mb-1">
                Nombre Comercial del Producto
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Harina PAN Blanca 1kg, Arroz Mary, etc."
                className="w-full px-3 py-2 rounded-lg bg-white text-[#111c2d] text-sm font-bold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#554336] mb-1">
                  Categoría de Mostrador
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white text-[#111c2d] text-xs font-semibold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
                >
                  <option>Víveres Secos</option>
                  <option>Lácteos y Charcutería</option>
                  <option>Bebidas y Refrescos</option>
                  <option>Limpieza y Aseo</option>
                  <option>Golosinas & Snacks</option>
                  <option>Varios</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#554336] mb-1">
                  Unidad de Despacho
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white text-[#111c2d] text-xs font-semibold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
                >
                  <option value="paq.">Paquete (paq.)</option>
                  <option value="und.">Unidad (und.)</option>
                  <option value="Kg">Kilogramo (Kg)</option>
                  <option value="bot.">Botella (bot.)</option>
                  <option value="L">Litro (L)</option>
                  <option value="bulto">Bulto Completo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Configuración de Precio & Tipo de Moneda */}
          <div className="p-4 rounded-xl bg-white border-2 border-[#8d4b00]/20 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111c2d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#8d4b00]">calculate</span>
                Tipo de Precio & Moneda
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                pricingType === 'fixed_bs' ? 'bg-[#ffdcc3] text-[#8d4b00]' : 'bg-[#82f5c1] text-[#00714e]'
              }`}>
                {pricingType === 'fixed_bs' ? 'Precio Fijo en Bolívares' : 'Dinámico anclado al Dólar'}
              </span>
            </div>

            {/* Selector de Tipo de Precio */}
            <div>
              <label className="block text-xs font-bold text-[#554336] mb-1.5">
                ¿Cómo fijar el precio de venta?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPricingType('usd_anchored')}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    pricingType === 'usd_anchored'
                      ? 'border-[#8d4b00] bg-[#ffdcc3]/20 shadow-xs ring-1 ring-[#8d4b00]'
                      : 'border-[#dbc2b0]/30 bg-white hover:bg-[#f0f3ff]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111c2d] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">attach_money</span>
                      Anclado a USD ($)
                    </span>
                    {pricingType === 'usd_anchored' && (
                      <span className="w-2 h-2 rounded-full bg-[#8d4b00]" />
                    )}
                  </div>
                  <p className="text-[11px] text-[#554336]">
                    Se recalcula dinámicamente en Bolívares según la tasa del día.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPricingType('fixed_bs');
                    if (!fixedPriceBs || fixedPriceBs <= 0) {
                      setFixedPriceBs(calculatedPriceBs || 100);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    pricingType === 'fixed_bs'
                      ? 'border-[#8d4b00] bg-[#ffdcc3]/20 shadow-xs ring-1 ring-[#8d4b00]'
                      : 'border-[#dbc2b0]/30 bg-white hover:bg-[#f0f3ff]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111c2d] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">local_offer</span>
                      Precio Fijo / Promoción en Bs
                    </span>
                    {pricingType === 'fixed_bs' && (
                      <span className="w-2 h-2 rounded-full bg-[#8d4b00]" />
                    )}
                  </div>
                  <p className="text-[11px] text-[#554336]">
                    Mantiene una cifra exacta en Bolívares fija (sin variar con la tasa).
                  </p>
                </button>
              </div>
            </div>

            {/* Campos de Costo & Margen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#554336]">
                    Costo Mayorista Unitario ($ USD)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const costBulto = prompt('Ingresa costo del bulto en USD:', '20.00');
                      const unitsBulto = prompt('¿Cuántas unidades trae el bulto?:', '24');
                      if (costBulto && unitsBulto) {
                        const unitCost = parseFloat(costBulto) / parseFloat(unitsBulto);
                        if (!isNaN(unitCost)) setCostUSD(Number(unitCost.toFixed(2)));
                      }
                    }}
                    className="text-[11px] font-bold text-[#8d4b00] hover:underline"
                  >
                    ¿Calcular por Bulto?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#554336] text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costUSD}
                    onChange={(e) => setCostUSD(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-2 rounded-lg bg-[#f0f3ff] text-[#111c2d] text-sm font-bold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] font-numeric-tally"
                  />
                </div>
                <p className="text-[11px] text-[#554336]">
                  Equivalente: {costBs.toFixed(2)} Bs al costo (Tasa: {exchangeRate.toFixed(2)})
                </p>
              </div>

              {pricingType === 'usd_anchored' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#554336] block">
                    Margen de Ganancia Deseado
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[20, 25, 30, 35].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMarginPercent(pct)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                          marginPercent === pct
                            ? 'bg-[#8d4b00] text-white shadow-xs'
                            : 'bg-[#f0f3ff] text-[#111c2d] hover:bg-[#e7eeff]'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={marginPercent}
                        onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded-md bg-[#f0f3ff] text-center text-xs font-bold border border-[#dbc2b0]/30 text-[#111c2d] focus:outline-none focus:ring-1 focus:ring-[#8d4b00]"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#006c4a] font-semibold">
                    Ganancia neta: +${netProfitUSD.toFixed(2)} USD por unidad
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#8d4b00] block">
                    Precio Fijo de Venta en Bolívares (Bs)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#8d4b00] text-xs">Bs</span>
                    <input
                      type="number"
                      step="1"
                      value={fixedPriceBs}
                      onChange={(e) => setFixedPriceBs(parseFloat(e.target.value) || 0)}
                      placeholder="Ej: 50, 100, 120"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#ffdcc3]/30 text-[#111c2d] text-sm font-black border border-[#8d4b00] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] font-numeric-tally"
                    />
                  </div>
                  <p className="text-[11px] font-semibold text-[#006c4a]">
                    Margen resultante: {fixedBsMargin}% (+${netProfitUSD.toFixed(2)} USD)
                  </p>
                </div>
              )}
            </div>

            {/* Visual Box Resumen del Precio al Cliente */}
            <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#85f8c4] text-[#002114] flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[20px]">
                    {pricingType === 'fixed_bs' ? 'local_offer' : 'sell'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#554336] block">
                    {pricingType === 'fixed_bs' ? 'Precio Final en Anaquel (Fijo)' : 'Precio de Venta Sugerido (Dinámico)'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    {pricingType === 'fixed_bs' ? (
                      <>
                        <span className="text-2xl font-black font-heading text-[#8d4b00] font-numeric-tally">
                          {activePriceBs.toFixed(2)} Bs
                        </span>
                        <span className="text-xs font-bold text-[#554336] font-numeric-tally">
                          (≈ ${activePriceUSD.toFixed(2)} USD a tasa {exchangeRate.toFixed(2)})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xl font-black font-heading text-[#111c2d] font-numeric-tally">
                          ${activePriceUSD.toFixed(2)} USD
                        </span>
                        <span className="text-base font-black text-[#006c4a] font-numeric-tally">
                          {activePriceBs.toFixed(2)} Bs
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {pricingType === 'usd_anchored' && (
                <div className="flex items-center gap-2 sm:self-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roundCents}
                      onChange={(e) => setRoundCents(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#8d4b00] rounded cursor-pointer"
                    />
                    <span className="text-xs font-medium text-[#554336]">Redondear centavos Bs</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Existencias & Alerta de Reposición */}
          <div className="p-4 rounded-xl bg-[#f0f3ff]/70 border border-[#dbc2b0]/20 space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#111c2d] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#554336]">shelves</span>
              Existencias & Alerta de Reposición
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#554336] mb-1">
                  Stock Inicial Actual
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-white text-[#111c2d] text-xs font-bold border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#ba1a1a] mb-1">
                  Mínimo de Alerta
                </label>
                <input
                  type="number"
                  step="1"
                  value={minStock}
                  onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-white text-[#ba1a1a] text-xs font-bold border border-[#ba1a1a]/30 focus:outline-none focus:ring-2 focus:ring-[#ba1a1a]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#554336] mb-1">
                  Proveedor Habitual
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Ej: Dist. Alimentos Mary"
                  className="w-full px-3 py-2 rounded-lg bg-white text-[#111c2d] text-xs font-medium border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
                />
              </div>
            </div>

            <p className="text-[11px] text-[#554336] flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#ba1a1a]">info</span>
              Se incluirá automáticamente en la lista de WhatsApp al distribuidor cuando el stock sea ≤ {minStock}.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#f0f3ff] border-t border-[#dbc2b0]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-[#554336]">
            <span className="px-1.5 py-0.5 rounded bg-white font-mono text-[10px]">Esc</span> Cancelar{' '}
            <span className="text-[#dbc2b0]">•</span>{' '}
            <span className="px-1.5 py-0.5 rounded bg-white font-mono text-[10px]">Enter</span> Guardar
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[#554336] hover:text-[#111c2d] text-xs font-bold transition-colors"
            >
              Cancelar
            </button>

            {!initialProduct && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#e7eeff] text-[#111c2d] text-xs font-bold border border-[#dbc2b0]/30 transition-colors hidden sm:inline-flex"
              >
                Guardar y Crear Otro
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              {isSaving ? 'Guardando...' : 'Guardar en Inventario'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
