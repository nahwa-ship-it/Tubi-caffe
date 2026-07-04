// ==========================================
// APP.JS — DITENAGAI SUPABASE
// Pastikan config.js (berisi SUPABASE_URL & SUPABASE_ANON_KEY)
// dimuat SEBELUM file ini di setiap halaman HTML.
// ==========================================

let appSettings = {};
let appMenus = [];
let appKategori = [];
let appMeja = [];
let appReservasi = [];
let appPesanan = [];

// Upload file ke Supabase Storage, kembalikan public URL-nya
async function uploadFile(file, folder) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error } = await supabaseClient.storage.from('cafe-assets').upload(fileName, file);
    if (error) throw error;
    const { data } = supabaseClient.storage.from('cafe-assets').getPublicUrl(fileName);
    return data.publicUrl;
}

// ==========================================
// HALAMAN PUBLIK (INDEX)
// ==========================================
async function initPublicPage() {
    const { data: settingsData } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
    appSettings = settingsData || {};

    const { data: kategoriData } = await supabaseClient.from('kategori').select('*').order('created_at');
    appKategori = kategoriData || [];

    const { data: menuData } = await supabaseClient.from('menu').select('*').order('created_at');
    appMenus = menuData || [];

    document.getElementById("titleCafe").innerText = appSettings.nama_cafe || "Cafe";
    document.getElementById("namaCafe").innerText = appSettings.nama_cafe || "Cafe";
    document.getElementById("taglineCafe").innerText = appSettings.tagline || "";
    document.getElementById("alamatCafe").innerText = appSettings.alamat || "-";
    document.getElementById("jamCafe").innerText = `${appSettings.buka || '-'} - ${appSettings.tutup || '-'}`;

    const waFloat = document.getElementById("waFloat");
    if (waFloat) {
        waFloat.href = `https://wa.me/${appSettings.wa}?text=Halo%20${encodeURIComponent(appSettings.nama_cafe || '')},%20saya%20ingin%20bertanya.`;
    }

    if (appSettings.logo) {
        const logo = document.getElementById("logoCafe");
        if (logo) {
            logo.src = appSettings.logo;
            logo.style.display = "inline-block";
        }
    }
    if (appSettings.bg_hero) {
        const heroBg = document.getElementById("heroBg");
        if (heroBg) {
            heroBg.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${appSettings.bg_hero})`;
        }
    }

    const catFilter = document.getElementById("categoryFilter");
    if (catFilter) {
        catFilter.innerHTML = `<span class="tab-item active" onclick="filterMenu('all', this)">Semua</span>`;
        appKategori.forEach(kat => {
            catFilter.innerHTML += `<span class="tab-item" onclick="filterMenu('${kat.nama}', this)">${kat.nama}</span>`;
        });
    }

    renderPublicMenu('all');
}

function renderPublicMenu(category = 'all') {
    const container = document.getElementById("menuContainer");
    if (!container) return;

    container.innerHTML = "";
    const filtered = category === 'all' ? appMenus : appMenus.filter(m => m.kategori === category);

    if (filtered.length === 0) {
        container.innerHTML = "<p>Belum ada daftar item menu yang tersedia.</p>";
        return;
    }

    filtered.forEach(item => {
        container.innerHTML += `
            <div class="menu-card">
                <img src="${item.foto || 'https://via.placeholder.com/300'}" class="menu-img" alt="${item.nama}">
                <div class="menu-info">
                    <h3>${item.nama}</h3>
                    <p class="menu-price">Rp ${Number(item.harga).toLocaleString('id-ID')}</p>
                    <p style="font-size:13px; color:#6b7280; margin-top:5px;">${item.deskripsi || ''}</p>
                </div>
            </div>
        `;
    });
}

function filterMenu(category, element) {
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    renderPublicMenu(category);
}

// ==========================================
// RESERVASI PELANGGAN
// ==========================================
async function initReservasiPage() {
    const { data: mejaData } = await supabaseClient.from('meja').select('*').order('created_at');
    appMeja = mejaData || [];

    const { data: settingsData } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
    appSettings = settingsData || {};

    const selectMeja = document.getElementById("resMeja");
    if (selectMeja) {
        selectMeja.innerHTML = "";
        appMeja.forEach(m => {
            selectMeja.innerHTML += `<option value="${m.nama}">${m.nama} (Kapasitas: ${m.kapasitas} Orang)</option>`;
        });
    }

    const formReservasi = document.getElementById("formReservasi");
    if (formReservasi) {
        formReservasi.addEventListener("submit", async function(e) {
            e.preventDefault();
            const btn = formReservasi.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Mengirim...";

            const data = {
                nama: document.getElementById("resNama").value,
                wa: document.getElementById("resWA").value,
                tanggal: document.getElementById("resTanggal").value,
                jam: document.getElementById("resJam").value,
                meja: document.getElementById("resMeja").value,
                orang: Number(document.getElementById("resOrang").value),
                catatan: document.getElementById("resCatatan").value
            };

            const { error } = await supabaseClient.from('reservasi').insert(data);

            btn.disabled = false;
            btn.innerText = originalText;

            if (error) {
                alert("Gagal mengirim reservasi. Silakan coba lagi.");
                console.error(error);
                return;
            }

            const teksWA = `Halo ${appSettings.nama_cafe}, saya ingin memesan reservasi meja:\n\n` +
                           `Nama: ${data.nama}\n` +
                           `Tanggal: ${data.tanggal}\n` +
                           `Jam: ${data.jam}\n` +
                           `Pilihan Meja: ${data.meja}\n` +
                           `Jumlah Orang: ${data.orang} Pax\n` +
                           `Catatan: ${data.catatan || '-'}`;

            window.open(`https://wa.me/${appSettings.wa}?text=${encodeURIComponent(teksWA)}`, '_blank');
            formReservasi.reset();
            alert("Reservasi berhasil dikirim!");
        });
    }
}

