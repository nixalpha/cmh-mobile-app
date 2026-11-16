import { useSignInWithUsernamePassword, useSignUpWithUsernamePassword } from '@convex-dev/auth/methods/username-password/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AsyncButton, Notice } from '@/components/live-ui';
import { ProfileSetup } from '@/components/profile-setup';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/backend';
import { getDevCredentials } from '@/lib/dev-session';

export function DevSession() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  const { signIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp } = useSignUpWithUsernamePassword(api.auth);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [error, setError] = useState('');
  const started = useRef(false);
  const opening = useRef(false);

  const open = useCallback(async () => {
    if (!__DEV__ || opening.current) return;
    opening.current = true;
    setError('');
    try {
      const credentials = await getDevCredentials();
      const signedIn = await signIn(credentials);
      const result = signedIn.status === 'error' && signedIn.userError.error === 'USER_NOT_FOUND'
        ? await signUp(credentials)
        : signedIn;
      if (result.status !== 'complete') {
        setError('Could not open your dev account. Check the Convex connection, then try again.');
      }
    } catch {
      setError('Could not prepare dev mode. Check your connection and local storage, then try again.');
    } finally {
      opening.current = false;
    }
  }, [signIn, signUp]);

  useEffect(() => {
    if (!isAuthenticated && !started.current) {
      started.current = true;
      void open();
    }
  }, [isAuthenticated, open]);

  // Dev mode skips onboarding, so mark the test account as onboarded.
  useEffect(() => {
    if (me?.handle && !me.onboarded) void completeOnboarding({}).catch(() => setError('Could not skip onboarding. Try again.'));
  }, [me?.handle, me?.onboarded, completeOnboarding]);

  if (!__DEV__) return <Redirect href="/" />;
  if (isAuthenticated && me?.handle && me.onboarded) return <Redirect href="/discover" />;
  if (isAuthenticated && me) return <ProfileSetup />;

  return (
    <Screen backdrop="onboarding">
      <Text variant="title">Dev mode</Text>
      <Notice>{error || 'Opening your test account and skipping onboarding…'}</Notice>
      {!!error && <AsyncButton label="Try again" onPress={open} />}
    </Screen>
  );
}
