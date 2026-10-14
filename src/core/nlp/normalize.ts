// Normaliza mensajes para que las reglas del detector no dependan de
// mayúsculas, tildes, espacios repetidos o signos de puntuación.
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
