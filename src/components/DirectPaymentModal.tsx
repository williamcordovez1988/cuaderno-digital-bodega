import React, { useState } from 'react';
import { PLAN_PRICING } from '../firebase/types';

interface DirectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bcvRate: number;
  initialPlan?: 'pro' | 'premium';
  defaultStoreName?: string;
  defaultEmail?: string;
  onPaymentReported?: () => void;
}

export const DirectPaymentModal: React.FC<DirectPaymentModalProps> = ({
  isOpen,
  onClose,
  bcvRate,
  initialPlan = 'pro',
  defaultStoreName = '',
  defaultEmail = '',
  onPaymentReported
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'premium'>(initialPlan);
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<'pago_movil' | 'binance' | 'zinli'>('pago_movil');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form fields for reporting
  const [reportStoreName, setReportStoreName] = useState(defaultStoreName);
  const [reportUserEmail, setReportUserEmail] = useState(defaultEmail);
  const [reportRefNumber, setReportRefNumber] = useState('');

  if (!isOpen) return null;

  const priceUSD = selectedPlan === 'premium' ? PLAN_PRICING.premium : PLAN_PRICING.pro;
  const priceBs = (priceUSD * bcvRate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleReportPaymentWhatsApp = () => {
    const store = reportStoreName.trim() || defaultStoreName || 'Mi Bodega';
    const email = reportUserEmail.trim() || defaultEmail || 'Sin especificar';
    const ref = reportRefNumber.trim() || 'Pendiente de adjuntar comprobante';
    const planName = selectedPlan === 'premium' ? 'Plan Premium VIP ($19.99/mes)' : 'Plan Pro ($9.99/mes)';
    const methodNames: Record<string, string> = {
      pago_movil: 'Pago Móvil / Banco Mercantil (0105)',
      binance: 'Binance Pay (USDT)',
      zinli: 'Zinli Billetera Digital USD'
    };
    const methodStr = methodNames[selectedPaymentTab];

    const message =
      `*Reporte de Pago de Suscripción - Cuaderno Digital Bodega*\n\n` +
      `🏪 *Negocio:* ${store}\n` +
      `👤 *Correo:* ${email}\n` +
      `⭐ *Plan Solicitado:* ${planName}\n` +
      `💵 *Monto:* $${priceUSD.toFixed(2)} USD ≈ ${priceBs} Bs\n` +
      `💳 *Método de Pago:* ${methodStr}\n` +
      `🧾 *Nro. de Referencia:* ${ref}\n\n` +
      `Solicito la confirmación y activación de mi cuenta. ¡Gracias!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/584241289468?text=${encoded}`, '_blank');

    if (onPaymentReported) {
      onPaymentReported();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-[#E8E2D8] max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-[#ffdcc3] via-[#fff1e5] to-white p-5 sm:p-6 border-b border-[#E8E2D8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#8d4b00] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black font-heading text-[#111c2d] tracking-tight">
                  Pago Directo de Suscripción
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#006c4a] text-white text-[10px] font-black uppercase">
                  Activación Rápida
                </span>
              </div>
              <p className="text-xs text-[#554336]">
                Transfiere y reporta por WhatsApp para activar tu plan al instante
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#554336] hover:text-[#111c2d] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            title="Cerrar ventana"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* Step 1: Select Plan */}
          <div>
            <label className="block text-xs font-black text-[#554336] uppercase tracking-wider mb-2">
              1. Selecciona el Plan a Pagar:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPlan('pro')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  selectedPlan === 'pro'
                    ? 'border-[#8d4b00] bg-[#ffdcc3]/30 ring-2 ring-[#8d4b00]/30 shadow-xs'
                    : 'border-[#E8E2D8] bg-[#FAF8F5] hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-[#111c2d]">Plan Pro</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-[#8d4b00] text-white text-[9px] font-black uppercase">
                      Popular
                    </span>
                  </div>
                  <p className="text-[11px] text-[#554336] leading-tight">
                    Inventario ilimitado, 20 escaneos IA/mes, 3 usuarios.
                  </p>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-base font-black text-[#8d4b00] font-numeric-tally">$9.99</span>
                  <span className="text-[10px] text-[#554336]"> / mes</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPlan('premium')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  selectedPlan === 'premium'
                    ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-600/30 shadow-xs'
                    : 'border-[#E8E2D8] bg-[#FAF8F5] hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-[#111c2d]">Plan Premium</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-purple-600 text-white text-[9px] font-black uppercase">
                      VIP
                    </span>
                  </div>
                  <p className="text-[11px] text-[#554336] leading-tight">
                    Lectura de facturas IA ILIMITADA, usuarios ilimitados.
                  </p>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-base font-black text-purple-700 font-numeric-tally">$19.99</span>
                  <span className="text-[10px] text-[#554336]"> / mes</span>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Choose Payment Method */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-[#554336] uppercase tracking-wider">
                2. Selecciona el Método de Pago:
              </label>
              <span className="text-[11px] text-[#006c4a] font-bold">
                Tasa BCV: {bcvRate.toFixed(2)} Bs/$
              </span>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[#f0f3ff] border border-[#dbc2b0]/30 mb-3">
              <button
                type="button"
                onClick={() => setSelectedPaymentTab('pago_movil')}
                className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedPaymentTab === 'pago_movil'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🇻🇪</span>
                <span className="truncate">Pago Móvil</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentTab('binance')}
                className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedPaymentTab === 'binance'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🟡</span>
                <span className="truncate">Binance Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentTab('zinli')}
                className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  selectedPaymentTab === 'zinli'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🟢</span>
                <span className="truncate">Zinli USD</span>
              </button>
            </div>

            {/* Payment Details Container */}
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#dbc2b0]/40 space-y-3">
              
              {/* Option 1: Pago Móvil / Banco Mercantil */}
              {selectedPaymentTab === 'pago_movil' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#E8E2D8] gap-1">
                    <span className="text-xs font-black text-[#111c2d]">
                      🇻🇪 Pago Móvil / Banco Mercantil (0105)
                    </span>
                    <span className="text-xs font-black text-[#006c4a] bg-[#82f5c1]/20 px-2.5 py-1 rounded-lg">
                      Monto: ${priceUSD.toFixed(2)} USD ≈ {priceBs} Bs
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Banco:</span>
                        <span className="font-extrabold text-[#111c2d]">Mercantil (0105)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('Mercantil', 'Banco')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Banco"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Banco' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Teléfono:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">04241289468</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('04241289468', 'Teléfono')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Teléfono"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Teléfono' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Cédula:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">17711254</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('17711254', 'Cédula')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Cédula"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Cédula' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Beneficiario:</span>
                        <span className="font-extrabold text-[#111c2d]">William Cordovez</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('William Cordovez', 'Beneficiario')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Beneficiario"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Beneficiario' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Option 2: Binance Pay (USDT) */}
              {selectedPaymentTab === 'binance' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#E8E2D8] gap-1">
                    <span className="text-xs font-black text-[#111c2d]">
                      🟡 Binance Pay (USDT)
                    </span>
                    <span className="text-xs font-black text-[#8d4b00] bg-[#ffdcc3]/40 px-2.5 py-1 rounded-lg">
                      Monto: ${priceUSD.toFixed(2)} USDT (0% comisión)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Binance ID:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">359875423</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('359875423', 'Binance ID')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Binance ID"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Binance ID' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Correo Binance:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">Williamcordovez@gmail.com</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('Williamcordovez@gmail.com', 'Correo Binance')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Correo Binance"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Correo Binance' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Option 3: Zinli */}
              {selectedPaymentTab === 'zinli' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#E8E2D8] gap-1">
                    <span className="text-xs font-black text-[#111c2d]">
                      🟢 Zinli Billetera Digital USD
                    </span>
                    <span className="text-xs font-black text-[#006c4a] bg-[#82f5c1]/20 px-2.5 py-1 rounded-lg">
                      Monto: ${priceUSD.toFixed(2)} USD
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Correo Zinli:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">Williamcordovezcn@gmail.com</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('Williamcordovezcn@gmail.com', 'Correo Zinli')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Correo Zinli"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Correo Zinli' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Titular:</span>
                        <span className="font-extrabold text-[#111c2d]">William Cordovez</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('William Cordovez', 'Titular')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar Titular"
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {copiedKey === 'Titular' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Step 3: Quick Confirmation Form */}
          <div>
            <label className="block text-xs font-black text-[#554336] uppercase tracking-wider mb-2">
              3. Datos para la Activación en el Panel Maestro:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[#111c2d] mb-1">
                  Nombre del Negocio:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Bodega La Milagrosa"
                  value={reportStoreName}
                  onChange={(e) => setReportStoreName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#111c2d] mb-1">
                  Correo Registrado:
                </label>
                <input
                  type="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={reportUserEmail}
                  onChange={(e) => setReportUserEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#111c2d] mb-1">
                  Nro. de Referencia:
                </label>
                <input
                  type="text"
                  placeholder="Ej. 12948293"
                  value={reportRefNumber}
                  onChange={(e) => setReportRefNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>
            </div>
          </div>

          {/* WhatsApp Activation Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleReportPaymentWhatsApp}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
              <span>📲 Reportar Pago por WhatsApp (+584241289468)</span>
            </button>
            <p className="text-[10px] text-center text-[#554336] mt-1.5">
              Al enviar tu reporte, el Super Admin verificará los fondos y activará tu cuenta de inmediato.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
