#!/usr/bin/env bash
set -e
APP_NAME="oyun-kutuphanesi"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎮 Oyun Kütüphanesi — Linux Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📦 Bağımlılıklar kontrol ediliyor…"
pip install pyinstaller pywebview eel requests --break-system-packages 2>/dev/null \
    || pip install pyinstaller pywebview eel requests

if ! python3 -c "import webview" 2>/dev/null; then
    echo ""
    echo "⚠️  pywebview import başarısız. Sistem kütüphanesi gerekiyor:"
    echo "   Ubuntu/Debian: sudo apt install python3-gi gir1.2-webkit2-4.0"
    echo "   Arch:          sudo pacman -S webkit2gtk"
    echo "   Fedora:        sudo dnf install webkit2gtk4.1"
    echo ""
    read -p "Yine de devam edilsin mi? (y/N) " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

echo "🧹 Temizleniyor…"
rm -rf build/ dist/ __pycache__/

echo "🔨 Build başlıyor…"
pyinstaller \
    --name "$APP_NAME" \
    --onefile \
    --add-data "web:web" \
    --hidden-import "eel" \
    --hidden-import "bottle" \
    --hidden-import "gevent" \
    --hidden-import "geventwebsocket" \
    --hidden-import "webview" \
    --hidden-import "webview.platforms.gtk" \
    --collect-all "eel" \
    --collect-all "webview" \
    --noconsole \
    main.py

[ ! -f "dist/config.json" ] && [ -f "config.json" ] && cp config.json dist/config.json

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ dist/$APP_NAME hazır!"
echo "  Test: ./dist/$APP_NAME"
echo "  Kur:  ./InstallDesktop.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"