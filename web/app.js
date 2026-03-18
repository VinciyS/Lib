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
    ayarlariYukle();
    const kutu = document.getElementById("arama-kutusu");
    if (kutu) kutu.addEventListener("input", e => { aramaMetni = e.target.value.toLowerCase(); renderGames(); });
    document.addEventListener("click",   () => sagTikMenusuKapat());
    document.addEventListener("keydown", e => { if (e.key === "Escape") { sagTikMenusuKapat(); detayKapat(); istatistikKapat(); ayarlarKapat(); } });
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
    aktifGorunum === "liste" ? renderListe(grid, liste) : renderGrid(grid, liste);
}

function renderGrid(grid, liste) {
    grid.removeAttribute("style");
    grid.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "oyun-grid-container";

    liste.forEach(oyun => {
        const kart = document.createElement("div");
        kart.className = `oyun-kart${oyun.is_installed ? "" : " kutuphane-item"}`;
        kart.onclick = () => detayAc(oyun);
        kart.oncontextmenu = (e) => sagTikMenusuGoster(e, oyun);

        const yatay = `https://cdn.akamai.steamstatic.com/steam/apps/${oyun.id}/header.jpg`;
        const src   = oyun.resim || "";
        const saat  = (aktifAyarlar.saat && oyun.saat) ? `<span class="saat-etiketi">${oyun.saat} sa</span>` : "";
        const durum = aktifAyarlar.durum
            ? (oyun.is_installed
                ? `<span class="kurulum-etiketi kurulu">✔ Kurulu</span>`
                : `<span class="kurulum-etiketi degil">Kurulu Değil</span>`)
            : "";
        const oyna  = oyun.is_installed
            ? `<button class="oyna-btn" onclick="oyunBaslat(event,'${oyun.id}','${oyun.platform}')">▶ Oyna</button>`
            : `<button class="oyna-btn indir-btn" onclick="oyunIndir(event,'${oyun.id}','${oyun.platform}')">⬇ İndir</button>`;

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
        satir.onclick = () => detayAc(oyun);
        satir.oncontextmenu = (e) => sagTikMenusuGoster(e, oyun);

        const yatay = `https://cdn.akamai.steamstatic.com/steam/apps/${oyun.id}/header.jpg`;
        const src   = oyun.resim || yatay;
        const saat  = oyun.saat ? `${oyun.saat} sa` : "—";
        const oyna  = oyun.is_installed
            ? `<button class="satir-oyna" onclick="oyunBaslat(event,'${oyun.id}','${oyun.platform}')">▶ Oyna</button>`
            : `<button class="satir-oyna satir-indir" onclick="oyunIndir(event,'${oyun.id}','${oyun.platform}')">⬇ İndir</button>`;

        satir.innerHTML = `
            <img id="satir-kapak-${oyun.id}" class="satir-kapak" src="${src}" alt="${oyun.ad}" onerror="this.onerror=null;this.src='${yatay}';">
            <div class="satir-bilgi"><h3>${oyun.ad}</h3><p>${oyun.platform}</p></div>
            <span class="satir-saat">${saat}</span>${oyna}`;
        wrap.appendChild(satir);
    });
    grid.appendChild(wrap);
}

// ── OYUN BAŞLATMA / İNDİRME ──────────────────
async function oyunBaslat(event, id, platform) {
    event.stopPropagation();
    const btn = event.currentTarget;
    const org = btn.textContent;
    btn.textContent = "⏳"; btn.disabled = true;
    const r = await eel.oyun_baslat(String(id), platform)();
    if (r.ok) { btn.textContent = "✅"; setTimeout(() => { btn.textContent = org; btn.disabled = false; }, 2000); }
    else { btn.textContent = "❌"; btn.title = r.hata; setTimeout(() => { btn.textContent = org; btn.disabled = false; btn.title = ""; }, 3000); }
}

