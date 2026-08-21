import { test, expect } from '@playwright/test';
import { HOST, url, screenshotPath, addHeaderToAllRequests } from './helpers';

// Split out of the former stack.spec.ts on 2026-08-16, alongside
// api-assertions.spec.ts. Shared ports, URL building and the auth-header shim
// live in ./helpers, which networking.spec.ts and vpn-security.spec.ts also use.

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
    await page.waitForURL(/.*(?<!\/login)$/, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');

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

  test('Seerr — login and screenshot discover page', async ({ page }) => {
    const plexToken = process.env.PLEX_TOKEN;
    test.skip(!plexToken, 'PLEX_TOKEN not set (Seerr uses Plex auth)');

    // Authenticate via Seerr's Plex auth API
    const authRes = await page.request.post(url('seerr', '/api/v1/auth/plex'), {
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

    await page.goto(url('seerr', '/'));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);

    expect(page.url()).not.toContain('login');
    await page.screenshot({ path: screenshotPath('seerr'), fullPage: true });
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
