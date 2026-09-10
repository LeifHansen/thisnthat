import * as WebBrowser from 'expo-web-browser';

import { API_URL, apiHandoffToken, hasAuthToken } from '@/lib/api';

/**
 * Open a page of the website in the in-app browser, carrying the native
 * session across.
 *
 * The app signs in with a bearer token, but `openBrowserAsync` is a
 * SFSafariViewController with its own cookie jar that has never seen it. Left
 * alone, a user who had just signed in natively landed on the site signed out
 * and was asked for the password they had typed a moment earlier. So for a
 * signed-in user we first mint a single-use token (90s, server-side
 * `/api/mobile/handoff`) and go in via `/auth/handoff`, which swaps it for a
 * normal cookie session and forwards to `path`.
 *
 * Nothing here is load-bearing: if the mint fails for any reason we open the
 * plain URL, which is exactly the old behaviour.
 */
export async function openWeb(path: string): Promise<void> {
  await WebBrowser.openBrowserAsync(await webUrlFor(path));
}

async function webUrlFor(path: string): Promise<string> {
  const plain = `${API_URL}${path}`;
  if (!hasAuthToken()) return plain;

  try {
    const { token } = await apiHandoffToken();
    const query = `token=${encodeURIComponent(token)}&next=${encodeURIComponent(path)}`;
    return `${API_URL}/auth/handoff?${query}`;
  } catch {
    // Offline, rate-limited, or a token the server no longer accepts (in which
    // case the 401 handler in api.ts has already signed the user out). Either
    // way the page itself still works, just signed out.
    return plain;
  }
}
