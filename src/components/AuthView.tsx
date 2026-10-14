import React, { useState } from 'react';
import {
  registerBusiness,
  loginWithEmail,
  loginWithGoogleMultiTenant,
  AuthSession
} from '../firebase/authService';
import { DirectPaymentModal } from './DirectPaymentModal';

interface AuthViewProps {
  initialMode?: 'login' | 'register';
  onAuthSuccess: (session: AuthSession) => void;
  onNavigate: (path: string) => void;
  onShowToast: (msg: string, icon?: string) => void;
  bcvRate?: number;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode = 'login',
  onAuthSuccess,
  onNavigate,
  onShowToast,
  bcvRate = 877.90
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields - Initialized completely empty ("") for all users
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [planSuscripcion, setPlanSuscripcion] = useState<'gratuito' | 'pro' | 'premium'>('pro');

  // Mandatory Payment Modal State for Paid Plans
  const [isDirectPaymentOpen, setIsDirectPaymentOpen] = useState(false);
  const [registeredPaidOrg, setRegisteredPaidOrg] = useState<{
    nombreNegocio: string;
    email: string;
    plan: 'pro' | 'premium';
  } | null>(null);

  const switchMode = (newMode: 'login' | 'register') => {
    setErrorMessage(null);
    setRegisteredPaidOrg(null);
    setMode(newMode);
    onNavigate(newMode === 'register' ? '/register' : '/login');
  };

  const mapAuthError = (err: any): string => {
    const code = err?.code || '';
    if (code === 'auth/email-already-in-use') {
      return 'Este correo electrónico ya está registrado. Por favor inicia sesión.';
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Correo o contraseña incorrectos. Verifica tus datos.';
    }
    if (code === 'auth/weak-password') {
      return 'La contraseña debe contener al menos 6 caracteres.';
    }
    if (code === 'auth/invalid-email') {
      return 'El formato del correo electrónico no es válido.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'La ventana de Google fue cerrada antes de completar el acceso.';
    }
    return err?.message || 'Ocurrió un error al procesar la solicitud.';
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!nombreNegocio.trim()) {
      setErrorMessage('Por favor ingresa el nombre de tu negocio o bodega.');
      return;
    }
    if (!nombreUsuario.trim()) {
      setErrorMessage('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Por favor ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const session = await registerBusiness({
        nombreNegocio,
        nombreUsuario,
        email,
        password,
        planSuscripcion
      });

      if (planSuscripcion === 'pro' || planSuscripcion === 'premium') {
        // Enforce mandatory payment: DO NOT redirect to dashboard!
        setRegisteredPaidOrg({
          nombreNegocio: session.organization.nombre_negocio,
          email: session.organization.ownerEmail || email.trim(),
          plan: planSuscripcion
        });
        setIsDirectPaymentOpen(true);
        onShowToast(`¡Bodega registrada! Por favor completa tu pago para activar tu cuenta.`, 'payments');
        return;
      }

