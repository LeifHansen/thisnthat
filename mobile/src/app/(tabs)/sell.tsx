import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Brand, Spacing } from '@/constants/theme';
import {
  ApiError,
  apiCreateListing,
  apiUploadPhotos,
  authLabel,
  type AuthType,
  type LocalPhoto,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openWeb } from '@/lib/handoff';

const MAX_PHOTOS = 12;

// The declaration a seller makes about the item. Ordered as the web form
// orders them; the two BX service tiers are bought through the web
// authentication flow, so they aren't offered here.
const AUTH_CHOICES: AuthType[] = ['UNAUTHENTICATED', 'TRUE_BLUE', 'THIRD_PARTY_COA'];

/**
 * Sell tab: photograph a beanie and list it without leaving the app.
 *
 * Photos go through the web app's upload route, so they get the same
 * auto-levelling and watermark web uploads get, and the listing itself is
 * created by the same `createListingForSeller` the web Sell form uses.
 *
 * Deliberately not everything the web form does: lots, drafts, AI autofill,
 * studio staging and the paid BX authentication tiers all stay on the web,
 * reachable from the link at the bottom.
 */
export default function SellScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [beanieName, setBeanieName] = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [year, setYear] = useState('');
  const [authType, setAuthType] = useState<AuthType>('UNAUTHENTICATED');
  const [busy, setBusy] = useState<'photos' | 'publish' | null>(null);
  const [error, setError] = useState('');

  async function pickPhotos() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Beanie Xchange needs access to your photos to add pictures.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.9,
    });
    if (result.canceled) return;

    setPhotos((current) =>
      [
        ...current,
        ...result.assets.map((asset, i) => ({
          uri: asset.uri,
          name: asset.fileName ?? `photo-${Date.now()}-${i}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        })),
      ].slice(0, MAX_PHOTOS),
    );
  }

  function removePhoto(uri: string) {
    setPhotos((current) => current.filter((p) => p.uri !== uri));
  }

  async function publish() {
    setError('');
    const priceValue = Number(price);
    if (photos.length === 0) return setError('Add at least one photo.');
    if (title.trim().length < 1) return setError('Give your listing a title.');
    if (beanieName.trim().length < 1) return setError('Which beanie is this?');
    if (condition.trim().length < 1) return setError('Describe the condition.');
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return setError('Enter a price.');
    }

    setBusy('photos');
    try {
      // Upload first: a listing row with no photos is worse than no listing,
      // and the server rejects photo URLs it didn't mint.
      const { urls } = await apiUploadPhotos(photos);

      setBusy('publish');
      const { id } = await apiCreateListing({
        title: title.trim(),
        beanieName: beanieName.trim(),
        description: description.trim(),
        condition: condition.trim(),
        year: year.trim() === '' ? undefined : Number(year),
        price: priceValue,
        authType,
        photos: urls,
      });

      reset();
      router.push(`/listing/${id}`);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't publish that listing. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setPhotos([]);
    setTitle('');
    setBeanieName('');
    setCondition('');
    setDescription('');
    setPrice('');
    setYear('');
    setAuthType('UNAUTHENTICATED');
  }

  const inputStyle = [
    styles.input,
    { color: scheme === 'dark' ? '#fff' : Brand.ink, borderColor: Brand.lineStrong },
  ];

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={Brand.pink} />
      </ThemedView>
    );
  }

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ThemedText type="subtitle">Sell a Beanie</ThemedText>
          <ThemedText themeColor="textSecondary">
            Sign in on the Account tab to list a beanie. Payments are held in escrow
            until the buyer confirms it arrived.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Sell a Beanie</ThemedText>

            <ThemedText type="smallBold">Photos</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {photos.map((photo) => (
                  <Pressable key={photo.uri} onPress={() => removePhoto(photo.uri)}>
                    <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                    <View style={styles.removeBadge}>
                      <ThemedText type="smallBold" style={styles.removeGlyph}>
                        ×
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable style={styles.addPhoto} onPress={() => void pickPhotos()}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      + Add
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ScrollView>
            {photos.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Tap a photo to remove it. The first one is the cover.
              </ThemedText>
            )}

            <TextInput
              style={inputStyle}
              placeholder="Listing title"
              placeholderTextColor={Brand.line}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={inputStyle}
              placeholder="Beanie name (e.g. Princess)"
              placeholderTextColor={Brand.line}
              value={beanieName}
              onChangeText={setBeanieName}
            />
            <View style={styles.row}>
              <TextInput
                style={[...inputStyle, styles.flex]}
                placeholder="Price (USD)"
                placeholderTextColor={Brand.line}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />
              <TextInput
                style={[...inputStyle, styles.flex]}
                placeholder="Year"
                placeholderTextColor={Brand.line}
                keyboardType="number-pad"
                value={year}
                onChangeText={setYear}
              />
            </View>
            <TextInput
              style={inputStyle}
              placeholder="Condition (e.g. Mint with tags)"
              placeholderTextColor={Brand.line}
              value={condition}
              onChangeText={setCondition}
            />
            <TextInput
              style={[...inputStyle, styles.textArea]}
              placeholder="Description (optional)"
              placeholderTextColor={Brand.line}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            <ThemedText type="smallBold">Authentication</ThemedText>
            <View style={styles.choices}>
              {AUTH_CHOICES.map((choice) => (
                <Pressable
                  key={choice}
                  onPress={() => setAuthType(choice)}
                  style={[styles.choice, authType === choice && styles.choiceOn]}>
                  <ThemedText
                    type="small"
                    themeColor={authType === choice ? 'text' : 'textSecondary'}>
                    {authLabel(choice)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.cta, busy !== null && styles.ctaDisabled]}
              disabled={busy !== null}
              onPress={() => void publish()}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.ctaLabel}>
                  Publish listing
                </ThemedText>
              )}
            </Pressable>
            {busy === 'photos' && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Uploading photos…
              </ThemedText>
            )}

            {!!error && (
              <ThemedText type="small" style={{ color: Brand.pinkDark }}>
                {error}
              </ThemedText>
            )}

            <Pressable style={styles.webLink} onPress={() => void openWeb('/sell')}>
              <ThemedText type="small" themeColor="textSecondary">
                Selling a lot, saving a draft, or want BX authentication? Use the full
                form on the web →
              </ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  scroll: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.two,
  },
  photoRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one },
  photo: { width: 84, height: 84, borderRadius: Spacing.two, backgroundColor: Brand.line },
  removeBadge: {
    position: 'absolute',
    top: -Spacing.one,
    right: -Spacing.one,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeGlyph: { color: '#fff', lineHeight: 18 },
  addPhoto: {
    width: 84,
    height: 84,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Brand.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: Spacing.two },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: {
    borderWidth: 1,
    borderColor: Brand.lineStrong,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  choiceOn: { borderColor: Brand.pink, backgroundColor: 'rgba(232,71,154,0.12)' },
  cta: {
    backgroundColor: Brand.pink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaLabel: { color: '#fff' },
  webLink: { paddingVertical: Spacing.four },
});
