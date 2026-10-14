import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './errors';
import { Product, Customer, Sale, LedgerEntry, BodegaSettings, UserProfile, isTrialPlan, Organization, OrganizationAdminRecord } from './types';

const PRODUCTS_COLLECTION = 'products';
const CUSTOMERS_COLLECTION = 'customers';
const SALES_COLLECTION = 'sales';
const LEDGER_COLLECTION = 'ledger_entries';
const PROFILES_COLLECTION = 'profiles';
const ORGANIZATIONS_COLLECTION = 'organizations';

// Global tenant tracker
let activeOrganizationId: string | null = null;

// Clean legacy test caches from previous non-multitenant runs
try {
  const LEGACY_KEYS = [
    'bodega_products_cache',
    'bodega_customers_cache',
    'bodega_sales_cache',
    'bodega_ledger_cache',
    'bodega_settings_cache'
  ];
  for (const k of LEGACY_KEYS) {
    localStorage.removeItem(k);
  }
} catch {
  // localStorage not available or sandboxed
}

export function setActiveOrganizationId(orgId: string | null): void {
  activeOrganizationId = orgId;
}

export function getActiveOrganizationId(): string | null {
  return activeOrganizationId;
}

function getTenantStorageKeys(orgId?: string | null) {
  const id = orgId || activeOrganizationId || 'default';
  return {
    PRODUCTS: `bodega_${id}_products`,
    CUSTOMERS: `bodega_${id}_customers`,
    SALES: `bodega_${id}_sales`,
    LEDGER: `bodega_${id}_ledger`,
    SETTINGS: `bodega_${id}_settings`,
    COLLABORATORS: `bodega_${id}_collaborators`
  };
}

function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage error', e);
  }
}

// Clean default settings for a newly created organization (Tasa Base Inicial: 877.90 Bs / USD)
export const DEFAULT_BLANK_SETTINGS: BodegaSettings = {
  bcvExchangeRate: 877.90,
  bodegaName: 'Mi Negocio',
  cashierName: 'Caja Principal',
  lastUpdated: 'Reciente',
  lastExchangeRateUpdate: 'Inicial (877.90 Bs/USD)',
  pagoMovilPhone: '',
  pagoMovilBank: '',
  pagoMovilCI: '',
  ownerPhone: '',
  logoUrl: ''
};

/**
 * Lienzo en Blanco: Auto-seeding of mock items is permanently disabled.
 * Every newly created business starts strictly at zero (0 products, 0 customers, $0.00 sales).
 */
export async function seedInitialDataIfEmpty(): Promise<void> {
  // Intentionally blank: each business begins with 0 records
  return;
}

// In-memory reactive subscriber sets for instant UI updates
const productSubscribers = new Set<(prods: Product[]) => void>();
const customerSubscribers = new Set<(custs: Customer[]) => void>();
const saleSubscribers = new Set<(sales: Sale[]) => void>();
const ledgerSubscribers = new Set<(ledger: LedgerEntry[]) => void>();
const settingsSubscribers = new Set<(sett: BodegaSettings) => void>();

export function notifyProductSubscribers(prods?: Product[], orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = prods || getLocal<Product[]>(keys.PRODUCTS, []);
  productSubscribers.forEach((cb) => cb(data));
}

export function notifyCustomerSubscribers(custs?: Customer[], orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = custs || getLocal<Customer[]>(keys.CUSTOMERS, []);
  customerSubscribers.forEach((cb) => cb(data));
}

export function notifySaleSubscribers(sales?: Sale[], orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = sales || getLocal<Sale[]>(keys.SALES, []);
  saleSubscribers.forEach((cb) => cb(data));
}

export function notifyLedgerSubscribers(ledger?: LedgerEntry[], orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = ledger || getLocal<LedgerEntry[]>(keys.LEDGER, []);
  ledgerSubscribers.forEach((cb) => cb(data));
}

export function notifySettingsSubscribers(sett?: BodegaSettings, orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = sett || getLocal<BodegaSettings>(keys.SETTINGS, DEFAULT_BLANK_SETTINGS);
  settingsSubscribers.forEach((cb) => cb(data));
}

// Helper text normalization
function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Deduplicate customer list by normalized name/alias, merging debts into a single record
export function deduplicateCustomerList(list: Customer[]): Customer[] {
  const map = new Map<string, Customer>();

  for (const c of list) {
    const key = normalizeText(c.name);
    if (!map.has(key)) {
      map.set(key, { ...c });
    } else {
      const existing = map.get(key)!;
      existing.currentDebtUSD = Number((existing.currentDebtUSD + c.currentDebtUSD).toFixed(2));
      if (!existing.phone && c.phone) existing.phone = c.phone;
      if (!existing.address && c.address) existing.address = c.address;
      if (c.lastPurchaseDate && (c.lastPurchaseDate.includes('Hoy') || !existing.lastPurchaseDate)) {
        existing.lastPurchaseDate = c.lastPurchaseDate;
      }
      if (existing.currentDebtUSD > existing.creditLimitUSD) {
        existing.status = 'aviso';
      }
    }
  }

  return Array.from(map.values());
}

// Find existing customer by name or alias to avoid duplicate entries
export function findCustomerByNameOrAlias(name: string, list: Customer[]): Customer | undefined {
  const norm = normalizeText(name);
  if (!norm || norm === 'consumidor final' || norm === 'cliente fiado') return undefined;

  let found = list.find((c) => {
    return normalizeText(c.name) === norm || (c.alias && normalizeText(c.alias) === norm);
  });
  if (found) return found;

  found = list.find((c) => {
    const cNorm = normalizeText(c.name);
    const aNorm = c.alias ? normalizeText(c.alias) : '';
    if (cNorm.length >= 3 && norm.length >= 3) {
      if (cNorm.includes(norm) || norm.includes(cNorm)) return true;
    }
    if (aNorm.length >= 3 && norm.length >= 3) {
      if (aNorm.includes(norm) || norm.includes(aNorm)) return true;
    }
    return false;
  });

  return found;
}

