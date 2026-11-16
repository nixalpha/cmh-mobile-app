import { useConvex, useMutation, useQuery } from 'convex/react';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { openSettings } from 'expo-linking';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { personName } from '@/components/live-post';
import { AsyncButton, AsyncIconButton, Notice } from '@/components/live-ui';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';
import { phoneKey } from '@/lib/contacts';

const CHUNK = 500;

export function ContactFinder({ onError }: { onError: (message: string) => void }) {
  const client = useConvex();
  const me = useQuery(api.users.me, {});
  const setPhoneKey = useMutation(api.users.setPhoneKey);
  const send = useMutation(api.friends.sendRequest);
  const [phone, setPhone] = useState('');
  const [names, setNames] = useState<Map<string, string> | null>(null);
  const [message, setMessage] = useState('');
  // Discovery is a one-shot scan; this subscription keeps the matched rows live.
  const matches = useQuery(api.users.matchContacts, names?.size ? { phoneKeys: [...names.keys()] } : 'skip');

  if (Platform.OS === 'web') return null;

  async function connect() {
    setMessage('');
    const permission = await requestPermissionsAsync();
    if (!permission.granted) { setMessage('Contacts access is off.'); return; }
    const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const);
    const byKey = new Map<string, string>();
    for (const contact of contacts) {
      for (const entry of contact.phones ?? []) {
        const key = entry.number ? await phoneKey(entry.number) : null;
        if (key && !byKey.has(key)) byKey.set(key, contact.fullName ?? '');
      }
    }
    const found = new Map<string, string>();
    const keys = [...byKey.keys()];
    for (let i = 0; i < keys.length; i += CHUNK) {
      const page = await client.query(api.users.matchContacts, { phoneKeys: keys.slice(i, i + CHUNK) });
      for (const match of page) found.set(match.phoneKey, byKey.get(match.phoneKey) ?? '');
    }
    setNames(found);
    if (found.size === 0) setMessage('None of your contacts are on Travi yet.');
  }

  async function savePhone() {
    const key = await phoneKey(phone);
    if (!key) { onError('Enter a valid phone number.'); return; }
    await setPhoneKey({ phoneKey: key });
    setPhone('');
  }

  return <View style={styles.section}>
    <Text variant="subheading">From your contacts</Text>
    {me && !me.hasPhone && <View style={styles.row}>
      <TextInput accessibilityLabel="Your phone number" placeholder="Your number, so friends find you" placeholderTextColor={colors.muted}
        keyboardType="phone-pad" textContentType="telephoneNumber" value={phone} onChangeText={setPhone} style={styles.input} />
      <AsyncIconButton icon="check" label="Save phone number" disabled={!phone.trim()} onError={onError} onPress={savePhone} />
    </View>}
    <AsyncButton label={names ? 'Rescan contacts' : 'Connect contacts'} variant="secondary" onPress={() => connect().catch(() => setMessage('Could not read your contacts. Try again.'))} />
    {!!message && <Notice>{message}</Notice>}
    {message === 'Contacts access is off.' && <AsyncButton label="Open device settings" variant="link" onPress={openSettings} />}
    {matches?.map(person => (
      <View key={person._id} style={styles.row}>
        <View style={styles.copy}>
          <Text variant="label">{personName(person)}</Text>
          <Text variant="caption" color="muted">{[names?.get(person.phoneKey), person.handle && `@${person.handle}`].filter(Boolean).join(' · ')}</Text>
        </View>
        {person.relationship === 'none'
          ? <AsyncIconButton icon="userPlus" label={`Add ${personName(person)}`} onError={onError} onPress={() => send({ userId: person._id })} />
          : <Text variant="meta" color="muted">{person.relationship === 'friends' ? 'Friends' : person.relationship === 'outgoing' ? 'Requested' : 'Wants to add you'}</Text>}
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: space.stack },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  copy: { flex: 1, gap: space.inline },
  input: { flex: 1, backgroundColor: colors.tile, color: colors.ink, fontFamily: fonts.regular, borderRadius: radius.field, padding: space.inset, fontSize: 15, minHeight: 48 },
});
