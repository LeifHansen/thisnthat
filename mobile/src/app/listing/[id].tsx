import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import {
  authLabel,
  fetchListing,
  formatCents,
  listingWebPath,
  thumbUrl,
  type ListingDetail,
  type ListingSummary,
} from '@/lib/api';
import { openWeb } from '@/lib/handoff';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch on mount and whenever Retry bumps reloadKey. All setState happens
  // AFTER the await (never synchronously in the effect body).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        if (!cancelled) {
          setError('Listing not found.');
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchListing(id);
        if (!cancelled) {
          setListing(data);
          setError('');
        }
      } catch {
        if (!cancelled) setError("Couldn't load this listing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Event handler — synchronous setState here is fine.
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: listing?.beanieName ?? 'Listing' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Brand.pink} size="large" />
        </View>
      ) : error || !listing ? (
        <View style={styles.center}>
          <ThemedText themeColor="textSecondary">{error || 'Not found.'}</ThemedText>
          <Pressable onPress={load} style={styles.retry}>
            <ThemedText type="smallBold" style={styles.retryText}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <Detail listing={listing} />
      )}
    </ThemedView>
  );
}

function Detail({ listing }: { listing: ListingDetail }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const photos = listing.photos.length > 0 ? listing.photos : [null];

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Photo pager */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width, height: width }}>
        {photos.map((p, i) => (
          <Image
            key={`${p ?? 'ph'}-${i}`}
            source={p ?? undefined}
            style={{ width, height: width }}
            contentFit="contain"
            transition={150}
          />
        ))}
      </ScrollView>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              { backgroundColor: listing.unauthenticated ? '#e9e6df' : Brand.green },
            ]}>
            <ThemedText
              type="small"
              style={{
                color: listing.unauthenticated ? Brand.ink : '#ffffff',
                fontWeight: '700',
              }}>
              {authLabel(listing.authType)}
            </ThemedText>
          </View>
          {listing.registrationNumber ? (
            <ThemedText type="small" themeColor="textSecondary">
              #{listing.registrationNumber}
            </ThemedText>
          ) : null}
        </View>

        <ThemedText type="subtitle">{listing.title}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {listing.beanieName}
          {listing.year ? ` · ${listing.year}` : ''} · {listing.condition}
        </ThemedText>

        <ThemedText type="title" style={styles.price}>
          {formatCents(listing.priceCents)}
        </ThemedText>

        {/* A lot is one listing that ships many beanies. Saying so matters:
            without it the screen reads as a single-beanie sale at a price that
            makes no sense for one. */}
        {listing.isLot && (
          <ThemedView type="backgroundElement" style={styles.lot}>
            <ThemedText type="smallBold">
              Lot of {listing.lotPieces} {listing.lotPieces === 1 ? 'beanie' : 'beanies'}
            </ThemedText>
            {listing.lotItems.map((item, i) => (
              <ThemedText
                key={`${item.beanieName}-${i}`}
                type="small"
                themeColor="textSecondary">
                {item.quantity > 1 ? `${item.quantity}× ` : ''}
                {item.beanieName}
                {item.year ? ` (${item.year})` : ''}
              </ThemedText>
            ))}
          </ThemedView>
        )}

        {listing.description ? (
          <ThemedText style={styles.description}>{listing.description}</ThemedText>
        ) : null}

        {/* Seller */}
        <View style={styles.sellerRow}>
          <Image
            source={thumbUrl(listing.seller.avatarUrl, 384)}
            style={styles.avatar}
            cachePolicy="memory-disk"
          />
          <ThemedText type="smallBold">{listing.seller.name}</ThemedText>
        </View>

        {/* Fee breakdown */}
        <ThemedView type="backgroundElement" style={styles.fees}>
          <FeeRow label="Item price" value={formatCents(listing.fees.itemCents)} />
          <FeeRow
            label={`Platform fee (${listing.fees.platformFeeLabel})`}
            value={formatCents(listing.fees.platformFeeCents)}
          />
          <FeeRow label="Shipping" value={formatCents(listing.fees.shipToBuyerCents)} />
          <View style={styles.feeDivider} />
          <FeeRow label="Total" value={formatCents(listing.fees.totalCents)} strong />
          <ThemedText type="small" themeColor="textSecondary" style={styles.escrow}>
            {listing.unauthenticated
              ? '⚠ Sold as-is — no authentication or COA. Buy at your own risk.'
              : 'Authenticated before listing. Funds held in escrow until you confirm receipt.'}
          </ThemedText>
        </ThemedView>

        {/* Buying is native; offers are still the web flow (roadmap). */}
        <Pressable
          onPress={() => router.push(`/checkout/${listing.id}`)}
          disabled={listing.sold}
          style={[styles.cta, listing.sold && styles.ctaDisabled]}>
          <ThemedText type="smallBold" style={styles.ctaText}>
            {listing.sold ? 'Sold out' : 'Buy now'}
          </ThemedText>
        </Pressable>

        {!listing.sold && (
          <Pressable
            onPress={() => void openWeb(listingWebPath(listing.id))}
            style={styles.secondaryCta}>
            <ThemedText type="small" themeColor="textSecondary">
              Make an offer instead →
            </ThemedText>
          </Pressable>
        )}

        {/* Other options */}
        {listing.otherOptions.length > 0 && (
          <View style={styles.optionsBlock}>
            <ThemedText type="smallBold">
              Other options ({listing.otherOptions.length})
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.optionsRow}>
              {listing.otherOptions.map((o) => (
                <OptionCard key={o.id} option={o} />
              ))}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

function FeeRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.feeRow}>
      <ThemedText
        type={strong ? 'smallBold' : 'small'}
        themeColor={strong ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={strong ? { color: Brand.green } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

function OptionCard({ option }: { option: ListingSummary }) {
  return (
    <Link href={`/listing/${option.id}`} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.optionCard}>
          <Image
            source={thumbUrl(option.photos[0])}
            style={styles.optionPhoto}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={option.id}
          />
          <ThemedText type="smallBold" style={styles.optionPrice}>
            {formatCents(option.priceCents)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {option.condition}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  scroll: { paddingBottom: Spacing.six },
  body: { padding: Spacing.three, gap: Spacing.two },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  price: { color: Brand.pink, marginTop: Spacing.one },
  description: { marginTop: Spacing.one },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  avatar: { width: 28, height: 28, borderRadius: 999, backgroundColor: Brand.line },
  fees: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeDivider: { height: 1, backgroundColor: Brand.line, marginVertical: Spacing.one },
  escrow: { marginTop: Spacing.one },
  cta: {
    backgroundColor: Brand.pink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  lot: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  secondaryCta: { alignItems: 'center', paddingVertical: Spacing.three },
  ctaDisabled: { backgroundColor: Brand.lineStrong },
  ctaText: { color: '#ffffff' },
  optionsBlock: { marginTop: Spacing.three, gap: Spacing.two },
  optionsRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  optionCard: {
    width: 130,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.one,
    gap: 2,
  },
  optionPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.one,
    backgroundColor: Brand.line,
  },
  optionPrice: { color: Brand.pink, marginTop: Spacing.one },
  pressed: { opacity: 0.7 },
  retry: {
    backgroundColor: Brand.pink,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  retryText: { color: '#ffffff' },
});
