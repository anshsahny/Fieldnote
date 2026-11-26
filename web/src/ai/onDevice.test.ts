import { afterEach, describe, expect, it, vi } from 'vitest';
import { prewarmOnDevice } from './onDevice';

describe('prewarmOnDevice', () => {
  afterEach(() => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  });

  it('opens a session with the same inputs as the hybrid model and destroys it on cleanup', async () => {
    const destroy = vi.fn();
    const create = vi.fn(async () => ({ destroy }));
    (globalThis as { LanguageModel?: unknown }).LanguageModel = { create };
    const dispose = prewarmOnDevice(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(create).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    dispose();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('is a no-op without the Prompt API, and never throws', async () => {
    expect(() => prewarmOnDevice(false)()).not.toThrow();
    (globalThis as { LanguageModel?: unknown }).LanguageModel = { create: () => Promise.reject(new Error('NotAllowedError')) };
    const dispose = prewarmOnDevice(false);
    await Promise.resolve();
    expect(() => dispose()).not.toThrow();
  });
});
