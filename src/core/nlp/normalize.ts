const ABBREVIATIONS: Record<string, string> = {
  xfa: 'por favor',
  xq: 'porque',
  tmb: 'tambien',
  k: 'que',
};

const protectEnye = (text: string): string =>
  text.replace(/n\u0303/gu, '\u0001');

const removeAccentsKeepingEnye = (text: string): string =>
  protectEnye(text)
    .replace(/\p{Mark}/gu, '')
    .replace(/\u0001/gu, 'ñ');

const expandAbbreviations = (text: string): string =>
  text.replace(/\b(?:xfa|xq|tmb|k)\b/gu, (word) => ABBREVIATIONS[word]);

// Normalización agresiva para reglas de intención. Conserva la ñ y expande
// abreviaturas comunes sin alterar la normalización usada por extracción.
export function normalizeIntent(text: string): string {
  return expandAbbreviations(
    removeAccentsKeepingEnye(text.normalize('NFD')).toLowerCase(),
  )
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalización suave para fechas, horas, teléfonos y otros datos con signos.
export function normalizeForExtraction(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00a0/gu, ' ')
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Separa emojis para que no queden pegados a fechas o palabras extraídas.
export function splitEmojis(text: string): { text: string; emojis: string[] } {
  const emojis: string[] = [];
  const cleanText = text.replace(/\p{Extended_Pictographic}/gu, (emoji) => {
    emojis.push(emoji);
    return ' ';
  });

  return { text: cleanText.replace(/\s+/g, ' ').trim(), emojis };
}

// Conserva tokens útiles para reglas y extracción sin hacer coincidencias
// parciales dentro de otras palabras.
export function tokenize(text: string): string[] {
  return normalizeIntent(text).match(/[\p{Letter}\p{Number}]+/gu) ?? [];
}

// Compatibilidad con las fases anteriores.
export const normalizeText = normalizeIntent;
