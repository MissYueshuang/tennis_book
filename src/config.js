export const config = {
  portalUrl: 'https://thekallang.perfectgym.com/clientportal2/#/FacilityBooking',
  loginUrl: 'https://thekallang.perfectgym.com/clientportal2/#/Login',
  // Tennis zone types inside PerfectGym. "Outdoor (Resident)" — confirm on first
  // headed run; if the label differs, update `zoneLabel` below.
  zoneLabel: /outdoor.*resident/i,
  minStartHour: Number(process.env.MIN_START ?? 19),
  maxStartHour: Number(process.env.MAX_START ?? 21),
  durationMin: Number(process.env.DURATION_MIN ?? 60),
  maxDaysAhead: Number(process.env.MAX_DAYS_AHEAD ?? 14),
  dryRun: process.env.DRY_RUN === '1',
  headless: process.env.HEADLESS !== '0',
  email: process.env.KALLANG_EMAIL,
  password: process.env.KALLANG_PASSWORD,
};

export function assertConfig() {
  if (!config.email || !config.password) {
    throw new Error('KALLANG_EMAIL and KALLANG_PASSWORD must be set');
  }
}
