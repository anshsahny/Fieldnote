/**
 * Contact details the triage model doesn't need. A customer's message can carry a phone number or
 * an email ("call me at 555-…"); they are replaced before the message reaches any model, on-device
 * or cloud. The dispatcher still sees the original on the job.
 */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// 10+ digit runs with common separators: (555) 010-4477, 555.010.4477, +1 555 010 4477.
const PHONE = /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redactContact(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}
