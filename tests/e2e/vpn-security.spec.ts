import { test, expect } from '@playwright/test';
import { STACK_IS_LOCAL, TUNNELED_SERVICES, BRIDGE_SERVICES, egressIp } from './helpers';

// ORIGIN: adapted from leonardoazeredo/ultimate-arr-stack, a downstream fork of
// this repo, published under this repo's CC BY-NC 4.0 notice. Changed here: the
// off-NAS gate (helpers.ts STACK_IS_LOCAL) and the service lists.
//
// Replaces the old "VPN connectivity" test in stack.spec.ts, which reached
// Sonarr's API and inferred the tunnel was healthy — on a premise that stopped
// being true when Sonarr and Radarr moved off the VPN netns. These compare
// actual egress IPs, which is the only thing that distinguishes "tunneled"
// from "leaking".
//
// They need local `docker exec`, so they run on the NAS and skip elsewhere.
// This is the automated counterpart to scripts/check-vpn.sh; the two implement
// the same comparison and should be kept in step.

test.describe('VPN egress — leak detection', () => {
  test.beforeEach(() => {
    test.skip(!STACK_IS_LOCAL, 'stack containers not on this docker socket — run on the NAS directly');
  });

  test("Gluetun's exit IP differs from the NAS's own WAN IP", () => {
    const gluetunIp = egressIp('gluetun');
    // sonarr is bridge-only, so its egress IS the host's WAN egress.
    const hostIp = egressIp('sonarr');
    expect(gluetunIp).toBeTruthy();
    expect(hostIp).toBeTruthy();
    expect(gluetunIp).not.toBe(hostIp);
  });

  for (const service of TUNNELED_SERVICES) {
    test(`${service} egresses through Gluetun, not around it`, () => {
      // Must MATCH Gluetun exactly. "Differs from the NAS IP" would be too
      // weak a test: a service leaking via some third route also differs from
      // the NAS IP while not being tunneled at all.
      const gluetunIp = egressIp('gluetun');
      const serviceIp = egressIp(service);
      expect(gluetunIp).toBeTruthy();
      expect(serviceIp).toBeTruthy();
      expect(serviceIp).toBe(gluetunIp);
    });
  }

  for (const service of BRIDGE_SERVICES) {
    test(`${service} stays OFF the VPN (post-migration regression guard)`, () => {
      // Codifies docs/MIGRATION-arr-off-vpn.md as a permanent check. If one of
      // these ever starts matching Gluetun's IP, something re-tunneled it —
      // probably by adding network_mode: "service:gluetun" back — without
      // updating the migration doc or this test.
      const gluetunIp = egressIp('gluetun');
      const serviceIp = egressIp(service);
      expect(gluetunIp).toBeTruthy();
      expect(serviceIp).toBeTruthy();
      expect(serviceIp).not.toBe(gluetunIp);
    });
  }
});

test.describe('VPN killswitch', () => {
  test('stopping Gluetun blocks qBittorrent egress rather than leaking via a fallback route', async () => {
    test.skip(!STACK_IS_LOCAL, 'stack containers not on this docker socket — run on the NAS directly');
    test.skip(
      process.env.ALLOW_DISRUPTIVE_TESTS !== '1',
      'set ALLOW_DISRUPTIVE_TESTS=1 to run — it stops the live Gluetun container, interrupting real downloads and searches',
    );
    test.setTimeout(90_000);

    const { execFileSync } = await import('node:child_process');
    const hostIp = egressIp('sonarr');
    expect(hostIp).toBeTruthy();

    try {
      execFileSync('docker', ['stop', 'gluetun'], { timeout: 30_000 });

      // A working killswitch means the request FAILS outright. Getting hostIp
      // back here would mean traffic fell through to the NAS's own route —
      // which is precisely the leak this guards against.
      expect(egressIp('qbittorrent')).toBeNull();
    } finally {
      execFileSync('docker', ['start', 'gluetun'], { timeout: 30_000 });

      // Always leave the stack working, even if the assertion above failed.
      const deadline = Date.now() + 60_000;
      let healthy = false;
      while (Date.now() < deadline) {
        try {
          const status = execFileSync(
            'docker', ['inspect', '--format', '{{.State.Health.Status}}', 'gluetun'], { encoding: 'utf8' },
          ).trim();
          if (status === 'healthy') { healthy = true; break; }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
      expect(healthy).toBeTruthy();
    }
  });
});
