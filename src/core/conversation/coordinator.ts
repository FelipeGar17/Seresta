import { randomUUID } from 'node:crypto';
import type {
  ConfiguracionNegocio,
  Conversation,
  Identifier,
} from '../types.js';
import { analyzeReservationMessage } from '../booking/reservation-intake.js';
import { detectIntentDetailed } from '../nlp/intent-detector.js';
import {
  getBookingResumePrompt,
  handleBookingFlow,
  isActiveBookingState,
} from './booking-flow.js';
import {
  getAvailabilityInquiryResumePrompt,
  handleAvailabilityInquiry,
} from './availability-inquiry-flow.js';
import { buildCatalogReply, isCatalogIntent } from './catalog-reply.js';
import {
  continueCancellationFlow,
  startCancellationFlow,
} from './cancellation-flow.js';
import { handleCourtesyFlow, isCourtesyTurn } from './courtesy-flow.js';
import {
  getCatalogFollowUpReply,
  getEntryOptionsReply,
  getEntryMenuSelectionIntent,
  getInitialWelcomeReply,
  getIntentClarificationReply,
  getUnrecognizedEntryReply,
} from './entry-replies.js';
import {
  handlePostConfirmationAcknowledgment,
  isPostConfirmationAcknowledgment,
} from './post-confirmation-flow.js';
import { MemoryReservationRepository } from '../reservations/memory-reservation-repository.js';
import { MemoryReservationCalendar } from '../reservations/memory-reservation-calendar.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import type { ReservationCalendar } from '../reservations/reservation-calendar.js';
import type { ReservationProgressField } from './reservation-progress.js';
import type { ConversationStore } from './store.js';
import {
  appendTurnMessages,
  getLastBotQuestion,
  getShortReplyContext,
} from './turn-utils.js';

export const CONVERSATION_TTL_MINUTES = 10;

export interface ConversationCoordinatorOptions {
  now?: () => Date;
  idFactory?: () => string;
  reservations?: ReservationRepository;
  calendar?: ReservationCalendar;
}

export interface IncomingConversationMessage {
  business: ConfiguracionNegocio;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
  messageId?: Identifier;
  receivedAt?: Date;
  message: string;
}

export interface ConversationTurnResult {
  conversation: Conversation;
  reply: string;
  nextField: ReservationProgressField | null;
}

// Coordinador: carga la conversación, analiza el mensaje una vez, decide qué
// flujo responde y persiste. Las reglas de cada flujo viven en su módulo
// (`booking-flow.ts`, `catalog-reply.ts`, `courtesy-flow.ts`).
export class ConversationCoordinator {
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly reservations: ReservationRepository;
  private readonly calendar: ReservationCalendar;

  constructor(
    private readonly store: ConversationStore,
    options: ConversationCoordinatorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.reservations =
      options.reservations ?? new MemoryReservationRepository();
    this.calendar = options.calendar ?? new MemoryReservationCalendar();
  }

