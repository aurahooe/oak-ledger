const SB_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = supabase.createClient(SB_URL, SB_KEY);
let session = null;
let profile = null;

const $ = (id) => document.getElementById(id);

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function fmtClock() {
  const d = new Date();
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function excerpt(s, n = 160) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.go)?.scrollIntoView({ behavior: "smooth" });
  });
});

$("closeAuth").onclick = () => ($("authModal").hidden = true);

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) {
    const { data: p } = await sb
      .from("oak_profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    profile = p;
    if (!profile) {
      const handle = (session.user.email || "writer").split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 18) || "writer";
      const { data: made } = await sb
        .from("oak_profiles")
        .upsert({
          id: session.user.id,
          handle: handle + Math.floor(Math.random() * 90 + 10),
          display_name: handle,
        })
        .select()
        .single();
      profile = made;
    }
  } else {
    profile = null;
  }
  renderAuth();
  renderDesk();
}

function renderAuth() {
  const slot = $("authSlot");
  if (session && profile) {
    slot.innerHTML = `<div class="who"><span>@${profile.handle}</span><button class="ghost" id="out">Sign out</button></div>`;
    $("out").onclick = async () => {
      await sb.auth.signOut();
      await refreshAuth();
    };
  } else {
    slot.innerHTML = `<button class="ghost" id="in">Sign in</button>`;
    $("in").onclick = () => ($("authModal").hidden = false);
  }
}

function renderDesk() {
  const form = $("noteForm");
  const gate = $("deskAuth");
  if (!session) {
    form.hidden = true;
    gate.innerHTML = `<p class="empty">Sign in from the corner of the page to keep notes.</p>`;
    $("mine").innerHTML = "";
    return;
  }
  gate.innerHTML = "";
  form.hidden = false;
  loadMine();
}

async function loadHour() {
  $("clock").textContent = fmtClock();
  const { data } = await sb
    .from("oak_hours")
    .select("*, oak_notes ( title, body, user_id, oak_profiles ( handle, display_name ) )")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    $("headline").textContent = data.headline;
    $("essay").textContent = data.essay;
    if (data.oak_notes) {
      $("featured").hidden = false;
      $("featTitle").textContent = data.oak_notes.title;
      $("featBody").textContent = data.oak_notes.body;
      const p = data.oak_notes.oak_profiles;
      $("featBy").textContent = p ? `by ${p.display_name || p.handle}` : "";
    }
  }
}

async function loadGallery() {
  const { data, error } = await sb
    .from("oak_notes")
    .select("id, title, body, created_at, oak_profiles ( handle, display_name )")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(36);
  const grid = $("galleryGrid");
  if (error || !data || !data.length) {
    grid.innerHTML = `<p class="empty">The floor is empty. Be the first to mark a note public.</p>`;
    return;
  }
  grid.innerHTML = data
    .map((n) => {
      const who = n.oak_profiles?.handle ? `@${n.oak_profiles.handle}` : "anonymous";
      return `<article class="card">
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(excerpt(n.body))}</p>
        <div class="meta">${who} · ${new Date(n.created_at).toLocaleDateString()}</div>
      </article>`;
    })
    .join("");
}

async function loadMine() {
  if (!session) return;
  const { data } = await sb
    .from("oak_notes")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  const box = $("mine");
  if (!data || !data.length) {
    box.innerHTML = `<p class="empty">Your drawer is empty.</p>`;
    return;
  }
  box.innerHTML = data
    .map(
      (n) => `<div class="row">
        <div>
          <strong>${escapeHtml(n.title)}</strong>
          <div class="meta">${n.is_public ? "public" : "private"}</div>
        </div>
        <button data-toggle="${n.id}" data-pub="${n.is_public}">${n.is_public ? "Make private" : "Make public"}</button>
      </div>`
    )
    .join("");
  box.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      const next = b.dataset.pub !== "true";
      await sb.from("oak_notes").update({ is_public: next, updated_at: new Date().toISOString() }).eq("id", b.dataset.toggle);
      await loadMine();
      await loadGallery();
    };
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

$("magicForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get("email");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  $("magicHint").textContent = error ? error.message : "Check your inbox. The link expires soon.";
};

$("noteForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!session || !profile) return;
  const fd = new FormData(e.target);
  const { error } = await sb.from("oak_notes").insert({
    user_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  await loadMine();
  await loadGallery();
};

sb.auth.onAuthStateChange(() => refreshAuth());

loadHour();
loadGallery();
refreshAuth();
setInterval(() => {
  $("clock").textContent = fmtClock();
}, 30000);
