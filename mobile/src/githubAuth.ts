import Constants from 'expo-constants';

/*
 * GitHub OAuth Device Flow.
 *
 * The phone asks GitHub for a short user code, the user types it once on
 * github.com/login/device, and we poll until GitHub hands back a token. No
 * client secret exists — which is the point: a sideloaded binary can't keep one,
 * and device flow is specified for exactly that case. The client ID is public.
 *
 * Both endpoints live on github.com (not api.github.com) and default to
 * form-encoded replies; `Accept: application/json` is what makes them return
 * JSON. They also send no CORS headers, so this only works off the browser —
 * fine, since React Native's fetch has no CORS wall.
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Contents (read/write) to sync the vault, plus creating the private repo. */
const SCOPE = 'repo';

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Seconds GitHub asks us to wait between polls. Never poll faster. */
  interval: number;
  expiresAt: number;
}

export type Started = { ok: true; data: DeviceCode } | { ok: false; error: string };
export type Polled = { ok: true; token: string } | { ok: false; error: string };

export function clientId(): string | null {
  const id = (Constants.expoConfig?.extra as { githubClientId?: string } | undefined)?.githubClientId;
  return id && id.length > 4 ? id : null;
}

const json = { Accept: 'application/json', 'Content-Type': 'application/json' };

export async function requestDeviceCode(): Promise<Started> {
  const id = clientId();
  if (!id) return { ok: false, error: 'No GitHub client id configured.' };

  try {
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ client_id: id, scope: SCOPE }),
    });
    if (!res.ok) return { ok: false, error: `GitHub said ${res.status}.` };

    const d = (await res.json()) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      interval?: number;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (d.error || !d.device_code || !d.user_code) {
      return { ok: false, error: d.error_description ?? d.error ?? 'GitHub refused the request.' };
    }

    return {
      ok: true,
      data: {
        deviceCode: d.device_code,
        userCode: d.user_code,
        verificationUri: d.verification_uri ?? 'https://github.com/login/device',
        interval: Math.max(5, d.interval ?? 5),
        expiresAt: Date.now() + (d.expires_in ?? 900) * 1000,
      },
    };
  } catch {
    return { ok: false, error: 'No network. GitHub is unreachable.' };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll until the user approves. `cancelled` lets the screen abandon the wait on
 * unmount without leaving a runaway loop behind.
 */
export async function pollForToken(d: DeviceCode, cancelled: () => boolean): Promise<Polled> {
  const id = clientId();
  if (!id) return { ok: false, error: 'No GitHub client id configured.' };

  let waitMs = d.interval * 1000;

  while (!cancelled()) {
    if (Date.now() > d.expiresAt) return { ok: false, error: 'The code expired. Start again.' };
    await sleep(waitMs);
    if (cancelled()) break;

    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ client_id: id, device_code: d.deviceCode, grant_type: GRANT }),
      });
      const body = (await res.json()) as { access_token?: string; error?: string; interval?: number };

      if (body.access_token) return { ok: true, token: body.access_token };

      switch (body.error) {
        case 'authorization_pending':
          break; // the user hasn't finished yet — keep waiting
        case 'slow_down':
          // GitHub rate-limited us; it tells us the new floor.
          waitMs = Math.max(waitMs + 5000, (body.interval ?? 0) * 1000);
          break;
        case 'expired_token':
          return { ok: false, error: 'The code expired. Start again.' };
        case 'access_denied':
          return { ok: false, error: 'You declined the authorisation.' };
        case 'incorrect_client_credentials':
          return { ok: false, error: 'That client id is wrong.' };
        case 'device_flow_disabled':
          return { ok: false, error: 'Enable Device Flow on the OAuth app, then retry.' };
        default:
          if (body.error) return { ok: false, error: body.error };
      }
    } catch {
      // Transient network blip: keep polling rather than dropping the whole flow.
    }
  }

  return { ok: false, error: 'Cancelled.' };
}
