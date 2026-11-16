import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AsyncButton, errorMessage, Notice } from '@/components/live-ui';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

export function ProfileSetup() {
  const update = useMutation(api.users.updateProfile);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void update({}).catch((cause) => setError(errorMessage(cause))); }, [update]);
  if (!error) return <Screen><Notice>Preparing your profile…</Notice></Screen>;
  return (
    <Screen backdrop="onboarding" style={{ flexGrow: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.inset }}>
        <Text variant="title" style={{ textAlign: 'center' }}>Choose your handle</Text>
        <Notice>{error}</Notice>
        <TextInput accessibilityLabel="Profile handle" placeholder="Your handle" autoCapitalize="none" autoCorrect={false} value={handle} onChangeText={setHandle} style={{ height: 44, paddingHorizontal: space.inset, backgroundColor: colors.white, borderRadius: radius.card, fontFamily: fonts.regular, color: colors.ink }} />
        <AsyncButton label="Continue" height={44} onPress={() => update({ handle })} />
      </View>
    </Screen>
  );
}
