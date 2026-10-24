import { describe, expect, it } from 'vitest';
import { whatsappNumber, whatsappUrl } from '../src/lib/whatsapp';

describe('WhatsApp helpers', () => {
  it('normalises phone numbers', () => {
    expect(whatsappNumber('98765 43210')).toBe('919876543210');
    expect(whatsappNumber('+91 98765-43210')).toBe('919876543210');
    expect(whatsappNumber('098765 43210')).toBe('919876543210');
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappUrl('9876543210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
  });
});
