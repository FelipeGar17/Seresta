import { normalizeIntent } from './normalize.js';

/**
 * Equivalencias genéricas de vocabulario para interpretar servicios en español.
 *
 * Son ayudas de coincidencia (normalización), no catálogo de negocio: no crean
 * servicios ni eligen entre opciones ambiguas. El servicio real sigue viniendo
 * de la configuración del negocio.
 */
const TERM_GROUPS: readonly (readonly string[])[] = [
  ['cabello', 'pelo'],
  ['manicura', 'manicure', 'manicur'],
  ['pedicura', 'pedicure', 'pedicur'],
  ['uñas', 'unas'],
  ['maquillaje', 'makeup', 'make up'],
  ['tinte', 'color', 'coloracion', 'coloración', 'tintura'],
  ['depilacion', 'depilación'],
  ['ceja', 'cejas'],
  ['pestaña', 'pestañas', 'pestana', 'pestanas'],
  ['facial', 'limpieza facial'],
  ['keratina', 'queratina'],
  ['alisado', 'planchado'],
  ['afeitado', 'afeitada', 'rasurado', 'rasurada'],
  ['diseño', 'diseno'],
];

const normalizeTerm = (term: string): string => normalizeIntent(term).trim();

const buildEquivalenceMap = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const group of TERM_GROUPS) {
    const normalized = group.map(normalizeTerm).filter(Boolean);
    if (normalized.length === 0) continue;
    const canonical = normalized[0]!;
    for (const term of normalized) {
      map.set(term, canonical);
    }
  }
  return map;
};

const EQUIVALENCE_MAP = buildEquivalenceMap();

const EQUIVALENT_TOKENS = new Map<string, readonly string[]>();
for (const group of TERM_GROUPS) {
  const normalized = group.map(normalizeTerm).filter(Boolean);
  for (const term of normalized) {
    EQUIVALENT_TOKENS.set(term, normalized);
  }
}

/**
 * Sustituye tokens por su forma canónica para comparar servicios con variantes
 * comunes ("pelo"≈"cabello"). Conserva el resto del texto.
 */
export function canonicalizeServiceText(text: string): string {
  const normalized = normalizeIntent(text);
  if (!normalized) return '';
  return normalized
    .split(/\s+/u)
    .map((token) => EQUIVALENCE_MAP.get(token) ?? token)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Genera variantes plausibles de una frase de servicio sustituyendo tokens por
 * equivalentes conocidos. Se usa solo para ampliar coincidencias; no crea
 * servicios nuevos.
 */
export function expandServicePhraseVariants(phrase: string): string[] {
  const normalized = normalizeIntent(phrase);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/u).filter(Boolean);
  const variants = new Set<string>([canonicalizeServiceText(normalized)]);

  const alternatives = tokens.map((token) => {
    const equivalents = EQUIVALENT_TOKENS.get(token);
    return equivalents && equivalents.length > 0 ? equivalents : [token];
  });

  // Limita combinaciones para evitar explosión en frases largas.
  const maxVariants = 24;
  const build = (index: number, current: string[]): void => {
    if (variants.size >= maxVariants) return;
    if (index >= alternatives.length) {
      variants.add(canonicalizeServiceText(current.join(' ')));
      variants.add(current.join(' ').trim());
      return;
    }
    for (const option of alternatives[index] ?? [tokens[index] ?? '']) {
      current[index] = option;
      build(index + 1, current);
      if (variants.size >= maxVariants) return;
    }
  };

  build(0, [...tokens]);
  return [...variants].filter(Boolean);
}

/**
 * Normaliza un mensaje para búsqueda de servicios, aplicando equivalencias.
 */
export function normalizeServiceMessageForMatching(text: string): string {
  return canonicalizeServiceText(text);
}
