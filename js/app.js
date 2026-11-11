// SHULE APP - Login kwa Simu + PIN
// Default Admin: Simu 0718780484, PIN 1234
// Unaweza kubadilisha baadaye kwenye Settings

const DEFAULT_ADMIN = { phone: "0718780484", pin: "1234" };

function getAdmin() {
  try {
    const s = JSON.parse(localStorage.getItem("shule_admin") || "null");
    if (s && s.phone && s.pin) return s;
  } catch(e) {}
  return { ...DEFAULT_ADMIN };
}
function saveAdmin(a) {
  localStorage.setItem("shule_admin", JSON.stringify(a));
}

function showLogin() {
  const admin = getAdmin();
  document.getElementById("app").innerHTML = `
  <main style="max-width:420px;margin:0 auto;padding:24px 16px;font-family:sans-serif">
    <h1 style="font-size:28px;font-weight:800;color:#16a34a;text-align:center">SHULE APP</h1>
    <p style="text-align:center;color:#64748b">Ingia kwa Simu na PIN</p>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-top:20px">
      <label>Namba ya Simu</label>
      <input id="phone" value="${admin.phone}" inputmode="tel" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 14px" />
      <label>Role</label>
      <select id="role" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 14px">
        <option value="admin">Mkuu / Admin</option>
        <option value="teacher">Mwalimu</option>
        <option value="parent">Mzazi</option>
      </select>
      <label>PIN</label>
      <input id="pin" type="password" inputmode="numeric" placeholder="Mfano 1234" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 14px" />
      <button onclick="doLogin()" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:0;border-radius:10px;font-weight:700;font-size:16px">INGIA</button>
      <p id="msg" style="color:#dc2626;text-align:center;margin-top:10px"></p>
      <p style="text-align:center;color:#94a3b8;font-size:13px;margin-top:8px">Jaribio: Simu ${admin.phone} • PIN ${admin.pin}</p>
    </div>
  </main>`;
}

async function doLogin() {
  const phone = document.getElementById("phone").value.trim();
  const pin = document.getElementById("pin").value.trim();
  const role = document.getElementById("role").value;
  const admin = getAdmin();
  const msg = document.getElementById("msg");

  // Admin: angalia Simu + PIN zilizohifadhiwa (au default 0718780484 / 1234)
  if (role === "admin") {
    if (phone === admin.phone && pin === admin.pin) {
      localStorage.setItem("shule_session", JSON.stringify({ role, phone }));
      showDashboard();
      return;
    } else {
      msg.textContent = "Simu au PIN si sahihi. Jaribu tena.";
      return;
    }
  }
  // Mwalimu / Mzazi: kwa sasa tumia PIN 1234, utaweza kuweka zao baadaye
  if (pin === "1234" && phone.length >= 10) {
    localStorage.setItem("shule_session", JSON.stringify({ role, phone }));
    showDashboard();
  } else {
    msg.textContent = "Simu au PIN si sahihi.";
  }
}

function showDashboard() {
  const sess = JSON.parse(localStorage.getItem("shule_session") || "{}");
  const admin = getAdmin();
  document.getElementById("app").innerHTML = `
  <main style="max-width:520px;margin:0 auto;padding:20px 16px;font-family:sans-serif">
    <h1 style="font-size:24px;font-weight:800">Karibu, ${sess.role === "admin" ? "Mkuu" : sess.role} 👋</h1>
    <p style="color:#64748b">Simu: ${sess.phone}</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;margin-top:16px">
      <b>✅ Umeingia kikamilifu!</b><br/>App sasa inafanya kazi. Hatua inayofuata ni kuunganisha wanafunzi, madarasa na ada.
    </div>
    <h2 style="margin-top:24px">⚙️ Settings - Badilisha Namba / PIN</h2>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px">
      <label>Namba Mpya ya Admin</label>
      <input id="newPhone" value="${admin.phone}" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 12px" />
      <label>PIN Mpya</label>
      <input id="newPin" value="${admin.pin}" inputmode="numeric" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin:6px 0 12px" />
      <button onclick="saveSettings()" style="width:100%;padding:12px;background:#0f172a;color:#fff;border:0;border-radius:10px;font-weight:700">HIFADHI MABADILIKO</button>
      <p id="saveMsg" style="color:#16a34a;text-align:center;margin-top:8px"></p>
    </div>
    <button onclick="logout()" style="width:100%;padding:12px;margin-top:16px;background:#fee2e2;color:#991b1b;border:0;border-radius:10px;font-weight:700">TOKA / LOGOUT</button>
  </main>`;
}

function saveSettings() {
  const phone = document.getElementById("newPhone").value.trim();
  const pin = document.getElementById("newPin").value.trim();
  if (phone.length < 10 || pin.length < 4) {
    document.getElementById("saveMsg").textContent = "Weka namba sahihi (tarakimu 10+) na PIN (tarakimu 4+)";
    document.getElementById("saveMsg").style.color = "#dc2626";
    return;
  }
  saveAdmin({ phone, pin });
  document.getElementById("saveMsg").style.color = "#16a34a";
  document.getElementById("saveMsg").textContent = "✅ Imehifadhiwa! Kuanzia sasa ingia na Simu " + phone + " na PIN mpya.";
}

function logout() {
  localStorage.removeItem("shule_session");
  showLogin();
}

// Anza App
(function init() {
  const sess = localStorage.getItem("shule_session");
  if (sess) showDashboard(); else showLogin();
})();
