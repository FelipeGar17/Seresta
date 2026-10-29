export const isMessageReceivedAfterReady = (
  messageTimestampSeconds: number,
  readyAt: Date,
): boolean => {
  const readyTime = readyAt.getTime();
  if (
    !Number.isSafeInteger(messageTimestampSeconds) ||
    !Number.isFinite(readyTime)
  ) {
    return false;
  }

  return messageTimestampSeconds >= Math.ceil(readyTime / 1000);
};
