/**
 * Killer rank system - career progression based on kill count
 */

import type { KillerRank } from "./types.js";

/**
 * Rank definitions in ascending order
 */
const KILLER_RANKS: KillerRank[] = [
  { name: "Junior Killer", minKills: 1, emoji: "🌱" },
  { name: "Associate Killer", minKills: 10, emoji: "⭐" },
  { name: "Mid-Level Killer", minKills: 25, emoji: "🔥" },
  { name: "Senior Killer", minKills: 50, emoji: "💀" },
  { name: "Lead Killer", minKills: 100, emoji: "⚡" },
  { name: "Principal Killer", minKills: 250, emoji: "👑" },
  { name: "Staff Killer", minKills: 500, emoji: "🏆" },
  { name: "Distinguished Killer", minKills: 1000, emoji: "🌟" },
];

/**
 * Get current rank based on total kills
 */
export function getCurrentRank(totalKills: number): KillerRank {
  // Find the highest rank the user qualifies for
  let currentRank = KILLER_RANKS[0];

  for (const rank of KILLER_RANKS) {
    if (totalKills >= rank.minKills) {
      currentRank = rank;
    } else {
      break;
    }
  }

  return currentRank;
}

/**
 * Check if user just ranked up
 */
export function checkRankUp(previousKills: number, currentKills: number): KillerRank | null {
  const previousRank = getCurrentRank(previousKills);
  const currentRank = getCurrentRank(currentKills);

  if (currentRank.name !== previousRank.name) {
    return currentRank;
  }

  return null;
}

/**
 * Format rank display string
 */
export function formatRank(rank: KillerRank): string {
  if (rank.emoji) {
    return `${rank.emoji} ${rank.name}`;
  }
  return rank.name;
}
