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
  
  # Get full hive-mind status output to parse session IDs with their objectives
  full_status=$(claude-flow hive-mind status 2>/dev/null)
  sessions=$(echo "$full_status" | grep -Eo 'session-[0-9]+-[a-zA-Z0-9]+')
  
  if [[ -z "$sessions" ]]; then
    echo -e "${YELLOW}No sessions found.${NC}"
    log "No sessions found."
    return 1
  else
    echo -e "${CYAN}Active sessions:${NC}"
    printf "${CYAN}%-30s %-s${NC}\n" "SESSION ID" "OBJECTIVE"
    printf "${CYAN}%-30s %-s${NC}\n" "----------" "---------"
    
    # Create associative array to store session objectives
    declare -A session_objectives
    
    # Parse the full status output to extract objectives for each session
    current_session=""
    while IFS= read -r line; do
      if [[ "$line" =~ (session-[0-9]+-[a-zA-Z0-9]+) ]]; then
        current_session="${BASH_REMATCH[1]}"
      elif [[ -n "$current_session" && "$line" =~ [Oo]bjective[[:space:]]*:[[:space:]]*(.+) ]]; then
        session_objectives["$current_session"]="${BASH_REMATCH[1]}"
        current_session=""
      elif [[ -n "$current_session" && "$line" =~ [Gg]oal[[:space:]]*:[[:space:]]*(.+) ]]; then
        session_objectives["$current_session"]="${BASH_REMATCH[1]}"
        current_session=""
      elif [[ -n "$current_session" && "$line" =~ [Tt]ask[[:space:]]*:[[:space:]]*(.+) ]]; then
        session_objectives["$current_session"]="${BASH_REMATCH[1]}"
        current_session=""
      fi
    done <<< "$full_status"
    
    for session_id in $sessions; do
      objective="${session_objectives[$session_id]}"
      
      # If no objective found from status, try memory
      if [[ -z "$objective" ]]; then
        objective=$(claude-flow memory retrieve "hive/objective" --session-id "$session_id" 2>/dev/null | head -1 | cut -c1-50)
      fi
      
      # If still no objective, try checkpoint files
      if [[ -z "$objective" ]]; then
        objective=$(find .claude/checkpoints -name "task-*.json" -newer <(date -d '1 hour ago' '+%Y-%m-%d %H:%M:%S') 2>/dev/null | xargs grep -l "$session_id" 2>/dev/null | head -1 | xargs jq -r '.task // empty' 2>/dev/null | cut -c1-50)
      fi
      
      # Default if no objective found
      if [[ -z "$objective" ]]; then
        objective="No objective found"
      fi
      
      # Truncate objective to 50 characters
      objective=$(echo "$objective" | cut -c1-50)
      
      printf "${BLUE}%-30s${NC} ${GREEN}%s${NC}\n" "$session_id" "$objective"
    done
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

#trap 'echo -e "${RED}\nScript terminated.${NC}"; log "Script terminated by user or error."; exit 1' SIGINT SIGTERM
#
#while true; do
#  echo -e "\n${CYAN}=== Claude-Flow Hive-Mind Session Manager ===${NC}"
#  echo -e "${BLUE}1. Print active sessions${NC}"
#  echo -e "${BLUE}2. Stop ALL sessions${NC}"
#  echo -e "${BLUE}3. Stop ONE session (choose ID)${NC}"
#  echo -e "${BLUE}4. Exit${NC}"
#  echo -e "${CYAN}============================================${NC}"
#  read -rp "$(echo -e "${YELLOW}Enter your choice [1-4]: ${NC}")" choice
#
#  case $choice in
#    1) print_sessions ;;
#    2) stop_all_sessions ;;
#    3) stop_one_session ;;
#    4)
#      echo -e "${GREEN}Exiting. Goodbye!${NC}"
#      log "Exiting. Goodbye!"
#      exit 0
#      ;;
#    *) echo -e "${RED}Invalid choice. Please enter 1, 2, 3, or 4.${NC}" ;;
#  esac
#done