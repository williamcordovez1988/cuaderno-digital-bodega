/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, testFirestoreConnection } from './firebase/config';
import {
  Product,
  Customer,
  Sale,
  LedgerEntry,
  BodegaSettings,
  PaymentMethod,
  InvoiceItem,
  Organization,
  UserProfile,
  isTrialPlan,
  isOwner,
  isAdmin,
  isEmployee,
  canManageTeam,
  canManageInventory,
  canViewReports,
  canViewFiados,
  isSuperAdmin
} from './firebase/types';
import {
  subscribeToProducts,
  subscribeToCustomers,
  subscribeToSales,
  subscribeToLedger,
  subscribeToSettings,
  subscribeToCollaborators,
  saveProduct,
  deleteProduct,
  applyInvoiceArrivals,
  adjustProductStock,
  updateExchangeRate,
  saveCustomer,
  updateCustomerProfile,
  registerSaleRecord,
  registerCustomerAbono,
  setActiveOrganizationId,
  updateOwnerPhone,
  DEFAULT_BLANK_SETTINGS
} from './firebase/firestoreService';
import {
  fetchUserProfileAndOrg,
  createProfileForExistingUser,
  logout as authLogout,
  AuthSession,
  getActiveStoredSession,
  saveActiveStoredSession,
  clearActiveStoredSession
} from './firebase/authService';
import { Header } from './components/Header';
import { RegistroDiario } from './components/RegistroDiario';
import { CuentasPorCobrar } from './components/CuentasPorCobrar';
import { Inventario } from './components/Inventario';
import { HistorialDia } from './components/HistorialDia';
import { ConfiguracionView } from './components/ConfiguracionView';
import { NuevoProductoModal } from './components/NuevoProductoModal';
import { NuevoClienteModal } from './components/NuevoClienteModal';
import { WhatsAppModal } from './components/WhatsAppModal';
import { CashChangeModal } from './components/CashChangeModal';
import { CargarFacturaModal } from './components/CargarFacturaModal';
import { AuthView } from './components/AuthView';
import { LandingPage } from './components/LandingPage';
import { MasterAdminView } from './components/MasterAdminView';
import { PaywallModal } from './components/PaywallModal';
import { DirectPaymentModal } from './components/DirectPaymentModal';
import { Toast } from './components/Toast';
import {
  initExchangeRateScheduler,
  fetchOfficialBCVRate,
  DEFAULT_BCV_RATE
} from './services/exchangeRateService';