  async handleMessage(
    input: IncomingConversationMessage,
  ): Promise<ConversationTurnResult> {
    const now = input.receivedAt ?? this.now();
    // La conversación vence a los 10 minutos sin mensajes; cada mensaje renueva
    // el plazo. El almacén la ignora cuando `expiresAt <= now`.
    const renewedExpiration = new Date(
      now.getTime() + CONVERSATION_TTL_MINUTES * 60 * 1000,
    );
    let existing = await this.store.getByContact(
      input.business.businessId,
      input.contactId,
      now,
    );
    if (input.messageId && existing) {
      const duplicateIndex = existing.messages.findIndex(
        (message) => message.externalMessageId === input.messageId,
      );
      if (duplicateIndex >= 0) {
        const previousReply = existing.messages
          .slice(duplicateIndex + 1)
          .find((message) => message.direction === 'outgoing');
        if (!previousReply) {
          throw new Error(
            `El mensaje externo "${input.messageId}" ya fue procesado sin una respuesta persistida.`,
          );
        }
        return {
          conversation: existing,
          reply: previousReply.text,
          nextField: null,
        };
      }
    }
    const shortReplyContext = existing
      ? getShortReplyContext(existing)
      : undefined;
    let intake = analyzeReservationMessage(input.message, input.business, {
      now,
      shortReplyContext,
    });

    if (
      existing?.state === 'awaiting-acknowledgment' &&
      !isPostConfirmationAcknowledgment(
        intake.analysis.detection.decision.effectiveIntent,
        intake.analysis.detection.normalized,
      )
    ) {
      existing.state = 'completed';
      existing.updatedAt = now;
      await this.store.update(existing);
      existing = null;
      intake = analyzeReservationMessage(input.message, input.business, {
        now,
      });
    }

    const menuSelectionIntent =
      existing?.state === 'idle'
        ? getEntryMenuSelectionIntent(
            intake.analysis.detection.normalized,
            getLastBotQuestion(existing),
          )
        : undefined;
    const effectiveIntent =
      menuSelectionIntent ??
      intake.analysis.detection.decision.effectiveIntent;

    const conversation: Conversation = existing
      ? {
          ...existing,
          messages: [...existing.messages],
          data: { ...existing.data },
          cancellation: existing.cancellation && {
            ...existing.cancellation,
            reservationIds: [...existing.cancellation.reservationIds],
          },
          updatedAt: now,
          expiresAt:
            existing.state === 'awaiting-acknowledgment'
              ? existing.expiresAt
              : renewedExpiration,
        }
      : {
          id: this.idFactory(),
          businessId: input.business.businessId,
          contactId: input.contactId,
          whatsappId: input.whatsappId,
          customerPhone: input.customerPhone,
          intent: effectiveIntent,
          state: 'idle',
          messages: [],
          data: {},
          expiresAt: renewedExpiration,
          createdAt: now,
          updatedAt: now,
        };

    if (
      !menuSelectionIntent &&
      intake.analysis.detection.decision.action === 'clarify'
    ) {
      const clarification = getIntentClarificationReply(
        intake.analysis.detection.decision.candidates,
      );
      const reply =
        existing === null
          ? `¡Hola! 👋 Bienvenido a ${input.business.name}.\n\n${clarification}`
          : clarification;
      conversation.intent = 'unknown';
      appendTurnMessages(conversation, input.message, reply, now);
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField: null };
    }

    const activeBooking = existing
      ? isActiveBookingState(existing.state)
      : false;
    const activeAvailabilityInquiry =
      existing?.state === 'checking-availability';
    const startsBooking = effectiveIntent === 'book-appointment';
    const hasAvailabilityDetails = Boolean(
      intake.data.serviceId ||
        intake.data.requestedDate ||
        intake.data.requestedTime ||
        intake.data.ambiguousTime ||
        intake.data.requestedTimeOfDay,
    );
    const startsAvailabilityInquiry =
      !activeBooking && effectiveIntent === 'check-availability';
    const continuesAvailabilityInquiry =
      activeAvailabilityInquiry &&
      effectiveIntent !== 'book-appointment' &&
      effectiveIntent !== 'cancel-appointment' &&
      effectiveIntent !== 'reschedule-appointment' &&
      effectiveIntent !== 'check-prices' &&
      (effectiveIntent === 'check-availability' ||
        effectiveIntent === 'unknown' ||
        hasAvailabilityDetails);
    const previousIncoming = [...conversation.messages]
      .reverse()
      .find((message) => message.direction === 'incoming');
    const isPriceFollowUp =
      previousIncoming !== undefined &&
      intake.analysis.detection.intent === 'unknown' &&
      intake.data.serviceId !== undefined &&
      /^y\b/u.test(intake.analysis.detection.normalized) &&
      detectIntentDetailed(previousIncoming.text, {
        services: input.business.services,
      }).intent === 'check-prices';
    const catalogIntent = isPriceFollowUp
      ? 'check-prices'
      : effectiveIntent;