// ==========================================
// LOGIN & DAFTAR ADMIN (Supabase Auth)
// ==========================================
const formAuth = document.getElementById("formAuth");
if (formAuth) {
    let isRegisterMode = false;

    function updateAuthUI() {
        document.getElementById("authTitle").innerText = isRegisterMode ?
            "Daftar Akun Pengelola Baru" : "Masuk Dashboard";
        document.getElementById("btnAuth").innerText = isRegisterMode ?
            "Daftar Sekarang" : "Masuk";
        document.getElementById("toggleText").innerHTML = isRegisterMode ?
            `Sudah punya akun? <a href="#" id="linkToggle">Masuk</a>` :
            `Belum punya akun? <a href="#" id="linkToggle">Daftar Akun Baru</a>`;
    }

    document.getElementById("toggleText").addEventListener("click", function(e) {
        if (e.target && e.target.id === "linkToggle") {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            updateAuthUI();
        }
    });

    updateAuthUI();

    formAuth.addEventListener("submit", async function(e) {
        e.preventDefault();

        const email = document.getElementById("authEmail").value.trim();
        const pass = document.getElementById("authPassword").value.trim();
        const btn = document.getElementById("btnAuth");
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Memproses...";

        if (isRegisterMode) {
            const { error } = await supabaseClient.auth.signUp({ email, password: pass });
            btn.disabled = false;
            btn.innerText = originalText;

            if (error) {
                alert(error.message);
                return;
            }
            alert("Pendaftaran berhasil! Jika verifikasi email aktif, cek inbox dulu. Lalu silakan masuk.");
            isRegisterMode = false;
            updateAuthUI();
        } else {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
            btn.disabled = false;
            btn.innerText = originalText;

            if (error) {
                alert("Email atau password salah!");
                return;
            }
            window.location.href = "dashboard.html";
        }
    });
}

// ==========================================
// PANEL DASHBOARD ADMIN (SPA ACTION)
// ==========================================
function switchView(viewName, evt) {
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    const view = document.getElementById(`view-${viewName}`);
    if (view) view.classList.add('active');

    const ev = evt || window.event;
    if (ev && ev.currentTarget) {
        ev.currentTarget.classList.add('active');
    }
}

async function logoutAdmin() {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
}

