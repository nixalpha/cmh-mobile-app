import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionCard } from '@/components/action-card';
import { CityTile } from '@/components/city-tile';
import { Chip } from '@/components/ui/chip';
import { ProofLegend } from '@/components/ui/proof';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { cities, cityFilters, citySummary } from '@/mocks/data';

export default function CitiesScreen() {
  const [filter, setFilter] = useState(cityFilters[0]);
  const rows = Array.from({ length: Math.ceil(cities.length / 2) }, (_, index) => cities.slice(index * 2, index * 2 + 2));

  return (
    <Screen backdrop="cities" scroll>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Your cities
        </Text>
        <Text variant="bodySmall" color="muted">
          {citySummary}
        </Text>
        <ProofLegend />
      </View>

      <View style={styles.filters}>
        {cityFilters.map((option) => (
          <Chip key={option} label={option} selected={option === filter} onPress={() => setFilter(option)} />
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0].id} style={styles.row}>
            {row.map(({ id, ...city }) => (
              <CityTile
                key={id}
                {...city}
                onPress={id === 'paris' ? () => router.push('/city/paris') : undefined}
              />
            ))}
          </View>
        ))}
        <ActionCard
          dashed
          round
          radius={26}
          icon="plus"
          title="Add a past trip"
          subtitle="From Photos or by hand · 8 more cities"
          onPress={() => router.push('/onboarding')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  filters: { flexDirection: 'row', gap: 8 },
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
});
