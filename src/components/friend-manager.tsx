import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ContactFinder } from '@/components/contact-finder';
import { personName } from '@/components/live-post';
import { AsyncButton, AsyncIconButton, Notice } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { Loading } from '@/components/ui/loading';
import { colors, fonts, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

export function FriendManager() {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const people = useQuery(api.users.search, search ? { query: search } : 'skip');
  const incoming = usePaginatedQuery(api.friends.incomingRequests, {}, { initialNumItems: 10 });
  const send = useMutation(api.friends.sendRequest);
  const respond = useMutation(api.friends.respondToRequest);
  const [error, setError] = useState('');
  const run = (action: () => Promise<unknown>) => async () => { setError(''); await action(); };

  return (
    <Glass radius={radius.panel} style={styles.card}>
      <Text variant="heading">Find friends</Text>
      <View style={styles.searchRow}>
      <TextInput
        accessibilityLabel="Search people by name or handle"
        placeholder="Name or handle"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setSearch(text.trim())}
        returnKeyType="search"
        style={styles.input}
      />
      <IconButton icon="search" label="Search people" size={SEARCH_HEIGHT} onPress={() => setSearch(text.trim())} />
      </View>
      {!!error && <Notice>{error}</Notice>}
      {!!search && people === undefined && <Loading label="Searching…" />}
      {!!search && people?.length === 0 && <Notice>No one found.</Notice>}
      {people?.map((person) => (
        <View key={person._id} style={styles.person}>
          <View style={styles.personCopy}>
            <Text variant="label">{personName(person)}</Text>
            {person.handle && <Text variant="caption" color="muted">@{person.handle}</Text>}
            {person.relationship !== 'none' && <Text variant="meta" color="muted">{person.relationship === 'friends' ? 'Friends'
              : person.relationship === 'outgoing' ? 'Request sent' : 'Wants to add you'}</Text>}
          </View>
          {person.relationship === 'none' && (
            <AsyncIconButton icon="userPlus" label={`Add ${personName(person)}`} onError={setError} onPress={run(() => send({ userId: person._id }))} />
          )}
        </View>
      ))}
      <ContactFinder onError={setError} />
      {incoming.results.length > 0 && <Text variant="subheading">Requests</Text>}
      {incoming.results.map((request) => (
        <View key={request._id} style={styles.person}>
          <Text variant="label" style={styles.personCopy}>{personName(request.user)}</Text>
          <View style={styles.actions}>
            <AsyncIconButton icon="check" variant="ink" label={`Accept ${personName(request.user)}`} onError={setError} onPress={run(() => respond({ requestId: request._id, accept: true }))} />
            <AsyncIconButton icon="close" label={`Decline ${personName(request.user)}`} onError={setError} onPress={run(() => respond({ requestId: request._id, accept: false }))} />
          </View>
        </View>
      ))}
      {incoming.status === 'CanLoadMore' && <AsyncButton label="More requests" variant="link" onPress={async () => incoming.loadMore(10)} />}
      {incoming.status === 'LoadingMore' && <Loading label="Loading more requests…" />}
    </Glass>
  );
}

// The search field and its button share one height so the row lines up.
const SEARCH_HEIGHT = 32;

const styles = StyleSheet.create({
  card: { padding: space.inset, gap: space.stack },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  input: { flex: 1, backgroundColor: colors.tile, color: colors.ink, fontFamily: fonts.regular, borderRadius: radius.field, paddingHorizontal: space.inset, paddingVertical: 0, fontSize: 15, height: SEARCH_HEIGHT },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.stack, paddingVertical: space.inline },
  personCopy: { flex: 1, gap: space.inline },
  actions: { flexDirection: 'row', gap: space.stack },
});
