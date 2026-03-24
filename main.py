import eel
import os
import re
import json
import glob
import base64
import logging
import time
import urllib.parse
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

eel.init('web')

# =============================================
# KONFİGÜRASYON — from config.json
# =============================================
_CONFIG_DOSYASI = "config.json"

def _config_yukle() -> dict:
    # Eğer dosya yoksa, Epic varsayılanlarını da içerecek şekilde oluştur.
    if not os.path.exists(_CONFIG_DOSYASI):
        varsayilan = {
            "SGDB_API_KEY":       "",
            "STEAM_API_KEY":      "",
            "STEAM_ID":           "",
            "EPIC_CLIENT_ID":     "",
            "EPIC_CLIENT_SECRET": ""
        }
        with open(_CONFIG_DOSYASI, "w", encoding="utf-8") as f:
            json.dump(varsayilan, f, indent=2)
        log.warning(f"{_CONFIG_DOSYASI} oluşturuldu. Lütfen API bilgilerini doldurun.")
        
    with open(_CONFIG_DOSYASI, "r", encoding="utf-8") as f:
        return json.load(f)

_cfg = _config_yukle()

# API Bilgilerini Çek
SGDB_API_KEY  = _cfg.get("SGDB_API_KEY",  "")
STEAM_API_KEY = _cfg.get("STEAM_API_KEY", "")
STEAM_ID      = _cfg.get("STEAM_ID",      "")

# Epic Bilgilerini Çek (Eğer JSON'dan boş gelirse varsayılanları kullan)
EPIC_CLIENT_ID     = _cfg.get("EPIC_CLIENT_ID")
EPIC_CLIENT_SECRET = _cfg.get("EPIC_CLIENT_SECRET")

# Base64 Auth Şifrelemesi ve URL'ler
EPIC_AUTH_B64      = base64.b64encode(f"{EPIC_CLIENT_ID}:{EPIC_CLIENT_SECRET}".encode()).decode()
EPIC_TOKEN_URL     = "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token"

# Dosya Yolları ve Listeler
KAPAK_CACHE_DOSYASI = "kapak_cache.json"
EPIC_TOKEN_DOSYASI  = "epic_token.json"
ARACLAR_LISTESI     = ["proton", "runtime", "redistributables", "steamworks", "sdk", "dedicated server"]

# =============================================
# KAPAK CACHE & SGDB
# =============================================

# Cache'i program açıldığında RAM'e (Memory) alıyoruz.
GLOBAL_KAPAK_CACHE = {}

def cache_baslat():
    global GLOBAL_KAPAK_CACHE
    if os.path.exists(KAPAK_CACHE_DOSYASI):
        try:
            with open(KAPAK_CACHE_DOSYASI, "r", encoding="utf-8") as f:
                GLOBAL_KAPAK_CACHE = json.load(f)
        except Exception as e:
            log.warning(f"Cache okunamadı: {e}")

# Uygulama başlarken cache'i RAM'e yükle
cache_baslat()

def cache_diske_yaz():
    """Tüm işlemler bitince RAM'deki cache'i tek seferde diske yazar."""
    try:
        with open(KAPAK_CACHE_DOSYASI, "w", encoding="utf-8") as f:
            json.dump(GLOBAL_KAPAK_CACHE, f, ensure_ascii=False, indent=2)
    except IOError as e:
        log.warning(f"Cache diske kaydedilemedi: {e}")


def _sgdb_tek(oyun_adi: str) -> tuple:
    """Tek oyun için URL bulur ve tuple (ad, url) döndürür."""
    # Diske gitme, direkt RAM'den oku!
    if oyun_adi in GLOBAL_KAPAK_CACHE:
        return (oyun_adi, GLOBAL_KAPAK_CACHE[oyun_adi])

    placeholder = f"https://via.placeholder.com/600x900/1e1e2e/89b4fa?text={urllib.parse.quote(oyun_adi)}"
    headers = {"Authorization": f"Bearer {SGDB_API_KEY}"}
    
    try:
        r = requests.get(
            f"https://www.steamgriddb.com/api/v2/search/autocomplete/{urllib.parse.quote(oyun_adi)}",
            headers=headers, timeout=5
        )
        if r.status_code == 200 and r.json().get("data"):
            sgdb_id = r.json()["data"][0]["id"]
            rg = requests.get(
                f"https://www.steamgriddb.com/api/v2/grids/game/{sgdb_id}?dimensions=600x900",
                headers=headers, timeout=5
            )
            if rg.status_code == 200 and rg.json().get("data"):
                return (oyun_adi, rg.json()["data"][0]["url"])
    except Exception as e:
        pass # Log kirliliği olmaması için sessizce geç
        
    return (oyun_adi, placeholder)


