import { describe, expect, it } from 'vitest';
import { redactContact } from './privacy';

describe('redactContact', () => {
  it.each([
    ['Furnace shows EE2. Call me at (555) 010-4477 after 3', 'Furnace shows EE2. Call me at [phone] after 3'],
    ['text 555.010.4477 or +1 555 010 4477', 'text [phone] or [phone]'],
    ['email pat.lee+home@example.com if no answer', 'email [email] if no answer'],
  ])('%s', (input, expected) => {
    expect(redactContact(input)).toBe(expected);
  });

  it('keeps codes, model numbers and readings', () => {
    const text = 'Code 31 on a 59SC5B080, inlet 7.0 in w.c., blinked 3 times, model GMVC960804CN';
    expect(redactContact(text)).toBe(text);
  });
});
