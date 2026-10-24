/** wa.me helpers: opening a WhatsApp chat with a message typed in. */

/**
 * A phone number as WhatsApp wants it: digits with the country code. A bare
 * 10-digit number is taken as Indian. Null when it cannot be a phone number.
 */
export function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Opens a chat with `phone`, the message typed in and ready to send. */
export const whatsappUrl = (phone: string, text: string): string =>
  `https://wa.me/${whatsappNumber(phone) ?? ''}?text=${encodeURIComponent(text)}`;
