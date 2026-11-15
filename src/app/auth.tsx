import { useSignInWithUsernamePassword, useSignUpWithUsernamePassword } from '@convex-dev/auth/methods/username-password/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AsyncButton, Notice } from '@/components/live-ui';
import { ProfileSetup } from '@/components/profile-setup';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, fonts } from '@/constants/theme';
import { api } from '@/lib/backend';

const authErrors: Record<string, string> = {
  INVALID_CREDENTIALS: 'That username or password is incorrect.', USER_NOT_FOUND: 'That username or password is incorrect.',
  USERNAME_TAKEN: 'That username is already taken.', PASSWORD_TOO_SHORT: 'Use a password with at least 8 characters.',
  PASSWORD_TOO_COMMON: 'Choose a less common password.', RATE_LIMITED: 'Too many attempts. Please try again shortly.',
  PASSWORD_TOO_LONG: 'That password is too long.', PASSWORD_HAS_SURROUNDING_WHITESPACE: 'Remove spaces from the start or end of your password.',
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
  if (isAuthenticated && me?.handle) return <Redirect href={signup ? '/onboarding' : '/feed'} />;
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
        <Text variant="display">{signup ? 'Your next chapter.' : 'Welcome back.'}</Text>
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
        <Button variant="link" disabled={signingIn || signingUp} label={signup ? 'Already a member? Sign in' : 'New here? Create an account'} onPress={() => { setSignup(!signup); setError(''); }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingTop: 70, gap: 20 }, form: { padding: 22, gap: 20 }, field: { gap: 8 },
  input: { padding: 15, backgroundColor: colors.tileStrong, borderRadius: 14, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
});
