#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs/commands docs/guides
cat > docs/commands/sync.md <<'EOF'
# acme sync

Synchronizes the local cache with the remote registry.

## Options

| Option | Default | Description |
|---|---|---|
| --timeout | 45 seconds | Abort the sync after this long. |
| --dry-run | off | Show what would change. |

The environment variable `ACME_SYNC_TIMEOUT` overrides the default timeout.
EOF
cat > docs/commands/pull.md <<'EOF'
# acme pull

Downloads a package. Default timeout: 30 seconds, overridden by `ACME_PULL_TIMEOUT`.
EOF
cat > docs/CHANGELOG.md <<'EOF'
# Changelog

## 2.4.0
- The default `acme sync` timeout was raised from 30 to 45 seconds.

## 2.3.0
- Added `ACME_PULL_TIMEOUT`.
EOF
for topic in install auth cache registry proxy logging plugins upgrade uninstall faq offline mirrors; do
  cat > "docs/guides/${topic}.md" <<EOF
# ${topic}

This guide explains ${topic} for acme. It does not cover command timeouts.
Run \`acme help ${topic}\` for more.
EOF
done
