import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './config';
import { Organization, UserProfile, BodegaSettings } from './types';

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
    telefono: DEFAULT_CREDENTIALS.phone
  };

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
 * Register a new business with a blank slate (0 products, 0 customers, $0.00 sales)
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

  // If registering as William Cordovez
  if (cleanEmail === DEFAULT_CREDENTIALS.email.toLowerCase()) {
    return await getOrCreateWilliamSession();
  }

  try {
    // 1. Create auth user in Firebase
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    // Set user display name
    if (nombreUsuario.trim()) {
      try {
        await updateProfile(user, { displayName: nombreUsuario.trim() });
      } catch (e) {
        console.warn('Could not update displayName:', e);
      }
    }

    // 2. Generate unique organization ID
    const orgId = `org-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const organization: Organization = {
      id: orgId,
      nombre_negocio: nombreNegocio.trim(),
      plan_suscripcion: planSuscripcion,
      fecha_registro: new Date().toISOString()
    };

    // 3. Create user profile linked to the new organization with role 'dueno'
    const profile: UserProfile = {
      id: user.uid,
      user_id: user.uid,
      organization_id: orgId,
      rol: 'dueno',
      nombre: nombreUsuario.trim(),
      email: user.email || email.trim(),
      fecha_creacion: new Date().toISOString()
    };

    // 4. Create clean initial settings for the organization (blank canvas)
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

    // 5. Persist to Firestore
    await setDoc(doc(db, 'organizations', orgId), organization);
    await setDoc(doc(db, 'profiles', user.uid), profile);
    await setDoc(doc(db, 'settings', orgId), initialSettings);

    const session: AuthSession = { user, profile, organization };
    saveActiveStoredSession(session);
    return session;
  } catch (err: any) {
    // If Firebase Auth provider email/pass is not enabled in Firebase Console, fallback gracefully
    if (err?.code === 'auth/operation-not-allowed') {
      const orgId = `org-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const userId = `user-${Date.now()}`;
      const organization: Organization = {
        id: orgId,
        nombre_negocio: nombreNegocio.trim(),
        plan_suscripcion: planSuscripcion,
        fecha_registro: new Date().toISOString()
      };
      const profile: UserProfile = {
        id: userId,
        user_id: userId,
        organization_id: orgId,
        rol: 'dueno',
        nombre: nombreUsuario.trim(),
        email: email.trim(),
        fecha_creacion: new Date().toISOString()
      };
      const user = {
        uid: userId,
        email: email.trim(),
        displayName: nombreUsuario.trim()
      };
      const session: AuthSession = { user, profile, organization };
      saveActiveStoredSession(session);
      return session;
    }
    throw err;
  }
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
    const profileSnap = await getDoc(doc(db, 'profiles', userId));
    if (!profileSnap.exists()) {
      return null;
    }

    const profile = profileSnap.data() as UserProfile;
    const orgSnap = await getDoc(doc(db, 'organizations', profile.organization_id));

    let organization: Organization;
    if (orgSnap.exists()) {
      organization = orgSnap.data() as Organization;
    } else {
      organization = {
        id: profile.organization_id,
        nombre_negocio: 'Mi Bodega',
        plan_suscripcion: 'gratuito',
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

  const organization: Organization = {
    id: orgId,
    nombre_negocio: bName,
    plan_suscripcion: 'gratuito',
    fecha_registro: new Date().toISOString()
  };

  const profile: UserProfile = {
    id: user.uid,
    user_id: user.uid,
    organization_id: orgId,
    rol: 'dueno',
    nombre: user.displayName || 'Bodeguero',
    email: user.email || '',
    fecha_creacion: new Date().toISOString()
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
    await setDoc(doc(db, 'organizations', orgId), organization);
    await setDoc(doc(db, 'profiles', user.uid), profile);
    await setDoc(doc(db, 'settings', orgId), initialSettings);
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
