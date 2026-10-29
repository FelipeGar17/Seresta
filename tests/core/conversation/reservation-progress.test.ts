import { describe, expect, it } from 'vitest';
import {
  getNextReservationField,
  getPendingReservationFields,
  isReservationReadyForConfirmation,
  mergeReservationData,
} from '../../../src/core/conversation/reservation-progress.js';
import type { ReservationData } from '../../../src/core/types.js';

const requestedDate = new Date('2026-10-23T00:00:00.000Z');
const otherRequestedDate = new Date('2026-10-24T00:00:00.000Z');
const startsAt = new Date('2026-10-23T15:00:00.000Z');
const otherStartsAt = new Date('2026-10-24T16:00:00.000Z');
const endsAt = new Date('2026-10-23T15:45:00.000Z');

const completeData: ReservationData = {
  serviceId: 'service-1',
  requestedDate,
  requestedTime: '15:00',
  startsAt,
  endsAt,
  customerName: 'Ana',
};

describe('reservation progress', () => {
  it('reports all required fields when the reservation is empty', () => {
    expect(getPendingReservationFields({})).toEqual([
      'serviceId',
      'requestedDate',
      'requestedTime',
      'customerName',
    ]);
    expect(getNextReservationField({})).toBe('serviceId');
  });

  it('reports only the missing required fields in collection order', () => {
    expect(
      getPendingReservationFields({
        serviceId: 'service-1',
      }),
    ).toEqual(['requestedDate', 'requestedTime', 'customerName']);
    expect(
      getNextReservationField({
        serviceId: 'service-1',
      }),
    ).toBe('requestedDate');

    expect(
      getPendingReservationFields({
        serviceId: 'service-1',
        requestedDate,
        customerName: 'Ana',
      }),
    ).toEqual(['requestedTime']);
    expect(
      getNextReservationField({
        serviceId: 'service-1',
        requestedDate,
        customerName: 'Ana',
      }),
    ).toBe('requestedTime');
  });

  it('asks for the date when the time is already known', () => {
    const data: ReservationData = {
      serviceId: 'service-1',
      requestedTime: '15:00',
    };

    expect(getPendingReservationFields(data)).toEqual([
      'requestedDate',
      'customerName',
    ]);
    expect(getNextReservationField(data)).toBe('requestedDate');
  });

  it('does not treat startsAt as a substitute for date and time', () => {
    expect(
      getPendingReservationFields({
        serviceId: 'service-1',
        startsAt,
        customerName: 'Ana',
      }),
    ).toEqual(['requestedDate', 'requestedTime']);
  });

  it('does not require the derived startsAt to consider the reservation ready', () => {
    const withoutDerivedInstants = {
      serviceId: 'service-1',
      requestedDate,
      requestedTime: '15:00',
      customerName: 'Ana',
    };

    expect(getPendingReservationFields(withoutDerivedInstants)).toEqual([]);
    expect(isReservationReadyForConfirmation(withoutDerivedInstants)).toBe(
      true,
    );
    expect(getNextReservationField(withoutDerivedInstants)).toBeNull();
  });

  it('does not consider partial date or time ready for confirmation', () => {
    expect(
      getPendingReservationFields({
        serviceId: 'service-1',
        customerName: 'Ana',
        requestedDate,
      }),
    ).toEqual(['requestedTime']);
    expect(
      isReservationReadyForConfirmation({
        serviceId: 'service-1',
        customerName: 'Ana',
        requestedTime: '15:00',
      }),
    ).toBe(false);
  });

  it('treats blank strings as missing values', () => {
    expect(
      getPendingReservationFields({
        ...completeData,
        customerName: '   ',
      }),
    ).toEqual(['customerName']);
    expect(isReservationReadyForConfirmation(completeData)).toBe(true);
  });
});

