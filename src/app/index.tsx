import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedItem } from '@/components/feed-item';
import { BottomTabInset } from '@/constants/theme';
import { SAMPLE_SERIES, type Series } from '@/data/catalog';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 80 };

export default function ForYouScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // FlatList throws if this callback changes identity after mount.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }, []);

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {height > 0 && (
        <FlatList<Series>
          data={SAMPLE_SERIES}
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
});
