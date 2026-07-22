// ==========================================
// APP.JS — DITENAGAI SUPABASE + MIDTRANS
// Pastikan supabase.js (berisi SUPABASE_URL & SUPABASE_KEY)
// dimuat SEBELUM file ini di setiap halaman HTML.
// ==========================================

let appSettings = {};
let appMenus = [];
let appKategori = [];
let appMeja = [];
let appReservasi = [];
let appPesanan = [];

// ==========================================
// KERANJANG BELANJA (CART) — hanya untuk index.html
// ==========================================
let cart = [];

function addToCart(menuId) {
    const item = appMenus.find(m => m.id === menuId);
    if (!item) return;

    const existing = cart.find(c => c.id === menuId);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id: item.id, nama: item.nama, harga: Number(item.harga), qty: 1 });
    }
    renderCart();
    openCart();
}

function changeQty(menuId, delta) {
    const item = cart.find(c => c.id === menuId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(c => c.id !== menuId);
    }
    renderCart();
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.harga * item.qty), 0);
}

function renderCart() {
    const cartCount = document.getElementById("cartCount");
    const cartItems = document.getElementById("cartItems");
    const cartTotal = document.getElementById("cartTotal");
    if (!cartItems) return;

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    if (cartCount) {
        cartCount.innerText = totalQty;
        cartCount.style.display = totalQty > 0 ? "flex" : "none";
    }

    if (cart.length === 0) {
        cartItems.innerHTML = `<p style="text-align:center; color:#6b7280; padding:20px 0;">Keranjang masih kosong.</p>`;
    } else {
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <p class="cart-item-name">${item.nama}</p>
                    <p class="cart-item-price">Rp ${Number(item.harga).toLocaleString('id-ID')}</p>
                </div>
                <div class="cart-item-qty">
                    <button onclick="changeQty('${item.id}', -1)">-</button>
                    <span>${item.qty}</span>
                    <button onclick="changeQty('${item.id}', 1)">+</button>
                </div>
            </div>
        `).join("");
    }

    if (cartTotal) {
        cartTotal.innerText = `Rp ${getCartTotal().toLocaleString('id-ID')}`;
    }
}

function openCart() {
    const panel = document.getElementById("cartPanel");
    if (panel) panel.classList.add("active");
}

function closeCart() {
    const panel = document.getElementById("cartPanel");
    if (panel) panel.classList.remove("active");
}

async function submitCheckout(e) {
    e.preventDefault();

    if (cart.length === 0) {
        alert("Keranjang masih kosong!");
        return;
    }

    const nama = document.getElementById("checkoutNama").value.trim();
    const wa = document.getElementById("checkoutWA").value.trim();
    const btn = document.getElementById("btnCheckout");

    if (!nama || !wa) {
        alert("Nama dan nomor WA wajib diisi!");
        return;
    }

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Memproses...";

    const orderId = `TUBI-${Date.now()}`;
    const totalHarga = getCartTotal();

    const itemsForDb = cart.map(item => ({
        nama: item.nama,
        harga: item.harga,
        qty: item.qty
    }));

    // 1. Simpan dulu pesanan ke database dengan status "pending"
    const { error: dbError } = await supabaseClient.from('pesanan').insert({
        order_id: orderId,
        nama_pelanggan: nama,
        wa_pelanggan: wa,
        items: itemsForDb,
        total_harga: totalHarga,
        status_pembayaran: 'pending'
    });

    if (dbError) {
        alert("Gagal menyimpan pesanan: " + dbError.message);
        btn.disabled = false;
        btn.innerText = originalText;
        return;
    }

    // 2. Minta token pembayaran Midtrans lewat Edge Function
    const itemsForMidtrans = cart.map(item => ({
        id: item.id,
        price: item.harga,
        quantity: item.qty,
        name: item.nama.substring(0, 50)
    }));

    try {
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/create-transaction`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({
                    order_id: orderId,
                    gross_amount: totalHarga,
                    items: itemsForMidtrans,
                    customer_name: nama,
                    customer_phone: wa
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Gagal membuat transaksi");
        }

        btn.disabled = false;
        btn.innerText = originalText;

        // 3. Buka popup pembayaran Midtrans Snap
        window.snap.pay(data.token, {
            onSuccess: function () {
                alert("Pembayaran berhasil! Terima kasih sudah memesan.");
                cart = [];
                renderCart();
                closeCart();
                closeCheckoutForm();
            },
            onPending: function () {
                alert("Pesanan dibuat, silakan selesaikan pembayaran.");
                cart = [];
                renderCart();
                closeCart();
                closeCheckoutForm();
            },
            onError: function () {
                alert("Pembayaran gagal. Silakan coba lagi.");
            },
            onClose: function () {
                alert("Kamu menutup halaman pembayaran sebelum selesai. Pesanan tetap tersimpan dengan status pending.");
            }
        });

    } catch (err) {
        alert("Gagal memproses pembayaran: " + err.message);
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function openCheckoutForm() {
    if (cart.length === 0) {
        alert("Keranjang masih kosong!");
        return;
    }
    const modal = document.getElementById("checkoutModal");
    if (modal) modal.classList.add("active");
}

function closeCheckoutForm() {
    const modal = document.getElementById("checkoutModal");
    if (modal) modal.classList.remove("active");
}

// Upload file ke Supabase Storage, kembalikan public URL-nya
async function uploadFile(file, folder) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error } = await supabaseClient.storage.from('Tubi-caffe').upload(fileName, file);
    if (error) throw error;
    const { data } = supabaseClient.storage.from('Tubi-caffe').getPublicUrl(fileName);
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
    renderCart();

    const formCheckout = document.getElementById("formCheckout");
    if (formCheckout) {
        formCheckout.addEventListener("submit", submitCheckout);
    }
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
                    <button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="addToCart('${item.id}')">+ Tambah ke Keranjang</button>
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#6b7280;">Belum ada pesanan masuk.</td></tr>`;
        return;
    }

    appPesanan.forEach(p => {
        const itemsText = (p.items || []).map(i => `${i.nama} x${i.qty}`).join(", ");
        const statusBadge = p.status_pembayaran === 'settlement' ? 'Sudah Bayar' :
                             p.status_pembayaran === 'pending' ? 'Menunggu' :
                             p.status_pembayaran;
        tbody.innerHTML += `
            <tr>
                <td>${p.order_id}</td>
                <td>${p.nama_pelanggan}</td>
                <td>${itemsText}</td>
                <td>Rp ${Number(p.total_harga).toLocaleString('id-ID')}</td>
                <td>${statusBadge}</td>
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
