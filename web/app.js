let tumOyunlar    = [];
let aktifFiltre   = "hepsi";
let aramaMetni    = "";
let aktifSiralama = "kurulu";
let aktifGorunum  = "grid";
let geriSayimTimer = null;

// ── BAŞLANGIÇ ────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    const sonuc = await eel.kutuphane_cache_yukle()();
    if (sonuc.durum === "tamam") {
        tumOyunlar = sonuc.oyunlar;
        sayilariGuncelle();
        renderGames();
        lazy_kapak_yukle();
        if (sonuc.yenileme_gerek) {
            durumGoster(`⏰ ${sonuc.gecen_saat} saat önce tarandı — güncelleniyor…`);
            setTimeout(() => tamTaramaYap(true), 500);
        } else {
            setTimeout(() => hizliDegisiklikKontrol(), 300);
        }
    } else {
        durumGoster("Başlamak için Tara butonuna bas.");
    }
    // arama kutusu
    const kutu = document.getElementById("arama-kutusu");
    if (kutu) kutu.addEventListener("input", e => { aramaMetni = e.target.value.toLowerCase(); renderGames(); });
});

// ── SAYAÇLAR ─────────────────────────────────
function sayilariGuncelle() {
    const say = (f) => f === "hepsi"
        ? tumOyunlar.filter(o => !o.is_tool).length
        : tumOyunlar.filter(o => !o.is_tool && (o.platform||"").toLowerCase().includes(f)).length;

    ["hepsi","steam","epic","gog","amazon"].forEach(f => {
        const el = document.getElementById(`nav-sayi-${f}`);
        if (el) el.textContent = say(f);
    });
    const rozet = document.getElementById("oyun-sayisi");
    if (rozet) rozet.textContent = say(aktifFiltre);

    const baslik = document.querySelector(".kutuphane-baslik");
    if (baslik) {
        const etiket = {"hepsi":"Tüm Oyunlar","steam":"Steam","epic":"Epic","gog":"GOG","amazon":"Amazon"};
        baslik.childNodes[0].textContent = (etiket[aktifFiltre] || "Tüm Oyunlar") + " ";
    }
}

// ── HIZLI DEĞİŞİKLİK ─────────────────────────
async function hizliDegisiklikKontrol() {
    const d = await eel.hizli_degisiklik_tara()();
    if (!d.eklenen.length && !d.silinen.length) return;
    if (d.silinen.length)
        tumOyunlar = tumOyunlar.filter(o => !d.silinen.includes(String(o.id)));
    d.eklenen.forEach(e => {
        if (!tumOyunlar.find(o => String(o.id) === String(e.id))) tumOyunlar.push(e);
    });
    sayilariGuncelle(); renderGames();
    eel.kutuphane_cache_guncelle(tumOyunlar)();
}

// ── TAM TARAMA ────────────────────────────────
async function UploadGames() { await tamTaramaYap(false); }

async function tamTaramaYap(arkaplanda = false) {
    if (!arkaplanda) setYukleniyor(true, "Taranıyor…");
    try {
        const [yuklu, steamApi, heroic] = await Promise.all([
            eel.sistemden_oyunlari_getir()(),
            eel.steam_tum_kutuphaneyi_getir()(),
            eel.heroic_magaza_taramasi()(),
        ]);
        const liste = [...yuklu];
        steamApi.forEach(k => {
            const m = liste.find(y => String(y.id) === String(k.id));
            if (!m) liste.push(k); else m.saat = k.saat;
        });
        heroic.forEach(h => {
            if (!liste.find(y => String(y.id) === String(h.id))) liste.push(h);
        });

        const epicVar = await eel.epic_token_var_mi()();
        if (epicVar) {
            if (!arkaplanda) setYukleniyor(true, "Epic çekiliyor…");
            const epicler = await eel.epic_kutuphanesini_getir()();
            epicler.forEach(e => {
                const idM = liste.find(y => String(y.id) === String(e.id));
                if (idM) { if (e.saat) idM.saat = e.saat; return; }
                const isimM = liste.find(y =>
                    y.ad.toLowerCase() === e.ad.toLowerCase() &&
                    (y.platform||"").toLowerCase().includes("epic")
                );
                if (isimM) { if (e.saat) isimM.saat = e.saat; if (e.resim && !isimM.resim) isimM.resim = e.resim; return; }
                liste.push(e);
            });
            epicDurumGuncelle(`✅ ${epicler.length} Epic oyunu alındı.`, "ok");
        } else {
            epicAuthPanelGoster(true);
        }

        tumOyunlar = liste;
        await eel.kutuphane_cache_guncelle(tumOyunlar)();
        sayilariGuncelle();
        renderGames();
        lazy_kapak_yukle();
        durumGoster("");
    } catch (err) {
        console.error(err);
        if (!arkaplanda)
            document.getElementById("oyun-grid").innerHTML = `<p class="hata-mesaji">Veriler çekilemedi.</p>`;
    } finally {
        if (!arkaplanda) setYukleniyor(false);
    }
}

