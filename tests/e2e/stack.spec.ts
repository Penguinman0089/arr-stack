import { test, expect } from '@playwright/test';
import * as path from 'path';

const HOST = process.env.NAS_HOST ?? 'localhost';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

function screenshotPath(name: string) {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

// ─── Service ports ───────────────────────────────────────────────────────────

const PORTS = {
  plex: 32400,
  sonarr: 8989,
  radarr: 7878,
  prowlarr: 9696,
  qbittorrent: 8085,
  sabnzbd: 8082,
  overseerr: 5055,
  bazarr: 6767,
  pihole: 8081,
} as const;

function url(service: keyof typeof PORTS, pathStr = '') {
  return `http://${HOST}:${PORTS[service]}${pathStr}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Intercept all requests and add a custom header. Works for SPA auth bypass. */
async function addHeaderToAllRequests(page: import('@playwright/test').Page, name: string, value: string) {
  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), [name]: value };
    await route.continue({ headers });
  });
}

// ─── UI screenshot tests ─────────────────────────────────────────────────────

test.describe('UI screenshots', () => {
  test('Plex — login and screenshot home', async ({ page, context }) => {
    test.setTimeout(60_000);
    const plexToken = process.env.PLEX_TOKEN;
    test.skip(!plexToken, 'PLEX_TOKEN not set');

    await page.goto(url('plex', `/web/index.html#!/?X-Plex-Token=${plexToken}`));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5_000);

    await page.screenshot({ path: screenshotPath('plex'), fullPage: true });
  });

  test('Sonarr — login and screenshot dashboard', async ({ page }) => {
    const username = process.env.SONARR_USERNAME;
    const password = process.env.SONARR_PASSWORD;
    test.skip(!username || !password, 'SONARR_USERNAME / SONARR_PASSWORD not set');

    await page.goto(url('sonarr', '/login'));
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"], input[id="username"]', username!);
    await page.fill('input[name="password"], input[id="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('login');
    await page.screenshot({ path: screenshotPath('sonarr'), fullPage: true });
  });

  test('Radarr — login and screenshot dashboard', async ({ page }) => {
    const username = process.env.RADARR_USERNAME;
    const password = process.env.RADARR_PASSWORD;
    test.skip(!username || !password, 'RADARR_USERNAME / RADARR_PASSWORD not set');

    await page.goto(url('radarr', '/login'));
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"], input[id="username"]', username!);
    await page.fill('input[name="password"], input[id="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('login');
    await page.screenshot({ path: screenshotPath('radarr'), fullPage: true });
  });

  test('Prowlarr — login and screenshot dashboard', async ({ page }) => {
    const username = process.env.PROWLARR_USERNAME;
    const password = process.env.PROWLARR_PASSWORD;
    test.skip(!username || !password, 'PROWLARR_USERNAME / PROWLARR_PASSWORD not set');

    await page.goto(url('prowlarr', '/login'));
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"], input[id="username"]', username!);
    await page.fill('input[name="password"], input[id="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('login');
    await page.screenshot({ path: screenshotPath('prowlarr'), fullPage: true });
  });

  test('qBittorrent — login and screenshot', async ({ page }) => {
    const username = process.env.QBIT_USERNAME;
    const password = process.env.QBIT_PASSWORD;
    test.skip(!username || !password, 'QBIT_USERNAME / QBIT_PASSWORD not set');

    // Authenticate via API — cookie is set automatically
    const loginRes = await page.request.post(url('qbittorrent', '/api/v2/auth/login'), {
      form: { username, password },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Transfer cookies from API context to browser context
    const cookies = (await loginRes.headersArray())
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => {
        const [nameVal] = h.value.split(';');
        const [name, ...rest] = nameVal.split('=');
        return {
          name: name.trim(),
          value: rest.join('=').trim(),
          domain: HOST,
          path: '/',
        };
      });
    await page.context().addCookies(cookies);

    await page.goto(url('qbittorrent'));
    await page.waitForLoadState('networkidle');

    // Verify we see VueTorrent (not a login page)
    await expect(page.getByText('TORRENTS').or(page.getByText('VueTorrent')).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: screenshotPath('qbittorrent'), fullPage: true });
  });

  test('SABnzbd — screenshot dashboard', async ({ page }) => {
    const apiKey = process.env.SABNZBD_API_KEY;
    test.skip(!apiKey, 'SABNZBD_API_KEY not set');

    await page.goto(url('sabnzbd', `/?apikey=${apiKey}`));
    await page.waitForLoadState('networkidle');

    // Verify we see the SABnzbd interface (queue heading or history)
    await expect(page.locator('h2:has-text("Queue"), .main-header, .sabnzbd')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: screenshotPath('sabnzbd'), fullPage: true });
  });

  test('Overseerr — login and screenshot discover page', async ({ page }) => {
    const plexToken = process.env.PLEX_TOKEN;
    test.skip(!plexToken, 'PLEX_TOKEN not set (Overseerr uses Plex auth)');

    // Authenticate via Overseerr's Plex auth API
    const authRes = await page.request.post(url('overseerr', '/api/v1/auth/plex'), {
      data: { authToken: plexToken },
    });
    expect(authRes.ok()).toBeTruthy();

    // Transfer session cookies to browser context
    const cookies = (await authRes.headersArray())
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => {
        const [nameVal] = h.value.split(';');
        const [name, ...rest] = nameVal.split('=');
        return {
          name: name.trim(),
          value: rest.join('=').trim(),
          domain: HOST,
          path: '/',
        };
      });
    if (cookies.length > 0) {
      await page.context().addCookies(cookies);
    }

    await page.goto(url('overseerr', '/'));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    expect(page.url()).not.toContain('login');
    await page.screenshot({ path: screenshotPath('overseerr'), fullPage: true });
  });

  test('Bazarr — screenshot dashboard', async ({ page }) => {
    const apiKey = process.env.BAZARR_API_KEY;
    test.skip(!apiKey, 'BAZARR_API_KEY not set');

    // Bazarr uses X-API-KEY header for authentication
    await addHeaderToAllRequests(page, 'x-api-key', apiKey!);
    await page.goto(url('bazarr', '/'));
    await page.waitForLoadState('domcontentloaded');

    // Give the SPA time to render
    await page.waitForTimeout(3_000);

    const pageUrl = page.url();
    expect(pageUrl).not.toContain('login');
    await page.screenshot({ path: screenshotPath('bazarr'), fullPage: true });
  });

  test('Pi-hole — login and screenshot admin', async ({ page }) => {
    const password = process.env.PIHOLE_PASSWORD;
    test.skip(!password, 'PIHOLE_PASSWORD not set');

    // Pi-hole v6: authenticate via API to get SID cookie
    const loginRes = await page.request.post(url('pihole', '/api/auth'), {
      data: { password: password },
    });

    if (loginRes.ok()) {
      const body = await loginRes.json();
      if (body.session?.sid) {
        await page.context().addCookies([{
          name: 'sid',
          value: body.session.sid,
          domain: HOST,
          path: '/',
        }]);
      }
    }

    await page.goto(url('pihole', '/admin/'));
    await page.waitForLoadState('networkidle');

    // If API auth didn't work, fall back to form login
    const loginForm = page.locator('input[type="password"]');
    if (await loginForm.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await loginForm.fill(password!);
      await page.locator('button:has-text("Log in"), button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle');
    }

    // Verify we see the dashboard (Pi-hole shows query stats)
    await expect(
      page.locator('#queries-over-time, canvas, .card, [class*="dashboard"]').first()
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: screenshotPath('pihole'), fullPage: true });
  });
});

