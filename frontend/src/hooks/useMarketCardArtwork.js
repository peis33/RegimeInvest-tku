import { useCallback, useEffect, useState } from 'react';
import { loadLocalRawResource } from 'react-native-svg/css';

export default function useMarketCardArtwork(frameAsset, animalAsset) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setResult(null);
    // Do not mount a frame-only SVG, even if its much smaller file loads first.
    Promise.all([loadLocalRawResource(frameAsset), loadLocalRawResource(animalAsset)])
      .then(([frameXml, animalXml]) => {
        if (typeof frameXml !== 'string' || typeof animalXml !== 'string') {
          throw new Error('Unable to load market card artwork');
        }
        if (active) setResult({ frameAsset, animalAsset, attempt, frameXml, animalXml });
      })
      .catch((error) => {
        if (active) setResult({ frameAsset, animalAsset, attempt, error });
      });
    return () => { active = false; };
  }, [frameAsset, animalAsset, attempt]);

  const current = result?.frameAsset === frameAsset && result?.animalAsset === animalAsset
    && result?.attempt === attempt ? result : null;
  return { artwork: current?.error ? null : current, error: current?.error, retry };
}