    // Cancelación de una cita confirmada: si ya hay una en curso recibe todos
    // los mensajes; si no, la inicia el cliente fuera de una reserva.
    const activeCancellation = existing?.state === 'awaiting-cancellation';
    if (
      activeCancellation ||
      (!activeBooking && catalogIntent === 'cancel-appointment')
    ) {
      const cancellationInput = {
        conversation,
        business: input.business,
        reservations: this.reservations,
        calendar: this.calendar,
        message: input.message,
        now,
      };
      if (activeAvailabilityInquiry) {
        conversation.data = {};
        conversation.state = 'idle';
      }
      const { reply, nextField } = activeCancellation
        ? await continueCancellationFlow({
            ...cancellationInput,
            normalized: intake.analysis.detection.normalized,
          })
        : await startCancellationFlow(cancellationInput);
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField };
    }

    if (startsAvailabilityInquiry || continuesAvailabilityInquiry) {
      const { reply, nextField } = await handleAvailabilityInquiry({
        conversation,
        intake,
        business: input.business,
        reservations: this.reservations,
        calendar: this.calendar,
        message: input.message,
        now,
      });
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField };
    }

    if (existing?.state === 'awaiting-acknowledgment') {
      const { reply, nextField } = handlePostConfirmationAcknowledgment(
        conversation,
        catalogIntent,
        input.message,
        now,
      );
      await this.persistConversation(conversation, true, input.messageId);

      return { conversation, reply, nextField };
    }

    // Una consulta de catálogo se responde sin tocar los datos ni el estado de
    // una reserva en curso; después se retoma la pregunta pendiente.
    if (isCatalogIntent(catalogIntent)) {
      const catalogReply = buildCatalogReply(
        input.business,
        catalogIntent,
        intake.analysis,
      );
      let nextField: ReservationProgressField | null = null;
      let followUp = getCatalogFollowUpReply();

      if (activeBooking) {
        const resume = getBookingResumePrompt(conversation, input.business);
        nextField = resume.nextField;
        followUp = resume.followUp;
      } else if (activeAvailabilityInquiry) {
        const resume = getAvailabilityInquiryResumePrompt(
          conversation.data,
          input.business,
        );
        nextField = resume.nextField;
        followUp = resume.reply;
        conversation.intent = 'check-availability';
      } else {
        conversation.intent = catalogIntent;
      }

      const reply = `${catalogReply}\n\n${followUp}`;
      appendTurnMessages(conversation, input.message, reply, now);
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField };
    }

    if (isCourtesyTurn(catalogIntent, activeBooking)) {
      const { reply, nextField } = handleCourtesyFlow({
        conversation,
        intent: catalogIntent,
        business: input.business,
        message: input.message,
        now,
      });
      if (activeAvailabilityInquiry) {
        conversation.data = {};
        conversation.state = 'completed';
      }
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField };
    }

    if (!activeBooking && !startsBooking) {
      const reply =
        catalogIntent === 'unknown'
          ? existing === null
            ? getInitialWelcomeReply(input.business.name)
            : getUnrecognizedEntryReply()
          : getEntryOptionsReply();
      conversation.intent =
        effectiveIntent;
      appendTurnMessages(conversation, input.message, reply, now);
      await this.persistConversation(
        conversation,
        existing !== null,
        input.messageId,
      );

      return { conversation, reply, nextField: null };
    }

    const { reply, nextField } = await handleBookingFlow({
      conversation,
      intake,
      intentOverride: menuSelectionIntent,
      business: input.business,
      reservations: this.reservations,
      calendar: this.calendar,
      message: input.message,
      now,
    });
    await this.persistConversation(
      conversation,
      existing !== null,
      input.messageId,
    );

    return { conversation, reply, nextField };
  }

  private async persistConversation(
    conversation: Conversation,
    exists: boolean,
    messageId?: Identifier,
  ): Promise<void> {
    if (messageId) {
      const incoming = [...conversation.messages]
        .reverse()
        .find((message) => message.direction === 'incoming');
      if (!incoming) {
        throw new Error(
          `No se encontró el turno entrante para el mensaje "${messageId}".`,
        );
      }
      incoming.externalMessageId = messageId;
    }

    if (exists) {
      await this.store.update(conversation);
    } else {
      await this.store.save(conversation);
    }
  }
}