@eel.expose
def kapak_getir_toplu(oyun_listesi: list):
    """
    Kapakları paralel arar. Bulduğu AN JavaScript'e bildirir.
    """
    global GLOBAL_KAPAK_CACHE
    eksikler = []

    for o in oyun_listesi:
        ad = o.get("ad", "")
        platform = o.get("platform", "")
        oyun_id = o.get("id")

        if ad in GLOBAL_KAPAK_CACHE:
            # RAM'de varsa anında JS'ye fırlat
            eel.kapak_anlik_guncelle(oyun_id, GLOBAL_KAPAK_CACHE[ad])()
        elif "steam" in platform.lower() and oyun_id:
            url = f"https://cdn.akamai.steamstatic.com/steam/apps/{oyun_id}/library_600x900.jpg"
            eel.kapak_anlik_guncelle(oyun_id, url)()
        else:
            eksikler.append(ad)

    if eksikler:
        log.info(f"SGDB: {len(eksikler)} kapak RAM'de yok, API'den çekiliyor…")
        # Worker sayısını biraz artırabilirsin (Örn: 8)
        with ThreadPoolExecutor(max_workers=8) as pool:
            # İşleri havuza at
            gelecekler = {pool.submit(_sgdb_tek, ad): ad for ad in eksikler}
            
            # İşler BİTTİKÇE (as_completed) sırasını beklemeden al
            for f in as_completed(gelecekler):
                ad = gelecekler[f]
                try:
                    ad, url = f.result()
                    GLOBAL_KAPAK_CACHE[ad] = url # RAM'i güncelle
                    
                    # OYUNUN ID'sini bularak anında frontend'e gönder
                    eslesen_oyun = next((o for o in oyun_listesi if o.get("ad") == ad), None)
                    if eslesen_oyun:
                        eel.kapak_anlik_guncelle(eslesen_oyun.get("id"), url)()
                except Exception:
                    pass

        # Tüm paralel işlemler bitince cache'i TEK SEFERDE diske yaz!
        cache_diske_yaz()
        log.info("Eksik kapaklar SGDB'den çekildi ve diske kaydedildi.")

# =============================================
# EPİC — OYUN FİLTRESİ
# =============================================

# IARC derecelendirme sertifikası başlıklarının kesin son ekleri.
# Bunlar oyun değil, yaş sınıflandırma belgesidir.
# Örnek: "SunbirdGeneralAudience", "BichirGeneralAudience"
_IARC_SUFFIXES = (
    "GeneralAudience",
    "TeensAndOlder",
    "MatureAudience",
    "AdultsOnly",
    "RatingPending",
)

def _epic_gercek_oyun_mu(details: dict) -> bool:
    """
    Sadece IARC sertifikalarını çıkarır.
    Kategori filtresi kaldırıldı — Epic'in category yapısı tutarsız
    ve gerçek oyunları da düşürüyordu.
    """
    title = details.get("title", "")

    # IARC sertifikaları: başlık kesin son eklerle bitiyor
    if any(title.endswith(s) for s in _IARC_SUFFIXES):
        return False

    # mainGameItem: gerçek bir obje VE içinde "id" varsa DLC'dir
    main = details.get("mainGameItem")
    if isinstance(main, dict) and main.get("id"):
        return False

    return True


# =============================================
# EPİC — KAPAK (kendi CDN'i, SGDB gerekmez)
# =============================================

def epic_kapak_bul(key_images: list) -> str:
    """
    Epic catalog'dan en iyi dikey kapağı seçer.
    Tercih sırası Heroic ile aynı + OfferImageTall eklendi.
    Hiçbiri bulunamazsa boş string döner → öğe oyun değildir filtresi devreye girer.
    """
    tercih_sirasi = [
        "DieselGameBoxTall",
        "DieselGameBoxLogoTall",
        "OfferImageTall",
        "DieselGameBox",
        "OfferImageWide",
        "Thumbnail",
        "VaultClosed",
    ]
    for tip in tercih_sirasi:
        for img in key_images:
            if img.get("type") == tip and img.get("url"):
                return img["url"]
    return ""  # Kasıtlı: fallback YOK — kapaksız = oyun değil


# =============================================
# EPİC — TOKEN (Heroic tarzı: refresh token ile otomatik yenile)
# =============================================

