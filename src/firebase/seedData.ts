import { Product, Customer, Sale, LedgerEntry, BodegaSettings } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-pan-001',
    name: 'Harina PAN Blanca 1kg',
    code: 'PAN-001',
    category: 'Víveres Secos',
    unit: 'paq.',
    costUSD: 0.95,
    priceUSD: 1.30,
    marginPercent: 27,
    currentStock: 4,
    minStock: 20,
    supplier: 'Alimentos Polar',
    barcode: '7591031000123',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-arr-014',
    name: 'Arroz Mary Tradicional 1kg',
    code: 'ARR-014',
    category: 'Víveres Secos',
    unit: 'paq.',
    costUSD: 1.10,
    priceUSD: 1.45,
    marginPercent: 24,
    currentStock: 48,
    minStock: 20,
    supplier: 'Dist. Alimentos Mary',
    barcode: '7591045000234',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-qso-002',
    name: 'Queso Blanco Duro Llanero (Kg)',
    code: 'QSO-002',
    category: 'Lácteos y Charcutería',
    unit: 'Kg',
    costUSD: 4.20,
    priceUSD: 5.80,
    marginPercent: 28,
    currentStock: 14.5,
    minStock: 10,
    supplier: 'Quesera El Páramo',
    barcode: '7592011000456',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-act-005',
    name: 'Aceite Vegetal Vatel 1L',
    code: 'ACT-005',
    category: 'Víveres Secos',
    unit: 'bot.',
    costUSD: 2.40,
    priceUSD: 3.10,
    marginPercent: 23,
    currentStock: 2,
    minStock: 12,
    supplier: 'Cargill Venezuela',
    barcode: '7591008000789',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-caf-003',
    name: 'Café Fama de América 250g',
    code: 'CAF-003',
    category: 'Víveres Secos',
    unit: 'paq.',
    costUSD: 1.85,
    priceUSD: 2.50,
    marginPercent: 26,
    currentStock: 0,
    minStock: 15,
    supplier: 'Café Fama de América',
    barcode: '7591022000890',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-pas-012',
    name: 'Pasta Primor Larga 1kg',
    code: 'PAS-012',
    category: 'Víveres Secos',
    unit: 'paq.',
    costUSD: 1.05,
    priceUSD: 1.40,
    marginPercent: 25,
    currentStock: 18,
    minStock: 15,
    supplier: 'Empresas Polar',
    barcode: '7591031000555',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-hue-004',
    name: 'Medio Cartón de Huevos (15 ud)',
    code: 'HUE-004',
    category: 'Lácteos y Charcutería',
    unit: 'und.',
    costUSD: 1.90,
    priceUSD: 2.50,
    marginPercent: 24,
    currentStock: 12,
    minStock: 10,
    supplier: 'Granja Avícola San Antonio',
    barcode: '7591099000111',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-beb-089',
    name: 'Maltín Polar Botella 250ml',
    code: 'BEB-089',
    category: 'Bebidas y Refrescos',
    unit: 'bot.',
    costUSD: 0.65,
    priceUSD: 0.90,
    marginPercent: 28,
    currentStock: 36,
    minStock: 24,
    supplier: 'Cervecería Polar',
    barcode: '7591031000999',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-azu-007',
    name: 'Azúcar Montalbán 1kg',
    code: 'AZU-007',
    category: 'Víveres Secos',
    unit: 'paq.',
    costUSD: 0.98,
    priceUSD: 1.35,
    marginPercent: 27,
    currentStock: 5,
    minStock: 15,
    supplier: 'Central Montalbán',
    barcode: '7591077000222',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-mav-021',
    name: 'Mantequilla Mavesa 500g',
    code: 'MAN-021',
    category: 'Lácteos y Charcutería',
    unit: 'und.',
    costUSD: 1.70,
    priceUSD: 2.20,
    marginPercent: 23,
    currentStock: 16,
    minStock: 10,
    supplier: 'Mavesa Alimentos',
    barcode: '7591031000333',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-ref-033',
    name: 'Refresco 2L',
    code: 'REF-033',
    category: 'Bebidas y Refrescos',
    unit: 'bot.',
    costUSD: 1.50,
    priceUSD: 2.00,
    marginPercent: 25,
    currentStock: 14,
    minStock: 10,
    supplier: 'Coca-Cola FEMSA',
    barcode: '7591055000444',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-jab-015',
    name: 'Jabón Las Llaves Panela 250g',
    code: 'JAB-015',
    category: 'Limpieza y Aseo',
    unit: 'und.',
    costUSD: 0.60,
    priceUSD: 0.85,
    marginPercent: 29,
    currentStock: 30,
    minStock: 12,
    supplier: 'Empresas Polar Limpieza',
    barcode: '7591031000777',
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-maria',
    name: 'María Rodríguez',
    alias: 'María vecina',
    phone: '+58 412-555-8921',
    address: 'Vecina casa #14 (Callejón La Esperanza)',
    creditLimitUSD: 50.00,
    currentDebtUSD: 24.50,
    lastPurchaseDate: 'Hoy 10:45 AM',
    status: 'al_dia',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust-carmen',
    name: 'Vecina Carmen',
    alias: 'Carmen ambulatorio',
    phone: '+58 414-234-5678',
    address: 'Frente al ambulatorio • Casa verde',
    creditLimitUSD: 60.00,
    currentDebtUSD: 48.20,
    lastPurchaseDate: 'Ayer',
    status: 'aviso',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust-pedro',
    name: 'Don Pedro Carnicería',
    alias: 'Don Pedro',
    phone: '+58 424-987-6543',
    address: 'Local de la esquina • Carnicería La Bendición',
    creditLimitUSD: 200.00,
    currentDebtUSD: 115.00,
    lastPurchaseDate: 'Hace 2 días',
    status: 'comercial',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust-chucho',
    name: 'Chucho el Mecánico',
    alias: 'Chucho',
    phone: '+58 416-345-6789',
    address: 'Taller de motos calle principal',
    creditLimitUSD: 30.00,
    currentDebtUSD: 18.50,
    lastPurchaseDate: 'Hace 3 días',
    status: 'al_dia',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust-elena',
    name: 'Señora Elena',
    alias: 'Doña Elena',
    phone: '+58 412-876-5432',
    address: 'Edificio Bloque 4, Piso 3',
    creditLimitUSD: 50.00,
    currentDebtUSD: 32.00,
    lastPurchaseDate: 'Hace 6 días',
    status: 'aviso',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cust-ramon',
    name: 'Tío Ramón',
    alias: 'Ramón',
    phone: '+58 414-111-2233',
    address: 'Casa #28, sector La Capilla',
    creditLimitUSD: 80.00,
    currentDebtUSD: 85.75,
    lastPurchaseDate: '12 de Octubre',
    status: 'vencido',
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_SETTINGS: BodegaSettings = {
  bcvExchangeRate: 877.90,
  lastExchangeRateUpdate: 'Inicial (877.90 Bs/USD)',
  bodegaName: 'Bodega La Milagrosa',
  cashierName: 'Caja Principal',
  lastUpdated: 'Hoy 9:00 AM',
  pagoMovilPhone: '0414-998-1122',
  pagoMovilBank: 'Banesco (0134)',
  pagoMovilCI: 'V-14.890.123'
};