async function zorlaYenile() {
    await eel.kutuphane_cache_sil()();
    tumOyunlar = [];
    sayilariGuncelle();
    renderGames();
    await tamTaramaYap(false);
}

// ── FİLTRE & SIRALAMA & GÖRÜNÜM ──────────────
function filtreAyarla(f) {
    aktifFiltre = f;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("aktif", b.dataset.filtre === f));
    sayilariGuncelle();
    renderGames();
}
function siralamaAyarla(v) { aktifSiralama = v; renderGames(); }
function gorunumAyarla(m) {
    aktifGorunum = m;
    document.getElementById("btn-grid")?.classList.toggle("aktif", m === "grid");
    document.getElementById("btn-liste")?.classList.toggle("aktif", m === "liste");
    renderGames();
}

// ── OYUN BAŞLATMA ─────────────────────────────
async function oyunBaslat(event, id, platform) {
    event.stopPropagation();
    const btn = event.currentTarget;
    const org = btn.textContent;
    btn.textContent = "⏳"; btn.disabled = true;
    const r = await eel.oyun_baslat(String(id), platform)();
    if (r.ok) {
        btn.textContent = "✅";
        setTimeout(() => { btn.textContent = org; btn.disabled = false; }, 2000);
    } else {
        btn.textContent = "❌"; btn.title = r.hata;
        setTimeout(() => { btn.textContent = org; btn.disabled = false; btn.title = ""; }, 3000);
    }
}

// ── LAZY KAPAK ───────────────────────────────
eel.expose(kapak_anlik_guncelle);
function kapak_anlik_guncelle(oyun_id, url) {
    if (!url) return;
    const oyun = tumOyunlar.find(o => String(o.id) === String(oyun_id));
    if (oyun) oyun.resim = url;
    const img = document.getElementById(`kapak-${oyun_id}`);
    if (img) { img.src = url; img.parentElement.classList.remove("skeleton"); const ph = img.parentElement.querySelector(".kapak-placeholder"); if (ph) ph.style.display = "none"; }
    const simg = document.getElementById(`satir-kapak-${oyun_id}`);
    if (simg) simg.src = url;
}
async function lazy_kapak_yukle() {
    const eks = tumOyunlar.filter(o => !o.resim).map(o => ({ad:o.ad,platform:o.platform,id:o.id}));
    if (!eks.length) return;
    eel.kapak_getir_toplu(eks);
}

// ── SIRALAMA ─────────────────────────────────
function siralaOyunlar(liste) {
    const s = [...liste];
    switch (aktifSiralama) {
        case "ad-asc":    return s.sort((a,b) => a.ad.localeCompare(b.ad));
        case "ad-desc":   return s.sort((a,b) => b.ad.localeCompare(a.ad));
        case "saat-desc": return s.sort((a,b) => (b.saat||0)-(a.saat||0));
        case "saat-asc":  return s.sort((a,b) => (a.saat||0)-(b.saat||0));
        case "platform":  return s.sort((a,b) => (a.platform||"").localeCompare(b.platform||""));
        case "kurulu":    return s.sort((a,b) => (b.is_installed?1:0)-(a.is_installed?1:0));
        default:          return s;
    }
}

// ── RENDER ───────────────────────────────────
function renderGames() {
    const grid = document.getElementById("oyun-grid");
    const araclariGoster = document.getElementById("showToolsCheckbox")?.checked;

    let liste = tumOyunlar.filter(o => {
        if (o.is_tool && !araclariGoster) return false;
        if (aktifFiltre !== "hepsi" && !(o.platform||"").toLowerCase().includes(aktifFiltre)) return false;
        if (aramaMetni && !o.ad.toLowerCase().includes(aramaMetni)) return false;
        return true;
    });
    liste = siralaOyunlar(liste);

    if (!liste.length) { grid.innerHTML = `<p class="bos-mesaj">Hiç oyun bulunamadı.</p>`; return; }

    if (aktifGorunum === "liste") {
        renderListe(grid, liste);
    } else {
        renderGrid(grid, liste);
    }
}

