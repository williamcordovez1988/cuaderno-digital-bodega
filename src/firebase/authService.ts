import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  limit
} from 'firebase/firestore';
import { auth, db, googleProvider } from './config';
import { Organization, UserProfile, BodegaSettings } from './types';
import { syncOrganizationToMasterRegistry } from './firestoreService';

export interface AuthSession {
  user: User | any;
  profile: UserProfile;
  organization: Organization;
}

export const DEFAULT_CREDENTIALS = {
  email: 'williamcordovezcn@gmail.com',
  password: 'wc12345678',
  businessName: 'Bodega William',
  userName: 'William Cordovez',
  plan: 'pro' as const,
  userId: 'user-william-cordovez',
  orgId: 'org-william-cordovez',
  phone: '04141234567'
};

const SESSION_STORAGE_KEY = 'bodega_active_session';

export function saveActiveStoredSession(session: AuthSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Could not save session to localStorage:', e);
  }
}

export function getActiveStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearActiveStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.warn('Could not clear active session from localStorage:', e);
  }
}

/**
 * Creates or retrieves the configured session for William Cordovez
 */
export async function getOrCreateWilliamSession(): Promise<AuthSession> {
  const orgId = DEFAULT_CREDENTIALS.orgId;
  const userId = DEFAULT_CREDENTIALS.userId;

  const organization: Organization = {
    id: orgId,
    nombre_negocio: DEFAULT_CREDENTIALS.businessName,
    plan_suscripcion: DEFAULT_CREDENTIALS.plan,
    fecha_registro: new Date().toISOString(),
    telefono: DEFAULT_CREDENTIALS.phone,
    ownerEmail: DEFAULT_CREDENTIALS.email,
    ownerName: DEFAULT_CREDENTIALS.userName,
    subscriptionStatus: 'active',
    subscriptionExpiryDate: '2029-12-31'
  };

  syncOrganizationToMasterRegistry(organization);

  const profile: UserProfile = {
    id: userId,
    user_id: userId,
    organization_id: orgId,
    rol: 'dueno',
    nombre: DEFAULT_CREDENTIALS.userName,
    email: DEFAULT_CREDENTIALS.email,
    fecha_creacion: new Date().toISOString()
  };

  const initialSettings: BodegaSettings = {
    organization_id: orgId,
    bcvExchangeRate: 877.90,
    bodegaName: DEFAULT_CREDENTIALS.businessName,
    cashierName: DEFAULT_CREDENTIALS.userName,
    lastUpdated: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
    lastExchangeRateUpdate: 'Inicial (877.90 Bs/USD)',
    pagoMovilPhone: DEFAULT_CREDENTIALS.phone,
    pagoMovilBank: '0102 - Banco de Venezuela',
    pagoMovilCI: 'V-12345678',
    ownerPhone: DEFAULT_CREDENTIALS.phone
  };

  // Best-effort Firestore synchronization
  try {
    await setDoc(doc(db, 'organizations', orgId), organization, { merge: true });
    await setDoc(doc(db, 'profiles', userId), profile, { merge: true });
    await setDoc(doc(db, 'settings', orgId), initialSettings, { merge: true });
  } catch (e) {
    console.warn('Could not persist William session to Firestore (using local storage fallback):', e);
  }

  const user = {
    uid: userId,
    email: DEFAULT_CREDENTIALS.email,
    displayName: DEFAULT_CREDENTIALS.userName,
    photoURL: null,
    emailVerified: true
  };

  const session: AuthSession = { user, profile, organization };
  saveActiveStoredSession(session);
  return session;
}

/**
 * Verifies if an email is already present in Firestore (users, profiles, or organizations)
 */
export async function checkIfEmailExistsInFirestore(email: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;

  // William Cordovez is always registered
  if (cleanEmail === DEFAULT_CREDENTIALS.email.toLowerCase()) {
    return true;
  }

  try {
    // 1. Check 'users' collection
    const usersQuery = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
    const usersSnap = await getDocs(usersQuery);
    if (!usersSnap.empty) return true;

    // 2. Check 'profiles' collection
    const profilesQuery = query(collection(db, 'profiles'), where('email', '==', cleanEmail), limit(1));
    const profilesSnap = await getDocs(profilesQuery);
    if (!profilesSnap.empty) return true;

    // 3. Check 'organizations' collection (ownerEmail)
    const orgsQuery = query(collection(db, 'organizations'), where('ownerEmail', '==', cleanEmail), limit(1));
    const orgsSnap = await getDocs(orgsQuery);
    if (!orgsSnap.empty) return true;

    return false;
  } catch (e) {
    console.warn('Error checking email existence in Firestore:', e);
    return false;
  }
}

