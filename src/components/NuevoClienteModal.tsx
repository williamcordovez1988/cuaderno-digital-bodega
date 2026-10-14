import React, { useState } from 'react';
import { Customer } from '../firebase/types';

interface NuevoClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomer: (customer: Customer) => Promise<void>;
  onShowToast: (msg: string, icon?: string) => void;
}

export const NuevoClienteModal: React.FC<NuevoClienteModalProps> = ({
  isOpen,
  onClose,
  onSaveCustomer,
  onShowToast
}) => {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [phone, setPhone] = useState('+58 ');
  const [address, setAddress] = useState('');
  const [creditLimitUSD, setCreditLimitUSD] = useState(50.00);
  const [initialDebtUSD, setInitialDebtUSD] = useState(0.00);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast('Ingresa el nombre del cliente', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const id = `cust-${Date.now()}`;
      const newCustomer: Customer = {
        id,
        name: name.trim(),
        alias: alias.trim() || undefined,
        phone: phone.trim() || '+58 412-000-0000',
        address: address.trim() || 'Sector Bodega',
        creditLimitUSD: Number(creditLimitUSD) || 50.00,
        currentDebtUSD: Number(initialDebtUSD) || 0.00,
        lastPurchaseDate: 'Hoy',
        status: initialDebtUSD > creditLimitUSD ? 'aviso' : 'al_dia',
        updatedAt: new Date().toISOString()
      };

      await onSaveCustomer(newCustomer);
      onShowToast(`¡Cliente "${name}" registrado con éxito!`, 'check_circle');
      onClose();
    } catch (err) {
      console.error(err);
      onShowToast('Error al registrar cliente', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#dbc2b0]/30 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#f0f3ff] border-b border-[#dbc2b0]/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">person_add</span>
            </span>
            <div>
              <h3 className="font-heading font-bold text-base text-[#111c2d]">Nuevo Cliente / Libreta</h3>
              <p className="text-xs text-[#554336]">Añadir cuenta vecinal de fiado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white text-[#554336] hover:text-[#111c2d] flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#554336] mb-1">
              Nombre Completo *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Doña Carmen, Juancho el Mecánico, etc."
              className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-sm font-semibold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#554336] mb-1">
                Alias o Apodo de Mostrador
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej: Vecina Carmen, Juancho"
                className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-xs font-semibold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#554336] mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+58 412-555-8921"
                className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-xs font-semibold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#554336] mb-1">
              Dirección o Referencia
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej: Casa #14 frente al ambulatorio"
              className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-xs font-semibold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#554336] mb-1">
                Límite de Crédito ($ USD)
              </label>
              <input
                type="number"
                step="5"
                value={creditLimitUSD}
                onChange={(e) => setCreditLimitUSD(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-xs font-bold text-[#111c2d] border border-[#dbc2b0]/30 focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white font-numeric-tally"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#ba1a1a] mb-1">
                Deuda Inicial ($ USD)
              </label>
              <input
                type="number"
                step="0.5"
                value={initialDebtUSD}
                onChange={(e) => setInitialDebtUSD(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-[#f0f3ff] text-xs font-bold text-[#ba1a1a] border border-[#ba1a1a]/30 focus:outline-none focus:ring-2 focus:ring-[#ba1a1a] focus:bg-white font-numeric-tally"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#554336] hover:text-[#111c2d]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              {isSaving ? 'Guardando...' : 'Crear Libreta de Cliente'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
