import React, { useState, useEffect } from 'react';
import { Customer } from '../firebase/types';

interface EditarClienteModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
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
  onShowToast: (msg: string, icon?: string) => void;
}

export const EditarClienteModal: React.FC<EditarClienteModalProps> = ({
  isOpen,
  customer,
  onClose,
  onUpdateCustomer,
  onShowToast
}) => {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimitUSD, setCreditLimitUSD] = useState<number>(50.0);
  const [isSaving, setIsSaving] = useState(false);

  // Sync form values whenever customer changes
  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setAlias(customer.alias || '');
      setPhone(customer.phone || '');
      setAddress(customer.address || '');
      setCreditLimitUSD(customer.creditLimitUSD || 50.0);
    }
  }, [customer]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast('El nombre del cliente es obligatorio', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateCustomer(customer.id, {
        name: name.trim(),
        alias: alias.trim() || undefined,
        phone: phone.trim() || 'Sin teléfono registrado',
        address: address.trim() || 'Sector Bodega',
        creditLimitUSD: Number(creditLimitUSD) || 50.0
      });

      onClose();
    } catch (err) {
      console.error(err);
      onShowToast('Error al actualizar datos del cliente', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#dbc2b0]/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#FAF8F5] via-[#F4EFEA] to-[#FAF8F5] border-b border-[#E2D9CC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[22px]">edit_note</span>
            </span>
            <div>
              <h3 className="font-heading font-black text-base text-[#111c2d] flex items-center gap-2">
                <span>Editar Datos de Cliente</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#8d4b00]/10 text-[#8d4b00]">
                  #{customer.id.replace(/\D/g, '').slice(-4) || 'ID'}
                </span>
              </h3>
              <p className="text-xs text-[#554336] mt-0.5">
                Actualiza nombre, teléfono o dirección en la libreta
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#554336] hover:text-[#111c2d] border border-[#E2D9CC] flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Protection Banner: Current Debt & History are Safe */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-[#f0f3ff] border border-[#0051d5]/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#0051d5]/10 text-[#0051d5] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">shield</span>
            </span>
            <div>
              <span className="font-bold text-[#111c2d] block">
                Saldo e historial de compras 100% protegidos
              </span>
              <span className="text-[#554336] text-[11px]">
                Deuda actual:{' '}
                <strong className={customer.currentDebtUSD > 0 ? 'text-[#ba1a1a]' : 'text-[#006c4a]'}>
                  ${customer.currentDebtUSD.toFixed(2)} USD
                </strong>{' '}
                • Se conserva íntegra al guardar
              </span>
            </div>
          </div>
          <span className="px-2 py-1 rounded-md bg-white text-[#0051d5] font-bold text-[10px] uppercase tracking-wider shrink-0 border border-[#0051d5]/15">
            Seguro
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre Completo */}
          <div>
            <label className="block text-xs font-bold text-[#111c2d] mb-1">
              Nombre Completo / Razón Social <span className="text-[#ba1a1a]">*</span>
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-[18px] text-[#887364] absolute left-3 top-2.5">
                person
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: José López, María Mendoza, etc."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#FAF8F5] text-sm font-semibold text-[#111c2d] border border-[#E2D9CC] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
              />
            </div>
            <p className="text-[11px] text-[#554336] mt-1">
              Este nombre se mostrará en la libreta, tickets y cobros de WhatsApp.
            </p>
          </div>

          {/* Alias & Teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#111c2d] mb-1">
                Apodo o Alias de Mostrador
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-[#887364] absolute left-3 top-2.5">
                  badge
                </span>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Ej: Joselo vecino, Chucho"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#FAF8F5] text-xs font-semibold text-[#111c2d] border border-[#E2D9CC] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111c2d] mb-1">
                Teléfono / WhatsApp
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-[#006c4a] absolute left-3 top-2.5">
                  call
                </span>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: +58 412 123 4567"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#FAF8F5] text-xs font-semibold text-[#111c2d] border border-[#E2D9CC] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* Dirección o Referencia */}
          <div>
            <label className="block text-xs font-bold text-[#111c2d] mb-1">
              Dirección o Nota de Referencia
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-[18px] text-[#887364] absolute left-3 top-2.5">
                location_on
              </span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej: Casa #12 esquina frente al abasto, portón verde"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#FAF8F5] text-xs font-semibold text-[#111c2d] border border-[#E2D9CC] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Límite de Crédito */}
          <div>
            <label className="block text-xs font-bold text-[#111c2d] mb-1">
              Límite de Crédito Acordado ($ USD)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined text-[18px] text-[#8d4b00] absolute left-3 top-2.5">
                credit_score
              </span>
              <input
                type="number"
                min="0"
                step="5"
                value={creditLimitUSD}
                onChange={(e) => setCreditLimitUSD(parseFloat(e.target.value) || 0)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#FAF8F5] text-xs font-bold text-[#111c2d] border border-[#E2D9CC] focus:outline-none focus:ring-2 focus:ring-[#8d4b00] focus:bg-white font-numeric-tally transition-all"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-[#E2D9CC] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-[#E2D9CC] bg-white hover:bg-[#FAF8F5] text-[#554336] text-xs font-bold transition-all active:scale-95"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[17px]">save</span>
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
