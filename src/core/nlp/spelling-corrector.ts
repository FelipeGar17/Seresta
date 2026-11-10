/**
 * Corrección ortográfica segura (paso previo a intención y entidades).
 *
 * Flujo: mensaje original → correcciones seguras → detección de intención →
 * extracción de datos. Cada normalizador posterior sigue siendo responsable de
 * sus propias transformaciones; este módulo solo repara errores de escritura.
 *
 * Reglas para agregar correcciones:
 * - Solo palabras completas (nunca subcadenas) y sin ambigüedad: si el error
 *   puede ser otra palabra válida o un nombre propio, NO va aquí.
 * - No toca números, fechas, horas ni signos; esos son del extractor.
 * - No inventa datos: solo sustituye una forma errónea por su forma correcta.
 * - Cada regla necesita una prueba positiva y una negativa en
 *   `tests/core/nlp/spelling-corrector.test.ts`.
 */

export interface SpellingRule {
  // Identificador estable para diagnóstico y pruebas.
  id: string;
  // Formas erróneas en minúsculas; se comparan sin distinguir mayúsculas.
  wrong: readonly string[];
  // Forma correcta en minúsculas.
  right: string;
  // Por qué la corrección es segura (documentación para quien la revise).
  reason: string;
}

export interface AppliedCorrection {
  ruleId: string;
  from: string;
  to: string;
}

export interface SpellingCorrectionResult {
  original: string;
  // Texto corregido; igual al original si no se aplicó ninguna regla.
  text: string;
  applied: AppliedCorrection[];
}

