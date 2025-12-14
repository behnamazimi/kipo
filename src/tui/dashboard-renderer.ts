/**
 * Dashboard rendering logic
 * Handles all rendering operations including main view, modals, and delta rendering
 */

import type { DashboardState } from "./dashboard-state.js";
import type { PortInfo, PortGroup } from "../port/types.js";
import type { ANSIRenderer } from "./renderer.js";
import {
  Colors,
  Styles,
  Backgrounds,
  getCategoryColor,
  truncate,
  pad,
  type ANSIColor,
} from "./renderer.js";
import { formatLifetime } from "./dashboard-data.js";

export interface RenderState {
  filteredPorts: Array<{ port: PortInfo; group: PortGroup }>;
  selectedIndex: number;
  filter: string;
  sortBy: string;
  showDetails: boolean;
}

export class DashboardRenderer {
  constructor(
    private renderer: ANSIRenderer,
    private getFilteredPorts: () => Array<{ port: PortInfo; group: PortGroup }>,
    private getSelectedPort: () => { port: PortInfo; group: PortGroup } | null
  ) {}

  /**
   * Render the dashboard (with delta rendering optimization)
   */
  render(
    state: DashboardState,
    previousRenderState: RenderState | null,
    searchBuffer: string
  ): RenderState | null {
    // For modal views, always do full render
    if (
      state.showHelp ||
      state.showConfirm ||
      state.showLogs ||
      state.showCommand ||
      state.showStats
    ) {
      this.renderer.clear();
      this.renderer.hideCursor();

      if (state.showHelp) {
        this.renderHelp();
      } else if (state.showConfirm) {
        this.renderConfirm(state);
      } else if (state.showLogs) {
        this.renderLogs(state);
      } else if (state.showCommand) {
        this.renderCommand(state);
      } else if (state.showStats) {
        this.renderStats(state);
      }

      this.renderer.render();
      return null; // Reset delta state for modal views
    }

    // For main view, use delta rendering
    const filteredPorts = this.getFilteredPorts();
    const currentState: RenderState = {
      filteredPorts,
      selectedIndex: state.selectedIndex,
      filter: state.filter,
      sortBy: state.sortBy,
      showDetails: state.showDetails,
    };

    // Check and clear expired kill messages (but only if not rendering immediately)
    if (state.killMessage && state.killMessageExpiresAt) {
      if (Date.now() > state.killMessageExpiresAt) {
        // This will be handled by the caller updating state
      }
    }

    // Force full render if there's a kill message or if entering search mode (to ensure it's displayed)
    const hasKillMessage = state.killMessage !== null;
    // Force full render when entering search mode (searching is true and buffer is empty)
    const isEnteringSearchMode = state.searching && searchBuffer === "" && state.filter === "";

    // Check if we can use delta rendering
    const canUseDelta =
      !hasKillMessage &&
      !isEnteringSearchMode &&
      previousRenderState !== null &&
      previousRenderState.filteredPorts.length === currentState.filteredPorts.length &&
      previousRenderState.filter === currentState.filter &&
      previousRenderState.sortBy === currentState.sortBy &&
      previousRenderState.showDetails === currentState.showDetails;

    if (canUseDelta && previousRenderState) {
      // Delta render: only update changed lines
      this.renderDelta(previousRenderState, currentState, state, searchBuffer);
    } else {
      // Full render
      this.renderer.clear();
      this.renderer.hideCursor();
      this.renderMain(state, filteredPorts, searchBuffer);
      this.renderer.render();
    }

    return currentState;
  }

