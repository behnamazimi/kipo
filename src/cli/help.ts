/**
 * Help text for the CLI
 */

export const HELP_TEXT = `icport - Terminal TUI for Monitoring and Managing Network Ports

USAGE:
  icport [command] [options]

COMMANDS:
  kill <port>              Kill process(es) using the specified port
  kill --port <port>       Kill process(es) using the specified port (alternative syntax)

GLOBAL OPTIONS:
  -h, --help               Show this help message
  -v, --version            Show version number

TUI FILTER OPTIONS:
  These options apply when launching the TUI (default mode):

  -t, --type <pattern>     Filter by port type (supports minimatch patterns)
                           Examples: "dev-server", "dev-*", "*server", "api"
  -u, --user <pattern>     Filter by username (supports minimatch patterns)
                           Examples: "john", "j*", "*admin"
  -p, --process <pattern>  Filter by process name (supports minimatch patterns)
                           Examples: "*node*", "vite", "python*"
  -s, --sort <field>       Sort ports by field: port, process, pid, user
                           Default: port

KILL COMMAND OPTIONS:
  -f, --force              Force kill process (SIGKILL instead of SIGTERM)
  --port <number>          Specify port number (alternative to positional argument)

EXAMPLES:
  # Launch interactive TUI
  icport

  # Launch TUI with filters
  icport --type dev-server
  icport --type "dev-*" --user "j*"
  icport --sort port --type api

  # Kill processes
  icport kill 3000
  icport kill --port 3000
  icport kill 3000 --force

KEYBOARD SHORTCUTS (TUI Mode):
  Navigation:
    ↑/↓              Navigate up/down through ports
    Enter            Confirm action or execute search
    Esc              Close modal/dialog or cancel search

  Actions:
    k                Kill selected port
    c                Copy command to clipboard
    v                View full command
    l                View process logs

  View & Filter:
    /                Search by port number (e.g., type "3000" then Enter)
    d                Toggle details view (show/hide full command and CWD)
    g                Toggle group collapse/expand

  Sorting:
    1                Sort by port number
    2                Sort by process name
    3                Sort by PID

  Other:
    ?                Show/hide help overlay
    q                Quit application
    Ctrl+C           Force quit`;
