import { useAction, useQuery } from 'convex/react';
import { openURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { Skeleton } from '@/components/ui/loading';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';
import { space } from '@/constants/theme';

/** The expanded part of a landmark card: a short Wikipedia blurb and a link to the article. */
export function LandmarkDetails({ landmarkId, name }: { landmarkId: Id<'landmarks'>; name: string }) {
  const info = useQuery(api.landmarkSummaries.get, { landmarkId });
  const fetchSummary = useAction(api.landmarkSummaries.fetch);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Nobody has opened this landmark before: fetch the blurb once. The query fills in when it is stored.
  useEffect(() => {
    if (info !== null) return;
    let live = true;
    fetchSummary({ landmarkId }).catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [info, landmarkId, fetchSummary, attempt]);

  return (
    <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={styles.details}>
      {info ? (
        <>
          <Text color="slate">{info.summary ?? 'No description yet.'}</Text>
          {info.wikipediaUrl && (
            <Text
              variant="bodySmall"
              color="accent"
              weight="semibold"
              accessibilityRole="link"
              accessibilityHint={`Opens the Wikipedia article about ${name}`}
              onPress={() => openURL(info.wikipediaUrl!)}>
              Read on Wikipedia
            </Text>
          )}
        </>
      ) : failed ? (
        <Text variant="bodySmall" color="muted" accessibilityLiveRegion="polite">
          Couldn’t load the description.{' '}
          <Text
            variant="bodySmall"
            color="accent"
            accessibilityRole="button"
            onPress={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}>
            Try again
          </Text>
        </Text>
      ) : (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`Loading a description of ${name}`} style={styles.lines}>
          <Skeleton height={13} />
          <Skeleton width="85%" height={13} />
          <Skeleton width="55%" height={13} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  details: { gap: space.inline },
  lines: { gap: 8, paddingVertical: 2 },
});
