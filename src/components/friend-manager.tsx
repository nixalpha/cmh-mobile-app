import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { personName } from '@/components/live-post';
import { AsyncButton, Notice } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius } from '@/constants/theme';
import { api } from '@/lib/backend';

export function FriendManager() {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const people = useQuery(api.users.search, search ? { query: search } : 'skip');
  const incoming = usePaginatedQuery(api.friends.incomingRequests, {}, { initialNumItems: 10 });
  const send = useMutation(api.friends.sendRequest);
  const respond = useMutation(api.friends.respondToRequest);

  return (
    <Glass radius={radius.panel} style={styles.card}>
      <Text variant="heading">Find your people</Text>
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
      <AsyncButton label="Search people" variant="secondary" onPress={async () => setSearch(text.trim())} />
      {!!search && people === undefined && <Notice>Searching people…</Notice>}
      {!!search && people?.length === 0 && <Notice>No people found. Try another name or handle.</Notice>}
      {people?.map((person) => (
        <View key={person._id} style={styles.person}>
          <Text variant="label">{personName(person)}</Text>
          {person.handle && <Text variant="caption" color="muted">@{person.handle}</Text>}
          {person.relationship === 'none'
            ? <AsyncButton label={`Add ${personName(person)}`} variant="secondary" onPress={() => send({ userId: person._id })} />
            : <Text variant="meta" color="muted">{person.relationship === 'friends' ? 'Friends'
              : person.relationship === 'outgoing' ? 'Request sent' : 'Incoming request · respond below'}</Text>}
        </View>
      ))}
      <Text variant="subheading">Incoming requests</Text>
      {incoming.status === 'LoadingFirstPage' && <Notice>Loading requests…</Notice>}
      {incoming.status !== 'LoadingFirstPage' && incoming.results.length === 0 && <Notice>No incoming requests.</Notice>}
      {incoming.results.map((request) => (
        <View key={request._id} style={styles.person}>
          <Text variant="label">{personName(request.user)}</Text>
          <View style={styles.actions}>
            <AsyncButton label="Accept" onPress={() => respond({ requestId: request._id, accept: true })} />
            <AsyncButton label="Decline" variant="secondary" onPress={() => respond({ requestId: request._id, accept: false })} />
          </View>
        </View>
      ))}
      {incoming.status === 'CanLoadMore' && <AsyncButton label="More requests" variant="link" onPress={async () => incoming.loadMore(10)} />}
      {incoming.status === 'LoadingMore' && <Notice>Loading more requests…</Notice>}
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  input: { backgroundColor: colors.tile, color: colors.ink, fontFamily: fonts.regular, borderRadius: radius.field, padding: 14, fontSize: 15, minHeight: 48 },
  person: { gap: 6, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
