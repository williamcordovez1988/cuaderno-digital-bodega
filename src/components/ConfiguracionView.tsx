import React, { useState } from 'react';
import { Organization, UserProfile, BodegaSettings, isOwner, canManageTeam, UserRole } from '../firebase/types';
import {
  updateBusinessProfile,
  createCollaborator,
  deleteCollaborator,
  updateCollaboratorRole
} from '../firebase/firestoreService';

interface ConfiguracionViewProps {
  organization: Organization | null;
  settings: BodegaSettings;
  userProfile: UserProfile | null;
  collaborators: UserProfile[];
  onShowToast: (msg: string, icon?: string) => void;
  onRefreshOrganization?: () => void;
  onUpdateExchangeRate?: (newRate: number) => void;
  onFetchExchangeRateNow?: () => Promise<void>;
  isFetchingRate?: boolean;
}

export const ConfiguracionView: React.FC<ConfiguracionViewProps> = ({
  organization,
  settings,
  userProfile,
  collaborators,
  onShowToast,
  onRefreshOrganization,
  onUpdateExchangeRate,
  onFetchExchangeRateNow,
  isFetchingRate = false
}) => {
  // Business Profile Form State
  const [businessName, setBusinessName] = useState(
    settings.bodegaName || organization?.nombre_negocio || 'Mi Negocio'
  );
  const [phone, setPhone] = useState(settings.ownerPhone || organization?.telefono || '');
  const [address, setAddress] = useState(organization?.direccion || '');
  const [logoPreview, setLogoPreview] = useState<string>(
    settings.logoUrl || organization?.logoUrl || ''
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Exchange rate manual input state
  const [manualRateInput, setManualRateInput] = useState(settings.bcvExchangeRate.toFixed(2));

  React.useEffect(() => {
    setManualRateInput(settings.bcvExchangeRate.toFixed(2));
  }, [settings.bcvExchangeRate]);

  const handleSaveManualRate = () => {
    const val = parseFloat(manualRateInput);
    if (!isNaN(val) && val > 0 && onUpdateExchangeRate) {
      onUpdateExchangeRate(val);
      onShowToast(`Tasa cambiaria fijada manualmente a ${val.toFixed(2)} Bs / USD`, 'currency_exchange');
    } else {
      onShowToast('Por favor ingrese un valor de tasa válido', 'error');
    }
  };

  // Collaborator Modal & Form State
  const [isCollabModalOpen, setIsCollabModalOpen] = useState(false);
  const [newCollabName, setNewCollabName] = useState('');
  const [newCollabEmail, setNewCollabEmail] = useState('');
  const [newCollabPassword, setNewCollabPassword] = useState('');
  const [newCollabRole, setNewCollabRole] = useState<'administrador' | 'empleado'>('empleado');
  const [isCreatingCollab, setIsCreatingCollab] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // RBAC Access Guard: Exclusive to 'dueño'
  const isUserOwner = isOwner(userProfile?.rol);
  if (!isUserOwner) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-3xl border border-[#dbc2b0]/60 shadow-lg text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shadow-xs">
          <span className="material-symbols-outlined text-[36px]">shield_lock</span>
        </div>
        <h2 className="text-xl font-heading font-black text-[#111c2d] mb-2">
          Acceso Restringido: Exclusivo para el Dueño
        </h2>
        <p className="text-xs text-[#554336] leading-relaxed mb-6">
          Esta sección de <strong>Gestión de Equipo, Roles y Configuración del Negocio</strong> está reservada únicamente para el Propietario (Dueño) de la organización.
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/';
          }}
          className="px-6 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          Volver al Mostrador
        </button>
      </div>
    );
  }

  // Handle Logo Upload and optimization to Base64
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast('Por favor sube un archivo de imagen válido (PNG, JPG, SVG, WEBP)', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onShowToast('La imagen debe pesar menos de 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Optimize image dimensions for web/mobile avatar
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/png', 0.9);
          setLogoPreview(compressedDataUrl);
          onShowToast('Logo cargado. Presiona "Guardar Cambios" para aplicarlo.', 'image');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    onShowToast('Logo removido. Presiona "Guardar Cambios" para confirmar.', 'info');
  };

  // Save Business Profile
  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      onShowToast('El nombre del negocio no puede estar vacío', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateBusinessProfile(
        {
          bodegaName: businessName.trim(),
          logoUrl: logoPreview,
          telefono: phone.trim(),
          direccion: address.trim()
        },
        organization?.id
      );

      if (onRefreshOrganization) {
        onRefreshOrganization();
      }

      onShowToast('¡Perfil del negocio y logo guardados exitosamente!', 'check_circle');
    } catch (err) {
      console.error(err);
      onShowToast('Error al actualizar el perfil del negocio', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Create Collaborator
  const handleCreateCollaboratorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollabName.trim() || !newCollabEmail.trim() || !newCollabPassword.trim()) {
      onShowToast('Por favor completa todos los campos del colaborador', 'error');
      return;
    }

    if (newCollabPassword.length < 5) {
      onShowToast('La contraseña debe tener al menos 5 caracteres', 'error');
      return;
    }

    setIsCreatingCollab(true);
    try {
      await createCollaborator(
        {
          nombre: newCollabName.trim(),
          email: newCollabEmail.trim(),
          password: newCollabPassword.trim(),
          rol: newCollabRole
        },
        organization?.id
      );

      const roleLabel = newCollabRole === 'administrador' ? 'Administrador (Gerente)' : 'Empleado de Mostrador';
      onShowToast(
        `¡Colaborador "${newCollabName.trim()}" creado! Rol: ${roleLabel}.`,
        'person_add'
      );
      setNewCollabName('');
      setNewCollabEmail('');
      setNewCollabPassword('');
      setNewCollabRole('empleado');
      setIsCollabModalOpen(false);
    } catch (err) {
      console.error(err);
      onShowToast('Error al crear colaborador', 'error');
    } finally {
      setIsCreatingCollab(false);
    }
  };

  // Change Collaborator Role (Exclusive for Dueño)
  const handleRoleChange = async (collabId: string, newRole: 'administrador' | 'empleado') => {
    setUpdatingRoleId(collabId);
    try {
      await updateCollaboratorRole(collabId, newRole, organization?.id);
      const roleName = newRole === 'administrador' ? 'Administrador (Gerente)' : 'Empleado (Cajero)';
      onShowToast(`Rol de colaborador actualizado a "${roleName}"`, 'verified_user');
    } catch (err) {
      console.error(err);
      onShowToast('Error al actualizar rol del colaborador', 'error');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  // Delete Collaborator
  const handleDeleteCollaborator = async (collab: UserProfile) => {
    const confirm = window.confirm(
      `¿Estás seguro de revocar el acceso a "${collab.nombre}" (${collab.email})?`
    );
    if (!confirm) return;

    try {
      await deleteCollaborator(collab.id, organization?.id);
      onShowToast(`Acceso de "${collab.nombre}" eliminado`, 'delete');
    } catch (err) {
      console.error(err);
      onShowToast('Error al eliminar colaborador', 'error');
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswordMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200">
      
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-[#E8E2D8] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[28px]">settings</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#111c2d] tracking-tight">
              Configuración del Negocio
            </h1>
            <p className="text-xs text-[#554336]">
              Personaliza la identidad de tu bodega y administra el equipo con control de permisos estricto (RBAC).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#82f5c1] text-[#00714e] text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
            <span className="material-symbols-outlined text-[15px]">verified_user</span>
            Rol: Dueño (Propietario / Super Admin)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Perfil de la Bodega & Logo (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-xs">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E8E2D8]">
              <span className="material-symbols-outlined text-[22px] text-[#8d4b00]">storefront</span>
              <h2 className="text-base font-extrabold text-[#111c2d]">
                Perfil de la Bodega y Marca
              </h2>
            </div>

            <form onSubmit={handleSaveBusinessProfile} className="space-y-5">
              
              {/* Logo Management */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-2">
                  Logo del Negocio / Bodega
                </label>
                <div className="flex items-start gap-4">
                  {/* Current / Preview Image */}
                  <div className="relative group shrink-0">
                    {logoPreview ? (
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#8d4b00]/30 shadow-sm bg-[#FAF8F5] flex items-center justify-center">
                        <img
                          src={logoPreview}
                          alt="Logo del Negocio"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-[#dbc2b0] bg-[#FAF8F5] flex flex-col items-center justify-center text-[#8d7c71] p-2 text-center">
                        <span className="material-symbols-outlined text-[28px] mb-1">image</span>
                        <span className="text-[10px] font-bold">Sin Logo</span>
                      </div>
                    )}
                  </div>

                  {/* Actions & File Upload */}
                  <div className="flex-1 space-y-2">
                    <p className="text-xs text-[#554336] leading-relaxed">
                      El logo se mostrará en la <strong>esquina superior del panel</strong> de la aplicación y en los <strong>comprobantes digitales de WhatsApp</strong>.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="px-3.5 py-2 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">upload</span>
                        {logoPreview ? 'Cambiar Logo' : 'Subir Logo'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>

                      {logoPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="px-3 py-2 rounded-xl bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          Quitar
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-[#8d7c71] block">
                      Recomendado: PNG, JPG o WEBP (cuadrado o circular).
                    </span>
                  </div>
                </div>
              </div>

              {/* Business Name */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Nombre del Negocio / Bodega <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">store</span>
                  </span>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ej. Bodega La Milagrosa, Víveres Los Andes"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-bold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Owner WhatsApp Phone for Notifications & Cierre */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Teléfono WhatsApp del Dueño (Para Cierres y Reportes)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">phone</span>
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 04141234567 o +584141234567"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-bold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
                <p className="text-[10px] text-[#554336] mt-1">
                  A este número recibirás el informe diario del Cierre de Caja cuando tus colaboradores cierren turno.
                </p>
              </div>

              {/* Physical Address */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Dirección o Ubicación del Local
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">location_on</span>
                  </span>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej. Calle Principal con Av. Bolívar, Local #4"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D8] space-y-2">
                <span className="text-[11px] font-bold text-[#554336] uppercase tracking-wider block">
                  Vista Previa en Panel Superior
                </span>
                <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-[#dbc2b0]/30 shadow-2xs">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="w-9 h-9 rounded-xl object-cover border border-[#8d4b00]/30 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-[#ffdcc3] flex items-center justify-center text-[#8d4b00] shrink-0 font-bold">
                      <span className="material-symbols-outlined text-[20px]">edit_note</span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-[#111c2d]">
                        {businessName || 'Mi Negocio'}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full bg-[#82f5c1] text-[#00714e] text-[9px] font-bold uppercase">
                        {organization?.plan_suscripcion || 'PRO'}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#554336]">Negocio Multi-Tenant Activo</span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full py-3 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                    Guardando cambios...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Guardar Perfil y Actualizar Logo
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Card: Gestión y Actualización Automática de Tasa Cambiaria Oficial (BCV) */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#006c4a]">currency_exchange</span>
                <div>
                  <h2 className="text-base font-extrabold text-[#111c2d]">
                    Gestión de Tasa Cambiaria Oficial (BCV)
                  </h2>
                  <p className="text-[11px] text-[#554336]">
                    Moneda y conversión en vivo para ventas, inventario y cuentas por cobrar
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#82f5c1]/30 text-[#00714e] text-[10px] font-black uppercase">
                En Vivo
              </span>
            </div>

            {/* Display Indicator */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#dbc2b0]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#554336] block">
                  Indicador Vigente en la App:
                </span>
                <div className="text-lg sm:text-xl font-black text-[#111c2d] flex items-center gap-1.5 mt-0.5 font-numeric-tally">
                  <span>💵 Tasa BCV:</span>
                  <span className="text-[#006c4a]">{settings.bcvExchangeRate.toFixed(2)} Bs/USD</span>
                </div>
                <span className="text-[11px] text-[#554336] block mt-0.5">
                  (Actualizado: <strong>{settings.lastExchangeRateUpdate || settings.lastUpdated || 'Reciente'}</strong>)
                </span>
              </div>

              {onFetchExchangeRateNow && (
                <button
                  type="button"
                  onClick={onFetchExchangeRateNow}
                  disabled={isFetchingRate}
                  className={`py-2.5 px-4 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white text-xs font-black shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                    isFetchingRate ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isFetchingRate ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  <span>🔄 Actualizar Tasa Ahora</span>
                </button>
              )}
            </div>

            {/* Programmed Schedule Info */}
            <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/30 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#111c2d]">
                <span className="material-symbols-outlined text-[18px] text-[#8d4b00]">schedule</span>
                <span>Actualización Automática y Programada (9:00 AM y 2:00 PM)</span>
              </div>
              <p className="text-[11px] text-[#554336] leading-relaxed">
                El sistema consulta automáticamente la API de tasas oficiales del Banco Central de Venezuela en los dos turnos diarios de cotización bancaria (<strong>9:00 AM</strong> y <strong>2:00 PM</strong>) y recalcula instantáneamente los precios, fiados y cierres en toda la aplicación.
              </p>
            </div>

            {/* Manual Override Form */}
            <div>
              <label className="block text-xs font-bold text-[#111c2d] mb-1.5">
                Ajuste Manual de Tasa (Opcional):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336] font-bold text-xs">
                    Bs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={manualRateInput}
                    onChange={(e) => setManualRateInput(e.target.value)}
                    placeholder="Ej. 877.90"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-bold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveManualRate}
                  className="py-2.5 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-black shadow-xs transition-colors cursor-pointer"
                >
                  Fijar Tasa Manual
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Gestión de Colaboradores & Permisos RBAC (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-xs flex flex-col h-full">
            
            {/* Header of Section */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8] mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#8d4b00]">group</span>
                <h2 className="text-base font-extrabold text-[#111c2d]">
                  Equipo y Colaboradores
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCollabModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-black shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                Nuevo
              </button>
            </div>

            {/* RBAC Security Policy Badge */}
            <div className="p-3.5 mb-4 rounded-xl bg-linear-to-r from-[#ffdcc3]/30 to-[#f0f3ff] border border-[#8d4b00]/20 text-[11px] text-[#554336] space-y-2 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-[#8d4b00]">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                <span>Jerarquía de 3 Roles y Permisos Estrictos (RBAC)</span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-[11px]">
                <p>
                  👑 <strong className="text-[#8d4b00]">Dueño (Super Admin):</strong> Creador del negocio. Acceso 100% total, ajustes de marca y gestión exclusiva de usuarios y roles.
                </p>
                <p>
                  💼 <strong className="text-[#6d28d9]">Administrador (Gerente):</strong> Control de inventario, costos de compra, márgenes de ganancia, reportes y cierres. Sin acceso a usuarios ni ajustes.
                </p>
                <p>
                  🛒 <strong className="text-[#0051d5]">Empleado (Cajero):</strong> Restringido exclusivamente al Mostrador (Registro Diario). Costos, márgenes y reportes ocultos permanentemente.
                </p>
              </div>
            </div>

            {/* Collaborators List */}
            <div className="flex-1 space-y-3">
              <span className="text-[11px] font-bold text-[#8d7c71] uppercase tracking-wider block">
                Usuarios Registrados ({collaborators.length + 1})
              </span>

              {/* Owner Card (Always Present) */}
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D8] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-extrabold text-xs shadow-2xs shrink-0">
                    <span className="material-symbols-outlined text-[20px]">shield_person</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#111c2d]">
                        {userProfile?.nombre || 'Dueño Principal'}
                      </span>
                      <span className="px-2 py-0.2 rounded-full bg-[#8d4b00] text-white text-[9px] font-black uppercase">
                        Dueño
                      </span>
                    </div>
                    <span className="text-[11px] text-[#554336] block">
                      {userProfile?.email || 'williamcordovezcn@gmail.com'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#006c4a] bg-[#82f5c1]/30 px-2.5 py-1 rounded-lg">
                  Control Total
                </span>
              </div>

              {/* Collaborators */}
              {collaborators.length === 0 ? (
                <div className="p-6 text-center rounded-xl border border-dashed border-[#dbc2b0] bg-[#FAF8F5]">
                  <span className="material-symbols-outlined text-[32px] text-[#8d7c71] mb-1">
                    person_off
                  </span>
                  <p className="text-xs font-bold text-[#111c2d]">No hay colaboradores aún</p>
                  <p className="text-[11px] text-[#554336] mt-0.5 mb-3">
                    Agrega administradores o cajeros para delegar tareas con permisos seguros.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCollabModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#8d4b00] text-white text-xs font-bold hover:bg-[#b15f00] transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    Crear Primer Colaborador
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {collaborators.map((collab) => {
                    const isPasswordShown = !!showPasswordMap[collab.id];
                    const isCollabAdmin = collab.rol === 'administrador';

                    return (
                      <div
                        key={collab.id}
                        className="p-3.5 rounded-xl bg-white border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-colors shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isCollabAdmin
                                ? 'bg-[#ede9fe] text-[#6d28d9]'
                                : 'bg-[#dbeafe] text-[#1d4ed8]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[19px]">
                              {isCollabAdmin ? 'manage_accounts' : 'badge'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-[#111c2d] truncate">
                                {collab.nombre}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                                  isCollabAdmin
                                    ? 'bg-[#ede9fe] text-[#6d28d9]'
                                    : 'bg-[#dbeafe] text-[#1d4ed8]'
                                }`}
                              >
                                {isCollabAdmin ? 'Admin' : 'Empleado'}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#554336] block truncate">
                              {collab.email}
                            </span>

                            {/* Cambiar Rol Dropdown (Executable strictly by Dueño) */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[10px] text-[#8d7c71] font-semibold">Rol:</span>
                              <select
                                value={collab.rol || 'empleado'}
                                disabled={updatingRoleId === collab.id}
                                onChange={(e) =>
                                  handleRoleChange(collab.id, e.target.value as 'administrador' | 'empleado')
                                }
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border focus:outline-none transition-colors cursor-pointer ${
                                  isCollabAdmin
                                    ? 'bg-[#f5f3ff] text-[#6d28d9] border-[#c4b5fd]'
                                    : 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
                                }`}
                                title="Cambiar rol del colaborador"
                              >
                                <option value="empleado">Empleado (Cajero)</option>
                                <option value="administrador">Administrador (Gerente)</option>
                              </select>
                              {updatingRoleId === collab.id && (
                                <span className="material-symbols-outlined text-[14px] animate-spin text-[#8d4b00]">
                                  refresh
                                </span>
                              )}
                            </div>

                            {collab.password && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-[#8d7c71]">
                                <span>Clave:</span>
                                <span className="font-mono font-bold text-[#111c2d] bg-[#FAF8F5] px-1.5 py-0.2 rounded">
                                  {isPasswordShown ? collab.password : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(collab.id)}
                                  className="text-[#8d4b00] hover:underline cursor-pointer ml-0.5"
                                  title="Mostrar / Ocultar Contraseña"
                                >
                                  <span className="material-symbols-outlined text-[13px] align-middle">
                                    {isPasswordShown ? 'visibility_off' : 'visibility'}
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteCollaborator(collab)}
                          className="w-8 h-8 rounded-lg bg-[#ffdad6]/60 hover:bg-[#ba1a1a] hover:text-white text-[#ba1a1a] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                          title="Eliminar colaborador"
                        >
                          <span className="material-symbols-outlined text-[17px]">delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* MODAL: NUEVO COLABORADOR */}
      {isCollabModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111c2d]/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#E8E2D8] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 bg-[#8d4b00] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[24px]">person_add</span>
                <div>
                  <h3 className="font-heading font-extrabold text-base">
                    Crear Nuevo Colaborador
                  </h3>
                  <p className="text-xs opacity-90">
                    Asigna credenciales y define el nivel de acceso
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCollabModalOpen(false)}
                className="p-1 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateCollaboratorSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Nombre Completo <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">person</span>
                  </span>
                  <input
                    type="text"
                    required
                    value={newCollabName}
                    onChange={(e) => setNewCollabName(e.target.value)}
                    placeholder="Ej. Carlos Mendoza, Ana Lucía"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Correo Electrónico de Acceso <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                  </span>
                  <input
                    type="email"
                    required
                    value={newCollabEmail}
                    onChange={(e) => setNewCollabEmail(e.target.value)}
                    placeholder="carlos@bodega.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Contraseña Inicial <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                  </span>
                  <input
                    type="text"
                    required
                    value={newCollabPassword}
                    onChange={(e) => setNewCollabPassword(e.target.value)}
                    placeholder="Mínimo 5 caracteres"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-mono font-bold text-[#111c2d] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
                <span className="text-[10px] text-[#8d7c71] mt-1 block">
                  El colaborador usará este correo y clave para ingresar al sistema.
                </span>
              </div>

              {/* Selector de Rol */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-2">
                  Rol y Nivel de Acceso <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {/* Option 1: Empleado */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      newCollabRole === 'empleado'
                        ? 'border-[#0051d5] bg-[#eff6ff] ring-1 ring-[#0051d5]'
                        : 'border-[#E8E2D8] bg-[#FAF8F5] hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="collabRole"
                      value="empleado"
                      checked={newCollabRole === 'empleado'}
                      onChange={() => setNewCollabRole('empleado')}
                      className="mt-0.5 text-[#0051d5] focus:ring-0"
                    />
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#111c2d]">
                          Empleado (Cajero / Mostrador)
                        </span>
                        <span className="px-2 py-0.2 rounded-full bg-[#dbeafe] text-[#1d4ed8] text-[9px] font-black uppercase">
                          Básico
                        </span>
                      </div>
                      <p className="text-[11px] text-[#554336] mt-0.5 leading-snug">
                        Solo pantalla de Registro Diario para cobrar y anotar fiados. Costos de compra, márgenes y reportes ocultos permanentemente.
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Administrador */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      newCollabRole === 'administrador'
                        ? 'border-[#6d28d9] bg-[#f5f3ff] ring-1 ring-[#6d28d9]'
                        : 'border-[#E8E2D8] bg-[#FAF8F5] hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="collabRole"
                      value="administrador"
                      checked={newCollabRole === 'administrador'}
                      onChange={() => setNewCollabRole('administrador')}
                      className="mt-0.5 text-[#6d28d9] focus:ring-0"
                    />
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#111c2d]">
                          Administrador (Gerente / Encargado)
                        </span>
                        <span className="px-2 py-0.2 rounded-full bg-[#ede9fe] text-[#6d28d9] text-[9px] font-black uppercase">
                          Gerencial
                        </span>
                      </div>
                      <p className="text-[11px] text-[#554336] mt-0.5 leading-snug">
                        Gestiona inventario, costos de compra, márgenes, reportes y cierres de caja. Sin acceso a usuarios ni configuración del negocio.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCollabModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#E8E2D8] text-xs font-bold text-[#554336] hover:bg-[#FAF8F5] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCollab}
                  className="px-5 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isCreatingCollab ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        refresh
                      </span>
                      Creando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      Guardar y Habilitar Acceso
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
