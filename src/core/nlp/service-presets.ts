import { normalizeIntent } from './normalize.js';
import { canonicalizeServiceText } from './service-term-equivalences.js';

export type ServicePresetDomain =
  | 'barberia'
  | 'peluqueria'
  | 'maquillaje'
  | 'spa'
  | 'unas';

export interface ServicePreset {
  /** Identificador estable del preset (solo referencia/template). */
  id: string;
  domain: ServicePresetDomain;
  /** Nombre sugerido para mostrar/configurar. */
  name: string;
  /** Alias/sinónimos comunes que ayudan a reconocer el servicio. */
  aliases: string[];
  /** Duración sugerida en minutos (orientativa). */
  suggestedDurationMinutes?: number;
  /** Palabras clave para asociar un servicio configurado con este preset. */
  keywords: string[];
}

const preset = (
  id: string,
  domain: ServicePresetDomain,
  name: string,
  aliases: string[],
  keywords: string[],
  suggestedDurationMinutes?: number,
): ServicePreset => ({
  id,
  domain,
  name,
  aliases,
  keywords,
  suggestedDurationMinutes,
});

/**
 * Plantillas de servicios comunes por rubro. Son sugerencias/configuración de
 * apoyo, NO el catálogo activo del negocio. El catálogo real sigue definido en
 * `ConfiguracionNegocio.services`.
 */
export const SERVICE_PRESETS: readonly ServicePreset[] = [
  // Barbería
  preset(
    'barberia-corte',
    'barberia',
    'Corte de cabello',
    ['corte', 'corte de pelo', 'corte caballero', 'corte hombre', 'corte masculino'],
    ['corte', 'cabello', 'pelo'],
    30,
  ),
  preset(
    'barberia-barba',
    'barberia',
    'Arreglo de barba',
    ['barba', 'perfilado de barba', 'recorte de barba', 'arreglo barba', 'barba perfilada'],
    ['barba', 'perfilado', 'recorte'],
    20,
  ),
  preset(
    'barberia-corte-barba',
    'barberia',
    'Corte y barba',
    [
      'corte y barba',
      'corte de pelo y barba',
      'corte de cabello y barba',
      'corte mas barba',
      'corte + barba',
      'combo corte y barba',
      'corte con barba',
    ],
    ['corte', 'barba'],
    50,
  ),
  preset(
    'barberia-afeitado',
    'barberia',
    'Afeitado',
    ['afeitado', 'afeitada', 'rasurado', 'rasurada', 'afeitado clásico', 'afeitado clasico'],
    ['afeitado', 'rasurado'],
    25,
  ),
  preset(
    'barberia-cejas',
    'barberia',
    'Perfilado de cejas',
    ['cejas', 'perfilado de cejas', 'arreglo de cejas', 'cejas hombre'],
    ['cejas', 'perfilado'],
    15,
  ),

  // Peluquería / estilistas
  preset(
    'peluqueria-corte',
    'peluqueria',
    'Corte de cabello',
    ['corte', 'corte de pelo', 'corte dama', 'corte mujer', 'corte femenino'],
    ['corte', 'cabello', 'pelo'],
    40,
  ),
  preset(
    'peluqueria-tinte',
    'peluqueria',
    'Tinte / coloración',
    ['tinte', 'color', 'coloracion', 'coloración', 'tintura', 'tinte de cabello'],
    ['tinte', 'color', 'coloracion', 'tintura'],
    90,
  ),
  preset(
    'peluqueria-mechas',
    'peluqueria',
    'Mechas / iluminaciones',
    ['mechas', 'iluminaciones', 'rayos', 'balayage', 'reflejos'],
    ['mechas', 'iluminaciones', 'balayage', 'rayos'],
    120,
  ),
  preset(
    'peluqueria-peinado',
    'peluqueria',
    'Peinado',
    ['peinado', 'peinado especial', 'brushing', 'cepillado', 'blow dry'],
    ['peinado', 'cepillado'],
    45,
  ),
  preset(
    'peluqueria-keratina',
    'peluqueria',
    'Keratina / alisado',
    ['keratina', 'queratina', 'alisado', 'alisado de cabello', 'planchado'],
    ['keratina', 'alisado', 'planchado'],
    150,
  ),
  preset(
    'peluqueria-tratamiento',
    'peluqueria',
    'Tratamiento capilar',
    ['tratamiento', 'tratamiento capilar', 'hidratacion', 'hidratación', 'nutricion capilar'],
    ['tratamiento', 'hidratacion', 'nutricion'],
    45,
  ),

  // Maquillaje
  preset(
    'maquillaje-social',
    'maquillaje',
    'Maquillaje social',
    ['maquillaje', 'maquillaje social', 'makeup', 'make up', 'maquillaje para evento'],
    ['maquillaje', 'makeup', 'social'],
    60,
  ),
  preset(
    'maquillaje-novia',
    'maquillaje',
    'Maquillaje de novia',
    ['maquillaje de novia', 'maquillaje novia', 'novia', 'bridal makeup'],
    ['maquillaje', 'novia'],
    90,
  ),
  preset(
    'maquillaje-peinado',
    'maquillaje',
    'Maquillaje y peinado',
    ['maquillaje y peinado', 'peinado y maquillaje', 'paquete maquillaje y peinado'],
    ['maquillaje', 'peinado'],
    120,
  ),
  preset(
    'maquillaje-quince',
    'maquillaje',
    'Maquillaje para quinceañera',
    ['maquillaje quinceañera', 'maquillaje quinceanera', 'quinceañera', 'quinceanera'],
    ['maquillaje', 'quince'],
    90,
  ),

  // Spa
  preset(
    'spa-masaje-relajante',
    'spa',
    'Masaje relajante',
    ['masaje', 'masaje relajante', 'masaje de relajacion', 'masaje de relajación'],
    ['masaje', 'relajante'],
    60,
  ),
  preset(
    'spa-limpieza-facial',
    'spa',
    'Limpieza facial',
    ['limpieza facial', 'facial', 'limpieza de cutis', 'facial profundo'],
    ['limpieza', 'facial'],
    60,
  ),
  preset(
    'spa-depilacion',
    'spa',
    'Depilación',
    ['depilacion', 'depilación', 'depilacion con cera', 'cera'],
    ['depilacion', 'cera'],
    30,
  ),
  preset(
    'spa-masaje-descontracturante',
    'spa',
    'Masaje descontracturante',
    ['masaje descontracturante', 'masaje terapeutico', 'masaje terapéutico'],
    ['masaje', 'descontracturante', 'terapeutico'],
    60,
  ),
  preset(
    'spa-exfoliacion',
    'spa',
    'Exfoliación corporal',
    ['exfoliacion', 'exfoliación', 'exfoliacion corporal', 'exfoliación corporal'],
    ['exfoliacion', 'corporal'],
    45,
  ),

  // Uñas
  preset(
    'unas-manicura',
    'unas',
    'Manicura',
    ['manicura', 'manicure', 'manicur', 'arreglo de uñas manos', 'unas manos', 'uñas manos'],
    ['manicura', 'manicure', 'uñas', 'manos'],
    45,
  ),
  preset(
    'unas-pedicura',
    'unas',
    'Pedicura',
    ['pedicura', 'pedicure', 'pedicur', 'arreglo de uñas pies', 'unas pies', 'uñas pies'],
    ['pedicura', 'pedicure', 'uñas', 'pies'],
    50,
  ),
  preset(
    'unas-acrilicas',
    'unas',
    'Uñas acrílicas',
    ['uñas acrilicas', 'uñas acrílicas', 'acrilicas', 'acrílicas', 'set acrilico', 'acrilicas'],
    ['uñas', 'acrilicas'],
    90,
  ),
  preset(
    'unas-gel',
    'unas',
    'Uñas en gel / semipermanente',
    ['uñas en gel', 'gel', 'semipermanente', 'esmaltado semipermanente', 'unas gel'],
    ['uñas', 'gel', 'semipermanente'],
    60,
  ),
  preset(
    'unas-retiro',
    'unas',
    'Retiro de uñas',
    ['retiro', 'retiro de uñas', 'retiro de acrilico', 'retiro semipermanente'],
    ['retiro', 'uñas'],
    30,
  ),
  preset(
    'unas-manicura-pedicura',
    'unas',
    'Manicura y pedicura',
    ['manicura y pedicura', 'manicure y pedicure', 'combo uñas', 'manos y pies'],
    ['manicura', 'pedicura'],
    90,
  ),
];

