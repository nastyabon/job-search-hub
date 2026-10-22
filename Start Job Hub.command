#!/bin/bash
# Double-click to open your Job Search Hub (Mac). Keep this window open while you use it;
# close it to stop the hub.
cd "$(dirname "$0")" || exit 1
if curl -s -o /dev/null http://127.0.0.1:5199/; then
  open http://127.0.0.1:5199/
  exit 0
fi
[ -d hub/node_modules ] || node setup.mjs || { echo; echo "Setup didn't finish. Ask Claude to help with the message above."; read -r; exit 1; }
echo "Starting your Job Search Hub… (close this window to stop it)"
cd hub && npm run hub
