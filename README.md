# 🎮 Lib: A Universal Game Library For Linux

A desktop library application that brings together your Steam, Epic Games, GOG, and Amazon games in a single interface.

> [!WARNING]
> English language support will be added. 

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![Eel](https://img.shields.io/badge/Eel-0.16+-green)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-lightgrey)

---

## ✨ Features

* **Multi-platform support** — Displays Steam, Epic Games, GOG, and Amazon games in a unified list
* **Heroic Launcher integration** — Automatically detects Epic, GOG, and Amazon games installed via Heroic
* **Game launching** — Launch installed games directly via launcher with a "▶ Play" button
* **Steam playtime tracking** — Fetches total playtime per game via the Steam Web API
* **Persistent library cache** — Library is stored on disk and loads within seconds on startup
* **Dynamic change detection** — Automatically detects newly installed or removed games
* **Game covers** — Uses Akamai CDN for Steam, SteamGridDB and Epic CDN for others
* **Progressive cover loading** — Covers appear progressively as they are fetched, without blocking the UI
* **Platform filtering** — Filter by Steam / Epic / GOG / Amazon
* **Sorting options** — Sort by name, playtime, platform, or installation status
* **Grid / List view** — Two different UI modes
* **Auto-refresh every 6 hours** — Steam API and Epic library update silently in the background

---

## 📸 Screenshot

> Platform filters and game counters on the left sidebar, cover grid on the right — Steam Library–style interface.
<img width="1919" height="1113" alt="image" src="https://github.com/user-attachments/assets/d9aebb29-2d25-4983-af98-e2a4447a4100" />


---

## 🛠️ Installation

### Requirements

* Python 3.10+
* pip

### 1. Clone the repository

```bash
git clone https://github.com/kullanici/oyun-kutuphanesi.git
cd oyun-kutuphanesi
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install eel requests
```

### 4. Create the configuration file

```bash
cp config.example.json config.json
```

Open `config.json` in a text editor and fill in your details:

```json
{
  "SGDB_API_KEY":  "Your SteamGridDB API key",
  "STEAM_API_KEY": "Your Steam Web API key",
  "STEAM_ID":      "Your 64-bit Steam ID"
}
```

For instructions on how to obtain API keys, see the [Configuration](#-configuration) section.

### 5. Run the application

```bash
python main.py
```

The app will open in your default browser at `http://localhost:8000`.

---

## ⚙️ Configuration

### SteamGridDB API Key

1. Go to [https://www.steamgriddb.com](https://www.steamgriddb.com) and create an account
2. Navigate to Profile → API → click **Generate API Key**
3. Paste the generated key into the `SGDB_API_KEY` field in `config.json`

> SteamGridDB is not used for Steam games (Steam CDN is used directly). It is only required for Heroic/GOG/Amazon games.

---

### Steam Web API Key

1. Go to [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
2. Enter a domain name (anything works, e.g., `localhost`)
3. Paste the generated key into the `STEAM_API_KEY` field in `config.json`

---

### Steam ID

1. Go to [https://www.steamidfinder.com](https://www.steamidfinder.com) or open your Steam profile
2. Copy your **SteamID64** (e.g., `76561198XXXXXXXXX`)
3. Paste it into the `STEAM_ID` field in `config.json`

> Your Steam profile **Game Details** privacy setting must be set to **Public**.

---

### Epic Games Login

On first launch, you need to authenticate for the Epic library:

1. Click **"Authorization Page →"** in the sidebar
2. Copy the `authorizationCode` value from the opened page (**within 30 seconds!**)
3. Paste it into the input field and click **Login**

The token is automatically saved to `epic_token.json`. When the access token expires, it is **automatically refreshed** using the refresh token — you only need to log in once.

---

## 🗂️ Project Structure

```
Lib/
├── main.py                  # Python backend (Eel, all API calls)
├── config.json              # Personal config (not committed)
├── config.example.json      # Config template
├── kapak_cache.json         # SGDB cover URL cache (auto-generated)
├── kutuphane_cache.json     # Library cache (auto-generated)
├── epic_token.json          # Epic OAuth token (auto-generated)
├── .gitignore
└── web/
    ├── index.html
    ├── app.js
    └── style.css
```

---

## 🎮 Platform Support

| Platform   | Installed Games | Library               | Playtime   | Covers        |
| ---------- | --------------- | --------------------- | ---------- | ------------- |
| Steam      | ✅ Disk scan     | ✅ Web API             | ✅ Web API  | ✅ Akamai CDN  |
| Epic Games | ✅ Heroic config | ✅ Library Service API | ⚠️ Partial | ✅ Epic CDN    |
| GOG        | ✅ Heroic config | ✅ Heroic config       | ❌          | ✅ SteamGridDB |
| Amazon     | ✅ Heroic config | ✅ Heroic config       | ❌          | ✅ SteamGridDB |

> Epic, GOG, and Amazon games are automatically detected if managed via Heroic Launcher.

### Supported Heroic Config Paths (Linux)

```
~/.config/heroic/legendaryConfig/legendary/   (Epic)
~/.config/heroic/gog_store/                   (GOG)
~/.config/heroic/nile_config/nile/            (Amazon)
~/.var/app/com.heroicgameslauncher.hgl/...    (Flatpak)
```

---

## 🔧 Technical Details

### Tech Stack

| Layer    | Technology                                                 |
| -------- | ---------------------------------------------------------- |
| Backend  | Python 3.10+, Eel                                          |
| Frontend | Vanilla HTML / CSS / JavaScript                            |
| IPC      | Eel (bidirectional Python↔JS communication over WebSocket) |

---

### Cache System

The application uses two cache layers:

**`kapak_cache.json`** — Stores game cover URLs. Loaded into RAM at startup and used without file I/O during runtime. Written to disk once after all SGDB requests are completed.

**`kutuphane_cache.json`** — Stores game list and Steam installation IDs. The library loads instantly at startup. If more than 6 hours have passed since the last scan, Steam API and Epic library are updated in the background.

---

### Dynamic Change Detection

On every startup, `appmanifest_*.acf` files are scanned (~100ms) and compared with the cached Steam ID set. Newly installed games are added, removed games are deleted — without performing a full rescan.

---

### Game Launching

| Platform            | Protocol                     |
| ------------------- | ---------------------------- |
| Steam               | `steam://rungameid/{appid}`  |
| Epic / GOG / Amazon | `heroic://launch/{app_name}` |

---

## 📋 Known Issues

* **Epic playtime:** The `appName` returned by the Playtime API does not always match the catalog `item_id`, so playtime may not appear for some Epic games
* **Epic library filtering:** Epic Library Service may return IARC rating certificates and Unreal Engine marketplace assets
* **Heroic Windows support:** Heroic config path is hardcoded for Linux, so it may not be auto-detected on Windows
* **Epic login timing:** The `authorization_code` grant must be used within ~30 seconds

---

## 🤝 Contributing

Pull requests are welcome. For major changes, opening an issue first is recommended.

---

## 📄 License

MIT

---