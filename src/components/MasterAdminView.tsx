import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrganizationAdminRecord, PLAN_PRICING, LEGACY_DUMMY_IDS } from '../firebase/types';
import {
  getAllOrganizationsForAdmin,
  updateOrganizationPlanAndStatus,
  createManualOrganization,
  deleteOrganizationCompletely
} from '../firebase/firestoreService';

interface MasterAdminViewProps {
  bcvRate: number;
  onNavigateHome: () => void;
  onShowToast: (msg: string, icon?: string) => void;
}

export const MasterAdminView: React.FC<MasterAdminViewProps> = ({
  bcvRate,
  onNavigateHome,
  onShowToast
}) => {
  const [organizations, setOrganizations] = useState<OrganizationAdminRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<'all' | 'gratuito' | 'pro' | 'premium'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pendiente_pago' | 'paused' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'products' | 'plan'>('recent');

  // Modals state
  const [editingOrg, setEditingOrg] = useState<OrganizationAdminRecord | null>(null);
  const [isExpiryModalOpen, setIsExpiryModalOpen] = useState<boolean>(false);
  const [modalExpiryDate, setModalExpiryDate] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<'active' | 'paused' | 'expired' | 'pendiente_pago'>('active');
  const [modalNotes, setModalNotes] = useState<string>('');

  const [deletingOrg, setDeletingOrg] = useState<OrganizationAdminRecord | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newBizName, setNewBizName] = useState<string>('');
  const [newOwnerName, setNewOwnerName] = useState<string>('');
  const [newOwnerEmail, setNewOwnerEmail] = useState<string>('');
  const [newOwnerPhone, setNewOwnerPhone] = useState<string>('');
  const [newPlan, setNewPlan] = useState<'gratuito' | 'pro' | 'premium'>('pro');
  const [newNotes, setNewNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load organizations on mount and listen to Firestore updates
  const loadOrgs = async () => {
    setIsLoading(true);
    try {
      const records = await getAllOrganizationsForAdmin();
      setOrganizations(records);
    } catch (e) {
      console.error('Error fetching organizations for admin:', e);
      onShowToast('Error al cargar clientes del SaaS', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrgs();

    try {
      // Real-time snapshot listener on the 'organizations' collection for instant 1-second updates
      const unsub = onSnapshot(collection(db, 'organizations'), (snapshot) => {
        const realtimeList: OrganizationAdminRecord[] = snapshot.docs
          .filter((d) => !LEGACY_DUMMY_IDS.includes(d.id))
          .map((d) => {
            const data = d.data();
            const rawPlan = (data.plan_suscripcion || data.plan || 'gratuito').toString().toLowerCase();
            const planNorm = rawPlan.includes('prem') ? 'premium' : rawPlan.includes('pro') ? 'pro' : 'gratuito';
            const planCap = planNorm === 'premium' ? 'Premium' : planNorm === 'pro' ? 'Pro' : 'Gratis';
            const rawStatus = (data.status || data.subscriptionStatus || 'active').toString().toLowerCase();
            const statusNorm = rawStatus === 'pendiente_pago' ? 'pendiente_pago' : rawStatus === 'paused' ? 'paused' : rawStatus === 'expired' ? 'expired' : 'active';
            const expiryIso = data.planExpiresAt || (data.subscriptionExpiryDate ? new Date(data.subscriptionExpiryDate + (data.subscriptionExpiryDate.includes('T') ? '' : 'T23:59:59')).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString());
            const expiryDateStr = data.subscriptionExpiryDate || expiryIso.split('T')[0];

            return {
              id: d.id,
              nombre_negocio: data.nombre_negocio || data.name || 'Comercio',
              ownerName: data.ownerName || data.owner || 'Propietario',
              ownerEmail: data.ownerEmail || data.email || '',
              ownerPhone: data.ownerPhone || data.telefono || data.phone || '',
              plan_suscripcion: planNorm,
              plan: data.plan || planCap,
              status: statusNorm,
              subscriptionStatus: statusNorm,
              subscriptionExpiryDate: expiryDateStr,
              planExpiresAt: expiryIso,
              fecha_registro: data.fecha_registro || data.createdAt || new Date().toISOString(),
              createdAt: data.createdAt || data.fecha_registro || new Date().toISOString(),
              updatedAt: data.updatedAt || '',
              productsCount: typeof data.productsCount === 'number' ? data.productsCount : 0,
              ai_scans_used: typeof data.ai_scans_used === 'number' ? data.ai_scans_used : 0,
              logoUrl: data.logoUrl,
              paymentNotes: data.paymentNotes || ''
            };
          });

        setOrganizations(realtimeList);
        setIsLoading(false);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Could not establish organizations realtime listener:', e);
    }
  }, []);

  // Quick Plan Activation (1-Click) with Mensual (+30d) or Anual (+365d)
  const handleQuickChangePlan = async (
    org: OrganizationAdminRecord,
    newPlanName: 'gratuito' | 'pro' | 'premium',
    durationDays: number = 30
  ) => {
    try {
      const planCap = newPlanName === 'premium' ? 'Premium' : newPlanName === 'pro' ? 'Pro' : 'Gratis';
      const durationMs = durationDays * 86400000;
      const nowIso = new Date().toISOString();
      const newPlanExpiresAt = new Date(Date.now() + durationMs).toISOString();
      const newExpiry = newPlanExpiresAt.split('T')[0];
      const cycleLabel = durationDays === 365 ? 'ANUAL' : 'MENSUAL';

      const updates = {
        plan: planCap,
        plan_suscripcion: newPlanName,
        status: 'active' as const,
        subscriptionStatus: 'active' as const,
        updatedAt: nowIso,
        planExpiresAt: newPlanExpiresAt,
        subscriptionExpiryDate: newExpiry,
        paymentNotes: `Plan ${planCap} (${cycleLabel}) activado por Super Admin el ${new Date().toLocaleDateString('es-VE')}`
      };

      // Direct Firestore updateDoc / setDoc write
      await updateOrganizationPlanAndStatus(org.id, updates);

      setOrganizations((prev) =>
        prev.map((item) => (item.id === org.id ? { ...item, ...updates } : item))
      );

      onShowToast(
        `¡${org.nombre_negocio} activado con Plan ${planCap} (${cycleLabel}) exitosamente!`,
        'verified'
      );
    } catch (e) {
      console.error(e);
      onShowToast('Error al actualizar el plan', 'error');
    }
  };

  // Toggle Subscription Status (active <-> paused)
  const handleToggleStatus = async (org: OrganizationAdminRecord) => {
    const nextStatus = org.subscriptionStatus === 'active' ? 'paused' : 'active';
    try {
      await updateOrganizationPlanAndStatus(org.id, { subscriptionStatus: nextStatus });
      setOrganizations((prev) =>
        prev.map((item) => (item.id === org.id ? { ...item, subscriptionStatus: nextStatus } : item))
      );
      onShowToast(
        `Suscripción de "${org.nombre_negocio}" marcada como ${nextStatus === 'active' ? 'ACTIVA' : 'PAUSADA'}`,
        nextStatus === 'active' ? 'check_circle' : 'pause_circle'
      );
    } catch (e) {
      console.error(e);
      onShowToast('Error al modificar estado', 'error');
    }
  };

  // Send WhatsApp Expiry Reminder
  const handleSendExpiryReminder = (org: OrganizationAdminRecord) => {
    const cleanPhone = (org.ownerPhone || org.telefono || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      onShowToast(`"${org.nombre_negocio}" no tiene un número de teléfono registrado`, 'warning');
      return;
    }
    const ownerName = org.ownerName?.trim() || 'Estimado(a)';
    const isPremium = org.plan_suscripcion === 'premium';
    const isPro = org.plan_suscripcion === 'pro';
    const planName = isPremium ? 'Premium VIP' : isPro ? 'Pro' : 'de Suscripción';
    const expiryDateStr = org.subscriptionExpiryDate
      ? new Date(org.subscriptionExpiryDate + 'T12:00:00').toLocaleDateString('es-VE')
      : 'próximamente';

    const message = `Hola ${ownerName}, te saludamos de Cuaderno Digital Bodega. Te recordamos que tu Plan ${planName} vence el ${expiryDateStr}. Renueva hoy para mantener tu inventario e IA sin interrupciones.`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    onShowToast(`Abriendo WhatsApp con recordatorio para ${org.nombre_negocio}...`, 'chat');
  };

  // Permanent Delete Client Handler
  const handleConfirmDelete = async () => {
    if (!deletingOrg) return;
    setIsSubmitting(true);
    try {
      await deleteOrganizationCompletely(deletingOrg.id);
      setOrganizations((prev) => prev.filter((o) => o.id !== deletingOrg.id));
      setIsDeleteModalOpen(false);
      onShowToast(`Negocio "${deletingOrg.nombre_negocio}" eliminado definitivamente de la base de datos`, 'delete_forever');
      setDeletingOrg(null);
    } catch (e) {
      console.error(e);
      onShowToast('Error al eliminar cliente', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Expiry & Notes Modal
  const handleOpenExpiryModal = (org: OrganizationAdminRecord) => {
    setEditingOrg(org);
    setModalExpiryDate(org.subscriptionExpiryDate || new Date().toISOString().split('T')[0]);
    setModalStatus(org.subscriptionStatus || 'active');
    setModalNotes(org.paymentNotes || '');
    setIsExpiryModalOpen(true);
  };

  const handleSaveExpiryModal = async () => {
    if (!editingOrg) return;
    setIsSubmitting(true);
    try {
      const updates = {
        subscriptionExpiryDate: modalExpiryDate,
        subscriptionStatus: modalStatus,
        paymentNotes: modalNotes.trim()
      };
      await updateOrganizationPlanAndStatus(editingOrg.id, updates);
      setOrganizations((prev) =>
        prev.map((item) => (item.id === editingOrg.id ? { ...item, ...updates } : item))
      );
      setIsExpiryModalOpen(false);
      onShowToast(`Vencimiento y notas guardadas para "${editingOrg.nombre_negocio}"`, 'event_available');
    } catch (e) {
      console.error(e);
      onShowToast('Error al guardar ajustes de suscripción', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual Creation of Business
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim() || !newOwnerEmail.trim()) {
      onShowToast('Ingresa el nombre del negocio y correo del dueño', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      const newOrg = await createManualOrganization({
        nombre_negocio: newBizName,
        ownerName: newOwnerName || 'Propietario',
        ownerEmail: newOwnerEmail,
        ownerPhone: newOwnerPhone,
        plan_suscripcion: newPlan,
        paymentNotes: newNotes
      });
      setOrganizations((prev) => [newOrg, ...prev]);
      setIsCreateModalOpen(false);
      setNewBizName('');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPhone('');
      setNewNotes('');
      onShowToast(`¡Negocio "${newOrg.nombre_negocio}" registrado exitosamente!`, 'add_business');
    } catch (err) {
      console.error(err);
      onShowToast('Error al registrar nuevo negocio', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // KPI Calculations
  const totalOrgs = organizations.length;
  const activeOrgs = organizations.filter((o) => o.subscriptionStatus === 'active');
  const trialOrgs = organizations.filter(
    (o) => !o.plan_suscripcion || o.plan_suscripcion === 'gratuito' || o.plan_suscripcion === 'trial' || o.plan_suscripcion === 'prueba'
  );
  const proOrgs = organizations.filter((o) => o.plan_suscripcion === 'pro');
  const premiumOrgs = organizations.filter((o) => o.plan_suscripcion === 'premium');

  // MRR: Monthly Recurring Revenue (only from active paid plans)
  const mrrUSD = proOrgs.filter(o => o.subscriptionStatus === 'active').length * PLAN_PRICING.pro +
    premiumOrgs.filter(o => o.subscriptionStatus === 'active').length * PLAN_PRICING.premium;
  const mrrBs = mrrUSD * bcvRate;

  const totalProducts = organizations.reduce((acc, o) => acc + (o.productsCount || 0), 0);
  const totalScans = organizations.reduce((acc, o) => acc + (o.ai_scans_used || 0), 0);

  // Filtered & Sorted Organizations
  const filteredOrganizations = useMemo(() => {
    return organizations.filter((o) => {
      // Search filter
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        o.nombre_negocio?.toLowerCase().includes(search) ||
        o.ownerName?.toLowerCase().includes(search) ||
        o.ownerEmail?.toLowerCase().includes(search) ||
        o.ownerPhone?.toLowerCase().includes(search);

      // Plan filter
      let matchPlan = true;
      if (planFilter === 'gratuito') {
        matchPlan = !o.plan_suscripcion || o.plan_suscripcion === 'gratuito' || o.plan_suscripcion === 'trial' || o.plan_suscripcion === 'prueba';
      } else if (planFilter === 'pro') {
        matchPlan = o.plan_suscripcion === 'pro';
      } else if (planFilter === 'premium') {
        matchPlan = o.plan_suscripcion === 'premium';
      }

      // Status filter
      let matchStatus = true;
      if (statusFilter !== 'all') {
        matchStatus = o.subscriptionStatus === statusFilter;
      }

      return matchSearch && matchPlan && matchStatus;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.nombre_negocio.localeCompare(b.nombre_negocio);
      }
      if (sortBy === 'products') {
        return (b.productsCount || 0) - (a.productsCount || 0);
      }
      if (sortBy === 'plan') {
        const rank = (p?: string) => (p === 'premium' ? 3 : p === 'pro' ? 2 : 1);
        return rank(b.plan_suscripcion) - rank(a.plan_suscripcion);
      }
      // 'recent' by default
      return new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime();
    });
  }, [organizations, searchTerm, planFilter, statusFilter, sortBy]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111C2D] pb-24 selection:bg-[#ffdcc3] selection:text-[#8d4b00]">
      
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-[#111c2d] via-[#1a2b44] to-[#111c2d] text-white border-b border-[#2d3f5a] sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-lg shrink-0">
              <span className="material-symbols-outlined text-[28px]">admin_panel_settings</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight text-white flex items-center gap-2">
                  👑 Panel Maestro del Creador
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-300">
                SaaS Owner Dashboard • Diseñado y Gestionado por el{' '}
                <strong className="text-white font-bold">Ing. William Cordovez</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Live BCV Rate Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs backdrop-blur-xs">
              <span>💵</span>
              <span className="text-slate-300 text-[11px] font-medium">Tasa BCV:</span>
              <strong className="text-emerald-400 font-bold font-numeric-tally">
                {bcvRate.toFixed(2)} Bs/$
              </strong>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadOrgs}
              disabled={isLoading}
              title="Refrescar lista de bodegas"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer flex items-center justify-center active:scale-95"
            >
              <span className={`material-symbols-outlined text-[20px] ${isLoading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>

            {/* New Bodega Button */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[17px]">add_business</span>
              <span>Registrar Bodega</span>
            </button>

            {/* Back to Regular Bodega */}
            <button
              onClick={onNavigateHome}
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[17px]">store</span>
              <span>Ir a Mi Bodega</span>
            </button>
          </div>

        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">

        {/* =========================================================================
            KPI CARDS (TABLERO DE MÉTRICAS DEL SAAS)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          
          {/* Total Clientes Registrados */}
          <div className="bg-white rounded-2xl p-5 border border-[#E8E2D8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#554336] uppercase tracking-wider">
                Total Bodegas Registradas
              </span>
              <div className="w-10 h-10 rounded-xl bg-[#e7eeff] text-[#1a56db] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">storefront</span>
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black font-numeric-tally text-[#111c2d]">
                {totalOrgs}
              </span>
              <div className="flex items-center gap-2 mt-1 text-xs text-[#006c4a] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#006c4a]" />
                {activeOrgs.length} comercios activos ({((activeOrgs.length / (totalOrgs || 1)) * 100).toFixed(0)}%)
              </div>
            </div>
          </div>

          {/* Desglose por Plan */}
          <div className="bg-white rounded-2xl p-5 border border-[#E8E2D8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#554336] uppercase tracking-wider">
                Clientes Activos por Plan
              </span>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">pie_chart</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-[#f0f3ff] rounded-lg p-1.5">
                <span className="block text-[10px] text-[#554336] font-bold uppercase">Gratis</span>
                <span className="text-base font-extrabold text-[#111c2d]">{trialOrgs.length}</span>
              </div>
              <div className="bg-amber-50 rounded-lg p-1.5 border border-amber-200/60">
                <span className="block text-[10px] text-amber-800 font-bold uppercase">Pro</span>
                <span className="text-base font-extrabold text-amber-800">{proOrgs.length}</span>
              </div>
              <div className="bg-purple-50 rounded-lg p-1.5 border border-purple-200/60">
                <span className="block text-[10px] text-purple-800 font-bold uppercase">Premium</span>
                <span className="text-base font-extrabold text-purple-800">{premiumOrgs.length}</span>
              </div>
            </div>
          </div>

          {/* Ingresos Mensuales Estimados (USD & Bs) */}
          <div className="bg-gradient-to-br from-[#006c4a] to-[#005238] text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
                Ingresos Estimados (MRR)
              </span>
              <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">payments</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-black font-numeric-tally">
                ${mrrUSD.toFixed(2)}{' '}
                <span className="text-xs font-normal text-emerald-200">USD/mes</span>
              </div>
              <div className="mt-1 text-xs text-emerald-100 font-bold font-numeric-tally flex items-center gap-1">
                <span>≈ Bs. {mrrBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-emerald-300 font-normal">/mes</span>
              </div>
            </div>
          </div>

          {/* Global Usage Activity */}
          <div className="bg-white rounded-2xl p-5 border border-[#E8E2D8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#554336] uppercase tracking-wider">
                Actividad Global del SaaS
              </span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">auto_graph</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <div>
                <span className="block text-[11px] text-[#554336]">Productos cargados:</span>
                <strong className="text-base font-extrabold text-[#111c2d]">{totalProducts}</strong>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-[#554336]">Facturas IA leídas:</span>
                <strong className="text-base font-extrabold text-amber-700">{totalScans}</strong>
              </div>
            </div>
          </div>

        </div>

        {/* =========================================================================
            FILTROS Y BUSCADOR
            ========================================================================= */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8E2D8] shadow-sm mb-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por bodega, dueño, correo o teléfono..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8d4b00]/30 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filters by Plan */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <span className="text-xs font-bold text-[#554336] mr-1 hidden sm:inline">Plan:</span>
              {(['all', 'gratuito', 'pro', 'premium'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlanFilter(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer shrink-0 ${
                    planFilter === p
                      ? 'bg-[#111c2d] text-white shadow-xs'
                      : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                  }`}
                >
                  {p === 'all' ? 'Todos' : p === 'gratuito' ? 'Gratis' : p}
                </button>
              ))}
            </div>

            {/* Filters by Status */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <span className="text-xs font-bold text-[#554336] mr-1 hidden sm:inline">Estado:</span>
              {(['all', 'active', 'pendiente_pago', 'paused', 'expired'] as const).map((s) => {
                const pendingCount = organizations.filter(o => o.subscriptionStatus === 'pendiente_pago').length;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                      statusFilter === s
                        ? s === 'pendiente_pago'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-[#006c4a] text-white shadow-xs'
                        : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                    }`}
                  >
                    <span>
                      {s === 'all'
                        ? 'Todos'
                        : s === 'active'
                        ? 'Activos'
                        : s === 'pendiente_pago'
                        ? '⏳ Pendientes de Pago'
                        : s === 'paused'
                        ? 'Pausados'
                        : 'Vencidos'}
                    </span>
                    {s === 'pendiente_pago' && pendingCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-white text-amber-700 text-[10px] font-black">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-[#554336] hidden sm:inline">Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs font-bold text-[#111c2d] focus:outline-none cursor-pointer"
              >
                <option value="recent">Más Recientes</option>
                <option value="name">Nombre (A-Z)</option>
                <option value="products">Mayor Inventario</option>
                <option value="plan">Plan Superior</option>
              </select>
            </div>

          </div>

          <div className="mt-3 pt-3 border-t border-[#f0ebe3] flex items-center justify-between text-xs text-[#554336]">
            <span>
              Mostrando <strong className="text-[#111c2d]">{filteredOrganizations.length}</strong> de{' '}
              <strong>{organizations.length}</strong> bodegas registradas
            </span>
            {(searchTerm || planFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setPlanFilter('all');
                  setStatusFilter('all');
                }}
                className="text-xs font-bold text-[#8d4b00] hover:underline cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            TABLA INTERACTIVA DE CLIENTES
            ========================================================================= */}
        <div className="bg-white rounded-2xl border border-[#E8E2D8] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#554336]">
              <span className="material-symbols-outlined text-[36px] animate-spin text-[#8d4b00]">
                progress_activity
              </span>
              <span className="text-sm font-bold">Cargando base de datos SaaS...</span>
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-[#f0f3ff] text-[#554336] mx-auto flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[32px]">storefront</span>
              </div>
              <h3 className="text-base font-bold text-[#111c2d]">No se encontraron bodegas</h3>
              <p className="text-xs text-[#554336] mt-1 max-w-sm mx-auto">
                No hay resultados con los criterios de búsqueda o filtros aplicados actualmente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E8E2D8] text-[11px] font-bold text-[#554336] uppercase tracking-wider">
                    <th className="py-3.5 px-4">Comercio / Negocio</th>
                    <th className="py-3.5 px-4">Propietario & Contacto</th>
                    <th className="py-3.5 px-4 text-center">Plan Actual</th>
                    <th className="py-3.5 px-4 text-center">Estado</th>
                    <th className="py-3.5 px-4 text-center">Inventario</th>
                    <th className="py-3.5 px-4 text-center">Facturas IA</th>
                    <th className="py-3.5 px-4">Vencimiento</th>
                    <th className="py-3.5 px-4 text-center">Acciones Rápidas (1 Clic)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ebe3]">
                  {filteredOrganizations.map((org) => {
                    const rawPlan = (org.plan_suscripcion || org.plan || 'gratuito').toString().toLowerCase();
                    const isPro = rawPlan === 'pro';
                    const isPremium = rawPlan === 'premium';
                    const isGratuito = !isPro && !isPremium;
                    const rawStatus = (org.subscriptionStatus || org.status || 'active').toString().toLowerCase();
                    const isActive = rawStatus === 'active';
                    const isPaused = rawStatus === 'paused';
                    const isExpired = rawStatus === 'expired';
                    const isPendiente = rawStatus === 'pendiente_pago';

                    // Clean phone for WhatsApp link
                    const cleanPhone = (org.ownerPhone || org.telefono || '').replace(/[^0-9]/g, '');
                    const waText = encodeURIComponent(
                      `Hola ${org.ownerName || 'amigo'}, te escribo del equipo de Cuaderno Digital Bodega respecto a tu negocio "${org.nombre_negocio}".`
                    );

                    return (
                      <tr key={org.id} className="hover:bg-[#fbf9f6] transition-colors">
                        
                        {/* Negocio */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {org.logoUrl ? (
                              <img
                                src={org.logoUrl}
                                alt={org.nombre_negocio}
                                className="w-9 h-9 rounded-xl object-cover border border-[#E8E2D8] shadow-2xs shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                                {org.nombre_negocio.substring(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong className="block text-sm font-extrabold text-[#111c2d] leading-tight">
                                {org.nombre_negocio}
                              </strong>
                              <span className="text-[10px] text-gray-500 font-mono">
                                ID: {org.id.substring(0, 16)}...
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Propietario & Contacto */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-[#111c2d]">{org.ownerName || 'Propietario'}</span>
                            <span className="text-[11px] text-[#554336]">{org.ownerEmail || 'Sin correo'}</span>
                            {(org.ownerPhone || org.telefono) && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-gray-500 font-numeric-tally">
                                  {org.ownerPhone || org.telefono}
                                </span>
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/${cleanPhone}?text=${waText}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir chat de WhatsApp directo con el dueño"
                                    className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">chat</span>
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Plan Actual Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide shadow-2xs ${
                              isPremium
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                                : isPro
                                ? 'bg-gradient-to-r from-amber-500 to-amber-700 text-white'
                                : 'bg-[#e7eeff] text-[#1a56db]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isPremium ? 'workspace_premium' : isPro ? 'star' : 'badge'}
                            </span>
                            {isPremium ? 'Premium VIP' : isPro ? 'Plan Pro' : 'Gratuito'}
                          </span>
                        </td>

                        {/* Estado de Suscripción */}
                        <td className="py-3.5 px-4 text-center">
                          {isPendiente ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-2xs animate-pulse">
                              <span className="material-symbols-outlined text-[12px]">schedule</span>
                              Pendiente Pago
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(org)}
                              title="Haz clic para alternar entre Activo y Pausado"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all active:scale-95 ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : isPaused
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {isActive ? 'Activo' : isPaused ? 'Pausado' : 'Vencido'}
                            </button>
                          )}
                        </td>

                        {/* Productos */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-numeric-tally font-bold text-xs text-[#111c2d]">
                            {org.productsCount || 0}
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            {isGratuito ? '/ 5 máx' : 'ilimitado'}
                          </span>
                        </td>

                        {/* Escaneos IA */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-numeric-tally font-bold text-xs text-amber-700">
                            {org.ai_scans_used || 0}
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            {isPremium ? 'Ilimitado' : isPro ? '/ 20 mes' : '/ 1 máx'}
                          </span>
                        </td>

                        {/* Vencimiento & Recordatorios */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 font-medium">Vence:</span>
                              <strong className="font-numeric-tally font-extrabold text-[11px] text-[#111c2d]">
                                {org.subscriptionExpiryDate ? new Date(org.subscriptionExpiryDate + 'T12:00:00').toLocaleDateString('es-VE') : 'Sin definir'}
                              </strong>
                            </div>
                            <span className="text-[10px] text-gray-500">
                              Inscrito: {new Date(org.fecha_registro).toLocaleDateString('es-VE')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSendExpiryReminder(org)}
                              title="Enviar recordatorio de vencimiento por WhatsApp al dueño"
                              className="mt-1 px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 w-fit"
                            >
                              <span className="material-symbols-outlined text-[12px]">schedule_send</span>
                              <span>📲 Enviar Recordatorio</span>
                            </button>
                          </div>
                        </td>

                        {/* Acciones Rápidas (1 Clic) */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center justify-center max-w-[210px] mx-auto">
                            
                            {/* 1-Click activation for pending payments */}
                            {isPendiente && (
                              <div className="w-full mb-1.5 flex flex-col gap-1">
                                <button
                                  onClick={() => handleQuickChangePlan(org, isPremium ? 'premium' : 'pro', 30)}
                                  title="Confirmar Pago y Activar Suscripción por 30 días"
                                  className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] shadow-xs flex items-center justify-center gap-1 transition-all cursor-pointer animate-pulse"
                                >
                                  <span className="material-symbols-outlined text-[14px]">verified</span>
                                  ✅ Activar {isPremium ? 'Premium (30d)' : 'Pro (30d)'}
                                </button>
                                {isPremium ? (
                                  <button
                                    onClick={() => handleQuickChangePlan(org, 'pro', 30)}
                                    title="Activar como Pro (30 días)"
                                    className="w-full px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-300 font-bold text-[10px] transition-all cursor-pointer"
                                  >
                                    Activar como Pro (30d)
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleQuickChangePlan(org, 'premium', 30)}
                                    title="Activar como Premium (30 días)"
                                    className="w-full px-2 py-0.5 rounded-lg bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white border border-purple-300 font-bold text-[10px] transition-all cursor-pointer"
                                  >
                                    Activar como Premium (30d)
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-center gap-1 flex-wrap">
                            {/* Activar / Renovar Plan Pro (Mensual / Anual) */}
                            <div className="inline-flex rounded-lg shadow-2xs">
                              <button
                                onClick={() => handleQuickChangePlan(org, 'pro', 30)}
                                title="Activar o renovar Plan Pro por 30 días"
                                className={`px-1.5 py-1 rounded-l-lg text-[10px] font-bold border transition-all cursor-pointer active:scale-95 flex items-center gap-0.5 ${
                                  isPro && isActive
                                    ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                                    : 'bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border-amber-300'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[11px]">star</span>
                                {isPro && isActive ? '+30d Pro' : 'Activar Pro (30d)'}
                              </button>
                              <button
                                onClick={() => handleQuickChangePlan(org, 'pro', 365)}
                                title="Activar Plan Pro Anual (+365 días)"
                                className="px-1.5 py-1 rounded-r-lg bg-amber-100 hover:bg-amber-600 text-amber-900 hover:text-white text-[10px] font-black border-y border-r border-amber-300 transition-all cursor-pointer active:scale-95"
                              >
                                1 Año
                              </button>
                            </div>

                            {/* Activar / Renovar Plan Premium (Mensual / Anual) */}
                            <div className="inline-flex rounded-lg shadow-2xs">
                              <button
                                onClick={() => handleQuickChangePlan(org, 'premium', 30)}
                                title="Activar o renovar Plan Premium por 30 días"
                                className={`px-1.5 py-1 rounded-l-lg text-[10px] font-bold border transition-all cursor-pointer active:scale-95 flex items-center gap-0.5 ${
                                  isPremium && isActive
                                    ? 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700'
                                    : 'bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white border-purple-300'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[11px]">workspace_premium</span>
                                {isPremium && isActive ? '+30d VIP' : 'VIP (30d)'}
                              </button>
                              <button
                                onClick={() => handleQuickChangePlan(org, 'premium', 365)}
                                title="Activar Plan Premium Anual (+365 días)"
                                className="px-1.5 py-1 rounded-r-lg bg-purple-100 hover:bg-purple-700 text-purple-900 hover:text-white text-[10px] font-black border-y border-r border-purple-300 transition-all cursor-pointer active:scale-95"
                              >
                                1 Año
                              </button>
                            </div>

                            {/* Bajar a Gratuito */}
                            {!isGratuito && (
                              <button
                                onClick={() => handleQuickChangePlan(org, 'gratuito', 30)}
                                title="Degradar a Plan Gratuito"
                                className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-600 text-gray-700 hover:text-white text-[10px] font-bold transition-all cursor-pointer active:scale-95"
                              >
                                Gratis
                              </button>
                            )}

                            {/* Edit Expiry / Notes Modal Launcher */}
                            <button
                              onClick={() => handleOpenExpiryModal(org)}
                              title="Ajustar fecha de vencimiento y registrar notas de pago"
                              className="p-1 rounded-lg bg-[#f0f3ff] hover:bg-[#8d4b00] text-[#554336] hover:text-white transition-all cursor-pointer flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit_calendar</span>
                            </button>

                            {/* Delete Client Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingOrg(org);
                                setIsDeleteModalOpen(true);
                              }}
                              title="Eliminar cliente y todos sus datos de la base de datos"
                              className="p-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white transition-all cursor-pointer flex items-center justify-center active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete_forever</span>
                            </button>
                          </div>
                        </div>
                      </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* =========================================================================
          MODAL: AJUSTE DE VENCIMIENTO Y ESTADO DE SUSCRIPCIÓN
          ========================================================================= */}
      {isExpiryModalOpen && editingOrg && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8E2D8] relative">
            <button
              onClick={() => setIsExpiryModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">calendar_month</span>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#111c2d]">
                  Ajustar Suscripción
                </h3>
                <p className="text-xs text-[#554336] truncate max-w-[280px]">
                  {editingOrg.nombre_negocio} ({editingOrg.ownerName})
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Status Selector */}
              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Estado de la Suscripción:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['active', 'pendiente_pago', 'paused', 'expired'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModalStatus(st)}
                      className={`py-2 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                        modalStatus === st
                          ? st === 'active'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : st === 'pendiente_pago'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : st === 'paused'
                            ? 'bg-yellow-600 text-white border-yellow-600'
                            : 'bg-rose-600 text-white border-rose-600'
                          : 'bg-[#FAF8F5] text-[#554336] border-[#dbc2b0]/50'
                      }`}
                    >
                      {st === 'active'
                        ? 'Activo'
                        : st === 'pendiente_pago'
                        ? 'Pendiente'
                        : st === 'paused'
                        ? 'Pausado'
                        : 'Vencido'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Fecha de Vencimiento:</label>
                <input
                  type="date"
                  value={modalExpiryDate}
                  onChange={(e) => setModalExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs font-bold text-[#111c2d] focus:bg-white focus:outline-none"
                />
                
                {/* Fast presets */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-gray-500">Atajos:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                      setModalExpiryDate(d);
                    }}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-[#554336] cursor-pointer"
                  >
                    +30 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
                      setModalExpiryDate(d);
                    }}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-[#554336] cursor-pointer"
                  >
                    +90 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
                      setModalExpiryDate(d);
                    }}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-[#554336] cursor-pointer"
                  >
                    +1 Año
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalExpiryDate('2099-12-31')}
                    className="px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-[10px] font-bold text-purple-800 cursor-pointer"
                  >
                    Ilimitado
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-[#111c2d] mb-1">
                  Notas de Pago y Referencias Administrativas:
                </label>
                <textarea
                  rows={3}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Ej: Pago Móvil Mercantil Ref #123456 confirmado. O Binance USDT..."
                  className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs text-[#111c2d] focus:bg-white focus:outline-none resize-none"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-[#f0ebe3]">
              <button
                type="button"
                onClick={() => setIsExpiryModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#554336] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveExpiryModal}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#8d4b00] hover:bg-[#713c00] text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">save</span>
                )}
                <span>Guardar Cambios</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTRO MANUAL DE CLIENTE / BODEGA
          ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E8E2D8] relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">add_business</span>
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#111c2d]">
                  Registrar Bodega Manualmente
                </h3>
                <p className="text-xs text-[#554336]">
                  Da de alta a un comercio tras confirmar su pago directo
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateManual} className="space-y-3.5 text-xs">
              
              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Nombre del Negocio / Bodega *</label>
                <input
                  type="text"
                  required
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  placeholder="Ej: Inversiones Los Andes C.A."
                  className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs font-bold text-[#111c2d] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#111c2d] mb-1">Nombre del Dueño</label>
                  <input
                    type="text"
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    placeholder="Ej: Manuel Castillo"
                    className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs text-[#111c2d] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#111c2d] mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    value={newOwnerPhone}
                    onChange={(e) => setNewOwnerPhone(e.target.value)}
                    placeholder="Ej: +58 424 1234567"
                    className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs text-[#111c2d] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Correo Electrónico del Dueño *</label>
                <input
                  type="email"
                  required
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  placeholder="ejemplo@bodega.com"
                  className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs text-[#111c2d] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Plan a Asignar:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gratuito', 'pro', 'premium'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPlan(p)}
                      className={`py-2 rounded-xl font-bold capitalize transition-all cursor-pointer border ${
                        newPlan === p
                          ? 'bg-[#111c2d] text-white border-[#111c2d]'
                          : 'bg-[#FAF8F5] text-[#554336] border-[#dbc2b0]/50'
                      }`}
                    >
                      {p === 'gratuito' ? 'Gratis ($0)' : p === 'pro' ? 'Pro ($9.99)' : 'Premium ($19.99)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#111c2d] mb-1">Notas de Pago / Comprobante:</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ej: Pago verificado por Pago Móvil Mercantil #998811"
                  className="w-full px-3 py-2 rounded-xl border border-[#dbc2b0]/60 bg-[#FAF8F5] text-xs text-[#111c2d] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-[#f0ebe3]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#554336] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#006c4a] hover:bg-[#005238] text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">add_task</span>
                  )}
                  <span>Crear y Activar Bodega</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CONFIRMACIÓN DE ELIMINACIÓN DE CLIENTE (BORRADOR DEFINITIVO)
          ========================================================================= */}
      {isDeleteModalOpen && deletingOrg && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeletingOrg(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[30px]">warning</span>
              </div>
              <div>
                <h3 className="text-base font-black text-[#111c2d]">
                  ¿Eliminar negocio y todos sus datos?
                </h3>
                <p className="text-xs text-rose-600 font-bold">
                  Acción irreversible • Borrado definitivo
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200/80 mb-5 text-xs text-[#554336] space-y-2">
              <p>
                Estás a punto de eliminar a <strong className="text-[#111c2d] font-black">{deletingOrg.nombre_negocio}</strong> ({deletingOrg.ownerEmail || 'Sin correo'}).
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-800">
                <li>Se borrará la organización de Firestore y registros locales.</li>
                <li>Se eliminarán todos sus <strong>productos del inventario</strong>.</li>
                <li>Se borrarán los <strong>clientes, fiados y cuentas por cobrar</strong>.</li>
                <li>Se eliminarán las <strong>ventas y cierres de caja</strong>.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#f0ebe3]">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingOrg(null);
                }}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#554336] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                )}
                <span>Sí, Eliminar Definitivamente</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