export const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'led-1',
    customerId: 'cust-maria',
    customerName: 'María Rodríguez',
    date: 'Hoy',
    time: '10:45 AM',
    type: 'fiado',
    amountUSD: 7.45,
    amountBs: 480.53,
    exchangeRate: 64.50,
    ticketNumber: 1084,
    details: '2 Arroz Mary (1kg), 1 Pasta Primor (1kg), 1 Harina PAN blanca, 1/2 Cartón huevos (15 ud)',
    previousDebtUSD: 17.05,
    newDebtUSD: 24.50
  },
  {
    id: 'led-2',
    customerId: 'cust-maria',
    customerName: 'María Rodríguez',
    date: 'Ayer',
    time: '6:15 PM',
    type: 'fiado',
    amountUSD: 9.05,
    amountBs: 583.73,
    exchangeRate: 64.50,
    ticketNumber: 1072,
    details: '1 Aceite Vatel 1L, 1 Harina PAN, 500g Queso blanco llanero duro',
    previousDebtUSD: 8.00,
    newDebtUSD: 17.05
  },
  {
    id: 'led-3',
    customerId: 'cust-maria',
    customerName: 'María Rodríguez',
    date: '20 Oct',
    time: '8:20 AM',
    type: 'fiado',
    amountUSD: 13.00,
    amountBs: 838.50,
    exchangeRate: 64.50,
    ticketNumber: 1041,
    details: '2 Mantequilla Mavesa 500g, 1 Café Fama de América 250g molido',
    previousDebtUSD: 0.00,
    newDebtUSD: 13.00
  },
  {
    id: 'led-4',
    customerId: 'cust-maria',
    customerName: 'María Rodríguez',
    date: '18 Oct',
    time: '5:30 PM',
    type: 'abono',
    amountUSD: 5.00,
    amountBs: 322.50,
    exchangeRate: 64.50,
    paymentMethod: 'Pago Móvil Banesco',
    reference: 'Ref: #8492',
    details: 'Abono parcial reportado por WhatsApp • Aprobado por cajero',
    previousDebtUSD: 13.00,
    newDebtUSD: 8.00
  }
];

