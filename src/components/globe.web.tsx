import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GlobeProps } from '@/components/globe-types';
import { Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { CARTOON_GLOBE_HTML } from '@/generated/cartoon-globe-html';
import { parseGlobeEvent, type GlobeSync } from '@/lib/globe-bridge';
import { space } from '@/constants/theme';

export type { GlobeProps } from '@/components/globe-types';

export function Globe({ active, places, selectedId, focusRevision = 0, zoomOutRevision = 0, onSelectPlace }: GlobeProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sync = useMemo<GlobeSync>(() => ({ type: 'sync', places, selectedId, focusRevision, zoomOutRevision, active }),
    [places, selectedId, focusRevision, zoomOutRevision, active]);

  useEffect(() => {
    function receive(message: MessageEvent) {
      if (message.source !== frame.current?.contentWindow) return;
      const event = parseGlobeEvent(message.data);
      if (event?.type === 'ready') setReady(true);
      if (event?.type === 'error') setError(event.message);
      if (event?.type === 'select' && places.some((place) => place._id === event.id)) onSelectPlace?.(event.id);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [places, onSelectPlace]);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage(sync, window.location.origin);
  }, [ready, sync]);

  return (
    <View style={styles.container}>
      <iframe
        key={revision}
        ref={frame}
        title="Interactive cartoon world map"
        srcDoc={CARTOON_GLOBE_HTML}
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setReady(true)}
        style={{ width: '100%', height: '100%', border: 0, touchAction: 'none' }}
      />
      {!!error && <View style={styles.error}>
        <Notice>{error}</Notice>
        <Button label="Reload map" variant="secondary" onPress={() => {
          setError(''); setReady(false); setRevision((value) => value + 1);
        }} />
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#02040A' },
  error: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: space.inset, gap: space.stack, backgroundColor: '#FCFBF8' },
});
