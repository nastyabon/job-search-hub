#!/bin/bash
# Double-click to open your Job Search Hub (Mac). Keep this window open while you use it;
# close it to stop the hub. If the hub is already running, this just opens it.
cd "$(dirname "$0")" || exit 1
[ -d hub/node_modules ] || node setup.mjs || { echo; echo "Setup didn't finish. Ask Claude to help with the message above."; read -r; exit 1; }
node hub/scripts/start.mjs || { echo; echo "The hub didn't start. Ask Claude to help with the message above."; read -r; }
