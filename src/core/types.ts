export type Identifier = string;

// Intenciones que el motor puede reconocer durante una conversación.
export type ConversationIntent =
  | 'greeting'
  | 'book-appointment'
  | 'check-availability'
  | 'list-services'
  | 'check-prices'
  | 'check-appointment'
  | 'cancel-appointment'
  | 'reschedule-appointment'
  | 'confirm-appointment'
  | 'reject-appointment'
  | 'help'
  | 'goodbye'
  | 'unknown';

// Estados que indican en qué paso del flujo se encuentra la conversación.
export type ConversationState =
  | 'idle'
  | 'collecting-service'
  | 'collecting-date'
  | 'collecting-time'
  | 'collecting-customer-data'
  | 'awaiting-confirmation'
  | 'completed'
  | 'cancelled'
  | 'expired';

// Estado de una reserva según su ciclo de vida.
export type ReservationStatus =
  // Se usa mientras se espera la aceptación del cliente y aún no se ha
  // creado o confirmado el evento definitivo.
  | 'pending'
  // Se usa después de que el cliente acepta y el evento fue creado.
  | 'confirmed'
  // La reserva fue cancelada antes de completarse.
  | 'cancelled'
  // La cita terminó correctamente.
  | 'completed'
  // El cliente no se presentó a la cita.
  | 'no-show';

// Datos que se recopilan progresivamente mientras se prepara una cita.
// Los campos son opcionales porque el cliente puede proporcionarlos en
// mensajes diferentes.
export interface ReservationData {
  customerName?: string;
  serviceId?: Identifier;
  startsAt?: Date;
  endsAt?: Date;
}

// Mensaje intercambiado dentro de una conversación.
export interface ConversationMessage {
  id: Identifier;
  direction: 'incoming' | 'outgoing';
  text: string;
  createdAt: Date;
}

export interface Conversation {
  id: Identifier;
  businessId: Identifier;
  contactId: Identifier;
  whatsappId: string;
  customerPhone: string;
  intent: ConversationIntent;
  state: ConversationState;
  messages: ConversationMessage[];
  data: ReservationData;
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
  customerPhone: string;
  customerName: string;
  serviceId: Identifier;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  googleCalendarEventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Servicio que un negocio ofrece para reservar.
export interface Service {
  id: Identifier;
  businessId: Identifier;
  name: string;
  description?: string;
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
}