// ─── VPN connectivity test ────────────────────────────────────────────────────

test.describe('VPN connectivity', () => {
  test('VPN-tunneled services are reachable (Gluetun healthy)', async ({ request }) => {
    const sonarrKey = process.env.SONARR_API_KEY;
    test.skip(!sonarrKey, 'SONARR_API_KEY not set');

    // Sonarr/Radarr/qBittorrent run through Gluetun (network_mode: service:gluetun).
    // They only start when Gluetun is healthy (VPN connected). If we can reach
    // them, the VPN tunnel is active.
    // For actual IP comparison, run scripts/check-vpn.sh on the NAS.
    const res = await request.get(url('sonarr', '/api/v3/system/status'), {
      headers: { 'X-Api-Key': sonarrKey! },
    });
    expect(res.ok()).toBeTruthy();
    const status = await res.json();
    expect(status.appName).toBe('Sonarr');
  });
});

// ─── API assertion tests ─────────────────────────────────────────────────────

test.describe('API assertions', () => {
  test('Radarr — root folder is /data/media/movies', async ({ request }) => {
    const apiKey = process.env.RADARR_API_KEY;
    test.skip(!apiKey, 'RADARR_API_KEY not set');

    const res = await request.get(url('radarr', '/api/v3/rootfolder'), {
      headers: { 'X-Api-Key': apiKey! },
    });
    expect(res.ok()).toBeTruthy();
    const folders = await res.json();
    expect(folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/data/media/movies', accessible: true }),
      ]),
    );
  });

  test('Sonarr — root folder is /data/media/tv', async ({ request }) => {
    const apiKey = process.env.SONARR_API_KEY;
    test.skip(!apiKey, 'SONARR_API_KEY not set');

    const res = await request.get(url('sonarr', '/api/v3/rootfolder'), {
      headers: { 'X-Api-Key': apiKey! },
    });
    expect(res.ok()).toBeTruthy();
    const folders = await res.json();
    expect(folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/data/media/tv', accessible: true }),
      ]),
    );
  });

  test('Radarr — has movies', async ({ request }) => {
    const apiKey = process.env.RADARR_API_KEY;
    test.skip(!apiKey, 'RADARR_API_KEY not set');

    const res = await request.get(url('radarr', '/api/v3/movie'), {
      headers: { 'X-Api-Key': apiKey! },
    });
    expect(res.ok()).toBeTruthy();
    const movies = await res.json();
    expect(movies.length).toBeGreaterThan(0);
  });

  test('Sonarr — has series', async ({ request }) => {
    const apiKey = process.env.SONARR_API_KEY;
    test.skip(!apiKey, 'SONARR_API_KEY not set');

    const res = await request.get(url('sonarr', '/api/v3/series'), {
      headers: { 'X-Api-Key': apiKey! },
    });
    expect(res.ok()).toBeTruthy();
    const series = await res.json();
    expect(series.length).toBeGreaterThan(0);
  });
});