def _epic_post_token(data: dict) -> dict | None:
    headers = {
        "Authorization": f"basic {EPIC_AUTH_B64}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    try:
        r = requests.post(EPIC_TOKEN_URL, headers=headers, data=data, timeout=15)
        if r.status_code == 400:
            log.error(f"Epic 400: {r.json().get('errorMessage', r.text)}")
            return None
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        log.error(f"Epic token POST başarısız: {e}")
        return None


def epic_token_kaydet(token: dict) -> None:
    token["expires_at"] = time.time() + token.get("expires_in", 7200)
    try:
        with open(EPIC_TOKEN_DOSYASI, "w") as f:
            json.dump(token, f)
        log.info(
            f"Token kaydedildi | {token.get('displayName')} | "
            f"Access: {token.get('expires_in',0)//60} dk | "
            f"Refresh: {'✅' if token.get('refresh_token') else '❌ YOK'}"
        )
    except IOError as e:
        log.warning(f"Token kaydedilemedi: {e}")


def _epic_token_sil():
    if os.path.exists(EPIC_TOKEN_DOSYASI):
        os.remove(EPIC_TOKEN_DOSYASI)
        log.info("Epic token silindi.")


def epic_token_yukle() -> dict | None:
    """
    Heroic tarzı token yönetimi:
    1. Dosya yoksa → None
    2. Access token geçerliyse → direkt döndür
    3. Access token bittiyse refresh token ile yenile → kaydet → döndür
    4. Refresh da başarısızsa → sil → None (kullanıcı tekrar giriş yapar)
    """
    if not os.path.exists(EPIC_TOKEN_DOSYASI):
        return None
    try:
        with open(EPIC_TOKEN_DOSYASI, "r") as f:
            token = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        log.warning(f"Token bozuk: {e}")
        _epic_token_sil()
        return None

    # Access token hâlâ geçerli
    expires_at = token.get("expires_at")
    if expires_at and time.time() < expires_at - 60:
        return token

    # Refresh token ile yenile
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        log.info("Refresh token yok, tekrar giriş gerekiyor.")
        _epic_token_sil()
        return None

    log.info("Access token doldu → refresh token ile yenileniyor…")
    yeni = _epic_post_token({"grant_type": "refresh_token", "refresh_token": refresh_token})
    if not yeni:
        log.warning("Refresh başarısız → tekrar giriş gerekiyor.")
        _epic_token_sil()
        return None

    epic_token_kaydet(yeni)
    log.info("Token otomatik yenilendi ✅")
    return yeni


@eel.expose
def epic_debug_ilk_oyun() -> dict:
    """İlk 5 entitlement'ın ham catalog verisini döndürür — filtreyi debug etmek için."""
    token = epic_token_yukle()
    if not token:
        return {"hata": "token yok"}
    access_token = token["access_token"]
    account_id   = token["account_id"]

    try:
        r = requests.get(
            f"https://entitlement-public-service-prod.ol.epicgames.com"
            f"/entitlement/api/account/{account_id}/entitlements?start=0&count=10",
            headers={"Authorization": f"bearer {access_token}"}, timeout=15,
        )
        r.raise_for_status()
        ents = r.json()
    except Exception as e:
        return {"hata": str(e)}

    ids = [x["catalogItemId"] for x in ents if x.get("catalogItemId")][:5]
    params = "&".join(f"id={x}" for x in ids)
    url = (f"https://catalog-public-service-prod.ol.epicgames.com"
           f"/catalog/api/shared/bulk/items?{params}&country=TR&locale=tr")
    try:
        r = requests.get(url, headers={"Authorization": f"bearer {access_token}"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        # Sadece filtreyle ilgili alanları döndür
        ozet = {}
        for iid, d in data.items():
            ozet[d.get("title","?")] = {
                "categories":    [c.get("path") for c in d.get("categories", [])],
                "mainGameItem":  d.get("mainGameItem"),
                "customAttributes": list(d.get("customAttributes", {}).keys())[:5],
            }
        return ozet
    except Exception as e:
        return {"hata": str(e)}


@eel.expose
def epic_token_var_mi() -> bool:
    return epic_token_yukle() is not None


# =============================================
# EPİC — AUTH
# =============================================

@eel.expose
def epic_auth_kodu_gonder(auth_code: str) -> dict:
    _epic_token_sil()
    auth_code = auth_code.strip()
    if auth_code.startswith("{"):
        try:
            auth_code = json.loads(auth_code).get("authorizationCode", auth_code)
        except json.JSONDecodeError:
            pass
    if not auth_code:
        return {"ok": False, "hata": "Boş kod."}
    token = _epic_post_token({"grant_type": "authorization_code", "code": auth_code})
    if not token:
        return {"ok": False, "hata": "Kod geçersiz veya süresi dolmuş. Sayfayı tekrar aç ve hızlıca yapıştır."}
    epic_token_kaydet(token)
    return {"ok": True, "hesap": token.get("displayName", "?")}


# =============================================
# EPİC — KÜTÜPHANEYİ ÇEK
# =============================================

@eel.expose
def epic_kutuphanesini_getir() -> list:
    """
    Legendary/Heroic'in kullandığı Library Service API'yi kullanır.
    Bu endpoint Epic'in kendi kütüphane sayfasının kullandığı servis —
    sadece gerçek oyunları döndürür, entitlement karmaşasına girmeden.
    """
    token = epic_token_yukle()
    if not token:
        return []

    access_token = token["access_token"]
    headers      = {"Authorization": f"bearer {access_token}"}

    # Library Service — sayfalandırmalı çek
    oyun_records = []
    cursor       = None
    while True:
        url = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true"
        if cursor:
            url += f"&cursor={cursor}"
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code == 401:
                log.error("Library Service 401 — token geçersiz, siliniyor.")
                _epic_token_sil()
                return []
            r.raise_for_status()
            data = r.json()
        except requests.RequestException as e:
            log.error(f"Library Service hatası: {e}")
            break

        records = data.get("records", [])
        oyun_records.extend(records)
        log.debug(f"Library: {len(records)} kayıt alındı (toplam: {len(oyun_records)})")

        cursor = data.get("responseMetadata", {}).get("nextCursor")
        if not cursor:
            break

    log.info(f"Library Service: {len(oyun_records)} kayıt bulundu.")

    if not oyun_records:
        log.warning("Library Service boş döndü, entitlement fallback deneniyor…")
        return _epic_entitlement_fallback(access_token, token["account_id"])

    # Playtime verisini çek
    epic_playtime = _epic_playtime_cek(access_token, token["account_id"])

    # Catalog ID'lerini topla — metadata'dan kapak ve isim al
    oyunlar:   list = []
    gordukler: set  = set()

    # Kayıtları catalog ID → metadata eşlemesi yap
    id_meta: dict = {}
    for rec in oyun_records:
        cat_id = rec.get("catalogItemId") or rec.get("catalogId")
        ns     = rec.get("namespace") or rec.get("catalogNamespace")
        if cat_id and ns:
            id_meta[cat_id] = {"ns": ns, "rec": rec}

    # Catalog'dan toplu isim + kapak çek (namespace ile — daha doğru sonuç)
    def ns_batch_cek(batch_items):
        """batch_items: [(cat_id, namespace), ...]"""
        # Namespace'e göre grupla
        ns_gruplari: dict = {}
        for cat_id, ns in batch_items:
            ns_gruplari.setdefault(ns, []).append(cat_id)

        sonuclar = {}
        for ns, id_listesi in ns_gruplari.items():
            params = "&".join(f"id={x}" for x in id_listesi)
            url = (
                f"https://catalog-public-service-prod.ol.epicgames.com"
                f"/catalog/api/shared/namespace/{ns}/bulk/items"
                f"?{params}&country=TR&locale=tr"
            )
            try:
                r = requests.get(url, headers=headers, timeout=15)
                if r.status_code == 200:
                    sonuclar.update(r.json())
            except requests.RequestException as e:
                log.debug(f"NS batch hatası ({ns}): {e}")
        return sonuclar

    items_list = list(id_meta.items())   # [(cat_id, {ns, rec}), ...]
    batch_pairs = [(cat_id, meta["ns"]) for cat_id, meta in items_list]
    batches     = [batch_pairs[i:i+50] for i in range(0, len(batch_pairs), 50)]

    log.info(f"Catalog: {len(batch_pairs)} öğe → {len(batches)} batch")

    with ThreadPoolExecutor(max_workers=8) as pool:
        for catalog_sonuc in pool.map(ns_batch_cek, batches):
            for item_id, details in catalog_sonuc.items():
                title = details.get("title")
                if not title or title in gordukler:
                    continue

                # IARC sertifikası filtresi (tek güvenilir filtre)
                if any(title.endswith(s) for s in _IARC_SUFFIXES):
                    continue

                kapak = epic_kapak_bul(details.get("keyImages", []))
                if not kapak:
                    # Placeholder yerine atla — kapaksız gerçek oyun burada çok nadir
                    continue

                oyunlar.append({
                    "ad":          title,
                    "id":          item_id,
                    "platform":    "Epic",
                    "resim":       kapak,
                    "is_installed": False,
                    "is_tool":     False,
                    "saat":        epic_playtime.get(item_id, 0),
                })
                gordukler.add(title)

    log.info(f"Epic Library: {len(oyunlar)} oyun döndürülüyor.")
    return oyunlar



def _epic_playtime_cek(access_token: str, account_id: str) -> dict:
    """Epic playtime GraphQL — Heroic/Legendary ile aynı endpoint."""
    try:
        r = requests.post(
            "https://store-launcher.epicgames.com/graphql",
            headers={"Authorization": f"bearer {access_token}", "Content-Type": "application/json"},
            json={"query": "{ Launcher { library { playedGames { artifact { id appName } totalTime } } } }", "variables": {}},
            timeout=15,
        )
        if r.status_code != 200:
            log.warning(f"Epic playtime {r.status_code}")
            return {}
        oyunlar = (r.json().get("data", {}).get("Launcher", {})
                           .get("library", {}).get("playedGames", []))
        sonuc = {}
        for o in oyunlar:
            art    = o.get("artifact") or {}
            iid    = art.get("id") or art.get("appName")
            dakika = o.get("totalTime") or 0
            if iid and dakika > 0:
                sonuc[iid] = round(dakika / 60, 1)
        log.info(f"Epic playtime: {len(sonuc)} oyun için süre alındı.")
        return sonuc
    except requests.RequestException as e:
        log.warning(f"Epic playtime çekilemedi: {e}")
        return {}

def _epic_entitlement_fallback(access_token: str, account_id: str) -> list:
    """
    Library Service başarısız olursa eski entitlement yöntemi.
    Sadece IARC filtresi + kapak zorunluluğu uygulanır.
    """
    log.info("Entitlement fallback başlatıldı…")
    headers = {"Authorization": f"bearer {access_token}"}

    entitlements = []
    start = 0
    while True:
        try:
            r = requests.get(
                f"https://entitlement-public-service-prod.ol.epicgames.com"
                f"/entitlement/api/account/{account_id}/entitlements"
                f"?start={start}&count=1000",
                headers=headers, timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            if not data:
                break
            entitlements.extend(data)
            if len(data) < 1000:
                break
            start += 1000
        except requests.RequestException as e:
            log.error(f"Entitlement fallback hatası: {e}")
            break

    ids = list(set(x["catalogItemId"] for x in entitlements if x.get("catalogItemId")))
    log.info(f"Entitlement fallback: {len(ids)} ID")

    oyunlar:   list = []
    gordukler: set  = set()

    def batch_cek(batch):
        params = "&".join(f"id={x}" for x in batch)
        url = (
            f"https://catalog-public-service-prod.ol.epicgames.com"
            f"/catalog/api/shared/bulk/items?{params}&country=TR&locale=tr"
        )
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            pass
        return {}

    batches = [ids[i:i+50] for i in range(0, len(ids), 50)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for sonuc in pool.map(batch_cek, batches):
            for item_id, details in sonuc.items():
                title = details.get("title")
                if not title or title in gordukler:
                    continue
                if any(title.endswith(s) for s in _IARC_SUFFIXES):
                    continue
                kapak = epic_kapak_bul(details.get("keyImages", []))
                if not kapak:
                    continue
                oyunlar.append({
                    "ad": title, "id": item_id, "platform": "Epic",
                    "resim": kapak, "is_installed": False, "is_tool": False,
                })
                gordukler.add(title)

    log.info(f"Entitlement fallback: {len(oyunlar)} oyun")
    return oyunlar



# =============================================
# STEAM
# =============================================

def kutuphaneleri_bul(ana_dizin: str) -> list:
    kutuphaneler = [os.path.join(ana_dizin, "steamapps")]
    vdf_yolu = os.path.join(ana_dizin, "steamapps", "libraryfolders.vdf")
    if not os.path.exists(vdf_yolu):
        return kutuphaneler
    try:
        with open(vdf_yolu, "r", encoding="utf-8") as f:
            icerik = f.read()
        for yol in re.findall(r'"path"\s+"([^"]+)"', icerik):
            yol = yol.replace("\\\\", "\\")
            steamapps = os.path.join(yol, "steamapps")
            if os.path.exists(steamapps):
                kutuphaneler.append(steamapps)
    except IOError as e:
        log.warning(f"libraryfolders.vdf okunamadı: {e}")
    return list(set(kutuphaneler))


@eel.expose
def sistemden_oyunlari_getir() -> list:
    steam_yollari = [
        r"C:\Program Files (x86)\Steam",
        os.path.expanduser("~/.local/share/Steam"),
        os.path.expanduser("~/.steam/steam"),
    ]
    ana_yol = next((y for y in steam_yollari if os.path.exists(y)), None)
    steam_oyunlari = []

    if ana_yol:
        for lib in kutuphaneleri_bul(ana_yol):
            for manifest in glob.glob(os.path.join(lib, "appmanifest_*.acf")):
                try:
                    with open(manifest, "r", encoding="utf-8") as f:
                        data = f.read()
                    appid = re.search(r'"appid"\s+"(\d+)"', data).group(1)
                    name  = re.search(r'"name"\s+"([^"]+)"', data).group(1)
                    steam_oyunlari.append({
                        "ad": name, "id": appid, "platform": "Steam",
                        "resim": f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg",
                        "is_installed": True,
                        "is_tool": any(a in name.lower() for a in ARACLAR_LISTESI),
                    })
                except (AttributeError, IOError) as e:
                    log.debug(f"Manifest atlandı: {e}")

    heroic_oyunlari      = []
    eklenen_heroic_idler = set()
    home = os.path.expanduser("~")

    heroic_installed_kaynaklar = [
        {"dosya": ".config/heroic/legendaryConfig/legendary/installed.json",
         "platform": "Epic", "tip": "legendary"},
        {"dosya": ".var/app/com.heroicgameslauncher.hgl/config/heroic/legendaryConfig/legendary/installed.json",
         "platform": "Epic", "tip": "legendary"},
        {"dosya": ".config/heroic/gog_store/installed.json",
         "platform": "GOG", "tip": "liste"},
        {"dosya": ".config/heroic/nile_config/nile/installed.json",
         "platform": "Amazon", "tip": "liste"},
    ]

    for kaynak in heroic_installed_kaynaklar:
        dosya_yolu = os.path.join(home, kaynak["dosya"])
        if not os.path.exists(dosya_yolu):
            continue
        try:
            with open(dosya_yolu, "r", encoding="utf-8") as f:
                data = json.load(f)

            if kaynak["tip"] == "legendary":
                for app_id, v in data.items():
                    if app_id in eklenen_heroic_idler:
                        continue
                    ad           = v.get("title", app_id)
                    install_path = v.get("install_path", "")
                    kurulu = bool(install_path and os.path.exists(install_path))
                    heroic_oyunlari.append({
                        "ad": ad, "id": app_id, "platform": kaynak["platform"],
                        "resim": None, "is_installed": kurulu, "is_tool": False,
                    })
                    eklenen_heroic_idler.add(app_id)
            else:
                oyun_listesi = data if isinstance(data, list) else list(data.values())
                for v in oyun_listesi:
                    ad      = v.get("title") or v.get("app_name", "")
                    app_id  = v.get("app_name") or v.get("id", "")
                    if not ad or not app_id or app_id in eklenen_heroic_idler:
                        continue
                    install_path = v.get("install_path", "")
                    kurulu = bool(install_path and os.path.exists(install_path))
                    heroic_oyunlari.append({
                        "ad": ad, "id": app_id, "platform": kaynak["platform"],
                        "resim": None, "is_installed": kurulu, "is_tool": False,
                    })
                    eklenen_heroic_idler.add(app_id)

        except (json.JSONDecodeError, IOError) as e:
            log.warning(f"Heroic installed okunamadı ({dosya_yolu}): {e}")
    log.info(f"Yerel: {len(steam_oyunlari)} Steam, {len(heroic_oyunlari)} Heroic")
    return steam_oyunlari + heroic_oyunlari


@eel.expose
def steam_tum_kutuphaneyi_getir() -> list:
    url = (
        f"http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/"
        f"?key={STEAM_API_KEY}&steamid={STEAM_ID}&format=json"
        f"&include_appinfo=1&include_played_free_games=1"
    )
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        games = r.json().get("response", {}).get("games", [])
        log.info(f"Steam API: {len(games)} oyun.")
        return [{
            "ad": g["name"], "id": g["appid"],
            "resim": f"https://cdn.akamai.steamstatic.com/steam/apps/{g['appid']}/library_600x900.jpg",
            "platform": "Steam (Kütüphane)",
            "saat": round(g.get("playtime_forever", 0) / 60, 1),
            "is_installed": False, "is_tool": False,
        } for g in games]
    except requests.RequestException as e:
        log.error(f"Steam API başarısız: {e}")
        return []


@eel.expose
def heroic_magaza_taramasi() -> list:
    bulunanlar    = []
    eklenen_idler = set()
    home = os.path.expanduser("~")
    kaynaklar = [
        {"yol": ".config/heroic/legendaryConfig/legendary/library.json",                                    "platform": "Epic"},
        {"yol": ".config/heroic/gog_store/library.json",                                                     "platform": "GOG"},
        {"yol": ".config/heroic/nile_config/nile/library.json",                                              "platform": "Amazon"},
        {"yol": ".var/app/com.heroicgameslauncher.hgl/config/heroic/legendaryConfig/legendary/library.json", "platform": "Epic"},
    ]
    for k in kaynaklar:
        lib_file = os.path.join(home, k["yol"])
        if not os.path.exists(lib_file):
            continue
        try:
            with open(lib_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            oyunlar = data if isinstance(data, list) else list(data.values())
            for o in oyunlar:
                ad     = o.get("title") or o.get("app_name")
                app_id = o.get("app_name") or o.get("id")
                if ad and app_id and app_id not in eklenen_idler:
                    bulunanlar.append({
                        "ad": ad, "id": app_id, "platform": k["platform"],
                        "resim": None,  # Lazy load
                        "is_installed": False, "is_tool": False,
                    })
                    eklenen_idler.add(app_id)
        except (json.JSONDecodeError, IOError) as e:
            log.warning(f"{lib_file} okunamadı: {e}")
    log.info(f"Heroic mağaza: {len(bulunanlar)} oyun")
    return bulunanlar


# =============================================
# KALICI KÜTÜPHANe CACHE
# Yapı: { "oyunlar": [...], "steam_yerel_idler": [...],
#          "son_tam_tarama": 1234567890.0 }
# =============================================

KUTUPHANE_CACHE_DOSYASI = "kutuphane_cache.json"
YENILEME_SURESI_SAAT    = 6   # Steam API + Epic bu süreden uzun süredir taranmadıysa yenile


def _kutuphane_cache_oku() -> dict:
    if os.path.exists(KUTUPHANE_CACHE_DOSYASI):
        try:
            with open(KUTUPHANE_CACHE_DOSYASI, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning(f"Kütüphane cache okunamadı: {e}")
    return {}


def _kutuphane_cache_yaz(cache: dict) -> None:
    try:
        with open(KUTUPHANE_CACHE_DOSYASI, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log.warning(f"Kütüphane cache yazılamadı: {e}")


def _steam_yerel_idleri_al() -> set:
    """Şu an diskte kurulu olan Steam oyunlarının appid setini döner (hızlı)."""
    steam_yollari = [
        r"C:\Program Files (x86)\Steam",
        os.path.expanduser("~/.local/share/Steam"),
        os.path.expanduser("~/.steam/steam"),
    ]
    ana_yol = next((y for y in steam_yollari if os.path.exists(y)), None)
    if not ana_yol:
        return set()

    idler = set()
    for lib in kutuphaneleri_bul(ana_yol):
        for manifest in glob.glob(os.path.join(lib, "appmanifest_*.acf")):
            try:
                with open(manifest, "r", encoding="utf-8") as f:
                    data = f.read()
                appid = re.search(r'"appid"\s+"(\d+)"', data).group(1)
                idler.add(appid)
            except Exception:
                pass
    return idler


@eel.expose
def kutuphane_cache_yukle() -> dict:
    """
    Uygulama açılışında çağrılır.
    Cache varsa oyun listesini anında döner.
    Aynı zamanda diff için gereken meta veriyi de gönderir.
    """
    cache = _kutuphane_cache_oku()
    if not cache or not cache.get("oyunlar"):
        return {"durum": "bos"}

    son_tarama     = cache.get("son_tam_tarama", 0)
    gecen_saat     = (time.time() - son_tarama) / 3600
    yenileme_gerek = gecen_saat >= YENILEME_SURESI_SAAT

    log.info(f"Cache yüklendi: {len(cache['oyunlar'])} oyun | Son tarama: {gecen_saat:.1f} saat önce")

    return {
        "durum":          "tamam",
        "oyunlar":        cache["oyunlar"],
        "yenileme_gerek": yenileme_gerek,
        "gecen_saat":     round(gecen_saat, 1),
    }


@eel.expose
def hizli_degisiklik_tara() -> dict:
    """
    Sadece Steam yerel disk taraması yapar (hızlı, ~100ms).
    Cache'deki Steam yerel ID seti ile karşılaştırır.
    Döner: { "eklenen": [...oyun dict...], "silinen": ["id1", "id2"] }
    """
    cache = _kutuphane_cache_oku()
    eski_idler   = set(cache.get("steam_yerel_idler", []))
    guncel_idler = _steam_yerel_idleri_al()

    eklenen_idler = guncel_idler - eski_idler
    silinen_idler = eski_idler   - guncel_idler

    if not eklenen_idler and not silinen_idler:
        log.info("Hızlı tarama: değişiklik yok.")
        return {"eklenen": [], "silinen": []}

    log.info(f"Hızlı tarama: +{len(eklenen_idler)} yeni, -{len(silinen_idler)} silinen Steam oyunu")

    # Yeni yüklenen oyunların detaylarını al
    eklenen_oyunlar = []
    steam_yollari = [
        r"C:\Program Files (x86)\Steam",
        os.path.expanduser("~/.local/share/Steam"),
        os.path.expanduser("~/.steam/steam"),
    ]
    ana_yol = next((y for y in steam_yollari if os.path.exists(y)), None)

    if ana_yol and eklenen_idler:
        for lib in kutuphaneleri_bul(ana_yol):
            for manifest in glob.glob(os.path.join(lib, "appmanifest_*.acf")):
                try:
                    with open(manifest, "r", encoding="utf-8") as f:
                        data = f.read()
                    appid = re.search(r'"appid"\s+"(\d+)"', data).group(1)
                    if appid in eklenen_idler:
                        name = re.search(r'"name"\s+"([^"]+)"', data).group(1)
                        eklenen_oyunlar.append({
                            "ad": name, "id": appid, "platform": "Steam",
                            "resim": f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg",
                            "is_installed": True,
                            "is_tool": any(a in name.lower() for a in ARACLAR_LISTESI),
                        })
                except Exception:
                    pass

    return {
        "eklenen": eklenen_oyunlar,
        "silinen": list(silinen_idler),
    }


@eel.expose
def kutuphane_cache_guncelle(oyunlar: list) -> None:
    """
    Tam tarama sonrası JS tarafından çağrılır.
    Güncel oyun listesini ve Steam yerel ID'lerini diske yazar.
    """
    steam_yerel_idler = [
        str(o["id"]) for o in oyunlar
        if o.get("platform") == "Steam" and o.get("is_installed")
    ]
    cache = {
        "oyunlar":          oyunlar,
        "steam_yerel_idler": steam_yerel_idler,
        "son_tam_tarama":   time.time(),
    }
    _kutuphane_cache_yaz(cache)
    log.info(f"Kütüphane cache güncellendi: {len(oyunlar)} oyun kaydedildi.")


@eel.expose
def kutuphane_cache_sil() -> None:
    """Kullanıcı 'Zorla Yenile' istediğinde cache'i temizler."""
    if os.path.exists(KUTUPHANE_CACHE_DOSYASI):
        os.remove(KUTUPHANE_CACHE_DOSYASI)
        log.info("Kütüphane cache silindi.")



@eel.expose
def oyun_detay_getir(oyun_id: str, platform: str) -> dict:
    """Steam için store API + reviews çeker, diğerleri için temel bilgi döner."""
    if "steam" in platform.lower():
        try:
            import threading
            detay_sonuc = {}
            yorum_sonuc = {}

            def detay_cek():
                r = requests.get(
                    f"https://store.steampowered.com/api/appdetails?appids={oyun_id}&l=english",
                    timeout=15
                )
                r.raise_for_status()
                detay_sonuc.update(r.json())

            def yorum_cek():
                r = requests.get(
                    f"https://store.steampowered.com/appreviews/{oyun_id}",
                    params={"json": 1, "language": "english", "num_per_page": 11,
                            "filter": "recent", "review_type": "all"},
                    timeout=15
                )
                if r.status_code == 200:
                    yorum_sonuc.update(r.json())

            t1 = threading.Thread(target=detay_cek)
            t2 = threading.Thread(target=yorum_cek)
            t1.start(); t2.start()
            t1.join(); t2.join()

            data = detay_sonuc.get(str(oyun_id), {})
            if not data.get("success"):
                return {"hata": "Game not found"}
            d = data["data"]

            yorumlar = []
            for rev in yorum_sonuc.get("reviews", []):
                author = rev.get("author", {})
                metin  = rev.get("review", "").strip()
                if not metin:
                    continue
                if len(metin) > 300:
                    metin = metin[:300].rsplit(" ", 1)[0] + "…"
                yorumlar.append({
                    "metin":         metin,
                    "oynanma_saati": round(author.get("playtime_forever", 0) / 60, 1),
                    "olumlu":        rev.get("voted_up", True),
                    "tarih":         rev.get("timestamp_updated", 0),
                })

            puan_ozeti = yorum_sonuc.get("query_summary", {})

            return {
                "baslik":        d.get("name", ""),
                "aciklama":      d.get("short_description", ""),
                "gelistirici":   ", ".join(d.get("developers", [])),
                "yayinci":       ", ".join(d.get("publishers", [])),
                "cikis_tarihi":  d.get("release_date", {}).get("date", ""),
                "turler":        [g["description"] for g in d.get("genres", [])],
                "puan":          d.get("metacritic", {}).get("score"),
                "ucretsiz":      d.get("is_free", False),
                "fiyat":         d.get("price_overview", {}).get("final_formatted", ""),
                "kapsul_resim":  d.get("header_image", ""),
                "ekran_gors":    [s["path_thumbnail"] for s in d.get("screenshots", [])[:8]],
                "platform":      platform,
                "oyun_id":       oyun_id,
                "yorumlar":      yorumlar,
                "toplam_olumlu": puan_ozeti.get("total_positive", 0),
                "toplam_yorum":  puan_ozeti.get("total_reviews", 0),
                "puan_metni":    puan_ozeti.get("review_score_desc", ""),
            }
        except requests.RequestException as e:
            log.warning(f"Steam detail error ({oyun_id}): {e}")
            return {"hata": str(e)}

    return {
        "baslik": "", "aciklama": "", "gelistirici": "",
        "turler": [], "ekran_gors": [], "yorumlar": [],
        "platform": platform, "oyun_id": oyun_id,
    }


@eel.expose
def oyun_baslat(oyun_id: str, platform: str) -> dict:
    import subprocess, sys
    try:
        url = f"steam://rungameid/{oyun_id}" if "steam" in platform.lower() else f"heroic://launch/{oyun_id}"
        subprocess.Popen(["start", url], shell=True) if sys.platform == "win32" else subprocess.Popen(["xdg-open", url])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "hata": str(e)}


@eel.expose
def oyun_indir(oyun_id: str, platform: str) -> dict:
    import subprocess, sys
    try:
        url = f"steam://install/{oyun_id}" if "steam" in platform.lower() else f"heroic://install/{oyun_id}"
        subprocess.Popen(["start", url], shell=True) if sys.platform == "win32" else subprocess.Popen(["xdg-open", url])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "hata": str(e)}


@eel.expose
def oyun_kaldir(oyun_id: str, platform: str) -> dict:
    import subprocess, sys
    try:
        url = f"steam://uninstall/{oyun_id}" if "steam" in platform.lower() else f"heroic://uninstall/{oyun_id}"
        subprocess.Popen(["start", url], shell=True) if sys.platform == "win32" else subprocess.Popen(["xdg-open", url])
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "hata": str(e)}


@eel.expose
def guncelleme_tara() -> list:
    """
    Steam ve Heroic oyunlarındaki bekleyen güncellemeleri tespit eder.
    Steam: appmanifest StateFlags değerine bakar.
    Heroic: installed.json vs library.json version karşılaştırması.
    """
    guncellemeler = []

    # ── Steam ─────────────────────────────────────
    steam_yollari = [
        r"C:\Program Files (x86)\Steam",
        os.path.expanduser("~/.local/share/Steam"),
        os.path.expanduser("~/.steam/steam"),
    ]
    ana_yol = next((y for y in steam_yollari if os.path.exists(y)), None)

    GUNCELLEME_FLAGLERI = {
        "6":    "Update Required",
        "1026": "Update Paused",
        "516":  "Update Running",
        "1538": "Update Queued",
    }

    if ana_yol:
        for lib in kutuphaneleri_bul(ana_yol):
            for manifest in glob.glob(os.path.join(lib, "appmanifest_*.acf")):
                try:
                    with open(manifest, "r", encoding="utf-8") as f:
                        veri = f.read()
                    appid      = re.search(r'"appid"\s+"(\d+)"', veri).group(1)
                    name       = re.search(r'"name"\s+"([^"]+)"', veri).group(1)
                    state_flag = re.search(r'"StateFlags"\s+"(\d+)"', veri)
                    build_id   = re.search(r'"buildid"\s+"(\d+)"', veri)
                    build_local = build_id.group(1) if build_id else "?"
                    if state_flag and state_flag.group(1) in GUNCELLEME_FLAGLERI:
                        guncellemeler.append({
                            "id": appid, "ad": name, "platform": "Steam",
                            "durum": GUNCELLEME_FLAGLERI[state_flag.group(1)],
                            "mevcut_surum": f"Build {build_local}",
                            "yeni_surum": "Güncelleme Bekliyor",
                        })
                except Exception:
                    pass

    # ── Heroic ────────────────────────────────────
    home = os.path.expanduser("~")
    heroic_kaynaklar = [
        {
            "installed": ".config/heroic/legendaryConfig/legendary/installed.json",
            "library":   ".config/heroic/legendaryConfig/legendary/library.json",
            "platform":  "Epic", "tip": "legendary",
        },
        {
            "installed": ".var/app/com.heroicgameslauncher.hgl/config/heroic/legendaryConfig/legendary/installed.json",
            "library":   ".var/app/com.heroicgameslauncher.hgl/config/heroic/legendaryConfig/legendary/library.json",
            "platform":  "Epic", "tip": "legendary",
        },
        {
            "installed": ".config/heroic/gog_store/installed.json",
            "library":   ".config/heroic/gog_store/library.json",
            "platform":  "GOG", "tip": "liste",
        },
    ]

    for kaynak in heroic_kaynaklar:
        inst_path = os.path.join(home, kaynak["installed"])
        lib_path  = os.path.join(home, kaynak["library"])
        if not os.path.exists(inst_path) or not os.path.exists(lib_path):
            continue
        try:
            with open(inst_path, "r", encoding="utf-8") as f:
                installed = json.load(f)
            with open(lib_path, "r", encoding="utf-8") as f:
                library_raw = json.load(f)

            if isinstance(library_raw, list):
                library = {o.get("app_name", o.get("id", "")): o for o in library_raw}
            elif isinstance(library_raw, dict):
                library = library_raw
            else:
                continue

            if kaynak["tip"] == "legendary":
                oyunlar_iter = installed.items()
            else:
                lst = installed if isinstance(installed, list) else list(installed.values())
                oyunlar_iter = ((o.get("app_name", o.get("id", "")), o) for o in lst)

            for app_id, inst_data in oyunlar_iter:
                if not app_id:
                    continue
                inst_ver = inst_data.get("version") or inst_data.get("build_version") or ""
                lib_data = library.get(app_id, {})
                lib_ver  = lib_data.get("version") or lib_data.get("build_version") or ""
                ad       = inst_data.get("title", app_id)
                if inst_ver and lib_ver and inst_ver != lib_ver:
                    guncellemeler.append({
                        "id": app_id, "ad": ad, "platform": kaynak["platform"],
                        "durum": "Update Available",
                        "mevcut_surum": inst_ver, "yeni_surum": lib_ver,
                    })
        except Exception as e:
            log.debug(f"Heroic güncelleme tarama hatası: {e}")

    log.info(f"Güncelleme taraması: {len(guncellemeler)} bekleyen güncelleme")
    return guncellemeler

if __name__ == "__main__":
    import threading
    import socket

    PORT = 8765

    def port_bos_mu(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(("localhost", port)) != 0

    # Farklı port bul (aynı anda iki instance açılmasın diye)
    while not port_bos_mu(PORT):
        PORT += 1

    try:
        import webview

        # Eel'i arka planda başlat (sadece HTTP + WebSocket sunucu olarak)
        def eel_baslat():
            eel.start(
                "index.html",
                mode=None,        # Tarayıcı açma, sadece sunucu
                port=PORT,
                block=True,             # Eel thread'i bloklasın, biz webview thread'inde devam edeceğiz
            )

        eel_thread = threading.Thread(target=eel_baslat, daemon=True)
        eel_thread.start()

        # Eel'in ayağa kalkmasını bekle
        import time
        time.sleep(1)

        # Native pencere aç
        window = webview.create_window(
            title="Lib",
            url=f"http://localhost:{PORT}/index.html",
            width=1280,
            height=820,
            min_size=(800, 600),
            resizable=True,
        )

        webview.start(debug=False)

    except ImportError:
        # pywebview kurulu değilse Eel'in kendi sunucusunda aç
        log.warning("pywebview bulunamadı → tarayıcıda açılıyor. Kurmak için: pip install pywebview")
        eel.start("index.html", size=(1280, 820), port=PORT)