import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Select } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { colors, fonts } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { answer, isPlaced, maxPicks, opponentIndex, startRange, type Outcome, type Range } from '../../../convex/lib/ranking';

const months = ['Unknown', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type Session = { size: number; version: number; range: Range; answers: { opponentId: Id<'destinations'>; outcome: Outcome }[] };

export default function RankScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || !/^[a-z0-9]{32}$/.test(id)) return <Screen><Notice>This place could not be found.</Notice><Button label="Find a place" onPress={() => router.replace('/discover')} /></Screen>;
  return <RankDestination key={id} id={id as Id<'destinations'>} />;
}

function RankDestination({ id }: { id: Id<'destinations'> }) {
  const catalog = useQuery(api.destinations.get, { destinationId: id });
  if (catalog === undefined) return <Screen><Notice>Loading place…</Notice></Screen>;
  if (catalog === null) return <Screen><Notice>This place is no longer available.</Notice><Button label="Back to places" onPress={() => router.replace('/discover')} /></Screen>;
  return <RankForm id={id} name={catalog.destination.name} />;
}

function RankForm({ id, name }: { id: Id<'destinations'>; name: string }) {
  const convex = useConvex();
  const place = useMutation(api.rankings.place);
  const detail = useQuery(api.places.destination, { destinationId: id });
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('Unknown');
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{ rank: number; size: number; score: number } | null>(null);
  const [share, setShare] = useState(true);
  const [note, setNote] = useState('');
  const [changed, setChanged] = useState(false);
  const opponents = useQuery(api.rankings.opponents, session && !isPlaced(session.range) ? { list: 'destinations', ranks: [opponentIndex(session.range) + 1] } : 'skip');
  const opponent = opponents?.[0];
  const start = async () => {
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear())) throw new ConvexError({ message: 'Enter a year between 1900 and this year, or leave it blank.' });
    if (month !== 'Unknown' && !year) throw new ConvexError({ message: 'Enter a year for the selected month, or choose Unknown.' });
    const header = await convex.query(api.rankings.session, { list: 'destinations' });
    setSession({ ...header, range: startRange(header.size), answers: [] });
    setChanged(false);
  };
  const choose = (outcome: Outcome) => {
    if (!session || !opponent) return;
    setSession((current) => current !== session ? current : {
      ...session, range: answer(session.range, outcome),
      answers: [...session.answers, { opponentId: opponent.itemId as Id<'destinations'>, outcome }],
    });
  };
  const save = async () => {
    if (!session) return;
    try {
      const placed = await place({
        list: 'destinations', itemId: id, version: session.version, answers: session.answers,
        visit: detail?.viewer.visit ? undefined : { year: year ? Number(year) : undefined, month: month === 'Unknown' ? undefined : months.indexOf(month) },
        post: share ? { note: note.trim() || undefined, showPair: session.answers.length > 0 } : undefined,
      });
      setResult(placed);
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data && error.data.code === 'LIST_CHANGED') setChanged(true);
      throw error;
    }
  };

  return (
    <Screen backdrop="rank" scroll style={styles.content}>
      <View style={styles.header}>
        <IconButton icon="close" label="Close ranking" onPress={() => router.replace(`/place/${id}`)} />
        <View style={styles.title}><Text variant="title2">Rank {name}</Text><Notice>Your places, in your order</Notice></View>
      </View>
      {result ? (
        <Glass style={styles.panel}>
          <Text variant="display">#{result.rank}</Text>
          <Text variant="title2">{name} is on your list.</Text>
          <Text>#{result.rank} of {result.size} · {result.score.toFixed(1)} / 10</Text>
          <Notice>{share ? 'Shared with friends. Your feed will update shortly.' : 'Saved to your rankings without a feed post.'}</Notice>
          <Button label="Done" onPress={() => router.replace(`/place/${id}`)} />
        </Glass>
      ) : detail === undefined ? <Notice>Loading your ranking…</Notice> : detail.viewer.rank !== null ? (
        <Glass style={styles.panel}><Text variant="title2">Already ranked #{detail.viewer.rank}</Text><Notice>Re-ranking is not part of this demo yet.</Notice><Button label="Back to place" onPress={() => router.replace(`/place/${id}`)} /></Glass>
      ) : !session ? (
        <>
          <Text variant="title">When did you visit?</Text>
          <Notice>{detail.viewer.visit ? 'This place is already in your visits. Its recorded date will stay unchanged.' : 'Record a past visit, or leave the date unknown. Visits are self-reported.'}</Notice>
          {!detail.viewer.visit && <Glass style={styles.panel}>
            <Text variant="label">Year (optional)</Text>
            <TextInput accessibilityLabel="Visit year" placeholder="Unknown" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} style={styles.input} />
            <Select label="Month (optional)" options={months} value={month} onChange={setMonth} />
          </Glass>}
          <AsyncButton label="Start comparing" onPress={start} />
        </>
      ) : changed ? (
        <Glass style={styles.panel}><Text variant="title2">Your list changed</Text><Notice>Nothing was saved. Restart the comparisons against your latest list.</Notice><AsyncButton label="Restart comparisons" onPress={start} /></Glass>
      ) : isPlaced(session.range) ? (
        <Glass style={styles.panel}>
          <Text variant="title">Your {session.size === 0 ? 'first' : 'next'} favorite.</Text>
          <Notice>{session.size === 0 ? 'No comparisons needed for your first ranked place.' : 'Comparisons complete. Save to make the ranking official.'}</Notice>
          <View style={styles.header}><Text style={styles.title}>Post to friends</Text><Switch accessibilityLabel="Post ranking to friends" value={share} onValueChange={setShare} /></View>
          {share && <TextInput accessibilityLabel="Ranking note" placeholder="What made it special? (optional)" multiline maxLength={280} value={note} onChangeText={setNote} style={styles.input} />}
          <AsyncButton label="Save ranking" onPress={save} />
        </Glass>
      ) : (
        <>
          <Text variant="title">Which would you choose again?</Text>
          <Notice>Comparison {session.answers.length + 1} · up to {maxPicks(session.size)} choices</Notice>
          <Glass style={styles.panel}>
            <Button label={name} disabled={!opponent} onPress={() => choose('new')} />
            <Text variant="meta" color="muted" style={styles.or}>OR</Text>
            <Button variant="secondary" label={opponent?.destination?.name ?? 'Loading opponent…'} disabled={!opponent} onPress={() => choose('existing')} />
            <Button variant="link" label="Too close to call" disabled={!opponent} onPress={() => choose('tie')} />
            <Notice>Too close places {name} directly below the other place.</Notice>
            {opponents && !opponent && <><Notice>Your list may have changed.</Notice><AsyncButton label="Restart comparisons" onPress={start} /></>}
          </Glass>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1 },
  panel: { padding: 22, gap: 18 }, input: { padding: 16, borderRadius: 14, backgroundColor: colors.tileStrong, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  or: { textAlign: 'center' },
});
