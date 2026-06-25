/**
 * quotaGuard.js
 *
 * YouTube Data API v3 unit costs:
 *   search.list          = 100  ← most expensive, minimize
 *   playlistItems.list   =   1
 *   playlistItems.insert =  50
 *   playlists.insert     =  50
 *   videos.list          =   1  ← use this instead of search where possible
 *
 * Free daily quota : 10,000 units
 * We cap at 8,000  : leaves 2,000 buffer for playlist fetches
 *
 * Resets midnight Pacific time (same as Google's reset).
 */

const DAILY_QUOTA  = 10_000;
const SAFE_LIMIT   = 8_000;   // hard stop before hitting Google's wall

// ── State (resets daily) ──────────────────────────────────────
let usedToday = 0;
let resetDate  = todayStr();

function todayStr() {
  // Use Pacific time for reset alignment with Google
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function checkReset() {
  const today = todayStr();
  if (today !== resetDate) {
    console.log(`[quota] Daily reset. Was ${usedToday} units. Resetting.`);
    usedToday = 0;
    resetDate  = today;
  }
}

// ── Public API ────────────────────────────────────────────────

function spend(units) {
  checkReset();
  usedToday += units;
  console.log(`[quota] spent ${units} → total today: ${usedToday}/${SAFE_LIMIT}`);
}

function remaining() {
  checkReset();
  return Math.max(0, SAFE_LIMIT - usedToday);
}

function canAfford(units) {
  return remaining() >= units;
}

function getStats() {
  checkReset();
  return {
    used:      usedToday,
    safeLimit: SAFE_LIMIT,
    hardLimit: DAILY_QUOTA,
    remaining: remaining(),
    resetDate,
    percentUsed: Math.round((usedToday / SAFE_LIMIT) * 100),
  };
}

// Unit costs for every operation we use
const COSTS = {
  searchList:          100,
  playlistItemsList:     1,
  playlistItemsInsert:  50,
  playlistsInsert:      50,
  videosList:            1,
  playlistsList:         1,
};

module.exports = { spend, remaining, canAfford, getStats, COSTS };
