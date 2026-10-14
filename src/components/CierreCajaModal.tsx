import React, { useState, useMemo } from 'react';
import { Sale, LedgerEntry } from '../firebase/types';

interface CierreCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  ledgerEntries?: LedgerEntry[];
  exchangeRate: number;
  bodegaName: string;
  cashierName: string;
  ownerPhone?: string;
  logoUrl?: string;
  onSaveOwnerPhone?: (phone: string) => Promise<void>;
  onShowToast: (msg: string, icon?: string) => void;
}

export const CierreCajaModal: React.FC<CierreCajaModalProps> = ({
  isOpen,
  onClose,
  sales,
  ledgerEntries = [],
  exchangeRate,
  bodegaName,
  cashierName,
  ownerPhone = '',
  logoUrl,
  onSaveOwnerPhone,
  onShowToast
}) => {
  const [phoneInput, setPhoneInput] = useState<string>(ownerPhone || '');
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Sync phone input if ownerPhone changes
  React.useEffect(() => {
    if (ownerPhone && !phoneInput) {
      setPhoneInput(ownerPhone);
    }
  }, [ownerPhone]);

  // Extract customer abonos for today
  const todayAbonos = useMemo(() => {
    return ledgerEntries.filter(
      (entry) => entry.type === 'abono' && (entry.date === 'Hoy' || !entry.date)
    );
  }, [ledgerEntries]);

  // 1. Efectivo USD
  const totalEfectivoSalesUSD = useMemo(() => {
    return sales
      .filter((s) => s.paymentMethod === 'efectivo_usd')
      .reduce((acc, s) => acc + s.totalUSD, 0);
  }, [sales]);

  const totalEfectivoAbonosUSD = useMemo(() => {
    return todayAbonos
      .filter(
        (a) =>
          (a.paymentMethod || '').includes('$') ||
          (a.paymentMethod || '').toLowerCase().includes('efectivo_usd')
      )
      .reduce((acc, a) => acc + a.amountUSD, 0);
  }, [todayAbonos]);

  const totalEfectivoUSD = totalEfectivoSalesUSD + totalEfectivoAbonosUSD;

  // 2. Efectivo Bs
  const totalEfectivoBsSalesBs = useMemo(() => {
    return sales
      .filter((s) => s.paymentMethod === 'efectivo_bs')
      .reduce((acc, s) => acc + s.totalBs, 0);
  }, [sales]);

  const totalEfectivoBsAbonosBs = useMemo(() => {
    return todayAbonos
      .filter(
        (a) =>
          (a.paymentMethod || '').includes('Bs') ||
          (a.paymentMethod || '').toLowerCase().includes('efectivo_bs')
      )
      .reduce((acc, a) => acc + a.amountBs, 0);
  }, [todayAbonos]);

  const totalEfectivoBs = totalEfectivoBsSalesBs + totalEfectivoBsAbonosBs;
  const totalEfectivoBsInUSD = totalEfectivoBs / exchangeRate;

  // 3. Pago Móvil
  const totalPagoMovilSalesBs = useMemo(() => {
    return sales
      .filter((s) => s.paymentMethod === 'pago_movil')
      .reduce((acc, s) => acc + s.totalBs, 0);
  }, [sales]);

  const totalPagoMovilAbonosBs = useMemo(() => {
    return todayAbonos
      .filter(
        (a) =>
          (a.paymentMethod || '').toLowerCase().includes('pago móvil') ||
          (a.paymentMethod || '').toLowerCase().includes('pago_movil')
      )
      .reduce((acc, a) => acc + a.amountBs, 0);
  }, [todayAbonos]);

  const totalPagoMovilBs = totalPagoMovilSalesBs + totalPagoMovilAbonosBs;
  const totalPagoMovilInUSD = totalPagoMovilBs / exchangeRate;

  // 4. Fiados del día (Cuentas por cobrar otorgadas hoy)
  const totalFiadasUSD = useMemo(() => {
    return sales
      .filter((s) => s.status === 'fiado' || s.paymentMethod === 'fiado')
      .reduce((acc, s) => acc + s.totalUSD, 0);
  }, [sales]);
  const totalFiadasBs = totalFiadasUSD * exchangeRate;

  // 5. Total Ingresos Contado (Dinero real cobrado en caja)
  const totalCobradoContadoUSD = totalEfectivoUSD + totalEfectivoBsInUSD + totalPagoMovilInUSD;
  const totalCobradoContadoBs = (totalEfectivoUSD * exchangeRate) + totalEfectivoBs + totalPagoMovilBs;

  // 6. Balance General de la Jornada (Contado + Fiado)
  const totalVentasBrutasUSD = totalCobradoContadoUSD + totalFiadasUSD;
  const totalVentasBrutasBs = totalCobradoContadoBs + totalFiadasBs;

  const totalTransacciones = sales.length + todayAbonos.length;

  const formatBs = (val: number) =>
    val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatUSD = (val: number) => val.toFixed(2);

  if (!isOpen) return null;

  const now = new Date();
  const currentDateStr = now.toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const currentTimeStr = now.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Build WhatsApp preformatted report
  const generateWhatsAppMessage = () => {
    return `📊 *CIERRE DE CAJA DIARIO - ${bodegaName.toUpperCase()}*
📅 *Fecha:* ${currentDateStr}
⏰ *Hora:* ${currentTimeStr}
👤 *Turno/Cajero:* ${cashierName || 'Caja Principal'}
💱 *Tasa Oficial BCV:* ${formatBs(exchangeRate)} Bs/$

━━━━━━━━━━━━━━━━━━━━
💰 *DESGLOSE DE INGRESOS COBRADOS (EN CAJA):*
• 💵 *Efectivo USD:* $${formatUSD(totalEfectivoUSD)} USD
• 🇻🇪 *Efectivo Bs:* ${formatBs(totalEfectivoBs)} Bs (~$${formatUSD(totalEfectivoBsInUSD)} USD)
• 📲 *Pago Móvil:* ${formatBs(totalPagoMovilBs)} Bs (~$${formatUSD(totalPagoMovilInUSD)} USD)

━━━━━━━━━━━━━━━━━━━━
💵 *TOTAL REAL EN CAJA (CONTADO):*
👉 *$${formatUSD(totalCobradoContadoUSD)} USD* (~${formatBs(totalCobradoContadoBs)} Bs)

━━━━━━━━━━━━━━━━━━━━
📝 *FIADOS DEL DÍA (POR COBRAR):*
• Nuevos Fiados Otorgados: $${formatUSD(totalFiadasUSD)} USD (${formatBs(totalFiadasBs)} Bs)

━━━━━━━━━━━━━━━━━━━━
⚖️ *BALANCE GENERAL DE LA JORNADA:*
• Total Ventas Brutas (Contado + Fiado): $${formatUSD(totalVentasBrutasUSD)} USD (~${formatBs(totalVentasBrutasBs)} Bs)
• Actividad: ${sales.length} ventas despachadas + ${todayAbonos.length} abonos de deuda cobrados

✅ _Reporte de cierre generado automáticamente desde Cuaderno Digital._`;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(generateWhatsAppMessage());
      setIsCopied(true);
      onShowToast('¡Reporte de cierre copiado al portapapeles!', 'content_copy');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      onShowToast('Error al copiar el reporte', 'error');
    }
  };

  const handleSendWhatsAppToOwner = async () => {
    const rawDigits = phoneInput.replace(/\D/g, '');
    if (!rawDigits || rawDigits.length < 7) {
      onShowToast('Por favor ingresa el número de WhatsApp del dueño', 'warning');
      const input = document.getElementById('ownerPhoneField');
      if (input) input.focus();
      return;
    }

    // Format Venezuelan & International Phone number
    let cleanPhone = rawDigits;
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.slice(1);
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('4')) {
      cleanPhone = '58' + cleanPhone;
    }

    // Save phone if requested
    if (saveAsDefault && onSaveOwnerPhone && phoneInput.trim() !== ownerPhone) {
      await onSaveOwnerPhone(phoneInput.trim());
    }

    const message = generateWhatsAppMessage();
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    onShowToast('Abriendo WhatsApp para enviar el cierre al dueño...', 'send');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#dbc2b0]/40 overflow-hidden flex flex-col my-auto max-h-[94vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-[#111c2d] via-[#1a293f] to-[#111c2d] text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo del Negocio"
                className="w-12 h-12 rounded-2xl object-cover bg-white p-0.5 shrink-0 shadow-md ring-4 ring-[#82f5c1]/20"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#006c4a] to-[#00875c] text-white flex items-center justify-center font-bold shrink-0 shadow-md ring-4 ring-[#82f5c1]/20">
                <span className="material-symbols-outlined text-[26px]">point_of_sale</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-black text-lg sm:text-xl tracking-tight leading-snug">
                  📊 Cierre de Caja del Día
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#82f5c1]/30 text-[#82f5c1] text-[10px] font-black uppercase tracking-wider">
                  Arqueo Oficial
                </span>
              </div>
              <p className="text-xs text-white/75 mt-0.5 capitalize">
                {bodegaName} • {currentDateStr} • {currentTimeStr}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar (Esc)"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#FAF8F5]">
          
          {/* Key Info Banner */}
          <div className="p-4 rounded-2xl bg-white border border-[#E8E2D8] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 text-xs text-[#554336]">
              <span className="material-symbols-outlined text-[#8d4b00] text-[18px]">badge</span>
              <span>Cajero en Turno: <strong className="text-[#111c2d]">{cashierName || 'Caja Principal'}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#554336]">
              <span>Tasa BCV del día:</span>
              <span className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#dbc2b0]/40 font-mono font-bold text-[#111c2d]">
                {formatBs(exchangeRate)} Bs/$
              </span>
            </div>
          </div>

          {/* 1. DESGLOSE COMPLETO DE INGRESOS COBRADOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase tracking-wider text-[#554336] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#006c4a]">payments</span>
                Desglose de Ingresos Cobrados en Caja
              </span>
              <span className="text-[11px] text-[#554336] font-semibold">
                {totalTransacciones} movimientos procesados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* Efectivo USD */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-[#006c4a] tracking-wider">
                    Efectivo USD ($)
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#85f8c4]/40 text-[#006c4a] flex items-center justify-center font-bold">
                    $
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xl font-black font-numeric-tally text-[#111c2d]">
                    ${formatUSD(totalEfectivoUSD)} <span className="text-xs font-bold text-[#554336]">USD</span>
                  </div>
                  <p className="text-[10px] text-[#554336] mt-1">
                    Ventas: ${formatUSD(totalEfectivoSalesUSD)} • Abonos: ${formatUSD(totalEfectivoAbonosUSD)}
                  </p>
                </div>
              </div>

              {/* Efectivo Bs */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-[#8d4b00] tracking-wider">
                    Efectivo Bs
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold text-xs">
                    Bs
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xl font-black font-numeric-tally text-[#111c2d]">
                    {formatBs(totalEfectivoBs)} <span className="text-xs font-bold text-[#554336]">Bs</span>
                  </div>
                  <p className="text-[10px] text-[#006c4a] font-bold mt-1">
                    ≈ ${formatUSD(totalEfectivoBsInUSD)} USD
                  </p>
                </div>
              </div>

              {/* Pago Móvil */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-[#0051d5] tracking-wider">
                    Pago Móvil
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#e7eeff] text-[#0051d5] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">phone_android</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xl font-black font-numeric-tally text-[#111c2d]">
                    {formatBs(totalPagoMovilBs)} <span className="text-xs font-bold text-[#554336]">Bs</span>
                  </div>
                  <p className="text-[10px] text-[#006c4a] font-bold mt-1">
                    ≈ ${formatUSD(totalPagoMovilInUSD)} USD
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* 2. TOTAL FIADO DEL DÍA & TOTAL REAL COBRADO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Total Real en Caja (Contado) */}
            <div className="p-4.5 rounded-2xl bg-gradient-to-br from-[#85f8c4]/30 via-white to-white border-2 border-[#006c4a]/40 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#006c4a] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                  Total Real en Caja (Contado)
                </span>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-heading text-[#006c4a] font-numeric-tally leading-tight">
                    ${formatUSD(totalCobradoContadoUSD)}
                  </span>
                  <span className="text-xs font-bold text-[#554336]">USD</span>
                </div>
                <div className="text-xs font-bold text-[#111c2d] font-numeric-tally mt-1">
                  ≈ {formatBs(totalCobradoContadoBs)} Bs
                </div>
              </div>
              <p className="text-[11px] text-[#554336] mt-3 pt-2.5 border-t border-[#006c4a]/15">
                Dinero líquido real recibido en efectivo y pago móvil.
              </p>
            </div>

            {/* Total Fiado del Día */}
            <div className="p-4.5 rounded-2xl bg-gradient-to-br from-[#ffdad6]/40 via-white to-white border-2 border-[#ba1a1a]/30 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#ba1a1a] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  Total Fiado del Día (Por Cobrar)
                </span>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-heading text-[#ba1a1a] font-numeric-tally leading-tight">
                    ${formatUSD(totalFiadasUSD)}
                  </span>
                  <span className="text-xs font-bold text-[#554336]">USD</span>
                </div>
                <div className="text-xs font-bold text-[#111c2d] font-numeric-tally mt-1">
                  ≈ {formatBs(totalFiadasBs)} Bs
                </div>
              </div>
              <p className="text-[11px] text-[#554336] mt-3 pt-2.5 border-t border-[#ba1a1a]/15">
                Cuentas por cobrar anotadas hoy en libretas de clientes.
              </p>
            </div>

          </div>

          {/* 3. BALANCE GENERAL DE LA JORNADA */}
          <div className="p-4.5 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-[#554336] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">analytics</span>
                Balance General de la Jornada
              </span>
              <div className="text-sm font-extrabold text-[#111c2d] mt-1">
                Ventas Brutas Totales: <span className="font-numeric-tally font-black text-[#8d4b00]">${formatUSD(totalVentasBrutasUSD)} USD</span>{' '}
                <span className="text-xs text-[#554336]">({formatBs(totalVentasBrutasBs)} Bs)</span>
              </div>
              <div className="text-[11px] text-[#554336] mt-0.5">
                {sales.length} ventas en mostrador + {todayAbonos.length} abonos de clientes recibidos
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleCopyReport}
                className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#e7eeff] text-[#111c2d] font-bold text-xs border border-[#dbc2b0]/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isCopied ? 'check' : 'content_copy'}
                </span>
                <span>{isCopied ? 'Copiado' : 'Copiar Texto'}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#e7eeff] text-[#111c2d] font-bold text-xs border border-[#dbc2b0]/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {/* 4. ENVIAR CIERRE POR WHATSAPP AL DUEÑO */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-[#006c4a]/10 via-white to-[#82f5c1]/10 border-2 border-[#006c4a]/40 space-y-3.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-[20px]">📲</span>
              <div>
                <h4 className="font-heading font-black text-xs sm:text-sm text-[#111c2d]">
                  Enviar Cierre por WhatsApp al Dueño
                </h4>
                <p className="text-[11px] text-[#554336]">
                  Envía el resumen completo al teléfono del propietario al cerrar el turno.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-3 flex items-center text-[#554336] pointer-events-none">
                  <span className="material-symbols-outlined text-[18px]">phone</span>
                </span>
                <input
                  id="ownerPhoneField"
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Ej: 0414-1234567 o +584141234567"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white border border-[#dbc2b0]/50 text-xs font-bold text-[#111c2d] placeholder-[#554336]/60 focus:outline-none focus:ring-2 focus:ring-[#006c4a]"
                />
              </div>

              <button
                type="button"
                onClick={handleSendWhatsAppToOwner}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white font-black text-xs shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <span>📲</span>
                <span>Enviar Cierre al Dueño</span>
              </button>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-[#554336] cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#006c4a] accent-[#006c4a]"
              />
              <span>Recordar este teléfono del dueño para los próximos cierres de turno</span>
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-[#dbc2b0]/30 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[#554336] hover:text-[#111c2d] text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar Ventana
          </button>

          <button
            type="button"
            onClick={handleSendWhatsAppToOwner}
            className="px-5 py-2.5 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white text-xs font-black shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span>📲 Enviar Cierre por WhatsApp al Dueño</span>
          </button>
        </div>

      </div>
    </div>
  );
};