/**
 * Send password reset email using Firebase Auth
 */
export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    const err: any = new Error('Por favor ingresa un correo electrónico.');
    err.code = 'auth/missing-email';
    throw err;
  }

  try {
    await sendPasswordResetEmail(auth, cleanEmail);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      const customErr: any = new Error('No existe ninguna cuenta registrada con este correo.');
      customErr.code = 'auth/user-not-found';
      throw customErr;
    }
    if (err?.code === 'auth/invalid-email') {
      const customErr: any = new Error('El correo ingresado no es válido.');
      customErr.code = 'auth/invalid-email';
      throw customErr;
    }
    throw err;
  }
}

/**
 * Register a new business with a blank slate (0 products, 0 customers, $0.00 sales)
 * Strictly verifies duplicate emails and completes Firestore writes to organizations and users.
 */
export async function registerBusiness({
  nombreNegocio,
  nombreUsuario,
  email,
  password,
  planSuscripcion = 'gratuito'
}: {
  nombreNegocio: string;
  nombreUsuario: string;
  email: string;
  password: string;
  planSuscripcion?: string;
}): Promise<AuthSession> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. If registering with William Cordovez credentials
  if (cleanEmail === DEFAULT_CREDENTIALS.email.toLowerCase()) {
    const err: any = new Error('⚠️ Este correo ya se encuentra registrado. Por favor inicia sesión o recupera tu contraseña.');
    err.code = 'auth/email-already-in-use';
    throw err;
  }

  // 2. Pre-check in Firestore to block duplicate registrations before touching Auth
  const alreadyInFirestore = await checkIfEmailExistsInFirestore(cleanEmail);
  if (alreadyInFirestore) {
    const err: any = new Error('⚠️ Este correo ya se encuentra registrado. Por favor inicia sesión o recupera tu contraseña.');
    err.code = 'auth/email-already-in-use';
    throw err;
  }

  // 3. Create auth user in Firebase
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      const customErr: any = new Error('⚠️ Este correo ya se encuentra registrado. Por favor inicia sesión o recupera tu contraseña.');
      customErr.code = 'auth/email-already-in-use';
      throw customErr;
    }
    if (err?.code === 'auth/operation-not-allowed') {
      const customErr: any = new Error('⚠️ El método de Correo/Contraseña no está habilitado en Firebase Authentication (auth/operation-not-allowed). Habilítalo en Firebase Console.');
      customErr.code = 'auth/operation-not-allowed';
      throw customErr;
    }
    throw err;
  }

  const user = userCredential.user;

  // Set user display name
  if (nombreUsuario.trim()) {
    try {
      await updateProfile(user, { displayName: nombreUsuario.trim() });
    } catch (e) {
      console.warn('Could not update displayName:', e);
    }
  }

  // 4. Generate unique organization ID
  const orgId = `org-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const isPaidPlan = planSuscripcion === 'pro' || planSuscripcion === 'premium';
  const subStatus: 'active' | 'pendiente_pago' = isPaidPlan ? 'pendiente_pago' : 'active';
  const planDisplay = planSuscripcion === 'premium' ? 'Premium' : planSuscripcion === 'pro' ? 'Pro' : 'Gratis';
  const paymentNotes = isPaidPlan
    ? `Pendiente de Pago (${planSuscripcion.toUpperCase()}) por confirmar recepción vía Pago Móvil / Binance / Zinli`
    : 'Plan Gratuito Permanente';

  const nowIso = new Date().toISOString();
  const expiryIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const expiryDateStr = expiryIso.split('T')[0];

  const organization: Organization = {
    id: orgId,
    nombre_negocio: nombreNegocio.trim(),
    plan_suscripcion: planSuscripcion,
    plan: planDisplay,
    status: subStatus,
    subscriptionStatus: subStatus,
    fecha_registro: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerEmail: cleanEmail,
    ownerName: nombreUsuario.trim(),
    ownerId: user.uid,
    telefono: '',
    planExpiresAt: expiryIso,
    subscriptionExpiryDate: expiryDateStr,
    paymentNotes,
    ai_scans_used: 0,
    productsCount: 0
  };

  // 5. Create user profile linked to the new organization with role 'dueno'
  const profile: UserProfile = {
    id: user.uid,
    user_id: user.uid,
    organization_id: orgId,
    rol: 'dueno',
    nombre: nombreUsuario.trim(),
    email: cleanEmail,
    fecha_creacion: nowIso
  };

  const userDocData = {
    uid: user.uid,
    id: user.uid,
    email: cleanEmail,
    displayName: nombreUsuario.trim(),
    nombre: nombreUsuario.trim(),
    organization_id: orgId,
    organizationId: orgId,
    rol: 'dueno',
    role: 'dueno',
    plan: planDisplay,
    plan_suscripcion: planSuscripcion,
    status: subStatus,
    subscriptionStatus: subStatus,
    planExpiresAt: expiryIso,
    subscriptionExpiryDate: expiryDateStr,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // 6. Create clean initial settings for the organization (blank canvas)
  const initialSettings: BodegaSettings = {
    organization_id: orgId,
    bcvExchangeRate: 877.90,
    bodegaName: nombreNegocio.trim(),
    cashierName: nombreUsuario.trim() || 'Caja Principal',
    lastUpdated: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
    lastExchangeRateUpdate: 'Inicial (877.90 Bs/USD)',
    pagoMovilPhone: '',
    pagoMovilBank: '',
    pagoMovilCI: ''
  };

  // 7. Persist directly and obligatorily to Firestore collections
  await Promise.all([
    setDoc(doc(db, 'organizations', orgId), organization, { merge: true }),
    setDoc(doc(db, 'profiles', user.uid), profile, { merge: true }),
    setDoc(doc(db, 'users', user.uid), userDocData, { merge: true }),
    setDoc(doc(db, 'settings', orgId), initialSettings, { merge: true })
  ]);

  // Sync to master registry
  await syncOrganizationToMasterRegistry(organization);

  const session: AuthSession = { user, profile, organization };
  saveActiveStoredSession(session);
  return session;
}

/**
 * Sign in existing user with email and password, retrieving their tenant profile
 */
export async function loginWithEmail(email: string, password: string): Promise<AuthSession> {
  const cleanEmail = email.trim().toLowerCase();

  // Fast check: Configured credentials for William Cordovez
  if (cleanEmail === DEFAULT_CREDENTIALS.email.toLowerCase()) {
    if (password === DEFAULT_CREDENTIALS.password) {
      return await getOrCreateWilliamSession();
    } else {
      const err: any = new Error('Contraseña incorrecta para williamcordovezcn@gmail.com.');
      err.code = 'auth/wrong-password';
      throw err;
    }
  }

  // Fast check: Collaborator credentials created by the owner
  try {
    const rawCollabs = localStorage.getItem('bodega_all_collaborators_auth');
    if (rawCollabs) {
      const collabs = JSON.parse(rawCollabs) as UserProfile[];
      const found = collabs.find((c) => c.email?.toLowerCase() === cleanEmail);
      if (found) {
        if (found.password && found.password !== password) {
          const err: any = new Error('Contraseña incorrecta para el colaborador.');
          err.code = 'auth/wrong-password';
          throw err;
        }
        // Fetch organization details for the collaborator
        const orgSession = await fetchUserProfileAndOrg(found.id);
        const orgSnap = await getDoc(doc(db, 'organizations', found.organization_id));
        const orgData = orgSnap.exists() ? (orgSnap.data() as Organization) : null;

        const organization: Organization = orgData || orgSession?.organization || {
          id: found.organization_id,
          nombre_negocio: 'Bodega Principal',
          plan_suscripcion: 'pro',
          fecha_registro: new Date().toISOString()
        };

        const user = {
          uid: found.id,
          email: found.email,
          displayName: found.nombre,
          photoURL: null
        };

        const session: AuthSession = { user, profile: found, organization };
        saveActiveStoredSession(session);
        return session;
      }
    }
  } catch (e: any) {
    if (e?.code === 'auth/wrong-password') throw e;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    const session = await fetchUserProfileAndOrg(user.uid);
    let fullSession: AuthSession;
    if (!session) {
      // If user exists in Auth but not in Firestore profiles, provision default organization
      fullSession = await createProfileForExistingUser(user);
    } else {
      fullSession = { user, profile: session.profile, organization: session.organization };
    }

    saveActiveStoredSession(fullSession);
    return fullSession;
  } catch (error: any) {
    if (cleanEmail === DEFAULT_CREDENTIALS.email.toLowerCase() && password === DEFAULT_CREDENTIALS.password) {
      return await getOrCreateWilliamSession();
    }
    throw error;
  }
}

/**
 * Sign in with Google with multi-tenant profile resolution
 */
export async function loginWithGoogleMultiTenant(businessName?: string): Promise<AuthSession> {
  const userCredential = await signInWithPopup(auth, googleProvider);
  const user = userCredential.user;

  const session = await fetchUserProfileAndOrg(user.uid);
  if (session) {
    const fullSession = { user, profile: session.profile, organization: session.organization };
    saveActiveStoredSession(fullSession);
    return fullSession;
  }

  // If first time with Google, provision new tenant organization
  const newSession = await createProfileForExistingUser(user, businessName);
  saveActiveStoredSession(newSession);
  return newSession;
}

/**
 * Retrieve user profile and organization from Firestore
 */
export async function fetchUserProfileAndOrg(
  userId: string
): Promise<{ profile: UserProfile; organization: Organization } | null> {
  try {
    let profile: UserProfile | null = null;
    const profileSnap = await getDoc(doc(db, 'profiles', userId));
    if (profileSnap.exists()) {
      profile = profileSnap.data() as UserProfile;
    } else {
      // Fallback to 'users' collection
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        profile = {
          id: userId,
          user_id: userId,
          organization_id: uData.organization_id || uData.organizationId || '',
          rol: uData.rol || uData.role || 'dueno',
          nombre: uData.nombre || uData.displayName || '',
          email: uData.email || '',
          fecha_creacion: uData.createdAt || uData.fecha_creacion || new Date().toISOString()
        };
      }
    }

    if (!profile || !profile.organization_id) {
      return null;
    }

    const orgSnap = await getDoc(doc(db, 'organizations', profile.organization_id));

    let organization: Organization;
    if (orgSnap.exists()) {
      organization = orgSnap.data() as Organization;
    } else {
      organization = {
        id: profile.organization_id,
        nombre_negocio: 'Mi Bodega',
        plan_suscripcion: 'gratuito',
        plan: 'Gratis',
        status: 'active',
        subscriptionStatus: 'active',
        fecha_registro: new Date().toISOString()
      };
    }

    return { profile, organization };
  } catch (error) {
    console.error('Error fetching profile and organization:', error);
    return null;
  }
}

/**
 * Automatically provision a new organization and profile for a user who doesn't have one
 */
export async function createProfileForExistingUser(
  user: User | any,
  businessName?: string
): Promise<AuthSession> {
  const orgId = `org-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const bName = businessName?.trim() || `Bodega de ${user.displayName || 'Mi Negocio'}`;
  const nowIso = new Date().toISOString();
  const expiryIso = new Date(Date.now() + 30 * 86400000).toISOString();
  const expiryDateStr = expiryIso.split('T')[0];

  const organization: Organization = {
    id: orgId,
    nombre_negocio: bName,
    plan_suscripcion: 'gratuito',
    plan: 'Gratis',
    status: 'active',
    subscriptionStatus: 'active',
    fecha_registro: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerEmail: user.email || '',
    ownerName: user.displayName || 'Bodeguero',
    ownerId: user.uid,
    planExpiresAt: expiryIso,
    subscriptionExpiryDate: expiryDateStr
  };

  syncOrganizationToMasterRegistry(organization);

  const profile: UserProfile = {
    id: user.uid,
    user_id: user.uid,
    organization_id: orgId,
    rol: 'dueno',
    nombre: user.displayName || 'Bodeguero',
    email: user.email || '',
    fecha_creacion: nowIso
  };

  const userDocData = {
    uid: user.uid,
    id: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'Bodeguero',
    nombre: user.displayName || 'Bodeguero',
    organization_id: orgId,
    organizationId: orgId,
    rol: 'dueno',
    role: 'dueno',
    plan: 'Gratis',
    plan_suscripcion: 'gratuito',
    status: 'active',
    subscriptionStatus: 'active',
    planExpiresAt: expiryIso,
    subscriptionExpiryDate: expiryDateStr,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const initialSettings: BodegaSettings = {
    organization_id: orgId,
    bcvExchangeRate: 877.90,
    bodegaName: bName,
    cashierName: user.displayName || 'Caja Principal',
    lastUpdated: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }),
    lastExchangeRateUpdate: 'Inicial (877.90 Bs/USD)',
    pagoMovilPhone: '',
    pagoMovilBank: '',
    pagoMovilCI: ''
  };

  try {
    await setDoc(doc(db, 'organizations', orgId), organization, { merge: true });
    await setDoc(doc(db, 'profiles', user.uid), profile, { merge: true });
    await setDoc(doc(db, 'users', user.uid), userDocData, { merge: true });
    await setDoc(doc(db, 'settings', orgId), initialSettings, { merge: true });
  } catch (e) {
    console.warn('Could not write new profile to Firestore:', e);
  }

  const session = { user, profile, organization };
  saveActiveStoredSession(session);
  return session;
}

/**
 * Sign out user and clean up active session
 */
export async function logout(): Promise<void> {
  clearActiveStoredSession();
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Error during signOut:', e);
  }
}
