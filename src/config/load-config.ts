import { readFileSync } from 'node:fs';
import type {
  BookingPolicy,
  BusinessClosure,
  ConfiguracionNegocio,
  Service,
  Weekday,
  WeeklyBusinessHours,
} from '../core/types.js';
import {
  parseTimeToMinutes,
  WEEKDAY_ORDER,
} from '../core/time/business-time.js';
import { normalizeIntent } from '../core/nlp/normalize.js';
import {
  DEFAULT_APPOINTMENT_INTERVAL_MINUTES,
  isValidAppointmentInterval,
} from '../core/booking/appointment-schedule.js';

declare const validatedConfigurationBrand: unique symbol;

export type ValidatedConfiguracionNegocio = ConfiguracionNegocio & {
  readonly [validatedConfigurationBrand]: true;
};

const validatedConfigurations = new WeakSet<object>();

export interface ExternalServiceConfig {
  id: string;
  nombre: string;
  descripcion?: string;
  aliases?: string[];
  precio: number;
  duracionMinutos: number;
  activo: boolean;
  businessId?: string;
}

export interface ExternalClosureConfig {
  fecha: string;
  motivo?: string;
}

export interface ExternalBookingPolicyConfig {
  anticipacionMinimaMinutos?: number;
  maximoDiasAnticipacion?: number;
  intervaloAgendaMinutos?: number;
  appointmentIntervalMinutes?: number;
}

export interface ExternalBusinessHoursInterval {
  abreA: string;
  cierraA: string;
}

export interface ExternalBusinessConfig {
  businessId: string;
  nombre: string;
  zonaHoraria: string;
  whatsappNumero: string;
  calendarId: string;
  servicios: ExternalServiceConfig[];
  metodosPago?: string[];
  horariosAtencion: Partial<
    Record<Weekday, ExternalBusinessHoursInterval[]>
  >;
  cierres?: ExternalClosureConfig[];
  politicaReservas?: ExternalBookingPolicyConfig;
  // Alias compatible del intervalo; la ubicación recomendada es dentro de
  // `politicaReservas`.
  intervaloAgendaMinutos?: number;
}

