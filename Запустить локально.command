#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/app"
if [[ ! -f dist-local/index.html ]]; then
  npm run build:local
fi
npm run start:local -- --open /
