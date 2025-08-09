#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
NC='\033[0m' # No Color

LOGFILE="session_manager.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "$LOGFILE"
}

print_sessions() {
  log "Listing active sessions..."
  sessions=$(claude-flow hive-mind sessions | grep -Eo 'session-[0-9]+-[a-zA-Z0-9]+')
  if [[ -z "$sessions" ]]; then
    echo -e "${YELLOW}No sessions found.${NC}"
    log "No sessions found."
    return 1
  else
    echo -e "${CYAN}Active sessions:${NC}"
    echo -e "${BLUE}$sessions${NC}"
    return 0
  fi
}

stop_session() {
  local id="$1"
  log "Attempting to stop session: $id"
  if claude-flow hive-mind stop "$id"; then
    echo -e "${GREEN}Successfully stopped $id${NC}"
    log "Successfully stopped $id"
    return 0
  else
    echo -e "${RED}Failed to stop $id${NC}"
    log "Failed to stop $id"
    return 1
  fi
}

stop_all_sessions() {
  log "Stopping ALL active sessions..."
  sessions=$(claude-flow hive-mind sessions | grep -Eo 'session-[0-9]+-[a-zA-Z0-9]+')
  if [[ -z "$sessions" ]]; then
    echo -e "${YELLOW}No sessions found to stop.${NC}"
    log "No sessions found to stop."
    return 1
  fi

  count=0
  errors=0
  for id in $sessions; do
    stop_session "$id" || ((errors++))
    ((count++))
  done
  echo -e "${CYAN}Attempted to stop $count session(s), errors: $errors${NC}"
  log "Attempted to stop $count session(s), errors: $errors"
}

stop_one_session() {
  log "Prompting user to choose session to stop..."
  sessions=$(claude-flow hive-mind sessions | grep -Eo 'session-[0-9]+-[a-zA-Z0-9]+')
  if [[ -z "$sessions" ]]; then
    echo -e "${YELLOW}No sessions found.${NC}"
    log "No sessions found."
    return 1
  fi
  PS3=$'\n''Select a session to stop (or Ctrl+C to cancel): '
  select id in $sessions; do
    if [[ -n "$id" ]]; then
      stop_session "$id"
      break
    else
      echo -e "${RED}Invalid selection.${NC}"
    fi
  done
}

trap 'echo -e "${RED}\nScript terminated.${NC}"; log "Script terminated by user or error."; exit 1' SIGINT SIGTERM

while true; do
  echo -e "\n${CYAN}=== Claude-Flow Hive-Mind Session Manager ===${NC}"
  echo -e "${BLUE}1. Print active sessions${NC}"
  echo -e "${BLUE}2. Stop ALL sessions${NC}"
  echo -e "${BLUE}3. Stop ONE session (choose ID)${NC}"
  echo -e "${BLUE}4. Exit${NC}"
  echo -e "${CYAN}============================================${NC}"
  read -rp "$(echo -e "${YELLOW}Enter your choice [1-4]: ${NC}")" choice

  case $choice in
    1) print_sessions ;;
    2) stop_all_sessions ;;
    3) stop_one_session ;;
    4)
      echo -e "${GREEN}Exiting. Goodbye!${NC}"
      log "Exiting. Goodbye!"
      exit 0
      ;;
    *) echo -e "${RED}Invalid choice. Please enter 1, 2, 3, or 4.${NC}" ;;
  esac
done