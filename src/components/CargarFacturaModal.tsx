import React, { useState, useRef, useEffect } from 'react';
import { Product, InvoiceItem, InvoiceData, isTrialPlan } from '../firebase/types';
import { getOrgAiScansCount, incrementOrgAiScansCount } from '../firebase/firestoreService';
import {
  processInvoiceWithOpenAI,
  getOpenAIApiKey,
  setStoredOpenAIApiKey
} from '../services/openaiInvoiceService';

interface CargarFacturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Product[];
  exchangeRate: number;
  onApplyInvoice: (items: InvoiceItem[], supplierName: string) => Promise<void>;
  onShowToast: (msg: string, icon?: string) => void;
  plan?: string;
  organizationId?: string;
  onOpenPaywallModal?: (customOpts?: {
    title?: string;
    subtitle?: string;
    badge?: string;
    reason?: 'invoice_ai_limit';
  }) => void;
}

interface EditableInvoiceItem extends InvoiceItem {
  selected: boolean;
  marginPercent: number;
  costBs: number;
  suggestedPriceBs: number;
  matchedProduct?: Product;
}

export const CargarFacturaModal: React.FC<CargarFacturaModalProps> = ({
  isOpen,
  onClose,
  catalog,
  exchangeRate,
  onApplyInvoice,
  onShowToast,
  plan,
  organizationId,
  onOpenPaywallModal
}) => {
  const [activeTab, setActiveTab] = useState<'camera_file' | 'templates' | 'text'>('camera_file');
  const [invoiceText, setInvoiceText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Trial / Freemium Scans tracking
  const [scansUsed, setScansUsed] = useState<number>(0);
  const isTrial = isTrialPlan(plan);
  const isTrialLimitReached = isTrial && scansUsed >= 1;

  // Extracted Result
  const [extractedData, setExtractedData] = useState<InvoiceData | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [itemsToApply, setItemsToApply] = useState<EditableInvoiceItem[]>([]);
  const [globalMargin, setGlobalMargin] = useState<number>(30);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKeySettings, setShowApiKeySettings] = useState<boolean>(false);

  // Hidden File Inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load and sync AI scans count for this tenant
  useEffect(() => {
    if (isOpen && organizationId) {
      const localKey = `bodega_${organizationId}_ai_scans_count`;
      const cached = localStorage.getItem(localKey);
      if (cached !== null) {
        setScansUsed(parseInt(cached, 10) || 0);
      }
      getOrgAiScansCount(organizationId).then((count) => {
        setScansUsed(count);
      });
    }
  }, [isOpen, organizationId]);

  if (!isOpen) return null;

  // Handle image or PDF selection
  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    const isFilePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setIsPdf(isFilePdf);
    setFileMimeType(isFilePdf ? 'application/pdf' : file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = (event) => {
      setFilePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelected(file);
      onShowToast('Foto capturada correctamente', 'photo_camera');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelected(file);
      onShowToast(file.name.endsWith('.pdf') ? 'Documento PDF cargado' : 'Imagen seleccionada', 'attach_file');
    }
  };

  // Distributor Templates for 1-Click Testing
  const handleLoadTemplate = (type: 'polar' | 'pepsi' | 'local') => {
    setSelectedFile(null);
    setFilePreview(null);
    setIsPdf(false);

    if (type === 'polar') {
      setSupplierName('Empresas Polar C.A.');
      setInvoiceText(`EMPRESAS POLAR C.A. - DISTRIBUIDORA OCCIDENTE
FACTURA LEGAL / NOTA DE ENTREGA: #POL-99412
FECHA: ${new Date().toLocaleDateString('es-VE')}
CLIENTE: BODEGA LA MILAGROSA

DETALLE DE PRODUCTOS RECIBIDOS:
1. HARINA PAN BLANCA 1KG | CANTIDAD: 40 PAQUETES | COSTO UNITARIO: $0.98 USD
2. ARROZ MARY TRADICIONAL 1KG | CANTIDAD: 24 PAQUETES | COSTO UNITARIO: $1.12 USD
3. MARGARINA MAVESA 500G | CANTIDAD: 20 TARRINAS | COSTO UNITARIO: $1.75 USD
4. MALTIN POLAR BOTELLA 250ML | CANTIDAD: 48 BOTELLAS | COSTO UNITARIO: $0.62 USD
5. ACEITE VEGETAL VATEL 1L | CANTIDAD: 15 BOTELLAS | COSTO UNITARIO: $2.45 USD

TOTAL DESPACHO: $186.59 USD`);
      setActiveTab('text');
      onShowToast('Factura de Empresas Polar cargada', 'local_shipping');
    } else if (type === 'pepsi') {
      setSupplierName('Empresas PepsiCo Venezuela');
      setInvoiceText(`PEPSICO ALIMENTOS S.C.A. / PEPSI-COLA VENEZUELA
FACTURA FISCAL NRO: #PEP-88310
FECHA: ${new Date().toLocaleDateString('es-VE')}
DISTRIBUIDOR OFICIAL

ÍTEMS DESPACHADOS:
1. PEPSI COLA SABOR CLASICO 2 LITROS | CANT: 24 BOTELLAS | COSTO: $1.65 USD
2. REFRESCO 7UP LIMA LIMON 1.5L | CANT: 18 BOTELLAS | COSTO: $1.40 USD
3. SNACK DORITOS MEGA QUESO 145G | CANT: 20 PAQUETES | COSTO: $1.25 USD
4. PAPAS FRITAS RUFFLES DE QUESO 130G | CANT: 15 PAQUETES | COSTO: $1.30 USD
5. BEBIDA GATORADE MANDARINA 500ML | CANT: 12 BOTELLAS | COSTO: $1.10 USD

TOTAL GUIA: $127.35 USD`);
      setActiveTab('text');
      onShowToast('Factura de PepsiCo Venezuela cargada', 'local_shipping');
    } else {
      setSupplierName('Distribuidora Central de Víveres');
      setInvoiceText(`DISTRIBUIDORA CENTRAL DE VIVERES C.A.
NOTA DE RECEPCION DE MERCANCIA #DMC-4401
FECHA: ${new Date().toLocaleDateString('es-VE')}

RELACION DE CARGA:
1. CAFE FAMA DE AMERICA 250G | CANTIDAD: 30 PAQUETES | COSTO: $1.80 USD
2. AZUCAR BLANCA MONTALBAN 1KG | CANTIDAD: 50 PAQUETES | COSTO: $1.05 USD
3. PASTA PRIMOR PLUMITAS 1KG | CANTIDAD: 24 PAQUETES | COSTO: $1.15 USD
4. MAYONESA MAVESA 445G | CANTIDAD: 12 FRASCOS | COSTO: $2.10 USD
5. ATUN DESMENUZADO EVEBA EN ACEITE 140G | CANTIDAD: 24 LATAS | COSTO: $1.20 USD

TOTAL RECIBIDO: $213.60 USD`);
      setActiveTab('text');
      onShowToast('Factura de Distribuidora Local cargada', 'local_shipping');
    }
  };

  // Main OpenAI gpt-4o-mini Vision Extraction Handler
  const handleAnalyzeWithAI = async () => {
    // 4. Aviso de Plan Pro (Freemium Gate Enforcement)
    if (isTrialLimitReached) {
      if (onOpenPaywallModal) {
        onOpenPaywallModal({
          title: '🔒 Alcanzaste el límite de tu versión de prueba (1/1 escaneo de facturas con IA)',
          subtitle:
            'Has probado la lectura inteligente de facturas. Actualiza al Plan Pro para escanear facturas ilimitadas de Polar, Pepsi y tus distribuidores, inventario ilimitado y recordatorios por WhatsApp.',
          badge: 'Límite de Prueba con IA (1/1)',
          reason: 'invoice_ai_limit'
        });
      } else {
        onShowToast('🔒 Has agotado tu escaneo de prueba con IA (1/1). Pasa al Plan Pro para escaneos ilimitados.', 'lock');
      }
      return;
    }

    const currentApiKey = getOpenAIApiKey();
    if (!currentApiKey) {
      setShowApiKeySettings(true);
      onShowToast('Por favor ingresa tu clave de OpenAI (VITE_OPENAI_API_KEY) para procesar la factura', 'vpn_key');
      return;
    }

    if (activeTab === 'text' && !invoiceText.trim()) {
      onShowToast('Por favor escribe o pega el texto de la factura de compra', 'warning');
      return;
    }

    if (activeTab === 'camera_file' && !filePreview && !selectedFile) {
      onShowToast('Toma una foto con la cámara o sube un archivo (imagen o PDF)', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      let imageBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;
      let currentDataUrl: string | undefined = filePreview || undefined;

      // Si tenemos selectedFile pero filePreview aún no terminó de cargar
      if (selectedFile) {
        if (!currentDataUrl) {
          currentDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        }
        if (currentDataUrl && currentDataUrl.includes(',')) {
          const parts = currentDataUrl.split(',');
          imageBase64 = parts[1];
          mimeType = selectedFile.type || fileMimeType || 'image/jpeg';
        }
      } else if (filePreview && filePreview.includes(',')) {
        const parts = filePreview.split(',');
        imageBase64 = parts[1];
        mimeType = fileMimeType || (isPdf ? 'application/pdf' : 'image/jpeg');
      }

      const payload = {
        text: invoiceText.trim() || undefined,
        dataUrl: currentDataUrl,
        imageBase64,
        mimeType,
        exchangeRate,
        catalog: catalog.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          costUSD: c.costUSD,
          priceUSD: c.priceUSD,
          unit: c.unit,
          category: c.category,
          currentStock: c.currentStock
        }))
      };

      // Send to OpenAI gpt-4o-mini with response_format json_object
      const data = await processInvoiceWithOpenAI(payload);

      // Successfully processed! Increment trial scans counter
      const newScanCount = await incrementOrgAiScansCount(organizationId);
      setScansUsed(newScanCount);

      const detectedSupplier = data.supplier || supplierName || 'Distribuidor Mayorista';
      setSupplierName(detectedSupplier);

      // Match items to catalog & apply margins
      const enrichedItems: EditableInvoiceItem[] = (data.items || []).map((item) => {
        const cost = Number((item.costUSD || 1.0).toFixed(2));
        const costInBs = Number((cost * exchangeRate).toFixed(2));
        const margin = item.marginPercent || globalMargin;
        const suggestedUSD = Number((cost * (1 + margin / 100)).toFixed(2));
        const suggestedBs = Number((suggestedUSD * exchangeRate).toFixed(2));

        // Catalog lookup
        const matched = catalog.find(
          (c) =>
            (item.productId && c.id === item.productId) ||
            (item.productCode && c.code.toLowerCase() === item.productCode.toLowerCase()) ||
            c.name.toLowerCase().trim() === item.productName.toLowerCase().trim()
        );

        return {
          ...item,
          productId: matched?.id || item.productId,
          productCode: matched?.code || item.productCode,
          costUSD: cost,
          costBs: costInBs,
          marginPercent: margin,
          suggestedPriceUSD: suggestedUSD,
          suggestedPriceBs: suggestedBs,
          selected: true,
          isNewProduct: !matched,
          matchedProduct: matched,
          unit: item.unit || matched?.unit || 'paq.',
          category: matched?.category || item.category || 'Víveres Secos'
        };
      });

      setExtractedData(data);
      setItemsToApply(enrichedItems);

      const aiLabel = data.source === 'openai' ? 'OpenAI gpt-4o-mini' : 'Servidor IA';
      onShowToast(
        `¡${aiLabel} completada! Se identificaron ${enrichedItems.length} productos reales de ${detectedSupplier}.`,
        'auto_awesome'
      );
    } catch (error: any) {
      console.error('[OpenAI Error]', error);
      onShowToast(error?.message || 'Error al analizar la factura con OpenAI', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Item field editing handlers
  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    setItemsToApply((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, quantity: Math.max(1, newQty) } : item))
    );
  };

  const handleUpdateItemCostUSD = (index: number, newCost: number) => {
    setItemsToApply((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const cost = Math.max(0.01, newCost);
          const costBs = Number((cost * exchangeRate).toFixed(2));
          const suggestedUSD = Number((cost * (1 + item.marginPercent / 100)).toFixed(2));
          const suggestedBs = Number((suggestedUSD * exchangeRate).toFixed(2));
          return {
            ...item,
            costUSD: cost,
            costBs,
            suggestedPriceUSD: suggestedUSD,
            suggestedPriceBs: suggestedBs
          };
        }
        return item;
      })
    );
  };

  const handleUpdateItemMargin = (index: number, newMargin: number) => {
    setItemsToApply((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const margin = Math.max(0, newMargin);
          const suggestedUSD = Number((item.costUSD * (1 + margin / 100)).toFixed(2));
          const suggestedBs = Number((suggestedUSD * exchangeRate).toFixed(2));
          return {
            ...item,
            marginPercent: margin,
            suggestedPriceUSD: suggestedUSD,
            suggestedPriceBs: suggestedBs
          };
        }
        return item;
      })
    );
  };

  const handleUpdateItemPriceUSD = (index: number, newPrice: number) => {
    setItemsToApply((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const priceUSD = Math.max(0.01, newPrice);
          const priceBs = Number((priceUSD * exchangeRate).toFixed(2));
          const margin = item.costUSD > 0 ? Number((((priceUSD - item.costUSD) / item.costUSD) * 100).toFixed(1)) : 30;
          return {
            ...item,
            suggestedPriceUSD: priceUSD,
            suggestedPriceBs: priceBs,
            marginPercent: margin
          };
        }
        return item;
      })
    );
  };

  const handleApplyGlobalMargin = (margin: number) => {
    setGlobalMargin(margin);
    setItemsToApply((prev) =>
      prev.map((item) => {
        const suggestedUSD = Number((item.costUSD * (1 + margin / 100)).toFixed(2));
        const suggestedBs = Number((suggestedUSD * exchangeRate).toFixed(2));
        return {
          ...item,
          marginPercent: margin,
          suggestedPriceUSD: suggestedUSD,
          suggestedPriceBs: suggestedBs
        };
      })
    );
    onShowToast(`Margen del ${margin}% aplicado a todos los productos`, 'percent');
  };

  const handleToggleSelect = (index: number) => {
    setItemsToApply((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setItemsToApply((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  // Final Action: Apply arrivals to inventory
  const handleConfirmAndApply = async () => {
    const selected = itemsToApply.filter((i) => i.selected && i.quantity > 0);
    if (selected.length === 0) {
      onShowToast('Selecciona al menos 1 producto para incorporar al inventario', 'warning');
      return;
    }

    setIsApplying(true);
    try {
      await onApplyInvoice(selected, supplierName);
      onShowToast(
        `¡Inventario actualizado! Stock y costos guardados para ${selected.length} productos.`,
        'check_circle'
      );
      onClose();
    } catch (e: any) {
      console.error(e);
      onShowToast(e.message || 'Error al guardar productos en el inventario', 'error');
    } finally {
      setIsApplying(false);
    }
  };

  // Metrics
  const selectedItems = itemsToApply.filter((i) => i.selected);
  const selectedCount = selectedItems.length;
  const existingMatchesCount = selectedItems.filter((i) => !i.isNewProduct).length;
  const newProductsCount = selectedItems.filter((i) => i.isNewProduct).length;
  const totalCostUSD = selectedItems.reduce((acc, i) => acc + i.quantity * i.costUSD, 0);
  const totalCostBs = totalCostUSD * exchangeRate;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-[#dbc2b0]/40 overflow-hidden flex flex-col my-auto max-h-[94vh]">
        
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 bg-gradient-to-r from-[#FAF8F5] via-white to-[#FAF8F5] border-b border-[#dbc2b0]/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#006c4a] to-[#00875c] text-white flex items-center justify-center font-bold shrink-0 shadow-md ring-4 ring-[#82f5c1]/30">
              <span className="material-symbols-outlined text-[24px]">document_scanner</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-heading font-black text-base sm:text-lg text-[#111c2d] tracking-tight leading-snug">
                  📷 Cargar Factura de Proveedor con IA
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#82f5c1]/40 text-[#00714e] text-[11px] font-black flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
                  OpenAI gpt-4o-mini
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiKeySettings(!showApiKeySettings)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    getOpenAIApiKey()
                      ? 'bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9]'
                      : 'bg-[#fff3e0] text-[#e65100] hover:bg-[#ffe0b2]'
                  }`}
                  title="Configurar clave de OpenAI (VITE_OPENAI_API_KEY)"
                >
                  <span className="material-symbols-outlined text-[12px]">vpn_key</span>
                  <span>{getOpenAIApiKey() ? 'API Key activa' : 'Ingresar API Key'}</span>
                </button>
                {isTrial && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isTrialLimitReached
                        ? 'bg-[#ffdad6] text-[#ba1a1a]'
                        : 'bg-[#ffdcc3] text-[#8d4b00]'
                    }`}
                  >
                    {isTrialLimitReached ? '1/1 Escaneos Usados (Prueba)' : '1 Escaneo de Prueba Gratis'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#554336] mt-0.5">
                Toma foto o sube factura (Polar, Pepsi, distribuidora local) para extraer productos, sumar stock y sugerir precios.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-9 h-9 rounded-xl bg-white text-[#554336] hover:text-[#111c2d] hover:bg-[#f0f3ff] flex items-center justify-center transition-colors shadow-xs border border-[#dbc2b0]/30 cursor-pointer"
            title="Cerrar (Esc)"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Banner de Configuración de API Key si se solicita o no está configurada */}
        {showApiKeySettings && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-[#fff8f0] border border-[#ffb77d] rounded-2xl flex flex-col sm:flex-row items-center gap-2 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 text-[#8d4b00] font-bold shrink-0">
              <span className="material-symbols-outlined text-[18px]">key</span>
              <span>Clave OpenAI (gpt-4o-mini):</span>
            </div>
            <input
              type="password"
              placeholder={getOpenAIApiKey() ? '••••••••••••••••••••••••••••••••' : 'sk-proj-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="flex-1 w-full px-3 py-1.5 bg-white border border-[#dbc2b0] rounded-xl text-xs font-mono focus:outline-none focus:border-[#006c4a]"
            />
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  if (apiKeyInput.trim()) {
                    setStoredOpenAIApiKey(apiKeyInput.trim());
                    setShowApiKeySettings(false);
                    onShowToast('Clave de OpenAI guardada exitosamente', 'check_circle');
                  }
                }}
                className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-[#006c4a] text-white font-bold hover:bg-[#00573b] cursor-pointer"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setShowApiKeySettings(false)}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-[#dbc2b0] text-[#554336] text-xs font-semibold hover:bg-[#f5f0eb] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Freemium Trial Status Alerts */}
          {isTrial && isTrialLimitReached && !extractedData && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#ffdad6]/50 via-[#fff8f2] to-white border border-[#ba1a1a]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ba1a1a] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">lock</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#111c2d]">
                    🔒 Alcanzaste el límite de tu versión de prueba (1/1 escaneo de facturas con IA)
                  </h4>
                  <p className="text-[11px] text-[#554336] mt-0.5">
                    Actualiza al <strong>Plan Pro</strong> para escanear facturas ilimitadas de Polar, Pepsi y tus distribuidores, además de catálogo sin límite.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenPaywallModal?.({
                    title: '🔒 Alcanzaste el límite de tu versión de prueba (1/1 escaneo de facturas con IA)',
                    subtitle:
                      'Actualiza al Plan Pro para escaneos ilimitados con IA de facturas de distribuidora (Polar, Pepsi, etc.), inventario sin límites y recordatorios por WhatsApp.',
                    badge: 'Límite de Prueba con IA (1/1)',
                    reason: 'invoice_ai_limit'
                  })
                }
                className="px-4 py-2 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-extrabold flex items-center gap-1.5 self-end sm:self-auto shadow-xs cursor-pointer whitespace-nowrap active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
                Actualizar a Plan Pro
              </button>
            </div>
          )}

          {isTrial && !isTrialLimitReached && !extractedData && (
            <div className="px-4 py-2.5 rounded-xl bg-[#85f8c4]/20 border border-[#82f5c1] flex items-center gap-2.5 text-xs text-[#00714e]">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>
                <strong>Modo Prueba Activo:</strong> Tienes <strong>1 escaneo de demostración gratuito</strong> para probar la extracción con IA de tus facturas reales.
              </span>
            </div>
          )}

          {/* STEP 1: Invoice Input (Capture Photo, Upload, Template or Text) */}
          {!extractedData && (
            <div className="space-y-4">
              
              {/* Navigation Tabs */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-[#dbc2b0]/20">
                <div className="flex items-center gap-1.5 p-1 bg-[#f0f3ff] rounded-2xl border border-[#dbc2b0]/30">
                  <button
                    type="button"
                    onClick={() => setActiveTab('camera_file')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'camera_file'
                        ? 'bg-[#006c4a] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                    <span>Cámara / Subir Archivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('templates')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'templates'
                        ? 'bg-[#006c4a] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                    <span>Distribuidores de Prueba</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'text'
                        ? 'bg-[#006c4a] text-white shadow-xs'
                        : 'text-[#554336] hover:text-[#111c2d]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">description</span>
                    <span>Texto / Transcripción</span>
                  </button>
                </div>

                <div className="text-[11px] text-[#554336] font-semibold flex items-center gap-1">
                  <span>Tasa BCV de cálculo:</span>
                  <span className="font-numeric-tally font-bold text-[#006c4a] bg-white px-2 py-0.5 rounded-lg border border-[#dbc2b0]/30">
                    {exchangeRate.toFixed(2)} Bs/$
                  </span>
                </div>
              </div>

              {/* Tab 1: Camera & File Upload */}
              {activeTab === 'camera_file' && (
                <div className="space-y-4">
                  {/* Two Main Prominent Action Cards: Camera & File */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Camera Button */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="p-5 rounded-2xl bg-gradient-to-br from-[#006c4a]/5 via-white to-[#82f5c1]/10 border-2 border-dashed border-[#006c4a]/40 hover:border-[#006c4a] transition-all flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer group hover:shadow-md active:scale-98"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#006c4a] text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                        <span className="material-symbols-outlined text-[26px]">photo_camera</span>
                      </div>
                      <div>
                        <h4 className="font-black text-xs sm:text-sm text-[#111c2d] flex items-center justify-center gap-1.5">
                          <span>Tomar Foto con la Cámara</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#82f5c1] text-[#00714e] font-bold">
                            Móvil
                          </span>
                        </h4>
                        <p className="text-[11px] text-[#554336] mt-0.5">
                          Apunta tu teléfono a la factura física o nota de entrega del camión.
                        </p>
                      </div>
                    </button>

                    {/* File / PDF Upload Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-5 rounded-2xl bg-gradient-to-br from-[#8d4b00]/5 via-white to-[#ffdcc3]/10 border-2 border-dashed border-[#8d4b00]/40 hover:border-[#8d4b00] transition-all flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer group hover:shadow-md active:scale-98"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#8d4b00] text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                        <span className="material-symbols-outlined text-[26px]">upload_file</span>
                      </div>
                      <div>
                        <h4 className="font-black text-xs sm:text-sm text-[#111c2d] flex items-center justify-center gap-1.5">
                          <span>Subir Imagen o Documento PDF</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ffdcc3] text-[#8d4b00] font-bold">
                            PDF / JPG / PNG
                          </span>
                        </h4>
                        <p className="text-[11px] text-[#554336] mt-0.5">
                          Sube un PDF descargado de distribuidora o captura de WhatsApp.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Hidden inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCameraChange}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {/* Document Preview Card if File is selected */}
                  {filePreview && (
                    <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#dbc2b0]/50 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-200">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {isPdf ? (
                          <div className="w-14 h-14 rounded-2xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0 shadow-xs">
                            <span className="material-symbols-outlined text-[30px]">picture_as_pdf</span>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#dbc2b0]/50 bg-white shrink-0 shadow-xs">
                            <img
                              src={filePreview}
                              alt="Factura"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#111c2d] truncate">
                              {selectedFile?.name || 'Documento de Factura'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#82f5c1]/50 text-[#00714e] text-[10px] font-black uppercase">
                              {isPdf ? 'PDF Listo' : 'Foto Lista'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#554336] mt-0.5">
                            Tamaño: {(Number(selectedFile?.size || 0) / 1024).toFixed(1)} KB • Listo para procesar con OpenAI gpt-4o-mini
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setFilePreview(null);
                            setIsPdf(false);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white text-[#ba1a1a] text-xs font-bold border border-[#ba1a1a]/30 hover:bg-[#ffdad6]/40 transition-colors cursor-pointer"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Distributor Presets (Polar, Pepsi, Local) */}
              {activeTab === 'templates' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-[#554336] block">
                    Selecciona una factura de ejemplo de proveedores venezolanos para probar de inmediato:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Polar */}
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('polar')}
                      className="p-4 rounded-2xl bg-white hover:bg-[#FAF8F5] border-2 border-[#dbc2b0]/40 hover:border-[#006c4a] transition-all text-left flex flex-col justify-between gap-3 shadow-xs cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-[#006c4a]/10 text-[#006c4a] flex items-center justify-center font-black text-sm">
                          POL
                        </div>
                        <span className="material-symbols-outlined text-[#006c4a] text-[20px] group-hover:translate-x-1 transition-transform">
                          arrow_forward
                        </span>
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-[#111c2d]">Empresas Polar C.A.</h4>
                        <p className="text-[11px] text-[#554336] mt-0.5">
                          Harina PAN, Arroz Mary, Margarina Mavesa, Maltín Polar, Aceite Vatel.
                        </p>
                      </div>
                      <span className="text-[10px] font-black text-[#006c4a] uppercase">5 Productos • $186.59</span>
                    </button>

                    {/* Pepsi */}
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('pepsi')}
                      className="p-4 rounded-2xl bg-white hover:bg-[#FAF8F5] border-2 border-[#dbc2b0]/40 hover:border-[#006c4a] transition-all text-left flex flex-col justify-between gap-3 shadow-xs cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-[#004e92]/10 text-[#004e92] flex items-center justify-center font-black text-sm">
                          PEP
                        </div>
                        <span className="material-symbols-outlined text-[#004e92] text-[20px] group-hover:translate-x-1 transition-transform">
                          arrow_forward
                        </span>
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-[#111c2d]">PepsiCo Venezuela</h4>
                        <p className="text-[11px] text-[#554336] mt-0.5">
                          Pepsi Cola 2L, 7Up 1.5L, Doritos Queso, Ruffles, Gatorade 500ml.
                        </p>
                      </div>
                      <span className="text-[10px] font-black text-[#004e92] uppercase">5 Productos • $127.35</span>
                    </button>

                    {/* Distribuidora Local */}
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('local')}
                      className="p-4 rounded-2xl bg-white hover:bg-[#FAF8F5] border-2 border-[#dbc2b0]/40 hover:border-[#8d4b00] transition-all text-left flex flex-col justify-between gap-3 shadow-xs cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-[#8d4b00]/10 text-[#8d4b00] flex items-center justify-center font-black text-sm">
                          DIS
                        </div>
                        <span className="material-symbols-outlined text-[#8d4b00] text-[20px] group-hover:translate-x-1 transition-transform">
                          arrow_forward
                        </span>
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-[#111c2d]">Distribuidora Local</h4>
                        <p className="text-[11px] text-[#554336] mt-0.5">
                          Café Fama de América, Azúcar Montalbán, Pasta Primor, Mayonesa.
                        </p>
                      </div>
                      <span className="text-[10px] font-black text-[#8d4b00] uppercase">5 Productos • $213.60</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Text Input */}
              {activeTab === 'text' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#554336]">
                      Texto, transcripción o mensaje de WhatsApp de la factura:
                    </label>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('polar')}
                      className="text-[11px] text-[#8d4b00] font-bold hover:underline"
                    >
                      Cargar ejemplo de Polar
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={invoiceText}
                    onChange={(e) => setInvoiceText(e.target.value)}
                    placeholder="Pega aquí el detalle de la factura. Ejemplo:
Empresas Polar - Factura #1234
40 Harina PAN 1kg a $0.98 c/u
24 Arroz Mary 1kg a $1.12 c/u
20 Margarina Mavesa 500g a $1.75 c/u..."
                    className="w-full p-4 rounded-2xl bg-[#FAF8F5] text-[#111c2d] text-xs font-mono border border-[#dbc2b0]/40 focus:outline-none focus:ring-2 focus:ring-[#006c4a] focus:bg-white leading-relaxed"
                  />
                </div>
              )}

              {/* Action Button: Analyze with Gemini */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-[11px] text-[#554336]">
                  {isTrialLimitReached ? (
                    <span className="text-[#ba1a1a] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">lock</span>
                      Escaneo de prueba agotado (1/1). Actualiza al Plan Pro.
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#00714e] font-semibold">
                      <span className="material-symbols-outlined text-[15px]">bolt</span>
                      Extracción en tiempo real con OpenAI gpt-4o-mini
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAnalyzeWithAI}
                  disabled={isProcessing}
                  className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                    isTrialLimitReached
                      ? 'bg-[#ba1a1a] hover:bg-[#93000a] text-white'
                      : 'bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isProcessing ? 'animate-spin' : ''}`}>
                    {isProcessing ? 'sync' : isTrialLimitReached ? 'lock' : 'auto_awesome'}
                  </span>
                  <span>
                    {isProcessing
                      ? 'Analizando con OpenAI gpt-4o-mini...'
                      : isTrialLimitReached
                      ? 'Desbloquear con Plan Pro'
                      : 'Analizar Factura con IA'}
                  </span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 2: Interactive Review and Confirmation Table */}
          {extractedData && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Pro Banner Celebration after trial scan */}
              {isTrial && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#ffdcc3] via-[#fff1e5] to-white border border-[#8d4b00]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#8d4b00] text-[22px]">celebration</span>
                    <div>
                      <div className="text-xs font-black text-[#111c2d]">
                        🎉 ¡1.° Escaneo de prueba completado con éxito!
                      </div>
                      <div className="text-[11px] text-[#554336]">
                        Has utilizado tu escaneo de demostración. Actualiza al <strong>Plan Pro</strong> para escanear facturas sin límites y sin tope de 5 productos.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPaywallModal?.({
                        title: '🔒 Actualiza al Plan Pro para Escaneos Ilimitados',
                        subtitle:
                          'Disfruta de inventario sin tope de productos, lectura ilimitada de facturas de distribuidores con IA y cobranza por WhatsApp.',
                        badge: 'Plan Pro Recomendado',
                        reason: 'invoice_ai_limit'
                      })
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-[#8d4b00] hover:bg-[#b15f00] text-white text-xs font-black self-end sm:self-auto cursor-pointer shadow-xs active:scale-95"
                  >
                    Actualizar a Pro
                  </button>
                </div>
              )}

              {/* Supplier & Invoice Header Banner */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#dbc2b0]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#006c4a] text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[22px]">local_shipping</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[#554336] uppercase tracking-wider block">
                      Proveedor / Distribuidora Detectada:
                    </label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="font-heading font-black text-sm text-[#111c2d] bg-transparent border-b border-[#006c4a]/40 focus:border-[#006c4a] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-xs text-[#554336]">
                  {extractedData.invoiceNumber && (
                    <span className="px-2.5 py-1 bg-white rounded-lg border border-[#dbc2b0]/30 font-mono font-bold text-[#111c2d]">
                      Doc: {extractedData.invoiceNumber}
                    </span>
                  )}
                  {extractedData.date && (
                    <span className="px-2.5 py-1 bg-white rounded-lg border border-[#dbc2b0]/30 font-semibold text-[#554336]">
                      {extractedData.date}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setExtractedData(null);
                      setSelectedFile(null);
                      setFilePreview(null);
                    }}
                    className="text-[#006c4a] font-black hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">refresh</span>
                    Escanear Otra
                  </button>
                </div>
              </div>

              {/* Profit Margin Quick Selector Bar */}
              <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#006c4a] text-[18px]">trending_up</span>
                  <span className="text-xs font-bold text-[#111c2d]">
                    Margen de Ganancia Sugerido (sobre costo):
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[25, 30, 35, 40].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleApplyGlobalMargin(m)}
                      className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        globalMargin === m
                          ? 'bg-[#006c4a] text-white shadow-xs'
                          : 'bg-[#f0f3ff] text-[#554336] hover:bg-[#e7eeff]'
                      }`}
                    >
                      {m}% {m === 30 && '(Recomendado)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Controls (Select All / Unselect All) */}
              <div className="flex items-center justify-between text-xs text-[#554336] px-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-[#006c4a] font-bold hover:underline cursor-pointer"
                  >
                    Seleccionar todos
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="text-[#554336] font-semibold hover:underline cursor-pointer"
                  >
                    Deseleccionar
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-md bg-[#82f5c1]/40 text-[#00714e]">
                    {existingMatchesCount} en inventario (sumarán stock)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#ffdcc3] text-[#8d4b00]">
                    {newProductsCount} productos nuevos
                  </span>
                </div>
              </div>

              {/* Main Items Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF8F5] text-[#554336] uppercase font-black text-[11px] tracking-wider border-b border-[#E8E2D8]">
                      <th className="py-3 px-3 text-center w-10">Incluir</th>
                      <th className="py-3 px-3 min-w-[220px]">Nombre del Producto</th>
                      <th className="py-3 px-3 text-center min-w-[120px]">Cantidad Comprada</th>
                      <th className="py-3 px-3 text-right min-w-[130px]">Costo Unit. ($ USD / Bs)</th>
                      <th className="py-3 px-3 text-center min-w-[90px]">Margen</th>
                      <th className="py-3 px-3 text-right min-w-[140px]">Precio Venta Sugerido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EBE3] text-[#111c2d]">
                    {itemsToApply.map((item, idx) => {
                      const matched = item.matchedProduct;
                      const newStockExpected = (matched?.currentStock || 0) + item.quantity;

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-[#FAF8F5]/80 transition-colors ${
                            !item.selected ? 'opacity-40 bg-gray-50' : 'bg-white'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => handleToggleSelect(idx)}
                              className="w-4 h-4 rounded text-[#006c4a] accent-[#006c4a] cursor-pointer"
                            />
                          </td>

                          {/* Product Name & Status */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col min-w-0">
                              <input
                                type="text"
                                value={item.productName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setItemsToApply((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, productName: val } : it))
                                  );
                                }}
                                className="font-bold text-[#111c2d] bg-transparent hover:bg-[#FAF8F5] px-1 py-0.5 rounded border border-transparent hover:border-[#dbc2b0]/30 focus:border-[#006c4a] focus:outline-none"
                              />

                              <div className="flex items-center gap-1.5 text-[10px] text-[#554336] mt-1 flex-wrap">
                                {matched ? (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#82f5c1]/40 text-[#00714e] font-extrabold flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">inventory</span>
                                    En Catálogo (Stock: {matched.currentStock} ➔ {newStockExpected})
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#ffdcc3] text-[#8d4b00] font-extrabold flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">add_circle</span>
                                    Nuevo Producto (+{item.quantity} stock)
                                  </span>
                                )}
                                <span>•</span>
                                <span className="font-semibold text-[#554336]">{item.category}</span>
                              </div>
                            </div>
                          </td>

                          {/* Quantity */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1 bg-[#FAF8F5] px-2 py-1 rounded-xl border border-[#dbc2b0]/40 font-numeric-tally font-bold">
                              <span className="text-[#006c4a]">+</span>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                                className="w-14 bg-transparent text-center font-black text-xs focus:outline-none"
                              />
                              <span className="text-[10px] text-[#554336] font-semibold">{item.unit || 'paq.'}</span>
                            </div>
                          </td>

                          {/* Cost USD & Bs */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex flex-col items-end">
                              <div className="inline-flex items-center gap-1">
                                <span className="text-[#554336] font-bold">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.costUSD}
                                  onChange={(e) => handleUpdateItemCostUSD(idx, parseFloat(e.target.value) || 0)}
                                  className="w-16 text-right font-numeric-tally font-black text-xs bg-[#FAF8F5] px-1.5 py-0.5 rounded-lg border border-[#dbc2b0]/40 focus:border-[#006c4a] focus:outline-none"
                                />
                              </div>
                              <span className="text-[10px] font-numeric-tally font-semibold text-[#554336] mt-0.5">
                                ≈ {item.costBs.toFixed(2)} Bs
                              </span>
                            </div>
                          </td>

                          {/* Margin % */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center justify-center gap-0.5 bg-white px-1.5 py-0.5 rounded-lg border border-[#dbc2b0]/40 font-numeric-tally">
                              <input
                                type="number"
                                min="0"
                                value={item.marginPercent}
                                onChange={(e) => handleUpdateItemMargin(idx, parseFloat(e.target.value) || 0)}
                                className="w-10 text-center font-bold text-xs focus:outline-none"
                              />
                              <span className="text-[10px] text-[#554336] font-bold">%</span>
                            </div>
                          </td>

                          {/* Suggested Price USD & Bs */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex flex-col items-end">
                              <div className="inline-flex items-center gap-1">
                                <span className="text-[#006c4a] font-black">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.suggestedPriceUSD}
                                  onChange={(e) => handleUpdateItemPriceUSD(idx, parseFloat(e.target.value) || 0)}
                                  className="w-16 text-right font-numeric-tally font-black text-xs bg-white px-1.5 py-0.5 rounded-lg border border-[#006c4a] text-[#006c4a] focus:outline-none shadow-2xs"
                                />
                              </div>
                              <span className="text-[10px] font-numeric-tally font-black text-[#006c4a] mt-0.5">
                                {item.suggestedPriceBs.toFixed(2)} Bs
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total Summary Footer Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#82f5c1]/20 via-[#FAF8F5] to-[#82f5c1]/10 border border-[#82f5c1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#006c4a] text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">inventory_2</span>
                  </div>
                  <div>
                    <div className="text-xs font-black text-[#111c2d]">
                      Resumen: {selectedCount} productos seleccionados para ingresar
                    </div>
                    <div className="text-[11px] text-[#554336]">
                      {existingMatchesCount} sumarán existencias al stock actual • {newProductsCount} se registrarán como nuevos
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#554336] uppercase font-black tracking-wider block">
                    Costo Total de la Factura:
                  </span>
                  <div className="text-base font-black text-[#111c2d] font-numeric-tally leading-tight">
                    ${totalCostUSD.toFixed(2)} USD{' '}
                    <span className="text-xs font-black text-[#006c4a]">
                      (≈ {totalCostBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Action Footer */}
        <div className="px-5 py-4 sm:px-6 bg-[#FAF8F5] border-t border-[#dbc2b0]/30 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-[#554336] hover:text-[#111c2d] hover:bg-white text-xs font-bold transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {extractedData && (
            <button
              type="button"
              onClick={handleConfirmAndApply}
              disabled={isApplying || selectedCount === 0}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#006c4a] to-[#00875c] hover:from-[#00573b] hover:to-[#00704c] text-white text-xs font-black shadow-md hover:shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isApplying ? 'sync' : 'add_shopping_cart'}
              </span>
              <span>
                {isApplying
                  ? 'Guardando en Inventario...'
                  : `Aplicar al Inventario (${selectedCount} productos)`}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
