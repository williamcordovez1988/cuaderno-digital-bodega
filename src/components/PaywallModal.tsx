import React from 'react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  currentProductsCount?: number;
  reason?: 'products_limit' | 'invoice_ai_limit';
  customTitle?: string;
  customSubtitle?: string;
  customBadge?: string;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  currentProductsCount = 5,
  reason = 'products_limit',
  customTitle,
  customSubtitle,
  customBadge
}) => {
  if (!isOpen) return null;

  const isInvoiceLimit = reason === 'invoice_ai_limit';
  const badgeText = customBadge || (isInvoiceLimit ? 'Límite de Escaneos de Prueba (1/1)' : 'Límite de Prueba Alcanzado (5/5)');
  const titleText = customTitle || (isInvoiceLimit
    ? '🔒 Alcanzaste el límite de tu versión de prueba (1/1 escaneo de facturas con IA)'
    : '🔒 Alcanzaste el límite de tu versión de prueba (5/5 productos)');
  const subtitleText = customSubtitle || (isInvoiceLimit
    ? 'Actualiza al Plan Pro para escaneos ilimitados con IA de facturas de distribuidora (Polar, Pepsi, etc.), inventario sin límites y recordatorios por WhatsApp.'
    : 'Actualiza al Plan Pro para inventario ilimitado, lectura de facturas con IA y recordatorios por WhatsApp.');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#E8E2D8] animate-in zoom-in-95 duration-200 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header with Visual Gradient & Icon */}
        <div className="relative bg-gradient-to-br from-[#ffdcc3] via-[#fff1e5] to-white p-6 sm:p-8 border-b border-[#E8E2D8]/60 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-[#554336] hover:text-[#111c2d] flex items-center justify-center transition-colors shadow-xs cursor-pointer"
            title="Cerrar ventana"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>

          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#8d4b00] text-white shadow-md mb-3 ring-8 ring-[#ffdcc3]/50">
            <span className="material-symbols-outlined text-[34px]">
              {isInvoiceLimit ? 'document_scanner' : 'lock'}
            </span>
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-[#ba1a1a]/10 text-[#ba1a1a] text-[11px] font-black uppercase tracking-wider mb-2">
            {badgeText}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-[#111c2d] font-heading leading-tight tracking-tight px-2">
            {titleText}
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-[#554336] leading-relaxed max-w-md mx-auto">
            {subtitleText}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="p-6 space-y-3.5 bg-white">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#554336]">
            Desbloquea con el Plan Pro:
          </span>

          <div className="grid grid-cols-1 gap-2.5">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D8]/80">
              <span className="w-8 h-8 rounded-xl bg-[#82f5c1] text-[#00714e] flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">all_inclusive</span>
              </span>
              <div>
                <h4 className="text-xs font-black text-[#111c2d]">Inventario Ilimitado</h4>
                <p className="text-[11px] text-[#554336]">
                  Registra todos los productos y víveres que tu bodega comercializa sin ningún tipo de tope.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D8]/80">
              <span className="w-8 h-8 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">document_scanner</span>
              </span>
              <div>
                <h4 className="text-xs font-black text-[#111c2d]">Lectura de Facturas con IA</h4>
                <p className="text-[11px] text-[#554336]">
                  Toma foto o pega el texto de las facturas de proveedores y suma stock automáticamente.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D8]/80">
              <span className="w-8 h-8 rounded-xl bg-[#85f8c4]/40 text-[#006c4a] flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[18px]">chat</span>
              </span>
              <div>
                <h4 className="text-xs font-black text-[#111c2d]">Cobranza & WhatsApp</h4>
                <p className="text-[11px] text-[#554336]">
                  Envía estados de cuenta de libretas de fiados por WhatsApp con un solo clic.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing tag */}
          <div className="p-3.5 rounded-2xl bg-[#f0f3ff] border border-[#dbc2b0]/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#8d4b00] text-[20px]">verified</span>
              <div>
                <div className="text-xs font-extrabold text-[#111c2d]">Plan Pro Negocio</div>
                <div className="text-[10px] text-[#554336]">Inventario ilimitado y 20 escaneos IA (o Premium VIP $19.99)</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg font-black text-[#8d4b00] font-numeric-tally">$9.99</span>
              <span className="text-[10px] text-[#554336] font-semibold"> /mes</span>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="p-6 pt-0 bg-white flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-[#8d4b00] hover:bg-[#b15f00] text-white font-black text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
            Actualizar a Plan Pro
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-[#554336] hover:text-[#111c2d] font-bold text-xs transition-colors cursor-pointer"
          >
            Seguir con Plan Prueba
          </button>
        </div>
      </div>
    </div>
  );
};
