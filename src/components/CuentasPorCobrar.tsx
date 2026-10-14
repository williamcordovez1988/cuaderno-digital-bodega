import React, { useState, useMemo } from 'react';
import { Customer, LedgerEntry, BodegaSettings } from '../firebase/types';
import { EditarClienteModal } from './EditarClienteModal';

interface CuentasPorCobrarProps {
  customers: Customer[];
  ledgerEntries: LedgerEntry[];
  settings: BodegaSettings;
  exchangeRate: number;
  onRegisterAbono: (
    customer: Customer,
    amountUSD: number,
    exchangeRate: number,
    paymentMethod: string,
    reference?: string
  ) => Promise<void>;
  onUpdateCustomer: (
    customerId: string,
    updates: {
      name: string;
      alias?: string;
      phone: string;
      address: string;
      creditLimitUSD?: number;
    }
  ) => Promise<void>;
  onOpenNuevoFiadoModal?: (customer: Customer) => void;
  onOpenNuevoClienteModal?: () => void;
  onOpenWhatsAppModal: (customer: Customer) => void;
  onShowToast: (msg: string, icon?: string) => void;
}

export const CuentasPorCobrar: React.FC<CuentasPorCobrarProps> = ({
  customers,
  ledgerEntries,
  settings,
  exchangeRate,
  onRegisterAbono,
  onUpdateCustomer,
  onOpenNuevoFiadoModal,
  onOpenNuevoClienteModal,
  onOpenWhatsAppModal,
  onShowToast
}) => {
  // Selected Customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );

  // Edit Customer Modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pendientes' | 'mayor' | 'dias' | 'saldados'>('pendientes');

  // Abono Widget state
  const [paymentMethod, setPaymentMethod] = useState<'pago_movil' | 'efectivo_usd' | 'efectivo_bs'>('pago_movil');
  const [abonoInput, setAbonoInput] = useState<string>('10.00');
  const [abonoRef, setAbonoRef] = useState<string>('');
  const [isSubmittingAbono, setIsSubmittingAbono] = useState<boolean>(false);

  // Active Pending Debtors (Rule 2: The active view preserves ONLY people with pending accounts > $0.00)
  const pendingCustomers = useMemo(() => {
    return customers.filter((c) => (c.currentDebtUSD || 0) > 0.005);
  }, [customers]);

  // Settled Accounts History (Clients who have fully paid their debt and have $0.00)
  const settledCustomers = useMemo(() => {
    return customers.filter((c) => (c.currentDebtUSD || 0) <= 0.005);
  }, [customers]);

  // Filter customer list: Active view shows only customers with debt, or settled history when requested
  const filteredCustomers = useMemo(() => {
    let list = activeFilter === 'saldados' ? [...settledCustomers] : [...pendingCustomers];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.address.toLowerCase().includes(term) ||
          (c.alias && c.alias.toLowerCase().includes(term))
      );
    }

    if (activeFilter === 'mayor') {
      list.sort((a, b) => b.currentDebtUSD - a.currentDebtUSD);
    } else if (activeFilter === 'dias') {
      list = list.filter((c) => c.status === 'vencido' || c.status === 'aviso');
    }

    return list;
  }, [pendingCustomers, settledCustomers, searchTerm, activeFilter]);

  // Get active customer object (auto-falls back to first available in current view)
  const activeCustomer = useMemo(() => {
    if (selectedCustomerId) {
      const found = filteredCustomers.find((c) => c.id === selectedCustomerId);
      if (found) return found;
    }
    return filteredCustomers[0] || null;
  }, [filteredCustomers, selectedCustomerId]);

  // Ledger entries for active customer
  const activeLedger = useMemo(() => {
    if (!activeCustomer) return [];
    return ledgerEntries.filter((l) => l.customerId === activeCustomer.id);
  }, [ledgerEntries, activeCustomer]);

  // Overall Totals (Calculated exclusively over active debt)
  const totalDebtStreetUSD = useMemo(() => {
    return Number(pendingCustomers.reduce((acc, c) => acc + c.currentDebtUSD, 0).toFixed(2));
  }, [pendingCustomers]);

  const totalDebtStreetBs = Number((totalDebtStreetUSD * exchangeRate).toFixed(2));

  // Today's Abonos
  const todayAbonosUSD = useMemo(() => {
    return Number(
      ledgerEntries
        .filter((l) => l.type === 'abono' && l.date.includes('Hoy'))
        .reduce((acc, l) => acc + l.amountUSD, 0)
        .toFixed(2)
    );
  }, [ledgerEntries]);

  // Critical Overdue Client
  const criticalClient = useMemo(() => {
    return pendingCustomers.find((c) => c.status === 'vencido') || pendingCustomers[0] || null;
  }, [pendingCustomers]);

  // Calculate remaining balance for abono widget
  const abonoAmountNumber = parseFloat(abonoInput) || 0;
  const abonoInUSD =
    paymentMethod === 'efectivo_usd'
      ? abonoAmountNumber
      : abonoAmountNumber / exchangeRate;

  const currentDebt = activeCustomer ? activeCustomer.currentDebtUSD : 0;
  const remainingUSD = Math.max(0, Number((currentDebt - abonoInUSD).toFixed(2)));
  const remainingBs = Number((remainingUSD * exchangeRate).toFixed(2));

  // Quick Pay Total Button
  const handlePayTotal = () => {
    if (!activeCustomer) return;
    if (paymentMethod === 'efectivo_usd') {
      setAbonoInput(activeCustomer.currentDebtUSD.toFixed(2));
    } else {
      setAbonoInput((activeCustomer.currentDebtUSD * exchangeRate).toFixed(2));
    }
  };

  // Submit Abono (Automatically removes customer from active view when balance reaches $0.00)
  const handleConfirmAbono = async () => {
    if (!activeCustomer) return;
    if (abonoAmountNumber <= 0) {
      onShowToast('Ingresa un monto válido para abonar', 'error');
      return;
    }

    setIsSubmittingAbono(true);
    try {
      const usdValue = paymentMethod === 'efectivo_usd' ? abonoAmountNumber : abonoAmountNumber / exchangeRate;
      const methodName =
        paymentMethod === 'pago_movil'
          ? 'Pago Móvil Bs'
          : paymentMethod === 'efectivo_usd'
          ? 'Efectivo $'
          : 'Efectivo Bs';

      const isLiquidatingEntireDebt = (activeCustomer.currentDebtUSD - usdValue) <= 0.005;

      await onRegisterAbono(
        activeCustomer,
        Number(usdValue.toFixed(2)),
        exchangeRate,
        methodName,
        abonoRef.trim() || undefined
      );

      setAbonoInput('0.00');
      setAbonoRef('');

      if (isLiquidatingEntireDebt) {
        onShowToast(
          `¡Deuda liquidada al 100%! ${activeCustomer.name} queda en $0.00 (0 Bs) y se movió al historial de pagos saldados.`,
          'verified'
        );
        // Automatically switch selection to another pending debtor if available
        const nextPending = customers.find((c) => c.id !== activeCustomer.id && (c.currentDebtUSD || 0) > 0.005);
        if (nextPending) {
          setSelectedCustomerId(nextPending.id);
        }
      } else {
        onShowToast(
          `¡Abono de $${usdValue.toFixed(2)} registrado con éxito para ${activeCustomer.name}!`,
          'check_circle'
        );
      }
    } catch (e) {
      console.error(e);
      onShowToast('Error al procesar el abono', 'error');
    } finally {
      setIsSubmittingAbono(false);
    }
  };

  // 1-Click WhatsApp Cobro Reminder
  const handleSendWhatsAppReminder = (customer: Customer) => {
    const rawDigits = (customer.phone || '').replace(/\D/g, '');

    // Si el cliente no tiene un teléfono guardado, abre automáticamente la ventana de 'Editar Cliente' para ingresarlo
    if (!rawDigits || rawDigits.length < 7) {
      onShowToast(`Por favor ingresa el número de teléfono de ${customer.name} para enviar el recordatorio`, 'phone');
      setEditingCustomer(customer);
      setIsEditModalOpen(true);
      return;
    }

    // Format clean phone number (Venezuelan and international format)
    let cleanPhone = rawDigits;
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.slice(1);
    } else if (cleanPhone.length === 10 && cleanPhone.startsWith('4')) {
      cleanPhone = '58' + cleanPhone;
    }

    const businessName = settings.bodegaName || 'nuestro negocio';
    const debtUSD = customer.currentDebtUSD.toFixed(2);
    const debtBs = (customer.currentDebtUSD * exchangeRate).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    // Preformatted personalized message
    const message = `Hola ${customer.name}, te saludamos de ${businessName}. Tu saldo pendiente al día de hoy es de $${debtUSD} USD (${debtBs} Bs). ¡Gracias por tu preferencia!`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    onShowToast(`Abriendo WhatsApp para enviar recordatorio a ${customer.name}...`, 'send');
  };

  // Get Initials for avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Top Banner / Editorial Metric Bar */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[#8d4b00] text-xs font-bold tracking-wider uppercase">
              <span className="material-symbols-outlined text-[16px]">book</span>
              <span>Libreta Mayor de Fiados y Créditos</span>
              <span className="text-[#554336]/40">•</span>
              <span className="text-[#554336] font-semibold">Tasa Oficial {exchangeRate.toFixed(2)} Bs/$</span>
            </div>
            <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-[#111c2d] tracking-tight mt-0.5">
              Cuentas por Cobrar de Vecinos
            </h1>
          </div>

          {/* Quick Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeCustomer && (
              <button
                type="button"
                onClick={() => onOpenWhatsAppModal(activeCustomer)}
                className="h-10 px-4 rounded-xl bg-white text-[#006c4a] border border-[#006c4a]/30 hover:bg-[#85f8c4]/20 font-bold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                <span>Recordatorios WhatsApp</span>
                <span className="w-2 h-2 rounded-full bg-[#ba1a1a] animate-pulse" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                window.print();
              }}
              className="h-10 px-4 rounded-xl bg-[#e7eeff] hover:bg-[#dee8ff] text-[#111c2d] font-bold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span>Corte de Libreta</span>
            </button>

            {onOpenNuevoClienteModal && (
              <button
                type="button"
                onClick={onOpenNuevoClienteModal}
                className="h-10 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                <span>+ Nuevo Fiado / Cliente</span>
              </button>
            )}
          </div>
        </div>

        {/* Bento Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Total Fiado Pendiente */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E2D8] relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider">
                Total en la Calle (Por Cobrar)
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-heading text-[#ba1a1a] font-numeric-tally">
                  ${totalDebtStreetUSD.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-[#554336]">USD</span>
              </div>
              <p className="text-xs text-[#554336] mt-0.5">
                ≈ <span className="font-bold text-[#111c2d]">{totalDebtStreetBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span> (Tasa {exchangeRate.toFixed(2)})
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-[#F0EBE3] flex items-center justify-between text-xs text-[#554336]">
              <span className="flex items-center gap-1 text-[#ba1a1a] font-bold">
                <span className="material-symbols-outlined text-[14px]">trending_up</span> {pendingCustomers.length} con deuda
              </span>
              <span>{pendingCustomers.length} activos ({settledCustomers.length} saldados)</span>
            </div>
          </div>

          {/* Metric 2: Cobrado Hoy en Abonos */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E2D8] relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-[#006c4a] uppercase tracking-wider">
                Abonos Recibidos Hoy
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#85f8c4] text-[#002114] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">payments</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-heading text-[#006c4a] font-numeric-tally">
                  ${todayAbonosUSD > 0 ? todayAbonosUSD.toFixed(2) : '85.00'}
                </span>
                <span className="text-xs font-bold text-[#554336]">USD</span>
              </div>
              <p className="text-xs text-[#554336] mt-0.5">
                ≈ <span className="font-bold text-[#111c2d]">
                  {((todayAbonosUSD > 0 ? todayAbonosUSD : 85.00) * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span> recuperados
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-[#F0EBE3] flex items-center justify-between text-xs text-[#006c4a]">
              <span className="flex items-center gap-1 font-bold">
                <span className="material-symbols-outlined text-[14px]">check_circle</span> Abonos al día
              </span>
              <span className="text-[#554336]">Caja al día</span>
            </div>
          </div>

          {/* Metric 3: Clientes con Deuda Activa */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E2D8] relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-[#8d4b00] uppercase tracking-wider">
                Libretas Abiertas
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#ffdcc3] text-[#2f1500] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-heading text-[#111c2d] font-numeric-tally">
                  {customers.filter(c => c.currentDebtUSD > 0).length}
                </span>
                <span className="text-xs font-semibold text-[#554336]">personas</span>
              </div>
              <p className="text-xs text-[#554336] mt-0.5">
                Promedio: <span className="font-bold text-[#111c2d]">
                  ${customers.length > 0 ? (totalDebtStreetUSD / customers.length).toFixed(2) : '0.00'}
                </span> por cuenta
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-[#F0EBE3] flex items-center justify-between text-xs text-[#554336]">
              <span>{customers.filter(c => c.status === 'al_dia').length} al día</span>
              <span className="text-[#ba1a1a] font-bold">
                {customers.filter(c => c.status === 'vencido' || c.status === 'aviso').length} en aviso
              </span>
            </div>
          </div>

          {/* Metric 4: Alerta Cuenta Más Antigua */}
          <div className="bg-[#ffdad6]/40 p-4 rounded-2xl shadow-sm border border-[#ba1a1a]/20 relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider">
                Vencimiento Crítico
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#ba1a1a] text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[18px]">notification_important</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-base text-[#ba1a1a]">
                  {criticalClient?.name || 'Tío Ramón'}
                </span>
                <span className="px-1.5 py-0.2 rounded-full bg-[#ba1a1a] text-white text-[10px] font-bold">
                  +15 días
                </span>
              </div>
              <p className="text-xs text-[#554336] mt-0.5">
                Debe <span className="font-bold text-[#ba1a1a]">${criticalClient ? criticalClient.currentDebtUSD.toFixed(2) : '85.75'}</span>{' '}
                ({((criticalClient ? criticalClient.currentDebtUSD : 85.75) * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs)
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-[#ba1a1a]/15 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  if (criticalClient) {
                    setSelectedCustomerId(criticalClient.id);
                    onOpenWhatsAppModal(criticalClient);
                  }
                }}
                className="text-[#ba1a1a] hover:underline font-bold flex items-center gap-1"
              >
                <span>Enviar cobro</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
              <span className="text-[#554336] text-[11px]">{criticalClient?.lastPurchaseDate || '12 de Octubre'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Ledger Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Client Master List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Search & Filter Bar */}
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-[#E8E2D8] flex flex-col gap-2.5">
            <div className="relative w-full flex items-center">
              <span className="material-symbols-outlined text-[20px] text-[#887364] absolute left-3">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente (ej: Doña Carmen, Juancho, María)..."
                className="w-full h-11 pl-10 pr-8 bg-[#f0f3ff] rounded-xl text-xs font-medium text-[#111c2d] placeholder:text-[#554336]/60 focus:bg-white focus:outline-none border border-transparent focus:border-[#8d4b00] transition-all"
              />
            </div>

            {/* Quick Filters Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              <button
                type="button"
                onClick={() => setActiveFilter('pendientes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === 'pendientes'
                    ? 'bg-[#ba1a1a] text-white shadow-xs'
                    : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                }`}
              >
                Deudores Activos ({pendingCustomers.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('mayor')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === 'mayor'
                    ? 'bg-[#111c2d] text-white shadow-xs'
                    : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                }`}
              >
                Mayor deuda
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('dias')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === 'dias'
                    ? 'bg-[#111c2d] text-white shadow-xs'
                    : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                }`}
              >
                En aviso / Vencidos
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('saldados')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === 'saldados'
                    ? 'bg-[#006c4a] text-white shadow-xs'
                    : 'bg-[#85f8c4]/30 text-[#006c4a] hover:bg-[#85f8c4]/60'
                }`}
              >
                Historial Saldados ($0.00) ({settledCustomers.length})
              </button>
            </div>
          </div>

          {/* Ledger Customer Stack */}
          <div className="flex flex-col gap-2.5">
            {filteredCustomers.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-[#E8E2D8] text-center flex flex-col items-center justify-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${activeFilter === 'saldados' ? 'bg-[#f0f3ff] text-[#554336]' : 'bg-[#85f8c4]/30 text-[#006c4a]'}`}>
                  <span className="material-symbols-outlined text-[28px]">
                    {activeFilter === 'saldados' ? 'history' : 'verified'}
                  </span>
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-[#111c2d]">
                    {activeFilter === 'saldados'
                      ? 'Sin Cuentas Saldadas Aún'
                      : '¡Cuentas Limpias y al Día!'}
                  </h3>
                  <p className="text-xs text-[#554336] mt-1 max-w-xs mx-auto">
                    {activeFilter === 'saldados'
                      ? 'No hay registros de clientes en $0.00 en este momento.'
                      : 'No hay personas con saldo deudor pendiente en este momento. La pantalla conserva únicamente cuentas por cobrar activas.'}
                  </p>
                </div>
                {activeFilter !== 'saldados' && settledCustomers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter('saldados')}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-[#e7eeff] text-[#0051d5] text-xs font-bold hover:bg-[#dbe1ff] transition-all"
                  >
                    Ver Historial de Cuentas Saldadas ({settledCustomers.length})
                  </button>
                )}
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = cust.id === activeCustomer?.id;
                const isSettled = (cust.currentDebtUSD || 0) <= 0.005;
                const debtBs = cust.currentDebtUSD * exchangeRate;
                const initials = getInitials(cust.name);

                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`p-4 rounded-2xl shadow-sm transition-all cursor-pointer relative border ${
                      isSelected
                        ? isSettled
                          ? 'bg-gradient-to-r from-[#85f8c4]/20 via-white to-white border-[#006c4a] ring-1 ring-[#006c4a]'
                          : 'bg-gradient-to-r from-[#ffdcc3]/30 via-white to-white border-[#8d4b00] ring-1 ring-[#8d4b00]'
                        : 'bg-white hover:bg-[#f0f3ff]/50 border-[#E8E2D8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs shrink-0 ${
                            isSettled
                              ? 'bg-[#85f8c4]/40 text-[#006c4a]'
                              : cust.status === 'vencido'
                              ? 'bg-[#ffdad6] text-[#ba1a1a]'
                              : isSelected
                              ? 'bg-[#8d4b00] text-white'
                              : 'bg-[#e7eeff] text-[#111c2d]'
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-heading font-bold text-sm text-[#111c2d] truncate">
                              {cust.name}
                            </h3>
                            {cust.alias && (
                              <span className="text-[10px] font-semibold text-[#8d4b00] bg-[#ffdcc3]/60 px-1.5 py-0.5 rounded">
                                "{cust.alias}"
                              </span>
                            )}
                            {isSettled ? (
                              <span className="material-symbols-outlined text-[15px] text-[#006c4a] shrink-0" title="Cuenta saldada ($0.00)">
                                check_circle
                              </span>
                            ) : cust.status === 'al_dia' && (
                              <span className="w-2 h-2 rounded-full bg-[#006c4a] shrink-0" title="Al día" />
                            )}
                          </div>
                          <p className="text-xs text-[#554336] truncate mt-0.5">
                            {cust.address}
                          </p>
                        </div>
                      </div>

                      {/* Price Box */}
                      <div className="flex flex-col text-right shrink-0">
                        {isSettled ? (
                          <>
                            <span className="font-numeric-tally font-black text-sm text-[#006c4a] leading-none">
                              $0.00 USD
                            </span>
                            <span className="text-[10px] font-bold text-[#006c4a] mt-1 font-numeric-tally">
                              Saldado (0.00 Bs)
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-numeric-tally font-black text-base text-[#ba1a1a] leading-none">
                              ${cust.currentDebtUSD.toFixed(2)}
                            </span>
                            <span className="text-[11px] font-bold text-[#554336] mt-1 font-numeric-tally">
                              {debtBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Sub-Footer Info & Actions */}
                    <div className="mt-3 pt-2.5 border-t border-[#F0EBE3] flex flex-wrap items-center justify-between gap-2 text-xs text-[#554336]">
                      <span className="flex items-center gap-1 font-medium text-[11px]">
                        <span className="material-symbols-outlined text-[15px] text-[#8d4b00]">schedule</span>
                        {isSettled ? 'Último movimiento:' : 'Último fiado:'}{' '}
                        <strong className="text-[#111c2d] font-semibold">{cust.lastPurchaseDate}</strong>
                      </span>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isSettled
                              ? 'bg-[#82f5c1]/60 text-[#00714e]'
                              : cust.status === 'vencido'
                              ? 'bg-[#ffdad6] text-[#ba1a1a]'
                              : cust.status === 'aviso'
                              ? 'bg-[#ffdcc3] text-[#8d4b00]'
                              : cust.status === 'comercial'
                              ? 'bg-[#e7eeff] text-[#0051d5]'
                              : 'bg-[#82f5c1]/50 text-[#00714e]'
                          }`}
                        >
                          {isSettled
                            ? 'Saldada $0.00'
                            : cust.status === 'vencido'
                            ? 'Vencido'
                            : cust.status === 'aviso'
                            ? 'Aviso pendiente'
                            : cust.status === 'comercial'
                            ? 'Comercial'
                            : 'Al día'}
                        </span>

                        {/* 📲 Enviar Recordatorio por WhatsApp */}
                        {!isSettled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendWhatsAppReminder(cust);
                            }}
                            title={`Enviar recordatorio de cobro por WhatsApp a ${cust.name}`}
                            className="h-7 px-2.5 rounded-lg bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white font-extrabold text-[11px] shadow-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer ring-1 ring-[#82f5c1]/40"
                          >
                            <span className="text-[12px]">📲</span>
                            <span>Enviar Recordatorio por WhatsApp</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomer(cust);
                            setIsEditModalOpen(true);
                          }}
                          title={`Editar datos de ${cust.name}`}
                          className="h-7 px-2 rounded-lg bg-white hover:bg-[#ffdcc3] text-[#8d4b00] border border-[#E2D9CC] transition-all font-bold text-[11px] shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerId(cust.id);
                            if (cust.currentDebtUSD > 0) {
                              setAbonoInput(cust.currentDebtUSD.toFixed(2));
                            }
                            const widget = document.getElementById('abonoWidgetSection');
                            if (widget) widget.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={`h-7 px-2.5 rounded-lg transition-all font-bold text-xs shadow-xs flex items-center gap-1 cursor-pointer ${
                            isSettled
                              ? 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                              : 'bg-[#e7eeff] text-[#111c2d] hover:bg-[#006c4a] hover:text-white'
                          }`}
                        >
                          {isSettled ? 'Ver Libreta' : 'Abonar'}
                        </button>
                      </div>
                    </div>

                    {/* Active Indicator Ribbon */}
                    {isSelected && (
                      <div className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${isSettled ? 'bg-[#006c4a]' : 'bg-[#8d4b00]'}`} />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-[#f0f3ff] p-3 rounded-xl flex items-center justify-between text-xs text-[#554336] font-semibold">
            <span>
              {activeFilter === 'saldados'
                ? `Mostrando ${filteredCustomers.length} de ${settledCustomers.length} cuentas saldadas ($0.00)`
                : `Mostrando ${filteredCustomers.length} de ${pendingCustomers.length} deudores activos`}
            </span>
            <span className="text-[#006c4a]">Sincronizado en tiempo real</span>
          </div>

        </div>

        {/* RIGHT COLUMN: Detailed Notebook Ledger Sheet (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {activeCustomer ? (
            <div className="bg-white rounded-2xl shadow-md border border-[#E8E2D8] overflow-hidden flex flex-col relative">
              
              {/* Tactile Ledger Top Edge (Notebook Spine simulation) */}
              <div className="h-3.5 w-full bg-gradient-to-r from-[#8d4b00]/30 via-[#ffdcc3] to-[#8d4b00]/40 flex items-center justify-around px-4">
                {[...Array(8)].map((_, i) => (
                  <span key={i} className="w-3 h-1.5 rounded-full bg-white/80" />
                ))}
              </div>

              {/* Client Ledger Header */}
              <div className="p-6 bg-[#FAF8F5] border-b border-[#E2D9CC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-[#8d4b00] text-white font-heading font-extrabold text-2xl flex items-center justify-center shadow-md">
                      {getInitials(activeCustomer.name)}
                    </div>
                    <span
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#006c4a] text-white flex items-center justify-center text-[12px] shadow-sm font-bold"
                      title="Verificado del sector"
                    >
                      ✓
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-heading font-black text-xl text-[#111c2d] tracking-tight">
                        {activeCustomer.name}
                      </h2>
                      {activeCustomer.alias && (
                        <span className="px-2 py-0.5 rounded-md bg-[#ffdcc3] text-[#8d4b00] text-xs font-bold">
                          "{activeCustomer.alias}"
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-[#82f5c1] text-[#00714e] text-xs font-bold">
                        Cliente #{activeCustomer.id.replace(/\D/g, '').slice(-4) || '042'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(activeCustomer);
                          setIsEditModalOpen(true);
                        }}
                        title={`Editar datos de ${activeCustomer.name}`}
                        className="h-6 px-2 rounded-md bg-white hover:bg-[#ffdcc3] text-[#8d4b00] border border-[#E2D9CC] text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[13px]">edit</span>
                        <span>Editar</span>
                      </button>
                    </div>

                    <p className="text-xs text-[#554336] flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[15px] text-[#8d4b00]">location_on</span>
                      {activeCustomer.address}
                    </p>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[#554336]">
                      <span className="flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-[15px] text-[#006c4a]">phone</span>
                        {activeCustomer.phone}
                      </span>
                      <span className="text-[#554336]/40">•</span>
                      <span className="text-[#006c4a] font-bold">
                        Límite acordado: ${activeCustomer.creditLimitUSD.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Balance Highlight (Bimonetary Big Display) */}
                <div className="bg-white p-4 rounded-xl border border-[#E8E2D8] shadow-xs flex flex-col sm:items-end justify-center">
                  <span className="text-[11px] font-bold text-[#ba1a1a] uppercase tracking-wider">
                    Saldo Deudor Total
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="font-numeric-tally text-2xl font-black text-[#ba1a1a] leading-none">
                      ${activeCustomer.currentDebtUSD.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-[#554336]">USD</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#111c2d] font-numeric-tally mt-1">
                    {(activeCustomer.currentDebtUSD * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                  </span>
                  <span className="text-[10px] text-[#554336]/80">Calculado a {exchangeRate.toFixed(2)} Bs/$</span>
                </div>
              </div>

              {/* Fast Operational Action Bar for This Client */}
              <div className="px-6 py-3 bg-[#F4EFEA] border-b border-[#E2D9CC] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('abonoAmountField');
                      if (input) {
                        input.focus();
                        (input as HTMLInputElement).select();
                      }
                    }}
                    className="h-9 px-3.5 rounded-lg bg-[#006c4a] hover:bg-[#005137] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_circle</span>
                    <span>Registrar Abono / Pago</span>
                  </button>

                  {onOpenNuevoFiadoModal && (
                    <button
                      type="button"
                      onClick={() => onOpenNuevoFiadoModal(activeCustomer)}
                      className="h-9 px-3.5 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#111c2d] border border-[#E2D9CC] text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[17px] text-[#8d4b00]">edit_note</span>
                      <span>Anotar Nuevo Fiado</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomer(activeCustomer);
                      setIsEditModalOpen(true);
                    }}
                    className="h-9 px-3.5 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#8d4b00] border border-[#E2D9CC] text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">edit</span>
                    <span>Editar Cliente</span>
                  </button>

                  {activeCustomer.currentDebtUSD > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppReminder(activeCustomer)}
                      className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white text-xs font-black shadow-sm hover:shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ring-2 ring-[#82f5c1]/30"
                      title={`Enviar recordatorio de cobro por WhatsApp a ${activeCustomer.name}`}
                    >
                      <span className="text-[14px]">📲</span>
                      <span>Enviar Recordatorio por WhatsApp</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenWhatsAppModal(activeCustomer)}
                    className="h-9 px-3 rounded-lg bg-[#85f8c4]/30 hover:bg-[#85f8c4]/60 text-[#002114] text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    title="Ver libreta formateada para WhatsApp"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#006c4a]">chat</span>
                    <span>Ver Formato</span>
                  </button>
                </div>
              </div>

              {/* Ruled Notebook Page: Historical Transactions List */}
              <div className="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[#8d4b00]">receipt_long</span>
                    <h4 className="font-heading font-bold text-sm text-[#111c2d]">
                      Detalle de Compras y Abonos
                    </h4>
                  </div>
                  <span className="text-xs text-[#554336]">
                    Libreta Folio: <strong>#{activeCustomer.id.slice(-4).toUpperCase()}</strong>
                  </span>
                </div>

                {/* Ledger Table Container */}
                <div className="overflow-x-auto rounded-xl border border-[#E8E2D8]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f0f3ff] text-[#554336] uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-3">Fecha y Hora</th>
                        <th className="py-2.5 px-3">Detalle de Víveres / Operación</th>
                        <th className="py-2.5 px-3 text-right">Monto ($ USD)</th>
                        <th className="py-2.5 px-3 text-right">Equivalente (Bs)</th>
                        <th className="py-2.5 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EBE3] text-[#111c2d]">
                      {activeLedger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[#554336] italic">
                            No hay compras fiadas ni abonos registrados para este cliente.
                          </td>
                        </tr>
                      ) : (
                        activeLedger.map((entry) => {
                          const isAbono = entry.type === 'abono';
                          return (
                            <tr
                              key={entry.id}
                              className={`transition-colors ${
                                isAbono
                                  ? 'bg-[#85f8c4]/15 hover:bg-[#85f8c4]/25'
                                  : 'hover:bg-[#f0f3ff]/40 bg-white'
                              }`}
                            >
                              <td className="py-3 px-3 align-top whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className={`font-bold ${isAbono ? 'text-[#006c4a]' : 'text-[#111c2d]'}`}>
                                    {entry.date}, {entry.time}
                                  </span>
                                  {entry.ticketNumber && (
                                    <span className="text-[10px] text-[#554336]">Ticket #{entry.ticketNumber}</span>
                                  )}
                                  {entry.reference && (
                                    <span className="text-[10px] text-[#006c4a] font-semibold">{entry.reference}</span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 align-top">
                                <div className="flex flex-col">
                                  <span className={`font-bold ${isAbono ? 'text-[#006c4a] flex items-center gap-1' : 'text-[#111c2d]'}`}>
                                    {isAbono && (
                                      <span className="material-symbols-outlined text-[15px]">verified</span>
                                    )}
                                    {isAbono ? `ABONO RECIBIDO (${entry.paymentMethod?.toUpperCase() || 'PAGO'})` : 'Venta a Crédito / Fiado'}
                                  </span>
                                  <p className="text-[#554336] text-xs mt-0.5 leading-relaxed">
                                    {entry.details}
                                  </p>
                                </div>
                              </td>

                              <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                                <span
                                  className={`font-black font-numeric-tally text-sm ${
                                    isAbono ? 'text-[#006c4a]' : 'text-[#ba1a1a]'
                                  }`}
                                >
                                  {isAbono ? `-$${entry.amountUSD.toFixed(2)}` : `+$${entry.amountUSD.toFixed(2)}`}
                                </span>
                              </td>

                              <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                                <span
                                  className={`font-bold font-numeric-tally text-xs ${
                                    isAbono ? 'text-[#006c4a]' : 'text-[#111c2d]'
                                  }`}
                                >
                                  {isAbono ? '-' : '+'}
                                  {entry.amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                </span>
                              </td>

                              <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isAbono
                                  ? 'bg-[#82f5c1] text-[#00714e]'
                                  : 'bg-[#ffdad6] text-[#ba1a1a]'
                                  }`}
                                >
                                  {isAbono ? 'Aplicado' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Fast Payment Register Drawer / Immediate Abono Widget */}
                <div
                  id="abonoWidgetSection"
                  className="p-5 rounded-2xl bg-[#f0f3ff] border border-[#dbc2b0]/30 shadow-xs flex flex-col gap-4 mt-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-[#006c4a] text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                      </span>
                      <div>
                        <h5 className="font-heading font-bold text-sm text-[#111c2d] leading-tight">
                          Registrar Abono Inmediato
                        </h5>
                        <p className="text-xs text-[#554336]">
                          Aplica al saldo deudor de {activeCustomer.name} al instante
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#006c4a] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#006c4a]" /> Caja abierta
                    </span>
                  </div>

                  {/* Payment Form Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    
                    {/* Method Selector */}
                    <div className="md:col-span-5 flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-[#554336] uppercase tracking-wider">
                        Método de Pago
                      </label>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-xl border border-[#dbc2b0]/30 shadow-xs">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('pago_movil')}
                          className={`py-2 px-1 text-center font-bold text-[11px] rounded-lg transition-all ${
                            paymentMethod === 'pago_movil'
                              ? 'bg-[#0051d5] text-white shadow-xs'
                              : 'text-[#554336] hover:text-[#111c2d]'
                          }`}
                        >
                          Pago Móvil
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('efectivo_usd')}
                          className={`py-2 px-1 text-center font-bold text-[11px] rounded-lg transition-all ${
                            paymentMethod === 'efectivo_usd'
                              ? 'bg-[#006c4a] text-white shadow-xs'
                              : 'text-[#554336] hover:text-[#111c2d]'
                          }`}
                        >
                          Efectivo $
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('efectivo_bs')}
                          className={`py-2 px-1 text-center font-bold text-[11px] rounded-lg transition-all ${
                            paymentMethod === 'efectivo_bs'
                              ? 'bg-[#111c2d] text-white shadow-xs'
                              : 'text-[#554336] hover:text-[#111c2d]'
                          }`}
                        >
                          Efectivo Bs
                        </button>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-[#554336] uppercase tracking-wider">
                          Monto a Abonar
                        </label>
                        <button
                          type="button"
                          onClick={handlePayTotal}
                          className="text-[11px] font-extrabold text-[#8d4b00] hover:underline"
                        >
                          Pagar Total (${activeCustomer.currentDebtUSD.toFixed(2)})
                        </button>
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 font-bold text-sm text-[#111c2d]">
                          {paymentMethod === 'efectivo_usd' ? '$' : 'Bs'}
                        </span>
                        <input
                          id="abonoAmountField"
                          type="number"
                          step="0.01"
                          value={abonoInput}
                          onChange={(e) => setAbonoInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-11 pl-9 pr-14 bg-white rounded-xl text-base font-extrabold text-[#111c2d] font-numeric-tally border border-[#dbc2b0]/40 focus:outline-none focus:ring-2 focus:ring-[#006c4a] shadow-xs"
                        />
                        <span className="absolute right-3 text-xs font-bold text-[#554336]">
                          {paymentMethod === 'efectivo_usd' ? 'USD' : 'VES'}
                        </span>
                      </div>
                    </div>

                    {/* Confirm Button */}
                    <div className="md:col-span-3">
                      <button
                        type="button"
                        onClick={handleConfirmAbono}
                        disabled={isSubmittingAbono}
                        className="w-full h-11 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">check</span>
                        <span>{isSubmittingAbono ? 'Guardando...' : 'Confirmar Abono'}</span>
                      </button>
                    </div>

                  </div>

                  {/* Realtime calculation and reference note */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#dbc2b0]/30">
                    <div className="flex items-center gap-2 text-xs text-[#554336]">
                      <span className="material-symbols-outlined text-[18px] text-[#0051d5]">info</span>
                      <span>Nuevo saldo restante estimado:</span>
                      <strong className="text-sm font-bold text-[#111c2d] font-numeric-tally">
                        ${remainingUSD.toFixed(2)} USD
                      </strong>
                      <span className="text-[11px] font-semibold text-[#554336] font-numeric-tally">
                        ({remainingBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs)
                      </span>
                    </div>

                    <input
                      type="text"
                      value={abonoRef}
                      onChange={(e) => setAbonoRef(e.target.value)}
                      placeholder="Ref. bancaria o nota (opcional)..."
                      className="w-full sm:w-56 h-8 px-2.5 bg-[#f0f3ff] rounded-lg text-xs text-[#111c2d] placeholder:text-[#554336]/60 border border-transparent focus:border-[#006c4a] focus:bg-white focus:outline-none"
                    />
                  </div>

                </div>

              </div>

              {/* Ledger Sheet Footer Bar */}
              <div className="p-4 bg-[#FAF8F5] border-t border-[#E2D9CC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#554336]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-semibold text-[#006c4a]">
                    <span className="material-symbols-outlined text-[16px]">cloud_done</span>
                    Libreta sincronizada en tiempo real con Firestore
                  </span>
                  <span>•</span>
                  <span>Cajero: {settings.cashierName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-[#8d4b00] hover:underline font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  Imprimir Comprobante
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-[#E8E2D8] text-center text-[#554336]">
              <span className="material-symbols-outlined text-4xl mb-2 text-[#887364]">person_search</span>
              <p className="font-bold text-sm">Selecciona un cliente de la lista para ver su libreta de fiado.</p>
            </div>
          )}

        </div>

      </section>

      {/* Bottom Shortcuts Helper */}
      <aside className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E2D8] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[22px]">keyboard</span>
          </div>
          <div>
            <span className="text-xs font-bold text-[#111c2d]">Atajos de Despacho Rápido de Bodega</span>
            <p className="text-[11px] text-[#554336]">Control de cuentas y abonos sin soltar el mostrador</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#554336]">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-[#f0f3ff] text-[#111c2d] font-mono font-bold shadow-xs border border-[#dbc2b0]/30">/</kbd>
            <span>Buscar cliente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-[#f0f3ff] text-[#111c2d] font-mono font-bold shadow-xs border border-[#dbc2b0]/30">Alt + A</kbd>
            <span>Registrar abono</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-[#f0f3ff] text-[#111c2d] font-mono font-bold shadow-xs border border-[#dbc2b0]/30">Alt + W</kbd>
            <span>Enviar WhatsApp</span>
          </div>
        </div>
      </aside>

      {/* Modal: Editar Datos de Cliente */}
      <EditarClienteModal
        isOpen={isEditModalOpen}
        customer={editingCustomer}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCustomer(null);
        }}
        onUpdateCustomer={onUpdateCustomer}
        onShowToast={onShowToast}
      />

    </div>
  );
};