      onShowToast(`¡Bienvenido! Tu cuenta con Plan Gratuito está lista.`, 'check_circle');
      onAuthSuccess(session);
    } catch (err: any) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Por favor ingresa correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const session = await loginWithEmail(email, password);
      if (session.organization?.subscriptionStatus === 'pendiente_pago') {
        // Enforce mandatory payment: block dashboard access and open payment modal
        setRegisteredPaidOrg({
          nombreNegocio: session.organization.nombre_negocio,
          email: session.organization.ownerEmail || email.trim(),
          plan: (session.organization.plan_suscripcion as any) === 'premium' ? 'premium' : 'pro'
        });
        setIsDirectPaymentOpen(true);
        onShowToast('Tu cuenta aún está Pendiente de Activación por el Super Admin.', 'payments');
        return;
      }

      onShowToast(`¡Bienvenido de nuevo a ${session.organization.nombre_negocio}!`, 'storefront');
      onAuthSuccess(session);
    } catch (err: any) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const defaultOrgName = nombreNegocio.trim() ? nombreNegocio.trim() : undefined;
      const session = await loginWithGoogleMultiTenant(defaultOrgName);
      if (session.organization?.subscriptionStatus === 'pendiente_pago') {
        setRegisteredPaidOrg({
          nombreNegocio: session.organization.nombre_negocio,
          email: session.organization.ownerEmail || session.user.email || '',
          plan: (session.organization.plan_suscripcion as any) === 'premium' ? 'premium' : 'pro'
        });
        setIsDirectPaymentOpen(true);
        onShowToast('Tu cuenta está Pendiente de Activación por el Super Admin.', 'payments');
        return;
      }

      onShowToast(`¡Bienvenido a ${session.organization.nombre_negocio}!`, 'check_circle');
      onAuthSuccess(session);
    } catch (err: any) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Return to Landing Page */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-2 text-left">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#554336] hover:text-[#8d4b00] transition-colors cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-[#E8E2D8] shadow-2xs"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Volver a la página principal</span>
        </button>
      </div>

      {/* SaaS Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffdcc3] text-[#8d4b00] shadow-sm mb-3 cursor-pointer"
          onClick={() => onNavigate('/')}
          title="Ir a inicio"
        >
          <span className="material-symbols-outlined text-[32px]">edit_note</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111c2d] tracking-tight">
            Cuaderno Digital
          </h2>
          <span className="px-2.5 py-0.5 rounded-full bg-[#ffdcc3] text-[#8d4b00] text-xs font-black tracking-wide">
            Bodega Digital
          </span>
        </div>
        <p className="mt-1 text-xs sm:text-sm text-[#554336]">
          {mode === 'register'
            ? 'Crea la cuenta de tu bodega o negocio y comienza al instante'
            : 'Accede al panel contable y mostrador de tu bodega'}
        </p>
      </div>

      {/* Main Auth Card Container */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-5 sm:px-10 shadow-md rounded-2xl border border-[#E8E2D8]">
          
          {registeredPaidOrg ? (
            <div className="space-y-4 text-center animate-in fade-in py-2">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-sm">
                <span className="material-symbols-outlined text-[36px] animate-pulse">schedule</span>
              </div>
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 mb-2">
                  Plan {registeredPaidOrg.plan.toUpperCase()} • Activación Requerida
                </span>
                <h3 className="text-xl font-black text-[#111c2d]">
                  ¡Bodega Registrada con Éxito!
                </h3>
                <p className="text-xs text-[#554336] mt-1 leading-relaxed">
                  Tu comercio <strong>"{registeredPaidOrg.nombreNegocio}"</strong> está guardado en el sistema con estado <strong>Pendiente de Pago</strong>.
                </p>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 text-left space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-[17px] text-amber-700">verified_user</span>
                  <span>Verificación por el Super Admin</span>
                </div>
                <p className="text-[11px] text-[#554336] leading-relaxed">
                  Por políticas de seguridad, el acceso al panel contable para planes Pro y Premium requiere confirmar tu pago vía Pago Móvil, Binance Pay o Zinli.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDirectPaymentOpen(true)}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">payments</span>
                Ver Datos de Pago y Reportar por WhatsApp
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegisteredPaidOrg(null);
                  switchMode('login');
                }}
                className="text-xs font-bold text-[#8d4b00] hover:underline cursor-pointer block mx-auto pt-2"
              >
                ← Volver a Iniciar Sesión con otra cuenta
              </button>
            </div>
          ) : (
            <>
              {/* Mode Switcher Tabs */}
              <div className="flex rounded-xl bg-[#f0f3ff] p-1 mb-6 border border-[#dbc2b0]/30">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-[#8d4b00] shadow-xs'
                      : 'text-[#554336] hover:text-[#111c2d]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'register'
                      ? 'bg-[#8d4b00] text-white shadow-xs'
                      : 'text-[#554336] hover:text-[#111c2d]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">storefront</span>
                  Registrar Bodega
                </button>
              </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#ba1a1a] text-xs font-semibold flex items-start gap-2 animate-in fade-in">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* FORM: REGISTER NUEVO NEGOCIO */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
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
                    value={nombreNegocio}
                    onChange={(e) => setNombreNegocio(e.target.value)}
                    placeholder="Ej. Bodega La Milagrosa, Víveres Los Andes"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
                <p className="text-[10px] text-[#554336] mt-0.5">
                  Configuración rápida y privada para tu comercio.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Nombre del Dueño o Administrador <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">person</span>
                  </span>
                  <input
                    type="text"
                    required
                    value={nombreUsuario}
                    onChange={(e) => setNombreUsuario(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1">
                  Correo Electrónico <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="bodega@ejemplo.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Contraseña <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                      <span className="material-symbols-outlined text-[18px]">lock</span>
                    </span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Confirmar Contraseña <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                      <span className="material-symbols-outlined text-[18px]">verified_user</span>
                    </span>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Plan de Suscripción Selector */}
              <div>
                <label className="block text-xs font-bold text-[#111c2d] mb-1.5">
                  Plan de Suscripción Inicial
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlanSuscripcion('gratuito')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      planSuscripcion === 'gratuito'
                        ? 'border-[#8d4b00] bg-[#ffdcc3]/30 text-[#8d4b00]'
                        : 'border-[#E8E2D8] bg-[#FAF8F5] text-[#554336] hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold text-[11px] leading-tight">Plan Gratuito</div>
                    <div className="text-[10px] text-[#006c4a] font-bold">$0 / mes</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanSuscripcion('pro')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      planSuscripcion === 'pro'
                        ? 'border-[#8d4b00] bg-[#ffdcc3]/30 text-[#8d4b00]'
                        : 'border-[#E8E2D8] bg-[#FAF8F5] text-[#554336] hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold text-[11px] leading-tight">Plan Pro</div>
                    <div className="text-[10px] text-[#8d4b00] font-bold">$9.99 / mes</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanSuscripcion('premium')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      planSuscripcion === 'premium'
                        ? 'border-[#8d4b00] bg-[#ffdcc3]/30 text-[#8d4b00]'
                        : 'border-[#E8E2D8] bg-[#FAF8F5] text-[#554336] hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold text-[11px] leading-tight">Plan Premium</div>
                    <div className="text-[10px] text-[#8d4b00] font-bold">$19.99 / mes</div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                    Registrando negocio...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    Registrar Bodega y Comenzar
                  </>
                )}
              </button>
            </form>
          )}

          {/* FORM: LOGIN */}
          {mode === 'login' && (
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                      <span className="material-symbols-outlined text-[18px]">mail</span>
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111c2d] mb-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#554336]">
                      <span className="material-symbols-outlined text-[18px]">lock</span>
                    </span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tu contraseña secreta"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs font-semibold text-[#111c2d] placeholder-[#8d7c71] focus:outline-none focus:border-[#8d4b00] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                      Verificando credenciales...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">login</span>
                      Entrar al Sistema
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Social Divider */}
          <div className="mt-5 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E8E2D8]" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-white px-3 text-[#554336] font-bold">O también</span>
            </div>
          </div>

          {/* Google Auth Button */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border border-[#dbc2b0]/50 bg-white hover:bg-[#FAF8F5] text-[#111c2d] text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>
          </div>

          {/* Toggle Footnote */}
          <div className="mt-5 text-center text-xs text-[#554336]">
            {mode === 'login' ? (
              <p>
                ¿Aún no tienes una cuenta registrada?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-[#8d4b00] hover:underline cursor-pointer"
                >
                  Registra tu negocio gratis
                </button>
              </p>
            ) : (
              <p>
                ¿Ya registraste tu negocio?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-[#8d4b00] hover:underline cursor-pointer"
                >
                  Inicia sesión aquí
                </button>
              </p>
            )}
          </div>
          </>
          )}
        </div>

        {/* Feature Badges */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-[#554336]">
          <div className="p-2 rounded-xl bg-white border border-[#E8E2D8]">
            <span className="material-symbols-outlined text-[16px] text-[#006c4a] block mb-0.5">
              shield
            </span>
            <span className="font-bold">Máxima Seguridad</span>
            <div className="text-[9px] opacity-75">Tus datos protegidos</div>
          </div>
          <div className="p-2 rounded-xl bg-white border border-[#E8E2D8]">
            <span className="material-symbols-outlined text-[16px] text-[#8d4b00] block mb-0.5">
              storefront
            </span>
            <span className="font-bold">Tu Inventario</span>
            <div className="text-[9px] opacity-75">Listo para comenzar</div>
          </div>
          <div className="p-2 rounded-xl bg-white border border-[#E8E2D8]">
            <span className="material-symbols-outlined text-[16px] text-[#006c4a] block mb-0.5">
              currency_exchange
            </span>
            <span className="font-bold">Multi-Moneda</span>
            <div className="text-[9px] opacity-75">USD y Bs (BCV)</div>
          </div>
        </div>
      </div>

      {/* Direct Payment Modal */}
      <DirectPaymentModal
        isOpen={isDirectPaymentOpen}
        onClose={() => setIsDirectPaymentOpen(false)}
        bcvRate={bcvRate}
        initialPlan={registeredPaidOrg?.plan || (planSuscripcion === 'premium' ? 'premium' : 'pro')}
        defaultStoreName={registeredPaidOrg?.nombreNegocio || nombreNegocio}
        defaultEmail={registeredPaidOrg?.email || email}
        onPaymentReported={() => {
          onShowToast('¡Reporte enviado! El Super Admin activará tu cuenta tras confirmar los fondos.', 'chat');
        }}
      />
    </div>
  );
};
