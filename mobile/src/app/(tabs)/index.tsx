import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Brand, Spacing } from '@/constants/theme';
import {
  fetchBeanieGroups,
  formatCents,
  thumbUrl,
  type BeanieOption,
} from '@/lib/api';

/**
 * Browse tab: the storefront grid, backed by the web app's /api/listings
 * endpoint (active listings grouped by beanie with a price range). Tapping a
 * card pushes the native listing detail screen.
 *
 * Paging state is deliberately split three ways (a single overloaded cursor
 * caused real bugs here):
 *  - nextOffsetRef — the cursor for the next page (null = no more pages).
 *  - pendingRef    — re-entrancy gate for onEndReached (FlatList fires it
 *                    repeatedly); reopened even when a page fetch fails, so
 *                    one network blip never permanently kills infinite scroll.
 *  - reqIdRef      — request generation; bumped by refresh/initial loads so a
 *                    stale in-flight append can't interleave pages after a
 *                    pull-to-refresh.
 */
export default function BrowseScreen() {
  const [items, setItems] = useState<BeanieOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const nextOffsetRef = useRef<number | null>(0);
  const pendingRef = useRef(false);
  const reqIdRef = useRef(0);
  // Mirrors items.length (kept in sync in the success path) so the failure
  // handler can reopen the cursor from what's currently loaded without needing
  // `items` in the loadPage closure.
  const currentCountRef = useRef(0);

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    // A replace (initial/refresh) supersedes anything in flight.
    const reqId = replace ? ++reqIdRef.current : reqIdRef.current;
    try {
      const page = await fetchBeanieGroups(offset);
      if (reqId !== reqIdRef.current) return; // superseded — discard
      setItems((cur) => {
        const next = replace ? page.items : [...cur, ...page.items];
        currentCountRef.current = next.length;
        return next;
      });
      nextOffsetRef.current = page.nextOffset;
      setError('');
    } catch {
      if (reqId !== reqIdRef.current) return;
      // Reopen the paging cursor on ANY failure, so a transient blip never
      // permanently kills infinite scroll. On a failed append, retry from the
      // same offset; on a failed refresh (which cleared the cursor), resume
      // from what's currently loaded rather than leaving it stuck at null.
      nextOffsetRef.current = replace ? currentCountRef.current : offset;
      setError(
        replace
          ? "Couldn't reach Beanie Xchange. Pull to retry."
          : "Couldn't load more listings. Keep scrolling to retry.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPage(0, true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Close the pagination cursor while refreshing; loadPage(replace) bumps
    // the request generation so a stale in-flight append is discarded.
    nextOffsetRef.current = null;
    await loadPage(0, true);
    setRefreshing(false);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (pendingRef.current) return;
    const offset = nextOffsetRef.current;
    if (offset === null) return;
    pendingRef.current = true;
    setLoadingMore(true);
    loadPage(offset, false).finally(() => {
      pendingRef.current = false;
      setLoadingMore(false);
    });
  }, [loadPage]);

  const renderItem: ListRenderItem<BeanieOption> = useCallback(
    ({ item }) => <BeanieCard group={item} />,
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedText type="subtitle" style={styles.heading}>
          Beanie Xchange
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
          Authenticated Beanie Babies, held in escrow until verified.
        </ThemedText>

        {loading ? (
          <ThemedView style={styles.center}>
            <ActivityIndicator color={Brand.pink} size="large" />
          </ThemedView>
        ) : (
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Brand.pink}
              />
            }
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {error || 'No listings yet — check back soon.'}
              </ThemedText>
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator color={Brand.pink} style={styles.footer} />
              ) : null
            }
            renderItem={renderItem}
          />
        )}
        {!!error && items.length > 0 && (
          <ThemedText type="small" style={styles.errorBar}>
            {error}
          </ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

// Key on the cheapest listing's id (globally unique) rather than beanieName:
// offset pages can overlap if inventory shifts mid-scroll, and duplicate names
// would collide as keys.
const keyExtractor = (g: BeanieOption) => g.cheapest.id;

// Memoized: parent state changes constantly during paging/refresh, and cards
// only need to re-render when their own group data changes.
const BeanieCard = memo(function BeanieCard({ group }: { group: BeanieOption }) {
  const price =
    group.minCents === group.maxCents
      ? formatCents(group.minCents)
      : `${formatCents(group.minCents)}–${formatCents(group.maxCents)}`;

  // Open the cheapest listing's native detail screen.
  return (
    <Link href={`/listing/${group.cheapest.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <Image
            source={thumbUrl(group.photo)}
            placeholder={null}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={group.beanieName}
          />
          <ThemedText type="smallBold" numberOfLines={2} style={styles.cardTitle}>
            {group.beanieName}
            {group.year ? ` (${group.year})` : ''}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.price}>
            {price}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {group.optionCount === 1
              ? '1 option'
              : `${group.optionCount} options`}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  heading: { marginTop: Spacing.two },
  tagline: { marginBottom: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three },
  row: { gap: Spacing.three },
  // flex:1 shares each row between two cards; maxWidth stops a lone
  // last-row card from stretching across the whole row.
  cell: { flex: 1, maxWidth: '50%' },
  card: {
    flex: 1,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  photo: {
    aspectRatio: 1,
    borderRadius: Spacing.two,
    backgroundColor: Brand.line,
  },
  cardTitle: { marginTop: Spacing.one },
  price: { color: Brand.pink },
  pressed: { opacity: 0.7 },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  footer: { marginVertical: Spacing.three },
  errorBar: { textAlign: 'center', color: Brand.pinkDark, paddingVertical: Spacing.two },
});
