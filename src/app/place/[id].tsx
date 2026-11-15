import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AsyncButton, Notice, PlaceArt } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const destinationId = typeof id === 'string' && /^[a-z0-9]{32}$/i.test(id) ? id as Id<'destinations'> : null;
  const catalog = useQuery(api.destinations.get, destinationId ? { destinationId } : 'skip');
  const detail = useQuery(api.places.destination, destinationId && catalog ? { destinationId } : 'skip');
  const landmarks = useQuery(api.places.landmarkProgress, destinationId && catalog ? { destinationId } : 'skip');
  const save = useMutation(api.places.save);
  const unsave = useMutation(api.places.unsave);
  const addVisit = useMutation(api.places.addVisit);
  const unlock = useMutation(api.places.unlockLandmark);
  const lock = useMutation(api.places.lockLandmark);

  return (
    <Screen backdrop="place" scroll>
      <View style={styles.bar}>
        <IconButton icon="arrowLeft" label="Back" onPress={() => router.back()} />
      </View>
      {!destinationId || catalog === null ? <Notice>Place not found.</Notice> : !detail ? <Notice>Loading place…</Notice> : (
        <>
          <PlaceArt place={detail.destination} height={200} />
          <Glass style={styles.card}>
            <Text variant="eyebrow" color="muted">{detail.destination.countryName} · {detail.destination.kind}</Text>
            <Text variant="title" accessibilityRole="header">{detail.destination.name}</Text>
            {detail.destination.admin1 && <Text color="slate">{detail.destination.admin1}</Text>}
            {detail.viewer.rank !== null && <Text variant="cardTitle">Your #{detail.viewer.rank} of {detail.viewer.listSize}</Text>}
            {detail.friends.visitedCount > 0 && (
              <Text color="slate">{detail.friends.visitedCount} friends have visited</Text>
            )}
            {detail.friends.averageScore !== null && (
              <Text variant="caption" color="muted">Friends’ avg: {detail.friends.averageScore.toFixed(1)}</Text>
            )}
            {detail.viewer.visit ? <Notice>In your visited places</Notice> : (
              <AsyncButton label="I’ve been here" onPress={() => addVisit({ destinationId })} />
            )}
            {detail.viewer.rank === null && (
              <Button label="Rank this place" icon="rank" onPress={() => router.push({ pathname: '/rank/[id]', params: { id: destinationId } })} />
            )}
            <AsyncButton
              label={detail.viewer.saved ? 'Remove from want to go' : 'Want to go'}
              variant="secondary"
              onPress={() => detail.viewer.saved ? unsave({ destinationId }) : save({ destinationId })}
            />
          </Glass>
          <View style={styles.landmarks}>
            <Text variant="title2">Landmarks</Text>
            <Text color="slate">{detail.viewer.visit?.unlockCount ?? 0} of {detail.destination.landmarkCount} collected</Text>
            {!detail.viewer.visit && <Notice>Mark this place visited to unlock landmarks.</Notice>}
            {landmarks === undefined ? <Notice>Loading landmarks…</Notice> : landmarks.length === 0 ? <Notice>No landmarks yet.</Notice> : landmarks.map(({ landmark, unlocked, friendsUnlocked }) => (
              <Glass key={landmark._id} style={styles.card}>
                <Text variant="cardTitle">{landmark.name}</Text>
                <Text variant="caption" color="muted">{landmark.category}</Text>
                {unlocked && <Text color="slate">Collected</Text>}
                {friendsUnlocked > 0 && <Text variant="caption" color="muted">{friendsUnlocked} friends collected</Text>}
                {detail.viewer.visit && (
                  <AsyncButton
                    label={unlocked ? 'Undo' : 'I’ve been here'}
                    variant="secondary"
                    onPress={() => unlocked ? lock({ landmarkId: landmark._id }) : unlock({ landmarkId: landmark._id })}
                  />
                )}
              </Glass>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 20, gap: 12 },
  landmarks: { gap: 12 },
});
