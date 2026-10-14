/**
 * Servicio de Gestión y Actualización Automática de Tasa Cambiaria Oficial (BCV)
 * Consulta en tiempo real la tasa oficial en Venezuela y programa revisiones a las 9:00 AM y 2:00 PM.
 */

// Tasa base de referencia inicial establecida en 877.90 Bs / USD
export const DEFAULT_BCV_RATE = 877.90;

export interface ExchangeRateData {
  rate: number;
  lastUpdated: string;
  source: string;
  success: boolean;
  rawDate?: string;
}

const PRIMARY_BCV_API = 'https://ve.dolarapi.com/v1/dolares/oficial';
const SLOT_STORAGE_KEY = 'cuaderno_digital_bcv_last_slot';

/**
 * Consulta la tasa oficial del BCV en tiempo real.
 */
export async function fetchOfficialBCVRate(): Promise<ExchangeRateData> {
  const timeNow = new Date().toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(PRIMARY_BCV_API, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const rawRate = Number(data?.promedio || data?.venta || data?.compra);
      if (!isNaN(rawRate) && rawRate > 0) {
        // Redondear a 2 decimales para precisión contable
        const parsedRate = Number(rawRate.toFixed(2));
        return {
          rate: parsedRate,
          lastUpdated: timeNow,
          source: 'BCV Oficial (DolarAPI)',
          success: true,
          rawDate: data?.fechaActualizacion
        };
      }
    }
  } catch (error) {
    console.warn('[ExchangeRateService] Error al consultar API de tasa oficial:', error);
  }

  // Fallback seguro a la tasa base de referencia
  return {
    rate: DEFAULT_BCV_RATE,
    lastUpdated: timeNow,
    source: 'Tasa Base Inicial (877.90 Bs/USD)',
    success: false
  };
}

/**
 * Obtiene el identificador del turno de actualización (9:00 AM o 2:00 PM) para el día actual.
 * Retorna null si aún no se ha alcanzado la primera hora de corte (antes de las 9:00 AM).
 */
export function getCurrentScheduleSlot(): { slotId: string; slotName: string } | null {
  const now = new Date();
  
  // Extraer hora y fecha en la zona horaria de Venezuela (America/Caracas, UTC-4)
  const dateStr = now.toLocaleDateString('es-VE', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const hour = parseInt(
    now.toLocaleTimeString('en-US', {
      timeZone: 'America/Caracas',
      hour: 'numeric',
      hour12: false
    }),
    10
  );

  if (hour >= 14) {
    // Turno de la tarde: 2:00 PM
    return {
      slotId: `${dateStr}_14PM`,
      slotName: '2:00 PM'
    };
  } else if (hour >= 9) {
    // Turno de la mañana: 9:00 AM
    return {
      slotId: `${dateStr}_09AM`,
      slotName: '9:00 AM'
    };
  }

  // Antes de las 9:00 AM
  return null;
}

/**
 * Verifica si es necesario ejecutar la actualización programada automática de las 9:00 AM o 2:00 PM.
 */
export async function checkAndTriggerScheduledUpdate(
  onUpdateCallback: (rate: number, timeStr: string, isAuto: boolean) => Promise<void>
): Promise<boolean> {
  const slot = getCurrentScheduleSlot();
  if (!slot) return false;

  const lastExecutedSlot = localStorage.getItem(SLOT_STORAGE_KEY);
  if (lastExecutedSlot === slot.slotId) {
    // Este turno ya fue actualizado hoy
    return false;
  }

  // Ejecutar actualización automática del turno
  console.log(`[ExchangeRateService] ⏰ Ejecutando actualización automática programada de las ${slot.slotName}...`);
  const data = await fetchOfficialBCVRate();
  
  localStorage.setItem(SLOT_STORAGE_KEY, slot.slotId);
  const timeFormatted = `${slot.slotName} (${data.lastUpdated})`;
  await onUpdateCallback(data.rate, timeFormatted, true);
  return true;
}

/**
 * Inicia el temporizador de verificación automática en segundo plano (cada 60 segundos).
 */
export function initExchangeRateScheduler(
  onUpdateCallback: (rate: number, timeStr: string, isAuto: boolean) => Promise<void>
): () => void {
  // Ejecutar una verificación inmediata al iniciar
  checkAndTriggerScheduledUpdate(onUpdateCallback).catch(console.error);

  // Intervalo periódico cada 60 segundos
  const intervalId = setInterval(() => {
    checkAndTriggerScheduledUpdate(onUpdateCallback).catch(console.error);
  }, 60000);

  return () => {
    clearInterval(intervalId);
  };
}
