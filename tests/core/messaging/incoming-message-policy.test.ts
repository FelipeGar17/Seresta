import { describe, expect, it } from 'vitest';
import { isMessageReceivedAfterReady } from '../../../src/core/messaging/incoming-message-policy.js';

describe('isMessageReceivedAfterReady', () => {
  const readyAt = new Date('2026-10-29T02:24:52.349Z');
  const cutoffSeconds = Math.ceil(readyAt.getTime() / 1000);

  it('ignora mensajes recibidos antes de que WhatsApp estuviera listo', () => {
    expect(isMessageReceivedAfterReady(cutoffSeconds - 1, readyAt)).toBe(false);
  });

  it('acepta mensajes recibidos desde el siguiente segundo completo', () => {
    expect(isMessageReceivedAfterReady(cutoffSeconds, readyAt)).toBe(true);
  });

  it('rechaza marcas de tiempo inválidas', () => {
    expect(isMessageReceivedAfterReady(Number.NaN, readyAt)).toBe(false);
    expect(isMessageReceivedAfterReady(1, new Date(Number.NaN))).toBe(false);
  });
});
