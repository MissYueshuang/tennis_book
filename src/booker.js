import { chromium } from 'playwright';
import { config } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACTS = 'artifacts';
fs.mkdirSync(ARTIFACTS, { recursive: true });

function log(...args) {
  console.log(new Date().toISOString(), '-', ...args);
}

async function snap(page, name) {
  const file = path.join(ARTIFACTS, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  log('screenshot', file);
}

async function login(page) {
  log('login: opening portal');
  await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

  // PerfectGym login inputs are typically labeled "Login" / "Password".
  // Use fuzzy selectors so label variations still match.
  const emailBox = page
    .getByLabel(/login|e-?mail|username/i)
    .or(page.locator('input[type="email"], input[name="Login"], input[name="Email"]'))
    .first();
  const pwBox = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();

  await emailBox.waitFor({ state: 'visible', timeout: 20_000 });
  await emailBox.fill(config.email);
  await pwBox.fill(config.password);

  const submit = page
    .getByRole('button', { name: /log\s*in|sign\s*in/i })
    .or(page.locator('button[type="submit"]'))
    .first();
  await submit.click();

  // Consider login done when URL leaves the Login route.
  await page.waitForURL((url) => !/login/i.test(url.toString()), { timeout: 30_000 });
  log('login: ok');
}

async function openOutdoorResidentZone(page) {
  log('navigate: facility booking');
  await page.goto(config.portalUrl, { waitUntil: 'networkidle' });

  // PerfectGym shows zone tiles/tabs. Click the one matching "Outdoor (Resident)".
  const zone = page.getByText(config.zoneLabel).first();
  await zone.waitFor({ state: 'visible', timeout: 20_000 });
  await zone.click();
  await page.waitForLoadState('networkidle');
  await snap(page, 'zone-opened');
}

function inWindow(hour) {
  return hour >= config.minStartHour && hour <= config.maxStartHour;
}

/**
 * Find the first bookable slot in the 7-10pm window on the currently-displayed day.
 * PerfectGym's grid renders time cells with the start time as text (e.g. "19:00")
 * and an "available" indicator when bookable. Selectors here are intentionally loose.
 */
async function findAvailableSlot(page) {
  // Wait for the grid to populate.
  await page.waitForTimeout(1500);

  // Each slot in PerfectGym's FacilityBooking is typically a div with class
  // containing "calendar-event" / "slot" and a status modifier. The reliable
  // signal is the time text + a clickable affordance.
  const slots = page.locator(
    '[class*="slot"], [class*="calendar-event"], [class*="facility-booking"] button, [class*="facility-booking"] [role="button"]'
  );
  const count = await slots.count();
  log('slots on page:', count);

  for (let i = 0; i < count; i++) {
    const slot = slots.nth(i);
    const text = (await slot.innerText().catch(() => '')).trim();
    if (!text) continue;

    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;
    const hour = Number(timeMatch[1]);
    if (!inWindow(hour)) continue;

    // Heuristic: if the slot is marked booked/unavailable, skip.
    const cls = (await slot.getAttribute('class')) ?? '';
    if (/booked|unavailable|disabled|occupied|past/i.test(cls)) continue;
    if (/booked|full|unavailable/i.test(text)) continue;

    return slot;
  }
  return null;
}

async function goToDate(page, dayOffset) {
  if (dayOffset === 0) return;
  // PerfectGym calendar: a "next day" arrow is usually aria-labelled "Next".
  const next = page
    .getByRole('button', { name: /next/i })
    .or(page.locator('button[aria-label*="next" i], [class*="next-day"], [class*="day-next"]'))
    .first();
  for (let i = 0; i < dayOffset; i++) {
    await next.click();
    await page.waitForTimeout(400);
  }
}

async function bookSlot(page, slot) {
  await slot.scrollIntoViewIfNeeded();
  await slot.click();

  // A confirmation dialog appears.
  const confirm = page
    .getByRole('button', { name: /book|confirm|reserve|pay/i })
    .last();
  await confirm.waitFor({ state: 'visible', timeout: 15_000 });

  await snap(page, 'confirm-dialog');

  if (config.dryRun) {
    log('DRY_RUN set — not clicking final confirm');
    return { booked: false, reason: 'dry-run' };
  }

  await confirm.click();
  await page.waitForTimeout(2500);
  await snap(page, 'post-booking');

  // PerfectGym typically shows "Booking successful" or a green toast.
  const success = await page
    .getByText(/success|confirmed|booked/i)
    .first()
    .isVisible()
    .catch(() => false);

  return { booked: success, reason: success ? 'ok' : 'unknown-state' };
}

async function hasExistingUpcomingBooking(page) {
  // Quick sanity check on "My Bookings" to avoid double-booking.
  await page
    .goto('https://thekallang.perfectgym.com/clientportal2/#/ScheduleHistory', {
      waitUntil: 'networkidle',
    })
    .catch(() => {});
  await page.waitForTimeout(1000);
  const text = (await page.content()).toLowerCase();
  // If there's any future-dated tennis booking we bail.
  return /tennis/.test(text) && /upcoming|scheduled/.test(text);
}

export async function run() {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  let result = { booked: false, reason: 'no-match' };
  try {
    await login(page);

    if (await hasExistingUpcomingBooking(page)) {
      log('already have an upcoming tennis booking — skipping');
      result = { booked: false, reason: 'already-booked' };
      return result;
    }

    await openOutdoorResidentZone(page);

    for (let d = 0; d <= config.maxDaysAhead; d++) {
      log('scanning day offset', d);
      await goToDate(page, d === 0 ? 0 : 1);
      await snap(page, `day-${d}`);
      const slot = await findAvailableSlot(page);
      if (slot) {
        log('match found on day offset', d);
        result = await bookSlot(page, slot);
        if (result.booked || result.reason === 'dry-run') break;
      }
    }
  } catch (err) {
    log('error:', err.message);
    await snap(page, 'error');
    result = { booked: false, reason: 'error', error: err.message };
  } finally {
    await context.tracing.stop({ path: path.join(ARTIFACTS, 'trace.zip') }).catch(() => {});
    await browser.close();
  }
  return result;
}
