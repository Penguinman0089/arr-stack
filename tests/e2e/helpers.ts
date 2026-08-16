//
// LICENCE: this file remains under CC BY-NC 4.0 (LICENSE-docs), NOT the
// PolyForm Noncommercial licence covering the rest of this repo's code. It is
// adapted from leonardoazeredo/ultimate-arr-stack and was contributed under
// CC BY-NC 4.0; relicensing it needs that author's agreement, requested in
// issue #20. See LICENSE.
//
// The docker-exec helpers below are adapted from
// leonardoazeredo/ultimate-arr-stack, a downstream fork of this repo, published
// under this repo's CC BY-NC 4.0 notice. Changed here: the off-NAS gate probes
// for a stack container rather than for a working docker CLI (see below).

import { execFileSync } from 'node:child_process';
import * as path from 'path';

export const HOST = process.env.NAS_HOST ?? 'localhost';
export const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

export function screenshotPath(name: string) {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

// ─── Service ports ───────────────────────────────────────────────────────────

export const PORTS = {
  jellyfin: 8096,
  sonarr: 8989,
  radarr: 7878,
  prowlarr: 9696,
  qbittorrent: 8085,
  sabnzbd: 8082,
  seerr: 5055,
  bazarr: 6767,
  pihole: 8081,
} as const;

export function url(service: keyof typeof PORTS, pathStr = '') {
  return `http://${HOST}:${PORTS[service]}${pathStr}`;
}

// ─── VPN topology ────────────────────────────────────────────────────────────
//
// Kept here so the VPN tests and any future check share one definition rather
// than each repeating a list that drifts. Verified against
// docker-compose.arr-stack.yml: these four carry network_mode:
// "service:gluetun". Sonarr and Radarr deliberately do NOT — see
// docs/MIGRATION-arr-off-vpn.md.

export const TUNNELED_SERVICES = ['qbittorrent', 'prowlarr', 'sabnzbd', 'flaresolverr'] as const;
export const BRIDGE_SERVICES = ['sonarr', 'radarr'] as const;

// ─── UI auth helpers ─────────────────────────────────────────────────────────

/** Intercept all requests and add a custom header. Works for SPA auth bypass. */
export async function addHeaderToAllRequests(page: import('@playwright/test').Page, name: string, value: string) {
  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), [name]: value };
    await route.continue({ headers });
  });
}

// ─── Docker-exec helpers ─────────────────────────────────────────────────────
//
// Tests using these need the stack's actual containers on the local docker
// socket, which is only true when the suite runs ON the NAS.
//
// The gate deliberately probes for a STACK CONTAINER, not merely for a working
// docker CLI. A developer Mac running Docker Desktop answers `docker version`
// perfectly well while having no gluetun — so a "is docker available" check
// passes off-NAS and every test below then fails with "No such container".
// Asking whether gluetun is inspectable answers the question actually being
// asked: are the stack's containers reachable from here?

export const STACK_IS_LOCAL = (() => {
  try {
    execFileSync('docker', ['inspect', '--format', '{{.Id}}', 'gluetun'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export function dockerExec(container: string, cmd: string[], timeoutMs = 10_000): string {
  return execFileSync('docker', ['exec', container, ...cmd], { encoding: 'utf8', timeout: timeoutMs }).trim();
}

export function dockerInspect(container: string, format: string): string {
  return execFileSync('docker', ['inspect', '--format', format, container], { encoding: 'utf8' }).trim();
}

/**
 * Egress IP as seen from outside, fetched from inside `container`.
 *
 * Images ship different HTTP clients — Gluetun's Alpine base has only wget,
 * LSIO images have curl — so try curl then fall back to wget in one shell
 * invocation rather than guessing per container. Uses the `/ip` path
 * specifically: ifconfig.me serves curl a bare IP at the root but serves wget
 * (which sends no Accept header) its full HTML homepage; `/ip` is plain text
 * for both.
 *
 * Returns null on timeout or failure — which is the CORRECT result when a
 * killswitch is doing its job and blocking egress entirely.
 */
export function egressIp(container: string): string | null {
  try {
    return dockerExec(container, [
      'sh', '-c',
      'curl -s --max-time 5 https://ifconfig.me/ip || wget -qO- --timeout=5 https://ifconfig.me/ip',
    ], 15_000);
  } catch {
    return null;
  }
}