// Subscribe to Products scoped by organization
export function subscribeToProducts(
  callback: (products: Product[]) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(currentOrg);
  const cached = getLocal<Product[]>(keys.PRODUCTS, []);
  callback(cached);
  productSubscribers.add(callback);

  let unsubscribeFirestore = () => {};

  if (auth.currentUser && currentOrg) {
    try {
      const q = query(
        collection(db, PRODUCTS_COLLECTION),
        where('organization_id', '==', currentOrg)
      );
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const products: Product[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          } as Product));
          setLocal(keys.PRODUCTS, products);
          notifyProductSubscribers(products, currentOrg);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, PRODUCTS_COLLECTION);
        }
      );
    } catch (error) {
      console.warn('Products subscription failed, using local mode', error);
    }
  }

  return () => {
    productSubscribers.delete(callback);
    unsubscribeFirestore();
  };
}

// Subscribe to Customers scoped by organization
export function subscribeToCustomers(
  callback: (customers: Customer[]) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(currentOrg);
  const cached = deduplicateCustomerList(getLocal<Customer[]>(keys.CUSTOMERS, []));
  setLocal(keys.CUSTOMERS, cached);
  callback(cached);
  customerSubscribers.add(callback);

  let unsubscribeFirestore = () => {};

  if (auth.currentUser && currentOrg) {
    try {
      const q = query(
        collection(db, CUSTOMERS_COLLECTION),
        where('organization_id', '==', currentOrg)
      );
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const rawCustomers: Customer[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          } as Customer));
          const customers = deduplicateCustomerList(rawCustomers);
          setLocal(keys.CUSTOMERS, customers);
          notifyCustomerSubscribers(customers, currentOrg);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, CUSTOMERS_COLLECTION);
        }
      );
    } catch (error) {
      console.warn('Customers subscription failed, using local mode', error);
    }
  }

  return () => {
    customerSubscribers.delete(callback);
    unsubscribeFirestore();
  };
}

// Subscribe to Sales scoped by organization
export function subscribeToSales(
  callback: (sales: Sale[]) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(currentOrg);
  const cached = getLocal<Sale[]>(keys.SALES, []);
  callback(cached);
  saleSubscribers.add(callback);

  let unsubscribeFirestore = () => {};

  if (auth.currentUser && currentOrg) {
    try {
      const q = query(
        collection(db, SALES_COLLECTION),
        where('organization_id', '==', currentOrg),
        limit(50)
      );
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const sales: Sale[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          } as Sale));
          sales.sort((a, b) => (b.ticketNumber || 0) - (a.ticketNumber || 0));
          setLocal(keys.SALES, sales);
          notifySaleSubscribers(sales, currentOrg);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, SALES_COLLECTION);
        }
      );
    } catch (error) {
      console.warn('Sales subscription failed', error);
    }
  }

  return () => {
    saleSubscribers.delete(callback);
    unsubscribeFirestore();
  };
}

// Subscribe to Ledger Entries (Fiados & Abonos) scoped by organization
export function subscribeToLedger(
  callback: (entries: LedgerEntry[]) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(currentOrg);
  const cached = getLocal<LedgerEntry[]>(keys.LEDGER, []);
  callback(cached);
  ledgerSubscribers.add(callback);

  let unsubscribeFirestore = () => {};

  if (auth.currentUser && currentOrg) {
    try {
      const q = query(
        collection(db, LEDGER_COLLECTION),
        where('organization_id', '==', currentOrg),
        limit(100)
      );
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const entries: LedgerEntry[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          } as LedgerEntry));
          setLocal(keys.LEDGER, entries);
          notifyLedgerSubscribers(entries, currentOrg);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, LEDGER_COLLECTION);
        }
      );
    } catch (error) {
      console.warn('Ledger subscription failed', error);
    }
  }

  return () => {
    ledgerSubscribers.delete(callback);
    unsubscribeFirestore();
  };
}

// Subscribe to Settings scoped by organization
export function subscribeToSettings(
  callback: (settings: BodegaSettings) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(currentOrg);
  const cached = getLocal<BodegaSettings>(keys.SETTINGS, DEFAULT_BLANK_SETTINGS);
  callback(cached);
  settingsSubscribers.add(callback);

  let unsubscribeFirestore = () => {};

  if (auth.currentUser && currentOrg) {
    try {
      unsubscribeFirestore = onSnapshot(
        doc(db, 'settings', currentOrg),
        (docSnap) => {
          if (docSnap.exists()) {
            const settings = docSnap.data() as BodegaSettings;
            setLocal(keys.SETTINGS, settings);
            notifySettingsSubscribers(settings, currentOrg);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `settings/${currentOrg}`);
        }
      );
    } catch (error) {
      console.warn('Settings subscription failed', error);
    }
  }

  return () => {
    settingsSubscribers.delete(callback);
    unsubscribeFirestore();
  };
}

// Add or Update Product (Enforces Freemium Trial Limit: max 5 products for trial/prueba)
export async function saveProduct(product: Product, orgId?: string, currentPlan?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || product.organization_id || '';
  const productWithOrg: Product = {
    ...product,
    organization_id: targetOrg
  };

  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Product[]>(keys.PRODUCTS, []);
  const existingIdx = cached.findIndex((p) => p.id === productWithOrg.id);

  // If adding a new product and already reached 5 items in trial plan, prevent insertion
  if (existingIdx < 0) {
    if (isTrialPlan(currentPlan) && cached.length >= 5) {
      throw new Error('LÍMITE_PLAN_PRUEBA: Alcanzaste el límite de tu versión de prueba (5/5 productos). Actualiza al Plan Pro.');
    }
    cached.unshift(productWithOrg);
  } else {
    cached[existingIdx] = productWithOrg;
  }
  setLocal(keys.PRODUCTS, cached);
  notifyProductSubscribers(cached, targetOrg);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, PRODUCTS_COLLECTION, productWithOrg.id), productWithOrg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${PRODUCTS_COLLECTION}/${productWithOrg.id}`);
    }
  }
}

// Delete Product
export async function deleteProduct(productId: string, orgId?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Product[]>(keys.PRODUCTS, []);
  const updated = cached.filter((p) => p.id !== productId);
  setLocal(keys.PRODUCTS, updated);
  notifyProductSubscribers(updated, targetOrg);

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, PRODUCTS_COLLECTION, productId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${PRODUCTS_COLLECTION}/${productId}`);
    }
  }
}

