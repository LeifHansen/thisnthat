import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { ApiError, API_URL, apiDeleteAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openWeb } from '@/lib/handoff';

/**
 * Account tab: native sign-in / sign-up (bearer-token auth), or the signed-in
 * profile. Buying, selling, offers, and messages build on this session next.
 */
export default function AccountScreen() {
  const { user, loading, signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedText type="subtitle">Account</ThemedText>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Brand.pink} />
          </View>
        ) : user ? (
          <Profile
            name={user.displayName || user.name}
            email={user.email}
            role={user.role}
            onSignOut={signOut}
          />
        ) : (
          <AuthForm />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Profile({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email: string;
  role: string;
  onSignOut: () => Promise<void>;
}) {
  return (
    <ScrollView contentContainerStyle={styles.profileScroll}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {email}
          {role === 'ADMIN' ? ' · admin' : ''}
        </ThemedText>
      </ThemedView>

      {/* Until these screens are native, open the web equivalents in-app —
          openWeb carries the session across so they don't land signed out. */}
      <LinkRow label="Orders, offers & listings" path="/dashboard" />
      <LinkRow label="Messages" path="/messages" />
      <LinkRow label="Edit your profile" path="/dashboard/profile" />

      <Pressable style={styles.signOut} onPress={() => void onSignOut()}>
        <ThemedText type="smallBold" style={{ color: Brand.pinkDark }}>
          Sign out
        </ThemedText>
      </Pressable>

      <DeleteAccount email={email} onDeleted={onSignOut} />
    </ScrollView>
  );
}

/**
 * Permanent account deletion, in the app, as Apple requires of anything that
 * can create an account (Guideline 5.1.1(v)).
 *
 * Two steps and a typed confirmation rather than an Alert: this is
 * irreversible, and it should be as hard to do by accident as the web form
 * makes it. The server refuses while an order is mid-escrow and says why, so
 * that message is surfaced rather than swallowed.
 */
function DeleteAccount({
  email,
  onDeleted,
}: {
  email: string;
  onDeleted: () => Promise<void>;
}) {
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function confirm() {
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      setErr("That doesn't match the email on this account.");
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiDeleteAccount();
      // The token is stateless and can't be revoked, but the scrubbed account
      // is suspended so it stops working on the next request either way.
      // Clearing it here is what ends the session on this device.
      await onDeleted();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't delete your account.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable style={styles.dangerLink} onPress={() => setOpen(true)}>
        <ThemedText type="small" themeColor="textSecondary">
          Delete account
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.card, styles.danger]}>
      <ThemedText type="smallBold">Delete your account</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.dangerCopy}>
        This removes your profile, listings, messages, offers, reviews and forum
        posts, and can&apos;t be undone. Completed orders are kept as the other
        party&apos;s record of a real sale, but nothing on them identifies you any
        more.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Type {email} to confirm.
      </ThemedText>
      <TextInput
        style={[
          styles.input,
          { color: scheme === 'dark' ? '#fff' : Brand.ink, borderColor: Brand.lineStrong },
        ]}
        placeholder="your email address"
        placeholderTextColor={Brand.line}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={typed}
        onChangeText={setTyped}
        editable={!busy}
      />
      {!!err && (
        <ThemedText type="small" style={{ color: Brand.pinkDark }}>
          {err}
        </ThemedText>
      )}
      <Pressable
        style={[styles.deleteCta, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={() => void confirm()}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            Delete my account permanently
          </ThemedText>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setOpen(false);
          setTyped('');
          setErr('');
        }}
        disabled={busy}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.switch}>
          Keep my account
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function LinkRow({ label, path }: { label: string; path: string }) {
  return (
    <Pressable
      style={styles.linkRow}
      onPress={() => void openWeb(path)}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText themeColor="textSecondary">›</ThemedText>
    </Pressable>
  );
}

function AuthForm() {
  const { signIn, register } = useAuth();
  const scheme = useColorScheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const inputStyle = [
    styles.input,
    {
      color: scheme === 'dark' ? '#fff' : Brand.ink,
      borderColor: Brand.lineStrong,
    },
  ];

  async function submit() {
    setErr('');
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && name.trim().length < 2) {
      setErr('Enter your name.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await register({ name: name.trim(), email: email.trim(), password });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </ThemedText>

      {mode === 'signup' && (
        <TextInput
          style={inputStyle}
          placeholder="Name"
          placeholderTextColor={Brand.line}
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
          editable={!busy}
        />
      )}
      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={Brand.line}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={inputStyle}
        placeholder="Password"
        placeholderTextColor={Brand.line}
        secureTextEntry
        textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        onSubmitEditing={submit}
      />

      {!!err && (
        <ThemedText type="small" style={{ color: Brand.pinkDark }}>
          {err}
        </ThemedText>
      )}

      <Pressable
        style={[styles.cta, busy && { opacity: 0.6 }]}
        onPress={submit}
        disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </ThemedText>
        )}
      </Pressable>

      {mode === 'signup' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.consent}>
          By creating an account you agree to our{' '}
          <ThemedText
            type="small"
            style={styles.link}
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>
            Terms
          </ThemedText>{' '}
          and{' '}
          <ThemedText
            type="small"
            style={styles.link}
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>
            Privacy Policy
          </ThemedText>
          .
        </ThemedText>
      )}

      <Pressable
        onPress={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setErr('');
        }}
        disabled={busy}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.switch}>
          {mode === 'signin'
            ? "New to Beanie Xchange? Create an account"
            : 'Already have an account? Sign in'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  center: { paddingVertical: Spacing.five, alignItems: 'center' },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  cta: {
    backgroundColor: Brand.pink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  switch: { textAlign: 'center', marginTop: Spacing.one },
  consent: { marginTop: Spacing.one, lineHeight: 18 },
  link: { color: Brand.pink },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Brand.line,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  profileScroll: { gap: Spacing.three, paddingBottom: Spacing.six },
  dangerLink: { alignItems: 'center', paddingVertical: Spacing.three },
  danger: { borderColor: Brand.pinkDark },
  dangerCopy: { lineHeight: 18 },
  deleteCta: {
    backgroundColor: Brand.pinkDark,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
