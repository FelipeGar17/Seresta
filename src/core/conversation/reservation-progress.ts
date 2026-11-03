import type { ReservationData } from '../types.js';

export type ReservationProgressField =
  | 'serviceId'
  | 'requestedDate'
  | 'requestedTime'
  | 'customerName';

export const REQUIRED_RESERVATION_FIELDS = [
  'serviceId',
  'requestedDate',
  'requestedTime',
  'customerName',
] as const satisfies readonly ReservationProgressField[];

const isPresent = <T>(value: T | undefined): value is T =>
  value !== undefined &&
  value !== null &&
  (typeof value !== 'string' || value.trim().length > 0);

const isSameInstant = (left: Date, right: Date): boolean =>
  left.getTime() === right.getTime();

const hasField = (
  data: ReservationData,
  field: ReservationProgressField,
): boolean => isPresent(data[field]);

export function getPendingReservationFields(
  data: ReservationData,
): ReservationProgressField[] {
  return REQUIRED_RESERVATION_FIELDS.filter(
    (field) => !hasField(data, field),
  );
}

export function getNextReservationField(
  data: ReservationData,
): ReservationProgressField | null {
  return getPendingReservationFields(data)[0] ?? null;
}

export function isReservationReadyForConfirmation(
  data: ReservationData,
): boolean {
  return getPendingReservationFields(data).length === 0;
}

export function mergeReservationData(
  current: ReservationData,
  incoming: ReservationData,
): ReservationData {
  const merged: ReservationData = { ...current };

  if (isPresent(incoming.customerName)) {
    merged.customerName = incoming.customerName;
  }
  const serviceChanged =
    isPresent(incoming.serviceId) &&
    current.serviceId !== incoming.serviceId;
  if (isPresent(incoming.serviceId)) {
    merged.serviceId = incoming.serviceId;
  }
  if (serviceChanged) {
    delete merged.endsAt;
    delete merged.occupiedEndsAt;
  }

  const requestedDateChanged =
    isPresent(incoming.requestedDate) &&
    (!isPresent(current.requestedDate) ||
      !isSameInstant(current.requestedDate, incoming.requestedDate));
  const requestedTimeChanged =
    isPresent(incoming.requestedTime) &&
    current.requestedTime !== incoming.requestedTime;

  if (isPresent(incoming.requestedDate)) {
    merged.requestedDate = incoming.requestedDate;
  }
  if (isPresent(incoming.requestedTime)) {
    merged.requestedTime = incoming.requestedTime;
    delete merged.ambiguousTime;
    delete merged.requestedTimeOfDay;
  } else if (incoming.ambiguousTime) {
    // Una hora ambigua reemplaza a la anterior sin quedar como definitiva.
    merged.ambiguousTime = incoming.ambiguousTime;
    delete merged.requestedTime;
    delete merged.startsAt;
    delete merged.endsAt;
    delete merged.occupiedEndsAt;
  }
  if (incoming.requestedTimeOfDay && !incoming.requestedTime) {
    merged.requestedTimeOfDay = incoming.requestedTimeOfDay;
  }

  if (requestedDateChanged || requestedTimeChanged) {
    delete merged.startsAt;
    delete merged.endsAt;
    delete merged.occupiedEndsAt;
  }

  if (isPresent(incoming.startsAt)) {
    const startsAtChanged =
      !isPresent(current.startsAt) ||
      !isSameInstant(current.startsAt, incoming.startsAt);

    merged.startsAt = incoming.startsAt;
    if (startsAtChanged && !isPresent(incoming.endsAt)) {
      delete merged.endsAt;
    }
    if (startsAtChanged && !isPresent(incoming.occupiedEndsAt)) {
      delete merged.occupiedEndsAt;
    }
  }

  if (isPresent(incoming.endsAt)) {
    merged.endsAt = incoming.endsAt;
  }
  if (isPresent(incoming.occupiedEndsAt)) {
    merged.occupiedEndsAt = incoming.occupiedEndsAt;
  }

  return merged;
}
