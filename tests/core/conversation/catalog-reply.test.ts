import { describe, expect, it } from 'vitest';
import type { ConfiguracionNegocio } from '../../../src/core/types.js';
import { parseBusinessConfig } from '../../../src/config/load-config.js';
import { analyzeMessage } from '../../../src/core/nlp/message-analysis.js';
import {
  buildCatalogReply,
  isCatalogIntent,
  type CatalogIntent,
} from '../../../src/core/conversation/catalog-reply.js';

const now = new Date('2026-10-15T15:00:00.000Z');

const catalogBusiness = (
  servicios: Array<Record<string, unknown>>,
): ConfiguracionNegocio =>
  parseBusinessConfig({
    businessId: 'business-1',
    nombre: 'Barbería',
    zonaHoraria: 'America/Bogota',
    whatsappNumero: '+573000000000',
    calendarId: 'calendar-1',
    servicios,
    horariosAtencion: { friday: [{ abreA: '08:00', cierraA: '18:00' }] },
  });

const full = catalogBusiness([
  { id: 'cut', nombre: 'Corte de cabello', aliases: ['corte'], precio: 25_000, duracionMinutos: 30, activo: true },
  { id: 'beard', nombre: 'Barba', precio: 15_000, duracionMinutos: 30, activo: true },
  { id: 'cut-beard', nombre: 'Corte y barba', aliases: ['corte con barba'], precio: 38_000, duracionMinutos: 45, activo: true },
  { id: 'old', nombre: 'Tinte', precio: 99_000, duracionMinutos: 60, activo: false },
]);

const reply = (
  business: ConfiguracionNegocio,
  message: string,
  intent: CatalogIntent,
): string =>
  buildCatalogReply(business, intent, analyzeMessage(message, business, { now }));

describe('buildCatalogReply', () => {
  it('reconoce solo las intenciones de catálogo', () => {
    expect(isCatalogIntent('list-services')).toBe(true);
    expect(isCatalogIntent('check-prices')).toBe(true);
    expect(isCatalogIntent('book-appointment')).toBe(false);
  });

  it.each([
    '¿Qué servicios ofrecen?',
    '¿Qué servicios tienen disponibles?',
  ])('lista los servicios activos con su precio real: %j', (message) => {
    const text = reply(full, message, 'list-services');

    expect(text).toContain('Corte de cabello: $25.000 COP (30 minutos)');
    expect(text).toContain('Barba: $15.000 COP (30 minutos)');
    expect(text).toContain('Corte y barba: $38.000 COP (45 minutos)');
    expect(text).not.toContain('Tinte');
    expect(text).not.toContain('99.000');
  });

  it.each([
    ['¿Cuánto cuesta el corte de cabello?', 'Corte de cabello cuesta $25.000 COP y dura 30 minutos.'],
    ['¿Cuánto vale la barba?', 'Barba cuesta $15.000 COP y dura 30 minutos.'],
    ['¿Cuánto cuesta el corte y barba?', 'Corte y barba cuesta $38.000 COP y dura 45 minutos.'],
    ['cuánto me cobran por la barba', 'Barba cuesta $15.000 COP y dura 30 minutos.'],
  ])('informa el precio exacto de %j', (message, expected) => {
    expect(reply(full, message, 'check-prices')).toBe(expected);
  });

  it('confirma que existe el servicio por el que se pregunta', () => {
    expect(reply(full, '¿Tienen corte de cabello?', 'list-services')).toBe(
      'Sí, ofrecemos Corte de cabello.\n• Corte de cabello: $25.000 COP (30 minutos)',
    );
  });

  it('pide aclaración ante una consulta ambigua sin elegir un servicio', () => {
    const ambiguous = catalogBusiness([
      { id: 'a', nombre: 'Corte de cabello', precio: 25_000, duracionMinutos: 30, activo: true },
      { id: 'b', nombre: 'Corte infantil', precio: 18_000, duracionMinutos: 30, activo: true },
      { id: 'c', nombre: 'Barba', precio: 15_000, duracionMinutos: 30, activo: true },
    ]);

    const text = reply(ambiguous, '¿Cuánto cuesta el corte?', 'check-prices');

    expect(text).toContain('¿Sobre cuál quieres saber?');
    expect(text).toContain('Corte de cabello: $25.000 COP');
    expect(text).toContain('Corte infantil: $18.000 COP');
    expect(text).not.toContain('Barba');
    expect(text).not.toMatch(/cuesta \$/);
  });

  it('lista todos los precios si no se nombra un servicio', () => {
    const text = reply(full, '¿Qué precios manejan?', 'check-prices');

    expect(text.startsWith('Estos son nuestros servicios y precios:')).toBe(true);
    expect(text).toContain('Barba: $15.000 COP');
  });

  it('no inventa servicios cuando se pregunta por uno que no existe', () => {
    const text = reply(full, '¿Cuánto cuesta el masaje?', 'check-prices');

    expect(text).not.toMatch(/masaje/i);
    expect(text).toContain('Corte de cabello: $25.000 COP');
    expect(text).not.toContain('Tinte');
  });

  it('no inventa servicios si el negocio no tiene ninguno activo', () => {
    const empty = catalogBusiness([
      { id: 'old', nombre: 'Tinte', precio: 99_000, duracionMinutos: 60, activo: false },
    ]);

    expect(reply(empty, '¿Qué servicios ofrecen?', 'list-services')).toBe(
      'Por ahora no tengo servicios configurados para mostrarte.',
    );
  });
});
