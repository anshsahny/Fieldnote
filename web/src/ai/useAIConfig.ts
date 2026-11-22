import { useEffect, useState } from 'react';
import { getFirebase } from '../firebase/client';
import { aiConfigFrom, loadAIConfig, TEMPLATE_DEFAULTS, type AIConfig } from './config';

/** Remote Config, starting from the bundled template defaults until the fetch lands. */
export function useAIConfig(): AIConfig {
  const [config, setConfig] = useState<AIConfig>(() => aiConfigFrom(() => undefined, 'defaults', TEMPLATE_DEFAULTS));
  useEffect(() => {
    let live = true;
    void loadAIConfig(getFirebase().app).then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}
