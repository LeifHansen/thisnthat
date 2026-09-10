import { CardField, StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import {
  ApiError,
  apiCheckout,
  apiCheckoutQuote,
  apiMe,
  apiStripeConfig,
  fetchListing,
  formatCents,
  type CheckoutQuote,
  type ListingDetail,
  type ShipAddress,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openWeb } from '@/lib/handoff';

/**
 * Native checkout for a single listing.
 *
 * Mirrors the web cart flow: card details are collected here, the server
 * authorizes one manual-capture PaymentIntent (money held, not taken) and only
 * captures it once the buyer confirms the beanie arrived. The card never
 * touches our servers — CardField is Stripe's own view and
 * `createPaymentMethod` hands back only an id.
 *
 * Two steps on purpose. /api/checkout refuses to authorize a total the buyer
 * hasn't seen, and shipping is live-rated from the seller's ZIP, so the
 * address has to be priced (step 1) before there is a number to agree to
 * (step 2).
 */
export default function CheckoutRoute() {
  const { user, loading: authLoading } = useAuth();
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    if (!user) return;
    let alive = true;
    apiStripeConfig()
      .then(({ stripePublishableKey }) => alive && setPublishableKey(stripePublishableKey))
      .catch((e) =>
        alive &&
        setConfigError(
          e instanceof ApiError && e.status === 503
            ? "Card payments aren't available right now."
            : "Couldn't reach Beanie Xchange.",
        ),
      );
    return () => {
      alive = false;
    };
  }, [user]);

  if (authLoading) return <Centered><ActivityIndicator color={Brand.pink} /></Centered>;

  if (!user) {
    return (
      <Centered>
        <ThemedText type="smallBold">Sign in to buy</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredNote}>
          Your purchase is held in escrow until the beanie reaches you, so it needs
          an account.
        </ThemedText>
      </Centered>
    );
  }

  if (configError) {
    return (
      <Centered>
        <ThemedText type="small" style={{ color: Brand.pinkDark }}>
          {configError}
        </ThemedText>
      </Centered>
    );
  }

  if (!publishableKey) return <Centered><ActivityIndicator color={Brand.pink} /></Centered>;

  return (
    <StripeProvider publishableKey={publishableKey}>
      <CheckoutForm />
    </StripeProvider>
  );
}

function CheckoutForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const { createPaymentMethod, handleNextAction } = useStripe();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [ship, setShip] = useState<ShipAddress>({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [busy, setBusy] = useState<'quote' | 'pay' | null>(null);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);

  // One id per attempt. Reused across retries so a network-level retry of a
  // POST that already created orders is refused rather than charging twice.
  const [checkoutId] = useState(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`,
  );

  useEffect(() => {
    let alive = true;
    if (id) {
      fetchListing(id)
        .then((l) => alive && setListing(l))
        .catch(() => alive && setError("Couldn't load this listing."));
    }
    // Prefill from the address on the account, if there's a complete one.
    apiMe()
      .then(({ shipping }) => {
        if (alive && shipping) setShip({ ...shipping, line2: shipping.line2 ?? '' });
      })
      .catch(() => {
        // Not fatal — the buyer can type it.
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const addressComplete = useMemo(
    () =>
      ship.name.trim() !== '' &&
      ship.line1.trim() !== '' &&
      ship.city.trim() !== '' &&
      ship.state.trim() !== '' &&
      ship.postalCode.trim() !== '',
    [ship],
  );

  // Any edit invalidates the price it produced: shipping is rated from this
  // address, so a stale total would be refused by /api/checkout anyway.
  const setField = useCallback((key: keyof ShipAddress, value: string) => {
    setShip((s) => ({ ...s, [key]: value }));
    setQuote(null);
    setError('');
  }, []);

  async function getQuote() {
    if (!id || !addressComplete) return;
    setBusy('quote');
    setError('');
    try {
      setQuote(await apiCheckoutQuote([id], ship));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't work out shipping. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!id || !quote) return;
    setBusy('pay');
    setError('');
    try {
      const { paymentMethod, error: pmError } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: ship.name,
            address: {
              line1: ship.line1,
              line2: ship.line2 ?? '',
              city: ship.city,
              state: ship.state,
              postalCode: ship.postalCode,
              country: 'US',
            },
          },
        },
      });
      if (pmError || !paymentMethod) {
        setError(pmError?.localizedMessage ?? pmError?.message ?? 'Check your card details.');
        return;
      }

      const result = await apiCheckout({
        listingIds: [id],
        ship,
        paymentMethodId: paymentMethod.id,
        checkoutId,
        expectedTotalCents: quote.totalCents,
      });

      // Any order whose bank wants 3-D Secure finishes here. The order is
      // already created either way, so a failure is reported rather than
      // silently treated as success.
      for (const pending of result.requiresAction) {
        const { error: actionError } = await handleNextAction(pending.clientSecret);
        if (actionError) {
          setError(
            actionError.localizedMessage ??
              actionError.message ??
              "Your bank didn't confirm the payment.",
          );
          return;
        }
      }

      setPaid(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Payment couldn't be completed. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (paid) {
    return (
      <Centered>
        <Stack.Screen options={{ title: 'Order placed' }} />
        <ThemedText type="subtitle">You&apos;re all set</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredNote}>
          Your payment is authorized and held in escrow. We only take it once you
          confirm the beanie arrived — and the seller has been told to ship.
        </ThemedText>
        <Pressable style={styles.cta} onPress={() => void openWeb('/dashboard')}>
          <ThemedText type="smallBold" style={styles.ctaLabel}>
            View your order
          </ThemedText>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <ThemedText type="small" themeColor="textSecondary">
            Keep browsing
          </ThemedText>
        </Pressable>
      </Centered>
    );
  }

  const inputStyle = [
    styles.input,
    { color: scheme === 'dark' ? '#fff' : Brand.ink, borderColor: Brand.lineStrong },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Checkout' }} />

        {listing && (
          <ThemedView type="backgroundElement" style={styles.itemRow}>
            {listing.photos[0] ? (
              <Image source={{ uri: listing.photos[0] }} style={styles.thumb} contentFit="cover" />
            ) : null}
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {listing.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatCents(listing.priceCents)}
              </ThemedText>
            </View>
          </ThemedView>
        )}

        <ThemedText type="smallBold">Ship to</ThemedText>
        <TextInput
          style={inputStyle}
          placeholder="Full name"
          placeholderTextColor={Brand.line}
          autoComplete="name"
          value={ship.name}
          onChangeText={(v) => setField('name', v)}
        />
        <TextInput
          style={inputStyle}
          placeholder="Address"
          placeholderTextColor={Brand.line}
          autoComplete="street-address"
          value={ship.line1}
          onChangeText={(v) => setField('line1', v)}
        />
        <TextInput
          style={inputStyle}
          placeholder="Apartment, suite (optional)"
          placeholderTextColor={Brand.line}
          value={ship.line2 ?? ''}
          onChangeText={(v) => setField('line2', v)}
        />
        <TextInput
          style={inputStyle}
          placeholder="City"
          placeholderTextColor={Brand.line}
          value={ship.city}
          onChangeText={(v) => setField('city', v)}
        />
        <View style={styles.row}>
          <TextInput
            style={[...inputStyle, styles.flex]}
            placeholder="State"
            placeholderTextColor={Brand.line}
            autoCapitalize="characters"
            value={ship.state}
            onChangeText={(v) => setField('state', v)}
          />
          <TextInput
            style={[...inputStyle, styles.flex]}
            placeholder="ZIP"
            placeholderTextColor={Brand.line}
            keyboardType="number-pad"
            value={ship.postalCode}
            onChangeText={(v) => setField('postalCode', v)}
          />
        </View>

        {!quote ? (
          <Pressable
            style={[styles.cta, (!addressComplete || busy === 'quote') && styles.ctaDisabled]}
            disabled={!addressComplete || busy === 'quote'}
            onPress={getQuote}>
            {busy === 'quote' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={styles.ctaLabel}>
                Calculate shipping &amp; total
              </ThemedText>
            )}
          </Pressable>
        ) : (
          <>
            <ThemedView type="backgroundElement" style={styles.summary}>
              {quote.items.map((item) => (
                <View key={item.listingId} style={styles.summaryGroup}>
                  <FeeRow label="Item" value={formatCents(item.itemCents)} />
                  <FeeRow
                    label={item.shippingRated ? 'Shipping' : 'Shipping (estimated)'}
                    value={formatCents(item.shipToBuyerCents)}
                  />
                </View>
              ))}
              <View style={styles.divider} />
              <FeeRow label="Total" value={formatCents(quote.totalCents)} bold />
              <ThemedText type="small" themeColor="textSecondary" style={styles.escrowNote}>
                Held in escrow — we only take the payment once you confirm the beanie
                arrived.
              </ThemedText>
            </ThemedView>

            <ThemedText type="smallBold">Card</ThemedText>
            <CardField
              postalCodeEnabled={false}
              style={styles.cardField}
              cardStyle={{
                backgroundColor: scheme === 'dark' ? '#232030' : '#ffffff',
                textColor: scheme === 'dark' ? '#ffffff' : Brand.ink,
                borderColor: Brand.lineStrong,
                borderWidth: 1,
                borderRadius: Spacing.two,
              }}
              onCardChange={(card) => setCardComplete(card.complete)}
            />

            <Pressable
              style={[styles.cta, (!cardComplete || busy === 'pay') && styles.ctaDisabled]}
              disabled={!cardComplete || busy === 'pay'}
              onPress={pay}>
              {busy === 'pay' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.ctaLabel}>
                  Pay {formatCents(quote.totalCents)}
                </ThemedText>
              )}
            </Pressable>
          </>
        )}

        {!!error && (
          <ThemedText type="small" style={{ color: Brand.pinkDark }}>
            {error}
          </ThemedText>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FeeRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.feeRow}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={bold ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{value}</ThemedText>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <ThemedView style={[styles.flex, styles.centered]}>
      <View style={styles.centeredInner}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { justifyContent: 'center', paddingHorizontal: Spacing.four },
  centeredInner: { alignItems: 'center', gap: Spacing.two },
  centeredNote: { textAlign: 'center' },
  scroll: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  itemRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    marginBottom: Spacing.two,
  },
  thumb: { width: 56, height: 56, borderRadius: Spacing.two, backgroundColor: Brand.line },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
  summary: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  summaryGroup: { gap: Spacing.one },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: Brand.line, marginVertical: Spacing.two },
  escrowNote: { marginTop: Spacing.two, lineHeight: 18 },
  cardField: { height: 50, marginTop: Spacing.one },
  cta: {
    backgroundColor: Brand.pink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaLabel: { color: '#fff' },
  secondary: { paddingVertical: Spacing.three, alignItems: 'center' },
});
