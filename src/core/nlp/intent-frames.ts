import type { ConversationIntent, ServiceCatalogEntry } from '../types.js';
import { normalizeIntent } from './normalize.js';
import { normalizeServiceName } from './service-matcher.js';

/**
 * Marcos de intención ("frames"): estructuras de lenguaje que dependen de la
 * configuración del negocio, no de un sector concreto.
 *
 * Un marco tiene la forma "verbo + ranura": la ranura es el hueco donde el
 * cliente menciona un servicio ("quiero un ___", "tienen ___", "cuánto cuesta
 * el ___"). La ranura se llena con los nombres y alias del catálogo, de modo
 * que el motor no necesita saber qué servicios existen.
 *
 * El marco NO resuelve el servicio: solo deja constancia de que la ranura
 * contiene un servicio configurado. La resolución (especificidad y
 * ambigüedad) sigue siendo responsabilidad de `matchService`, que usa el
 * extractor de entidades. Aquí no se duplica esa lógica.
 */

export type IntentFrameKind = 'booking' | 'services' | 'prices';

export interface IntentFrame {
  kind: IntentFrameKind;
  intent: ConversationIntent;
  /** Texto normalizado que activó el marco. */
  phrase: string;
  /** Rellenado de la ranura: nombre o alias del servicio detectado. */
  slot: string;
  /** true cuando la ranura proviene del catálogo configurado. */
  catalogBacked: boolean;
}

export interface IntentFrameDetection {
  frames: IntentFrame[];
  // Intenciones cuya evidencia de marco quedó anulada por una negación
  // explícita ("no quiero un corte").
  negatedIntents: ConversationIntent[];
}

const FRAME_INTENTS: Record<IntentFrameKind, ConversationIntent> = {
  booking: 'book-appointment',
  services: 'list-services',
  prices: 'check-prices',
};

// Verbos que abren cada marco. Son verbos de uso general: no nombran ningún
// servicio ni ningún sector.
const BOOKING_LEAD = 'quiero|necesito|quisiera|quiso|quise|deseo|me gustaria';
const SERVICES_LEAD =
  'tienen|manejan|hacen|trabajan|ofrecen|prestan|realizan';
const PRICES_LEAD = [
  'cuanto cuestan',
  'cuanto cuesta',
  'cuanto valen',
  'cuanto vale',
  'cuanto son',
  'cuanto es',
  'cuanto cobran',
  'cuanto cobra',
  'que precio tienen',
  'que precio tiene',
  'cual es el precio',
  'cual es la tarifa',
  'cual es el valor',
  'precio de',
  'precio del',
  'tarifa de',
  'tarifa del',
  'valor de',
  'valor del',
];

const ARTICLES = 'un|una|el|la|los|las';

// Palabras que nunca son el nombre de un servicio: conectores, verbos y
// conceptos de gestión (precios, horarios, presupuestos...). Sirven para que
// los marcos genéricos no disparen ante frases como "quiero un presupuesto".
const NON_SERVICE_HEADS = new Set<string>([
  // conectores y palabras funcionales
  'que',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'u',
  'para',
  'por',
  'con',
  'sin',
  'a',
  'al',
  'en',
  'lo',
  'le',
  'les',
  'mi',
  'mis',
  'tu',
  'tus',
  'su',
  'sus',
  'se',
  'si',
  'no',
  'ya',
  'mas',
  'muy',
  'todo',
  'toda',
  'todos',
  'todas',
  'algo',
  'nada',
  'esto',
  'eso',
  'ahi',
  'aqui',
  'tal',
  'vez',
  'bien',
  'mal',
  // verbos que no son servicios
  'saber',
  'sabe',
  'conocer',
  'ver',
  'hacer',
  'hecho',
  'pagar',
  'pagado',
  'cancelar',
  'agendar',
  'agendarla',
  'reservar',
  'reservarla',
  'programar',
  'programarla',
  'consultar',
  'solicitar',
  'pedir',
  'pedido',
  'dejar',
  'mandar',
  'enviar',
  'hablar',
  'preguntar',
  'pregunto',
  'mirar',
  'poner',
  'quitar',
  'buscar',
  'ayudar',
  'ayuda',
  // conceptos de gestión, no servicios
  'informacion',
  'detalle',
  'detalles',
  'opinion',
  'opiniones',
  'duda',
  'dudas',
  'pregunta',
  'preguntas',
  'referencia',
  'referencias',
  'recomendacion',
  'recomendaciones',
  'presupuesto',
  'cotizacion',
  'cotizar',
  'precio',
  'precios',
  'tarifa',
  'tarifas',
  'valor',
  'valores',
  'costo',
  'costos',
  'horario',
  'horarios',
  'disponibilidad',
  'fecha',
  'fechas',
  'dia',
  'dias',
  'numero',
  'telefono',
  'correo',
  'direccion',
  'nombre',
  'email',
  'trabajo',
  'casa',
  'oficina',
  'tienda',
  'nuevo',
  'nueva',
  'mismo',
  'misma',
  'otro',
  'otra',
]);