export default function App() {
  // Client-side URL path routing (/register, /login, /)
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  }, []);

  // Navigation tab for authenticated app
  const [currentTab, setCurrentTab] = useState<'registro' | 'cuentas' | 'inventario' | 'historial' | 'configuracion'>('registro');

  // Firebase Auth and Multi-Tenant state
  const [currentUser, setCurrentUser] = useState<User | any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isFetchingRate, setIsFetchingRate] = useState<boolean>(false);

  // Core application data state - Initialized completely in ZERO (Lienzo en Blanco)
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [settings, setSettings] = useState<BodegaSettings>(DEFAULT_BLANK_SETTINGS);
  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);

  // Modals state
  const [isNuevoProductoOpen, setIsNuevoProductoOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isNuevoClienteOpen, setIsNuevoClienteOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [selectedWhatsAppCustomer, setSelectedWhatsAppCustomer] = useState<Customer | null>(null);
  const [isCashChangeOpen, setIsCashChangeOpen] = useState(false);
  const [cashChangeData, setCashChangeData] = useState<{ totalUSD: number; totalBs: number } | null>(null);
  const [isCargarFacturaOpen, setIsCargarFacturaOpen] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isDirectPaymentOpen, setIsDirectPaymentOpen] = useState(false);
  const [directPaymentPlan, setDirectPaymentPlan] = useState<'pro' | 'premium'>('pro');
  const [paywallOptions, setPaywallOptions] = useState<{
    reason?: 'products_limit' | 'invoice_ai_limit';
    title?: string;
    subtitle?: string;
    badge?: string;
  }>({});

  const handleOpenPaywall = useCallback((opts?: {
    reason?: 'products_limit' | 'invoice_ai_limit';
    title?: string;
    subtitle?: string;
    badge?: string;
  }) => {
    setPaywallOptions(opts || { reason: 'products_limit' });
    setIsPaywallOpen(true);
  }, []);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIcon, setToastIcon] = useState<string>('check_circle');

  const showToast = useCallback((msg: string, icon = 'check_circle') => {
    setToastMessage(msg);
    setToastIcon(icon);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Listen to browser forward/back buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Authenticate & Load Multi-Tenant Profile on Mount
  useEffect(() => {
    testFirestoreConnection();

    // Check stored session immediately (provides instant login persistence)
    const stored = getActiveStoredSession();
    if (stored) {
      setCurrentUser(stored.user);
      setUserProfile(stored.profile);
      setOrganization(stored.organization);
      setActiveOrganizationId(stored.organization.id);
      setIsAuthChecking(false);
    }

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          let session = await fetchUserProfileAndOrg(user.uid);
          if (!session) {
            session = await createProfileForExistingUser(user);
          }
          setUserProfile(session.profile);
          setOrganization(session.organization);
          setActiveOrganizationId(session.organization.id);
          saveActiveStoredSession({
            user,
            profile: session.profile,
            organization: session.organization
          });
        } catch (error) {
          console.error('Error loading tenant session:', error);
        }
      } else {
        // If Firebase Auth has no user, only reset if there is no active stored session
        const currentStored = getActiveStoredSession();
        if (!currentStored) {
          setCurrentUser(null);
          setUserProfile(null);
          setOrganization(null);
          setActiveOrganizationId(null);
          setProducts([]);
          setCustomers([]);
          setSales([]);
          setLedgerEntries([]);
        }
      }
      setIsAuthChecking(false);
    });

    return () => {
      unsubAuth();
    };
  }, []);

  // Subscribe to Multi-Tenant data whenever organization is loaded
  useEffect(() => {
    if (!currentUser || !organization) {
      return;
    }

    const orgId = organization.id;
    setActiveOrganizationId(orgId);

    const unsubProducts = subscribeToProducts((prods) => setProducts(prods), orgId);
    const unsubCustomers = subscribeToCustomers((custs) => setCustomers(custs), orgId);
    const unsubSales = subscribeToSales((s) => setSales(s), orgId);
    const unsubLedger = subscribeToLedger((l) => setLedgerEntries(l), orgId);
    const unsubSettings = subscribeToSettings((sett) => {
      // Normalizar tasa base inicial si la organización tenía la tasa de prueba previa (<= 100)
      if (!sett.bcvExchangeRate || sett.bcvExchangeRate <= 100) {
        sett.bcvExchangeRate = DEFAULT_BCV_RATE;
        updateExchangeRate(DEFAULT_BCV_RATE, orgId, 'Inicial (877.90 Bs/USD)');
      }
      setSettings(sett);
    }, orgId);
    const unsubCollabs = subscribeToCollaborators((collabs) => setCollaborators(collabs), orgId);

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubSales();
      unsubLedger();
      unsubSettings();
      unsubCollabs();
    };
  }, [currentUser, organization]);

  // Automatic Exchange Rate Scheduler (9:00 AM & 2:00 PM)
  useEffect(() => {
    if (!organization) return;
    const cleanup = initExchangeRateScheduler(async (newRate, timeStr, isAuto) => {
      await updateExchangeRate(newRate, organization.id, timeStr);
      if (isAuto) {
        showToast(
          `⏰ Tasa cambiaria oficial actualizada automáticamente a ${newRate.toFixed(2)} Bs/USD (${timeStr})`,
          'currency_exchange'
        );
      }
    });

    return () => {
      cleanup();
    };
  }, [organization?.id]);

  // RBAC Enforcement: Strict Redirection based on Role Hierarchy
  useEffect(() => {
    const role = userProfile?.rol;
    if (isEmployee(role)) {
      if (currentTab !== 'registro') {
        setCurrentTab('registro');
      }
    } else if (isAdmin(role)) {
      if (currentTab === 'configuracion') {
        setCurrentTab('registro');
      }
    }
  }, [userProfile, currentTab]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNuevoProductoOpen(false);
        setIsNuevoClienteOpen(false);
        setIsWhatsAppOpen(false);
        setIsCashChangeOpen(false);
      }

      // Restrict shortcuts for employee role
      if (userProfile?.rol === 'empleado') {
        if (e.altKey && (e.key === 'n' || e.key === 'N' || e.key === 'b' || e.key === 'B' || e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          return;
        }
      }

      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (isTrialPlan(organization?.plan_suscripcion) && products.length >= 5) {
          handleOpenPaywall({ reason: 'products_limit' });
          return;
        }
        setEditingProduct(null);
        setIsNuevoProductoOpen(true);
      }
      if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setCurrentTab('inventario');
      }
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setCurrentTab('cuentas');
      }
      if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (customers.length > 0) {
          setSelectedWhatsAppCustomer(customers[0]);
          setIsWhatsAppOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customers, userProfile, organization, products]);

  // Handler: Auth Success from AuthView
  const handleAuthSuccess = (session: AuthSession) => {
    saveActiveStoredSession(session);
    setCurrentUser(session.user);
    setUserProfile(session.profile);
    setOrganization(session.organization);
    setActiveOrganizationId(session.organization.id);
    navigate('/');

    if (session.organization?.subscriptionStatus === 'pendiente_pago') {
      const plan = (session.organization.plan_suscripcion as any) === 'premium' ? 'premium' : 'pro';
      setDirectPaymentPlan(plan);
      setIsDirectPaymentOpen(true);
      showToast('Por favor completa y reporta tu pago para activar tu suscripción', 'payments');
    }
  };

  // Handler: Logout
  const handleLogout = async () => {
    await authLogout();
    clearActiveStoredSession();
    setCurrentUser(null);
    setUserProfile(null);
    setOrganization(null);
    setActiveOrganizationId(null);
    setProducts([]);
    setCustomers([]);
    setSales([]);
    setLedgerEntries([]);
    navigate('/login');
    showToast('Sesión cerrada correctamente');
  };

  // Handler: Complete Sale
  const handleCompleteSale = async (
    saleData: {
      customerName: string;
      customerId?: string;
      items: any[];
      totalUSD: number;
      totalBs: number;
      exchangeRate: number;
      paymentMethod: PaymentMethod;
      status: 'saldada' | 'fiado';
      notes?: string;
    },
    customer: Customer | null
  ) => {
    try {
      const now = new Date();
      // Start tickets from 1 for fresh stores
      const ticketNumber = sales.length > 0 ? Math.max(...sales.map((s) => s.ticketNumber || 0)) + 1 : 1;

      await registerSaleRecord(
        {
          organization_id: organization?.id,
          ticketNumber,
          date: 'Hoy',
          time: now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
          customerName: saleData.customerName,
          customerId: saleData.customerId,
          items: saleData.items,
          totalUSD: saleData.totalUSD,
          totalBs: saleData.totalBs,
          exchangeRate: saleData.exchangeRate,
          paymentMethod: saleData.paymentMethod,
          status: saleData.status,
          notes: saleData.notes,
          cashier: userProfile?.nombre || currentUser?.displayName || settings.cashierName
        },
        customer,
        organization?.id
      );

      if (saleData.status === 'fiado') {
        showToast(
          `¡Venta fiada anotada a ${saleData.customerName}! ($${saleData.totalUSD.toFixed(2)}) - Cuenta actualizada`,
          'menu_book'
        );
      } else {
        showToast(
          `¡Venta de ${saleData.customerName} registrada (Ticket #${ticketNumber})! Stock descontado`,
          'check_circle'
        );
      }
    } catch (e) {
      console.error(e);
      showToast('Error al registrar la venta', 'error');
    }
  };

  // Handler: Register Abono
  const handleRegisterAbono = async (
    customer: Customer,
    amountUSD: number,
    exchangeRate: number,
    paymentMethod: string,
    reference?: string
  ) => {
    try {
      await registerCustomerAbono(customer, amountUSD, exchangeRate, paymentMethod, reference, organization?.id);
      showToast(
        `¡Abono de $${amountUSD.toFixed(2)} registrado para ${customer.name}!`,
        'payments'
      );
    } catch (e) {
      console.error(e);
      showToast('Error al procesar el abono', 'error');
    }
  };

  // Handler: Upgrade to Plan Pro (Freemium Paywall Action) - Opens direct payment modal
  const handleUpgradeToPro = () => {
    setIsPaywallOpen(false);
    setDirectPaymentPlan('pro');
    setIsDirectPaymentOpen(true);
  };

  // Handler: Save Product (New or Edit) - Enforces 5 product limit on Trial
  const handleSaveProduct = async (prod: Product) => {
    const isEditing = products.some((p) => p.id === prod.id);
    if (!isEditing && isTrialPlan(organization?.plan_suscripcion) && products.length >= 5) {
      setIsNuevoProductoOpen(false);
      handleOpenPaywall({ reason: 'products_limit' });
      showToast('🔒 Alcanzaste el límite de tu versión de prueba (5/5 productos).', 'lock');
      return;
    }

    try {
      await saveProduct(
        { ...prod, organization_id: organization?.id },
        organization?.id,
        organization?.plan_suscripcion
      );
      setIsNuevoProductoOpen(false);
      showToast(isEditing ? 'Producto actualizado' : 'Producto agregado al inventario', 'check_circle');
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes('LÍMITE_PLAN_PRUEBA')) {
        setIsNuevoProductoOpen(false);
        handleOpenPaywall({ reason: 'products_limit' });
      }
      showToast(err.message || 'Error al guardar producto', 'error');
    }
  };

  // Handler: Delete Product
  const handleDeleteProduct = async (productId: string) => {
    await deleteProduct(productId, organization?.id);
  };

  // Handler: Apply Invoice (AI Invoice Parsing)
  const handleApplyInvoice = async (items: InvoiceItem[], supplierName: string) => {
    await applyInvoiceArrivals(items, supplierName, organization?.id, organization?.plan_suscripcion);
    showToast(`¡Factura de "${supplierName || 'Proveedor'}" procesada e inventario actualizado!`, 'check_circle');
  };

  // Handler: Adjust Stock (+ / -)
  const handleAdjustStock = async (productId: string, delta: number) => {
    await adjustProductStock(productId, delta, organization?.id);
    showToast(delta > 0 ? 'Stock incrementado +1' : 'Stock descontado -1');
  };

  // Handler: Update Exchange Rate Manually
  const handleUpdateExchangeRate = async (rate: number) => {
    const timeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
    await updateExchangeRate(rate, organization?.id, `Manual (${timeStr})`);
    showToast(`Tasa BCV actualizada a ${rate.toFixed(2)} Bs/USD`, 'currency_exchange');
  };

  // Handler: Manual / On-Demand Sync with Official BCV API
  const handleFetchRateNow = async () => {
    setIsFetchingRate(true);
    try {
      const res = await fetchOfficialBCVRate();
      const timeStr = res.lastUpdated;
      await updateExchangeRate(res.rate, organization?.id, timeStr);
      showToast(
        res.success
          ? `¡Tasa BCV sincronizada a ${res.rate.toFixed(2)} Bs/USD!`
          : `Tasa establecida en ${res.rate.toFixed(2)} Bs/USD (referencia oficial).`,
        'currency_exchange'
      );
    } catch (e) {
      console.error(e);
      showToast('Error al consultar la tasa oficial', 'error');
    } finally {
      setIsFetchingRate(false);
    }
  };

  // Handler: Save Customer
  const handleSaveCustomer = async (cust: Customer) => {
    await saveCustomer({ ...cust, organization_id: organization?.id }, organization?.id);
  };

  // Handler: Update Customer Profile
  const handleUpdateCustomer = async (
    customerId: string,
    updates: {
      name: string;
      alias?: string;
      phone: string;
      address: string;
      creditLimitUSD?: number;
    }
  ) => {
    try {
      await updateCustomerProfile(customerId, updates, organization?.id);
      showToast(`¡Perfil de "${updates.name}" actualizado con éxito!`, 'check_circle');
    } catch (e) {
      console.error(e);
      showToast('Error al actualizar datos del cliente', 'error');
    }
  };

  // Quick WhatsApp Launcher
  const handleOpenWhatsAppModal = (customer: Customer) => {
    setSelectedWhatsAppCustomer(customer);
    setIsWhatsAppOpen(true);
  };

  // Quick Cash Change Modal
  const handleOpenCashChangeModal = (totalUSD: number, totalBs: number) => {
    setCashChangeData({ totalUSD, totalBs });
    setIsCashChangeOpen(true);
  };

  // Loading Screen while verifying session
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center animate-bounce shadow-sm">
          <span className="material-symbols-outlined text-[30px]">store</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-[#111c2d]">
          <span className="material-symbols-outlined text-[18px] animate-spin text-[#8d4b00]">refresh</span>
          Conectando espacio multi-tenant...
        </div>
      </div>
    );
  }

  // Public routing when not authenticated:
  if (!currentUser) {
    if (currentPath === '/master-admin') {
      return (
        <>
          <AuthView
            initialMode="login"
            onAuthSuccess={handleAuthSuccess}
            onNavigate={navigate}
            onShowToast={showToast}
          />
          <Toast message="Inicia sesión con la cuenta de Creador para acceder al Panel Maestro" icon="admin_panel_settings" />
        </>
      );
    }

    if (currentPath === '/login' || currentPath === '/register') {
      return (
        <>
          <AuthView
            initialMode={currentPath === '/register' ? 'register' : 'login'}
            onAuthSuccess={handleAuthSuccess}
            onNavigate={navigate}
            onShowToast={showToast}
          />
          <Toast message={toastMessage} icon={toastIcon} />
        </>
      );
    }

    // Default route ('/' or any other unauthenticated route): Public SaaS Landing Page
    return (
      <>
        <LandingPage
          onNavigate={navigate}
          currentUser={currentUser}
          userProfile={userProfile}
          onShowToast={showToast}
          bcvRate={settings.bcvExchangeRate}
        />
        <Toast message={toastMessage} icon={toastIcon} />
      </>
    );
  }

  // Master Admin Route (/master-admin): Strictly restricted to Super Admin (William Cordovez)
  if (currentPath === '/master-admin') {
    if (isSuperAdmin(currentUser?.email || userProfile?.email)) {
      return (
        <>
          <MasterAdminView
            bcvRate={settings.bcvExchangeRate}
            onNavigateHome={() => {
              navigate('/');
              setCurrentTab('registro');
            }}
            onShowToast={showToast}
          />
          <Toast message={toastMessage} icon={toastIcon} />
        </>
      );
    } else {
      return (
        <div className="bg-[#FAF8F5] text-[#111C2D] antialiased min-h-screen flex flex-col">
          <Header
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            settings={settings}
            onUpdateExchangeRate={handleUpdateExchangeRate}
            onFetchExchangeRateNow={handleFetchRateNow}
            isFetchingRate={isFetchingRate}
            pendingDebtsCount={customers.filter((c) => c.currentDebtUSD > 0).length}
            totalProductsCount={products.length}
            todaySalesUSD={sales.filter((s) => s.status === 'saldada').reduce((acc, s) => acc + s.totalUSD, 0)}
            currentUser={currentUser}
            organization={organization}
            userProfile={userProfile}
            onLogout={handleLogout}
            onNavigateLanding={() => navigate('/landing')}
            onNavigateMasterAdmin={() => navigate('/master-admin')}
            onShowToast={showToast}
          />
          <main className="w-full pt-32 pb-20 flex-1 flex items-center justify-center px-4">
            <div className="bg-white p-8 rounded-3xl border border-rose-200 text-center max-w-md shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[36px]">lock</span>
              </div>
              <h2 className="text-lg font-black text-[#111c2d]">Acceso Restringido</h2>
              <p className="text-xs text-[#554336] mt-2 mb-6 leading-relaxed">
                El <strong>Panel Maestro del SaaS</strong> es de acceso exclusivo para el Creador y Super Admin de la plataforma. Tu usuario actual no cuenta con privilegios globales.
              </p>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 px-4 bg-[#8d4b00] hover:bg-[#713c00] text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Volver a la Operación de Mi Bodega
              </button>
            </div>
          </main>
          <Toast message="Acceso denegado: Vista exclusiva del Creador" icon="lock" />
        </div>
      );
    }
  }

  // If user is authenticated, but specifically navigates to the public landing page (/landing)
  if (currentPath === '/landing') {
    return (
      <>
        <LandingPage
          onNavigate={navigate}
          currentUser={currentUser}
          userProfile={userProfile}
          onShowToast={showToast}
          bcvRate={settings.bcvExchangeRate}
        />
        <Toast message={toastMessage} icon={toastIcon} />
      </>
    );
  }

  // Pending debts calculation
  const pendingDebtsCount = customers.filter((c) => c.currentDebtUSD > 0).length;
  const todaySalesUSD = sales
    .filter((s) => s.status === 'saldada')
    .reduce((acc, s) => acc + s.totalUSD, 0);

  return (
    <div className="bg-[#FAF8F5] text-[#111C2D] antialiased min-h-screen flex flex-col selection:bg-[#ffdcc3] selection:text-[#8d4b00]">
      
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        settings={settings}
        onUpdateExchangeRate={handleUpdateExchangeRate}
        onFetchExchangeRateNow={handleFetchRateNow}
        isFetchingRate={isFetchingRate}
        pendingDebtsCount={pendingDebtsCount}
        totalProductsCount={products.length}
        todaySalesUSD={todaySalesUSD}
        currentUser={currentUser}
        organization={organization}
        userProfile={userProfile}
        onLogout={handleLogout}
        onNavigateLanding={() => navigate('/landing')}
        onNavigateMasterAdmin={() => navigate('/master-admin')}
        onShowToast={showToast}
      />

      {/* Top Banner for Pending Payment */}
      {organization?.subscriptionStatus === 'pendiente_pago' && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-3 shadow-md sticky top-16 z-20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] animate-pulse">schedule</span>
            <span>
              <strong>Plan {(organization.plan_suscripcion || 'Pro').toUpperCase()} (Pendiente de Pago):</strong> Tu bodega opera con límites de prueba hasta que el Creador verifique tu comprobante.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDirectPaymentPlan((organization.plan_suscripcion as any) === 'premium' ? 'premium' : 'pro');
              setIsDirectPaymentOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-white text-amber-900 hover:bg-amber-50 font-extrabold text-xs shadow-sm cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <span>📲 Reportar Pago por WhatsApp (+584241289468)</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      )}

      {/* Main Content View Container */}
      <main className="w-full pt-28 sm:pt-32 pb-28 sm:pb-20 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {currentTab === 'registro' && (
            <RegistroDiario
              products={products}
              customers={customers}
              recentSales={sales}
              exchangeRate={settings.bcvExchangeRate}
              onUpdateExchangeRate={handleUpdateExchangeRate}
              onCompleteSale={handleCompleteSale}
              onShowToast={showToast}
              onOpenCashChangeModal={handleOpenCashChangeModal}
              isEmployee={isEmployee(userProfile?.rol)}
            />
          )}

          {currentTab === 'cuentas' && canViewFiados(userProfile?.rol) && (
            <CuentasPorCobrar
              customers={customers}
              ledgerEntries={ledgerEntries}
              settings={settings}
              exchangeRate={settings.bcvExchangeRate}
              onRegisterAbono={handleRegisterAbono}
              onUpdateCustomer={handleUpdateCustomer}
              onOpenNuevoFiadoModal={(cust) => {
                setCurrentTab('registro');
                showToast(`Mostrador listo para cargar fiado a ${cust.name}`, 'menu_book');
              }}
              onOpenNuevoClienteModal={() => setIsNuevoClienteOpen(true)}
              onOpenWhatsAppModal={handleOpenWhatsAppModal}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'inventario' && canManageInventory(userProfile?.rol) && (
            <Inventario
              products={products}
              exchangeRate={settings.bcvExchangeRate}
              onAdjustStock={handleAdjustStock}
              onOpenNuevoProductoModal={() => {
                if (isTrialPlan(organization?.plan_suscripcion) && products.length >= 5) {
                  handleOpenPaywall({ reason: 'products_limit' });
                  return;
                }
                setEditingProduct(null);
                setIsNuevoProductoOpen(true);
              }}
              onOpenEditProductoModal={(prod) => {
                setEditingProduct(prod);
                setIsNuevoProductoOpen(true);
              }}
              onDeleteProduct={handleDeleteProduct}
              onOpenCargarFacturaModal={() => {
                setIsCargarFacturaOpen(true);
              }}
              onShowToast={showToast}
              plan={organization?.plan_suscripcion}
              aiScansUsed={organization?.ai_scans_used}
              onOpenPaywallModal={handleOpenPaywall}
            />
          )}

          {currentTab === 'historial' && canViewReports(userProfile?.rol) && (
            <HistorialDia
              sales={sales}
              ledgerEntries={ledgerEntries}
              exchangeRate={settings.bcvExchangeRate}
              bodegaName={settings.bodegaName || organization?.nombre_negocio || 'Mi Negocio'}
              cashierName={settings.cashierName || userProfile?.nombre || 'Caja Principal'}
              ownerPhone={settings.ownerPhone || organization?.telefono || ''}
              logoUrl={settings.logoUrl || organization?.logoUrl}
              onSaveOwnerPhone={async (phone: string) => {
                await updateOwnerPhone(phone, organization?.id);
                showToast('Teléfono del dueño guardado para reportes de cierre', 'check_circle');
              }}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'configuracion' && isOwner(userProfile?.rol) && (
            <ConfiguracionView
              organization={organization}
              settings={settings}
              userProfile={userProfile}
              collaborators={collaborators}
              onShowToast={showToast}
              onUpdateExchangeRate={handleUpdateExchangeRate}
              onFetchExchangeRateNow={handleFetchRateNow}
              isFetchingRate={isFetchingRate}
              onRefreshOrganization={async () => {
                if (currentUser) {
                  const snap = await fetchUserProfileAndOrg(currentUser.uid);
                  if (snap) {
                    setOrganization(snap.organization);
                    setUserProfile(snap.profile);
                  }
                }
              }}
            />
          )}
        </div>
      </main>

      {/* Global Modals */}
      <NuevoProductoModal
        isOpen={isNuevoProductoOpen}
        onClose={() => setIsNuevoProductoOpen(false)}
        onSaveProduct={handleSaveProduct}
        exchangeRate={settings.bcvExchangeRate}
        initialProduct={editingProduct}
        onShowToast={showToast}
      />

      <CargarFacturaModal
        isOpen={isCargarFacturaOpen}
        onClose={() => setIsCargarFacturaOpen(false)}
        catalog={products}
        exchangeRate={settings.bcvExchangeRate}
        onApplyInvoice={handleApplyInvoice}
        onShowToast={showToast}
        plan={organization?.plan_suscripcion}
        organizationId={organization?.id}
        onOpenPaywallModal={handleOpenPaywall}
      />

      <NuevoClienteModal
        isOpen={isNuevoClienteOpen}
        onClose={() => setIsNuevoClienteOpen(false)}
        onSaveCustomer={handleSaveCustomer}
        onShowToast={showToast}
      />

      <WhatsAppModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        customer={selectedWhatsAppCustomer}
        settings={settings}
        exchangeRate={settings.bcvExchangeRate}
        onShowToast={showToast}
      />

      {cashChangeData && (
        <CashChangeModal
          isOpen={isCashChangeOpen}
          onClose={() => setIsCashChangeOpen(false)}
          totalUSD={cashChangeData.totalUSD}
          totalBs={cashChangeData.totalBs}
          exchangeRate={settings.bcvExchangeRate}
          onConfirmSale={() => {
            handleCompleteSale(
              {
                customerName: 'Consumidor Final',
                items: [],
                totalUSD: cashChangeData.totalUSD,
                totalBs: cashChangeData.totalBs,
                exchangeRate: settings.bcvExchangeRate,
                paymentMethod: 'efectivo_usd',
                status: 'saldada'
              },
              null
            );
          }}
        />
      )}

      {/* Freemium Paywall Modal */}
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        onUpgrade={handleUpgradeToPro}
        currentProductsCount={products.length}
        reason={paywallOptions.reason}
        customTitle={paywallOptions.title}
        customSubtitle={paywallOptions.subtitle}
        customBadge={paywallOptions.badge}
      />

      {/* Direct Payment Modal with Real Banking Details */}
      <DirectPaymentModal
        isOpen={isDirectPaymentOpen}
        onClose={() => setIsDirectPaymentOpen(false)}
        bcvRate={settings.bcvExchangeRate}
        initialPlan={directPaymentPlan}
        defaultStoreName={organization?.nombre_negocio || ''}
        defaultEmail={organization?.ownerEmail || currentUser?.email || ''}
        onPaymentReported={() => {
          setIsDirectPaymentOpen(false);
          showToast('¡Reporte enviado por WhatsApp! El Creador verificará y activará tu cuenta.', 'chat');
        }}
      />

      {/* Toast Notification */}
      <Toast message={toastMessage} icon={toastIcon} />

      {/* Global Footer */}
      <footer className="mt-auto py-5 bg-white border-t border-[#E8E2D8] w-full">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#554336]">
          <span>© 2025 Cuaderno Digital • Sistema Contable y Fiados para Bodegas (Arquitectura Multi-Tenant)</span>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 font-semibold text-[#006c4a]">
              <span className="w-2 h-2 rounded-full bg-[#006c4a]" />
              Negocio Activo: {organization?.nombre_negocio || 'Sin Organización'} ({organization?.plan_suscripcion || 'gratuito'})
            </span>
            <span className="text-[#554336]">
              {currentUser ? `Conectado: ${currentUser.email}` : 'Modo Desconectado'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
