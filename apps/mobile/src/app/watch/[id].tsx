import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionRail } from '@/components/action-rail';
import { CommentsSheet } from '@/components/comments-sheet';
import { EpisodeDrawer } from '@/components/episode-drawer';
import { EpisodePlayer } from '@/components/episode-player';
import { UnlockSheet } from '@/components/unlock-sheet';
import { Spacing } from '@/constants/theme';
import { getEpisodes, getSeries, type Episode, type Series } from '@/data/catalog';
import { flushLibrary, getProgress, saveProgress } from '@/lib/library';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 80 };

export default function WatchScreen() {
  const { id, ep } = useLocalSearchParams<{ id: string; ep?: string }>();
  const series = getSeries(id);

  if (!series) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This series is not available.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.missingLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }
  const requested = Number(ep) || 1;
  const start = Math.min(Math.max(requested, 1), series.episodeCount);
  return <Watch series={series} startEpisode={start} />;
}

function Watch({ series, startEpisode }: { series: Series; startEpisode: number }) {
  const insets = useSafeAreaInsets();
  const episodes = getEpisodes(series);
  const listRef = useRef<FlatList<Episode>>(null);
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(startEpisode - 1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unlockFor, setUnlockFor] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Reopening the episode you were watching picks up where you stopped.
  const [resumeAt] = useState(() => {
    const saved = getProgress(series.id);
    const nearEnd = saved != null && saved.seconds > saved.duration - 5;
    return saved?.episode === startEpisode && !nearEnd ? saved.seconds : 0;
  });

  useEffect(() => flushLibrary, []);

  // FlatList throws if this callback changes identity after mount.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Episode>[] }) => {
      const first = viewableItems[0];
      if (first?.index == null) return;
      setActiveIndex(first.index);
      if (getProgress(series.id)?.episode !== first.item.number) {
        saveProgress(series.id, first.item.number, 0, 0);
      }
      // Landing on a locked episode offers the unlock options straight away, as DramaBox does.
      if (!first.item.free) setUnlockFor(first.item.number);
    },
    [series.id],
  );

  const goTo = (episodeNumber: number, animated: boolean) => {
    listRef.current?.scrollToIndex({ index: episodeNumber - 1, animated });
  };

  const active = episodes[activeIndex];

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {height > 0 && (
        <FlatList<Episode>
          ref={listRef}
          data={episodes}
          keyExtractor={(item) => String(item.number)}
          renderItem={({ item, index }) =>
            item.free ? (
              <EpisodePlayer
                episode={item}
                height={height}
                isActive={index === activeIndex}
                startAt={item.number === startEpisode ? resumeAt : 0}
                onProgress={(seconds, duration) =>
                  saveProgress(series.id, item.number, seconds, duration)
                }
                onEnd={() => {
                  if (index + 1 < episodes.length) goTo(item.number + 1, true);
                }}
              />
            ) : (
              <LockedEpisode
                episode={item}
                height={height}
                onUnlock={() => setUnlockFor(item.number)}
              />
            )
          }
          initialScrollIndex={startEpisode - 1}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          // Keep only the current episode and its neighbours mounted: one player each.
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          viewabilityConfig={VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          contentInsetAdjustmentBehavior="never"
        />
      )}

      <View
        style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}
        pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconButton}>
          <SymbolView name="chevron.down" size={22} tintColor="#fff" />
        </Pressable>
        <View style={styles.titleBlock} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {series.title}
          </Text>
          <Text style={styles.subtitle}>
            EP {active?.number ?? startEpisode} / {series.episodeCount}
          </Text>
        </View>
        <Pressable onPress={() => setDrawerOpen(true)} hitSlop={12} style={styles.iconButton}>
          <SymbolView name="list.bullet" size={22} tintColor="#fff" />
        </Pressable>
      </View>

      <View
        style={[styles.railSlot, { bottom: insets.bottom + Spacing.six }]}
        pointerEvents="box-none">
        <ActionRail
          seriesId={series.id}
          seriesTitle={series.title}
          episode={active?.number ?? startEpisode}
          onComments={() => setCommentsOpen(true)}
        />
      </View>

      <EpisodeDrawer
        visible={drawerOpen}
        title={series.title}
        episodes={episodes}
        current={active?.number ?? startEpisode}
        onSelect={(n) => {
          setDrawerOpen(false);
          goTo(n, false);
        }}
        onClose={() => setDrawerOpen(false)}
      />
      <CommentsSheet
        visible={commentsOpen}
        episode={active?.number ?? startEpisode}
        onClose={() => setCommentsOpen(false)}
      />
      <UnlockSheet
        visible={unlockFor != null}
        episodeNumber={unlockFor ?? 0}
        coinPrice={series.coinPrice}
        onClose={() => setUnlockFor(null)}
      />
    </View>
  );
}

function LockedEpisode({
  episode,
  height,
  onUnlock,
}: {
  episode: Episode;
  height: number;
  onUnlock: () => void;
}) {
  return (
    <View style={[styles.locked, { height }]}>
      <SymbolView name="lock.fill" size={40} tintColor="rgba(255,255,255,0.8)" />
      <Text style={styles.lockedTitle}>Episode {episode.number} is locked</Text>
      <Pressable
        onPress={onUnlock}
        style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed]}>
        <Text style={styles.unlockLabel}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  railSlot: {
    position: 'absolute',
    right: 0,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
  },
  locked: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    backgroundColor: '#111',
  },
  lockedTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  unlockButton: {
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    backgroundColor: '#FF3B5C',
  },
  pressed: {
    opacity: 0.7,
  },
  unlockLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    backgroundColor: '#000',
  },
  missingText: {
    color: '#fff',
    fontSize: 16,
  },
  missingLink: {
    color: '#FF3B5C',
    fontSize: 16,
  },
});
