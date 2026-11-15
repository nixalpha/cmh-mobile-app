import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionCard } from '@/components/action-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { PageDots } from '@/components/ui/page-dots';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { radius } from '@/constants/theme';
import { seedCities, seedSelected } from '@/mocks/data';

export default function OnboardingScreen() {
  const [selected, setSelected] = useState(seedSelected);
  const [query, setQuery] = useState('');

  const toggle = (city: string) =>
    setSelected((current) => (current.includes(city) ? current.filter((name) => name !== city) : [...current, city]));

  return (
    <Screen
      backdrop="onboarding"
      style={styles.content}
      overlay={
        <Glass radius={radius.panel} style={styles.footer}>
          <View style={styles.footerCopy}>
            <Text weight="extrabold" style={styles.count}>
              {selected.length} cities
            </Text>
            <Text variant="caption" color="muted">
              {selected.length < 2 ? 'Pick at least 2 so ranking can start' : 'Enough to seed your first rankings'}
            </Text>
          </View>
          <Button
            label="Continue"
            trailingIcon="arrowRight"
            height={52}
            fontSize={15}
            style={styles.continue}
            onPress={() => router.replace('/feed')}
          />
        </Glass>
      }>
      <View style={styles.header}>
        <IconButton icon="arrowLeft" label="Back" onPress={() => router.back()} />
        <PageDots count={3} active={1} shape="bars" />
        <Pressable onPress={() => router.replace('/feed')} accessibilityRole="button" hitSlop={12}>
          <Text variant="label" weight="semibold" color="slate">
            Skip
          </Text>
        </Pressable>
      </View>

      <View style={styles.intro}>
        <Text variant="title" accessibilityRole="header">
          Where have you been?
        </Text>
        <Text color="slate">
          Pick a few cities. They start your city grid and give the ranker something to compare against.
        </Text>
      </View>

      <SearchField placeholder="Search any city" value={query} onChangeText={setQuery} />

      <View style={styles.chips}>
        {seedCities.map((city) => (
          <Chip
            key={city}
            label={city}
            size="large"
            check
            selected={selected.includes(city)}
            onPress={() => toggle(city)}
          />
        ))}
      </View>

      <ActionCard icon="photo" title="Import from Photos" subtitle="We read geotags on-device to find past trips" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  intro: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    paddingVertical: 14,
    paddingLeft: 22,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerCopy: { flex: 1, gap: 2 },
  count: { fontSize: 17, lineHeight: 22 },
  continue: { paddingHorizontal: 22 },
});