  /**
   * Delta render: only update changed lines
   */
  private renderDelta(
    previous: RenderState,
    current: RenderState,
    state: DashboardState,
    searchBuffer: string
  ): void {
    const { height } = this.renderer.getScreenSize();
    const maxHeight = height - (state.showDetails ? 6 : 4);

    // Find changed lines (selection change or port data change)
    const changedLines = new Set<number>();

    // Check for selection change
    if (previous.selectedIndex !== current.selectedIndex) {
      changedLines.add(previous.selectedIndex + 2); // +2 for header offset
      changedLines.add(current.selectedIndex + 2);
    }

    // Check for port data changes (simplified: check if ports at same index have different data)
    const minLength = Math.min(previous.filteredPorts.length, current.filteredPorts.length);
    for (let i = 0; i < minLength && i + 2 < maxHeight; i++) {
      const prev = previous.filteredPorts[i];
      const curr = current.filteredPorts[i];

      // Check if port data changed (simplified check)
      if (
        prev.port.pid !== curr.port.pid ||
        prev.port.port !== curr.port.port ||
        prev.port.processName !== curr.port.processName ||
        prev.port.command !== curr.port.command ||
        prev.port.lifetime !== curr.port.lifetime ||
        prev.port.type !== curr.port.type
      ) {
        changedLines.add(i + 2);
      }
    }

    // If too many changes, do full render instead
    if (changedLines.size > maxHeight / 2) {
      this.renderer.clear();
      this.renderer.hideCursor();
      this.renderMain(state, current.filteredPorts, "");
      this.renderer.render();
      return;
    }

    // Render only changed lines
    this.renderer.hideCursor();

    // Render header (always check if it changed)
    this.renderer.moveTo(0, 0);
    this.renderHeader(state, current.filteredPorts);

    // Render changed port lines
    for (const lineNum of changedLines) {
      if (lineNum >= 2 && lineNum < maxHeight) {
        const index = lineNum - 2;
        if (index < current.filteredPorts.length) {
          this.renderPortLine(
            current.filteredPorts[index],
            index,
            lineNum,
            state,
            current.selectedIndex
          );
        }
      }
    }

    // Render footer/details if they might have changed
    if (state.showDetails) {
      const selected = this.getSelectedPort();
      if (selected) {
        this.renderDetails(selected, height);
      }
    }

    // Always render footer in delta mode to ensure search UI is updated
    const { width } = this.renderer.getScreenSize();
    this.renderer.moveTo(0, height - 2);
    this.renderer.styled("─".repeat(width), Styles.dim, Colors.brightBlack);
    this.renderer.moveTo(0, height - 1);
    if (state.searching) {
      this.renderer.color("Search (numbers only): ", Colors.yellow);
      this.renderer.color(searchBuffer || "_", Colors.white);
      this.renderer.text(" ");
      this.renderer.color("(Enter to apply, ESC to cancel)", Colors.brightBlack);
    } else {
      this.renderer.color("/: search", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("k: kill", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("s: stats", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("?: help", Colors.brightBlack);
    }
    this.renderer.clearToEndOfLine();

    // Render kill message in delta renders too
    if (state.killMessage) {
      this.renderKillMessage(state);
    }

    this.renderer.render();
  }

  /**
   * Render header (extracted for delta rendering)
   */
  private renderHeader(
    state: DashboardState,
    filteredPorts: Array<{ port: PortInfo; group: PortGroup }>
  ): void {
    const { width } = this.renderer.getScreenSize();

    this.renderer.moveTo(0, 0);
    this.renderer.styled(" icport ", Styles.bold, Colors.white, Backgrounds.blue);
    this.renderer.text(" ");

    if (state.isKilling && state.killingPort) {
      this.renderer.color(`Killing port ${state.killingPort}...`, Colors.yellow);
      this.renderer.text(" | ");
    } else if (state.filter) {
      this.renderer.color(`Filter: ${state.filter}`, Colors.yellow);
      this.renderer.text(" | ");
    }

    this.renderer.color(`Ports: ${filteredPorts.length}`, Colors.cyan);
    this.renderer.text(" | ");
    this.renderer.color(`Sort: ${state.sortBy}`, Colors.brightBlack);

    // Show current rank on the right side
    if (state.currentRank) {
      const rankText = `${state.currentRank}`;
      const rankX = width - rankText.length - 1;
      this.renderer.moveTo(rankX, 0);
      this.renderer.color(rankText, Colors.brightMagenta);
    }

    this.renderer.clearToEndOfLine();
  }

  /**
   * Render a single port line (extracted for delta rendering)
   */
  private renderPortLine(
    { port, group }: { port: PortInfo; group: PortGroup },
    index: number,
    y: number,
    state: DashboardState,
    selectedIndex: number
  ): void {
    const { width } = this.renderer.getScreenSize();
    const isSelected = index === selectedIndex;

    const colPos = {
      selector: 0,
      port: 2,
      process: 9,
      type: 28, // Type/Category (12 chars)
      pid: 41, // PID:XXXXX (10 chars)
      protocol: 52, // TCP/UDP (6 chars)
      user: 59, // Username (10 chars)
      lifetime: 70, // Process lifetime (10 chars)
      command: 81, // Command path
    };

    // Selection indicator
    this.renderer.moveTo(colPos.selector, y);
    if (isSelected) {
      this.renderer.styled("▶", Styles.bold, Colors.yellow);
    } else {
      this.renderer.text(" ");
    }

    // PORT
    this.renderer.moveTo(colPos.port, y);
    const portColor = Colors.brightCyan; // getPortColor always returns brightCyan
    const portStr = pad(port.port.toString(), 5, "right");
    this.renderer.color(portStr, portColor);

    // PROCESS NAME
    this.renderer.moveTo(colPos.process, y);
    const processStr = pad(truncate(port.processName, 19), 19, "left");
    this.renderer.color(processStr, Colors.white);

    // TYPE/CATEGORY
    this.renderer.moveTo(colPos.type, y);
    const portType = port.type || group.type || "other";
    const typeStr = pad(truncate(portType, 12), 12, "left");
    const typeColor = getCategoryColor(portType);
    this.renderer.color(typeStr, typeColor);

    // PID
    this.renderer.moveTo(colPos.pid, y);
    const pidStr = pad(`PID:${port.pid}`, 10, "left");
    if (state.isKilling && state.killingPort === port.port) {
      this.renderer.styled(pidStr, Styles.bold, Colors.yellow);
    } else {
      this.renderer.color(pidStr, Colors.brightBlack);
    }

    // PROTOCOL
    this.renderer.moveTo(colPos.protocol, y);
    const protocolStr = pad(port.protocol, 6, "left");
    this.renderer.color(protocolStr, Colors.brightBlack);

    // USER
    this.renderer.moveTo(colPos.user, y);
    const userStr = pad(truncate(port.user, 10), 10, "left");
    this.renderer.color(userStr, Colors.brightBlack);

    // LIFETIME
    this.renderer.moveTo(colPos.lifetime, y);
    if (port.lifetime !== undefined) {
      const lifetimeStr = formatLifetime(port.lifetime);
      this.renderer.color(pad(lifetimeStr, 10, "left"), Colors.brightBlack);
    } else {
      this.renderer.color(pad("--", 10, "left"), Colors.brightBlack);
    }

    // Command/CWD (if details enabled)
    if (state.showDetails) {
      this.renderer.moveTo(colPos.command, y);
      const cmdWidth = width - colPos.command - 1;
      if (cmdWidth > 10) {
        const cmd = truncate(port.command, cmdWidth);
        this.renderer.styled(cmd, Styles.dim, Colors.brightBlack);
      }
    }

    this.renderer.clearToEndOfLine();
  }

  /**
   * Render details section (extracted for delta rendering)
   */
  private renderDetails(selected: { port: PortInfo; group: PortGroup }, height: number): void {
    const { width } = this.renderer.getScreenSize();
    let y = height - 4;

    this.renderer.moveTo(0, y);
    this.renderer.styled("─".repeat(width), Styles.dim, Colors.brightBlack);

    y++;
    this.renderer.moveTo(0, y);
    this.renderer.color(`Port: ${selected.port.port}`, Colors.brightCyan);
    this.renderer.text(" | ");
    this.renderer.color(`PID: ${selected.port.pid}`, Colors.brightCyan);
    this.renderer.text(" | ");
    this.renderer.color(`User: ${selected.port.user}`, Colors.brightCyan);
    this.renderer.text(" | ");
    this.renderer.color(`Protocol: ${selected.port.protocol}`, Colors.brightCyan);
    if (selected.port.lifetime !== undefined) {
      this.renderer.text(" | ");
      this.renderer.color(`Uptime: ${formatLifetime(selected.port.lifetime)}`, Colors.brightCyan);
    }
    this.renderer.clearToEndOfLine();
  }

  /**
   * Render main dashboard - Developer-friendly layout
   */
  private renderMain(
    state: DashboardState,
    filteredPorts: Array<{ port: PortInfo; group: PortGroup }>,
    searchBuffer: string
  ): void {
    const { width, height } = this.renderer.getScreenSize();

    // Header - Port-focused (like lsof -i :PORT)
    this.renderHeader(state, filteredPorts);

    // Port list - Developer-friendly: PORT | PROCESS | PID | PROTOCOL | USER | LIFETIME | [type] COMMAND
    let y = 2;
    const maxHeight = height - (state.showDetails ? 6 : 4);

    for (let i = 0; i < filteredPorts.length && y < maxHeight; i++) {
      this.renderPortLine(filteredPorts[i], i, y, state, state.selectedIndex);
      y++;
    }

    // Selected port details (like lsof output)
    const selected = this.getSelectedPort();
    if (selected && state.showDetails) {
      this.renderDetails(selected, height);
    }

    // Footer with shortcuts
    this.renderer.moveTo(0, height - 2);
    this.renderer.styled("─".repeat(width), Styles.dim, Colors.brightBlack);

    this.renderer.moveTo(0, height - 1);
    if (state.searching) {
      this.renderer.color("Search (numbers only): ", Colors.yellow);
      this.renderer.color(searchBuffer || "_", Colors.white);
      this.renderer.text(" ");
      this.renderer.color("(Enter to apply, ESC to cancel)", Colors.brightBlack);
    } else {
      this.renderer.color("/: search", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("k: kill", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("s: stats", Colors.brightBlack);
      this.renderer.text(" | ");
      this.renderer.color("?: help", Colors.brightBlack);
    }
    this.renderer.clearToEndOfLine();

    // Render kill message toast if present
    if (state.killMessage) {
      this.renderKillMessage(state);
    }
  }

  /**
   * Render help screen
   */
  private renderHelp(): void {
    const { height } = this.renderer.getScreenSize();

    this.renderer.moveTo(0, 0);
    this.renderer.styled(
      " Help - Keyboard Shortcuts ",
      Styles.bold,
      Colors.white,
      Backgrounds.blue
    );
    this.renderer.clearToEndOfLine();

    const helpItems = [
      ["↑/↓", "Navigate ports"],
      ["/", "Search ports (like lsof -i :PORT)"],
      ["k", "Kill process (no confirmation)"],
      ["c", "Copy command to clipboard"],
      ["v", "View full command"],
      ["l", "View process logs"],
      ["s", "View statistics"],
      ["d", "Toggle details view"],
      ["1/2/3", "Sort by port/process/pid"],
      ["g", "Toggle group collapse"],
      ["?", "Toggle help"],
      ["q", "Quit"],
    ];

    let y = 2;
    for (const [key, desc] of helpItems) {
      this.renderer.moveTo(2, y);
      this.renderer.color(pad(key, 8, "right"), Colors.yellow);
      this.renderer.text("  ");
      this.renderer.text(desc);
      this.renderer.clearToEndOfLine();
      y++;
    }

    this.renderer.moveTo(0, height - 1);
    this.renderer.color("Press ? or ESC to close", Colors.brightBlack);
    this.renderer.clearToEndOfLine();
  }

  /**
   * Render confirmation dialog
   */
  private renderConfirm(state: DashboardState): void {
    const { width, height } = this.renderer.getScreenSize();
    const centerY = Math.floor(height / 2);
    const centerX = Math.floor(width / 2);

    const message = state.confirmMessage;
    const messageWidth = Math.min(message.length + 4, width - 4);
    const startX = centerX - Math.floor(messageWidth / 2);

    this.renderer.moveTo(startX, centerY - 1);
    this.renderer.styled("┌" + "─".repeat(messageWidth - 2) + "┐", Styles.bold, Colors.white);

    this.renderer.moveTo(startX, centerY);
    this.renderer.styled("│", Styles.bold, Colors.white);
    this.renderer.text(" ".repeat(messageWidth - 2));
    this.renderer.styled("│", Styles.bold, Colors.white);

    this.renderer.moveTo(startX + 2, centerY);
    this.renderer.color(message, Colors.white);

    this.renderer.moveTo(startX, centerY + 1);
    this.renderer.styled("│", Styles.bold, Colors.white);
    this.renderer.text(" ".repeat(messageWidth - 2));
    this.renderer.styled("│", Styles.bold, Colors.white);

    this.renderer.moveTo(startX, centerY + 2);
    this.renderer.styled("└" + "─".repeat(messageWidth - 2) + "┘", Styles.bold, Colors.white);

    this.renderer.moveTo(startX + 2, centerY + 3);
    this.renderer.color("Press ENTER to confirm, ESC to cancel", Colors.brightBlack);
  }

  /**
   * Render logs view
   */
  private renderLogs(state: DashboardState): void {
    const { width, height } = this.renderer.getScreenSize();

    this.renderer.moveTo(0, 0);
    this.renderer.styled(" Process Logs ", Styles.bold, Colors.white, Backgrounds.blue);
    this.renderer.clearToEndOfLine();

    if (state.logsContent) {
      const lines = state.logsContent.split("\n");
      let y = 2;
      for (const line of lines) {
        if (y >= height - 2) break;
        this.renderer.moveTo(0, y);
        this.renderer.text(truncate(line, width));
        this.renderer.clearToEndOfLine();
        y++;
      }
    }

    this.renderer.moveTo(0, height - 1);
    this.renderer.color("Press ESC to close", Colors.brightBlack);
    this.renderer.clearToEndOfLine();
  }

  /**
   * Render command view (with word wrapping for long commands)
   */
  private renderCommand(state: DashboardState): void {
    const { width, height } = this.renderer.getScreenSize();

    this.renderer.moveTo(0, 0);
    this.renderer.styled(" Full Command ", Styles.bold, Colors.white, Backgrounds.blue);
    this.renderer.clearToEndOfLine();

    if (state.commandContent) {
      // Word wrap the command content
      const command = state.commandContent;
      const maxWidth = width;
      let y = 2;
      let currentLine = "";

      // Split by spaces to preserve word boundaries
      const words = command.split(" ");

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;

        if (testLine.length <= maxWidth) {
          currentLine = testLine;
        } else {
          // Output current line if it exists
          if (currentLine) {
            this.renderer.moveTo(0, y);
            this.renderer.color(currentLine, Colors.white);
            this.renderer.clearToEndOfLine();
            y++;

            // Check if we've run out of screen space
            if (y >= height - 2) break;
          }

          // Handle very long words that exceed line width
          if (word.length > maxWidth) {
            // Break long word into chunks
            for (let i = 0; i < word.length; i += maxWidth) {
              const chunk = word.substring(i, i + maxWidth);
              this.renderer.moveTo(0, y);
              this.renderer.color(chunk, Colors.white);
              this.renderer.clearToEndOfLine();
              y++;
              if (y >= height - 2) break;
            }
            currentLine = "";
          } else {
            currentLine = word;
          }
        }
      }

      // Output remaining line
      if (currentLine && y < height - 2) {
        this.renderer.moveTo(0, y);
        this.renderer.color(currentLine, Colors.white);
        this.renderer.clearToEndOfLine();
      }
    }

    this.renderer.moveTo(0, height - 1);
    this.renderer.color("Press ESC to close", Colors.brightBlack);
    this.renderer.clearToEndOfLine();
  }

  /**
   * Render stats modal
   */
  private renderStats(state: DashboardState): void {
    const { width, height } = this.renderer.getScreenSize();

    this.renderer.moveTo(0, 0);
    this.renderer.styled(" Statistics ", Styles.bold, Colors.white, Backgrounds.blue);
    this.renderer.clearToEndOfLine();

    if (state.statsContent) {
      const lines = state.statsContent.split("\n");
      let y = 2;
      for (const line of lines) {
        if (y >= height - 2) break;
        this.renderer.moveTo(0, y);
        this.renderer.text(truncate(line, width));
        this.renderer.clearToEndOfLine();
        y++;
      }
    }

    this.renderer.moveTo(0, height - 1);
    this.renderer.color("Press ESC or s to close", Colors.brightBlack);
    this.renderer.clearToEndOfLine();
  }

  /**
   * Render kill message toast
   */
  private renderKillMessage(state: DashboardState): void {
    if (!state.killMessage) return;

    const { width, height } = this.renderer.getScreenSize();
    const msg = state.killMessage;
    const emoji = msg.emoji ? `${msg.emoji} ` : "";
    const fullMessage = `${emoji}${msg.message}`;

    // Determine text color - use bright colors for better visibility
    let textColor: ANSIColor = Colors.brightGreen;
    let bgColor: string = Backgrounds.blue; // Use blue background for better contrast

    if (msg.color === "red") {
      textColor = Colors.brightWhite;
      bgColor = Backgrounds.red;
    } else if (msg.color === "yellow") {
      textColor = Colors.black;
      bgColor = Backgrounds.yellow;
    } else if (msg.color === "cyan") {
      textColor = Colors.brightWhite;
      bgColor = Backgrounds.cyan;
    } else {
      // Default green - use white text on green background for high contrast
      textColor = Colors.brightWhite;
      bgColor = Backgrounds.green;
    }

    // Show toast at bottom center (above footer)
    const toastY = height - 3;

    // Calculate available width (leave margins on both sides)
    const padding = 2; // Space on each side
    const maxMessageWidth = width - padding * 4; // More padding for readability

    // Truncate message if too long
    const message = truncate(fullMessage, maxMessageWidth);
    const messageWithPadding = ` ${message} `;
    const messageWidth = messageWithPadding.length;

    // Center the message
    const startX = Math.max(0, Math.floor((width - messageWidth) / 2));

    // Clear the entire line first
    this.renderer.moveTo(0, toastY);
    this.renderer.clearLine();

    // Render message with background in one go - this ensures proper spacing
    this.renderer.moveTo(startX, toastY);
    this.renderer.styled(messageWithPadding, Styles.bold, textColor, bgColor);

    // Clear rest of line to ensure no leftover characters
    this.renderer.clearToEndOfLine();
  }
}
