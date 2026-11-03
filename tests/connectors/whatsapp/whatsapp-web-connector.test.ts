import { describe, expect, it } from 'vitest';
import {
  getTextMessageBody,
  getWhatsAppMessageId,
} from '../../../src/connectors/whatsapp/whatsapp-web-connector.js';

describe('getTextMessageBody', () => {
  it.each([undefined, null, 42, {}, '   '])(
    'ignora el cuerpo que no contiene texto: %s',
    (body) => {
      expect(getTextMessageBody(body)).toBeUndefined();
    },
  );

  it('conserva el cuerpo de los mensajes de texto', () => {
    expect(getTextMessageBody('  Hola  ')).toBe('  Hola  ');
  });
});

describe('getWhatsAppMessageId', () => {
  it('usa el ID serializado cuando WhatsApp lo proporciona', () => {
    expect(
      getWhatsAppMessageId(
        {
          _serialized: 'false_7211250110533@lid_ABC123',
          remote: '7211250110533@lid',
          id: 'ABC123',
        },
        '7211250110533@lid',
      ),
    ).toBe('false_7211250110533@lid_ABC123');
  });

  it('construye un ID estable desde los campos de MessageId para chats LID', () => {
    expect(
      getWhatsAppMessageId(
        {
          fromMe: false,
          remote: '7211250110533@lid',
          id: 'ABC123',
        },
        '7211250110533@lid',
      ),
    ).toBe('wa:[false,"7211250110533@lid","","ABC123"]');
  });

  it('usa el chat como remoto de respaldo y rechaza claves incompletas', () => {
    expect(
      getWhatsAppMessageId({ fromMe: false, id: 'ABC123' }, 'contact@lid'),
    ).toBe('wa:[false,"contact@lid","","ABC123"]');
    expect(getWhatsAppMessageId({ remote: 'contact@lid' }, 'contact@lid')).toBe(
      undefined,
    );
  });
});
