import React, { useState } from 'react';
import { BodegaSettings, Organization, UserProfile, isOwner, isAdmin, isEmployee, isSuperAdmin } from '../firebase/types';
import { logoutUser } from '../firebase/config';
import { User } from 'firebase/auth';

interface HeaderProps {
  currentTab: 'registro' | 'cuentas' | 'inventario' | 'historial' | 'configuracion';
  setCurrentTab: (tab: 'registro' | 'cuentas' | 'inventario' | 'historial' | 'configuracion') => void;
  settings: BodegaSettings;
  onUpdateExchangeRate?: (newRate: number) => void;
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
  onNavigateMasterAdmin?: () => void;
  onShowToast: (msg: string, icon?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  settings,
  pendingDebtsCount,
  totalProductsCount,
  currentUser,
  organization,
  userProfile,
  onLogout,
  onNavigateLanding,
  onNavigateMasterAdmin,
  onShowToast
}) => {
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const userRole = userProfile?.rol || 'dueño';
  const isUserOwner = isOwner(userRole);
  const isUserAdmin = isAdmin(userRole);
  const isUserEmployee = isEmployee(userRole);
  const isCreatorSuperAdmin = isSuperAdmin(currentUser?.email || userProfile?.email);
  const logoUrl = settings.logoUrl || organization?.logoUrl;

  // Resolve business name, avoiding generic 'Mi negocio' / 'Mi Negocio'
  const rawBizName = organization?.nombre_negocio || settings.bodegaName || '';
  const displayBizName =
    rawBizName && rawBizName.trim().toLowerCase() !== 'mi negocio'
      ? rawBizName.trim()
      : 'Bodega Principal';

  const userName = userProfile?.nombre || currentUser?.displayName || settings.cashierName || 'Usuario';
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'B';

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
      {/* Top Header - Fixed, Sleek, Fully Responsive and Zero Overflow */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-md border-b border-[#E8E2D8] shadow-[0_1px_6px_rgba(0,0,0,0.03)] h-16 sm:h-20 transition-all">
        <div className="h-full max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          
          {/* LADO IZQUIERDO: Identidad del Negocio (Logo de la Bodega y Nombre Real) */}
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentTab('registro')}
              className="flex items-center gap-2.5 sm:gap-3 text-left focus:outline-none group cursor-pointer min-w-0"
              title="Ir al Mostrador / Registro Diario"
            >
              {logoUrl ? (
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden border border-[#8d4b00]/25 shadow-2xs shrink-0 bg-[#FAF8F5] flex items-center justify-center transition-transform group-hover:scale-105">
                  <img src={logoUrl} alt="Logo de la Bodega" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#ffdcc3] to-[#ffcaa6] flex items-center justify-center text-[#8d4b00] shadow-2xs shrink-0 transition-transform group-hover:scale-105">
                  <span className="material-symbols-outlined text-[22px] sm:text-[26px]">storefront</span>
                </div>
              )}
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-heading font-extrabold text-sm sm:text-base md:text-lg text-[#111c2d] tracking-tight truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[210px] md:max-w-[260px] lg:max-w-[280px]">
                    {displayBizName}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0 shadow-2xs ${
                    isUserOwner
                      ? 'bg-[#ffdcc3] text-[#8d4b00]'
                      : isUserAdmin
                      ? 'bg-[#ede9fe] text-[#6d28d9]'
                      : 'bg-[#dbeafe] text-[#1d4ed8]'
                  }`}>
                    {isUserOwner ? 'DUEÑO' : isUserAdmin ? 'ADMIN' : 'CAJERO'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-[#554336] truncate hidden xs:block">
                  {isUserEmployee
                    ? 'Mostrador & Caja'
                    : isUserAdmin
                    ? 'Administración'
                    : 'Control Total del Negocio'}
                </p>
              </div>
            </button>

            {/* CENTRO: Navegación de Escritorio (Oculta en móviles/tablets para garantizar adaptabilidad) */}
            <nav className="hidden lg:flex items-center gap-1 bg-[#f0f3ff] p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setCurrentTab('registro')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                  currentTab === 'registro'
                    ? 'bg-[#8d4b00] text-white shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/70'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                <span>Registro</span>
              </button>

              {!isUserEmployee && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('cuentas')}
                    className={`px-3 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'cuentas'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                    <span>Fiados</span>
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
                    type="button"
                    onClick={() => setCurrentTab('inventario')}
                    className={`px-3 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'inventario'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                    <span>Inventario</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        currentTab === 'inventario' ? 'bg-white/25 text-white' : 'bg-[#e7eeff] text-[#554336]'
                      }`}
                    >
                      {totalProductsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentTab('historial')}
                    className={`px-3 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-1.5 cursor-pointer ${
                      currentTab === 'historial'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d] hover:bg-white/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">history</span>
                    <span>Cierre</span>
                  </button>

                  {/* Panel Maestro: Exclusivo para Super Admin */}
                  {isCreatorSuperAdmin && onNavigateMasterAdmin && (
                    <button
                      type="button"
                      onClick={onNavigateMasterAdmin}
                      title="Panel Maestro del Creador (SaaS Super Admin)"
                      className="px-2.5 py-1.5 text-xs font-black transition-all rounded-lg flex items-center gap-1 cursor-pointer bg-gradient-to-r from-amber-500 to-amber-700 hover:brightness-110 text-white shadow-xs border border-amber-400/40 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
                      <span className="hidden xl:inline">👑 Master Admin</span>
                    </button>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* LADO DERECHO: Icono de Configuración ⚙️, Perfil de Usuario Elegante y Botón Cerrar Sesión */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            
            {/* Botón de Configuración ⚙️ (Exclusivo para Dueño / Admin) */}
            {isUserOwner && (
              <button
                type="button"
                onClick={() => setCurrentTab('configuracion')}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95 ${
                  currentTab === 'configuracion'
                    ? 'bg-[#8d4b00] text-white border-[#8d4b00]'
                    : 'bg-[#FAF8F5] hover:bg-[#ffdcc3]/40 text-[#554336] hover:text-[#8d4b00] border-[#dbc2b0]/40'
                }`}
                title="Configuración del Negocio y Ajustes"
              >
                <span className="material-symbols-outlined text-[19px] sm:text-[21px]">settings</span>
              </button>
            )}

            {/* Grupo Elegante: Perfil de Usuario ('Dueño') + Cerrar Sesión */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-[#FAF8F5] border border-[#dbc2b0]/40 rounded-xl p-1 sm:pl-2.5 sm:pr-1.5 shadow-2xs">
              
              {/* Avatar + Nombre y Rol */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#8d4b00] to-[#b15f00] text-white flex items-center justify-center font-black text-xs shadow-2xs shrink-0 select-none">
                  {userInitial}
                </div>
                <div className="hidden sm:flex flex-col text-left leading-tight min-w-0">
                  <span className="text-xs font-bold text-[#111c2d] truncate max-w-[90px] md:max-w-[130px] lg:max-w-[150px]">
                    {userName}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8d4b00] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#006c4a]" />
                    {isUserOwner ? 'Dueño' : isUserAdmin ? 'Admin' : 'Empleado'}
                  </span>
                </div>
              </div>

              {/* Botón de Cerrar Sesión (Logout) */}
              {currentUser && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isAuthLoading}
                  title={`Conectado como ${currentUser.email}. Clic para cerrar sesión.`}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#ffdad6]/60 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">logout</span>
                </button>
              )}
            </div>

            {/* Botón Menú Hamburguesa para Móviles y Tablets */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="flex lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#FAF8F5] hover:bg-[#f0f3ff] text-[#111c2d] items-center justify-center border border-[#dbc2b0]/40 shadow-2xs transition-colors cursor-pointer"
              title="Menú de Navegación"
              aria-label="Abrir menú"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">
                {isMobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>

        {/* Menú Desplegable Móvil (Hamburguesa) */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white/98 backdrop-blur-md border-b border-[#E8E2D8] shadow-xl px-4 py-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col gap-1.5">
              
              <button
                type="button"
                onClick={() => {
                  setCurrentTab('registro');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                  currentTab === 'registro'
                    ? 'bg-[#8d4b00] text-white shadow-xs'
                    : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  Registro Diario (Mostrador)
                </span>
                <span className="text-[10px] opacity-75">Alt+R</span>
              </button>

              {!isUserEmployee && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('cuentas');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                      currentTab === 'cuentas'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
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
                    type="button"
                    onClick={() => {
                      setCurrentTab('inventario');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                      currentTab === 'inventario'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                      Inventario de Productos
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#e7eeff] text-[#554336] text-[10px] font-bold">
                      {totalProductsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('historial');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                      currentTab === 'historial'
                        ? 'bg-[#8d4b00] text-white shadow-xs'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px]">history</span>
                      Cierre del Día & Historial
                    </span>
                  </button>

                  {isUserOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentTab('configuracion');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                        currentTab === 'configuracion'
                          ? 'bg-[#8d4b00] text-white shadow-xs'
                          : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px]">settings</span>
                        Configuración del Negocio
                      </span>
                    </button>
                  )}

                  {isCreatorSuperAdmin && onNavigateMasterAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onNavigateMasterAdmin();
                      }}
                      className="w-full px-3.5 py-2.5 text-xs font-black rounded-xl flex items-center justify-between cursor-pointer bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-xs mt-1"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                        👑 Panel Maestro del Creador
                      </span>
                      <span className="text-[10px] uppercase font-bold bg-white/20 px-1.5 py-0.5 rounded">
                        Super Admin
                      </span>
                    </button>
                  )}
                </>
              )}

              {/* Pie del menú móvil con perfil y botón cerrar sesión */}
              <div className="pt-3 mt-2 border-t border-[#E8E2D8] flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#8d4b00] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {userInitial}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[#111c2d] truncate max-w-[180px]">
                      {userName}
                    </span>
                    <span className="text-[10px] text-[#554336] truncate">
                      {currentUser?.email || (isUserOwner ? 'Dueño' : 'Usuario')}
                    </span>
                  </div>
                </div>

                {currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px]">logout</span>
                    Salir
                  </button>
                )}
              </div>

              {onNavigateLanding && (
                <div className="pt-2 border-t border-[#E8E2D8]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
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

      {/* Mobile Bottom Navigation Bar */}
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
              <span className="text-[10px] mt-0.5">Cierre</span>
            </button>

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