export const SPELLING_RULES: readonly SpellingRule[] = [
  // --- Reglas existentes (se conservan) ---
  {
    id: 'double-vowel-las',
    wrong: ['laas', 'lass'],
    right: 'las',
    reason: 'Letra repetida por error al teclear; no es una palabra válida.',
  },
  {
    id: 'kiero-quiero',
    wrong: ['kiero', 'quirero', 'qiero'],
    right: 'quiero',
    reason: 'Escritura coloquial o errata de "quiero"; sin otro significado.',
  },

  // --- Reservas / citas ---
  {
    id: 'nesesito-necesito',
    wrong: ['nesesito', 'nesecito', 'necesitto', 'nesesitto'],
    right: 'necesito',
    reason: 'Confusión s/c y repetición de t; ninguna forma es palabra válida.',
  },
  {
    id: 'agendr-agendar',
    wrong: ['agendr', 'agendrar', 'agenar', 'agedar'],
    right: 'agendar',
    reason: 'Omisión, repetición o transposición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'reservr-reservar',
    wrong: ['reservr', 'reserbar', 'reservarr'],
    right: 'reservar',
    reason: 'Omisión/repetición de letras o confusión b/v; ninguna forma es palabra válida.',
  },
  {
    id: 'reserba-reserva',
    wrong: ['reserba'],
    right: 'reserva',
    reason: 'Confusión b/v; "reserba" no es palabra válida.',
  },
  {
    id: 'reserbas-reservas',
    wrong: ['reserbas'],
    right: 'reservas',
    reason: 'Confusión b/v en plural; "reserbas" no es palabra válida.',
  },
  {
    id: 'apartr-apartar',
    wrong: ['apartr', 'apatar', 'apartarr'],
    right: 'apartar',
    reason: 'Omisión o repetición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'sacr-sacar',
    wrong: ['sacr'],
    right: 'sacar',
    reason: 'Omisión de vocales; "sacr" no es palabra válida en este contexto.',
  },

  // --- Servicios ---
  {
    id: 'servisio-servicio',
    wrong: ['servisio', 'servico'],
    right: 'servicio',
    reason: 'Confusión s/c; ninguna forma es palabra válida. "Servico" como marca es un riesgo mínimo en este dominio.',
  },
  {
    id: 'servisios-servicios',
    wrong: ['servisios', 'servicos'],
    right: 'servicios',
    reason: 'Confusión s/c en plural; ninguna forma es palabra válida en este contexto.',
  },

  // --- Precios ---
  {
    id: 'presio-precio',
    wrong: ['presio'],
    right: 'precio',
    reason: 'Confusión s/c; "presio" no es palabra válida.',
  },
  {
    id: 'presios-precios',
    wrong: ['presios'],
    right: 'precios',
    reason: 'Confusión s/c en plural; "presios" no es palabra válida.',
  },
  {
    id: 'balor-valor',
    wrong: ['balor', 'valr'],
    right: 'valor',
    reason: 'Confusión b/v u omisión de vocal; ninguna forma es palabra válida en este contexto.',
  },
  {
    id: 'costoo-costo',
    wrong: ['costoo'],
    right: 'costo',
    reason: 'Repetición indebida de o; "costoo" no es palabra válida.',
  },
  {
    id: 'tarifaa-tarifa',
    wrong: ['tarifaa'],
    right: 'tarifa',
    reason: 'Repetición indebida de a; "tarifaa" no es palabra válida.',
  },
  {
    id: 'cuantoo-cuanto',
    wrong: ['cuantoo'],
    right: 'cuanto',
    reason: 'Repetición indebida de o; "cuantoo" no es palabra válida.',
  },
  {
    id: 'cuestaa-cuesta',
    wrong: ['cuestaa'],
    right: 'cuesta',
    reason: 'Repetición indebida de a; "cuestaa" no es palabra válida.',
  },
  {
    id: 'cuestann-cuestan',
    wrong: ['cuestann'],
    right: 'cuestan',
    reason: 'Repetición indebida de n; "cuestann" no es palabra válida.',
  },
  {
    id: 'cobrna-cobran',
    wrong: ['cobrna'],
    right: 'cobran',
    reason: 'Transposición de letras; "cobrna" no es palabra válida.',
  },
  {
    id: 'pagr-pagar',
    wrong: ['pagr', 'pagarr'],
    right: 'pagar',
    reason: 'Omisión o repetición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'efetivo-efectivo',
    wrong: ['efetivo'],
    right: 'efectivo',
    reason: 'Omisión de c; "efetivo" no es palabra válida.',
  },
  {
    id: 'trasferencia-transferencia',
    wrong: ['trasferencia'],
    right: 'transferencia',
    reason: 'Omisión de n; "trasferencia" no es palabra válida en español estándar.',
  },
  {
    id: 'descueto-descuento',
    wrong: ['descueto'],
    right: 'descuento',
    reason: 'Omisión de n; "descueto" no es palabra válida.',
  },

  // --- Disponibilidad ---
  {
    id: 'disponivilidad-disponibilidad',
    wrong: ['disponivilidad', 'disponiblidad', 'disponibilida'],
    right: 'disponibilidad',
    reason: 'Confusión v/b, omisión de i o de d final; ninguna forma es palabra válida.',
  },
  {
    id: 'disponivle-disponible',
    wrong: ['disponivle', 'disponiblie'],
    right: 'disponible',
    reason: 'Confusión v/b, omisión o transposición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'horaro-horario',
    wrong: ['horaro', 'orario', 'horarioo'],
    right: 'horario',
    reason: 'Omisión de i o de h, o repetición de o; ninguna forma es palabra válida.',
  },
  {
    id: 'orarios-horarios',
    wrong: ['orarios'],
    right: 'horarios',
    reason: 'Omisión de h en plural; "orarios" no es palabra válida.',
  },
  {
    id: 'espasio-espacio',
    wrong: ['espasio'],
    right: 'espacio',
    reason: 'Confusión s/c; "espasio" no es palabra válida.',
  },
  {
    id: 'espasios-espacios',
    wrong: ['espasios'],
    right: 'espacios',
    reason: 'Confusión s/c en plural; "espasios" no es palabra válida.',
  },
  {
    id: 'cupoo-cupo',
    wrong: ['cupoo'],
    right: 'cupo',
    reason: 'Repetición indebida de o; "cupoo" no es palabra válida.',
  },
  {
    id: 'cupoos-cupos',
    wrong: ['cupoos'],
    right: 'cupos',
    reason: 'Repetición indebida de o en plural; "cupoos" no es palabra válida.',
  },
  {
    id: 'turnno-turno',
    wrong: ['turnno'],
    right: 'turno',
    reason: 'Repetición indebida de n; "turnno" no es palabra válida.',
  },
  {
    id: 'atension-atencion',
    wrong: ['atension'],
    right: 'atencion',
    reason: 'Confusión s/c; "atension" no es palabra válida.',
  },
  {
    id: 'habren-abren',
    wrong: ['habren'],
    right: 'abren',
    reason: 'Adición indebida de h; "habren" no es palabra válida.',
  },
  {
    id: 'sierran-cierran',
    wrong: ['sierran'],
    right: 'cierran',
    reason: 'Confusión s/c; "sierran" no es palabra válida.',
  },
  {
    id: 'hueko-hueco',
    wrong: ['hueko'],
    right: 'hueco',
    reason: 'Sustitución de c por k; "hueko" no es palabra válida.',
  },

  // --- Cancelación ---
  {
    id: 'canselar-cancelar',
    wrong: ['canselar', 'canelar', 'cancelarr'],
    right: 'cancelar',
    reason: 'Confusión s/c, omisión de c o repetición de r; ninguna forma es palabra válida.',
  },
  {
    id: 'canselarlo-cancelarlo',
    wrong: ['canselarlo'],
    right: 'cancelarlo',
    reason: 'Confusión s/c con pronombre enclítico; "canselarlo" no es palabra válida.',
  },
  {
    id: 'canselarla-cancelarla',
    wrong: ['canselarla'],
    right: 'cancelarla',
    reason: 'Confusión s/c con pronombre enclítico; "canselarla" no es palabra válida.',
  },
  {
    id: 'anulr-anular',
    wrong: ['anulr'],
    right: 'anular',
    reason: 'Omisión de vocales; "anulr" no es palabra válida.',
  },
  {
    id: 'eliminr-eliminar',
    wrong: ['eliminr', 'eliminra'],
    right: 'eliminar',
    reason: 'Omisión o transposición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'borrrar-borrar',
    wrong: ['borrrar', 'borar'],
    right: 'borrar',
    reason: 'Repetición u omisión de r; en este contexto, "borar" no es palabra válida.',
  },
  {
    id: 'quitr-quitar',
    wrong: ['quitr', 'quiatr'],
    right: 'quitar',
    reason: 'Omisión o transposición de vocales; ninguna forma es palabra válida.',
  },
  {
    id: 'soltr-soltar',
    wrong: ['soltr', 'soltarr'],
    right: 'soltar',
    reason: 'Omisión o repetición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'liberr-liberar',
    wrong: ['liberr'],
    right: 'liberar',
    reason: 'Omisión de vocal y repetición de r; "liberr" no es palabra válida.',
  },

  // --- Reprogramación ---
  {
    id: 'reprogramr-reprogramar',
    wrong: ['reprogramr', 'reprogramra', 'reprogramarr'],
    right: 'reprogramar',
    reason: 'Omisión, transposición o repetición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'reagendr-reagendar',
    wrong: ['reagendr', 'reagendrar'],
    right: 'reagendar',
    reason: 'Omisión o repetición de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'postergr-postergar',
    wrong: ['postergr', 'postegar', 'postergarr'],
    right: 'postergar',
    reason: 'Omisión de r o de vocales, o repetición de r; ninguna forma es palabra válida.',
  },
  {
    id: 'aplazr-aplazar',
    wrong: ['aplazr', 'aplazarr'],
    right: 'aplazar',
    reason: 'Omisión de vocales o repetición de r; ninguna forma es palabra válida.',
  },
  {
    id: 'cambir-cambiar',
    wrong: ['cambir', 'cambiarr'],
    right: 'cambiar',
    reason: 'Omisión de a o repetición de r; ninguna forma es palabra válida.',
  },
  {
    id: 'mober-mover',
    wrong: ['mober'],
    right: 'mover',
    reason: 'Confusión b/v; "mober" no es palabra válida.',
  },
  {
    id: 'moberla-moverla',
    wrong: ['moberla'],
    right: 'moverla',
    reason: 'Confusión b/v con pronombre enclítico; "moberla" no es palabra válida.',
  },
  {
    id: 'modifcar-modificar',
    wrong: ['modifcar', 'modificr'],
    right: 'modificar',
    reason: 'Omisión de i o de vocal; ninguna forma es palabra válida.',
  },

  // --- Confirmación ---
  {
    id: 'comfirmar-confirmar',
    wrong: ['comfirmar', 'confimar', 'confirmarr'],
    right: 'confirmar',
    reason: 'Confusión m/n, omisión de r o repetición de r; ninguna forma es palabra válida.',
  },
  {
    id: 'comfirmo-confirmo',
    wrong: ['comfirmo'],
    right: 'confirmo',
    reason: 'Confusión m/n; "comfirmo" no es palabra válida.',
  },

  // --- Rechazo ---
  {
    id: 'rechasar-rechazar',
    wrong: ['rechasar', 'rechazr', 'rechasr'],
    right: 'rechazar',
    reason: 'Confusión s/z u omisión de vocal; ninguna forma es palabra válida.',
  },
  {
    id: 'declinr-declinar',
    wrong: ['declinr'],
    right: 'declinar',
    reason: 'Omisión de vocales; "declinr" no es palabra válida.',
  },

  // --- Agradecimiento ---
  {
    id: 'grasias-gracias',
    wrong: ['grasias'],
    right: 'gracias',
    reason: 'Confusión s/c; "grasias" no es palabra válida.',
  },
  {
    id: 'agradesco-agradezco',
    wrong: ['agradesco'],
    right: 'agradezco',
    reason: 'Confusión s/z; "agradesco" no es palabra válida.',
  },
  {
    id: 'bendisiones-bendiciones',
    wrong: ['bendisiones'],
    right: 'bendiciones',
    reason: 'Confusión s/c; "bendisiones" no es palabra válida.',
  },

  // --- Saludos ---
  {
    id: 'saluos-saludos',
    wrong: ['saluos'],
    right: 'saludos',
    reason: 'Omisión de d; "saluos" no es palabra válida.',
  },
  {
    id: 'bunos-buenos',
    wrong: ['bunos'],
    right: 'buenos',
    reason: 'Omisión de e; "bunos" no es palabra válida.',
  },
  {
    id: 'bunas-buenas',
    wrong: ['bunas'],
    right: 'buenas',
    reason: 'Omisión de e; "bunas" no es palabra válida.',
  },
  {
    id: 'tardez-tardes',
    wrong: ['tardez'],
    right: 'tardes',
    reason: 'Confusión z/s; "tardez" no es palabra válida.',
  },
  {
    id: 'nochez-noches',
    wrong: ['nochez'],
    right: 'noches',
    reason: 'Confusión z/s; "nochez" no es palabra válida.',
  },

  // --- Variantes coloquiales y erratas frecuentes (expansión segura) ---
  {
    id: 'ajendar-agendar',
    wrong: ['ajendar', 'ajenda'],
    right: 'agendar',
    reason:
      'Sustitución j/g en "agendar"; las formas con j no son válidas en este uso.',
  },
  {
    id: 'ajendame-agendarme',
    wrong: ['ajendame', 'ajendeme'],
    right: 'agendarme',
    reason: 'Sustitución j/g con pronombre; la forma correcta conserva el pronombre.',
  },
  {
    id: 'ajendo-agendo',
    wrong: ['ajendo'],
    right: 'agendo',
    reason: 'Sustitución j/g; "ajendo" no es palabra válida.',
  },
  {
    id: 'disponibel-disponible',
    wrong: ['disponibel', 'disponibl'],
    right: 'disponible',
    reason: 'Confusión e/i o omisión de vocal final; ninguna forma es palabra válida.',
  },
  {
    id: 'cancelasion-cancelacion',
    wrong: ['cancelasion'],
    right: 'cancelacion',
    reason: 'Confusión s/c; "cancelasion" no es palabra válida.',
  },
  {
    id: 'confirmasion-confirmacion',
    wrong: ['confirmasion', 'comfirmacion'],
    right: 'confirmacion',
    reason: 'Confusión s/c o m/n; ninguna forma es palabra válida.',
  },
  {
    id: 'acitir-asistir',
    wrong: ['acitir', 'asitir'],
    right: 'asistir',
    reason: 'Transposición u omisión de letras; ninguna forma es palabra válida.',
  },
  {
    id: 'nesecidad-necesidad',
    wrong: ['nesecidad', 'nesesidad'],
    right: 'necesidad',
    reason: 'Confusión s/c; ninguna forma es palabra válida.',
  },
  {
    id: 'kanselar-cancelar',
    wrong: ['kanselar'],
    right: 'cancelar',
    reason: 'Sustitución k/c y s/c; "kanselar" no es palabra válida.',
  },
  {
    id: 'kansele-cancele',
    wrong: ['kansele'],
    right: 'cancele',
    reason: 'Sustitución k/c y s/c; "kansele" no es palabra válida.',
  },
  {
    id: 'kanselarla-cancelarla',
    wrong: ['kanselarla'],
    right: 'cancelarla',
    reason: 'Sustitución k/c y s/c con pronombre; "kanselarla" no es palabra válida.',
  },
  {
    id: 'porfabor-por-favor',
    wrong: ['porfabor', 'porfaborr'],
    right: 'por favor',
    reason:
      'Unión y confusión b/v; se corrige a dos palabras para no alterar el significado.',
  },
];

