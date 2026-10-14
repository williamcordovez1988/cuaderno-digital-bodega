export interface Organization {
  id: string;
  nombre_negocio: string;
  plan_suscripcion: 'trial' | 'prueba' | 'gratuito' | 'basico' | 'emprendedor' | 'pro' | string;
  fecha_registro: string;
  telefono?: string;
  direccion?: string;
  logoUrl?: string;
  ai_scans_used?: number;
}

export function isTrialPlan(plan?: string | null): boolean {
  if (!plan) return true;
  const p = plan.toLowerCase().trim();
  return p === 'trial' || p === 'prueba' || p === 'gratuito' || p === 'basico';
}

export type UserRole = 'dueño' | 'dueno' | 'administrador' | 'empleado' | string;

export function isOwner(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().trim();
  return r === 'dueno' || r === 'dueño';
}

export function isAdmin(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().trim();
  return r === 'administrador' || r === 'admin' || r === 'gerente';
}

export function isEmployee(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().trim();
  return r === 'empleado' || r === 'colaborador' || r === 'cajero';
}

export function canManageTeam(role?: string | null): boolean {
  return isOwner(role);
}

export function canManageSettings(role?: string | null): boolean {
  return isOwner(role);
}

export function canManageInventory(role?: string | null): boolean {
  return isOwner(role) || isAdmin(role);
}

export function canViewReports(role?: string | null): boolean {
  return isOwner(role) || isAdmin(role);
}

export function canViewFiados(role?: string | null): boolean {
  return isOwner(role) || isAdmin(role);
}

export interface UserProfile {
  id: string;
  user_id: string;
  organization_id: string;
  rol: 'dueño' | 'dueno' | 'administrador' | 'empleado' | string;
  nombre?: string;
  email?: string;
  password?: string;
  fecha_creacion?: string;
}

export interface Product {
  id: string;
  organization_id?: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  costUSD: number;
  priceUSD: number;
  marginPercent: number;
  currentStock: number;
  minStock: number;
  supplier: string;
  barcode: string;
  pricingType?: 'usd_anchored' | 'fixed_bs';
  fixedPriceBs?: number;
  updatedAt: string;
}

export interface Customer {
  id: string;
  organization_id?: string;
  name: string;
  alias?: string;
  phone: string;
  address: string;
  creditLimitUSD: number;
  currentDebtUSD: number;
  lastPurchaseDate: string;
  status: 'al_dia' | 'aviso' | 'vencido' | 'comercial';
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  priceUSD: number;
  subtotalUSD: number;
  subtotalBs: number;
  unit: string;
  pricingType?: 'usd_anchored' | 'fixed_bs';
  fixedPriceBs?: number;
}

export interface InvoiceItem {
  productId?: string;
  productName: string;
  productCode?: string;
  quantity: number;
  unit?: string;
  costUSD: number;
  costBs?: number;
  suggestedPriceUSD: number;
  suggestedPriceBs?: number;
  marginPercent?: number;
  pricingType?: 'usd_anchored' | 'fixed_bs';
  category?: string;
  isNewProduct?: boolean;
}

export interface InvoiceData {
  supplier: string;
  invoiceNumber?: string;
  date?: string;
  totalInvoiceAmountUSD?: number;
  totalInvoiceAmountBs?: number;
  items: InvoiceItem[];
  notes?: string;
}

export type PaymentMethod = 'pago_movil' | 'efectivo_usd' | 'efectivo_bs' | 'fiado';

export interface Sale {
  id: string;
  organization_id?: string;
  ticketNumber: number;
  date: string;
  time: string;
  customerName: string;
  customerId?: string;
  items: SaleItem[];
  totalUSD: number;
  totalBs: number;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  status: 'saldada' | 'fiado';
  notes?: string;
  cashier: string;
}

export interface LedgerEntry {
  id: string;
  organization_id?: string;
  customerId: string;
  customerName: string;
  date: string;
  time: string;
  type: 'fiado' | 'abono';
  amountUSD: number;
  amountBs: number;
  exchangeRate: number;
  paymentMethod?: string;
  reference?: string;
  details: string;
  ticketNumber?: number;
  previousDebtUSD: number;
  newDebtUSD: number;
}

export interface BodegaSettings {
  organization_id?: string;
  bcvExchangeRate: number;
  bodegaName: string;
  cashierName: string;
  lastUpdated: string;
  lastExchangeRateUpdate?: string;
  pagoMovilPhone: string;
  pagoMovilBank: string;
  pagoMovilCI: string;
  ownerPhone?: string;
  logoUrl?: string;
}

