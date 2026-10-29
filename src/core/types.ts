export type Identifier = string;

// Intenciones que el motor puede reconocer durante una conversación.
export type ConversationIntent =
  | "greeting"
  | "book-appointment"
  | "check-availability"
  | "list-services"
  | "check-prices"
  | "check-appointment"
  | "cancel-appointment"
  | "reschedule-appointment"
  | "confirm-appointment"
  | "reject-appointment"
  | "help"
  | "goodbye"
  | "thanks"
  | "unknown";

// Estados que indican en qué paso del flujo se encuentra la conversación.
export type ConversationState =
  | "idle"
  | "collecting-service"
  | "collecting-date"
  | "collecting-time"
  | "collecting-customer-data"
  | "awaiting-confirmation"
  // El cliente aceptó el primer resumen; todavía falta la confirmación final.
  | "awaiting-final-confirmation"
  // La cita ya está creada; se espera una respuesta breve de cierre.
  | "awaiting-acknowledgment"
  // El cliente pidió cancelar una cita ya confirmada y el bot espera la
  // elección de la cita y/o su confirmación explícita.
  | "awaiting-cancellation"
  | "completed"
  | "cancelled"
  | "expired";

// Estado de una reserva según su ciclo de vida.
export type ReservationStatus =
  // Se usa mientras se espera la aceptación del cliente y aún no se ha
  // creado o confirmado el evento definitivo.
  | "pending"
  // Se usa después de que el cliente acepta y el evento fue creado.
  | "confirmed"
  // La reserva fue cancelada antes de completarse.
  | "cancelled"
  // La cita terminó correctamente.
  | "completed"
  // El cliente no se presentó a la cita.
  | "no-show";

// Datos que se recopilan progresivamente mientras se prepara una cita.
// Los campos son opcionales porque el cliente puede proporcionarlos en
// mensajes diferentes.
export interface ReservationData {
  customerName?: string;
  serviceId?: Identifier;
  requestedDate?: Date;
  requestedTime?: string;
  // Hora de 12 h que el cliente dio sin indicar mañana o tarde. No es una
  // hora definitiva: el flujo pregunta el periodo y luego la reemplaza por
  // `requestedTime`.
  ambiguousTime?: { hour: number; minute: number };
  startsAt?: Date;
  endsAt?: Date;
  occupiedEndsAt?: Date;
}

// Días de la semana en el orden calendario (0 = domingo).
export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

// Repetición detectada en el mensaje, por ejemplo "los martes".
export interface Recurrence {
  frequency: "weekly";
  weekday: Weekday;
}

export interface BusinessHoursInterval {
  opensAt: string;
  closesAt: string;
}

export type WeeklyBusinessHours = Partial<
  Record<Weekday, BusinessHoursInterval[]>
>;

export interface BusinessClosure {
  date: string;
  reason?: string;
}

export interface BookingPolicy {
  minimumNoticeMinutes?: number;
  maxDaysAhead?: number;
  // Intervalo fijo de la agenda (en minutos). Es independiente de la duración
  // real del servicio: esta última puede ocupar uno o varios bloques.
  appointmentIntervalMinutes?: number;
}

// Entrada del catálogo de servicios que el motor sabe resolver por texto.
// Cada negocio define su propio catálogo: el motor no conoce nombres fijos.
export interface ServiceCatalogEntry {
  // Obligatorio: es la identidad estable que vincula la coincidencia del NLP
  // con el `Service` canónico de la configuración del negocio.
  id: Identifier;
  name: string;
  // Formas alternativas de nombrar el servicio ("arreglo de barba", etc.).
  aliases?: string[];
}

// Resultado de resolver una petición de servicio contra el catálogo.
export type ServiceMatch =
  | {
      status: 'matched';
      service: ServiceCatalogEntry;
    }
  | {
      status: 'ambiguous';
      // Varias coincidencias equivalentes: el bot debe preguntar, no elegir.
      candidates: ServiceCatalogEntry[];
    }
  | {
      status: 'not-found';
    };

// Datos concretos encontrados en un mensaje, separados de su intención.
export interface ExtractedEntities {
  // Resultado de resolver el servicio pedido contra el catálogo del negocio.
  // Solo se rellena si el extractor recibió el catálogo.
  serviceMatch?: ServiceMatch;
  relativeDate?: string;
  // Representa la fecha del calendario a medianoche UTC para evitar que el
  // cambio de zona horaria altere el día mostrado.
  date?: Date;
  time?: string;
  // Hora de 12 h sin mañana/tarde ("a las 4"): no es una hora definitiva.
  ambiguousTime?: { hour: number; minute: number };
  timeOfDay?: "morning" | "afternoon" | "evening";
  // Presente cuando el cliente habla de una repetición ("los martes") y no
  // de una fecha única.
  recurrence?: Recurrence;
  // Solo con prefijo explícito ("me llamo X"); nunca se infiere.
  customerName?: string;
}
// Mensaje intercambiado dentro de una conversación.
export interface ConversationMessage {
  id: Identifier;
  direction: "incoming" | "outgoing";
  text: string;
  createdAt: Date;
}

export interface Conversation {
  id: Identifier;
  businessId: Identifier;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
  intent: ConversationIntent;
  state: ConversationState;
  messages: ConversationMessage[];
  data: ReservationData;
  // Citas confirmadas candidatas a cancelación mientras el estado es
  // `awaiting-cancellation`; `selectedId` queda fijado al elegir una.
  cancellation?: { reservationIds: Identifier[]; selectedId?: Identifier };
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Reserva definitiva creada después de confirmar los datos con el cliente.
export interface Reservation {
  id: Identifier;
  businessId: Identifier;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
  customerName: string;
  serviceId: Identifier;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  googleCalendarEventId?: string;
  // Momento de la cancelación; se usa para depurar citas canceladas antiguas.
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Servicio que un negocio ofrece para reservar.
export interface Service {
  id: Identifier;
  businessId: Identifier;
  name: string;
  description?: string;
  // Formas alternativas de nombrar el servicio, configuradas por el negocio.
  aliases?: string[];
  price: number;
  durationMinutes: number;
  active: boolean;
}

// Configuración necesaria para operar un negocio.
export interface ConfiguracionNegocio {
  businessId: Identifier;
  name: string;
  timezone: string;
  whatsappNumber: string;
  googleCalendarId: string;
  services: Service[];
  paymentMethods?: string[];
  businessHours?: WeeklyBusinessHours;
  closures?: BusinessClosure[];
  bookingPolicy?: BookingPolicy;
}

// Motivos de rechazo compartidos por todos los validadores del motor.
export type ValidationReason =
  | 'not-found'
  | 'inactive'
  | 'invalid-configuration'
  | 'invalid-date'
  | 'past-date'
  | 'out-of-window'
  | 'outside-hours'
  | 'closed-day'
  | 'exceptional-closure'
  | 'insufficient-notice'
  | 'invalid-service-duration'
  | 'incomplete';

// Resultado de una validación: el valor válido o el motivo del rechazo.
export type ValidationResult<T, R extends string = ValidationReason> =
  | {
      valid: true;
      value: T;
    }
  | {
      valid: false;
      reason: R;
      // Contexto opcional del rechazo (por ejemplo, el servicio inválido).
      value?: T;
    };
