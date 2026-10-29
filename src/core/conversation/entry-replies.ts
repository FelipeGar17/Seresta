export const getInitialWelcomeReply = (businessName: string): string =>
  `¡Hola! Bienvenido a ${businessName}.\n${getEntryOptionsReply()}`;

export const getEntryOptionsReply = (): string =>
  [
    'Puedo ayudarte a:',
    '• Agendar una cita.',
    '• Consultar servicios y precios.',
    '• Cancelar una cita confirmada.',
    '',
    '¿Qué necesitas?',
  ].join('\n');

export const getUnrecognizedEntryReply = (): string =>
  [
    'No alcancé a identificar qué necesitas.',
    getEntryOptionsReply(),
  ].join('\n');

export const getCatalogFollowUpReply = (): string =>
  '¿Quieres consultar algo más o iniciar una reserva?';