async function oyunIndir(event, id, platform) {
    event.stopPropagation();
    const btn = event.currentTarget;
    const org = btn.textContent;
    btn.textContent = "⏳"; btn.disabled = true;
    const r = await eel.oyun_indir(String(id), platform)();
    if (r.ok) { btn.textContent = "✅"; setTimeout(() => { btn.textContent = org; btn.disabled = false; }, 2000); }
    else { btn.textContent = "❌"; btn.title = r.hata; setTimeout(() => { btn.textContent = org; btn.disabled = false; btn.title = ""; }, 3000); }
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

// ── OYUN DETAY PANELİ ────────────────────────
async function detayAc(oyun) {
    const panel   = document.getElementById("detay-panel");
    const icerik  = document.getElementById("detay-icerik");
    const overlay = document.getElementById("detay-overlay");

    panel.classList.add("acik");
    overlay.classList.add("acik");
    panel._oyun = oyun;

    icerik.innerHTML = `
        <div class="detay-yuklenme">
            <div class="detay-yuklenme-kapak" style="background-image:url('${oyun.resim||""}')"></div>
            <div class="detay-yuklenme-spin">⏳ Yükleniyor…</div>
        </div>`;

    let detay;
    try {
        const timeout = new Promise((_,rej) => setTimeout(() => rej(new Error("Zaman aşımı")), 20000));
        detay = await Promise.race([eel.oyun_detay_getir(String(oyun.id), oyun.platform)(), timeout]);
    } catch (err) {
        icerik.innerHTML = `<div style="padding:32px;color:var(--kirmizi);text-align:center">⚠️ Detay yüklenemedi.<br><small style="color:var(--metin2)">${err.message||err}</small></div>`;
        return;
    }
    if (detay?.hata) {
        icerik.innerHTML = `<div style="padding:32px;color:var(--kirmizi);text-align:center">⚠️ ${detay.hata}</div>`;
        return;
    }

    const baslik      = detay.baslik || oyun.ad;
    const aciklama    = detay.aciklama || "";
    const gelistirici = detay.gelistirici || "";
    const cikis       = detay.cikis_tarihi || "";
    const turler      = (detay.turler||[]).map(t => `<span class="detay-tur">${t}</span>`).join("");
    const puan        = detay.puan ? `<div class="detay-stat"><span class="detay-stat-deger" style="color:var(--yesil)">${detay.puan}</span><span class="detay-stat-etiket">Metacritic</span></div>` : "";
    const fiyat       = detay.ucretsiz ? `<span class="detay-ucretsiz">Ücretsiz</span>` : (detay.fiyat ? `<span class="detay-fiyat">${detay.fiyat}</span>` : "");
    const kapak       = detay.kapsul_resim || oyun.resim || "";
    const saat        = oyun.saat ? `<div class="detay-stat"><span class="detay-stat-deger">${oyun.saat}</span><span class="detay-stat-etiket">saat oynadın</span></div>` : "";
    const ekranGors   = (detay.ekran_gors||[]).map(u => `<img class="detay-ekran" src="${u}" loading="lazy" onclick="ekranBuyut('${u}')">`).join("");

    // Yorum puanı özeti
    const toplamYorum  = detay.toplam_yorum || 0;
    const toplamOlumlu = detay.toplam_olumlu || 0;
    const puanMetni    = detay.puan_metni || "";
    const olumluYuzde  = toplamYorum > 0 ? Math.round((toplamOlumlu / toplamYorum) * 100) : 0;
    const puanRenk     = olumluYuzde >= 80 ? "var(--yesil)" : olumluYuzde >= 60 ? "#facc15" : "var(--kirmizi)";

    const yorumOzetiHtml = toplamYorum > 0 ? `
        <div class="detay-yorum-ozet">
            <span class="detay-yorum-puan" style="color:${puanRenk}">${puanMetni}</span>
            <span class="detay-yorum-sayi">${toplamOlumlu.toLocaleString()} / ${toplamYorum.toLocaleString()} olumlu (%${olumluYuzde})</span>
        </div>` : "";

    const yorumlarHtml = (detay.yorumlar||[]).length > 0 ? `
        <div class="detay-yorumlar-baslik">💬 Son Yorumlar</div>
        ${yorumOzetiHtml}
        <div class="detay-yorumlar">
            ${(detay.yorumlar||[]).map(y => {
                const tarih = y.tarih ? new Date(y.tarih * 1000).toLocaleDateString("tr-TR") : "";
                return `<div class="detay-yorum ${y.olumlu ? "olumlu" : "olumsuz"}">
                    <div class="detay-yorum-ust">
                        <span class="detay-yorum-emoji">${y.olumlu ? "👍" : "👎"}</span>
                        <span class="detay-yorum-saat">${y.oynanma_saati} saat</span>
                        <span class="detay-yorum-tarih">${tarih}</span>
                    </div>
                    <p class="detay-yorum-metin">${y.metin}</p>
                </div>`;
            }).join("")}
        </div>` : "";
    const oynaBtnHtml  = oyun.is_installed
        ? `<button class="detay-btn detay-btn-oyna" onclick="detayOyna()">▶ Oyna</button>`
        : `<button class="detay-btn detay-btn-indir" onclick="detayIndir()">⬇ İndir</button>`;
    const kaldirBtnHtml = oyun.is_installed
        ? `<button class="detay-btn detay-btn-kaldir" onclick="detayKaldir()">🗑 Kaldır</button>` : "";

    icerik.innerHTML = `
        <div class="detay-ust">
            <div class="detay-blur-bg" style="background-image:url(${kapak})"></div>
            <div class="detay-ust-icerik">
                <img class="detay-kapak" src="${kapak}" alt="${baslik}">
                <div class="detay-meta">
                    <h1 class="detay-baslik">${baslik}</h1>
                    <p class="detay-gelistirici">${gelistirici}</p>
                    <div class="detay-turler">${turler}</div>
                    <div class="detay-istatlar">
                        ${saat}
                        ${cikis ? `<div class="detay-stat"><span class="detay-stat-deger">${cikis}</span><span class="detay-stat-etiket">çıkış tarihi</span></div>` : ""}
                        ${puan}
                    </div>
                    <div class="detay-butonlar">${oynaBtnHtml}${kaldirBtnHtml}${fiyat}</div>
                </div>
            </div>
        </div>
        ${aciklama ? `<div class="detay-aciklama">${aciklama}</div>` : ""}
        ${ekranGors ? `<div class="detay-ekranlar-baslik">Ekran Görüntüleri</div><div class="detay-ekranlar">${ekranGors}</div>` : ""}
        ${yorumlarHtml}`;
}

function detayKapat() {
    document.getElementById("detay-panel")?.classList.remove("acik");
    document.getElementById("detay-overlay")?.classList.remove("acik");
}
async function detayOyna()  { const o = document.getElementById("detay-panel")?._oyun; if (o) await eel.oyun_baslat(String(o.id), o.platform)(); }
async function detayIndir() { const o = document.getElementById("detay-panel")?._oyun; if (o) await eel.oyun_indir(String(o.id), o.platform)(); }
async function detayKaldir() {
    const o = document.getElementById("detay-panel")?._oyun;
    if (!o || !confirm(`"${o.ad}" kaldırılsın mı?`)) return;
    detayKapat();
    await eel.oyun_kaldir(String(o.id), o.platform)();
    durumGoster(`🗑️ "${o.ad}" kaldırılıyor…`);
}
function ekranBuyut(url) {
    const ov = document.createElement("div");
    ov.className = "ekran-overlay";
    ov.innerHTML = `<img src="${url}"><span class="ekran-kapat" onclick="this.parentElement.remove()">✕</span>`;
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
}

// ── SAĞ TIK MENÜSÜ ───────────────────────────
let menuHedef = null;

function sagTikMenusuGoster(event, oyun) {
    event.preventDefault();
    event.stopPropagation();
    menuHedef = oyun;

    const menu   = document.getElementById("context-menu");
    document.getElementById("cm-oyna").style.display   = oyun.is_installed ? "flex" : "none";
    document.getElementById("cm-indir").style.display  = oyun.is_installed ? "none" : "flex";
    document.getElementById("cm-kaldir").style.display = oyun.is_installed ? "flex" : "none";

    menu.style.left    = Math.min(event.clientX, window.innerWidth  - 180) + "px";
    menu.style.top     = Math.min(event.clientY, window.innerHeight - 130) + "px";
    menu.style.display = "block";
    requestAnimationFrame(() => menu.classList.add("acik"));
}

function sagTikMenusuKapat() {
    const menu = document.getElementById("context-menu");
    if (!menu) return;
    menu.classList.remove("acik");
    setTimeout(() => { menu.style.display = "none"; }, 150);
    menuHedef = null;
}

async function cm_oyna()  { if (!menuHedef) return; const o = menuHedef; sagTikMenusuKapat(); await eel.oyun_baslat(String(o.id), o.platform)(); }
async function cm_indir() { if (!menuHedef) return; const o = menuHedef; sagTikMenusuKapat(); await eel.oyun_indir(String(o.id), o.platform)(); }
async function cm_kaldir() {
    if (!menuHedef) return;
    const o = menuHedef; sagTikMenusuKapat();
    if (!confirm(`"${o.ad}" kaldırılsın mı?`)) return;
    await eel.oyun_kaldir(String(o.id), o.platform)();
    durumGoster(`🗑️ "${o.ad}" kaldırılıyor…`);
}

// ── İSTATİSTİKLER ────────────────────────────
let grafikler = {};

function istatistikAc() {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("aktif"));
    document.querySelector("[data-filtre='istatistik']")?.classList.add("aktif");
    document.getElementById("istatistik-overlay").classList.add("acik");
    document.getElementById("istatistik-panel").classList.add("acik");
    istatistikRender();
}
function istatistikKapat() {
    document.getElementById("istatistik-overlay")?.classList.remove("acik");
    document.getElementById("istatistik-panel")?.classList.remove("acik");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("aktif", b.dataset.filtre === aktifFiltre));
    Object.values(grafikler).forEach(g => g.destroy());
    grafikler = {};
}
function istatistikRender() {
    const icerik = document.getElementById("istatistik-icerik");
    const oyunlar = tumOyunlar.filter(o => !o.is_tool);
    const toplamSaat = oyunlar.reduce((t,o) => t+(o.saat||0), 0);
    const kurulu = oyunlar.filter(o => o.is_installed).length;
    const saatliOyunlar = oyunlar.filter(o => o.saat > 0);

    const platformSayilari = {};
    oyunlar.forEach(o => { const p=(o.platform||"Diğer").split(" ")[0]; platformSayilari[p]=(platformSayilari[p]||0)+1; });

    const platformSaatler = {};
    saatliOyunlar.forEach(o => { const p=(o.platform||"Diğer").split(" ")[0]; platformSaatler[p]=(platformSaatler[p]||0)+(o.saat||0); });

    const top10 = [...saatliOyunlar].sort((a,b)=>(b.saat||0)-(a.saat||0)).slice(0,10);

    icerik.innerHTML = `
        <div class="istat-ozetler">
            <div class="istat-ozet-kart"><span class="istat-ozet-ikon">🎮</span><span class="istat-ozet-deger">${oyunlar.length}</span><span class="istat-ozet-etiket">Toplam Oyun</span></div>
            <div class="istat-ozet-kart"><span class="istat-ozet-ikon">✅</span><span class="istat-ozet-deger">${kurulu}</span><span class="istat-ozet-etiket">Kurulu</span></div>
            <div class="istat-ozet-kart"><span class="istat-ozet-ikon">⏱️</span><span class="istat-ozet-deger">${Math.round(toplamSaat).toLocaleString()}</span><span class="istat-ozet-etiket">Toplam Saat</span></div>
            <div class="istat-ozet-kart"><span class="istat-ozet-ikon">📅</span><span class="istat-ozet-deger">${Math.round(toplamSaat/24)}</span><span class="istat-ozet-etiket">Gün Oynadın</span></div>
        </div>
        <div class="istat-grafik-grid">
            <div class="istat-grafik-kart"><h3>Platform Dağılımı</h3><div class="istat-grafik-konteyner"><canvas id="grafik-platform-sayi"></canvas></div></div>
            <div class="istat-grafik-kart"><h3>Platform Oynama Süresi</h3><div class="istat-grafik-konteyner"><canvas id="grafik-platform-saat"></canvas></div></div>
        </div>
        <div class="istat-top-baslik">🏆 En Çok Oynanan 10 Oyun</div>
        <div class="istat-top-liste" id="istat-top-liste"></div>`;

    const renkler = ["#6c8cff","#4ade80","#f87171","#fb923c","#a78bfa","#38bdf8","#f472b6","#facc15","#34d399","#94a3b8"];
    const platformlar = Object.keys(platformSayilari);

    grafikler.sayi = new Chart(document.getElementById("grafik-platform-sayi"), {
        type: "doughnut",
        data: { labels: platformlar, datasets: [{ data: platformlar.map(p=>platformSayilari[p]), backgroundColor: renkler, borderColor: "#0e0e16", borderWidth: 3 }] },
        options: { plugins: { legend: { position: "bottom", labels: { color: "#c8cfe8", font: { size: 12 }, padding: 12 } } }, cutout: "62%" }
    });

    const platSirali = Object.keys(platformSaatler).sort((a,b)=>platformSaatler[b]-platformSaatler[a]);
    grafikler.saat = new Chart(document.getElementById("grafik-platform-saat"), {
        type: "bar",
        data: { labels: platSirali, datasets: [{ data: platSirali.map(p=>Math.round(platformSaatler[p])), backgroundColor: renkler, borderRadius: 6, borderSkipped: false }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#6b7194" }, grid: { color: "#2a2a3d" } }, y: { ticks: { color: "#6b7194", callback: v=>v+" sa" }, grid: { color: "#2a2a3d" } } } }
    });

    const maxSaat = top10[0]?.saat || 1;
    document.getElementById("istat-top-liste").innerHTML = top10.map((o,i) => `
        <div class="istat-top-satir">
            <span class="istat-top-sira">${i+1}</span>
            <img class="istat-top-kapak" src="${o.resim||""}" onerror="this.style.display='none'">
            <div class="istat-top-bilgi">
                <span class="istat-top-ad">${o.ad}</span>
                <div class="istat-top-bar-konteyner"><div class="istat-top-bar" style="width:${(o.saat/maxSaat*100).toFixed(1)}%;background:${renkler[i%renkler.length]}"></div></div>
            </div>
            <span class="istat-top-saat">${o.saat} sa</span>
        </div>`).join("");
}

// ── EPİC AUTH ─────────────────────────────────
function epicAuthPanelGoster(g) { document.getElementById("epic-auth-bolumu").style.display = g?"block":"none"; }
function epicDurumGuncelle(m,t) { const el=document.getElementById("epic-durum"); if(!el)return; el.textContent=m; el.className=`epic-durum epic-durum--${t}`; el.style.display="block"; }
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
    else { if (btn) btn.disabled = false; }
}
function durumGoster(m) { const el = document.getElementById("durum-cubugu"); if (el) el.textContent = m; }
// ── AYARLAR PANELİ ────────────────────────────

const TEMA_PALETI = {
    varsayilan: { bg:"#0e0e16", bg2:"#15151f", bg3:"#1c1c28", bg4:"#242433", sinir:"#2a2a3d", metin:"#c8cfe8", metin2:"#6b7194", vurgu:"#6c8cff", vurgu2:"#8fa8ff", yesil:"#4ade80", kirmizi:"#f87171" },
    kirmizi:    { bg:"#110a0a", bg2:"#1a0f0f", bg3:"#241515", bg4:"#2e1c1c", sinir:"#3d2424", metin:"#f0d0d0", metin2:"#8a5a5a", vurgu:"#f87171", vurgu2:"#fca5a5", yesil:"#4ade80", kirmizi:"#fb923c" },
    yesil:      { bg:"#080f0a", bg2:"#0f1a11", bg3:"#142418", bg4:"#1a2e1e", sinir:"#243d28", metin:"#c8f0d0", metin2:"#5a8a64", vurgu:"#4ade80", vurgu2:"#86efac", yesil:"#facc15", kirmizi:"#f87171" },
    altin:      { bg:"#100e00", bg2:"#1a1600", bg3:"#241e00", bg4:"#2e2600", sinir:"#3d3400", metin:"#f0e8c8", metin2:"#8a7a40", vurgu:"#facc15", vurgu2:"#fde047", yesil:"#4ade80", kirmizi:"#f87171" },
    mor:        { bg:"#0a0010", bg2:"#120018", bg3:"#1a0024", bg4:"#22002e", sinir:"#30003d", metin:"#e8d0f0", metin2:"#7a508a", vurgu:"#a78bfa", vurgu2:"#c4b5fd", yesil:"#4ade80", kirmizi:"#f87171" },
    pembe:      { bg:"#130008", bg2:"#1e000f", bg3:"#2a0018", bg4:"#360020", sinir:"#450030", metin:"#f0c8e8", metin2:"#8a4070", vurgu:"#f472b6", vurgu2:"#f9a8d4", yesil:"#4ade80", kirmizi:"#fb923c" },
    acik:       { bg:"#f0f4f8", bg2:"#e2e8f0", bg3:"#d1d9e6", bg4:"#c2ccda", sinir:"#a8b8cc", metin:"#1e293b", metin2:"#64748b", vurgu:"#3b82f6", vurgu2:"#60a5fa", yesil:"#16a34a", kirmizi:"#dc2626" },
    okyanus:    { bg:"#00080f", bg2:"#001018", bg3:"#001824", bg4:"#00202e", sinir:"#00304a", metin:"#c8e8f8", metin2:"#406880", vurgu:"#38bdf8", vurgu2:"#7dd3fc", yesil:"#4ade80", kirmizi:"#f87171" },
};

const AYAR_VARSAYILAN = {
    tema: "varsayilan",
    kartBoyutu: 165,
    sidebarGenislik: 220,
    soluk: true,
    saat: true,
    hover: true,
    durum: true,
};

let aktifAyarlar = { ...AYAR_VARSAYILAN };

function ayarlariYukle() {
    try {
        const kayitli = localStorage.getItem("oyunKutuphaneAyarlari");
        if (kayitli) aktifAyarlar = { ...AYAR_VARSAYILAN, ...JSON.parse(kayitli) };
    } catch(e) {}
    ayarlariUygula();
}

function ayarlariKaydet() {
    try { localStorage.setItem("oyunKutuphaneAyarlari", JSON.stringify(aktifAyarlar)); } catch(e) {}
}

function ayarlariUygula() {
    temaUygula(aktifAyarlar.tema, false);
    kartBoyutuUygula(aktifAyarlar.kartBoyutu, false);
    sidebarGenisligiUygula(aktifAyarlar.sidebarGenislik, false);
    gorünümUygula();
}

// ─ Ayarlar paneli aç/kapat ────────────────────
function ayarlarAc() {
    document.getElementById("ayarlar-overlay").classList.add("acik");
    document.getElementById("ayarlar-panel").classList.add("acik");
    ayarlarPaneliniDoldur();
}
function ayarlarKapat() {
    document.getElementById("ayarlar-overlay").classList.remove("acik");
    document.getElementById("ayarlar-panel").classList.remove("acik");
}

function ayarlarPaneliniDoldur() {
    // Tema butonları
    document.querySelectorAll(".tema-btn").forEach(b =>
        b.classList.toggle("aktif", b.dataset.tema === aktifAyarlar.tema)
    );
    // Slider'lar
    const kb = document.getElementById("kart-boyut-slider");
    if (kb) { kb.value = aktifAyarlar.kartBoyutu; document.getElementById("kart-boyut-deger").textContent = aktifAyarlar.kartBoyutu + "px"; }
    const sg = document.getElementById("sidebar-genislik-slider");
    if (sg) { sg.value = aktifAyarlar.sidebarGenislik; document.getElementById("sidebar-genislik-deger").textContent = aktifAyarlar.sidebarGenislik + "px"; }
    // Toggle'lar
    document.getElementById("toggle-soluk").checked = aktifAyarlar.soluk;
    document.getElementById("toggle-saat").checked  = aktifAyarlar.saat;
    document.getElementById("toggle-hover").checked = aktifAyarlar.hover;
    document.getElementById("toggle-durum").checked = aktifAyarlar.durum;
}

// ─ Tema ──────────────────────────────────────
function temaUygula(temaAdi, kaydet = true) {
    const tema = TEMA_PALETI[temaAdi] || TEMA_PALETI.varsayilan;
    const root = document.documentElement;
    Object.entries(tema).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    if (kaydet) {
        aktifAyarlar.tema = temaAdi;
        ayarlariKaydet();
        document.querySelectorAll(".tema-btn").forEach(b =>
            b.classList.toggle("aktif", b.dataset.tema === temaAdi)
        );
    }
}

// ─ Kart boyutu ───────────────────────────────
function kartBoyutuAyarla(deger) {
    aktifAyarlar.kartBoyutu = parseInt(deger);
    const el = document.getElementById("kart-boyut-deger");
    if (el) el.textContent = deger + "px";
    kartBoyutuUygula(deger);
    ayarlariKaydet();
}
function kartBoyutuUygula(deger, yenile = true) {
    document.documentElement.style.setProperty("--kart-min-genislik", deger + "px");
    const konteyner = document.querySelector(".oyun-grid-container");
    if (konteyner) konteyner.style.gridTemplateColumns = `repeat(auto-fill, minmax(${deger}px, 1fr))`;
    if (yenile && tumOyunlar.length) renderGames();
}

// ─ Sidebar genişliği ─────────────────────────
function sidebarGenisligiAyarla(deger) {
    aktifAyarlar.sidebarGenislik = parseInt(deger);
    const el = document.getElementById("sidebar-genislik-deger");
    if (el) el.textContent = deger + "px";
    sidebarGenisligiUygula(deger);
    ayarlariKaydet();
}
function sidebarGenisligiUygula(deger) {
    document.documentElement.style.setProperty("--sidebar-w", deger + "px");
}

// ─ Toggle görünüm ayarları ────────────────────
function gorünümAyarKaydet() {
    aktifAyarlar.soluk = document.getElementById("toggle-soluk").checked;
    aktifAyarlar.saat  = document.getElementById("toggle-saat").checked;
    aktifAyarlar.hover = document.getElementById("toggle-hover").checked;
    aktifAyarlar.durum = document.getElementById("toggle-durum").checked;
    ayarlariKaydet();
    gorünümUygula();
    renderGames();
}
function gorünümUygula() {
    const root = document.documentElement;
    // Soluk efekti
    root.style.setProperty("--kutuphane-opacity", aktifAyarlar.soluk ? "0.65" : "1");
    // Hover animasyonu
    if (!aktifAyarlar.hover) {
        if (!document.getElementById("no-hover-style")) {
            const s = document.createElement("style");
            s.id = "no-hover-style";
            s.textContent = ".oyun-kart:hover { transform: none !important; }";
            document.head.appendChild(s);
        }
    } else {
        document.getElementById("no-hover-style")?.remove();
    }
}

// ─ Sıfırla ───────────────────────────────────
function ayarlariSifirla() {
    aktifAyarlar = { ...AYAR_VARSAYILAN };
    ayarlariKaydet();
    ayarlariUygula();
    ayarlarPaneliniDoldur();
}

// ─ renderGrid'e ayar entegrasyonu ────────────
const _orijinalRenderGrid = typeof renderGrid !== "undefined" ? renderGrid : null;
// ── GÜNCELLEME TESPİTİ ────────────────────────
let guncellemeler = [];

async function guncellemelerAc() {
    document.getElementById("guncelleme-overlay").classList.add("acik");
    document.getElementById("guncelleme-panel").classList.add("acik");
    guncellemelerTara();
}

function guncellemelerKapat() {
    document.getElementById("guncelleme-overlay").classList.remove("acik");
    document.getElementById("guncelleme-panel").classList.remove("acik");
}

async function guncellemelerTara() {
    const icerik = document.getElementById("guncelleme-icerik");
    icerik.innerHTML = `<p class="guncelleme-yukleniyor">⏳ Steam ve Heroic taranıyor…</p>`;

    try {
        guncellemeler = await eel.guncelleme_tara()();
    } catch(e) {
        icerik.innerHTML = `<p class="bos-mesaj" style="color:var(--kirmizi)">⚠️ Tarama başarısız.</p>`;
        return;
    }

    // Sidebar sayacını güncelle
    const rozet = document.getElementById("nav-sayi-guncelleme");
    if (rozet) {
        if (guncellemeler.length > 0) {
            rozet.textContent = guncellemeler.length;
            rozet.style.display = "inline";
            rozet.style.background = "var(--kirmizi)";
            rozet.style.color = "#fff";
        } else {
            rozet.style.display = "none";
        }
    }

    // Güncelleme kartlarındaki badge'leri uygula
    guncellemeBadgeUygula();

    if (guncellemeler.length === 0) {
        icerik.innerHTML = `
            <div class="guncelleme-bos">
                <span class="guncelleme-bos-ikon">✅</span>
                <p>Tüm oyunlar güncel!</p>
                <small>Steam ve Heroic kütüphanesi tarandı.</small>
            </div>`;
        return;
    }

    // Platform bazlı grupla
    const gruplar = {};
    guncellemeler.forEach(g => {
        if (!gruplar[g.platform]) gruplar[g.platform] = [];
        gruplar[g.platform].push(g);
    });

    let html = "";
    for (const [platform, liste] of Object.entries(gruplar)) {
        html += `<div class="guncelleme-grup-baslik">${platform} — ${liste.length} güncelleme</div>`;
        html += `<div class="guncelleme-listesi">`;
        liste.forEach(g => {
            const oyun = tumOyunlar.find(o => String(o.id) === String(g.id));
            const kapak = oyun?.resim || "";
            const platRenk = g.platform === "Steam" ? "#1a9fff" : g.platform === "Epic" ? "#c850c0" : "#a855f7";
            html += `
                <div class="guncelleme-satir">
                    <div class="guncelleme-kapak-wrap">
                        ${kapak ? `<img src="${kapak}" class="guncelleme-kapak">` : `<div class="guncelleme-kapak-placeholder">${g.ad[0]}</div>`}
                    </div>
                    <div class="guncelleme-bilgi">
                        <span class="guncelleme-ad">${g.ad}</span>
                        <div class="guncelleme-surum">
                            <span class="guncelleme-eski">${g.mevcut_surum}</span>
                            <span class="guncelleme-ok">→</span>
                            <span class="guncelleme-yeni">${g.yeni_surum}</span>
                        </div>
                    </div>
                    <span class="guncelleme-durum-badge" style="background:${platRenk}22;color:${platRenk};border-color:${platRenk}44">${g.durum}</span>
                </div>`;
        });
        html += `</div>`;
    }

    icerik.innerHTML = html;
}

function guncellemeBadgeUygula() {
    // Kart üzerinde güncelleme rozeti göster
    guncellemeler.forEach(g => {
        const img = document.getElementById(`kapak-${g.id}`);
        if (!img) return;
        const konteyner = img.closest(".resim-konteyner");
        if (!konteyner) return;
        if (!konteyner.querySelector(".guncelleme-badge")) {
            const badge = document.createElement("span");
            badge.className = "guncelleme-badge";
            badge.textContent = "↑ Güncelleme";
            konteyner.appendChild(badge);
        }
    });
}

// Uygulama açılışında arka planda tara (Escape ile kapat)
document.addEventListener("keydown", e => {
    if (e.key === "Escape") guncellemelerKapat();
});

// Sayfa yüklenince 3 saniye sonra sessizce tara (rozeti güncelle)
setTimeout(async () => {
    try {
        const sonuc = await eel.guncelleme_tara()();
        guncellemeler = sonuc;
        const rozet = document.getElementById("nav-sayi-guncelleme");
        if (rozet && sonuc.length > 0) {
            rozet.textContent = sonuc.length;
            rozet.style.display = "inline";
            rozet.style.background = "var(--kirmizi)";
            rozet.style.color = "#fff";
        }
    } catch(e) {}
}, 3000);