// Apply purchase invoice arrivals to inventory
export async function applyInvoiceArrivals(
  items: Array<{
    productId?: string;
    productName: string;
    productCode?: string;
    quantity: number;
    unit?: string;
    costUSD: number;
    suggestedPriceUSD: number;
    suggestedPriceBs?: number;
    pricingType?: 'usd_anchored' | 'fixed_bs';
    category?: string;
    isNewProduct?: boolean;
  }>,
  supplierName: string,
  orgId?: string,
  currentPlan?: string
): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || '';
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Product[]>(keys.PRODUCTS, []);

  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;

    let target = cached.find((p) => p.id === item.productId);
    if (!target && item.productCode) {
      target = cached.find((p) => p.code.toLowerCase() === item.productCode?.toLowerCase());
    }
    if (!target) {
      target = cached.find((p) => p.name.toLowerCase() === item.productName.toLowerCase());
    }

    if (target) {
      target.currentStock = Number((target.currentStock + item.quantity).toFixed(2));
      if (item.costUSD > 0) target.costUSD = item.costUSD;
      if (item.suggestedPriceUSD > 0) target.priceUSD = item.suggestedPriceUSD;
      if (item.pricingType) target.pricingType = item.pricingType;
      if (item.suggestedPriceBs && item.suggestedPriceBs > 0) target.fixedPriceBs = item.suggestedPriceBs;
      if (supplierName) target.supplier = supplierName;
      target.updatedAt = new Date().toISOString();
      target.organization_id = targetOrg;

      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, PRODUCTS_COLLECTION, target.id), {
            currentStock: target.currentStock,
            costUSD: target.costUSD,
            priceUSD: target.priceUSD,
            pricingType: target.pricingType || 'usd_anchored',
            fixedPriceBs: target.fixedPriceBs || null,
            supplier: target.supplier,
            updatedAt: target.updatedAt,
            organization_id: targetOrg
          });
        } catch (e) {
          console.warn('Update product from invoice failed in Firestore', e);
        }
      }
    } else {
      // In trial plan, prevent inserting a 6th product
      if (isTrialPlan(currentPlan) && cached.length >= 5) {
        console.warn('Inserción de nuevo producto omitida por límite del Plan Prueba (5 productos)');
        continue;
      }
      const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newCode = item.productCode || item.productName.slice(0, 3).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
      const newProd: Product = {
        id: newId,
        organization_id: targetOrg,
        name: item.productName,
        code: newCode,
        category: item.category || 'Víveres Secos',
        unit: item.unit || 'paq.',
        costUSD: item.costUSD || 1.0,
        priceUSD: item.suggestedPriceUSD || (item.costUSD ? Number((item.costUSD * 1.3).toFixed(2)) : 1.3),
        pricingType: item.pricingType || 'usd_anchored',
        fixedPriceBs: item.suggestedPriceBs,
        marginPercent: 30,
        currentStock: item.quantity,
        minStock: 6,
        supplier: supplierName || 'Distribuidor',
        barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        updatedAt: new Date().toISOString()
      };
      cached.unshift(newProd);

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, PRODUCTS_COLLECTION, newId), newProd);
        } catch (e) {
          console.warn('Create product from invoice failed in Firestore', e);
        }
      }
    }
  }

  setLocal(keys.PRODUCTS, cached);
  notifyProductSubscribers(cached, targetOrg);
}