describe('mergeReservationData', () => {
  it('merges partial data without losing existing fields', () => {
    const current: ReservationData = {
      serviceId: 'service-1',
      startsAt,
      endsAt,
      customerName: 'Ana',
    };

    const merged = mergeReservationData(current, {
      customerName: 'Ana María',
    });

    expect(merged).toEqual({
      serviceId: 'service-1',
      startsAt,
      endsAt,
      customerName: 'Ana María',
    });
    expect(current.customerName).toBe('Ana');
  });

  it('merges partial date and time without losing existing data', () => {
    const withDate = mergeReservationData(
      { serviceId: 'service-1', customerName: 'Ana' },
      { requestedDate },
    );

    expect(withDate).toEqual({
      serviceId: 'service-1',
      customerName: 'Ana',
      requestedDate,
    });

    const withTime = mergeReservationData(withDate, {
      requestedTime: '15:00',
    });

    expect(withTime).toEqual({
      serviceId: 'service-1',
      customerName: 'Ana',
      requestedDate,
      requestedTime: '15:00',
    });
  });

  it('invalidates derived instants when the requested date changes', () => {
    const merged = mergeReservationData(
      {
        ...completeData,
      },
      { requestedDate: otherRequestedDate },
    );

    expect(merged).toEqual({
      serviceId: 'service-1',
      customerName: 'Ana',
      requestedDate: otherRequestedDate,
      requestedTime: '15:00',
    });
  });

  it('invalidates derived instants when the requested time changes', () => {
    const merged = mergeReservationData(
      {
        ...completeData,
      },
      { requestedTime: '16:00' },
    );

    expect(merged).toEqual({
      serviceId: 'service-1',
      customerName: 'Ana',
      requestedDate,
      requestedTime: '16:00',
    });
  });

  it('ignores missing and blank incoming values', () => {
    const current: ReservationData = {
      serviceId: 'service-1',
      customerName: 'Ana',
    };

    const merged = mergeReservationData(current, {
      serviceId: '',
      customerName: '   ',
    });

    expect(merged).toEqual(current);
  });

  it('clears a stale endsAt when the start instant changes', () => {
    const merged = mergeReservationData(completeData, {
      startsAt: otherStartsAt,
    });

    expect(merged.startsAt).toBe(otherStartsAt);
    expect(merged.endsAt).toBeUndefined();
    expect(merged.serviceId).toBe('service-1');
    expect(merged.customerName).toBe('Ana');
  });

  it('keeps endsAt when the start instant does not change', () => {
    const merged = mergeReservationData(completeData, {
      startsAt: new Date(startsAt.getTime()),
      customerName: 'Ana María',
    });

    expect(merged.startsAt).toEqual(startsAt);
    expect(merged.endsAt).toBe(endsAt);
    expect(merged.customerName).toBe('Ana María');
  });

  it('invalidates occupiedEndsAt when the requested date changes', () => {
    const occupiedEndsAt = new Date('2026-10-23T16:00:00.000Z');
    const merged = mergeReservationData(
      { ...completeData, occupiedEndsAt },
      { requestedDate: otherRequestedDate },
    );

    expect(merged.occupiedEndsAt).toBeUndefined();
  });

  it('clears a stale occupiedEndsAt when the start instant changes', () => {
    const occupiedEndsAt = new Date('2026-10-23T16:00:00.000Z');
    const merged = mergeReservationData(
      { ...completeData, occupiedEndsAt },
      { startsAt: otherStartsAt },
    );

    expect(merged.startsAt).toBe(otherStartsAt);
    expect(merged.occupiedEndsAt).toBeUndefined();
  });

  it('invalidates duration-dependent instants when the service changes', () => {
    const occupiedEndsAt = new Date('2026-10-23T16:00:00.000Z');
    const merged = mergeReservationData(
      { ...completeData, occupiedEndsAt },
      { serviceId: 'service-2' },
    );

    expect(merged.serviceId).toBe('service-2');
    expect(merged.startsAt).toEqual(startsAt);
    expect(merged.endsAt).toBeUndefined();
    expect(merged.occupiedEndsAt).toBeUndefined();
  });
});
