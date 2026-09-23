#!/usr/bin/env sh
set -eu

case "${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) printf '%s\n' "${TGA_GITHUB_ROUTED_TOKEN:?missing routed GitHub credential}" ;;
  *) exit 1 ;;
esac
