import { useSignInWithUsernamePassword, useSignUpWithUsernamePassword } from '@convex-dev/auth/methods/username-password/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AsyncButton, Notice } from '@/components/live-ui';
import { ProfileSetup } from '@/components/profile-setup';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, space } from '@/constants/theme';
import { api } from '@/lib/backend';

const authErrors: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect username or password.', USER_NOT_FOUND: 'Incorrect username or password.',
  USERNAME_TAKEN: 'Username already taken.', PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
  PASSWORD_TOO_COMMON: 'Choose a less common password.', RATE_LIMITED: 'Too many attempts. Try again shortly.',
  PASSWORD_TOO_LONG: 'Password is too long.', PASSWORD_HAS_SURROUNDING_WHITESPACE: 'Remove spaces from the start or end of your password.',
};

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [signup, setSignup] = useState(params.mode === 'signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  if (isAuthenticated && !me) return <Screen><Notice>Opening your account…</Notice></Screen>;
  if (isAuthenticated && me && !me.handle) return <ProfileSetup />;
  if (isAuthenticated && me?.handle) return <Redirect href={me.onboarded ? '/feed' : '/onboarding'} />;
  const submit = async () => {
    setError('');
    const name = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) { setError('Use 3–20 lowercase letters, numbers, or underscores for your username.'); return; }
    const result = await (signup ? signUp : signIn)({ username: name, password });
    if (result.status !== 'complete') setError(authErrors[result.userError.error] ?? 'Could not sign in. Check your connection and try again.');
  };
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen backdrop="onboarding" scroll style={styles.content}>
        <Text variant="display">{signup ? 'Create account' : 'Sign in'}</Text>
        <Glass style={styles.form}>
          <View style={styles.field}>
            <Text variant="label">Username</Text>
            <TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername} placeholder="your_handle" style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text variant="label">Password</Text>
            <TextInput accessibilityLabel="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChangeText={setPassword} placeholder="At least 8 characters" style={styles.input} />
          </View>
          {!!error && <Notice>{error}</Notice>}
          <AsyncButton label={signup ? 'Create account' : 'Sign in'} disabled={signingIn || signingUp || !username || !password} onPress={submit} />
        </Glass>
        <Button variant="link" disabled={signingIn || signingUp} label={signup ? 'Sign in instead' : 'Create an account'} onPress={() => { setSignup(!signup); setError(''); }} />
        {__DEV__ && <Button label="Dev mode — skip onboarding" variant="secondary" disabled={signingIn || signingUp} onPress={() => router.push('/dev')} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { gap: space.stack }, form: { padding: space.inset, gap: space.stack }, field: { gap: space.stack },
  input: { padding: space.inset, backgroundColor: colors.tileStrong, borderRadius: radius.card, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
});
