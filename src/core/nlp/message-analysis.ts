import type {
  ConfiguracionNegocio,
  ExtractedEntities,
  ServiceCatalogEntry,
} from '../types.js';
import { assertValidatedBusinessConfig } from '../../config/load-config.js';
import {
  detectIntentDetailed,
  type DetailedIntentDetection,
} from './intent-detector.js';
import { extractEntities } from './entity-extractor.js';
import { toServiceCatalog } from './service-catalog.js';
import {
  correctSpelling,
  type SpellingCorrectionResult,
} from './spelling-corrector.js';

export interface MessageAnalysisOptions {
  lastBotQuestion?: string;
  now?: Date;
  timeZone?: string;
}

export interface MessageAnalysis {
  // Catálogo operativo que recibieron el detector y el extractor.
  catalog: ServiceCatalogEntry[];
  detection: DetailedIntentDetection;
  entities: ExtractedEntities;
  // Correcciones ortográficas aplicadas antes de detectar y extraer.
  spelling: SpellingCorrectionResult;
}

/**
 * Analiza un mensaje con un catálogo explícito.
 *
 * El mismo arreglo se pasa al detector y al extractor: no se derivan dos
 * catálogos distintos dentro del análisis. `undefined` conserva el
 * comportamiento documentado del NLP cuando no hay catálogo.
 */
export function analyzeMessageWithCatalog(
  message: string,
  catalog: ServiceCatalogEntry[] | undefined,
  options: MessageAnalysisOptions = {},
): MessageAnalysis {
  const spelling = correctSpelling(message);
  const detection = detectIntentDetailed(spelling.text, {
    lastBotQuestion: options.lastBotQuestion,
    services: catalog,
  });
  const entities = extractEntities(spelling.text, {
    normalizedIntent: detection.normalized,
    services: catalog,
    now: options.now,
    timeZone: options.timeZone,
  });

  return { catalog: catalog ?? [], detection, entities, spelling };
}

/**
 * Analiza un mensaje usando la configuración canónica del negocio como única
 * fuente de verdad: el catálogo se deriva de `business.services` y solo
 * contiene servicios activos.
 */
export function analyzeMessage(
  message: string,
  business: ConfiguracionNegocio,
  options: MessageAnalysisOptions = {},
): MessageAnalysis {
  assertValidatedBusinessConfig(business);
  const catalog = toServiceCatalog(business.services);

  // Un catálogo operativo vacío equivale a "sin catálogo" para el NLP: se
  // conservan los marcos genéricos y no se inventa una resolución de servicio.
  return analyzeMessageWithCatalog(
    message,
    catalog.length > 0 ? catalog : undefined,
    {
      ...options,
      timeZone: options.timeZone ?? business.timezone,
    },
  );
}
