/**
 * Dashboard - Main orchestration class
 * Coordinates state management, data processing, and rendering
 */

import { PortDetector } from "../port/port-detector.js";
import { PortProcessor } from "../port/port-processor.js";
import { KeyboardHandler } from "./keyboard.js";
import { ANSIRenderer } from "./renderer.js";
import type { PortInfo, PortGroup } from "../port/types.js";
import { applyFiltersToGroups, type SortOption } from "../utils/filter-utils.js";
import { logger } from "../utils/logger.js";
import { setupKeyboardHandlers, type DashboardHandlers } from "./dashboard-handlers.js";
import { getCurrentRank, formatRank } from "../gamification/killer-ranks.js";
import { loadStats } from "../gamification/stats.js";
import { type DashboardState, createInitialState } from "./dashboard-state.js";
import {
  getFilteredPorts,
  getSelectedPort as getSelectedPortData,
  applySorting,
  applyCLISorting,
  moveSelection,
  toggleGroup,
  adjustSelectedIndex,
  type FilteredPortsCache,
} from "./dashboard-data.js";
import { DashboardRenderer, type RenderState } from "./dashboard-renderer.js";

// Re-export DashboardState for external use
export type { DashboardState } from "./dashboard-state.js";

export class Dashboard {
  private detector: PortDetector;
  private processor: PortProcessor;
  private renderer: ANSIRenderer;
  private keyboard: KeyboardHandler;
  private state: DashboardState;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private searchBuffer: string = "";

  // Memoization cache for filtered ports
  private filteredPortsCache: FilteredPortsCache | null = null;

  // Delta rendering: track previous render state
  private previousRenderState: RenderState | null = null;

  // Filter options from CLI
  private readonly filterOptions: {
    type?: string;
    user?: string;
    process?: string;
    sort?: SortOption;
  };

  // Dashboard renderer instance
  private dashboardRenderer: DashboardRenderer;

  constructor(options?: { type?: string; user?: string; process?: string; sort?: SortOption }) {
    this.detector = new PortDetector();
    this.processor = new PortProcessor();
    this.renderer = new ANSIRenderer();
    this.keyboard = new KeyboardHandler();
    this.filterOptions = options || {};

    this.state = createInitialState();

    // Initialize dashboard renderer with callbacks
    this.dashboardRenderer = new DashboardRenderer(
      this.renderer,
      () => this.getFilteredPorts(),
      () => this.getSelectedPort()
    );
  }

  /**
   * Start the dashboard
   */
  async start(): Promise<void> {
    this.isRunning = true;

    // Load initial stats and rank
    const stats = loadStats();
    const rank = getCurrentRank(stats.totalKills);
    this.state.currentRank = formatRank(rank);

    // Setup keyboard handlers
    this.setupKeyboard();

    // Initial render
    await this.refresh();

    // Start refresh timer
    this.startRefreshTimer();

    // Handle terminal resize
    process.stdout.on("resize", () => {
      this.renderer.updateScreenSize();
      this.render();
    });

    // Start keyboard input
    this.keyboard.start();
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    this.isRunning = false;
    this.stopRefreshTimer();
    this.keyboard.stop();
    this.renderer.clear();
    this.renderer.showCursor();
    this.renderer.render();
  }

  /**
   * Get handlers interface for external handlers module
   */
  private getHandlers(): DashboardHandlers {
    return {
      getState: () => this.state,
      setState: (updater) => {
        updater(this.state);
      },
      getSelectedPort: () => this.getSelectedPort(),
      moveSelection: (delta) => this.moveSelection(delta),
      applySorting: () => this.applySorting(),
      toggleGroup: () => this.toggleGroup(),
      refresh: () => this.refresh(),
      render: () => this.render(),
      stop: () => this.stop(),
      clearFilteredPortsCache: () => {
        this.filteredPortsCache = null;
      },
      clearDetectorCache: () => {
        this.detector.clearCache();
      },
      clearSearchBuffer: () => {
        this.searchBuffer = "";
      },
    };
  }

