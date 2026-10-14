import React, { useState } from 'react';

interface CashChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalUSD: number;
  totalBs: number;
  exchangeRate: number;
  onConfirmSale: () => void;
}

export const CashChangeModal: React.FC<CashChangeModalProps> = ({
  isOpen,
  onClose,
  totalUSD,
  totalBs,
  exchangeRate,
  onConfirmSale
}) => {
  const [givenUSD, setGivenUSD] = useState<number>(
    totalUSD <= 5 ? 5 : totalUSD <= 10 ? 10 : totalUSD <= 20 ? 20 : 50
  );

  if (!isOpen) return null;

  const changeUSD = Math.max(0, Number((givenUSD - totalUSD).toFixed(2)));
  const changeBs = Number((changeUSD * exchangeRate).toFixed(2));

  const quickBills = [5, 10, 20, 50, 100].filter((b) => b >= Math.floor(totalUSD));

  const handleFinish = () => {
    onConfirmSale();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#dbc2b0]/30 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="p-4 bg-[#006c4a] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[22px]">payments</span>
            <h3 className="font-heading font-bold text-base">Calculadora de Vuelto / Cambio</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-white hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/20">
            <span className="text-xs font-bold text-[#554336]">Total de la Venta:</span>
            <div className="text-right">
              <span className="text-lg font-black text-[#111c2d] font-numeric-tally">${totalUSD.toFixed(2)} USD</span>
              <span className="text-xs font-bold text-[#006c4a] block font-numeric-tally">
                {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#554336] mb-1.5 uppercase tracking-wider">
              Billetes de Divisas Recibidos
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {quickBills.slice(0, 4).map((bill) => (
                <button
                  key={bill}
                  type="button"
                  onClick={() => setGivenUSD(bill)}
                  className={`py-2 rounded-xl font-black text-sm transition-all ${
                    givenUSD === bill
                      ? 'bg-[#006c4a] text-white shadow-xs'
                      : 'bg-[#f0f3ff] text-[#111c2d] hover:bg-[#e7eeff] border border-[#dbc2b0]/30'
                  }`}
                >
                  ${bill}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm text-[#554336]">$</span>
              <input
                type="number"
                step="1"
                value={givenUSD}
                onChange={(e) => setGivenUSD(parseFloat(e.target.value) || 0)}
                className="w-full pl-7 pr-3 py-2 bg-[#f0f3ff] rounded-xl font-numeric-tally font-bold text-sm text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#006c4a]"
              />
            </div>
          </div>

          {/* Vuelto a Entregar */}
          <div className="p-4 rounded-xl bg-[#85f8c4]/20 border border-[#82f5c1] flex flex-col gap-1 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-[#006c4a]">
              Vuelto / Cambio a Entregar al Cliente
            </span>
            <div className="text-2xl font-black font-heading text-[#006c4a] font-numeric-tally mt-1">
              ${changeUSD.toFixed(2)} USD
            </div>
            <div className="text-base font-extrabold text-[#111c2d] font-numeric-tally">
              ≈ {changeBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
            </div>
            <span className="text-[11px] text-[#554336] mt-0.5">
              (A tasa oficial de {exchangeRate.toFixed(2)} Bs/$)
            </span>
          </div>
        </div>

        <div className="p-4 bg-[#f0f3ff] border-t border-[#dbc2b0]/20 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#554336] hover:text-[#111c2d]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleFinish}
            className="px-5 py-2.5 rounded-xl bg-[#006c4a] text-white text-xs font-bold shadow-md hover:bg-[#005137] flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            Confirmar Cobro y Descontar Stock
          </button>
        </div>

      </div>
    </div>
  );
};