const WORD_CHARS = '\\p{Letter}\\p{Number}';

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// Índice forma errónea → regla, calculado una sola vez.
const RULE_BY_WORD = new Map<string, SpellingRule>();
for (const rule of SPELLING_RULES) {
  for (const word of rule.wrong) {
    if (RULE_BY_WORD.has(word)) {
      throw new Error(`Corrección duplicada para "${word}" (${rule.id}).`);
    }
    RULE_BY_WORD.set(word, rule);
  }
}

const WORD_PATTERN = new RegExp(
  `(?<![${WORD_CHARS}])(?:${[...RULE_BY_WORD.keys()]
    .map(escapeRegExp)
    .join('|')})(?![${WORD_CHARS}])`,
  'giu',
);

// Conserva la capitalización del original: "Kiero" → "Quiero".
const matchCase = (source: string, replacement: string): string =>
  source[0] !== source[0].toLowerCase() && source.slice(1) === source.slice(1).toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : source === source.toUpperCase() && source.length > 1
      ? replacement.toUpperCase()
      : replacement;

export function correctSpelling(message: string): SpellingCorrectionResult {
  const applied: AppliedCorrection[] = [];
  const text = message.replace(WORD_PATTERN, (found) => {
    const rule = RULE_BY_WORD.get(found.toLowerCase());
    if (!rule) return found;
    const to = matchCase(found, rule.right);
    applied.push({ ruleId: rule.id, from: found, to });
    return to;
  });

  return { original: message, text, applied };
}