// Palabras de cita: son objetos de reserva, no servicios. En el marco de
// "servicios" estorban ("¿tienen cita?" no pregunta por el catálogo).
const APPOINTMENT_HEADS = new Set<string>([
  'cita',
  'citas',
  'turno',
  'turnos',
  'hora',
  'horas',
]);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NOT_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_AFTER = '(?![\\p{L}\\p{N}])';

interface FrameDefinition {
  kind: IntentFrameKind;
  regex: RegExp;
  // Filtro extra sobre la ranura (solo para los marcos genéricos).
  accept: (slot: string) => boolean;
  catalogBacked: boolean;
}

const buildFrameRegex = (
  lead: string,
  connector: string,
  slot: string,
): RegExp =>
  new RegExp(
    `${NOT_BEFORE}(?:${lead})${NOT_AFTER}\\s+${connector}(${slot})${NOT_AFTER}`,
    'gu',
  );

const runFrames = (
  message: string,
  definitions: FrameDefinition[],
): IntentFrameDetection => {
  const normalized = normalizeIntent(message);
  const frames: IntentFrame[] = [];
  const negatedIntents: ConversationIntent[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    for (const match of normalized.matchAll(definition.regex)) {
      const slot = (match[1] ?? '').trim();
      if (!slot) continue;
      if (!definition.accept(slot)) continue;

      // Negación inmediata: "no quiero un corte", "no hacen cortes".
      const before = normalized.slice(0, match.index ?? 0);
      const previousWord = before.split(/\s+/).filter(Boolean).pop() ?? '';
      if (previousWord === 'no' || previousWord === 'nunca') {
        const intent = FRAME_INTENTS[definition.kind];
        if (!negatedIntents.includes(intent)) negatedIntents.push(intent);
        continue;
      }

      const key = `${definition.kind}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      frames.push({
        kind: definition.kind,
        intent: FRAME_INTENTS[definition.kind],
        phrase: match[0],
        slot,
        catalogBacked: definition.catalogBacked,
      });
    }
  }

  return { frames, negatedIntents };
};

// Rellena la ranura con los nombres y alias del catálogo. Solo se usa como
// ranura: la resolución del servicio la hace `matchService`.
const catalogSlotPattern = (services: ServiceCatalogEntry[]): string => {
  const phrases = [
    ...new Set(
      services
        .flatMap((service) => [service.name, ...(service.aliases ?? [])])
        .map(normalizeServiceName)
        .filter((phrase) => phrase.length > 0),
    ),
  ].sort((left, right) => right.length - left.length);

  if (phrases.length === 0) return '';
  return `(?:${phrases.map(escapeRegExp).join('|')})`;
};

/**
 * Marcos dependientes del catálogo: la ranura solo se llena con servicios
 * configurados por el negocio. Es la vía recomendada en producción.
 */
export function detectCatalogFrames(
  message: string,
  services: ServiceCatalogEntry[],
): IntentFrameDetection {
  const slot = catalogSlotPattern(services);
  if (!slot) return { frames: [], negatedIntents: [] };

  const pricesLead = [...PRICES_LEAD].sort(
    (left, right) => right.length - left.length,
  ).join('|');

  return runFrames(message, [
    {
      kind: 'booking',
      regex: buildFrameRegex(
        BOOKING_LEAD,
        `(?:(?:${ARTICLES})\\s+)?`,
        slot,
      ),
      accept: () => true,
      catalogBacked: true,
    },
    {
      kind: 'services',
      regex: buildFrameRegex(
        SERVICES_LEAD,
        `(?:(?:${ARTICLES})\\s+)?`,
        slot,
      ),
      accept: () => true,
      catalogBacked: true,
    },
    {
      kind: 'prices',
      regex: buildFrameRegex(
        pricesLead,
        `(?:(?:${ARTICLES}|de|del)\\s+)?`,
        slot,
      ),
      accept: () => true,
      catalogBacked: true,
    },
  ]);
}

/**
 * Marcos genéricos: funcionan sin catálogo y reconocen la estructura de la
 * frase, pero no saben qué servicios existen. Se usan solo como respaldo
 * cuando ninguna regla de sinónimos aporta evidencia.
 */
export function detectGenericFrames(message: string): IntentFrameDetection {
  const slot = '[\\p{L}\\p{N}]+';

  return runFrames(message, [
    {
      kind: 'booking',
      // El artículo es obligatorio: sin él, "quiero saber..." no es una reserva.
      regex: buildFrameRegex(BOOKING_LEAD, `(?:${ARTICLES})\\s+`, slot),
      accept: (value) => !NON_SERVICE_HEADS.has(value),
      catalogBacked: false,
    },
    {
      kind: 'services',
      regex: buildFrameRegex(
        SERVICES_LEAD,
        `(?:(?:${ARTICLES})\\s+)?`,
        slot,
      ),
      accept: (value) =>
        !NON_SERVICE_HEADS.has(value) && !APPOINTMENT_HEADS.has(value),
      catalogBacked: false,
    },
  ]);
}
