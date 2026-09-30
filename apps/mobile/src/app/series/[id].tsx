import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster } from '@/components/poster';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Episode, Series } from '@/data/catalog';
import { useSeries, useUnlockedEpisodeIds } from '@/data/hooks';
import { useTheme } from '@/hooks/use-theme';
import { toggleSaved, useLibrary } from '@/lib/library';

const EPISODE_COLUMNS = 6;

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useSeries(id);

  if (loading || error || !data) {
    return (
      <ThemedView style={styles.notFound}>
        <Stack.Screen options={{ title: '' }} />
        {loading ? (
          <ActivityIndicator />
        ) : error ? (
          <Pressable onPress={reload}>
            <ThemedText themeColor="textSecondary">
              {"Couldn't load this series. Tap to retry."}
            </ThemedText>
          </Pressable>
        ) : (
          <ThemedText themeColor="textSecondary">This series is not available.</ThemedText>
        )}
      </ThemedView>
    );
  }
  return <SeriesDetail series={data.series} episodes={data.episodes} />;
}

function SeriesDetail({ series, episodes }: { series: Series; episodes: Episode[] }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const library = useLibrary();
  const progress = library.progress[series.id];
  const isSaved = library.saved.includes(series.id);
  const resumeEpisode = progress?.episode ?? 1;
  const { width } = useWindowDimensions();
  const posterWidth = Math.round(width * 0.4);
  const cellSize =
    (width - Spacing.three * 2 - Spacing.two * (EPISODE_COLUMNS - 1)) / EPISODE_COLUMNS;
  const unlocked = new Set(useUnlockedEpisodeIds(series).data ?? []);
  const play = (episodeNumber: number) =>
    router.push({ pathname: '/watch/[id]', params: { id: series.id, ep: String(episodeNumber) } });
  // A muted looping trailer stands in for poster artwork; series without one show the poster.
  const player = useVideoPlayer(series.trailerUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const isFocused = useIsFocused();

  // Pause the trailer while the full-screen player is on top.
  useEffect(() => {
    if (isFocused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isFocused, player]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: series.title,
          headerRight: () => (
            <Pressable onPress={() => toggleSaved(series.id)} hitSlop={12}>
              <SymbolView
                name={isSaved ? 'bookmark.fill' : 'bookmark'}
                size={22}
                tintColor={theme.text}
              />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}>
        {/* Vertical poster beside the details: everything in the app stays portrait. */}
        <View style={styles.header}>
          {series.trailerUrl ? (
            <VideoView
              player={player}
              style={[styles.poster, { width: posterWidth }]}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Poster series={series} width={posterWidth} />
          )}
          <View style={styles.headerText}>
            <ThemedText type="subtitle" style={styles.title}>
              {series.title}
            </ThemedText>
            <View style={styles.tags}>
              {series.tags.map((tag) => (
                <ThemedView key={tag} type="backgroundElement" style={styles.tag}>
                  <ThemedText type="small">{tag}</ThemedText>
                </ThemedView>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {series.episodeCount} episodes · first {series.freeEpisodes} free
            </ThemedText>
          </View>
        </View>

        <View style={styles.info}>
          <ThemedText>{series.synopsis}</ThemedText>
          <Pressable
            onPress={() => play(resumeEpisode)}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <SymbolView name="play.fill" size={16} tintColor="#fff" />
            <ThemedText type="smallBold" style={styles.playLabel}>
              {progress ? `Continue EP ${resumeEpisode}` : 'Play EP 1'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.info}>
          <ThemedText type="smallBold">Episodes</ThemedText>
          <View style={styles.grid}>
            {episodes.map((episode) => (
              <Pressable
                key={episode.number}
                onPress={() => play(episode.number)}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView
                  type="backgroundElement"
                  style={[styles.episode, { width: cellSize, height: cellSize }]}>
                  <ThemedText type="smallBold">{episode.number}</ThemedText>
                  {!episode.free && !unlocked.has(episode.id) && (
                    <SymbolView
                      name="lock.fill"
                      size={10}
                      tintColor={theme.textSecondary}
                      style={styles.lock}
                    />
                  )}
                </ThemedView>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  poster: {
    aspectRatio: 3 / 4,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  headerText: {
    flex: 1,
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  info: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  episode: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    backgroundColor: '#FF3B5C',
  },
  playLabel: {
    color: '#fff',
  },
  pressed: {
    opacity: 0.7,
  },
  lock: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
  },
});
