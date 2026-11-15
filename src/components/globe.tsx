import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { GlobeProps } from '@/components/globe-types';
import { Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { CARTOON_GLOBE_HTML } from '@/generated/cartoon-globe-html';
import { parseGlobeEvent, type GlobeSync } from '@/lib/globe-bridge';
import { space } from '@/constants/theme';

export type { GlobeProps } from '@/components/globe-types';
const SOURCE = { html: CARTOON_GLOBE_HTML };

export function Globe({ active, places, selectedId, focusRevision = 0, zoomOutRevision = 0, onSelectPlace }: GlobeProps) {
  const webview = useRef<WebView<Record<never, never>>>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const sync = useMemo<GlobeSync>(() => ({ type: 'sync', places, selectedId, focusRevision, zoomOutRevision, active: active && foreground }),
    [places, selectedId, focusRevision, zoomOutRevision, active, foreground]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (ready) webview.current?.injectJavaScript(`window.receiveGlobeMessage?.(${JSON.stringify(sync)});true;`);
  }, [ready, sync]);

  return (
    <View style={styles.container}>
      <WebView<Record<never, never>>
        key={revision}
        ref={webview}
        source={SOURCE}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        allowFileAccess={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        onMessage={({ nativeEvent }) => {
          const event = parseGlobeEvent(nativeEvent.data);
          if (event?.type === 'ready') setReady(true);
          if (event?.type === 'error') setError(event.message);
          if (event?.type === 'select' && places.some((place) => place._id === event.id)) onSelectPlace?.(event.id);
        }}
        onError={() => setError('Could not open the 3D map. Try reloading.')}
        onContentProcessDidTerminate={() => { setReady(false); setRevision((value) => value + 1); }}
        style={styles.map}
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
  map: { flex: 1, backgroundColor: '#02040A' },
  error: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: space.inset, gap: space.stack, backgroundColor: '#FCFBF8' },
});
