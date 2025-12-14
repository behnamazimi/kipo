/**
 * Dashboard data management
 * Handles filtering, caching, sorting, and port selection
 */

import type { PortInfo, PortGroup } from "../port/types.js";
import type { DashboardState } from "./dashboard-state.js";

export interface FilteredPortsCache {
  result: Array<{ port: PortInfo; group: PortGroup }>;
  filter: string;
  groupsHash: string;
  sortBy: string;
}

/**
 * Get filtered and flat list of ports (memoized)
 */
export function getFilteredPorts(
  state: DashboardState,
  groups: PortGroup[],
  cache: FilteredPortsCache | null
): {
  filteredPorts: Array<{ port: PortInfo; group: PortGroup }>;
  newCache: FilteredPortsCache | null;
} {
  // Create a simple hash of groups state (collapsed state and port count)
  const groupsHash = groups
    .map((g) => `${g.id}:${g.collapsed ? "1" : "0"}:${g.ports.length}`)
    .join("|");

  // Check cache
  if (
    cache &&
    cache.filter === state.filter &&
    cache.groupsHash === groupsHash &&
    cache.sortBy === state.sortBy
  ) {
    return { filteredPorts: cache.result, newCache: cache };
  }

  // Recalculate
  const flat: Array<{ port: PortInfo; group: PortGroup }> = [];

  for (const group of groups) {
    if (!group.collapsed) {
      for (const port of group.ports) {
        // Apply filter
        if (state.filter) {
          const filterLower = state.filter.toLowerCase();
          const portMatch = port.port.toString().includes(state.filter);
          const processMatch = port.processName.toLowerCase().includes(filterLower);
          const commandMatch = port.command.toLowerCase().includes(filterLower);

          if (!portMatch && !processMatch && !commandMatch) {
            continue;
          }
        }

        flat.push({ port, group });
      }
    }
  }

  // Update cache
  const newCache: FilteredPortsCache = {
    result: flat,
    filter: state.filter,
    groupsHash,
    sortBy: state.sortBy,
  };

  return { filteredPorts: flat, newCache };
}

/**
 * Get currently selected port
 */
export function getSelectedPort(
  filteredPorts: Array<{ port: PortInfo; group: PortGroup }>,
  selectedIndex: number
): { port: PortInfo; group: PortGroup } | null {
  if (filteredPorts.length === 0) return null;

  const index = Math.min(selectedIndex, filteredPorts.length - 1);
  return filteredPorts[index] || null;
}

/**
 * Apply sorting to groups
 */
export function applySorting(groups: PortGroup[], sortBy: DashboardState["sortBy"]): void {
  for (const group of groups) {
    group.ports.sort((a, b) => {
      switch (sortBy) {
        case "port":
          return a.port - b.port;
        case "process":
          return a.processName.localeCompare(b.processName);
        case "pid":
          return a.pid - b.pid;
        default:
          return 0;
      }
    });
  }
}

/**
 * Apply CLI sorting to groups (includes "user" option)
 */
export function applyCLISorting(
  groups: PortGroup[],
  sortBy: "port" | "process" | "pid" | "user"
): void {
  for (const group of groups) {
    group.ports.sort((a, b) => {
      switch (sortBy) {
        case "port":
          return a.port - b.port;
        case "process":
          return a.processName.localeCompare(b.processName);
        case "pid":
          return a.pid - b.pid;
        case "user":
          return a.user.localeCompare(b.user);
        default:
          return a.port - b.port;
      }
    });
  }
}

/**
 * Move selection up or down
 */
export function moveSelection(
  filteredPorts: Array<{ port: PortInfo; group: PortGroup }>,
  currentIndex: number,
  direction: number
): number {
  if (filteredPorts.length === 0) return currentIndex;

  let newIndex = currentIndex + direction;

  if (newIndex < 0) {
    newIndex = filteredPorts.length - 1;
  } else if (newIndex >= filteredPorts.length) {
    newIndex = 0;
  }

  return newIndex;
}

/**
 * Toggle group collapse/expand
 */
export function toggleGroup(
  groups: PortGroup[],
  selectedPort: { port: PortInfo; group: PortGroup } | null
): void {
  if (!selectedPort) return;

  const group = groups.find((g) => g.id === selectedPort.group.id);
  if (group) {
    group.collapsed = !group.collapsed;
  }
}

/**
 * Format lifetime in seconds to human-readable string
 */
export function formatLifetime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m${secs}s`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes}m`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d${hours}h`;
  }
}

/**
 * Adjust selected index to valid range
 */
export function adjustSelectedIndex(
  filteredPorts: Array<{ port: PortInfo; group: PortGroup }>,
  currentIndex: number
): number {
  if (currentIndex >= filteredPorts.length) {
    return Math.max(0, filteredPorts.length - 1);
  }
  return currentIndex;
}
