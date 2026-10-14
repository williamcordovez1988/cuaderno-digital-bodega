import React, { useState, useMemo } from 'react';
import { Product, isTrialPlan } from '../firebase/types';

interface InventarioProps {
  products: Product[];
  exchangeRate: number;
  onAdjustStock: (productId: string, delta: number) => Promise<void>;
  onOpenNuevoProductoModal: () => void;
  onOpenEditProductoModal: (product: Product) => void;
  onDeleteProduct: (productId: string) => Promise<void>;
  onOpenCargarFacturaModal: () => void;
  onShowToast: (msg: string, icon?: string) => void;
  plan?: string;
  aiScansUsed?: number;
  onOpenPaywallModal?: (opts?: {
    reason?: 'products_limit' | 'invoice_ai_limit';
    title?: string;
    subtitle?: string;
    badge?: string;
  }) => void;
}

export const Inventario: React.FC<InventarioProps> = ({
  products,
  exchangeRate,
  onAdjustStock,
  onOpenNuevoProductoModal,
  onOpenEditProductoModal,
  onDeleteProduct,
  onOpenCargarFacturaModal,
  onShowToast,
  plan,
  aiScansUsed,
  onOpenPaywallModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [sortBy, setSortBy] = useState<'default' | 'price' | 'stock' | 'name'>('default');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Supplier replenishment list selection
  const [checkedSuppliers, setCheckedSuppliers] = useState<Record<string, boolean>>({});

  // Filtered products list
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.code.toLowerCase().includes(term) ||
          p.barcode.includes(term) ||
          p.category.toLowerCase().includes(term)
      );
    }

    if (selectedCategory === 'Stock Bajo (≤ 5)') {
      list = list.filter((p) => p.currentStock <= 5);
    } else if (selectedCategory === 'Stock Crítico') {
      list = list.filter((p) => p.currentStock <= p.minStock);
    } else if (selectedCategory !== 'Todos') {
      list = list.filter((p) => p.category === selectedCategory);
    }

    if (sortBy === 'price') {
      list.sort((a, b) => b.priceUSD - a.priceUSD);
    } else if (sortBy === 'stock') {
      list.sort((a, b) => a.currentStock - b.currentStock);
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [products, searchTerm, selectedCategory, sortBy]);

  // Categories with counts
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Todos: products.length,
      'Stock Bajo (≤ 5)': 0,
      'Víveres Secos': 0,
      'Lácteos y Charcutería': 0,
      'Bebidas y Refrescos': 0,
      'Limpieza y Aseo': 0
    };

    products.forEach((p) => {
      if (counts[p.category] !== undefined) {
        counts[p.category]++;
      }
      if (p.currentStock <= 5) {
        counts['Stock Bajo (≤ 5)']++;
      }
    });

    return counts;
  }, [products]);

  // KPIs
  const totalCatalogItems = products.length;
  const lowStockItems = products.filter((p) => p.currentStock <= 5);
  const criticalStockItems = products.filter((p) => p.currentStock <= p.minStock);
  const totalShelfValueUSD = products.reduce((acc, p) => acc + p.currentStock * p.priceUSD, 0);
  const totalShelfValueBs = totalShelfValueUSD * exchangeRate;

  // Replenishment suggested items
  const suggestedReplenish = useMemo(() => {
    return products.filter((p) => p.currentStock <= p.minStock);
  }, [products]);

  // Wholesaler estimated cost
  const wholesalerEstimatedCostUSD = useMemo(() => {
    return suggestedReplenish.reduce((acc, p) => {
      const suggestedQty = Math.max(1, p.minStock * 2 - p.currentStock);
      return acc + suggestedQty * p.costUSD;
    }, 0);
  }, [suggestedReplenish]);

  const wholesalerEstimatedCostBs = wholesalerEstimatedCostUSD * exchangeRate;

  // Send WhatsApp to Distributor
  const handleSendWhatsAppToDistributor = () => {
    if (suggestedReplenish.length === 0) {
      onShowToast('No hay artículos con stock crítico para pedir', 'check');
      return;
    }

    const itemsText = suggestedReplenish
      .map((p) => {
        const qtyToOrder = Math.max(1, p.minStock * 2 - p.currentStock);
        return `• ${p.name} (${p.code}): Pedir ${qtyToOrder} ${p.unit} (Quedan: ${p.currentStock})`;
      })
      .join('%0A');

    const msg = `Hola estimado distribuidor, le envío el pedido de reposición de *Bodega La Milagrosa*:%0A%0A${itemsText}%0A%0ACosto estimado: $${wholesalerEstimatedCostUSD.toFixed(2)} USD (~${wholesalerEstimatedCostBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs).%0A%0A¡Muchas gracias!`;

    window.open(`https://wa.me/?text=${msg}`, '_blank');
    onShowToast('Abriendo WhatsApp con la lista de reposición...', 'send');
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const headers = ['Código', 'Producto', 'Categoría', 'Stock', 'Unidad', 'Costo USD', 'Precio USD', 'Precio Bs'];
    const rows = products.map((p) => [
      p.code,
      `"${p.name}"`,
      `"${p.category}"`,
      p.currentStock,
      p.unit,
      p.costUSD.toFixed(2),
      p.priceUSD.toFixed(2),
      (p.priceUSD * exchangeRate).toFixed(2)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Inventario_Bodega_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Inventario exportado en formato CSV');
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteProduct(productToDelete.id);
      onShowToast(`Producto "${productToDelete.name}" eliminado del inventario`, 'delete');
      setProductToDelete(null);
    } catch (e) {
      console.error(e);
      onShowToast('Error al eliminar producto', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Freemium Trial status
  const isTrial = isTrialPlan(plan);
  const isTrialLimitReached = isTrial && products.length >= 5;

  const isAiScanLimitReached = isTrial && (aiScansUsed ?? 0) >= 1;

  const handleAddNewProductClick = () => {
    if (isTrialLimitReached) {
      if (onOpenPaywallModal) onOpenPaywallModal({ reason: 'products_limit' });
      return;
    }
    onOpenNuevoProductoModal();
  };

  const handleOpenInvoiceClick = () => {
    if (isAiScanLimitReached) {
      if (onOpenPaywallModal) {
        onOpenPaywallModal({
          title: '🔒 Alcanzaste el límite de tu versión de prueba (1/1 escaneo de facturas con IA)',
          subtitle:
            'Has completado tu escaneo de demostración. Actualiza al Plan Pro para continuar procesando facturas ilimitadas de Polar, Pepsi y tus distribuidores con IA.',
          badge: 'Límite de Prueba con IA (1/1)',
          reason: 'invoice_ai_limit'
        });
      }
      return;
    }
    onOpenCargarFacturaModal();
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* 3. Contador de Uso (Plan Prueba / Freemium) */}
      {isTrial && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-white via-[#fff8f2] to-white border border-[#dbc2b0]/50 shadow-2xs">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isTrialLimitReached ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#ffdcc3] text-[#8d4b00]'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isTrialLimitReached ? 'lock' : 'inventory_2'}
              </span>
            </div>
            <div>
              <div className="text-xs font-black text-[#111c2d] flex items-center gap-2 flex-wrap">
                <span>Capacidad utilizada: {products.length} de 5 productos (Plan Prueba)</span>
                {isTrialLimitReached && (
                  <span className="px-2 py-0.5 rounded-full bg-[#ba1a1a] text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                    Límite 5/5
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#554336] mt-0.5">
                {isTrialLimitReached
                  ? '🔒 Has alcanzado el límite de tu versión de prueba (5/5 productos). Actualiza al Plan Pro para continuar registrando.'
                  : `Tu versión de prueba permite hasta 5 productos. Te quedan ${5 - products.length} disponibles.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            {/* Visual mini progress bar */}
            <div className="w-24 sm:w-28 bg-[#E8E2D8] h-2 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${
                  isTrialLimitReached ? 'bg-[#ba1a1a]' : 'bg-[#8d4b00]'
                }`}
                style={{ width: `${Math.min(100, (products.length / 5) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => onOpenPaywallModal?.({ reason: 'products_limit' })}
              className="px-3 py-1.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-[11px] font-extrabold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[15px]">workspace_premium</span>
              Actualizar a Pro
            </button>
          </div>
        </div>
      )}

      {/* Top Title & Quick Action Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#554336]">
            <span>Control de Almacén & Anaqueles</span>
            <span>•</span>
            <span className="text-[#006c4a] font-bold">Modo Mostrador en Vivo</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#111c2d] font-heading tracking-tight mt-0.5">
            Inventario de Productos
          </h1>
          <p className="text-xs text-[#554336]">
            Precios sincronizados en USD y Bolívares (Tasa: {exchangeRate.toFixed(2)} Bs/$), control de existencias mínimas y pedidos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cargar Factura de Proveedor con IA */}
          <button
            type="button"
            onClick={handleOpenInvoiceClick}
            className={`px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-md hover:shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer ring-2 ${
              isAiScanLimitReached
                ? 'bg-[#ba1a1a] hover:bg-[#93000a] text-white ring-[#ffdad6]/50'
                : 'bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white ring-[#82f5c1]/30'
            }`}
            title={
              isAiScanLimitReached
                ? 'Has usado tu escaneo de prueba (1/1). Pasa al Plan Pro para escaneos ilimitados'
                : 'Tomar foto con la cámara o subir PDF/imagen de factura (Polar, Pepsi, distribuidora) con IA'
            }
          >
            <span className="text-[15px]">📷</span>
            <span>Cargar Factura de Proveedor con IA</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
              {isAiScanLimitReached ? 'PRO' : 'IA'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#f0f3ff] text-[#111c2d] font-bold text-xs border border-[#dbc2b0]/30 shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={handleAddNewProductClick}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
              isTrialLimitReached
                ? 'bg-[#ba1a1a] hover:bg-[#93000a] text-white'
                : 'bg-[#8d4b00] hover:bg-[#b15f00] text-white'
            }`}
            title={isTrialLimitReached ? 'Límite alcanzado: Actualiza al Plan Pro para agregar más productos' : 'Registrar nuevo producto'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isTrialLimitReached ? 'lock' : 'add_circle'}
            </span>
            + Nuevo Producto
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Catálogo Activo */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#554336]">Total en Catálogo</span>
            <span className="w-8 h-8 rounded-lg bg-[#f0f3ff] text-[#8d4b00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">inventory_2</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-heading text-[#111c2d] font-numeric-tally">
                {totalCatalogItems}
              </span>
              <span className="text-xs font-semibold text-[#554336]">rubros activos</span>
            </div>
            <p className="text-xs text-[#006c4a] font-bold flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[15px]">check_circle</span>
              95% abastecimiento promedio
            </p>
          </div>
        </div>

        {/* 2. Valor Total Anaquel */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#554336]">Valor en Anaquel</span>
            <span className="w-8 h-8 rounded-lg bg-[#82f5c1] text-[#00714e] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black font-heading text-[#111c2d] font-numeric-tally">
                ${totalShelfValueUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-[#554336]">USD</span>
            </div>
            <p className="text-xs text-[#554336] font-bold mt-1 font-numeric-tally">
              ≈ {totalShelfValueBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs{' '}
              <span className="font-normal text-[#554336]/70">(Tasa {exchangeRate.toFixed(2)})</span>
            </p>
          </div>
        </div>

        {/* 3. Alertas Stock Bajo */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#ba1a1a]/30 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#ba1a1a]" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ba1a1a]">Stock Bajo (≤ 5 ud)</span>
            <span className="w-8 h-8 rounded-lg bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-heading text-[#ba1a1a] font-numeric-tally">
                {lowStockItems.length}
              </span>
              <span className="text-xs font-bold text-[#ba1a1a]">por reponer pronto</span>
            </div>
            <p className="text-xs text-[#ba1a1a] font-medium flex items-center gap-1 mt-1 truncate">
              <span className="material-symbols-outlined text-[15px]">notification_important</span>
              {lowStockItems.slice(0, 3).map((p) => `${p.name.split(' ')[0]} (${p.currentStock})`).join(', ') || 'Todo abastecido'}
            </p>
          </div>
        </div>

        {/* 4. Líderes de Mostrador */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#554336]">Líderes de Mostrador</span>
            <span className="w-8 h-8 rounded-lg bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-bold text-[#111c2d] truncate">Harina PAN • Queso • Arroz</div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-full bg-[#dee8ff] h-2 rounded-full overflow-hidden flex">
                <div className="bg-[#8d4b00] h-full w-3/5" title="Harina PAN 60%" />
                <div className="bg-[#006c4a] h-full w-1/4" title="Queso 25%" />
                <div className="bg-[#0051d5] h-full w-3/20" title="Arroz 15%" />
              </div>
              <span className="text-xs font-bold text-[#554336]">42%</span>
            </div>
            <span className="text-[11px] text-[#554336] block mt-1">del flujo diario de caja</span>
          </div>
        </div>
      </div>

      {/* Search, Categories and Fast Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col gap-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search input with live real-time filtering */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#887364] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar producto por nombre (ejemplo: 'arroz', 'pasta', 'azúcar')... (Alt + B)"
              className="w-full pl-11 pr-10 py-2.5 rounded-xl bg-[#f0f3ff] text-[#111c2d] placeholder:text-[#554336]/70 text-xs font-medium border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#887364] hover:text-[#111c2d] cursor-pointer"
                title="Limpiar búsqueda"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-xs font-bold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none cursor-pointer"
            >
              <option value="default">Ordenar: Predeterminado</option>
              <option value="stock">Ordenar: Menor Stock Primero</option>
              <option value="price">Ordenar: Mayor Precio</option>
              <option value="name">Ordenar: Nombre A-Z</option>
            </select>

            <button
              onClick={handleExportCSV}
              type="button"
              className="px-3 py-2 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-xs font-bold text-[#111c2d] flex items-center gap-1.5 border border-[#dbc2b0]/30 whitespace-nowrap cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              Exportar Excel
            </button>
          </div>
        </div>

        {/* Real-time search feedback notification banner */}
        {searchTerm.trim() && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/40 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#8d4b00] text-[18px]">search_check</span>
              <span className="text-[#111c2d] font-semibold">
                Resultados para <strong className="text-[#8d4b00]">"{searchTerm}"</strong>: <strong>{filteredProducts.length}</strong> de {products.length} productos
              </span>
            </div>
            <div className="flex items-center gap-2">
              {filteredProducts.filter(p => p.currentStock <= 5).length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] font-bold text-[11px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  {filteredProducts.filter(p => p.currentStock <= 5).length} con Stock Bajo
                </span>
              )}
            </div>
          </div>
        )}

        {/* Category Pill Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Object.entries(categoriesWithCounts).map(([cat, count]) => {
            const isStockBajo = cat === 'Stock Bajo (≤ 5)';
            const isSelected = selectedCategory === cat;

            if (isStockBajo) {
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  type="button"
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-[#ba1a1a] text-white'
                      : 'bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ffdad6]/80'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">warning</span>
                  <span>Stock Bajo (≤ 5)</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-white text-[#ba1a1a] text-[11px]">
                    {count}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                type="button"
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-[#8d4b00] text-white'
                    : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff] border border-[#dbc2b0]/30'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-white text-[#554336]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Layout: Table (8 cols) + Order Drawer (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Inventory Ledger Table (8 Columns on Desktop) */}
        <div className="xl:col-span-8 bg-white rounded-2xl shadow-sm border border-[#E8E2D8] overflow-hidden flex flex-col">
          {/* Table Header Bar */}
          <div className="px-5 py-3.5 bg-[#f0f3ff] border-b border-[#E8E2D8] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="font-heading font-bold text-sm text-[#111c2d]">Libreta de Mercancía</span>
              <span className="px-2 py-0.5 rounded-full bg-white text-[#554336] text-xs font-semibold border border-[#dbc2b0]/20">
                Tasa Activa: {exchangeRate.toFixed(2)} Bs
              </span>
            </div>
            <span className="text-xs text-[#554336] font-medium">
              {filteredProducts.length} de {products.length} productos mostrados
            </span>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white text-[#554336] uppercase tracking-wider font-bold border-b border-[#E8E2D8]">
                  <th className="py-3 px-4">Producto & Código</th>
                  <th className="py-3 px-3 text-center">Stock Actual</th>
                  <th className="py-3 px-3 text-right">Costo ($)</th>
                  <th className="py-3 px-3 text-right">Precio Venta ($ / Bs)</th>
                  <th className="py-3 px-3 text-center">Margen</th>
                  <th className="py-3 px-4 text-center">Ajuste Rápido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE3] text-[#111c2d]">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#554336] italic">
                      No se encontraron productos coincidentes.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => {
                    const isZero = prod.currentStock <= 0;
                    const isLowStock = prod.currentStock <= 5;
                    const isCritical = prod.currentStock <= prod.minStock;
                    const priceBs = prod.priceUSD * exchangeRate;

                    return (
                      <tr
                        key={prod.id}
                        className={`hover:bg-[#f0f3ff]/50 transition-colors ${
                          isZero
                            ? 'bg-[#ffdad6]/20'
                            : isLowStock
                            ? 'bg-[#ffdad6]/10'
                            : 'bg-white'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold shrink-0">
                              <span className="material-symbols-outlined text-[20px]">
                                {prod.category.includes('Bebidas')
                                  ? 'local_drink'
                                  : prod.category.includes('Lácteos')
                                  ? 'egg_alt'
                                  : prod.category.includes('Limpieza')
                                  ? 'cleaning_services'
                                  : 'bakery_dining'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-[#111c2d] truncate">
                                {prod.name}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-[#554336] mt-0.5 flex-wrap">
                                <span className="font-mono text-[#8d4b00] font-semibold">{prod.code}</span>
                                <span>•</span>
                                <span className="px-1.5 py-0.2 rounded bg-[#f0f3ff] text-[10px]">
                                  {prod.category}
                                </span>
                                <span>•</span>
                                <span className={`font-semibold text-[10px] ${isLowStock || isZero ? 'text-[#ba1a1a]' : 'text-[#006c4a]'}`}>
                                  {prod.name.split(' ')[0]}: {prod.currentStock} unidades restantes
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex flex-col items-center">
                            {isZero ? (
                              <span className="px-2.5 py-1 rounded-full bg-[#ba1a1a] text-white text-[10px] font-black tracking-wide flex items-center gap-1 shadow-2xs">
                                <span className="material-symbols-outlined text-[13px]">block</span>
                                Agotado (0 restantes)
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2.5 py-1 rounded-full bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/40 text-[10px] font-black tracking-wide flex items-center gap-1 shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-pulse" />
                                <span className="material-symbols-outlined text-[13px]">warning</span>
                                Stock Bajo: {prod.currentStock} unidades restantes
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-[#85f8c4]/50 text-[#004d34] border border-[#006c4a]/20 text-[10px] font-extrabold inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#006c4a]" />
                                {prod.currentStock} unidades restantes
                              </span>
                            )}
                            {prod.minStock > 0 && (
                              <span className="text-[10px] text-[#554336] mt-0.5">
                                Mínimo: {prod.minStock} {prod.unit}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right text-xs font-semibold text-[#554336] font-numeric-tally">
                          ${prod.costUSD.toFixed(2)}
                        </td>

                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            {prod.pricingType === 'fixed_bs' && (prod.fixedPriceBs || 0) > 0 ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ffdcc3] text-[#8d4b00] text-[11px] font-black font-numeric-tally">
                                  <span className="material-symbols-outlined text-[12px]">local_offer</span>
                                  {prod.fixedPriceBs?.toFixed(2)} Bs
                                </span>
                                <span className="text-[10px] font-semibold text-[#554336] mt-0.5 font-numeric-tally">
                                  ≈ ${(Number(prod.fixedPriceBs) / (exchangeRate || 1)).toFixed(2)} USD (Fijo)
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-black text-xs text-[#111c2d] font-numeric-tally">
                                  ${prod.priceUSD.toFixed(2)} USD
                                </span>
                                <span className="text-[10px] font-bold text-[#006c4a] font-numeric-tally">
                                  {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-[#85f8c4]/40 text-[#002114] text-[11px] font-bold font-numeric-tally">
                            {prod.marginPercent}%
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex items-center justify-center gap-1 bg-[#f0f3ff] rounded-lg p-1 border border-[#dbc2b0]/20">
                            <button
                              type="button"
                              onClick={() => onAdjustStock(prod.id, -1)}
                              disabled={prod.currentStock <= 0}
                              className="w-7 h-7 rounded bg-white text-[#111c2d] hover:bg-[#ffdad6] hover:text-[#ba1a1a] flex items-center justify-center shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
                              title="Restar -1"
                            >
                              <span className="material-symbols-outlined text-[16px]">remove</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onAdjustStock(prod.id, 1)}
                              className="w-7 h-7 rounded bg-white text-[#111c2d] hover:bg-[#85f8c4] hover:text-[#002114] flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                              title="Sumar +1"
                            >
                              <span className="material-symbols-outlined text-[16px]">add</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenEditProductoModal(prod)}
                              className="w-7 h-7 rounded bg-white text-[#554336] hover:text-[#8d4b00] flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                              title="Editar producto"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setProductToDelete(prod)}
                              className="w-7 h-7 rounded bg-white text-[#554336] hover:text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                              title="Eliminar producto del inventario"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-4 bg-[#f0f3ff] border-t border-[#E8E2D8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#554336] font-medium">
            <span>Mostrando {filteredProducts.length} de {products.length} artículos</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#111c2d]">Inventario al día</span>
            </div>
          </div>
        </div>

        {/* Right Column: Replenishment Drawer & Inflow (4 Columns) */}
        <div className="xl:col-span-4 flex flex-col gap-5">
          
          {/* Vendor Replenishment Card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
                </span>
                <div>
                  <h3 className="font-heading font-bold text-sm text-[#111c2d] leading-tight">
                    Pedido a Mayorista
                  </h3>
                  <p className="text-[11px] text-[#554336]">Sugeridos por stock mínimo</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-xs font-bold">
                {suggestedReplenish.length} por pedir
              </span>
            </div>

            {/* Items Checkbox List */}
            <div className="flex flex-col divide-y divide-[#F0EBE3] bg-[#f0f3ff] rounded-xl p-1.5 border border-[#dbc2b0]/20 max-h-[260px] overflow-y-auto">
              {suggestedReplenish.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#554336] italic">
                  Todo el catálogo se encuentra bien abastecido.
                </div>
              ) : (
                suggestedReplenish.map((item) => {
                  const toOrder = Math.max(1, item.minStock * 2 - item.currentStock);
                  const isChecked = checkedSuppliers[item.id] !== false;

                  return (
                    <div key={item.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#111c2d] block truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-[#ba1a1a] font-semibold">
                          Quedan {item.currentStock} (Sugerido: +{toOrder} {item.unit})
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setCheckedSuppliers((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked
                          }))
                        }
                        className="w-4 h-4 rounded text-[#8d4b00] accent-[#8d4b00] cursor-pointer"
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Cost Estimate */}
            <div className="p-3 bg-[#f0f3ff] rounded-xl flex items-center justify-between border border-[#dbc2b0]/20">
              <span className="text-xs font-bold text-[#554336]">Costo Mayorista Est.:</span>
              <div className="text-right">
                <span className="text-sm font-extrabold text-[#111c2d] font-heading font-numeric-tally">
                  ${wholesalerEstimatedCostUSD.toFixed(2)} USD
                </span>
                <p className="text-[11px] text-[#554336] font-bold font-numeric-tally">
                  ≈ {wholesalerEstimatedCostBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </p>
              </div>
            </div>

            {/* Action Button WhatsApp */}
            <button
              type="button"
              onClick={handleSendWhatsAppToDistributor}
              className="w-full py-2.5 px-4 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              Enviar Lista por WhatsApp al Distribuidor
            </button>
          </div>

          {/* Recent Inflow Card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="font-heading font-bold text-xs text-[#111c2d] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#8d4b00]">local_shipping</span>
                Entradas Recientes
              </h4>
              <span className="text-[11px] text-[#8d4b00] font-bold">Registro de despachos</span>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <div className="p-2.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111c2d]">2 Bultos Arroz Mary</span>
                  <span className="text-[11px] text-[#554336]">Hoy 8:30 AM</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-[#554336]">
                  <span>Dist. Alimentos Mary</span>
                  <span className="font-bold text-[#006c4a]">+48 unidades</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111c2d]">3 Cajas Maltín Polar</span>
                  <span className="text-[11px] text-[#554336]">Ayer 4:15 PM</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-[#554336]">
                  <span>Cervecería Polar</span>
                  <span className="font-bold text-[#006c4a]">+72 botellas</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111c2d]">1 Pieza Queso Llanero (18kg)</span>
                  <span className="text-[11px] text-[#554336]">Ayer 10:00 AM</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-[#554336]">
                  <span>Quesera El Páramo</span>
                  <span className="font-bold text-[#006c4a]">+18.0 Kg</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Quick Shortcuts Bar */}
      <div className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#554336]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-[#111c2d] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-[#8d4b00]">keyboard</span>
            Atajos de mostrador:
          </span>
          <span className="px-2 py-1 rounded bg-[#f0f3ff] font-mono text-[#111c2d]">Alt + B : Buscar</span>
          <span className="px-2 py-1 rounded bg-[#f0f3ff] font-mono text-[#111c2d]">Alt + N : Nuevo</span>
          <span className="px-2 py-1 rounded bg-[#f0f3ff] font-mono text-[#111c2d]">Alt + W : Enviar WhatsApp</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#006c4a]" />
          <span>Anaquel en línea • Sincronizado con Firestore</span>
        </div>
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {productToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/50 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#ba1a1a]/30 overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3.5 mb-3">
              <div className="w-11 h-11 rounded-xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#111c2d]">
                  ¿Eliminar producto del inventario?
                </h3>
                <span className="text-xs text-[#ba1a1a] font-bold">Esta acción no se puede deshacer</span>
              </div>
            </div>

            <p className="text-xs text-[#554336] leading-relaxed mb-4">
              ¿Estás seguro de que deseas eliminar permanentemente{' '}
              <strong className="text-[#111c2d]">"{productToDelete.name}"</strong> ({productToDelete.code})? Se
              borrará de la base de datos de la bodega y dejará de aparecer en el mostrador.
            </p>

            <div className="p-3 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20 mb-5 flex items-center justify-between text-xs">
              <div>
                <span className="text-[11px] text-[#554336] block">Stock actual</span>
                <span className="font-bold text-[#111c2d]">
                  {productToDelete.currentStock} {productToDelete.unit}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#554336] block">Precio venta</span>
                <span className="font-bold text-[#8d4b00]">
                  ${productToDelete.priceUSD.toFixed(2)} USD
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-[#111c2d] text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Borrando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Sí, eliminar producto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