async function initDashboardPage() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    await loadAllData();

    document.getElementById("setNama").value = appSettings.nama_cafe || "";
    document.getElementById("setTagline").value = appSettings.tagline || "";
    document.getElementById("setAlamat").value = appSettings.alamat || "";
    document.getElementById("setWA").value = appSettings.wa || "";
    document.getElementById("setBuka").value = appSettings.buka || "";
    document.getElementById("setTutup").value = appSettings.tutup || "";
    document.getElementById("setIg").value = appSettings.instagram || "";
    document.getElementById("setFb").value = appSettings.facebook || "";

    const formSetting = document.getElementById("formSetting");
    if (formSetting) {
        formSetting.addEventListener("submit", async function(e) {
            e.preventDefault();
            const btn = formSetting.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Menyimpan...";

            const updates = {
                nama_cafe: document.getElementById("setNama").value,
                tagline: document.getElementById("setTagline").value,
                alamat: document.getElementById("setAlamat").value,
                wa: document.getElementById("setWA").value,
                buka: document.getElementById("setBuka").value,
                tutup: document.getElementById("setTutup").value,
                instagram: document.getElementById("setIg").value,
                facebook: document.getElementById("setFb").value,
            };

            const fileLogo = document.getElementById("setLogo").files[0];
            const fileBg = document.getElementById("setBg").files[0];

            try {
                if (fileLogo) updates.logo = await uploadFile(fileLogo, "logo");
                if (fileBg) updates.bg_hero = await uploadFile(fileBg, "background");
            } catch (err) {
                alert("Gagal upload gambar: " + err.message);
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            const { error } = await supabaseClient.from('settings').update(updates).eq('id', 1);
            btn.disabled = false;
            btn.innerText = originalText;

            if (error) {
                alert("Gagal menyimpan pengaturan: " + error.message);
                return;
            }
            appSettings = { ...appSettings, ...updates };
            alert("Pengaturan berhasil disimpan!");
        });
    }

    const formMenu = document.getElementById("formMenu");
    if (formMenu) {
        formMenu.addEventListener("submit", async function(e) {
            e.preventDefault();
            const btn = document.getElementById("btnSimpanMenu");
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Menyimpan...";

            const id = document.getElementById("menuId").value;
            const payload = {
                nama: document.getElementById("menuNama").value,
                harga: Number(document.getElementById("menuHarga").value),
                kategori: document.getElementById("menuKategori").value,
                deskripsi: document.getElementById("menuDeskripsi").value,
            };
            const fileFoto = document.getElementById("menuFoto").files[0];

            try {
                if (fileFoto) payload.foto = await uploadFile(fileFoto, "menu");

                if (id) {
                    const { error } = await supabaseClient.from('menu').update(payload).eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await supabaseClient.from('menu').insert(payload);
                    if (error) throw error;
                }
            } catch (err) {
                alert("Gagal menyimpan menu: " + err.message);
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            formMenu.reset();
            document.getElementById("menuId").value = "";
            btn.disabled = false;
            btn.innerText = "Simpan Menu";
            await loadMenu();
            renderDashboardMenus();
        });
    }

    const formKategori = document.getElementById("formKategori");
    if (formKategori) {
        formKategori.addEventListener("submit", async function(e) {
            e.preventDefault();
            const inputKat = document.getElementById("katNama");
            const nama = inputKat.value.trim();

            if (!nama) return;
            if (appKategori.some(k => k.nama === nama)) {
                alert("Kategori sudah ada!");
                return;
            }

            const { error } = await supabaseClient.from('kategori').insert({ nama });
            if (error) {
                alert("Gagal menambah kategori: " + error.message);
                return;
            }

            inputKat.value = "";
            await loadKategori();
            renderDashboardKategori();
            populateMenuKategoriSelect();
        });
    }

    const formMeja = document.getElementById("formMeja");
    if (formMeja) {
        formMeja.addEventListener("submit", async function(e) {
            e.preventDefault();
            const nama = document.getElementById("mejaNama").value.trim();
            const kapasitas = document.getElementById("mejaKapasitas").value;

            if (!nama || !kapasitas) return;

            const { error } = await supabaseClient.from('meja').insert({ nama, kapasitas: Number(kapasitas) });
            if (error) {
                alert("Gagal menambah meja: " + error.message);
                return;
            }

            formMeja.reset();
            await loadMeja();
            renderDashboardMeja();
        });
    }

    populateMenuKategoriSelect();
    renderDashboardMenus();
    renderDashboardKategori();
    renderDashboardMeja();
    renderDashboardReservasi();
    renderDashboardPesanan();
}

// ==========================================
// LOAD DATA HELPERS
// ==========================================
async function loadAllData() {
    await Promise.all([
        loadSettings(), loadMenu(), loadKategori(), loadMeja(), loadReservasi(), loadPesanan()
    ]);
}
async function loadSettings() {
    const { data } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
    appSettings = data || {};
}
async function loadMenu() {
    const { data } = await supabaseClient.from('menu').select('*').order('created_at');
    appMenus = data || [];
}
async function loadKategori() {
    const { data } = await supabaseClient.from('kategori').select('*').order('created_at');
    appKategori = data || [];
}
async function loadMeja() {
    const { data } = await supabaseClient.from('meja').select('*').order('created_at');
    appMeja = data || [];
}
async function loadReservasi() {
    const { data } = await supabaseClient.from('reservasi').select('*').order('created_at', { ascending: false });
    appReservasi = data || [];
}
async function loadPesanan() {
    const { data } = await supabaseClient.from('pesanan').select('*').order('created_at', { ascending: false });
    appPesanan = data || [];
}

// ==========================================
// RENDER + AKSI TABEL DASHBOARD
// ==========================================
function populateMenuKategoriSelect() {
    const select = document.getElementById("menuKategori");
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = "";
    appKategori.forEach(kat => {
        select.innerHTML += `<option value="${kat.nama}">${kat.nama}</option>`;
    });
    if (appKategori.some(k => k.nama === currentValue)) {
        select.value = currentValue;
    }
}

function renderDashboardMenus() {
    const tbody = document.getElementById("tableMenuBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (appMenus.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#6b7280;">Belum ada menu.</td></tr>`;
        return;
    }

    appMenus.forEach(m => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${m.foto || 'https://via.placeholder.com/50'}" class="table-thumb" alt="${m.nama}"></td>
                <td>${m.nama}</td>
                <td>Rp ${Number(m.harga).toLocaleString('id-ID')}</td>
                <td>${m.kategori}</td>
                <td>${m.deskripsi || ''}</td>
                <td>
                    <button class="btn btn-primary" onclick="editMenu('${m.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="hapusMenu('${m.id}')">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function editMenu(id) {
    const item = appMenus.find(m => m.id === id);
    if (item) {
        document.getElementById("menuId").value = item.id;
        document.getElementById("menuNama").value = item.nama;
        document.getElementById("menuHarga").value = item.harga;
        document.getElementById("menuKategori").value = item.kategori;
        document.getElementById("menuDeskripsi").value = item.deskripsi;
        document.getElementById("btnSimpanMenu").innerText = "Update Menu";
        window.scrollTo(0, 0);
    }
}

async function hapusMenu(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus item menu ini?")) return;
    const { error } = await supabaseClient.from('menu').delete().eq('id', id);
    if (error) { alert("Gagal menghapus: " + error.message); return; }
    await loadMenu();
    renderDashboardMenus();
}

function renderDashboardKategori() {
    const list = document.getElementById("listKategori");
    if (!list) return;
    list.innerHTML = "";

    appKategori.forEach(k => {
        list.innerHTML += `
            <li>
                <span>${k.nama}</span>
                <button class="btn btn-danger" onclick="hapusKategori('${k.id}')">Hapus</button>
            </li>
        `;
    });
}

async function hapusKategori(id) {
    if (!confirm("Hapus kategori ini?")) return;
    const { error } = await supabaseClient.from('kategori').delete().eq('id', id);
    if (error) { alert("Gagal menghapus: " + error.message); return; }
    await loadKategori();
    renderDashboardKategori();
    populateMenuKategoriSelect();
}

function renderDashboardMeja() {
    const list = document.getElementById("listMeja");
    if (!list) return;
    list.innerHTML = "";

    appMeja.forEach(m => {
        list.innerHTML += `
            <li>
                <span>${m.nama} (Kapasitas: ${m.kapasitas} Kursi)</span>
                <button class="btn btn-danger" onclick="hapusMeja('${m.id}')">Hapus</button>
            </li>
        `;
    });
}

async function hapusMeja(id) {
    if (!confirm("Hapus meja ini?")) return;
    const { error } = await supabaseClient.from('meja').delete().eq('id', id);
    if (error) { alert("Gagal menghapus: " + error.message); return; }
    await loadMeja();
    renderDashboardMeja();
}

function renderDashboardReservasi() {
    const tbody = document.getElementById("tableReservasiBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (appReservasi.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#6b7280;">Belum ada reservasi masuk.</td></tr>`;
        return;
    }

    appReservasi.forEach(r => {
        tbody.innerHTML += `
            <tr>
                <td>${r.nama}</td>
                <td><a href="https://wa.me/${r.wa}" target="_blank" style="color: var(--primary-color); font-weight: bold;">${r.wa}</a></td>
                <td>${r.tanggal} @ ${r.jam}</td>
                <td>${r.meja}</td>
                <td>${r.orang} Pax</td>
                <td>${r.catatan || '-'}</td>
                <td>
                    <button class="btn btn-danger" onclick="hapusReservasi('${r.id}')">Hapus</button>
                </td>
            </tr>
        `;
    });
}

async function hapusReservasi(id) {
    if (!confirm("Hapus data reservasi ini?")) return;
    const { error } = await supabaseClient.from('reservasi').delete().eq('id', id);
    if (error) { alert("Gagal menghapus: " + error.message); return; }
    await loadReservasi();
    renderDashboardReservasi();
}

function renderDashboardPesanan() {
    const tbody = document.getElementById("tablePesananBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (appPesanan.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#6b7280;">Belum ada pesanan masuk.</td></tr>`;
        return;
    }

    appPesanan.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td>${p.tanggal || '-'}</td>
                <td>${p.nama || '-'}</td>
                <td>${p.item || '-'}</td>
                <td>${p.qty || '-'}</td>
                <td>${p.pembayaran || '-'}</td>
                <td>
                    <button class="btn btn-danger" onclick="hapusPesanan('${p.id}')">Hapus</button>
                </td>
            </tr>
        `;
    });
}

async function hapusPesanan(id) {
    if (!confirm("Hapus data pesanan ini?")) return;
    const { error } = await supabaseClient.from('pesanan').delete().eq('id', id);
    if (error) { alert("Gagal menghapus: " + error.message); return; }
    await loadPesanan();
    renderDashboardPesanan();
}
