/**
 * Dashboard state management
 * Defines the state structure and initialization
 */

import type { PortInfo, PortGroup } from "../port/types.js";

export interface DashboardState {
  ports: PortInfo[];
  groups: PortGroup[];
  selectedIndex: number;
  selectedGroupIndex: number;
  filter: string;
  filterMode: "port" | "process" | "user" | "all";
  showHelp: boolean;
  showConfirm: boolean;
  confirmAction: (() => Promise<void>) | null;
  confirmMessage: string;
  showLogs: boolean;
  logsContent: string | null;
  showCommand: boolean;
  commandContent: string | null;
  refreshInterval: number;
  lastUpdate: number;
  sortBy: "port" | "process" | "pid";
  quickKill: boolean;
  showDetails: boolean;
  searching: boolean; // Port search mode (like lsof -i :PORT)
  isKilling: boolean; // Loading state while killing
  killingPort: number | null; // Port being killed
  // Gamification state
  killMessage: { message: string; emoji?: string; color?: string } | null;
  killMessageExpiresAt: number | null;
  showStats: boolean;
  statsContent: string | null;
  currentRank: string | null;
}

/**
 * Create initial dashboard state
 */
export function createInitialState(): DashboardState {
  return {
    ports: [],
    groups: [],
    selectedIndex: 0,
    selectedGroupIndex: 0,
    filter: "",
    filterMode: "all",
    showHelp: false,
    showConfirm: false,
    confirmAction: null,
    confirmMessage: "",
    showLogs: false,
    logsContent: null,
    showCommand: false,
    commandContent: null,
    refreshInterval: 2000,
    lastUpdate: 0,
    sortBy: "port",
    quickKill: false,
    showDetails: true,
    searching: false,
    isKilling: false,
    killingPort: null,
    killMessage: null,
    killMessageExpiresAt: null,
    showStats: false,
    statsContent: null,
    currentRank: null,
  };
}
