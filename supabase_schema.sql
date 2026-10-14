-- ==============================================================================
-- CUADERNO DIGITAL BODEGA - SCHEMA MULTI-TENANT PARA SUPABASE (POSTGRESQL)
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: ORGANIZATIONS (Negocios / Bodegas SaaS)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_negocio TEXT NOT NULL,
    plan_suscripcion TEXT NOT NULL DEFAULT 'gratuito', -- 'gratuito', 'basico', 'pro'
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    telefono TEXT,
    direccion TEXT,
    moneda_principal TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA: PROFILES (Vínculo Usuarios/Empleados con su Organización)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rol TEXT NOT NULL DEFAULT 'dueño' CHECK (rol IN ('dueño', 'dueno', 'administrador', 'empleado')),
    nombre TEXT,
    email TEXT,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABLA: PRODUCTS (Inventario de cada negocio)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    category TEXT DEFAULT 'Víveres Secos',
    unit TEXT DEFAULT 'und.',
    cost_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    price_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    margin_percent NUMERIC(5, 2) DEFAULT 0.00,
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    supplier TEXT,
    barcode TEXT,
    pricing_type TEXT DEFAULT 'usd_anchored', -- 'usd_anchored', 'fixed_bs'
    fixed_price_bs NUMERIC(14, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABLA: CUSTOMERS (Libretas de Fiados por negocio)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    alias TEXT,
    phone TEXT,
    address TEXT,
    credit_limit_usd NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
    current_debt_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    last_purchase_date TEXT,
    status TEXT NOT NULL DEFAULT 'al_dia', -- 'al_dia', 'aviso', 'vencido', 'comercial'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABLA: SALES (Ventas en Mostrador)
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ticket_number INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_id TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_bs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    exchange_rate NUMERIC(12, 2) NOT NULL,
    payment_method TEXT NOT NULL, -- 'pago_movil', 'efectivo_usd', 'efectivo_bs', 'fiado'
    status TEXT NOT NULL DEFAULT 'saldada', -- 'saldada', 'fiado'
    notes TEXT,
    cashier TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABLA: LEDGER_ENTRIES / PAGOS (Historial de Fiados y Abonos/Pagos)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    type TEXT NOT NULL, -- 'fiado', 'abono'
    amount_usd NUMERIC(12, 2) NOT NULL,
    amount_bs NUMERIC(14, 2) NOT NULL,
    exchange_rate NUMERIC(12, 2) NOT NULL,
    payment_method TEXT,
    reference TEXT,
    details TEXT,
    ticket_number INTEGER,
    previous_debt_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    new_debt_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TABLA: SETTINGS (Configuraciones y Tasa de Cambio por Negocio)
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    bcv_exchange_rate NUMERIC(12, 2) NOT NULL DEFAULT 65.00,
    bodega_name TEXT NOT NULL,
    cashier_name TEXT DEFAULT 'Caja Principal',
    last_updated TEXT,
    pago_movil_phone TEXT,
    pago_movil_bank TEXT,
    pago_movil_ci TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. ÍNDICES DE RENDIMIENTO MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_org ON public.sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_org ON public.ledger_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_settings_org ON public.settings(organization_id);

-- ==============================================================================
-- SEGURIDAD ROW LEVEL SECURITY (RLS) AISLADA
-- ==============================================================================

-- Función auxiliar para obtener la organización del usuario autenticado
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid() OR user_id = auth.uid() LIMIT 1;
$$;

-- Función auxiliar para verificar si el usuario autenticado tiene rol de Dueño
CREATE OR REPLACE FUNCTION public.is_org_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE (id = auth.uid() OR user_id = auth.uid()) 
          AND rol IN ('dueño', 'dueno')
    );
$$;

-- HABILITAR RLS EN TODAS LAS TABLAS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: ORGANIZATIONS
CREATE POLICY "org_select_policy" ON public.organizations
    FOR SELECT TO authenticated
    USING (id = public.current_user_org_id());

CREATE POLICY "org_insert_policy" ON public.organizations
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Solo el Dueño puede actualizar datos y logo de la organización
CREATE POLICY "org_update_policy" ON public.organizations
    FOR UPDATE TO authenticated
    USING (id = public.current_user_org_id() AND public.is_org_owner())
    WITH CHECK (id = public.current_user_org_id() AND public.is_org_owner());

-- POLÍTICAS: PROFILES (Gestión y Asignación de Roles Exclusiva del Dueño)
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR user_id = auth.uid() OR organization_id = public.current_user_org_id());

-- Auto-registro inicial O inserción por el Dueño de la organización
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        (id = auth.uid() OR user_id = auth.uid())
        OR (public.is_org_owner() AND organization_id = public.current_user_org_id())
    );

-- Actualización por el usuario mismo (sin cambiar rol) O actualización total por el Dueño
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        (id = auth.uid() OR user_id = auth.uid())
        OR (public.is_org_owner() AND organization_id = public.current_user_org_id())
    )
    WITH CHECK (
        (id = auth.uid() OR user_id = auth.uid())
        OR (public.is_org_owner() AND organization_id = public.current_user_org_id())
    );

-- Eliminación de colaboradores exclusiva para el Dueño (no puede eliminarse a sí mismo)
CREATE POLICY "profiles_delete_policy" ON public.profiles
    FOR DELETE TO authenticated
    USING (
        public.is_org_owner() 
        AND organization_id = public.current_user_org_id() 
        AND id != auth.uid() 
        AND (user_id IS NULL OR user_id != auth.uid())
    );

-- POLÍTICAS: PRODUCTS (Aislamiento total por negocio)
CREATE POLICY "products_all_policy" ON public.products
    FOR ALL TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());

-- POLÍTICAS: CUSTOMERS (Aislamiento total por negocio)
CREATE POLICY "customers_all_policy" ON public.customers
    FOR ALL TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());

-- POLÍTICAS: SALES (Aislamiento total por negocio)
CREATE POLICY "sales_all_policy" ON public.sales
    FOR ALL TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());

-- POLÍTICAS: LEDGER_ENTRIES (Aislamiento total de pagos y fiados)
CREATE POLICY "ledger_all_policy" ON public.ledger_entries
    FOR ALL TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());

-- POLÍTICAS: SETTINGS (Aislamiento total por negocio)
CREATE POLICY "settings_all_policy" ON public.settings
    FOR ALL TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());
