#!/bin/bash

# KegHero Dashboard - Wayfire Autostart Setup
# For Raspberry Pi OS Bookworm

CONFIG_FILE="$HOME/.config/wayfire.ini"
KIOSK_SCRIPT="$HOME/Desktop/beercontrol/dashboard-web/scripts/run_kiosk.sh"

echo "⚙️ Configuring Wayfire for Dashboard Autostart..."

if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️ Wayfire config not found at $CONFIG_FILE. Creating default..."
    mkdir -p "$(dirname "$CONFIG_FILE")"
    touch "$CONFIG_FILE"
fi

# 1. Add [autostart] section if it doesn't exist
if ! grep -q "\[autostart\]" "$CONFIG_FILE"; then
    echo -e "\n[autostart]" >> "$CONFIG_FILE"
fi

# 2. Add the kiosk launcher to autostart
if ! grep -q "$KIOSK_SCRIPT" "$CONFIG_FILE"; then
    echo "kiosk = $KIOSK_SCRIPT" >> "$CONFIG_FILE"
fi

# 3. Disable screensaver and power management (blanking)
# Note: In Wayfire, this is often handled by power management or idle plugins
if ! grep -q "\[idle\]" "$CONFIG_FILE"; then
    echo -e "\n[idle]\ndpms_timeout = 0\nscreensaver_timeout = 0" >> "$CONFIG_FILE"
fi

echo "✅ Autostart configured!"
echo "👉 You must set 'Desktop Autologin' in sudo raspi-config for this to work on boot."
echo "👉 Make sure to run 'chmod +x $KIOSK_SCRIPT'"
