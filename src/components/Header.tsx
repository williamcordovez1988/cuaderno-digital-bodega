import React, { useState } from 'react';
import { BodegaSettings, Organization, UserProfile, isOwner, isAdmin, isEmployee } from '../firebase/types';
import { logoutUser } from '../firebase/config';
import { User } from 'firebase/auth';

interface HeaderProps {
  currentTab: 'registro' | 'cuentas' | 'inventario' | 'historial' | 'configuracion';
  setCurrentTab: (tab: 'registro' | 'cuentas' | 'inventario' | 'historial' | 'configuracion') => void;
  settings: BodegaSettings;
  onUpdateExchangeRate: (newRate: number) => void;
  onFetchExchangeRateNow?: () => Promise<void>;
  isFetchingRate?: boolean;
  pendingDebtsCount: number;
  totalProductsCount: number;
  todaySalesUSD: number;
  currentUser: User | null;
  organization?: Organization | null;
  userProfile?: UserProfile | null;
  onLogout?: () => void;
  onNavigateLanding?: () => void;
  onShowToast: (msg: string, icon?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  settings,
  onUpdateExchangeRate,
  onFetchExchangeRateNow,
  isFetchingRate = false,
  pendingDebtsCount,
  totalProductsCount,
  todaySalesUSD,
  currentUser,
  organization,
  userProfile,
  onLogout,
  onNavigateLanding,
  onShowToast
}) => {
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(settings.bcvExchangeRate.toFixed(2));
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);

  React.useEffect(() => {
    setRateInput(settings.bcvExchangeRate.toFixed(2));
  }, [settings.bcvExchangeRate]);

  const userRole = userProfile?.rol || 'dueño';
  const isUserOwner = isOwner(userRole);
  const isUserAdmin = isAdmin(userRole);
  const isUserEmployee = isEmployee(userRole);
  const logoUrl = settings.logoUrl || organization?.logoUrl;

  const handleSaveRate = () => {
    const val = parseFloat(rateInput);
    if (!isNaN(val) && val > 0) {
      onUpdateExchangeRate(val);
      setIsEditingRate(false);
      onShowToast(`Tasa del día actualizada a ${val.toFixed(2)} Bs/$`);
    } else {
      onShowToast('Por favor ingrese una tasa válida', 'error');
    }
  };

  const handleLogout = async () => {
    setIsAuthLoading(true);
    try {
      if (onLogout) {
        onLogout();
      } else {
        await logoutUser();
      }
      onShowToast('Sesión cerrada correctamente');
    } catch (e) {
      console.error(e);
      onShowToast('Error al cerrar sesión', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <>
      {/* Top Header - Fixed and streamlined */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-md border-b border-[#E8E2D8] shadow-[0_1px_8px_rgba(0,0,0,0.04)] h-20">
        <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setCurrentTab('registro')}>
              {logoUrl ? (
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#8d4b00]/30 shadow-xs shrink-0 bg-[#FAF8F5] flex items-center justify-center">
                  <img src={logoUrl} alt="Logo de la Bodega" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] flex items-center justify-center text-[#8d4b00] shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[24px]">edit_note</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-extrabold text-base sm:text-lg text-[#111c2d] tracking-tight">
                    {settings.bodegaName || organization?.nombre_negocio || 'Cuaderno Digital'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase ${
                    isUserOwner
                      ? 'bg-[#ffdcc3] text-[#8d4b00]'
                      : isUserAdmin
                      ? 'bg-[#ede9fe] text-[#6d28d9]'
                      : 'bg-[#dbeafe] text-[#1d4ed8]'
                  }`}>
                    {isUserOwner ? 'DUEÑO' : isUserAdmin ? 'ADMIN' : 'EMPLEADO'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[#554336] truncate max-w-[170px] sm:max-w-none">
                  {isUserEmployee
                    ? 'Modo Cajero (Solo Registro Diario)'
                    : isUserAdmin
                    ? 'Modo Gerente (Inventario y Reportes)'
                    : 'Propietario (Acceso y Control Total)'}
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs (Hidden on mobile, cleanly visible from lg upwards) */}
            <nav className="hidden lg:flex items-center gap-1 bg-[#f0f3ff] p-1 rounded-xl">
              <button
                onClick={() => setCurrentTab('registro')}
                className={`px-3.5 py-2 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                  currentTab === 'registro'
                    ? 'bg-[#8d4b00] text-white shadow-sm'
                    : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/60'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                Registro Diario
              </button>

              {!isUserEmployee && (
                <>
                  <button
                    onClick={() => setCurrentTab('cuentas')}
                    className={`px-3.5 py-2 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'cuentas'
                        ? 'bg-[#8d4b00] text-white shadow-sm'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">account_balance_wallet</span>
                    Cuentas por Cobrar
                    {pendingDebtsCount > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                          currentTab === 'cuentas'
                            ? 'bg-white text-[#8d4b00]'
                            : 'bg-[#ffdad6] text-[#93000a]'
                        }`}
                      >
                        {pendingDebtsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setCurrentTab('inventario')}
                    className={`px-3.5 py-2 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'inventario'
                        ? 'bg-[#8d4b00] text-white shadow-sm'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">inventory_2</span>
                    Inventario
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        currentTab === 'inventario' ? 'bg-white/25 text-white' : 'bg-[#e7eeff] text-[#554336]'
                      }`}
                    >
                      {totalProductsCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setCurrentTab('historial')}
                    className={`px-3.5 py-2 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'historial'
                        ? 'bg-[#8d4b00] text-white shadow-sm'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                    Reporte de Pagos
                  </button>

                  {/* Configuración del Negocio y Gestión de Equipo: Exclusive to DUEÑO */}
                  {isUserOwner && (
                    <button
                      onClick={() => setCurrentTab('configuracion')}
                      className={`px-3.5 py-2 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                        currentTab === 'configuracion'
                          ? 'bg-[#8d4b00] text-white shadow-sm'
                          : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/60'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[17px]">settings</span>
                      Configuración
                    </button>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* Right Widgets: Tasa BCV, Ventas Hoy, User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Tasa BCV Widget */}
            <div className="flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/40 text-[#111c2d] shadow-2xs">
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1">
                  <span className="text-[12px]">💵</span>
                  <span className="text-[9px] sm:text-[10px] font-black text-[#554336] uppercase tracking-wider">
                    Tasa BCV
                  </span>
                </div>
                {isEditingRate ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="number"
                      step="0.05"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="w-16 sm:w-20 px-1.5 py-0.5 text-xs font-bold bg-white rounded border border-[#8d4b00] focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRate();
                        if (e.key === 'Escape') setIsEditingRate(false);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveRate}
                      className="w-5 h-5 rounded bg-[#8d4b00] text-white flex items-center justify-center text-xs cursor-pointer hover:bg-[#b15f00]"
                      title="Guardar Tasa"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingRate(false)}
                      className="w-5 h-5 rounded bg-gray-200 text-gray-700 flex items-center justify-center text-xs cursor-pointer hover:bg-gray-300"
                      title="Cancelar"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs sm:text-sm font-extrabold text-[#111c2d] font-numeric-tally">
                      {settings.bcvExchangeRate.toFixed(2)} <span className="text-[10px] text-[#554336] font-semibold">Bs/USD</span>
                    </span>
                    <span className="text-[9px] text-[#554336]/80 hidden md:inline">
                      (Actualizado: {settings.lastExchangeRateUpdate || settings.lastUpdated || 'Reciente'})
                    </span>
                  </div>
                )}
              </div>

              {!isEditingRate && (isUserOwner || isUserAdmin) && (
                <div className="flex items-center gap-1">
                  {onFetchExchangeRateNow && (
                    <button
                      onClick={onFetchExchangeRateNow}
                      disabled={isFetchingRate}
                      className={`px-2 py-1 bg-white hover:bg-[#ffdcc3]/50 text-[#8d4b00] border border-[#dbc2b0]/50 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                        isFetchingRate ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                      title="🔄 Actualizar Tasa Oficial Ahora (Consulta API BCV)"
                      type="button"
                    >
                      <span className={`material-symbols-outlined text-[15px] ${isFetchingRate ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      <span className="hidden lg:inline whitespace-nowrap">Actualizar Tasa Ahora</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setRateInput(settings.bcvExchangeRate.toFixed(2));
                      setIsEditingRate(true);
                    }}
                    className="p-1 text-[#554336] hover:text-[#8d4b00] hover:bg-[#ffdcc3]/40 rounded-lg transition-colors cursor-pointer"
                    title="Editar Tasa Manualmente"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                </div>
              )}
            </div>

            {/* Ventas de Hoy Widget */}
            <div className="hidden sm:flex flex-col px-3 py-1.5 rounded-xl bg-[#85f8c4]/30 border border-[#82f5c1]/50 text-[#006c4a]">
              <span className="text-[10px] font-bold uppercase tracking-wider">Ventas de Hoy</span>
              <span className="text-sm font-extrabold font-numeric-tally">
                ${todaySalesUSD.toFixed(2)}
              </span>
            </div>

            {/* User Account / Multi-Tenant Org / Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#dbc2b0]/30">
              <div className="hidden xl:flex flex-col text-right">
                <span className="text-xs font-bold text-[#111c2d] truncate max-w-[150px]">
                  {organization?.nombre_negocio || settings.bodegaName}
                </span>
                <span className="text-[11px] text-[#554336] flex items-center justify-end gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#006c4a]" />
                  {userProfile?.nombre || currentUser?.displayName || settings.cashierName}
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    isUserOwner
                      ? 'bg-[#ffdcc3] text-[#8d4b00]'
                      : isUserAdmin
                      ? 'bg-[#ede9fe] text-[#6d28d9]'
                      : 'bg-[#dbeafe] text-[#1d4ed8]'
                  }`}>
                    ({isUserOwner ? 'Dueño' : isUserAdmin ? 'Admin' : 'Empleado'})
                  </span>
                </span>
              </div>
              {currentUser && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isAuthLoading}
                  title={`Conectado como ${currentUser.email}. Clic para cerrar sesión.`}
                  className="w-9 h-9 rounded-xl bg-[#ffdad6] hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[19px]">logout</span>
                </button>
              )}

              {onNavigateLanding && (
                <button
                  type="button"
                  onClick={onNavigateLanding}
                  title="Ver Landing Page pública"
                  className="hidden sm:flex w-9 h-9 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-[#554336] hover:text-[#111c2d] items-center justify-center shadow-2xs transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[19px]">public</span>
                </button>
              )}

              {/* Mobile Hamburger / Dropdown Menu Button */}
              <button
                type="button"
                onClick={() => setIsMobileDropdownOpen((prev) => !prev)}
                className="flex lg:hidden w-9 h-9 rounded-xl bg-[#f0f3ff] hover:bg-[#e7eeff] text-[#111c2d] items-center justify-center border border-[#dbc2b0]/30 transition-colors cursor-pointer"
                title="Menú de Navegación"
                aria-label="Abrir menú"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isMobileDropdownOpen ? 'close' : 'menu'}
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Dropdown Navigation Menu */}
        {isMobileDropdownOpen && (
          <div className="lg:hidden bg-white/98 backdrop-blur-md border-b border-[#E8E2D8] shadow-lg px-4 py-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  setCurrentTab('registro');
                  setIsMobileDropdownOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer ${
                  currentTab === 'registro'
                    ? 'bg-[#8d4b00] text-white'
                    : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  Registro Diario (Mostrador)
                </span>
                <span className="text-[10px] opacity-80">Alt+R</span>
              </button>

              {!isUserEmployee && (
                <>
                  <button
                    onClick={() => {
                      setCurrentTab('cuentas');
                      setIsMobileDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer ${
                      currentTab === 'cuentas'
                        ? 'bg-[#8d4b00] text-white'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                      Cuentas por Cobrar (Fiados)
                    </span>
                    {pendingDebtsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#ba1a1a] text-white text-[10px] font-bold">
                        {pendingDebtsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTab('inventario');
                      setIsMobileDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer ${
                      currentTab === 'inventario'
                        ? 'bg-[#8d4b00] text-white'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                      Inventario de Productos
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#e7eeff] text-[#554336] text-[10px] font-bold">
                      {totalProductsCount}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTab('historial');
                      setIsMobileDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer ${
                      currentTab === 'historial'
                        ? 'bg-[#8d4b00] text-white'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">history</span>
                      Historial del Día
                    </span>
                  </button>

                  {/* Configuración: Exclusive to DUEÑO */}
                  {isUserOwner && (
                    <button
                      onClick={() => {
                        setCurrentTab('configuracion');
                        setIsMobileDropdownOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer ${
                        currentTab === 'configuracion'
                          ? 'bg-[#8d4b00] text-white'
                          : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">settings</span>
                        Configuración del Negocio
                      </span>
                    </button>
                  )}
                </>
              )}

              {currentUser && (
                <div className="pt-2.5 mt-2 border-t border-[#E8E2D8] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#111c2d] truncate max-w-[200px]">
                      {settings.bodegaName || organization?.nombre_negocio}
                    </span>
                    <span className="text-[10px] text-[#554336]">
                      {userProfile?.nombre || currentUser.email}{' '}
                      <span className={`font-bold px-1.5 py-0.2 rounded text-[9px] uppercase ${
                        isUserOwner
                          ? 'bg-amber-100 text-amber-800'
                          : isUserAdmin
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isUserOwner ? 'Dueño' : isUserAdmin ? 'Admin' : 'Empleado'}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileDropdownOpen(false);
                      handleLogout();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">logout</span>
                    Salir
                  </button>
                </div>
              )}

              {onNavigateLanding && (
                <div className="pt-2 border-t border-[#E8E2D8]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileDropdownOpen(false);
                      onNavigateLanding();
                    }}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold text-[#554336] hover:text-[#111c2d] hover:bg-[#f0f3ff] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">public</span>
                    Ver Landing Page pública
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar - Scoped by RBAC */}
      <nav className="flex lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/98 backdrop-blur-md border-t border-[#E8E2D8] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] py-1.5 px-3 justify-around items-center">
        <button
          onClick={() => setCurrentTab('registro')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            currentTab === 'registro' ? 'text-[#8d4b00] font-extrabold' : 'text-[#554336] opacity-75'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">receipt_long</span>
          <span className="text-[10px] mt-0.5">Mostrador</span>
        </button>

        {!isUserEmployee && (
          <>
            <button
              onClick={() => setCurrentTab('cuentas')}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                currentTab === 'cuentas' ? 'text-[#8d4b00] font-extrabold' : 'text-[#554336] opacity-75'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
              <span className="text-[10px] mt-0.5">Fiados</span>
              {pendingDebtsCount > 0 && (
                <span className="absolute top-0 right-1 px-1 py-0.2 bg-[#ba1a1a] text-white rounded-full text-[9px] font-bold">
                  {pendingDebtsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('inventario')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                currentTab === 'inventario' ? 'text-[#8d4b00] font-extrabold' : 'text-[#554336] opacity-75'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">inventory_2</span>
              <span className="text-[10px] mt-0.5">Inventario</span>
            </button>

            <button
              onClick={() => setCurrentTab('historial')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                currentTab === 'historial' ? 'text-[#8d4b00] font-extrabold' : 'text-[#554336] opacity-75'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">history</span>
              <span className="text-[10px] mt-0.5">Reporte</span>
            </button>

            {/* Ajustes / Configuración: Exclusivo para DUEÑO */}
            {isUserOwner && (
              <button
                onClick={() => setCurrentTab('configuracion')}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                  currentTab === 'configuracion' ? 'text-[#8d4b00] font-extrabold' : 'text-[#554336] opacity-75'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">settings</span>
                <span className="text-[10px] mt-0.5">Ajustes</span>
              </button>
            )}
          </>
        )}
      </nav>
    </>
  );
};
