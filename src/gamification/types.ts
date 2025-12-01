/**
 * Type definitions for gamification system
 */

export interface KillStats {
  totalKills: number;
  killsByType: Record<string, number>;
  firstKillTimestamp: number | null;
  lastKillTimestamp: number | null;
  mostKilledPort: number | null;
  mostKilledPortCount: number;
  forceKills: number;
}

export interface KillerRank {
  name: string;
  minKills: number;
  emoji?: string;
}

export interface KillMessage {
  message: string;
  emoji?: string;
  color?: string;
}