const significantTokens = (text: string): string[] =>
  canonicalizeServiceText(text)
    .split(/\s+/u)
    .filter((token) => token.length >= 4);

const overlapScore = (left: readonly string[], right: readonly string[]): number => {
  const rightSet = new Set(right);
  let score = 0;
  for (const token of left) {
    if (rightSet.has(token)) score += 1;
  }
  return score;
};

/**
 * Encuentra presets relacionados con un nombre de servicio configurado.
 * No modifica el catálogo; solo sugiere vocabulario útil.
 */
export function findRelatedServicePresets(
  serviceName: string,
  domains?: readonly ServicePresetDomain[],
): ServicePreset[] {
  const tokens = significantTokens(serviceName);
  if (tokens.length === 0) return [];

  const tokenSet = new Set(tokens);
  const candidates = domains
    ? SERVICE_PRESETS.filter((entry) => domains.includes(entry.domain))
    : SERVICE_PRESETS;

  return candidates
    .map((entry) => {
      const presetTokens = [
        ...new Set(
          [entry.name, ...entry.aliases, ...entry.keywords].flatMap(significantTokens),
        ),
      ];
      const presetNameTokens = [...new Set(significantTokens(entry.name))];
      const nameOverlap = overlapScore(tokens, presetNameTokens);
      const score = overlapScore(tokens, presetTokens);
      const extraCoreTokens = presetNameTokens.filter((token) => !tokenSet.has(token));
      const contradictory =
        extraCoreTokens.length > 0 && nameOverlap < presetNameTokens.length;
      return { preset: entry, score, nameOverlap, contradictory };
    })
    .filter(
      (entry) => entry.score > 0 && entry.nameOverlap > 0 && !entry.contradictory,
    )
    .sort((a, b) => b.nameOverlap - a.nameOverlap || b.score - a.score)
    .map((entry) => entry.preset);
}

/**
 * Alias adicionales sugeridos para un servicio, sin duplicados.
 */
export function suggestAliasesForServiceName(
  serviceName: string,
  options: { domains?: readonly ServicePresetDomain[]; max?: number } = {},
): string[] {
  const base = new Set([normalizeIntent(serviceName)]);
  const suggestions: string[] = [];
  const max = options.max ?? 8;

  for (const entry of findRelatedServicePresets(serviceName, options.domains)) {
    for (const alias of [entry.name, ...entry.aliases]) {
      const key = normalizeIntent(alias);
      if (!key || base.has(key)) continue;
      base.add(key);
      suggestions.push(alias);
      if (suggestions.length >= max) return suggestions;
    }
  }

  return suggestions;
}
