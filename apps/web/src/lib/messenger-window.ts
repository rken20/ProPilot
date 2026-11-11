/** Is a reply still allowed? Messenger allows standard replies for 24 hours after the person's last message. */
export function withinReplyWindow(lastInboundAt: string | null, now = Date.now()): boolean {
  return Boolean(lastInboundAt) && now - new Date(lastInboundAt!).getTime() < 24 * 3600_000;
}