export const INITIAL_SALES: Sale[] = [
  {
    id: 'sale-1',
    ticketNumber: 1085,
    date: 'Hoy',
    time: '10:42 AM',
    customerName: 'Carlos M.',
    items: [
      { productId: 'prod-mav-021', productName: 'Mantequilla Mavesa 500g', productCode: 'MAN-021', quantity: 1, priceUSD: 2.20, subtotalUSD: 2.20, subtotalBs: 141.90, unit: 'und.' },
      { productId: 'prod-pan-001', productName: 'Harina PAN Blanca 1kg', productCode: 'PAN-001', quantity: 1, priceUSD: 1.00, subtotalUSD: 1.00, subtotalBs: 64.50, unit: 'paq.' }
    ],
    totalUSD: 3.20,
    totalBs: 206.40,
    exchangeRate: 64.50,
    paymentMethod: 'pago_movil',
    status: 'saldada',
    cashier: 'Juan Bodeguero'
  },
  {
    id: 'sale-2',
    ticketNumber: 1084,
    date: 'Hoy',
    time: '10:35 AM',
    customerName: 'Vecina Carmen',
    customerId: 'cust-carmen',
    items: [
      { productId: 'prod-pan-001', productName: 'Harina PAN Blanca 1kg', productCode: 'PAN-001', quantity: 2, priceUSD: 1.15, subtotalUSD: 2.30, subtotalBs: 148.35, unit: 'paq.' }
    ],
    totalUSD: 2.30,
    totalBs: 148.35,
    exchangeRate: 64.50,
    paymentMethod: 'efectivo_usd',
    status: 'saldada',
    cashier: 'Juan Bodeguero'
  },
  {
    id: 'sale-3',
    ticketNumber: 1083,
    date: 'Hoy',
    time: '10:15 AM',
    customerName: 'Juancho',
    items: [
      { productId: 'prod-ref-033', productName: 'Refresco 2L', productCode: 'REF-033', quantity: 1, priceUSD: 2.00, subtotalUSD: 2.00, subtotalBs: 129.00, unit: 'bot.' }
    ],
    totalUSD: 2.00,
    totalBs: 129.00,
    exchangeRate: 64.50,
    paymentMethod: 'fiado',
    status: 'fiado',
    cashier: 'Juan Bodeguero'
  }
];