function renderGrid(grid, liste) {
    grid.removeAttribute("style");
    grid.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "oyun-grid-container";

    liste.forEach(oyun => {
        const kart = document.createElement("div");
        kart.className = `oyun-kart${oyun.is_installed ? "" : " kutuphane-item"}`;
        const yatay = `https://cdn.akamai.steamstatic.com/steam/apps/${oyun.id}/header.jpg`;
        const src   = oyun.resim || "";
        const saat  = oyun.saat ? `<span class="saat-etiketi">${oyun.saat} sa</span>` : "";
        const durum = oyun.is_installed
            ? `<span class="kurulum-etiketi kurulu">✔ Kurulu</span>`
            : `<span class="kurulum-etiketi degil">Kurulu Değil</span>`;
        const oyna  = oyun.is_installed
            ? `<button class="oyna-btn" onclick="oyunBaslat(event,'${oyun.id}','${oyun.platform}')">▶ Oyna</button>`
            : "";
        kart.innerHTML = `
            <div class="resim-konteyner ${!src ? "skeleton" : ""}">
                ${src ? `<img id="kapak-${oyun.id}" src="${src}" alt="${oyun.ad}" loading="lazy" onerror="this.onerror=null;this.src='${yatay}';">` : `<div class="kapak-placeholder">${oyun.ad[0]}</div>`}
                ${saat}${durum}${oyna}
            </div>
            <div class="oyun-bilgi"><h3 title="${oyun.ad}">${oyun.ad}</h3><p class="platform-metni">${oyun.platform}</p></div>`;
        wrap.appendChild(kart);
    });
    grid.appendChild(wrap);
}

function renderListe(grid, liste) {
    grid.removeAttribute("style");
    grid.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "oyun-liste-container";

    liste.forEach(oyun => {
        const satir = document.createElement("div");
        satir.className = `oyun-satiri${oyun.is_installed ? "" : " kutuphane-item"}`;
        const yatay = `https://cdn.akamai.steamstatic.com/steam/apps/${oyun.id}/header.jpg`;
        const src   = oyun.resim || yatay;
        const saat  = oyun.saat ? `${oyun.saat} sa` : "—";
        const oyna  = oyun.is_installed
            ? `<button class="satir-oyna" onclick="oyunBaslat(event,'${oyun.id}','${oyun.platform}')">▶ Oyna</button>`
            : "";
        satir.innerHTML = `
            <img id="satir-kapak-${oyun.id}" class="satir-kapak" src="${src}" alt="${oyun.ad}" onerror="this.onerror=null;this.src='${yatay}';">
            <div class="satir-bilgi"><h3>${oyun.ad}</h3><p>${oyun.platform}</p></div>
            <span class="satir-saat">${saat}</span>${oyna}`;
        wrap.appendChild(satir);
    });
    grid.appendChild(wrap);
}

// ── EPİC AUTH ─────────────────────────────────
function epicAuthPanelGoster(g) { document.getElementById("epic-auth-bolumu").style.display = g?"block":"none"; }
function epicDurumGuncelle(m, t) {
    const el = document.getElementById("epic-durum");
    if (!el) return;
    el.textContent = m; el.className = `epic-durum epic-durum--${t}`; el.style.display = "block";
}
function epicGeriSayimBaslat() {
    if (geriSayimTimer) clearInterval(geriSayimTimer);
    let k = 30;
    const sayac = document.getElementById("epic-sayac");
    const btn   = document.getElementById("epic-gonder-btn");
    document.getElementById("epic-auth-input").value = "";
    document.getElementById("epic-auth-input").focus();
    sayac.style.display = "inline"; btn.disabled = false;
    geriSayimTimer = setInterval(() => {
        k--;
        sayac.textContent = `⏱${k}s`;
        if (k <= 10) sayac.style.color = "#f38ba8";
        if (k <= 0) { clearInterval(geriSayimTimer); sayac.textContent = "⌛"; btn.disabled = true; epicDurumGuncelle("Süre doldu.", "hata"); }
    }, 1000);
}
async function epicKodGonder() {
    const kod = document.getElementById("epic-auth-input").value.trim();
    if (!kod) { alert("Kodu girin."); return; }
    if (geriSayimTimer) { clearInterval(geriSayimTimer); geriSayimTimer = null; }
    document.getElementById("epic-sayac").style.display = "none";
    epicDurumGuncelle("⏳ Doğrulanıyor…", "info");
    const r = await eel.epic_auth_kodu_gonder(kod)();
    if (r.ok) { epicDurumGuncelle(`✅ Hoş geldin, ${r.hesap}!`, "ok"); epicAuthPanelGoster(false); }
    else epicDurumGuncelle(`❌ ${r.hata}`, "hata");
}

// ── YARDIMCI ─────────────────────────────────
function setYukleniyor(d, m = "Taranıyor…") {
    const grid = document.getElementById("oyun-grid");
    const btn  = document.getElementById("tara-btn");
    if (d) { grid.innerHTML = `<p class="yuklenme-mesaji">⏳ ${m}</p>`; if (btn) btn.disabled = true; }
    else   { if (btn) btn.disabled = false; }
}
function durumGoster(m) { const el = document.getElementById("durum-cubugu"); if (el) el.textContent = m; }