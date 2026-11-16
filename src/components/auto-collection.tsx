import { useConvex, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';

import { AsyncButton, Notice } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { autoCollectionStatus, autoCollectionSupported, disableAutoCollection, enableAutoCollection,
  onAutoPhotoChange, syncAutoCollection, type AutoCollectionStatus } from '@/lib/auto-collection';

export function AutoCollectionRunner({ userId }: { userId: Id<'users'> | null | undefined }) {
  useEffect(() => {
    if (!autoCollectionSupported || userId === undefined) return;
    if (userId === null) { void disableAutoCollection().catch(() => {}); return; }
    let syncing = false;
    const run = async () => {
      if (syncing || AppState.currentState !== 'active') return;
      syncing = true;
      try { await syncAutoCollection(userId); } catch { /* Durable work retries on resume. */ }
      finally { syncing = false; }
    };
    void run();
    const timer = setInterval(() => { void run(); }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void run(); });
    const photos = onAutoPhotoChange(() => { void run(); });
    return () => { clearInterval(timer); subscription.remove(); photos.remove(); };
  }, [userId]);
  return null;
}

export function AutoCollectionSettings() {
  const client = useConvex();
  const me = useQuery(api.users.me, {});
  const [status, setStatus] = useState<AutoCollectionStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => { void autoCollectionStatus().then(value => { if (active) setStatus(value); }).catch(() => {
      if (active) setError('Could not read automatic collection settings. Try reopening the app.');
    }); };
    refresh();
    const subscription = AppState.addEventListener('change', refresh);
    return () => { active = false; subscription.remove(); };
  }, []);
  if (!autoCollectionSupported) return null;
  return <Glass style={styles.card}>
    <Text variant="cardTitle">Automatic collection</Text>
    <Text variant="meta" color="muted">Save nearby landmark visits and upload matching geotagged photos taken after you enable this. New visits are private. Photos added to an existing visit use its sharing setting.</Text>
    <Text variant="caption" color="muted">Requires Always location and Photos access. Full Photos access includes new photos automatically. iOS may delay background syncing; opening Travi resumes it. Up to 10 photos per landmark.</Text>
    {status && <Text variant="meta">{status.message}</Text>}
    {!!error && <Notice>{error}</Notice>}
    {status && me && <AsyncButton label={status.enabled ? 'Turn off automatic collection' : 'Enable visits and photo uploads'} variant="secondary" onPress={async () => {
      setError('');
      try {
        if (status.enabled) await disableAutoCollection(client);
        else { await enableAutoCollection(client, me._id); void syncAutoCollection(me._id).catch(() => {}); }
        setStatus(await autoCollectionStatus());
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not change automatic collection.'); }
    }} />}
    <AsyncButton label="Open iOS settings" variant="link" onPress={() => Linking.openSettings()} />
  </Glass>;
}

const styles = StyleSheet.create({ card: { padding: space.inset, gap: space.stack } });
