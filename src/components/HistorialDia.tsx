import React, { useState, useMemo } from 'react';
import { Sale, LedgerEntry } from '../firebase/types';
import { CierreCajaModal } from './CierreCajaModal';

interface HistorialDiaProps {
  sales: Sale[];
  ledgerEntries?: LedgerEntry[];
  exchangeRate: number;
  bodegaName?: string;
  cashierName?: string;
  ownerPhone?: string;
  logoUrl?: string;
  onSaveOwnerPhone?: (phone: string) => Promise<void>;
  onShowToast: (msg: string, icon?: string) => void;
}

export const HistorialDia: React.FC<HistorialDiaProps> = ({
  sales,
  ledgerEntries = [],
  exchangeRate,
  bodegaName = 'Mi Bodega',
  cashierName = 'Caja Principal',
  ownerPhone = '',
  logoUrl,
  onSaveOwnerPhone,
  onShowToast
}) => {
  const [filterMethod, setFilterMethod] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedTicketToPrint, setSelectedTicketToPrint] = useState<Sale | null>(null);
  const [isCierreModalOpen, setIsCierreModalOpen] = useState(false);

  // Helper to format currency
  const formatBs = (val: number) =>
    val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatUSD = (val: number) => val.toFixed(2);

  // Extract customer abonos (payments received from debtors today)
  const todayAbonos = useMemo(() => {
    return ledgerEntries.filter(
      (entry) => entry.type === 'abono' && (entry.date === 'Hoy' || !entry.date)
    );
  }, [ledgerEntries]);

  // Daily Cash Register Calculation (Resumen de Caja Diario)
  // 1. Pago Móvil: sales with pago_movil + abonos via Pago Móvil
  const totalPagoMovilSalesBs = sales
    .filter((s) => s.paymentMethod === 'pago_movil')
    .reduce((acc, s) => acc + s.totalBs, 0);
  const totalPagoMovilAbonosBs = todayAbonos
    .filter((a) => (a.paymentMethod || '').toLowerCase().includes('pago móvil') || (a.paymentMethod || '').toLowerCase().includes('pago_movil'))
    .reduce((acc, a) => acc + a.amountBs, 0);
  const totalPagoMovilBs = totalPagoMovilSalesBs + totalPagoMovilAbonosBs;

  // 2. Efectivo USD: sales with efectivo_usd + abonos via Efectivo $
  const totalEfectivoSalesUSD = sales
    .filter((s) => s.paymentMethod === 'efectivo_usd')
    .reduce((acc, s) => acc + s.totalUSD, 0);
  const totalEfectivoAbonosUSD = todayAbonos
    .filter((a) => (a.paymentMethod || '').includes('$') || (a.paymentMethod || '').toLowerCase().includes('efectivo_usd'))
    .reduce((acc, a) => acc + a.amountUSD, 0);
  const totalEfectivoUSD = totalEfectivoSalesUSD + totalEfectivoAbonosUSD;

  // 3. Efectivo Bs: sales with efectivo_bs + abonos via Efectivo Bs
  const totalEfectivoBsSalesBs = sales
    .filter((s) => s.paymentMethod === 'efectivo_bs')
    .reduce((acc, s) => acc + s.totalBs, 0);
  const totalEfectivoBsAbonosBs = todayAbonos
    .filter((a) => (a.paymentMethod || '').includes('Bs') || (a.paymentMethod || '').toLowerCase().includes('efectivo_bs'))
    .reduce((acc, a) => acc + a.amountBs, 0);
  const totalEfectivoBs = totalEfectivoBsSalesBs + totalEfectivoBsAbonosBs;

  // 4. Fiados / Cuentas por Cobrar anotadas hoy
  const totalFiadasUSD = sales
    .filter((s) => s.status === 'fiado' || s.paymentMethod === 'fiado')
    .reduce((acc, s) => acc + s.totalUSD, 0);

  // Total Real Cobrado en Caja (Contado)
  const totalCobradoContadoUSD = totalEfectivoUSD + (totalPagoMovilBs / exchangeRate) + (totalEfectivoBs / exchangeRate);
  const totalCobradoContadoBs = (totalEfectivoUSD * exchangeRate) + totalPagoMovilBs + totalEfectivoBs;

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchMethod = filterMethod === 'todos' || s.paymentMethod === filterMethod;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchMethod;

      const matchCustomer = s.customerName.toLowerCase().includes(q);
      const matchTicket = String(s.ticketNumber).includes(q);
      const matchProducts = s.items.some(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          (i.productCode && i.productCode.toLowerCase().includes(q))
      );
      const matchNotes = s.notes ? s.notes.toLowerCase().includes(q) : false;

      return matchMethod && (matchCustomer || matchTicket || matchProducts || matchNotes);
    });
  }, [sales, filterMethod, searchQuery]);

  // Helper to generate the exact itemized phrase (e.g. "José pagó: 1 Bolero, 2 Merey, 1 refresco")
  const getItemizedSummary = (sale: Sale) => {
    const actionVerb = sale.paymentMethod === 'fiado' ? 'se llevó a fiado' : 'pagó';
    if (!sale.items || sale.items.length === 0) {
      return `${sale.customerName} ${actionVerb}: Venta directa sin detalle de productos`;
    }
    const itemsList = sale.items
      .map((i) => `${i.quantity} ${i.productName}`)
      .join(', ');
    return `${sale.customerName} ${actionVerb}: ${itemsList}`;
  };

  // Helper to get initials
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // Copy transaction summary to clipboard
  const handleCopySummary = (sale: Sale) => {
    const summaryText = `🛒 *TICKET #${sale.ticketNumber}* (${sale.date}, ${sale.time})\n👤 *Cliente:* ${sale.customerName}\n📦 *Productos:* ${sale.items.map((i) => `${i.quantity}x ${i.productName} ($${formatUSD(i.subtotalUSD)})`).join(', ')}\n💵 *Total:* $${formatUSD(sale.totalUSD)} USD (${formatBs(sale.totalBs)} Bs)\n💳 *Método:* ${getMethodLabel(sale.paymentMethod)}`;
    navigator.clipboard.writeText(summaryText);
    onShowToast(`Resumen del ticket #${sale.ticketNumber} copiado`, 'content_copy');
  };

  // Copy full daily cash summary
  const handleCopyDailySummary = () => {
    const text = `📊 *RESUMEN DE CAJA DIARIO*\nTotal Pago Móvil: Bs ${formatBs(totalPagoMovilBs)}\nTotal Efectivo $: $${formatUSD(totalEfectivoUSD)}\nTotal Efectivo Bs: Bs ${formatBs(totalEfectivoBs)}\nTotal Fiados: $${formatUSD(totalFiadasUSD)} (${formatBs(totalFiadasUSD * exchangeRate)} Bs)\n💵 Total Ingresos Contado: $${formatUSD(totalCobradoContadoUSD)} (${formatBs(totalCobradoContadoBs)} Bs)\nTasa BCV: ${formatBs(exchangeRate)} Bs/$`;
    navigator.clipboard.writeText(text);
    onShowToast('Resumen de caja copiado al portapapeles', 'content_copy');
  };

  function getMethodLabel(method: string) {
    switch (method) {
      case 'pago_movil':
        return 'Pago Móvil';
      case 'efectivo_usd':
        return 'Efectivo $';
      case 'efectivo_bs':
        return 'Efectivo Bs';
      case 'fiado':
        return 'Fiado / Debe';
      default:
        return method;
    }
  }

  function getMethodColorClass(method: string) {
    switch (method) {
      case 'pago_movil':
        return {
          badge: 'bg-[#dbe1ff] text-[#0051d5] border border-[#0051d5]/20',
          quote: 'bg-[#f0f4ff] border-l-4 border-l-[#0051d5] text-[#002f87]',
          icon: 'phonelink_ring',
          name: 'Pago Móvil'
        };
      case 'efectivo_usd':
        return {
          badge: 'bg-[#85f8c4]/40 text-[#006c4a] border border-[#006c4a]/20',
          quote: 'bg-[#eefbf5] border-l-4 border-l-[#006c4a] text-[#005036]',
          icon: 'attach_money',
          name: 'Efectivo $'
        };
      case 'efectivo_bs':
        return {
          badge: 'bg-[#e7eeff] text-[#111c2d] border border-[#111c2d]/20',
          quote: 'bg-[#f4f7fd] border-l-4 border-l-[#111c2d] text-[#111c2d]',
          icon: 'local_atm',
          name: 'Efectivo Bs'
        };
      case 'fiado':
        return {
          badge: 'bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]/20',
          quote: 'bg-[#fff4f2] border-l-4 border-l-[#ba1a1a] text-[#93000a]',
          icon: 'menu_book',
          name: 'Fiado / Debe'
        };
      default:
        return {
          badge: 'bg-[#f0f3ff] text-[#554336] border border-[#dbc2b0]/30',
          quote: 'bg-[#f8f9fa] border-l-4 border-l-[#554336] text-[#554336]',
          icon: 'receipt',
          name: method
        };
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-[#E8E2D8]">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#554336]">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">receipt_long</span>
              Auditoría & Desglose
            </span>
            <span>•</span>
            <span className="text-[#006c4a] font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#006c4a] animate-pulse"></span>
              Caja Abierta
            </span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-[#111c2d] tracking-tight mt-1">
            Reporte de Pagos Desglosado
          </h1>
          <p className="text-xs text-[#554336] mt-0.5">
            Detalle ítem por ítem de cada compra, fichas de transacción individuales y cuadre de caja por método de pago.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Destacado: Generar Cierre del Día */}
          <button
            type="button"
            onClick={() => setIsCierreModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white text-xs font-black shadow-md hover:shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer ring-2 ring-[#82f5c1]/30"
            title="Generar arqueo de caja del día y enviar reporte al dueño por WhatsApp"
          >
            <span className="text-[16px]">📊</span>
            <span>Generar Cierre del Día</span>
          </button>

          <button
            type="button"
            onClick={handleCopyDailySummary}
            className="px-3.5 py-2.5 rounded-xl bg-[#f0f3ff] hover:bg-[#e2e8f8] text-[#111c2d] text-xs font-bold border border-[#dbc2b0]/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Copiar texto con el resumen de caja del día"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
            <span>Copiar Cuadre</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Imprimir Reporte</span>
          </button>
        </div>
      </section>

      {/* BLOQUE REQUERIDO: Resumen de Caja Diario */}
      <section className="bg-white rounded-2xl shadow-sm border border-[#E8E2D8] p-5 flex flex-col gap-4">
        
        {/* Encabezado del Resumen */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            </div>
            <div>
              <h2 className="font-heading font-black text-base text-[#111c2d]">
                Resumen de Caja Diario
              </h2>
              <p className="text-[11px] text-[#554336]">
                Totales acumulados del día clasificados por método de pago
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setIsCierreModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <span className="text-[14px]">📊</span>
              <span>Generar Cierre del Día</span>
            </button>
            <span className="text-[#554336] font-medium">Tasa aplicada:</span>
            <span className="px-2.5 py-1 rounded-lg bg-[#f0f3ff] font-mono font-bold text-[#111c2d] border border-[#dbc2b0]/30">
              {formatBs(exchangeRate)} Bs/$
            </span>
          </div>
        </div>

        {/* CINTA TEXTUAL DESTACADA (Exacto como el formato solicitado en las instrucciones) */}
        <div className="px-4 py-3 rounded-xl bg-[#111c2d] text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2 text-xs">
            <span className="material-symbols-outlined text-[#ffdcc3] text-[20px]">account_balance</span>
            <span className="text-[#c1c6d7] font-semibold uppercase tracking-wider text-[11px]">
              Cuadre Rápido de Caja:
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm font-bold">
            <span className="text-[#a8c7fa] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#a8c7fa]"></span>
              <span>Total Pago Móvil:</span>
              <strong className="font-mono text-white text-sm">Bs {formatBs(totalPagoMovilBs)}</strong>
            </span>
            <span className="text-[#c1c6d7] hidden md:inline">|</span>
            <span className="text-[#85f8c4] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#85f8c4]"></span>
              <span>Total Efectivo $:</span>
              <strong className="font-mono text-white text-sm">${formatUSD(totalEfectivoUSD)}</strong>
            </span>
            <span className="text-[#c1c6d7] hidden md:inline">|</span>
            <span className="text-[#ffdcc3] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ffdcc3]"></span>
              <span>Total Efectivo Bs:</span>
              <strong className="font-mono text-white text-sm">Bs {formatBs(totalEfectivoBs)}</strong>
            </span>
          </div>
        </div>

        {/* Tarjetas Visuales Desglosadas de los Métodos de Pago */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-1">
          
          {/* Card: Pago Móvil */}
          <div className="p-4 rounded-xl bg-[#dbe1ff]/30 border border-[#0051d5]/25 flex flex-col justify-between transition-all hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0051d5] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">phonelink_ring</span>
                Pago Móvil
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0051d5] text-white text-[10px] font-bold">
                Banco
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black font-heading text-[#0051d5] font-numeric-tally tracking-tight">
                Bs {formatBs(totalPagoMovilBs)}
              </div>
              <p className="text-[11px] text-[#554336] mt-1 font-mono">
                ≈ ${formatUSD(totalPagoMovilBs / exchangeRate)} USD depositados
              </p>
            </div>
          </div>

          {/* Card: Efectivo USD */}
          <div className="p-4 rounded-xl bg-[#85f8c4]/20 border border-[#006c4a]/25 flex flex-col justify-between transition-all hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#006c4a] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">attach_money</span>
                Efectivo $
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#006c4a] text-white text-[10px] font-bold">
                Divisas
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black font-heading text-[#006c4a] font-numeric-tally tracking-tight">
                ${formatUSD(totalEfectivoUSD)}
              </div>
              <p className="text-[11px] text-[#554336] mt-1 font-mono">
                ≈ Bs {formatBs(totalEfectivoUSD * exchangeRate)} en caja física
              </p>
            </div>
          </div>

          {/* Card: Efectivo Bs */}
          <div className="p-4 rounded-xl bg-[#e7eeff]/40 border border-[#111c2d]/25 flex flex-col justify-between transition-all hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111c2d] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">local_atm</span>
                Efectivo Bs
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#111c2d] text-white text-[10px] font-bold">
                Gaveta
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black font-heading text-[#111c2d] font-numeric-tally tracking-tight">
                Bs {formatBs(totalEfectivoBs)}
              </div>
              <p className="text-[11px] text-[#554336] mt-1 font-mono">
                ≈ ${formatUSD(totalEfectivoBs / exchangeRate)} USD en billetes
              </p>
            </div>
          </div>

          {/* Card: Fiados Anotados */}
          <div className="p-4 rounded-xl bg-[#ffdad6]/30 border border-[#ba1a1a]/25 flex flex-col justify-between transition-all hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">menu_book</span>
                Fiado / Por Cobrar
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#ba1a1a] text-white text-[10px] font-bold">
                Pendiente
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black font-heading text-[#ba1a1a] font-numeric-tally tracking-tight">
                ${formatUSD(totalFiadasUSD)}
              </div>
              <p className="text-[11px] text-[#ba1a1a] mt-1 font-mono">
                ≈ Bs {formatBs(totalFiadasUSD * exchangeRate)} en libreta
              </p>
            </div>
          </div>

        </div>

        {/* Total General Cobrado de Contado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#E8E2D8] bg-[#f0f3ff]/60 -mx-5 -mb-5 px-5 py-3.5 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006c4a] text-[20px]">verified</span>
            <span className="text-xs font-bold text-[#111c2d]">
              Total Dinero Ingresado a Caja Hoy (Contado):
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg font-black font-heading text-[#006c4a] font-numeric-tally">
              ${formatUSD(totalCobradoContadoUSD)} USD
            </span>
            <span className="text-xs font-bold text-[#554336]">
              (Bs {formatBs(totalCobradoContadoBs)})
            </span>
          </div>
        </div>
      </section>

      {/* Barra de Filtros, Búsqueda y Alternador de Vistas */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E2D8] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Buscador */}
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#887364] text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente ('José'), producto ('Bolero', 'Merey') o ticket #..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#f0f3ff] text-xs font-medium text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#887364] hover:text-[#111c2d]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Chips de Métodos de Pago */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold scrollbar-none py-1">
          <button
            type="button"
            onClick={() => setFilterMethod('todos')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              filterMethod === 'todos'
                ? 'bg-[#111c2d] text-white shadow-xs'
                : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e4e9f5]'
            }`}
          >
            Todos ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod('pago_movil')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
              filterMethod === 'pago_movil'
                ? 'bg-[#0051d5] text-white shadow-xs'
                : 'bg-[#f0f3ff] text-[#0051d5] hover:bg-[#dbe1ff]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            Pago Móvil
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod('efectivo_usd')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
              filterMethod === 'efectivo_usd'
                ? 'bg-[#006c4a] text-white shadow-xs'
                : 'bg-[#f0f3ff] text-[#006c4a] hover:bg-[#c9f6e3]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            Efectivo $
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod('efectivo_bs')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
              filterMethod === 'efectivo_bs'
                ? 'bg-[#111c2d] text-white shadow-xs'
                : 'bg-[#f0f3ff] text-[#111c2d] hover:bg-[#e0e4ef]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            Efectivo Bs
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod('fiado')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
              filterMethod === 'fiado'
                ? 'bg-[#ba1a1a] text-white shadow-xs'
                : 'bg-[#f0f3ff] text-[#ba1a1a] hover:bg-[#ffdad6]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            Fiados
          </button>
        </div>

        {/* Switcher de Vista: Tarjetas vs Tabla */}
        <div className="flex items-center gap-1 bg-[#f0f3ff] p-1 rounded-xl self-end sm:self-auto shrink-0 border border-[#dbc2b0]/20">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white text-[#8d4b00] shadow-xs'
                : 'text-[#554336] hover:text-[#111c2d]'
            }`}
            title="Vista de Fichas de Transacción Desglosadas"
          >
            <span className="material-symbols-outlined text-[16px]">grid_view</span>
            <span className="hidden sm:inline">Fichas</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white text-[#8d4b00] shadow-xs'
                : 'text-[#554336] hover:text-[#111c2d]'
            }`}
            title="Vista de Tabla Compacta"
          >
            <span className="material-symbols-outlined text-[16px]">table_rows</span>
            <span className="hidden sm:inline">Tabla</span>
          </button>
        </div>

      </div>

      {/* CONTENIDO PRINCIPAL: VISTA DE FICHAS DE TRANSACCIÓN (CARDS) */}
      {viewMode === 'cards' ? (
        <div className="flex flex-col gap-4">
          {filteredSales.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-[#E8E2D8] flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#f0f3ff] text-[#887364] flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[32px]">receipt_long</span>
              </div>
              <h3 className="font-heading font-bold text-base text-[#111c2d]">
                No se encontraron ventas con los filtros aplicados
              </h3>
              <p className="text-xs text-[#554336] mt-1 max-w-sm">
                Prueba cambiando el método de pago o borrando el término de búsqueda.
              </p>
            </div>
          ) : (
            filteredSales.map((sale) => {
              const methodStyle = getMethodColorClass(sale.paymentMethod);
              const summaryPhrase = getItemizedSummary(sale);

              return (
                <article
                  key={sale.id}
                  className="bg-white rounded-2xl shadow-sm border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-all p-5 flex flex-col gap-4 hover:shadow-md"
                >
                  {/* Encabezado de la Ficha */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0EBE3]">
                    
                    {/* Ticket & Timestamp exacto */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] text-[#111c2d] flex items-center justify-center font-mono font-black text-xs border border-[#dbc2b0]/30 shadow-2xs">
                        #{sale.ticketNumber}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-sm text-[#111c2d]">
                            Ticket #{sale.ticketNumber}
                          </span>
                          <span className="text-[#887364]">•</span>
                          <span className="text-[11px] text-[#554336] flex items-center gap-1 font-medium">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            {sale.date}, {sale.time}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#887364]">
                          Atendido por: {sale.cashier || 'Caja Principal'}
                        </span>
                      </div>
                    </div>

                    {/* Método de Pago y Acciones Rápidas */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${methodStyle.badge}`}
                      >
                        <span className="material-symbols-outlined text-[15px]">{methodStyle.icon}</span>
                        <span>{methodStyle.name}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopySummary(sale)}
                        className="p-1.5 rounded-lg text-[#554336] hover:text-[#111c2d] hover:bg-[#f0f3ff] transition-all cursor-pointer"
                        title="Copiar desglose del ticket"
                      >
                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedTicketToPrint(sale)}
                        className="p-1.5 rounded-lg text-[#8d4b00] hover:text-white hover:bg-[#8d4b00] transition-all cursor-pointer"
                        title="Ver comprobante para imprimir"
                      >
                        <span className="material-symbols-outlined text-[18px]">receipt</span>
                      </button>
                    </div>

                  </div>

                  {/* Cliente & FRASE DESTACADA DEL DESGLOSE (Exactamente como solicitado: 'José pagó: 1 Bolero, 2 Merey, 1 refresco') */}
                  <div className="flex flex-col gap-2.5">
                    
                    {/* Perfil del Cliente */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold text-xs shrink-0">
                        {getInitials(sale.customerName)}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-extrabold text-sm text-[#111c2d]">
                          {sale.customerName}
                        </span>
                        {sale.status === 'fiado' ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-bold">
                            Cuenta por Cobrar
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-[#85f8c4]/40 text-[#006c4a] text-[10px] font-bold">
                            Pago Liquidado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* BLOQUE DESTACADO DE LA COMPRA (Resumen narrativo exacto) */}
                    <div className={`p-3 rounded-xl ${methodStyle.quote} flex items-start gap-2.5`}>
                      <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5 opacity-90">
                        format_quote
                      </span>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                          Desglose de la Transacción:
                        </span>
                        <p className="text-sm font-extrabold leading-snug tracking-tight mt-0.5">
                          {summaryPhrase}
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* Tabla / Lista Detallada de Artículos y Cantidades */}
                  <div className="bg-[#f0f3ff]/60 rounded-xl p-3 border border-[#dbc2b0]/25">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#554336] block mb-2">
                      Artículos Incluidos ({sale.items.length}):
                    </span>

                    {sale.items.length === 0 ? (
                      <p className="text-xs text-[#554336] italic">
                        Sin artículos individuales especificados.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sale.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#E8E2D8] text-xs shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <span className="px-1.5 py-0.5 rounded bg-[#ffdcc3]/60 text-[#8d4b00] font-black font-mono text-[11px] shrink-0">
                                {item.quantity} {item.unit || 'ud'}
                              </span>
                              <span className="font-semibold text-[#111c2d] truncate">
                                {item.productName}
                              </span>
                            </div>

                            <div className="text-right whitespace-nowrap shrink-0 font-numeric-tally">
                              <span className="font-bold text-[#111c2d] block">
                                ${formatUSD(item.subtotalUSD)}
                              </span>
                              <span className="text-[10px] text-[#554336] block">
                                {formatBs(item.subtotalBs)} Bs
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pie de la Ficha: Monto Total en USD y Bs */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#F0EBE3] bg-linear-to-r from-transparent to-[#f0f3ff]/50 -mx-5 -mb-5 p-5 rounded-b-2xl">
                    <div className="flex items-center gap-2 text-xs text-[#554336]">
                      <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">currency_exchange</span>
                      <span>Tasa calculada: <strong>{formatBs(sale.exchangeRate)} Bs/$</strong></span>
                    </div>

                    <div className="flex items-baseline gap-3 self-end sm:self-auto">
                      <span className="text-xs font-bold text-[#554336] uppercase tracking-wider">
                        Total {sale.paymentMethod === 'fiado' ? 'Pendiente' : 'Pagado'}:
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-black font-heading font-numeric-tally ${
                            sale.status === 'fiado' ? 'text-[#ba1a1a]' : 'text-[#006c4a]'
                          }`}
                        >
                          ${formatUSD(sale.totalUSD)} <span className="text-xs font-bold">USD</span>
                        </span>
                        <span className="text-sm font-extrabold text-[#111c2d] font-numeric-tally">
                          ({formatBs(sale.totalBs)} Bs)
                        </span>
                      </div>
                    </div>
                  </div>

                </article>
              );
            })
          )}
        </div>
      ) : (
        /* VISTA DE TABLA COMPACTA (Para auditoría rápida o impresión densa) */
        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E2D8] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f0f3ff] text-[#554336] uppercase font-bold tracking-wider border-b border-[#E8E2D8]">
                  <th className="py-3 px-4">Ticket & Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Desglose Exacto (Ítem por Ítem)</th>
                  <th className="py-3 px-4 text-center">Método de Pago</th>
                  <th className="py-3 px-4 text-right">Total ($ USD)</th>
                  <th className="py-3 px-4 text-right">Total (Bs)</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE3] text-[#111c2d]">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#554336] italic">
                      No hay ventas que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => {
                    const methodStyle = getMethodColorClass(sale.paymentMethod);
                    const summaryPhrase = getItemizedSummary(sale);

                    return (
                      <tr key={sale.id} className="hover:bg-[#f0f3ff]/50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-[#111c2d]">Ticket #{sale.ticketNumber}</span>
                            <span className="text-[10px] text-[#554336]">{sale.date}, {sale.time}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-bold text-xs text-[#111c2d] block">
                            {sale.customerName}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-[#111c2d] font-semibold leading-relaxed max-w-md">
                            {summaryPhrase}
                          </div>
                          <div className="text-[11px] text-[#554336] mt-0.5">
                            {sale.items.map((i) => `${i.quantity}x ${i.productName}`).join(' • ')}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${methodStyle.badge}`}>
                            {methodStyle.name}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap font-numeric-tally">
                          <span
                            className={`font-black text-sm ${
                              sale.status === 'fiado' ? 'text-[#ba1a1a]' : 'text-[#006c4a]'
                            }`}
                          >
                            ${formatUSD(sale.totalUSD)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap font-numeric-tally">
                          <span className="font-bold text-xs text-[#111c2d]">
                            {formatBs(sale.totalBs)} Bs
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedTicketToPrint(sale)}
                            className="p-1 rounded-lg text-[#8d4b00] hover:bg-[#ffdcc3] transition-all cursor-pointer"
                            title="Ver ticket para imprimir"
                          >
                            <span className="material-symbols-outlined text-[16px]">receipt</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer de la Tabla */}
          <div className="p-4 bg-[#f0f3ff] border-t border-[#E8E2D8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#554336]">
            <span>
              Mostrando <strong>{filteredSales.length}</strong> transacciones registradas
            </span>
            <span className="font-semibold text-[#006c4a] flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Auditoría de ventas al día
            </span>
          </div>
        </div>
      )}

      {/* Modal / Comprobante Individual de Ticket para Imprimir */}
      {selectedTicketToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#dbc2b0]/30 flex flex-col gap-4 font-mono">
            <div className="text-center pb-3 border-b-2 border-dashed border-[#554336]/30">
              <h2 className="font-bold text-lg text-[#111c2d] uppercase">Cuaderno Digital</h2>
              <p className="text-xs text-[#554336]">Bodega & Abarrotes</p>
              <div className="mt-2 text-xs font-bold text-[#8d4b00]">
                *** COMPROBANTE DE VENTA ***
              </div>
            </div>

            <div className="text-xs text-[#111c2d] flex flex-col gap-1">
              <div className="flex justify-between">
                <span>TICKET:</span>
                <strong>#{selectedTicketToPrint.ticketNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span>{selectedTicketToPrint.date}, {selectedTicketToPrint.time}</span>
              </div>
              <div className="flex justify-between">
                <span>CLIENTE:</span>
                <strong>{selectedTicketToPrint.customerName}</strong>
              </div>
              <div className="flex justify-between">
                <span>MÉTODO:</span>
                <strong>{getMethodLabel(selectedTicketToPrint.paymentMethod)}</strong>
              </div>
              <div className="flex justify-between">
                <span>TASA BCV:</span>
                <span>{formatBs(selectedTicketToPrint.exchangeRate)} Bs/$</span>
              </div>
            </div>

            {/* Desglose Ítems */}
            <div className="py-2 border-y border-dashed border-[#554336]/30 text-xs flex flex-col gap-1.5">
              <div className="font-bold text-[11px] text-[#554336] uppercase">DESGLOSE DE ARTÍCULOS:</div>
              {selectedTicketToPrint.items.map((i, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{i.quantity}x {i.productName}</span>
                  <strong>${formatUSD(i.subtotalUSD)}</strong>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between font-black text-sm text-[#111c2d]">
                <span>TOTAL USD:</span>
                <span>${formatUSD(selectedTicketToPrint.totalUSD)}</span>
              </div>
              <div className="flex justify-between font-bold text-xs text-[#554336]">
                <span>TOTAL BS:</span>
                <span>{formatBs(selectedTicketToPrint.totalBs)} Bs</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-[#887364] pt-2 border-t border-dashed border-[#554336]/30">
              ¡Gracias por su compra!
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTicketToPrint(null)}
                className="flex-1 py-2 rounded-xl bg-[#f0f3ff] text-[#111c2d] text-xs font-bold hover:bg-[#e0e4ef] cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2 rounded-xl bg-[#8d4b00] text-white text-xs font-bold hover:bg-[#b15f00] flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cierre de Caja del Día & Notificación al Dueño */}
      <CierreCajaModal
        isOpen={isCierreModalOpen}
        onClose={() => setIsCierreModalOpen(false)}
        sales={sales}
        ledgerEntries={ledgerEntries}
        exchangeRate={exchangeRate}
        bodegaName={bodegaName}
        cashierName={cashierName}
        ownerPhone={ownerPhone}
        logoUrl={logoUrl}
        onSaveOwnerPhone={onSaveOwnerPhone}
        onShowToast={onShowToast}
      />

    </div>
  );
};
