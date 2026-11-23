/**
 * App Check (reCAPTCHA Enterprise) can reject a browser it scores as a bot, often a brand-new
 * profile asking for a token the instant a page loads. The SDK then backs off for a day in that
 * browser. Cloud AI is the only enforced service, so data still loads; only cloud AI calls fail.
 */
export function isAppCheckFailure(message: string): boolean {
  return /app[\s-]?check|recaptcha|attempts allowed again/i.test(message);
}

export const APP_CHECK_BLOCKED =
  "This browser didn't pass Google's bot check (reCAPTCHA via App Check), so cloud AI is paused here for a while. On-device AI still works. Try your usual Chrome profile, not a brand-new or private one.";
