# Tennis squeeze-slot bot — Kallang (PerfectGym)

Auto-books an outdoor (resident) tennis court at The Kallang whenever a 60-min
slot opens between 7pm and 10pm on any upcoming date. Runs on GitHub Actions
cron (every 5 min during evenings SGT).

## How it works

1. Playwright logs in with your Kallang account.
2. Checks "My Bookings" — if you already have an upcoming tennis booking, it exits.
3. Opens the **Outdoor (Resident)** zone in Facility Booking.
4. Scans the next 14 days for a free 60-min slot starting 7pm–9pm.
5. Books the first match. Your PerfectGym wallet credits pay for it.
6. Opens a GitHub issue when a booking lands, so you get a notification.

## First-time setup

### 1. Create a private GitHub repo and push this code

```bash
cd ~/Desktop/tennis_book
git init
git add .
git commit -m "initial"
gh repo create tennis-book --private --source=. --push
```

### 2. Add secrets

```bash
gh secret set KALLANG_EMAIL --body "lengyueshuang.luna@gmail.com"
gh secret set KALLANG_PASSWORD   # paste password when prompted
```

### 3. Validate locally (headed, dry run) before enabling cron

```bash
npm install
npx playwright install chromium
cp .env.example .env   # fill in your creds
HEADLESS=0 DRY_RUN=1 npm run book
```

You'll see Chromium open, log in, and navigate to a slot. The script stops
*before* clicking final Confirm. Watch the flow carefully — if the zone label
or a selector doesn't match, adjust in `src/config.js` / `src/booker.js` and
retry. Screenshots drop in `artifacts/` for each step.

### 4. Validate on GitHub Actions (dry run)

In your repo, go to **Actions → Tennis squeeze-slot bot → Run workflow**,
set `dry_run = true`, run it. Download the `run-*` artifact to inspect
`trace.zip` in https://trace.playwright.dev if anything looked off.

### 5. Enable live booking

Once dry runs look right, do one live manual run:

```bash
# or via the Actions UI with dry_run = false
DRY_RUN=0 HEADLESS=0 npm run book
```

From then on the 5-min cron will auto-book the first matching slot.

## Knobs

Env vars (set in `.env` locally or as workflow inputs):

| Var              | Default | Meaning                                  |
|------------------|---------|------------------------------------------|
| `MIN_START`      | 19      | Earliest slot start hour (24h)           |
| `MAX_START`      | 21      | Latest slot start hour (ends by 10pm)    |
| `DURATION_MIN`   | 60      | Slot length (the script filters by start time) |
| `MAX_DAYS_AHEAD` | 14      | How far ahead to scan                    |
| `DRY_RUN`        | 0       | 1 = don't click final Confirm            |
| `HEADLESS`       | 1       | 0 = watch the browser                    |

## Known limitations

- **Cron latency.** GitHub cron has minimum 5-min granularity and is delayed
  under load. Real cancellations can disappear in seconds; this bot catches
  the ones that linger >5 min and all new-window releases.
- **PerfectGym DOM drift.** Selectors in `src/booker.js` are fuzzy but may
  need tweaking if PerfectGym updates the UI. Screenshots + trace artifacts
  make this easy to diagnose.
- **Wallet balance.** The script assumes your prepaid wallet has ≥SGD 10.
  If a booking fails for payment, the Confirm step will error; check your
  balance at the portal.
- **Already-booked guard.** The script exits if `/ScheduleHistory` shows any
  upcoming tennis booking, to avoid double-booking. Cancel manually to let
  it book another.

## Files

- `src/config.js` — criteria + env bindings
- `src/booker.js` — Playwright flow
- `src/index.js` — entrypoint + result.json + step-summary
- `.github/workflows/book.yml` — cron, secrets, artifact upload, issue notifier
