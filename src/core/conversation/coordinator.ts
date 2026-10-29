import { randomUUID } from 'node:crypto';
import type {
  ConfiguracionNegocio,
  Conversation,
  Identifier,
} from '../types.js';
import { analyzeReservationMessage } from '../booking/reservation-intake.js';
import {
  getBookingResumePrompt,
  handleBookingFlow,
  isActiveBookingState,
} from './booking-flow.js';
import { buildCatalogReply, isCatalogIntent } from './catalog-reply.js';
import {
  continueCancellationFlow,
  startCancellationFlow,
} from './cancellation-flow.js';
import { handleCourtesyFlow, isCourtesyTurn } from './courtesy-flow.js';
import {
  getCatalogFollowUpReply,
  getEntryOptionsReply,
  getInitialWelcomeReply,
  getUnrecognizedEntryReply,
} from './entry-replies.js';
import {
  handlePostConfirmationAcknowledgment,
  isPostConfirmationAcknowledgment,
} from './post-confirmation-flow.js';
import { MemoryReservationRepository } from '../reservations/memory-reservation-repository.js';
import type { ReservationRepository } from '../reservations/reservation-repository.js';
import type { ReservationProgressField } from './reservation-progress.js';
import type { ConversationStore } from './store.js';
import { appendTurnMessages, getLastBotQuestion } from './turn-utils.js';

export const CONVERSATION_TTL_MINUTES = 10;

export interface ConversationCoordinatorOptions {
  now?: () => Date;
  idFactory?: () => string;
  reservations?: ReservationRepository;
}

export interface IncomingConversationMessage {
  business: ConfiguracionNegocio;
  contactId: Identifier;
  whatsappId: string;
  customerPhone?: string;
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

  constructor(
    private readonly store: ConversationStore,
    options: ConversationCoordinatorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.reservations =
      options.reservations ?? new MemoryReservationRepository();
  }

  async handleMessage(
    input: IncomingConversationMessage,
  ): Promise<ConversationTurnResult> {
    const now = this.now();
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
    let intake = analyzeReservationMessage(input.message, input.business, {
      now,
      lastBotQuestion: existing ? getLastBotQuestion(existing) : undefined,
    });

    if (
      existing?.state === 'awaiting-acknowledgment' &&
      !isPostConfirmationAcknowledgment(
        intake.analysis.detection.intent,
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
          intent: intake.analysis.detection.intent,
          state: 'idle',
          messages: [],
          data: {},
          expiresAt: renewedExpiration,
          createdAt: now,
          updatedAt: now,
        };

    const activeBooking = existing
      ? isActiveBookingState(existing.state)
      : false;
    const startsBooking =
      intake.analysis.detection.intent === 'book-appointment';
    const catalogIntent = intake.analysis.detection.intent;

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
        message: input.message,
        now,
      };
      const { reply, nextField } = activeCancellation
        ? await continueCancellationFlow({
            ...cancellationInput,
            normalized: intake.analysis.detection.normalized,
          })
        : await startCancellationFlow(cancellationInput);
      await this.persistConversation(conversation, existing !== null);

      return { conversation, reply, nextField };
    }

    if (existing?.state === 'awaiting-acknowledgment') {
      const { reply, nextField } = handlePostConfirmationAcknowledgment(
        conversation,
        catalogIntent,
        input.message,
        now,
      );
      await this.persistConversation(conversation, true);

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
      } else {
        conversation.intent = catalogIntent;
      }

      const reply = `${catalogReply}\n\n${followUp}`;
      appendTurnMessages(conversation, input.message, reply, now);
      await this.persistConversation(conversation, existing !== null);

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
      await this.persistConversation(conversation, existing !== null);

      return { conversation, reply, nextField };
    }

    if (!activeBooking && !startsBooking) {
      const reply =
        catalogIntent === 'unknown'
          ? existing === null
            ? getInitialWelcomeReply(input.business.name)
            : getUnrecognizedEntryReply()
          : getEntryOptionsReply();
      conversation.intent = intake.analysis.detection.intent;
      appendTurnMessages(conversation, input.message, reply, now);
      await this.persistConversation(conversation, existing !== null);

      return { conversation, reply, nextField: null };
    }

    const { reply, nextField } = await handleBookingFlow({
      conversation,
      intake,
      business: input.business,
      reservations: this.reservations,
      message: input.message,
      now,
    });
    await this.persistConversation(conversation, existing !== null);

    return { conversation, reply, nextField };
  }

  private async persistConversation(
    conversation: Conversation,
    exists: boolean,
  ): Promise<void> {
    if (exists) {
      await this.store.update(conversation);
    } else {
      await this.store.save(conversation);
    }
  }
}
