const PHONE_CONTACT_ID_PATTERN = /^(\d{7,15})@c\.us$/u;

/**
 * A direct-contact WhatsApp JID contains the international phone number.
 * LID JIDs are identifiers only and must not be stored as phone numbers.
 */
export const extractPhoneFromContactId = (
  contactId: string,
): string | undefined => {
  const match = PHONE_CONTACT_ID_PATTERN.exec(contactId);
  return match ? `+${match[1]}` : undefined;
};