// Quick Stock Adjustment
export async function adjustProductStock(productId: string, delta: number, orgId?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Product[]>(keys.PRODUCTS, []);
  const p = cached.find((item) => item.id === productId);
  if (p) {
    p.currentStock = Math.max(0, Number((p.currentStock + delta).toFixed(2)));
    p.updatedAt = new Date().toISOString();
    setLocal(keys.PRODUCTS, cached);
    notifyProductSubscribers(cached, targetOrg);

    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), {
          currentStock: p.currentStock,
          updatedAt: p.updatedAt
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${PRODUCTS_COLLECTION}/${productId}`);
      }
    }
  }
}

// Update BCV Exchange Rate for tenant
export async function updateExchangeRate(newRate: number, orgId?: string, updateTimeStr?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<BodegaSettings>(keys.SETTINGS, DEFAULT_BLANK_SETTINGS);
  cached.bcvExchangeRate = newRate;
  cached.organization_id = targetOrg;
  const timeStr = updateTimeStr || new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  cached.lastUpdated = timeStr;
  cached.lastExchangeRateUpdate = timeStr;
  setLocal(keys.SETTINGS, cached);
  notifySettingsSubscribers(cached, targetOrg);

  if (auth.currentUser && targetOrg) {
    try {
      await setDoc(doc(db, 'settings', targetOrg), {
        ...cached,
        bcvExchangeRate: newRate,
        lastUpdated: timeStr,
        lastExchangeRateUpdate: timeStr,
        organization_id: targetOrg
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `settings/${targetOrg}`);
    }
  }
}

// Update Owner Phone for Daily Reports & WhatsApp Close
export async function updateOwnerPhone(phone: string, orgId?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<BodegaSettings>(keys.SETTINGS, DEFAULT_BLANK_SETTINGS);
  cached.ownerPhone = phone.trim();
  setLocal(keys.SETTINGS, cached);
  notifySettingsSubscribers(cached, targetOrg);

  if (auth.currentUser && targetOrg) {
    try {
      await setDoc(doc(db, 'settings', targetOrg), {
        ...cached,
        ownerPhone: phone.trim(),
        organization_id: targetOrg
      }, { merge: true });

      // Also update organization document if exists
      await updateDoc(doc(db, 'organizations', targetOrg), {
        telefono: phone.trim()
      });
    } catch (error) {
      console.warn('Update ownerPhone in settings/org failed', error);
    }
  }
}

// Update Business Profile (Name and Logo)
export async function updateBusinessProfile(
  data: {
    bodegaName: string;
    logoUrl?: string;
    telefono?: string;
    direccion?: string;
  },
  orgId?: string
): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<BodegaSettings>(keys.SETTINGS, DEFAULT_BLANK_SETTINGS);

  cached.bodegaName = data.bodegaName.trim();
  if (data.logoUrl !== undefined) {
    cached.logoUrl = data.logoUrl;
  }
  if (data.telefono !== undefined) {
    cached.ownerPhone = data.telefono.trim();
  }
  cached.organization_id = targetOrg;
  cached.lastUpdated = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

  setLocal(keys.SETTINGS, cached);
  notifySettingsSubscribers(cached, targetOrg);

  if (targetOrg) {
    try {
      await setDoc(
        doc(db, 'settings', targetOrg),
        {
          ...cached,
          bodegaName: cached.bodegaName,
          logoUrl: cached.logoUrl || '',
          lastUpdated: cached.lastUpdated,
          organization_id: targetOrg
        },
        { merge: true }
      );

      const orgUpdates: any = {
        nombre_negocio: data.bodegaName.trim()
      };
      if (data.logoUrl !== undefined) {
        orgUpdates.logoUrl = data.logoUrl;
      }
      if (data.telefono !== undefined) {
        orgUpdates.telefono = data.telefono.trim();
      }
      if (data.direccion !== undefined) {
        orgUpdates.direccion = data.direccion.trim();
      }

      await setDoc(doc(db, 'organizations', targetOrg), orgUpdates, { merge: true });
    } catch (error) {
      console.warn('Update business profile in Firestore failed:', error);
    }
  }
}

// Collaborators Management Subscriptions & Actions
const collaboratorSubscribers = new Set<(collaborators: UserProfile[]) => void>();

export function notifyCollaboratorSubscribers(collabs?: UserProfile[], orgId?: string | null) {
  const keys = getTenantStorageKeys(orgId);
  const data = collabs || getLocal<UserProfile[]>(keys.COLLABORATORS, []);
  collaboratorSubscribers.forEach((cb) => cb(data));
}

export function subscribeToCollaborators(
  callback: (collaborators: UserProfile[]) => void,
  orgId?: string | null
): () => void {
  const currentOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(currentOrg);
  const cached = getLocal<UserProfile[]>(keys.COLLABORATORS, []);
  callback(cached);
  collaboratorSubscribers.add(callback);

  let unsubFirestore = () => {};
  if (auth.currentUser && currentOrg && currentOrg !== 'default') {
    try {
      const q = query(
        collection(db, PROFILES_COLLECTION),
        where('organization_id', '==', currentOrg)
      );
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const list: UserProfile[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as UserProfile;
            list.push(data);
          });
          setLocal(keys.COLLABORATORS, list);
          notifyCollaboratorSubscribers(list, currentOrg);
        },
        (error) => {
          console.debug('Collaborators listener notice:', error);
        }
      );
    } catch (error) {
      console.debug('Firestore subscription for collaborators notice:', error);
    }
  }

  return () => {
    collaboratorSubscribers.delete(callback);
    unsubFirestore();
  };
}

export async function createCollaborator(
  data: {
    nombre: string;
    email: string;
    password?: string;
    rol?: 'administrador' | 'empleado' | 'dueño' | string;
  },
  orgId?: string
): Promise<UserProfile> {
  const targetOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(targetOrg);

  const assignedRole = data.rol === 'administrador' ? 'administrador' : 'empleado';
  const profileId = `user-emp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const newProfile: UserProfile = {
    id: profileId,
    user_id: profileId,
    organization_id: targetOrg,
    rol: assignedRole,
    nombre: data.nombre.trim(),
    email: data.email.trim().toLowerCase(),
    password: data.password || '123456',
    fecha_creacion: new Date().toISOString()
  };

  const list = getLocal<UserProfile[]>(keys.COLLABORATORS, []);
  list.unshift(newProfile);
  setLocal(keys.COLLABORATORS, list);
  notifyCollaboratorSubscribers(list, targetOrg);

  // Global auth cache for collaborators across sessions
  try {
    const globalCollabs = getLocal<UserProfile[]>('bodega_all_collaborators_auth', []);
    const filtered = globalCollabs.filter(
      (c) => c.email?.toLowerCase() !== newProfile.email?.toLowerCase()
    );
    filtered.push(newProfile);
    setLocal('bodega_all_collaborators_auth', filtered);
  } catch (e) {
    console.warn('Error saving to global collaborators auth', e);
  }

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, PROFILES_COLLECTION, profileId), newProfile);
    } catch (e) {
      console.warn('Error saving collaborator profile to Firestore:', e);
    }
  }

  return newProfile;
}

export async function updateCollaboratorRole(
  profileId: string,
  newRole: 'administrador' | 'empleado' | 'dueño' | string,
  orgId?: string
): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(targetOrg);

  const list = getLocal<UserProfile[]>(keys.COLLABORATORS, []);
  const idx = list.findIndex((p) => p.id === profileId || p.user_id === profileId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], rol: newRole };
    setLocal(keys.COLLABORATORS, list);
    notifyCollaboratorSubscribers(list, targetOrg);
  }

  // Update in global collaborators auth cache
  try {
    const globalCollabs = getLocal<UserProfile[]>('bodega_all_collaborators_auth', []);
    const gIdx = globalCollabs.findIndex((p) => p.id === profileId || p.user_id === profileId);
    if (gIdx !== -1) {
      globalCollabs[gIdx] = { ...globalCollabs[gIdx], rol: newRole };
      setLocal('bodega_all_collaborators_auth', globalCollabs);
    }
  } catch (e) {
    console.warn('Error updating role in global collaborators auth', e);
  }

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, PROFILES_COLLECTION, profileId), {
        rol: newRole
      });
    } catch (e) {
      console.warn('Error updating collaborator role in Firestore:', e);
    }
  }
}

export async function deleteCollaborator(profileId: string, orgId?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || 'default';
  const keys = getTenantStorageKeys(targetOrg);

  let list = getLocal<UserProfile[]>(keys.COLLABORATORS, []);
  list = list.filter((p) => p.id !== profileId && p.user_id !== profileId);
  setLocal(keys.COLLABORATORS, list);
  notifyCollaboratorSubscribers(list, targetOrg);

  try {
    const globalCollabs = getLocal<UserProfile[]>('bodega_all_collaborators_auth', []);
    const filtered = globalCollabs.filter((c) => c.id !== profileId && c.user_id !== profileId);
    setLocal('bodega_all_collaborators_auth', filtered);
  } catch (e) {
    console.warn('Error removing from global collaborators auth', e);
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, PROFILES_COLLECTION, profileId));
    } catch (e) {
      console.warn('Error deleting collaborator profile in Firestore:', e);
    }
  }
}


