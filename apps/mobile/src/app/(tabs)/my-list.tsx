import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Poster } from '@/components/poster';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getSeries, type Series } from '@/data/catalog';
import { useLibrary, type SeriesProgress } from '@/lib/library';

export default function MyListScreen() {
  const library = useLibrary();

  const continueWatching = Object.entries(library.progress)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .flatMap(([id, progress]) => {
      const series = getSeries(id);
      return series ? [{ series, progress }] : [];
    });
  const saved = library.saved.flatMap((id) => getSeries(id) ?? []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">My List</ThemedText>

          <Section title="Continue watching" empty="Series you start watching show up here.">
            {continueWatching.map(({ series, progress }) => (
              <ContinueRow key={series.id} series={series} progress={progress} />
            ))}
          </Section>

          <Section title="Saved" empty="Tap the bookmark on a series to save it.">
            {saved.map((series) => (
              <SavedRow key={series.id} series={series} />
            ))}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children.length > 0 ? (
        children
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {empty}
        </ThemedText>
      )}
    </View>
  );
}

function ContinueRow({ series, progress }: { series: Series; progress: SeriesProgress }) {
  const fraction = progress.duration > 0 ? progress.seconds / progress.duration : 0;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/watch/[id]',
          params: { id: series.id, ep: String(progress.episode) },
        })
      }
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <Poster series={series} width={54} />
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {series.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            EP {progress.episode} / {series.episodeCount}
          </ThemedText>
          <ThemedView type="backgroundSelected" style={styles.track}>
            <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          </ThemedView>
        </View>
      </ThemedView>
    </Pressable>
  );
}

function SavedRow({ series }: { series: Series }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <Poster series={series} width={54} />
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {series.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {series.tags.join(' · ')} · {series.episodeCount} episodes
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.one,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: Spacing.one,
  },
  fill: {
    height: 3,
    backgroundColor: '#FF3B5C',
  },
  pressed: {
    opacity: 0.7,
  },
});
