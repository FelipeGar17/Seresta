import { describe, expect, it } from 'vitest';
import { extractPhoneFromContactId } from '../../../src/core/messaging/whatsapp-contact.js';

describe('extractPhoneFromContactId', () => {
  it('converts a c.us contact id to international phone format', () => {
    expect(extractPhoneFromContactId('573224491756@c.us')).toBe(
      '+573224491756',
    );
  });

  it('does not treat a LID as a phone number', () => {
    expect(extractPhoneFromContactId('7211250110533@lid')).toBeUndefined();
  });

  it.each([
    '',
    '573224491756',
    '573224491756@g.us',
    'not-a-number@c.us',
    '1234567890123456@c.us',
  ])('rejects invalid contact id "%s"', (contactId) => {
    expect(extractPhoneFromContactId(contactId)).toBeUndefined();
  });
});
