#!/usr/bin/env bash
# Run every smoke-phase-*.ts and report PASS/FAIL.
# Output for each test: name, last non-empty stdout line, exit code.
set -u
cd "$(dirname "$0")/.."

# Sort so phase numbers come out in order (10 after 9, etc.).
# Portable read loop instead of `mapfile` (bash 4+) so this runs on macOS's
# stock bash 3.2.
FILES=()
while IFS= read -r line; do
  [ -n "$line" ] && FILES+=("$line")
done < <(ls scripts/smoke-phase-*.ts scripts/smoke-pre-phase-*.ts 2>/dev/null | sort -V)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No smoke scripts found."
  exit 1
fi

green=0
red=0
red_names=()

for f in "${FILES[@]}"; do
  name=$(basename "$f" .ts)
  # Strip prisma:query noise; keep last non-empty stderr+stdout line.
  out=$(npx tsx "$f" 2>&1 | grep -v '^prisma:query' | grep -v '^{"level"' || true)
  code=${PIPESTATUS[0]}
  last=$(printf '%s\n' "$out" | grep -v '^$' | tail -1)
  if [[ $code -eq 0 ]]; then
    printf '  \033[32mPASS\033[0m  %-30s  %s\n' "$name" "$last"
    green=$((green+1))
  else
    printf '  \033[31mFAIL\033[0m  %-30s  %s\n' "$name" "$last"
    red=$((red+1))
    red_names+=("$name")
  fi
done

echo
echo "Summary: $green passed, $red failed"
if [[ $red -gt 0 ]]; then
  echo "Failed: ${red_names[*]}"
  exit 1
fi