export class ConfigurationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Configuración inválida en "${field}": ${message}`);
    this.name = 'ConfigurationError';
  }
}

export function assertValidatedBusinessConfig(
  config: ConfiguracionNegocio,
): asserts config is ValidatedConfiguracionNegocio {
  if (!validatedConfigurations.has(config)) {
    throw new ConfigurationError(
      'configuracion',
      'debe provenir de loadBusinessConfig() o parseBusinessConfig()',
    );
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  field: string,
): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigurationError(field, 'debe ser un texto no vacío');
  }
  return value.trim();
};

const requiredArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new ConfigurationError(field, 'debe ser un arreglo');
  }
  return value;
};

const optionalStringArray = (
  value: unknown,
  field: string,
): string[] | undefined => {
  if (value === undefined) return undefined;
  const values = requiredArray(value, field);
  return values.map((entry, index) =>
    requiredString(entry, `${field}[${index}]`),
  );
};

const parseService = (
  value: unknown,
  index: number,
  businessId: string,
): Service => {
  const field = `servicios[${index}]`;
  if (!isRecord(value)) {
    throw new ConfigurationError(field, 'debe ser un objeto');
  }

  const serviceBusinessId =
    value.businessId === undefined
      ? businessId
      : requiredString(value.businessId, `${field}.businessId`);
  if (serviceBusinessId !== businessId) {
    throw new ConfigurationError(
      `${field}.businessId`,
      `debe coincidir con businessId "${businessId}"`,
    );
  }

  const price = value.precio;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    throw new ConfigurationError(
      `${field}.precio`,
      'debe ser un número finito mayor o igual que cero',
    );
  }

  const duration = value.duracionMinutos;
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration <= 0
  ) {
    throw new ConfigurationError(
      `${field}.duracionMinutos`,
      'debe ser un entero positivo',
    );
  }

  const name = requiredString(value.nombre, `${field}.nombre`);
  const id = requiredString(value.id, `${field}.id`);
  const aliases = optionalStringArray(value.aliases, `${field}.aliases`);

  if (
    value.descripcion !== undefined &&
    typeof value.descripcion !== 'string'
  ) {
    throw new ConfigurationError(
      `${field}.descripcion`,
      'debe ser un texto',
    );
  }

  if (typeof value.activo !== 'boolean') {
    throw new ConfigurationError(`${field}.activo`, 'debe ser booleano');
  }

  return {
    id,
    businessId,
    name,
    description:
      typeof value.descripcion === 'string' ? value.descripcion : undefined,
    aliases,
    price,
    durationMinutes: duration,
    active: value.activo,
  };
};

const normalized = (value: string): string => normalizeIntent(value);

const validateServiceCollisions = (services: Service[]): void => {
  const ids = new Set<string>();
  const phrases = new Map<string, string>();

  services.forEach((service, index) => {
    if (ids.has(service.id)) {
      throw new ConfigurationError(
        `servicios[${index}].id`,
        `el identificador "${service.id}" está duplicado`,
      );
    }
    ids.add(service.id);

    const servicePhrases = [service.name, ...(service.aliases ?? [])];
    servicePhrases.forEach((phrase, phraseIndex) => {
      const key = normalized(phrase);
      if (!key) {
        throw new ConfigurationError(
          `servicios[${index}].${phraseIndex === 0 ? 'nombre' : 'aliases'}`,
          'no puede estar vacío',
        );
      }

      const previousService = phrases.get(key);
      if (previousService !== undefined) {
        throw new ConfigurationError(
          `servicios[${index}]`,
          `el nombre o alias "${phrase}" entra en conflicto con ${previousService}`,
        );
      }
      phrases.set(key, `servicio "${service.id}"`);
    });
  });
};

const parseHours = (value: unknown): WeeklyBusinessHours => {
  if (!isRecord(value)) {
    throw new ConfigurationError(
      'horariosAtencion',
      'es obligatorio y debe ser un objeto',
    );
  }

  const result: WeeklyBusinessHours = {};
  for (const [day, intervals] of Object.entries(value)) {
    if (!WEEKDAY_ORDER.includes(day as Weekday)) {
      throw new ConfigurationError(
        `horariosAtencion.${day}`,
        'día de la semana desconocido',
      );
    }
    if (!Array.isArray(intervals)) {
      throw new ConfigurationError(
        `horariosAtencion.${day}`,
        'debe ser un arreglo de intervalos',
      );
    }

    let previousClose = -1;
    result[day as Weekday] = intervals.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new ConfigurationError(
          `horariosAtencion.${day}[${index}]`,
          'debe ser un objeto',
        );
      }
      const opensAt = requiredString(
        entry.abreA ?? entry.opensAt,
        `horariosAtencion.${day}[${index}].abreA`,
      );
      const closesAt = requiredString(
        entry.cierraA ?? entry.closesAt,
        `horariosAtencion.${day}[${index}].cierraA`,
      );
      const opening = parseTimeToMinutes(opensAt);
      const closing = parseTimeToMinutes(closesAt);
      if (opening === undefined || closing === undefined || opening >= closing) {
        throw new ConfigurationError(
          `horariosAtencion.${day}[${index}]`,
          'debe contener horas HH:mm válidas y abreA debe ser anterior a cierraA',
        );
      }
      if (opening < previousClose) {
        throw new ConfigurationError(
          `horariosAtencion.${day}[${index}]`,
          'los intervalos no pueden superponerse ni estar desordenados',
        );
      }
      previousClose = closing;
      return { opensAt, closesAt };
    });
  }

  if (
    !Object.values(result).some(
      (intervals) => intervals !== undefined && intervals.length > 0,
    )
  ) {
    throw new ConfigurationError(
      'horariosAtencion',
      'debe contener al menos un día con intervalos operativos',
    );
  }

  return result;
};

const parseClosures = (value: unknown): BusinessClosure[] | undefined => {
  if (value === undefined) return undefined;
  const closures = requiredArray(value, 'cierres');
  const dates = new Set<string>();

  return closures.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ConfigurationError(`cierres[${index}]`, 'debe ser un objeto');
    }
    const date = requiredString(entry.fecha ?? entry.date, `cierres[${index}].fecha`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ConfigurationError(
        `cierres[${index}].fecha`,
        'debe usar el formato YYYY-MM-DD',
      );
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new ConfigurationError(`cierres[${index}].fecha`, 'no es una fecha válida');
    }
    if (dates.has(date)) {
      throw new ConfigurationError(`cierres[${index}].fecha`, `la fecha "${date}" está duplicada`);
    }
    dates.add(date);
    const reason = entry.motivo ?? entry.reason;
    if (reason !== undefined && typeof reason !== 'string') {
      throw new ConfigurationError(`cierres[${index}].motivo`, 'debe ser un texto');
    }
    return { date, reason: reason?.trim() || undefined };
  });
};

const parsePolicy = (
  value: unknown,
  topLevelInterval: unknown,
): BookingPolicy => {
  if (value !== undefined && !isRecord(value)) {
    throw new ConfigurationError('politicaReservas', 'debe ser un objeto');
  }

  const policy = value as Record<string, unknown> | undefined;
  const rawMinimumNotice =
    policy?.anticipacionMinimaMinutos ?? policy?.minimumNoticeMinutes;
  const rawMaxDaysAhead =
    policy?.maximoDiasAnticipacion ?? policy?.maxDaysAhead;
  const nestedInterval =
    policy?.intervaloAgendaMinutos ?? policy?.appointmentIntervalMinutes;

  if (
    nestedInterval !== undefined &&
    topLevelInterval !== undefined &&
    nestedInterval !== topLevelInterval
  ) {
    throw new ConfigurationError(
      'politicaReservas.intervaloAgendaMinutos',
      'no puede diferir de intervaloAgendaMinutos',
    );
  }

  for (const [field, entry] of [
    ['politicaReservas.anticipacionMinimaMinutos', rawMinimumNotice],
    ['politicaReservas.maximoDiasAnticipacion', rawMaxDaysAhead],
  ] as const) {
    if (
      entry !== undefined &&
      (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0)
    ) {
      throw new ConfigurationError(field, 'debe ser un entero mayor o igual que cero');
    }
  }

  const rawInterval =
    nestedInterval ?? topLevelInterval ?? DEFAULT_APPOINTMENT_INTERVAL_MINUTES;
  if (!isValidAppointmentInterval(rawInterval)) {
    const field =
      nestedInterval !== undefined
        ? 'politicaReservas.intervaloAgendaMinutos'
        : 'intervaloAgendaMinutos';
    throw new ConfigurationError(
      field,
      'debe ser un entero positivo de minutos y como máximo 1440',
    );
  }

  return {
    minimumNoticeMinutes:
      typeof rawMinimumNotice === 'number' ? rawMinimumNotice : undefined,
    maxDaysAhead:
      typeof rawMaxDaysAhead === 'number' ? rawMaxDaysAhead : undefined,
    appointmentIntervalMinutes: rawInterval,
  };
};

const validateTimeZone = (timeZone: string): void => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new ConfigurationError('zonaHoraria', `zona horaria inválida "${timeZone}"`);
  }
};

export function parseBusinessConfig(
  input: unknown,
): ValidatedConfiguracionNegocio {
  if (!isRecord(input)) {
    throw new ConfigurationError('raíz', 'debe ser un objeto JSON');
  }

  const businessId = requiredString(input.businessId, 'businessId');
  const name = requiredString(input.nombre, 'nombre');
  const timezone = requiredString(input.zonaHoraria, 'zonaHoraria');
  validateTimeZone(timezone);
  const whatsappNumber = requiredString(input.whatsappNumero, 'whatsappNumero');
  const googleCalendarId = requiredString(input.calendarId, 'calendarId');
  const rawServices = requiredArray(input.servicios, 'servicios');
  if (rawServices.length === 0) {
    throw new ConfigurationError('servicios', 'debe contener al menos un servicio');
  }

  const services = rawServices.map((entry, index) =>
    parseService(entry, index, businessId),
  );
  validateServiceCollisions(services);

  const paymentMethods = optionalStringArray(input.metodosPago, 'metodosPago');
  const businessHours = parseHours(input.horariosAtencion);
  const closures = parseClosures(input.cierres);
  const bookingPolicy = parsePolicy(
    input.politicaReservas,
    input.intervaloAgendaMinutos,
  );

  const config: ConfiguracionNegocio = {
    businessId,
    name,
    timezone,
    whatsappNumber,
    googleCalendarId,
    services,
    paymentMethods,
    businessHours,
    closures,
    bookingPolicy,
  };

  validatedConfigurations.add(config);
  return config as ValidatedConfiguracionNegocio;
}

export function loadBusinessConfig(
  filePath: string,
): ValidatedConfiguracionNegocio {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError('archivo', `no se pudo leer "${filePath}": ${reason}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError('archivo', `JSON inválido: ${reason}`);
  }

  return parseBusinessConfig(parsed);
}

export const loadConfig = loadBusinessConfig;
