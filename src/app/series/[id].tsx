import { Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { getEpisodes, getSeries, type Series } from "@/data/catalog";
import { useTheme } from "@/hooks/use-theme";

const EPISODE_COLUMNS = 6;

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const series = getSeries(id);

  if (!series) {
    return (
      <ThemedView style={styles.notFound}>
        <Stack.Screen options={{ title: "" }} />
        <ThemedText themeColor="textSecondary">
          This series is not available.
        </ThemedText>
      </ThemedView>
    );
  }
  return <SeriesDetail series={series} />;
}

function SeriesDetail({ series }: { series: Series }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cellSize =
    (width - Spacing.three * 2 - Spacing.two * (EPISODE_COLUMNS - 1)) /
    EPISODE_COLUMNS;
  const episodes = getEpisodes(series);
  // Muted looping trailer stands in for a poster until we have artwork.
  const player = useVideoPlayer(series.trailerUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: series.title }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
      >
        <VideoView
          player={player}
          style={styles.poster}
          contentFit="cover"
          nativeControls={false}
        />

        <View style={styles.info}>
          <ThemedText type="subtitle">{series.title}</ThemedText>
          <View style={styles.tags}>
            {series.tags.map((tag) => (
              <ThemedView key={tag} type="backgroundElement" style={styles.tag}>
                <ThemedText type="small">{tag}</ThemedText>
              </ThemedView>
            ))}
          </View>
          <ThemedText>{series.synopsis}</ThemedText>
        </View>

        <View style={styles.info}>
          <ThemedText type="smallBold">
            {series.episodeCount} episodes · first {series.freeEpisodes} free
          </ThemedText>
          <View style={styles.grid}>
            {episodes.map((episode) => (
              <ThemedView
                key={episode.number}
                type="backgroundElement"
                style={[styles.episode, { width: cellSize, height: cellSize }]}
              >
                <ThemedText type="smallBold">{episode.number}</ThemedText>
                {!episode.free && (
                  <SymbolView
                    name="lock.fill"
                    size={10}
                    tintColor={theme.textSecondary}
                    style={styles.lock}
                  />
                )}
              </ThemedView>
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
    alignItems: "center",
    justifyContent: "center",
  },
  poster: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  info: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  episode: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Spacing.two,
  },
  lock: {
    position: "absolute",
    top: Spacing.one,
    right: Spacing.one,
  },
});