// Save Customer
export async function saveCustomer(customer: Customer, orgId?: string): Promise<void> {
  const targetOrg = orgId || activeOrganizationId || customer.organization_id || '';
  const customerWithOrg: Customer = {
    ...customer,
    organization_id: targetOrg
  };

  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Customer[]>(keys.CUSTOMERS, []);
  const idx = cached.findIndex((c) => c.id === customerWithOrg.id);
  if (idx >= 0) {
    cached[idx] = customerWithOrg;
  } else {
    cached.unshift(customerWithOrg);
  }
  setLocal(keys.CUSTOMERS, cached);
  notifyCustomerSubscribers(cached, targetOrg);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, CUSTOMERS_COLLECTION, customerWithOrg.id), customerWithOrg);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${CUSTOMERS_COLLECTION}/${customerWithOrg.id}`);
    }
  }
}

// Update Customer Profile
export async function updateCustomerProfile(
  customerId: string,
  updates: {
    name: string;
    alias?: string;
    phone: string;
    address: string;
    creditLimitUSD?: number;
  },
  orgId?: string
): Promise<Customer> {
  const targetOrg = orgId || activeOrganizationId;
  const keys = getTenantStorageKeys(targetOrg);
  const cached = getLocal<Customer[]>(keys.CUSTOMERS, []);
  const idx = cached.findIndex((c) => c.id === customerId);
  if (idx < 0) {
    throw new Error('Cliente no encontrado en la base de datos');
  }

  const existing = cached[idx];
  const updatedCustomer: Customer = {
    ...existing,
    name: updates.name.trim(),
    alias: updates.alias?.trim() || undefined,
    phone: updates.phone.trim(),
    address: updates.address.trim(),
    creditLimitUSD: updates.creditLimitUSD !== undefined ? Number(updates.creditLimitUSD) : existing.creditLimitUSD,
    id: existing.id,
    organization_id: existing.organization_id || targetOrg || '',
    currentDebtUSD: existing.currentDebtUSD,
    lastPurchaseDate: existing.lastPurchaseDate,
    status: (existing.currentDebtUSD > (updates.creditLimitUSD ?? existing.creditLimitUSD)) ? 'aviso' : existing.status,
    updatedAt: new Date().toISOString()
  };

  cached[idx] = updatedCustomer;
  setLocal(keys.CUSTOMERS, cached);
  notifyCustomerSubscribers(cached, targetOrg);

  // Synchronize customerName in ledger and sales
  if (updates.name && updates.name.trim() !== existing.name) {
    const ledger = getLocal<LedgerEntry[]>(keys.LEDGER, []);
    let ledgerChanged = false;
    for (const entry of ledger) {
      if (entry.customerId === customerId) {
        entry.customerName = updates.name.trim();
        ledgerChanged = true;
      }
    }
    if (ledgerChanged) {
      setLocal(keys.LEDGER, ledger);
      notifyLedgerSubscribers(ledger, targetOrg);
    }

    const sales = getLocal<Sale[]>(keys.SALES, []);
    let salesChanged = false;
    for (const sale of sales) {
      if (sale.customerId === customerId) {
        sale.customerName = updates.name.trim();
        salesChanged = true;
      }
    }
    if (salesChanged) {
      setLocal(keys.SALES, sales);
      notifySaleSubscribers(sales, targetOrg);
    }
  }

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, CUSTOMERS_COLLECTION, customerId), {
        name: updatedCustomer.name,
        alias: updatedCustomer.alias || '',
        phone: updatedCustomer.phone,
        address: updatedCustomer.address,
        creditLimitUSD: updatedCustomer.creditLimitUSD,
        status: updatedCustomer.status,
        updatedAt: updatedCustomer.updatedAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${CUSTOMERS_COLLECTION}/${customerId}`);
    }
  }

  return updatedCustomer;
}