  /**
   * Setup keyboard shortcuts
   */
  private setupKeyboard(): void {
    // Use extracted handlers for most shortcuts
    setupKeyboardHandlers(this.keyboard, this.getHandlers());

    // Handle search input (kept here because it needs direct access to searchBuffer)
    this.keyboard.on("*", (key: string) => {
      if (this.state.searching && key.length === 1 && /[0-9]/.test(key)) {
        this.searchBuffer += key;
        this.state.filter = this.searchBuffer;
        // Invalidate cache when filter changes
        this.filteredPortsCache = null;
        this.render();
      } else if (this.state.searching && key === "backspace") {
        this.searchBuffer = this.searchBuffer.slice(0, -1);
        this.state.filter = this.searchBuffer;
        // Invalidate cache when filter changes
        this.filteredPortsCache = null;
        this.render();
      }
    });
  }

  /**
   * Apply sorting to groups (with cache invalidation)
   */
  private applySorting(): void {
    applySorting(this.state.groups, this.state.sortBy);
    // Invalidate cache when sorting changes
    this.filteredPortsCache = null;
  }

  /**
   * Move selection up or down
   */
  private moveSelection(direction: number): void {
    const flatPorts = this.getFilteredPorts();
    this.state.selectedIndex = moveSelection(flatPorts, this.state.selectedIndex, direction);
  }

  /**
   * Get filtered and flat list of ports (memoized)
   */
  private getFilteredPorts(): Array<{ port: PortInfo; group: PortGroup }> {
    const result = getFilteredPorts(this.state, this.state.groups, this.filteredPortsCache);
    this.filteredPortsCache = result.newCache;
    return result.filteredPorts;
  }

  /**
   * Get currently selected port
   */
  private getSelectedPort(): { port: PortInfo; group: PortGroup } | null {
    const flatPorts = this.getFilteredPorts();
    return getSelectedPortData(flatPorts, this.state.selectedIndex);
  }

  /**
   * Toggle group collapse/expand
   */
  private toggleGroup(): void {
    const selected = this.getSelectedPort();
    toggleGroup(this.state.groups, selected);
  }

  /**
   * Refresh port data
   */
  async refresh(): Promise<void> {
    try {
      const ports = await this.detector.detectPorts();
      const result = await this.processor.processPorts(ports);

      this.state.ports = result.ports;

      // Apply CLI filters if provided
      if (this.filterOptions.type || this.filterOptions.user || this.filterOptions.process) {
        this.state.groups = applyFiltersToGroups(
          result.groups,
          {
            type: this.filterOptions.type,
            user: this.filterOptions.user,
            process: this.filterOptions.process,
            sort: this.filterOptions.sort,
          },
          this.processor
        );
      } else {
        this.state.groups = result.groups;
      }

      this.state.lastUpdate = result.timestamp;

      // Apply sorting (use CLI sort option if provided, otherwise use state sortBy)
      const sortOption = this.filterOptions.sort || this.state.sortBy;
      if (this.filterOptions.sort) {
        // Apply CLI sort to all groups (includes "user" option)
        applyCLISorting(this.state.groups, sortOption as "port" | "process" | "pid" | "user");
      } else {
        this.applySorting();
      }

      // Adjust selected index if needed
      const flatPorts = this.getFilteredPorts();
      this.state.selectedIndex = adjustSelectedIndex(flatPorts, this.state.selectedIndex);

      // Invalidate cache after refresh (groups may have changed)
      this.filteredPortsCache = null;
    } catch (error) {
      logger.error("Failed to refresh ports:", error);
    }
  }

  /**
   * Start refresh timer
   */
  private startRefreshTimer(): void {
    this.stopRefreshTimer();

    this.refreshTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.refresh();
        this.render();
      }
    }, this.state.refreshInterval);
  }

  /**
   * Stop refresh timer
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Render the dashboard (with delta rendering optimization)
   */
  render(): void {
    // Check and clear expired kill messages
    if (this.state.killMessage && this.state.killMessageExpiresAt) {
      if (Date.now() > this.state.killMessageExpiresAt) {
        this.state.killMessage = null;
        this.state.killMessageExpiresAt = null;
      }
    }

    // Use dashboard renderer
    const newRenderState = this.dashboardRenderer.render(
      this.state,
      this.previousRenderState,
      this.searchBuffer
    );

    // Update previous render state (null for modal views, new state for main view)
    this.previousRenderState = newRenderState;
  }
}
