import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedItem } from '@/components/feed-item';
import { BottomTabInset } from '@/constants/theme';
import type { Series } from '@/data/catalog';
import { useSeriesList } from '@/data/hooks';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 80 };

export default function ForYouScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const catalog = useSeriesList();

  // FlatList throws if this callback changes identity after mount.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
    },
    [],
  );

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {catalog.loading && <ActivityIndicator style={styles.status} color="#fff" size="large" />}
      {catalog.error ? (
        <Pressable style={styles.status} onPress={catalog.reload}>
          <Text style={styles.statusText}>{"Couldn't load the feed. Tap to retry."}</Text>
        </Pressable>
      ) : null}
      {catalog.data?.length === 0 && (
        <Text style={[styles.status, styles.statusText]}>New series are on the way.</Text>
      )}
      {height > 0 && catalog.data && (
        <FlatList<Series>
          data={catalog.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <FeedItem
              series={item}
              height={height}
              isActive={isFocused && index === activeIndex}
              bottomInset={BottomTabInset + insets.bottom}
            />
          )}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          // Keep only the current item and its neighbours mounted: one player each.
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          viewabilityConfig={VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          contentInsetAdjustmentBehavior="never"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  status: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 15,
  },
});