// Register Completed Sale
export async function registerSaleRecord(
  sale: Omit<Sale, 'id'>,
  selectedCustomer?: Customer | null,
  orgId?: string
): Promise<Sale> {
  const targetOrg = orgId || activeOrganizationId || sale.organization_id || '';
  const id = `sale-${Date.now()}`;
  const newSale: Sale = {
    ...sale,
    id,
    organization_id: targetOrg
  };

  const keys = getTenantStorageKeys(targetOrg);

  // 1. Discount inventory stock
  const products = getLocal<Product[]>(keys.PRODUCTS, []);
  for (const item of sale.items) {
    const prod = products.find((p) => p.id === item.productId || p.name.toLowerCase() === item.productName.toLowerCase());
    if (prod) {
      prod.currentStock = Math.max(0, Number((prod.currentStock - item.quantity).toFixed(2)));
      prod.updatedAt = new Date().toISOString();
      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, PRODUCTS_COLLECTION, prod.id), {
            currentStock: prod.currentStock,
            updatedAt: prod.updatedAt
          });
        } catch (e) {
          console.warn('Stock update in Firestore failed', e);
        }
      }
    }
  }
  setLocal(keys.PRODUCTS, products);
  notifyProductSubscribers(products, targetOrg);

  // 2. If it's a "Fiado / Debe", accumulate onto customer
  if (sale.paymentMethod === 'fiado') {
    const rawCustomers = getLocal<Customer[]>(keys.CUSTOMERS, []);
    const customers = deduplicateCustomerList(rawCustomers);

    const rawName = (sale.customerName || selectedCustomer?.name || '').trim();
    const clientName = rawName && rawName.toLowerCase() !== 'consumidor final' ? rawName : 'Cliente Fiado';

    let customer: Customer | undefined;
    if (selectedCustomer?.id) {
      customer = customers.find((c) => c.id === selectedCustomer.id);
    }
    if (!customer) {
      customer = findCustomerByNameOrAlias(clientName, customers);
    }

    if (!customer) {
      const newCustId = `cust-${Date.now()}`;
      const newCust: Customer = {
        id: newCustId,
        organization_id: targetOrg,
        name: clientName,
        phone: '',
        alias: 'Mostrador Cuaderno',
        address: 'Vecino del sector',
        creditLimitUSD: 50.0,
        currentDebtUSD: 0,
        lastPurchaseDate: 'Hoy ' + sale.time,
        status: 'al_dia',
        updatedAt: new Date().toISOString()
      };
      customer = newCust;
      customers.unshift(newCust);

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, CUSTOMERS_COLLECTION, newCustId), customer);
        } catch (e) {
          console.warn('Auto create customer in Firestore failed', e);
        }
      }
    }

    if (customer) {
      newSale.customerId = customer.id;
      newSale.customerName = customer.name;

      const prevDebt = Number((customer.currentDebtUSD || 0).toFixed(2));
      const newDebt = Number((prevDebt + sale.totalUSD).toFixed(2));
      customer.currentDebtUSD = newDebt;
      customer.lastPurchaseDate = 'Hoy ' + sale.time;
      customer.updatedAt = new Date().toISOString();
      customer.organization_id = targetOrg;
      if (newDebt > customer.creditLimitUSD) {
        customer.status = 'aviso';
      }

      const cIdx = customers.findIndex((c) => c.id === customer!.id);
      if (cIdx >= 0) {
        customers[cIdx] = customer;
      } else {
        customers.unshift(customer);
      }
      setLocal(keys.CUSTOMERS, customers);
      notifyCustomerSubscribers(customers, targetOrg);

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, CUSTOMERS_COLLECTION, customer.id), customer, { merge: true });
        } catch (e) {
          console.warn('Customer debt update failed in Firestore', e);
        }
      }

      // Create ledger entry
      const ledgerEntry: LedgerEntry = {
        id: `led-${Date.now()}`,
        organization_id: targetOrg,
        customerId: customer.id,
        customerName: customer.name,
        date: sale.date,
        time: sale.time,
        type: 'fiado',
        amountUSD: sale.totalUSD,
        amountBs: sale.totalBs,
        exchangeRate: sale.exchangeRate,
        ticketNumber: sale.ticketNumber,
        details: sale.items.map((i) => `${i.quantity} ${i.productName}`).join(', '),
        previousDebtUSD: prevDebt,
        newDebtUSD: newDebt
      };

      const ledger = getLocal<LedgerEntry[]>(keys.LEDGER, []);
      ledger.unshift(ledgerEntry);
      setLocal(keys.LEDGER, ledger);
      notifyLedgerSubscribers(ledger, targetOrg);

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, LEDGER_COLLECTION, ledgerEntry.id), ledgerEntry);
        } catch (e) {
          console.warn('Ledger entry save failed in Firestore', e);
        }
      }
    }
  }

  // 3. Save Sale
  const sales = getLocal<Sale[]>(keys.SALES, []);
  sales.unshift(newSale);
  setLocal(keys.SALES, sales);
  notifySaleSubscribers(sales, targetOrg);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, SALES_COLLECTION, newSale.id), newSale);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SALES_COLLECTION}/${newSale.id}`);
    }
  }

  return newSale;
}

// Register Abono (Payment) to Customer Debt
export async function registerCustomerAbono(
  customer: Customer,
  amountUSD: number,
  exchangeRate: number,
  paymentMethod: string,
  reference?: string,
  orgId?: string
): Promise<LedgerEntry> {
  const targetOrg = orgId || activeOrganizationId || customer.organization_id || '';
  const keys = getTenantStorageKeys(targetOrg);

  const prevDebt = customer.currentDebtUSD;
  const newDebt = Math.max(0, Number((prevDebt - amountUSD).toFixed(2)));
  const amountBs = Number((amountUSD * exchangeRate).toFixed(2));

  customer.currentDebtUSD = newDebt;
  customer.updatedAt = new Date().toISOString();
  customer.organization_id = targetOrg;
  if (newDebt <= 0) {
    customer.status = 'al_dia';
  }

  const customers = getLocal<Customer[]>(keys.CUSTOMERS, []);
  const idx = customers.findIndex((c) => c.id === customer.id);
  if (idx >= 0) {
    customers[idx] = customer;
  }
  setLocal(keys.CUSTOMERS, customers);
  notifyCustomerSubscribers(customers, targetOrg);

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, CUSTOMERS_COLLECTION, customer.id), {
        currentDebtUSD: newDebt,
        status: customer.status,
        updatedAt: customer.updatedAt,
        organization_id: targetOrg
      });
    } catch (e) {
      console.warn('Customer update failed in Firestore', e);
    }
  }

  const now = new Date();
  const entry: LedgerEntry = {
    id: `led-${Date.now()}`,
    organization_id: targetOrg,
    customerId: customer.id,
    customerName: customer.name,
    date: 'Hoy',
    time: now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
    type: 'abono',
    amountUSD: amountUSD,
    amountBs: amountBs,
    exchangeRate: exchangeRate,
    paymentMethod: paymentMethod,
    reference: reference || 'Abono en Mostrador',
    details: `Abono registrado por caja (${paymentMethod})`,
    previousDebtUSD: prevDebt,
    newDebtUSD: newDebt
  };

  const ledger = getLocal<LedgerEntry[]>(keys.LEDGER, []);
  ledger.unshift(entry);
  setLocal(keys.LEDGER, ledger);
  notifyLedgerSubscribers(ledger, targetOrg);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, LEDGER_COLLECTION, entry.id), entry);
    } catch (e) {
      console.warn('Ledger save failed in Firestore', e);
    }
  }

  return entry;
}

// AI Invoice Scans Tracker (Scoped by Tenant)
export async function getOrgAiScansCount(orgId?: string | null): Promise<number> {
  const currentOrg = orgId || activeOrganizationId;
  if (!currentOrg) return 0;
  const localKey = `bodega_${currentOrg}_ai_scans_count`;
  const cachedVal = localStorage.getItem(localKey);
  let count = cachedVal !== null ? parseInt(cachedVal, 10) : 0;
  if (isNaN(count)) count = 0;

  if (auth.currentUser) {
    try {
      const orgDoc = await getDoc(doc(db, 'organizations', currentOrg));
      if (orgDoc.exists()) {
        const data = orgDoc.data();
        if (typeof data.ai_scans_used === 'number') {
          count = Math.max(count, data.ai_scans_used);
          localStorage.setItem(localKey, count.toString());
        }
      }
    } catch (e) {
      console.warn('Failed to fetch org ai_scans_used from Firestore', e);
    }
  }
  return count;
}

export async function incrementOrgAiScansCount(orgId?: string | null): Promise<number> {
  const currentOrg = orgId || activeOrganizationId;
  if (!currentOrg) return 1;
  const localKey = `bodega_${currentOrg}_ai_scans_count`;
  const current = await getOrgAiScansCount(currentOrg);
  const next = current + 1;
  localStorage.setItem(localKey, next.toString());

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'organizations', currentOrg), {
        ai_scans_used: next
      });
    } catch (e) {
      console.warn('Failed to update org ai_scans_used in Firestore', e);
    }
  }
  return next;
}

// ==========================================
// MASTER ADMIN / SAAS OWNER DASHBOARD
// ==========================================

export const SAAS_ORGANIZATIONS_REGISTRY_KEY = 'bodega_all_organizations_registry';

export const INITIAL_SAAS_ORGANIZATIONS: OrganizationAdminRecord[] = [
  {
    id: 'org-william-cordovez',
    nombre_negocio: 'Bodega William',
    ownerName: 'Ing. William Cordovez',
    ownerEmail: 'williamcordovezcn@gmail.com',
    ownerPhone: '+584241289468',
    plan_suscripcion: 'pro',
    subscriptionStatus: 'active',
    subscriptionExpiryDate: '2029-12-31',
    fecha_registro: '2026-01-15T10:00:00.000Z',
    productsCount: 14,
    ai_scans_used: 6,
    paymentNotes: 'Cuenta Principal SaaS Master Admin'
  },
  {
    id: 'org-bodega-san-jose',
    nombre_negocio: 'Bodega San José',
    ownerName: 'Carlos Mendoza',
    ownerEmail: 'carlos.mendoza@gmail.com',
    ownerPhone: '+584141234567',
    plan_suscripcion: 'pro',
    subscriptionStatus: 'active',
    subscriptionExpiryDate: '2026-11-20',
    fecha_registro: '2026-02-10T14:30:00.000Z',
    productsCount: 42,
    ai_scans_used: 14,
    paymentNotes: 'Pago Móvil Mercantil Ref: 894102'
  },
  {
    id: 'org-abasto-el-ahorro',
    nombre_negocio: 'Abasto El Ahorro Central',
    ownerName: 'Carmen Rodríguez',
    ownerEmail: 'carmen.ahorro@gmail.com',
    ownerPhone: '+584245558899',
    plan_suscripcion: 'premium',
    subscriptionStatus: 'active',
    subscriptionExpiryDate: '2026-12-05',
    fecha_registro: '2026-03-01T09:15:00.000Z',
    productsCount: 185,
    ai_scans_used: 38,
    paymentNotes: 'Binance Pay USDT Ref: 981245'
  },
  {
    id: 'org-minimarket-chacao',
    nombre_negocio: 'Minimarket Express Chacao',
    ownerName: 'José Hernández',
    ownerEmail: 'j.hernandez@expressmarket.ve',
    ownerPhone: '+584163334411',
    plan_suscripcion: 'pro',
    subscriptionStatus: 'paused',
    subscriptionExpiryDate: '2026-10-15',
    fecha_registro: '2026-03-12T16:20:00.000Z',
    productsCount: 38,
    ai_scans_used: 9,
    paymentNotes: 'Pausado temporal por remodelación'
  },
  {
    id: 'org-viveres-don-pedro',
    nombre_negocio: 'Víveres Don Pedro',
    ownerName: 'Pedro Morales',
    ownerEmail: 'donpedro.viveres@gmail.com',
    ownerPhone: '+584249991122',
    plan_suscripcion: 'gratuito',
    subscriptionStatus: 'active',
    subscriptionExpiryDate: '2026-11-15',
    fecha_registro: '2026-04-05T11:45:00.000Z',
    productsCount: 5,
    ai_scans_used: 1,
    paymentNotes: 'Plan Prueba Gratuito (Límite 5 productos)'
  },
  {
    id: 'org-delicateses-teques',
    nombre_negocio: 'Delicateses Los Teques',
    ownerName: 'María Eugenia Soto',
    ownerEmail: 'mariaeugenia.soto@gmail.com',
    ownerPhone: '+584128882233',
    plan_suscripcion: 'gratuito',
    subscriptionStatus: 'expired',
    subscriptionExpiryDate: '2026-02-28',
    fecha_registro: '2026-01-20T08:00:00.000Z',
    productsCount: 4,
    ai_scans_used: 1,
    paymentNotes: 'Pendiente confirmación de pago Pro'
  }
];

export function syncOrganizationToMasterRegistry(org: Partial<OrganizationAdminRecord>): void {
  try {
    const raw = localStorage.getItem(SAAS_ORGANIZATIONS_REGISTRY_KEY);
    let list: OrganizationAdminRecord[] = raw ? JSON.parse(raw) : [...INITIAL_SAAS_ORGANIZATIONS];
    const idx = list.findIndex(item => item.id === org.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...org };
    } else if (org.id) {
      list.unshift({
        id: org.id,
        nombre_negocio: org.nombre_negocio || 'Nuevo Comercio',
        ownerName: org.ownerName || 'Propietario',
        ownerEmail: org.ownerEmail || '',
        ownerPhone: org.ownerPhone || org.telefono || '',
        plan_suscripcion: org.plan_suscripcion || 'gratuito',
        subscriptionStatus: org.subscriptionStatus || 'active',
        subscriptionExpiryDate: org.subscriptionExpiryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        fecha_registro: org.fecha_registro || new Date().toISOString(),
        productsCount: org.productsCount || 0,
        ai_scans_used: org.ai_scans_used || 0,
        paymentNotes: org.paymentNotes || ''
      });
    }
    localStorage.setItem(SAAS_ORGANIZATIONS_REGISTRY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to sync organization to master registry:', e);
  }
}

export async function getAllOrganizationsForAdmin(): Promise<OrganizationAdminRecord[]> {
  const localRaw = localStorage.getItem(SAAS_ORGANIZATIONS_REGISTRY_KEY);
  let records: OrganizationAdminRecord[] = localRaw ? JSON.parse(localRaw) : [...INITIAL_SAAS_ORGANIZATIONS];

  // Try to sync with Firestore
  if (auth.currentUser) {
    try {
      const orgsSnap = await getDocs(collection(db, ORGANIZATIONS_COLLECTION));
      if (!orgsSnap.empty) {
        const firestoreOrgs: Organization[] = [];
        orgsSnap.forEach(d => {
          firestoreOrgs.push({ id: d.id, ...d.data() } as Organization);
        });

        // Also fetch profiles and products to enhance stats
        const profilesSnap = await getDocs(collection(db, PROFILES_COLLECTION));
        const profilesMap = new Map<string, UserProfile>();
        profilesSnap.forEach(d => {
          const p = d.data() as UserProfile;
          if (p.organization_id && (p.rol === 'dueno' || p.rol === 'dueño')) {
            profilesMap.set(p.organization_id, p);
          }
        });

        const productsSnap = await getDocs(collection(db, PRODUCTS_COLLECTION));
        const productsCountMap = new Map<string, number>();
        productsSnap.forEach(d => {
          const pr = d.data() as Product;
          if (pr.organization_id) {
            productsCountMap.set(pr.organization_id, (productsCountMap.get(pr.organization_id) || 0) + 1);
          }
        });

        // Merge firestore orgs into records
        firestoreOrgs.forEach(fo => {
          const ownerProf = profilesMap.get(fo.id);
          const prCount = productsCountMap.get(fo.id) || 0;
          const existingIdx = records.findIndex(r => r.id === fo.id);

          const merged: OrganizationAdminRecord = {
            id: fo.id,
            nombre_negocio: fo.nombre_negocio || 'Comercio',
            ownerName: fo.ownerName || ownerProf?.nombre || (existingIdx >= 0 ? records[existingIdx].ownerName : 'Dueño'),
            ownerEmail: fo.ownerEmail || ownerProf?.email || (existingIdx >= 0 ? records[existingIdx].ownerEmail : ''),
            ownerPhone: fo.telefono || (existingIdx >= 0 ? records[existingIdx].ownerPhone : ''),
            plan_suscripcion: fo.plan_suscripcion || (existingIdx >= 0 ? records[existingIdx].plan_suscripcion : 'gratuito'),
            subscriptionStatus: fo.subscriptionStatus || (existingIdx >= 0 ? records[existingIdx].subscriptionStatus : 'active'),
            subscriptionExpiryDate: fo.subscriptionExpiryDate || (existingIdx >= 0 ? records[existingIdx].subscriptionExpiryDate : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]),
            fecha_registro: fo.fecha_registro || (existingIdx >= 0 ? records[existingIdx].fecha_registro : new Date().toISOString()),
            productsCount: prCount || (existingIdx >= 0 ? records[existingIdx].productsCount : 0),
            ai_scans_used: typeof fo.ai_scans_used === 'number' ? fo.ai_scans_used : (existingIdx >= 0 ? records[existingIdx].ai_scans_used : 0),
            logoUrl: fo.logoUrl,
            paymentNotes: fo.paymentNotes || (existingIdx >= 0 ? records[existingIdx].paymentNotes : '')
          };

          if (existingIdx >= 0) {
            records[existingIdx] = merged;
          } else {
            records.unshift(merged);
          }
        });
      }
    } catch (e) {
      console.warn('Could not read organizations from Firestore, using registry cache:', e);
    }
  }

  // Update local storage cache
  localStorage.setItem(SAAS_ORGANIZATIONS_REGISTRY_KEY, JSON.stringify(records));
  return records;
}

export async function updateOrganizationPlanAndStatus(
  orgId: string,
  updates: Partial<OrganizationAdminRecord>
): Promise<void> {
  // Update local registry
  const raw = localStorage.getItem(SAAS_ORGANIZATIONS_REGISTRY_KEY);
  let records: OrganizationAdminRecord[] = raw ? JSON.parse(raw) : [...INITIAL_SAAS_ORGANIZATIONS];
  const idx = records.findIndex(r => r.id === orgId);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...updates };
  } else {
    records.push({ id: orgId, ...updates } as OrganizationAdminRecord);
  }
  localStorage.setItem(SAAS_ORGANIZATIONS_REGISTRY_KEY, JSON.stringify(records));

  // If this organization is the currently active organization in the session, update it
  try {
    const rawSession = localStorage.getItem('bodega_active_session');
    if (rawSession) {
      const session = JSON.parse(rawSession);
      if (session.organization && session.organization.id === orgId) {
        session.organization = { ...session.organization, ...updates };
        localStorage.setItem('bodega_active_session', JSON.stringify(session));
      }
    }
  } catch (e) {
    console.warn('Failed to update active session:', e);
  }

  // Persist to Firestore
  if (auth.currentUser) {
    try {
      await setDoc(doc(db, ORGANIZATIONS_COLLECTION, orgId), updates, { merge: true });
    } catch (e) {
      console.warn('Failed to persist organization update to Firestore:', e);
    }
  }
}

export async function createManualOrganization(
  data: {
    nombre_negocio: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone?: string;
    plan_suscripcion: 'gratuito' | 'pro' | 'premium';
    subscriptionExpiryDate?: string;
    paymentNotes?: string;
  }
): Promise<OrganizationAdminRecord> {
  const orgId = `org-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const newRecord: OrganizationAdminRecord = {
    id: orgId,
    nombre_negocio: data.nombre_negocio.trim(),
    ownerName: data.ownerName.trim(),
    ownerEmail: data.ownerEmail.trim().toLowerCase(),
    ownerPhone: data.ownerPhone?.trim() || '',
    plan_suscripcion: data.plan_suscripcion,
    subscriptionStatus: 'active',
    subscriptionExpiryDate: data.subscriptionExpiryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    fecha_registro: new Date().toISOString(),
    productsCount: 0,
    ai_scans_used: 0,
    paymentNotes: data.paymentNotes?.trim() || 'Registrado manualmente por Master Admin'
  };

  syncOrganizationToMasterRegistry(newRecord);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, ORGANIZATIONS_COLLECTION, orgId), newRecord);
    } catch (e) {
      console.warn('Failed to save manual organization to Firestore:', e);
    }
  }

  return newRecord;
}

