/**
 * Checks GitHub Releases for a newer rider APK and opens the APK download URL
 * so Android can install the update in place.
 */
import { Alert, AppState, Linking, NativeModules } from 'react-native';
import { create } from 'zustand';
import { GITHUB_RELEASES_LATEST_URL } from '../config';
import { APP_BUILD_NUMBER, APP_VERSION } from '../version';

export interface InstalledVersion {
  versionName: string;
  versionCode: number;
}

export interface ReleaseUpdate {
  tag: string;
  version: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt: string | null;
}

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
  content_type?: string;
}

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

export function getInstalledVersion(): InstalledVersion {
  const nativeInfo = (
    NativeModules as { AppInfo?: { versionName?: string; versionCode?: number } }
  ).AppInfo;

  if (APP_VERSION !== '0.1.0-dev') {
    return { versionName: APP_VERSION, versionCode: APP_BUILD_NUMBER };
  }
  if (nativeInfo?.versionName && nativeInfo.versionName !== '1.0') {
    return {
      versionName: nativeInfo.versionName,
      versionCode: nativeInfo.versionCode ?? 1,
    };
  }
  return {
    versionName: nativeInfo?.versionName ?? APP_VERSION,
    versionCode: nativeInfo?.versionCode ?? APP_BUILD_NUMBER,
  };
}

function parseSemverParts(version: string): [number, number, number] {
  const base = version.split('-')[0] ?? '';
  const parts = base.split('.').map(part => Number.parseInt(part, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemverBase(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemverParts(a);
  const [bMaj, bMin, bPat] = parseSemverParts(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

/**
 * Pure comparison between the installed APK version and a GitHub Release tag
 * (e.g. `v0.1.0-build.8` or `v0.2.0`).
 */
export function isNewerRelease(installed: InstalledVersion, latestTag: string): boolean {
  const cleanLatest = latestTag.trim().replace(/^v/i, '');
  const cleanInstalled = installed.versionName.trim().replace(/^v/i, '');

  if (!cleanLatest) return false;
  if (cleanLatest === cleanInstalled) return false;

  const latestBuildMatch = /-build\.(\d+)$/i.exec(cleanLatest);
  const installedBuildMatch = /-build\.(\d+)$/i.exec(cleanInstalled);

  // Local unversioned debug/dev build: any published GitHub release is newer.
  if (cleanInstalled === '1.0' || cleanInstalled.endsWith('-dev')) {
    return true;
  }

  if (latestBuildMatch && installedBuildMatch) {
    const semverDiff = compareSemverBase(cleanLatest, cleanInstalled);
    if (semverDiff !== 0) return semverDiff > 0;
    return Number.parseInt(latestBuildMatch[1]!, 10) > Number.parseInt(installedBuildMatch[1]!, 10);
  }

  if (latestBuildMatch && installed.versionCode > 1) {
    return Number.parseInt(latestBuildMatch[1]!, 10) > installed.versionCode;
  }

  return compareSemverBase(cleanLatest, cleanInstalled) > 0;
}

export async function fetchLatestGitHubRelease(): Promise<ReleaseUpdate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DurgeshAmlaJuiceRider/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubReleasePayload;
    if (!payload.tag_name || payload.draft) return null;

    const apkAsset = (payload.assets ?? []).find(
      asset =>
        Boolean(asset.browser_download_url) &&
        (asset.name?.toLowerCase().endsWith('.apk') ||
          asset.content_type === 'application/vnd.android.package-archive'),
    );

    const releaseUrl =
      payload.html_url ?? 'https://github.com/nandan8983/DurgeshAmlaJuice/releases/latest';
    const downloadUrl = apkAsset?.browser_download_url ?? releaseUrl;
    const version = payload.tag_name.replace(/^v/i, '');

    return {
      tag: payload.tag_name,
      version,
      downloadUrl,
      releaseUrl,
      publishedAt: payload.published_at ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function installReleaseUpdate(update: ReleaseUpdate): Promise<void> {
  try {
    await Linking.openURL(update.downloadUrl);
  } catch {
    try {
      await Linking.openURL(update.releaseUrl);
    } catch {
      Alert.alert(
        'Could not open download',
        `Open ${update.releaseUrl} in your browser to download the latest APK.`,
      );
    }
  }
}

interface UpdateState {
  installed: InstalledVersion;
  available: ReleaseUpdate | null;
  checking: boolean;
  promptedTag: string | null;
  checkForUpdate: (options?: { silent?: boolean }) => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  installed: getInstalledVersion(),
  available: null,
  checking: false,
  promptedTag: null,

  checkForUpdate: async (options = { silent: true }) => {
    if (get().checking) return;
    const installed = getInstalledVersion();
    set({ checking: true, installed });

    try {
      const latest = await fetchLatestGitHubRelease();
      if (latest && isNewerRelease(installed, latest.tag)) {
        const alreadyPrompted = get().promptedTag === latest.tag;
        set({ available: latest, checking: false, promptedTag: latest.tag });

        if (!alreadyPrompted || !options.silent) {
          Alert.alert(
            `Update available (v${latest.version})`,
            'A newer version of the rider app is available on GitHub Releases. Install the latest update now?',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Install latest update',
                onPress: () => void installReleaseUpdate(latest),
              },
            ],
          );
        }
      } else {
        set({ available: null, checking: false });
        if (!options.silent) {
          Alert.alert(
            'Up to date',
            `You are on the latest version (${installed.versionName}).`,
          );
        }
      }
    } catch {
      set({ checking: false });
      if (!options.silent) {
        Alert.alert('Update check failed', 'Could not reach GitHub Releases right now.');
      }
    }
  },
}));

/** Check for updates on boot and whenever the rider brings the app to the front. */
export function startUpdateChecker(): () => void {
  void useUpdateStore.getState().checkForUpdate({ silent: true });

  const subscription = AppState.addEventListener('change', nextState => {
    if (nextState === 'active') {
      void useUpdateStore.getState().checkForUpdate({ silent: true });
    }
  });

  return () => {
    subscription.remove();
  };
}

