import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { UserProfile } from '../firebase/types';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  currentUser?: User | null;
  userProfile?: UserProfile | null;
  onShowToast: (msg: string, icon?: string) => void;
  bcvRate?: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  currentUser,
  userProfile,
  onShowToast,
  bcvRate = 65.40
}) => {
  // Direct Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<'pago_movil' | 'binance' | 'zinli'>('pago_movil');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Payment Report Form inside Modal
  const [reportStoreName, setReportStoreName] = useState('');
  const [reportUserEmail, setReportUserEmail] = useState(currentUser?.email || '');
  const [reportRefNumber, setReportRefNumber] = useState('');

  // Mobile navigation menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    onShowToast(`¡${label} copiado al portapapeles!`, 'content_copy');
    setTimeout(() => {
      setCopiedKey(null);
    }, 2500);
  };

  // WhatsApp Payment Report Link Generator
  const handleReportPaymentWhatsApp = () => {
    const adminPhone = '584141234567'; // Admin / Author WhatsApp
    const methodNames = {
      pago_movil: 'Pago Móvil / Transferencia Bancaria',
      binance: 'Binance Pay (USDT)',
      zinli: 'Zinli (USD)'
    };
    const methodName = methodNames[selectedPaymentTab];

    const message = `¡Hola Ing. William Cordovez! 👋 Acabo de realizar el pago para activar el *Plan Pro* de *Cuaderno Digital Bodega*.

📋 *Detalles de la Activación:*
• *Plan:* Plan Pro ($9.99 USD / mes)
• *Negocio / Bodega:* ${reportStoreName.trim() || 'Mi Bodega'}
• *Correo Registrado:* ${reportUserEmail.trim() || 'No especificado'}
• *Método de Pago:* ${methodName}
• *Nro. de Referencia:* ${reportRefNumber.trim() || 'Adjunto en comprobante'}

Por favor confirmar la recepción para habilitar el inventario ilimitado y escaneos con IA. ¡Muchas gracias!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${adminPhone}?text=${encoded}`, '_blank');
    onShowToast('Abriendo WhatsApp para reportar pago...', 'chat');
  };

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111C2D] font-sans antialiased selection:bg-[#ffdcc3] selection:text-[#8d4b00]">
      
      {/* 1. TOP NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E2D8] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-11 h-11 rounded-2xl bg-[#ffdcc3] flex items-center justify-center text-[#8d4b00] shadow-xs shrink-0">
              <span className="material-symbols-outlined text-[26px]">edit_note</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-lg sm:text-xl text-[#111c2d] tracking-tight">
                  Cuaderno Digital
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#82f5c1] text-[#00714e] text-[10px] font-black uppercase tracking-wider">
                  Bodega SaaS
                </span>
              </div>
              <p className="text-[11px] text-[#554336] hidden sm:block">
                Punto de Venta e Inteligencia para Comercios
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-[#554336]">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-[#8d4b00] transition-colors cursor-pointer"
            >
              Funcionalidades
            </button>
            <button
              onClick={() => scrollToSection('mission-vision')}
              className="hover:text-[#8d4b00] transition-colors cursor-pointer"
            >
              Misión & Visión
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="hover:text-[#8d4b00] transition-colors cursor-pointer"
            >
              Precios & Planes
            </button>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="hover:text-[#8d4b00] text-[#8d4b00] font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">credit_card</span>
              Activar Plan Pro
            </button>
          </nav>

          {/* Top CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            {currentUser ? (
              <button
                type="button"
                onClick={() => onNavigate('/')}
                className="px-4 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">storefront</span>
                Ir a Mi Bodega (Panel)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="px-4 py-2.5 rounded-xl border border-[#E8E2D8] hover:border-[#8d4b00] text-xs font-bold text-[#111c2d] hover:text-[#8d4b00] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px]">lock</span>
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/register')}
                  className="px-4 py-2.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span className="material-symbols-outlined text-[17px]">rocket_launch</span>
                  Probar Gratis
                </button>
              </>
            )}
          </div>

          {/* Mobile Hamburger Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="md:hidden w-10 h-10 rounded-xl bg-[#f0f3ff] text-[#111c2d] flex items-center justify-center cursor-pointer border border-[#dbc2b0]/30"
            aria-label="Abrir Menú"
          >
            <span className="material-symbols-outlined text-[24px]">
              {isMobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#E8E2D8] px-4 py-4 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-150">
            <button
              onClick={() => scrollToSection('features')}
              className="block w-full text-left py-2 text-xs font-bold text-[#111c2d]"
            >
              Funcionalidades Estrella
            </button>
            <button
              onClick={() => scrollToSection('mission-vision')}
              className="block w-full text-left py-2 text-xs font-bold text-[#111c2d]"
            >
              Misión, Visión & Autor
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="block w-full text-left py-2 text-xs font-bold text-[#111c2d]"
            >
              Precios & Planes
            </button>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsPaymentModalOpen(true);
              }}
              className="block w-full text-left py-2 text-xs font-black text-[#8d4b00] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">credit_card</span>
              Módulo de Pago Directo (Plan Pro)
            </button>

            <div className="pt-3 border-t border-[#E8E2D8] flex flex-col gap-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="w-full py-3 rounded-xl bg-[#8d4b00] text-white text-xs font-black text-center flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">storefront</span>
                  Ir a Mi Bodega
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('/register')}
                    className="w-full py-3 rounded-xl bg-[#8d4b00] text-white text-xs font-black text-center flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    🚀 Probar Gratis (5 Productos)
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="w-full py-2.5 rounded-xl border border-[#E8E2D8] text-[#111c2d] text-xs font-bold text-center flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[17px]">lock</span>
                    🔐 Iniciar Sesión
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Background decorative gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-[#ffdcc3]/30 via-[#ffdcc3]/10 to-transparent pointer-events-none -z-10 rounded-full blur-3xl opacity-70" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f0f3ff] border border-[#dbc2b0]/50 text-xs font-bold text-[#8d4b00] shadow-2xs animate-in fade-in duration-300">
              <span className="w-2 h-2 rounded-full bg-[#006c4a] animate-pulse" />
              <span>SaaS Especializado para el Comercio Minorista y Bodegas</span>
              <span className="px-1.5 py-0.2 rounded-md bg-[#82f5c1] text-[#00714e] text-[9px] font-black uppercase">
                Tasa BCV En Vivo
              </span>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-black text-[#111c2d] tracking-tight leading-[1.12]">
              Cuaderno Digital Bodega: <br />
              <span className="bg-gradient-to-r from-[#8d4b00] via-[#b15f00] to-[#e65100] bg-clip-text text-transparent">
                El sistema inteligente para el control de tu negocio
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-lg text-[#554336] leading-relaxed max-w-2xl mx-auto">
              Gestiona inventario, ventas diarias, fiados por WhatsApp y lectura de facturas con Inteligencia Artificial desde tu celular o computadora.
            </p>

            {/* Hero Action Buttons (CTAs) */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <button
                type="button"
                onClick={() => onNavigate('/register')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#8d4b00] hover:bg-[#b15f00] text-white font-black text-sm sm:text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>🚀 Probar Gratis (5 Productos)</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white hover:bg-[#FAF8F5] text-[#111c2d] font-extrabold text-sm sm:text-base border border-[#E8E2D8] shadow-xs hover:border-[#8d4b00]/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px] text-[#8d4b00]">lock</span>
                <span>🔐 Iniciar Sesión</span>
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-[#554336] font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#006c4a]">check_circle</span>
                Sin tarjeta de crédito requerida
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#006c4a]">check_circle</span>
                Conversión automática USD y Bs BCV
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#006c4a]">check_circle</span>
                Multi-Tenant: tus datos 100% aislados
              </span>
            </div>

          </div>

          {/* HERO APP PREVIEW MOCKUP */}
          <div className="mt-12 sm:mt-16 max-w-5xl mx-auto rounded-3xl bg-white p-3 sm:p-5 shadow-2xl border border-[#E8E2D8] relative overflow-hidden group">
            {/* Top Mockup Browser / Window Bar */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E8E2D8] px-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                <span className="text-[11px] font-mono font-bold text-[#8d7c71] ml-2 hidden sm:inline">
                  https://cuaderno-bodega.app/mostrador
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-[10px] font-black uppercase">
                  Tasa BCV: {bcvRate.toFixed(2)} Bs/$
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#82f5c1] text-[#00714e] text-[10px] font-black uppercase">
                  Bodega La Bendición • Dueño
                </span>
              </div>
            </div>

            {/* Inner Simulated App Screen */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#FAF8F5] p-3 sm:p-5 rounded-2xl border border-[#E8E2D8]/70">
              
              {/* Left Column: Cuaderno Note with AI and Quick Cart (7 Cols) */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="bg-white p-4 rounded-xl border border-[#E8E2D8] shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#111c2d]">
                    <span className="flex items-center gap-1.5 text-[#8d4b00]">
                      <span className="material-symbols-outlined text-[18px]">edit_note</span>
                      Cuaderno Diario Inteligente
                    </span>
                    <span className="text-[10px] text-[#006c4a] bg-[#82f5c1]/30 px-2 py-0.5 rounded-full">
                      Reconocimiento en Vivo
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[#dbc2b0]/30 font-mono text-xs text-[#111c2d] leading-relaxed">
                    "Carlos compró 2 Harina PAN, 1 Pasta Primor y 1 Arroz Mary fiado para el viernes"
                  </div>
                </div>

                {/* Detected Cart */}
                <div className="bg-white p-4 rounded-xl border border-[#E8E2D8] shadow-2xs space-y-2.5">
                  <span className="text-[11px] font-bold text-[#554336] uppercase tracking-wider block">
                    Productos Detectados (3 ítems)
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <div className="p-2 rounded-lg bg-[#FAF8F5] flex items-center justify-between">
                      <span className="font-bold text-[#111c2d]">2x Harina PAN (1 kg)</span>
                      <span className="font-black text-[#006c4a]">$2.40 USD (156.96 Bs)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FAF8F5] flex items-center justify-between">
                      <span className="font-bold text-[#111c2d]">1x Pasta Primor (1 kg)</span>
                      <span className="font-black text-[#006c4a]">$1.65 USD (107.91 Bs)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FAF8F5] flex items-center justify-between">
                      <span className="font-bold text-[#111c2d]">1x Arroz Mary Esmeralda</span>
                      <span className="font-black text-[#006c4a]">$1.50 USD (98.10 Bs)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Checkout & Payment Action Preview (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-white p-4 rounded-xl border border-[#E8E2D8] shadow-2xs gap-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[#554336] uppercase tracking-wider block">
                    Total de la Cuenta
                  </span>
                  <div className="p-3 rounded-xl bg-[#f0f3ff] border border-[#dbc2b0]/30 text-right">
                    <div className="text-3xl font-black text-[#006c4a] font-heading">
                      $5.55 USD
                    </div>
                    <div className="text-xs font-bold text-[#111c2d] mt-0.5">
                      {(5.55 * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs (Tasa BCV)
                    </div>
                  </div>
                </div>

                {/* Tactile Touch Buttons */}
                <div className="grid grid-cols-2 gap-2 text-white text-xs font-bold">
                  <div className="p-2.5 rounded-xl bg-[#0051d5] flex items-center gap-1.5 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">phonelink_ring</span>
                    <span>Pago Móvil</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#006c4a] flex items-center gap-1.5 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">attach_money</span>
                    <span>Efectivo $</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#111c2d] flex items-center gap-1.5 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">local_atm</span>
                    <span>Efectivo Bs</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#ba1a1a] flex items-center gap-1.5 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    <span>Fiado / Debe</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#85f8c4]/20 border border-[#82f5c1] text-[11px] text-[#00714e] font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">chat</span>
                  <span>Recordatorio por WhatsApp listo con 1 clic</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* 3. FUNCIONALIDADES ESTRELLA */}
      <section id="features" className="py-20 bg-white border-y border-[#E8E2D8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="px-3 py-1 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-xs font-black uppercase tracking-wider">
              Tecnología para Bodegas Reales
            </span>
            <h2 className="text-3xl sm:text-4xl font-heading font-black text-[#111c2d] tracking-tight">
              ¿Qué es Cuaderno Digital y cuáles son sus Funcionalidades Estrella?
            </h2>
            <p className="text-sm sm:text-base text-[#554336] leading-relaxed">
              Diseñado pensando en la agilidad del día a día de una bodega venezolana: sin complicaciones contables, con lectura visual de facturas y control de caja instantáneo.
            </p>
          </div>

          {/* Grid of 4 Feature Cards with Visual UI Mockups */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Feature 1: Lectura de Facturas con IA */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-all flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[32px]">document_scanner</span>
                </div>
                <div>
                  <h3 className="text-xl font-heading font-black text-[#111c2d]">
                    📷 Lectura de Facturas de Proveedores con IA
                  </h3>
                  <p className="text-xs sm:text-sm text-[#554336] mt-1.5 leading-relaxed">
                    'Toma una foto a la factura de tu proveedor y actualiza el inventario en segundos.'
                  </p>
                </div>

                {/* Mockup Preview Card */}
                <div className="p-4 rounded-2xl bg-white border border-[#dbc2b0]/50 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-[#E8E2D8]">
                    <span className="font-bold text-[#111c2d] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-[#8d4b00]">receipt</span>
                      Factura Distribuidora Polar / Pepsi
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-[#82f5c1] text-[#00714e] text-[10px] font-black uppercase">
                      OCR Gemini Vision
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#FAF8F5]">
                      <span>Harina PAN Blanca (Bulto 20 kg)</span>
                      <span className="font-bold text-[#006c4a]">Cant: 5 • Costo: $0.95 c/u</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#FAF8F5]">
                      <span>Mantequilla Mavesa 500g</span>
                      <span className="font-bold text-[#006c4a]">Cant: 24 • Costo: $1.40 c/u</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#f0f3ff] text-[11px] text-[#554336] flex items-center justify-between">
                    <span>Margen sugerido automático: <strong>30%</strong></span>
                    <span className="font-black text-[#8d4b00]">Actualizar Stock (1 Clic)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2: Cobros por WhatsApp */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-all flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#85f8c4]/40 text-[#006c4a] flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[32px]">chat</span>
                </div>
                <div>
                  <h3 className="text-xl font-heading font-black text-[#111c2d]">
                    📲 Notificaciones y Cobros por WhatsApp
                  </h3>
                  <p className="text-xs sm:text-sm text-[#554336] mt-1.5 leading-relaxed">
                    'Envía recordatorios de fiados a tus clientes con un solo clic.'
                  </p>
                </div>

                {/* Mockup Preview Card: WhatsApp Chat Message */}
                <div className="p-4 rounded-2xl bg-white border border-[#82f5c1]/50 space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#E8E2D8]">
                    <div className="w-7 h-7 rounded-full bg-[#006c4a] text-white flex items-center justify-center font-bold text-xs">
                      W
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#111c2d]">WhatsApp Directo • Carlos Gómez</div>
                      <div className="text-[10px] text-[#006c4a]">Enlace automático api.whatsapp.com</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#e7ffdb] border border-[#82f5c1]/60 text-xs text-[#111c2d] leading-relaxed relative">
                    <p>
                      <em>"Hola Carlos Gómez, te saludamos de Bodega La Bendición. Tu saldo pendiente al día de hoy es de <strong>$14.20 USD ({ (14.20 * bcvRate).toFixed(2) } Bs)</strong>. ¡Gracias por tu preferencia!"</em>
                    </p>
                    <span className="text-[9px] text-[#006c4a] block text-right mt-1">11:42 a. m. ✓✓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3: Cierre de Caja Diario */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-all flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#dbe1ff] text-[#0051d5] flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[32px]">payments</span>
                </div>
                <div>
                  <h3 className="text-xl font-heading font-black text-[#111c2d]">
                    📊 Cierre de Caja Diario y Desglose Financiero
                  </h3>
                  <p className="text-xs sm:text-sm text-[#554336] mt-1.5 leading-relaxed">
                    'Reportes de ventas en efectivo USD, Bs y Pago Móvil.'
                  </p>
                </div>

                {/* Mockup Preview Card */}
                <div className="p-4 rounded-2xl bg-white border border-[#dbc2b0]/50 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-[#E8E2D8]">
                    <span className="font-extrabold text-[#111c2d]">Resumen de Cierre de Turno</span>
                    <span className="text-[10px] text-[#554336]">Hoy a las 8:00 PM</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#FAF8F5]">
                      <span className="text-[#554336] block">Efectivo USD:</span>
                      <span className="font-black text-[#006c4a] text-xs">$145.00</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FAF8F5]">
                      <span className="text-[#554336] block">Pago Móvil:</span>
                      <span className="font-black text-[#0051d5] text-xs">8,450.00 Bs</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FAF8F5]">
                      <span className="text-[#554336] block">Efectivo Bs:</span>
                      <span className="font-black text-[#111c2d] text-xs">1,250.00 Bs</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FAF8F5]">
                      <span className="text-[#554336] block">Total Fiado:</span>
                      <span className="font-black text-[#ba1a1a] text-xs">$32.50</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => scrollToSection('pricing')}
                    className="w-full py-1.5 rounded-lg bg-[#006c4a] text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">send</span>
                    Enviar Cierre por WhatsApp al Dueño
                  </button>
                </div>
              </div>
            </div>

            {/* Feature 4: Múltiples Roles (RBAC) */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8E2D8] hover:border-[#8d4b00]/40 transition-all flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#ede9fe] text-[#6d28d9] flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[32px]">shield_person</span>
                </div>
                <div>
                  <h3 className="text-xl font-heading font-black text-[#111c2d]">
                    👥 Múltiples Roles y Control de Seguridad (RBAC)
                  </h3>
                  <p className="text-xs sm:text-sm text-[#554336] mt-1.5 leading-relaxed">
                    'Control exclusivo para el Dueño y vista simplificada para Empleados.'
                  </p>
                </div>

                {/* Mockup Preview Card: RBAC Split */}
                <div className="p-4 rounded-2xl bg-white border border-[#dbc2b0]/50 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-[#E8E2D8]">
                    <span className="font-extrabold text-[#111c2d]">Jerarquía Segura de 3 Niveles</span>
                    <span className="text-[10px] font-bold text-[#6d28d9]">Base de Datos Aislada</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#fff8f0] border border-[#ffdcc3] flex items-center justify-between">
                      <span className="font-bold text-[#8d4b00]">👑 Rol Dueño (Super Admin)</span>
                      <span className="text-[#554336]">Acceso total, márgenes y roles</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#f5f3ff] border border-[#ede9fe] flex items-center justify-between">
                      <span className="font-bold text-[#6d28d9]">💼 Rol Administrador</span>
                      <span className="text-[#554336]">Inventario y cierres (sin usuarios)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-between">
                      <span className="font-bold text-[#0051d5]">🛒 Rol Empleado (Cajero)</span>
                      <span className="text-[#ba1a1a] font-semibold">Costos y reportes 100% ocultos</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 4. MISIÓN, VISIÓN Y AUTORÍA */}
      <section id="mission-vision" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="px-3 py-1 rounded-full bg-[#f0f3ff] text-[#8d4b00] text-xs font-black uppercase tracking-wider">
              Compromiso & Trayectoria
            </span>
            <h2 className="text-3xl sm:text-4xl font-heading font-black text-[#111c2d] tracking-tight">
              Misión, Visión y Autoría
            </h2>
            <p className="text-sm text-[#554336]">
              Construido con tecnología de punta y conocimiento real de la dinámica comercial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Misión Card */}
            <div className="p-8 rounded-3xl bg-white border border-[#E8E2D8] shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#ffdcc3] text-[#8d4b00] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px]">flag</span>
                </div>
                <h3 className="text-2xl font-heading font-black text-[#111c2d]">
                  Nuestra Misión
                </h3>
                <blockquote className="text-sm sm:text-base text-[#554336] leading-relaxed italic border-l-4 border-[#8d4b00] pl-4">
                  "Empoderar a los pequeños y medianos comerciantes con herramientas tecnológicas accesibles e inteligentes que simplifiquen su gestión financiera."
                </blockquote>
              </div>
            </div>

            {/* Visión Card */}
            <div className="p-8 rounded-3xl bg-white border border-[#E8E2D8] shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#82f5c1] text-[#00714e] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px]">travel_explore</span>
                </div>
                <h3 className="text-2xl font-heading font-black text-[#111c2d]">
                  Nuestra Visión
                </h3>
                <blockquote className="text-sm sm:text-base text-[#554336] leading-relaxed italic border-l-4 border-[#00714e] pl-4">
                  "Ser la plataforma líder en digitalización y automatización para bodegas y comercios locales en América Latina."
                </blockquote>
              </div>
            </div>

          </div>

          {/* INSIGNIA DE AUTORÍA DESTACADA */}
          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-[#111c2d] via-[#1a293d] to-[#111c2d] text-white shadow-xl border border-[#2d3b4f] relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-80 bg-[#8d4b00]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#ffdcc3] to-[#8d4b00] p-1 shadow-lg shrink-0 flex items-center justify-center">
                <div className="w-full h-full rounded-[22px] bg-[#111c2d] flex items-center justify-center text-[#ffdcc3]">
                  <span className="material-symbols-outlined text-[40px]">workspace_premium</span>
                </div>
              </div>

              <div className="space-y-2.5 flex-1">
                <span className="px-3 py-1 rounded-full bg-[#ffdcc3]/20 text-[#ffdcc3] text-xs font-black uppercase tracking-wider inline-block">
                  Arquitectura SaaS & Ingeniería de Software
                </span>
                <h3 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
                  Diseñado y Desarrollado con excelencia por el <span className="text-[#ffdcc3]">Ing. William Cordovez</span>
                </h3>
                <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-2xl">
                  Solución de arquitectura Multi-Tenant de alto rendimiento, diseñada para garantizar soberanía de datos, procesamiento seguro en tiempo real y máxima simplicidad de uso para comerciantes independientes.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] font-mono text-gray-300">
                  <span className="px-2.5 py-1 rounded-lg bg-white/10">React 19</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/10">TypeScript</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/10">Google Gemini AI</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/10">Supabase / Firebase RLS</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 5. TABLA DE PRECIOS Y PLANES (PRICING) */}
      <section id="pricing" className="py-20 bg-white border-y border-[#E8E2D8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-xs font-black uppercase tracking-wider">
              Inversión Clara
            </span>
            <h2 className="text-3xl sm:text-4xl font-heading font-black text-[#111c2d] tracking-tight">
              Planes Transparentes para Cada Etapa
            </h2>
            <p className="text-sm sm:text-base text-[#554336]">
              Comienza hoy mismo con la versión gratuita y escala a Pro cuando requieras inventario ilimitado y lectura automática con IA.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
            
            {/* Plan 1: Plan Prueba (Gratis) */}
            <div className="p-8 rounded-3xl bg-[#FAF8F5] border-2 border-[#E8E2D8] flex flex-col justify-between shadow-xs">
              <div className="space-y-6">
                <div>
                  <span className="px-3 py-1 rounded-full bg-[#E8E2D8] text-[#554336] text-[11px] font-black uppercase tracking-wider">
                    Versión de Entrada
                  </span>
                  <h3 className="text-2xl font-heading font-black text-[#111c2d] mt-2">
                    Plan Prueba (Gratis)
                  </h3>
                  <p className="text-xs text-[#554336] mt-1">
                    Ideal para explorar la plataforma en tu negocio.
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-[#111c2d] font-heading">$0</span>
                  <span className="text-xs font-bold text-[#554336]">/ para siempre</span>
                </div>

                <div className="space-y-3 pt-2 text-xs text-[#111c2d]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Hasta <strong>5 productos</strong> en inventario</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span><strong>1 escaneo de prueba</strong> de factura con IA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Gestión de fiados y cuentas por cobrar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Recordatorios por WhatsApp con 1 clic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Conversión en vivo a Tasa BCV (USD / Bs)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#8d7c71]">
                    <span className="material-symbols-outlined text-[#8d7c71] text-[18px]">remove</span>
                    <span>Sin usuarios adicionales ni roles avanzados</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => onNavigate('/register')}
                  className="w-full py-3.5 px-4 rounded-xl border-2 border-[#8d4b00] text-[#8d4b00] hover:bg-[#8d4b00] hover:text-white font-extrabold text-xs sm:text-sm transition-all text-center cursor-pointer"
                >
                  🚀 Comenzar Gratis Ahora
                </button>
              </div>
            </div>

            {/* Plan 2: Plan Pro (Suscripción Comercial) */}
            <div className="p-8 rounded-3xl bg-white border-2 border-[#8d4b00] flex flex-col justify-between shadow-xl relative overflow-hidden ring-4 ring-[#ffdcc3]/50">
              {/* Highlight ribbon */}
              <div className="absolute top-0 right-0 bg-[#8d4b00] text-white text-[10px] font-black uppercase tracking-wider py-1.5 px-8 rotate-45 translate-x-7 translate-y-3 shadow-xs">
                Popular
              </div>

              <div className="space-y-6">
                <div>
                  <span className="px-3 py-1 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-[11px] font-black uppercase tracking-wider">
                    Comercial Completo
                  </span>
                  <h3 className="text-2xl font-heading font-black text-[#111c2d] mt-2">
                    Plan Pro
                  </h3>
                  <p className="text-xs text-[#554336] mt-1">
                    Inventario sin límites y automatización absoluta.
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-[#8d4b00] font-heading">$9.99</span>
                  <span className="text-xs font-bold text-[#554336]">/ mes (o $99 anual)</span>
                </div>

                <div className="space-y-3 pt-2 text-xs text-[#111c2d]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span><strong>Inventario ILIMITADO</strong> de productos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span><strong>Lectura ILIMITADA de facturas con IA</strong> (Gemini)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span><strong>Usuarios y colaboradores ilimitados</strong> con roles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Jerarquía de 3 roles (Dueño, Admin, Cajero)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Envío de Cierre de Caja por WhatsApp al Dueño</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Personalización de Logo y Marca de la bodega</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006c4a] text-[18px]">check_circle</span>
                    <span>Soporte prioritario directo por WhatsApp</span>
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full py-4 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <span className="material-symbols-outlined text-[20px]">credit_card</span>
                  💳 Activar Plan Pro Ahora
                </button>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 6. MÓDULO DE PAGO DIRECTO (SECCIÓN IN-PAGE & MODAL) */}
      <section id="payment" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          
          <div className="text-center space-y-2">
            <span className="px-3 py-1 rounded-full bg-[#82f5c1] text-[#00714e] text-xs font-black uppercase tracking-wider">
              Activación Inmediata
            </span>
            <h2 className="text-3xl sm:text-4xl font-heading font-black text-[#111c2d] tracking-tight">
              💳 Módulo de Pago Directo
            </h2>
            <p className="text-xs sm:text-sm text-[#554336] max-w-xl mx-auto">
              Aceptamos los métodos más cómodos en Venezuela. Transfiere, copia los datos con 1 clic y reporta tu comprobante por WhatsApp para activación rápida.
            </p>
          </div>

          {/* Payment Card Container */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E8E2D8] shadow-lg space-y-6">
            
            {/* Tabs for Payment Methods */}
            <div className="grid grid-cols-3 gap-2 bg-[#FAF8F5] p-1.5 rounded-2xl border border-[#dbc2b0]/40">
              <button
                type="button"
                onClick={() => setSelectedPaymentTab('pago_movil')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedPaymentTab === 'pago_movil'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🇻🇪</span>
                <span className="truncate">Pago Móvil / Banco</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentTab('binance')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedPaymentTab === 'binance'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🟡</span>
                <span className="truncate">Binance Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentTab('zinli')}
                className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedPaymentTab === 'zinli'
                    ? 'bg-white text-[#8d4b00] shadow-xs'
                    : 'text-[#554336] hover:text-[#111c2d]'
                }`}
              >
                <span>🟢</span>
                <span className="truncate">Zinli</span>
              </button>
            </div>

            {/* Content for Selected Payment Method */}
            <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#dbc2b0]/30 space-y-4">
              
              {/* Option 1: Pago Móvil / Transferencia Nacional */}
              {selectedPaymentTab === 'pago_movil' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D8]">
                    <span className="text-xs font-black text-[#111c2d]">
                      🇻🇪 Pago Móvil y Transferencia Bancaria Nacional
                    </span>
                    <span className="text-[11px] font-bold text-[#006c4a]">
                      Monto: ${(9.99).toFixed(2)} USD ≈ {(9.99 * bcvRate).toFixed(2)} Bs
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Banco:</span>
                        <span className="font-extrabold text-[#111c2d]">Banesco (0134) / BDV (0102)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('Banesco', 'Banco')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Banco' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Teléfono Pago Móvil:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">0414-1234567</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('04141234567', 'Teléfono')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Teléfono' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Cédula / RIF:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">V-12.345.678</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('12345678', 'Cédula')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Cédula' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Beneficiario:</span>
                        <span className="font-extrabold text-[#111c2d]">Ing. William Cordovez</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('William Cordovez', 'Beneficiario')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Beneficiario' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Option 2: Binance Pay */}
              {selectedPaymentTab === 'binance' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D8]">
                    <span className="text-xs font-black text-[#111c2d]">
                      🟡 Binance Pay (USDT)
                    </span>
                    <span className="text-[11px] font-bold text-[#8d4b00]">
                      Monto: $9.99 USDT (Sin comisiones)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Binance Pay ID:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">284910293</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('284910293', 'Binance Pay ID')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Binance Pay ID' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Correo Binance:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">williamcordovezcn@gmail.com</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('williamcordovezcn@gmail.com', 'Correo Binance')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Correo Binance' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#554336]">
                    Transferencia instantánea 0% comisiones entre usuarios de Binance.
                  </p>
                </div>
              )}

              {/* Option 3: Zinli */}
              {selectedPaymentTab === 'zinli' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D8]">
                    <span className="text-xs font-black text-[#111c2d]">
                      🟢 Zinli Billetera Digital USD
                    </span>
                    <span className="text-[11px] font-bold text-[#006c4a]">
                      Monto: $9.99 USD
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Correo Zinli:</span>
                        <span className="font-mono font-extrabold text-[#111c2d]">williamcordovezcn@gmail.com</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('williamcordovezcn@gmail.com', 'Correo Zinli')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Correo Zinli' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#E8E2D8] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-[#554336] block">Titular:</span>
                        <span className="font-extrabold text-[#111c2d]">Ing. William Cordovez</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('William Cordovez', 'Titular')}
                        className="p-1 text-[#8d4b00] hover:bg-[#ffdcc3]/50 rounded cursor-pointer"
                        title="Copiar"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedKey === 'Titular' ? 'done' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Quick Report Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Nombre de tu Bodega:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Bodega San José"
                  value={reportStoreName}
                  onChange={(e) => setReportStoreName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Correo Registrado:
                </label>
                <input
                  type="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={reportUserEmail}
                  onChange={(e) => setReportUserEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Nro. de Referencia:
                </label>
                <input
                  type="text"
                  placeholder="Ej. 12948293"
                  value={reportRefNumber}
                  onChange={(e) => setReportRefNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                />
              </div>
            </div>

            {/* WhatsApp CTA Button */}
            <button
              type="button"
              onClick={handleReportPaymentWhatsApp}
              className="w-full py-4 px-6 rounded-2xl bg-[#006c4a] hover:bg-[#005137] text-white font-black text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[24px]">chat</span>
              <span>📲 Reportar Pago por WhatsApp para Activación Inmediata</span>
            </button>

          </div>

        </div>
      </section>

      {/* 7. MODAL: ACTIVAR PLAN PRO AHORA */}
      {isPaymentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#E8E2D8] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-6 bg-[#8d4b00] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[28px]">credit_card</span>
                <div>
                  <h3 className="font-heading font-black text-base sm:text-lg">
                    💳 Activar Plan Pro Ahora
                  </h3>
                  <p className="text-xs opacity-90">
                    Suscripción Comercial con acceso ilimitado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* Payment selector tabs */}
              <div className="grid grid-cols-3 gap-1.5 bg-[#FAF8F5] p-1 rounded-xl border border-[#dbc2b0]/30 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentTab('pago_movil')}
                  className={`py-2 px-1 rounded-lg transition-all ${
                    selectedPaymentTab === 'pago_movil'
                      ? 'bg-[#8d4b00] text-white'
                      : 'text-[#554336] hover:bg-white'
                  }`}
                >
                  🇻🇪 Pago Móvil
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentTab('binance')}
                  className={`py-2 px-1 rounded-lg transition-all ${
                    selectedPaymentTab === 'binance'
                      ? 'bg-[#8d4b00] text-white'
                      : 'text-[#554336] hover:bg-white'
                  }`}
                >
                  🟡 Binance Pay
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentTab('zinli')}
                  className={`py-2 px-1 rounded-lg transition-all ${
                    selectedPaymentTab === 'zinli'
                      ? 'bg-[#8d4b00] text-white'
                      : 'text-[#554336] hover:bg-white'
                  }`}
                >
                  🟢 Zinli
                </button>
              </div>

              {/* Account details */}
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#dbc2b0]/40 space-y-2 text-xs">
                {selectedPaymentTab === 'pago_movil' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Banco:</span>
                      <span className="font-bold text-[#111c2d]">Banesco (0134) / BDV (0102)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Teléfono:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('04141234567', 'Teléfono')}
                        className="font-mono font-bold text-[#8d4b00] hover:underline"
                      >
                        0414-1234567 📋
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Cédula:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('12345678', 'Cédula')}
                        className="font-mono font-bold text-[#8d4b00] hover:underline"
                      >
                        V-12.345.678 📋
                      </button>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-[#E8E2D8]">
                      <span className="text-[#554336]">Monto en Bs:</span>
                      <span className="font-black text-[#006c4a]">
                        {(9.99 * bcvRate).toFixed(2)} Bs (Tasa BCV {bcvRate.toFixed(2)})
                      </span>
                    </div>
                  </div>
                )}

                {selectedPaymentTab === 'binance' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Binance Pay ID:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('284910293', 'Pay ID')}
                        className="font-mono font-bold text-[#8d4b00] hover:underline"
                      >
                        284910293 📋
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Correo Binance:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('williamcordovezcn@gmail.com', 'Correo')}
                        className="font-mono font-bold text-[#8d4b00] hover:underline"
                      >
                        williamcordovezcn@gmail.com 📋
                      </button>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-[#E8E2D8]">
                      <span className="text-[#554336]">Monto:</span>
                      <span className="font-black text-[#006c4a]">$9.99 USDT</span>
                    </div>
                  </div>
                )}

                {selectedPaymentTab === 'zinli' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Correo Zinli:</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('williamcordovezcn@gmail.com', 'Correo')}
                        className="font-mono font-bold text-[#8d4b00] hover:underline"
                      >
                        williamcordovezcn@gmail.com 📋
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#554336]">Titular:</span>
                      <span className="font-bold text-[#111c2d]">Ing. William Cordovez</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-[#E8E2D8]">
                      <span className="text-[#554336]">Monto:</span>
                      <span className="font-black text-[#006c4a]">$9.99 USD</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Form to submit via WhatsApp */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Nombre de tu Bodega / Negocio:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Bodega La Milagrosa"
                    value={reportStoreName}
                    onChange={(e) => setReportStoreName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Nro. de Referencia o Comprobante:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 182749102"
                    value={reportRefNumber}
                    onChange={(e) => setReportRefNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl focus:outline-none focus:border-[#8d4b00]"
                  />
                </div>
              </div>

              {/* WhatsApp Action */}
              <button
                type="button"
                onClick={handleReportPaymentWhatsApp}
                className="w-full py-3.5 px-4 rounded-xl bg-[#006c4a] hover:bg-[#005137] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">chat</span>
                <span>📲 Reportar Pago por WhatsApp</span>
              </button>

            </div>
          </div>
        </div>
      )}

      {/* 8. FOOTER */}
      <footer className="bg-white border-t border-[#E8E2D8] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ffdcc3] flex items-center justify-center text-[#8d4b00] shadow-xs">
              <span className="material-symbols-outlined text-[22px]">edit_note</span>
            </div>
            <div>
              <span className="font-heading font-extrabold text-sm text-[#111c2d]">
                Cuaderno Digital Bodega
              </span>
              <p className="text-[11px] text-[#554336]">
                El sistema inteligente para el control de tu negocio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-[#554336]">
            <button
              onClick={() => onNavigate('/login')}
              className="hover:text-[#8d4b00] transition-colors cursor-pointer"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => onNavigate('/register')}
              className="hover:text-[#8d4b00] transition-colors cursor-pointer"
            >
              Registrar Negocio
            </button>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="hover:text-[#8d4b00] text-[#8d4b00] transition-colors cursor-pointer"
            >
              Activar Plan Pro
            </button>
          </div>

          <div className="text-xs text-[#554336] sm:text-right">
            <p>© 2026 Cuaderno Digital Bodega. Todos los derechos reservados.</p>
            <p className="text-[11px] font-semibold text-[#8d4b00] mt-0.5">
              Diseñado y Desarrollado con excelencia por el <strong>Ing. William Cordovez</strong>
            </p>
          </div>

        </div>
      </footer>

    </div>
  );
};
