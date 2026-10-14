import React, { useState } from 'react';
import { Customer, BodegaSettings } from '../firebase/types';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  settings: BodegaSettings;
  exchangeRate: number;
  onShowToast: (msg: string, icon?: string) => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  customer,
  settings,
  exchangeRate,
  onShowToast
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !customer) return null;

  const debtBs = (customer.currentDebtUSD * exchangeRate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const messageText = `👋 ¡Hola ${customer.name}! Buenas tardes de parte de ${settings.bodegaName}.

Le pasamos el resumen actualizado de su libreta de fiado al día de hoy:

• Saldo total adeudado: $${customer.currentDebtUSD.toFixed(2)} USD (~${debtBs} Bs)
• Tasa BCV del día: ${exchangeRate.toFixed(2)} Bs/$
• Último fiado registrado: ${customer.lastPurchaseDate}

💳 Datos de Pago Móvil:
${settings.pagoMovilBank} • CI: ${settings.pagoMovilCI} • Tel: ${settings.pagoMovilPhone}

¡Muchas gracias por su preferencia vecina, que tenga feliz día!`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      onShowToast('¡Mensaje copiado al portapapeles!', 'content_copy');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onShowToast('Error al copiar texto', 'error');
    }
  };

  const handleLaunchWhatsApp = () => {
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const encoded = encodeURIComponent(messageText);
    const url = cleanPhone.length >= 10
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank');
    onShowToast('Abriendo chat de WhatsApp...', 'send');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150 border border-[#dbc2b0]/30">
        
        {/* Header */}
        <div className="p-5 bg-[#006c4a] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo de la Bodega"
                className="w-11 h-11 rounded-xl object-cover bg-white p-0.5 shadow-xs shrink-0 border border-white/20"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">chat</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-base">Recordatorio de Fiado</h3>
                {settings.bodegaName && (
                  <span className="px-2 py-0.2 rounded-md bg-white/20 text-[10px] font-bold truncate max-w-[150px]">
                    {settings.bodegaName}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-90">
                Para: {customer.name} ({customer.phone})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Digital Receipt Header with Logo if available */}
          {settings.logoUrl && (
            <div className="flex items-center gap-2.5 p-2 bg-[#f0f3ff] rounded-xl border border-[#dbc2b0]/30 shadow-2xs">
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-cover border border-[#8d4b00]/30 shrink-0"
              />
              <div className="text-[11px] leading-tight">
                <div className="font-extrabold text-[#111c2d]">{settings.bodegaName}</div>
                <div className="text-[10px] text-[#006c4a] font-bold">Comprobante Oficial y Saldo Digital</div>
              </div>
            </div>
          )}

          <label className="text-[11px] font-bold text-[#554336] uppercase tracking-wider">
            Mensaje Listo para Enviar
          </label>

          <div className="p-4 rounded-xl bg-[#f0f3ff] text-xs text-[#111c2d] space-y-2.5 leading-relaxed border border-[#dbc2b0]/20">
            <p>
              👋 <strong>¡Hola {customer.name}! Buenas tardes de parte de {settings.bodegaName}.</strong>
            </p>
            <p>Le pasamos el resumen actualizado de su libreta de fiado al día de hoy:</p>
            
            <div className="p-3 rounded-lg bg-white text-[#111c2d] font-mono text-xs my-1 border border-[#dbc2b0]/30 space-y-1">
              <div>
                • Saldo total adeudado: <strong>${customer.currentDebtUSD.toFixed(2)} USD</strong> (~{debtBs} Bs)
              </div>
              <div>
                • Tasa BCV del día: <strong>{exchangeRate.toFixed(2)} Bs/$</strong>
              </div>
              <div>
                • Último fiado registrado: {customer.lastPurchaseDate}
              </div>
            </div>

            <p className="text-xs">
              💳 <em>Datos de Pago Móvil:</em> {settings.pagoMovilBank} • CI: {settings.pagoMovilCI} • Tel: {settings.pagoMovilPhone}.
            </p>
            <p>¡Muchas gracias por su preferencia vecina, que tenga feliz día!</p>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs text-[#554336]">
            <span className="flex items-center gap-1 text-[#006c4a] font-bold">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Personalizado con tasa BCV activa
            </span>
            <button
              onClick={handleCopyText}
              className="text-[#8d4b00] hover:underline font-bold"
              type="button"
            >
              {copied ? '¡Copiado!' : 'Copiar texto'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#f0f3ff] border-t border-[#dbc2b0]/20 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white text-[#111c2d] text-xs font-bold hover:bg-[#e7eeff] border border-[#dbc2b0]/30 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleLaunchWhatsApp}
            className="px-5 py-2.5 rounded-xl bg-[#006c4a] text-white text-xs font-bold shadow-md hover:bg-[#005137] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>Abrir en WhatsApp</span>
          </button>
        </div>

      </div>
    </div>
  );
};
