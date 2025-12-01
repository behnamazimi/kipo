/**
 * Kill message generators based on port context
 */

import type { PortInfo } from "../port/types.js";
import type { KillMessage } from "./types.js";

/**
 * Special port numbers that deserve special messages
 */
const SPECIAL_PORTS: Record<number, string> = {
  3000: "🔥",
  3001: "🔥",
  5173: "⚡", // Vite
  4200: "💚", // Angular
  8080: "🌐",
  8081: "🌐",
  8000: "🐍",
  8001: "🐍",
  5000: "💎",
  4000: "💎",
  6006: "📚", // Storybook
  9229: "🐛", // Node debugger
};

/**
 * Process name patterns for special messages
 */
const PROCESS_PATTERNS: Array<{ pattern: RegExp; emoji: string; message: string }> = [
  { pattern: /node/i, emoji: "⚡", message: "Node process destroyed!" },
  { pattern: /python/i, emoji: "🐍", message: "Python process eliminated!" },
  { pattern: /java/i, emoji: "☕", message: "Java process terminated!" },
  { pattern: /ruby/i, emoji: "💎", message: "Ruby process killed!" },
  { pattern: /go/i, emoji: "🐹", message: "Go process eliminated!" },
  { pattern: /rust/i, emoji: "🦀", message: "Rust process destroyed!" },
];

/**
 * Port type messages
 */
const TYPE_MESSAGES: Record<string, KillMessage> = {
  "dev-server": { message: "Dev server terminated!", emoji: "💀" },
  api: { message: "API server eliminated!", emoji: "🎯" },
  database: { message: "Database connection killed!", emoji: "🗄️" },
  storybook: { message: "Storybook closed!", emoji: "📚" },
  testing: { message: "Test process destroyed!", emoji: "🧪" },
  unexpected: { message: "Unexpected port eliminated!", emoji: "⚠️" },
  other: { message: "Process terminated!", emoji: "💥" },
};

/**
 * Generate a kill message based on port information
 */
export function generateKillMessage(
  portInfo: PortInfo,
  success: boolean,
  force: boolean = false
): KillMessage {
  if (!success) {
    return {
      message: "Failed to kill process",
      emoji: "❌",
      color: "red",
    };
  }

  // Force kill message
  if (force) {
    return {
      message: "Force kill successful!",
      emoji: "💥",
      color: "yellow",
    };
  }

  // Check for special port numbers
  const specialPortEmoji = SPECIAL_PORTS[portInfo.port];
  if (specialPortEmoji) {
    return {
      message: `Port ${portInfo.port} has been eliminated!`,
      emoji: specialPortEmoji,
      color: "cyan",
    };
  }

  // Check for process name patterns
  for (const { pattern, emoji, message } of PROCESS_PATTERNS) {
    if (pattern.test(portInfo.processName) || pattern.test(portInfo.command)) {
      return {
        message,
        emoji,
        color: "green",
      };
    }
  }

  // Use type-based message
  const type = portInfo.type || "other";
  const typeMessage = TYPE_MESSAGES[type] || TYPE_MESSAGES.other;

  return {
    message: typeMessage.message,
    emoji: typeMessage.emoji,
    color: "green",
  };
}
