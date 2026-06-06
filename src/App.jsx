import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

const FAMILIES = [
  { id: "sarah", name: "Sarah", color: "#E24B4A" },
  { id: "mum", name: "Mum", color: "#185FA5" },
  { id: "matt", name: "Matt", color: "#0F6E56" },
  { id: "nella", name: "Nella", color: "#854F0B" },
];

const CATEGORIES = ["All", "Food & Drink", "Museums", "Outdoors", "Nightlife", "Shopping", "Day Trip", "Other"];

const CAT_STYLES = {
  "Food & Drink": { bg: "#FAEEDA", color: "#854F0B" },
  "Museums":      { bg: "#E6F1FB", color: "#185FA5" },
  "Outdoors":     { bg: "#E1F5EE", color: "#0F6E56" },
  "Nightlife":    { bg: "#FBEAF0", color: "#993556" },
  "Shopping":     { bg: "#EEEDFE", color: "#534AB7" },
  "Day Trip":     { bg: "#EAF3DE", color: "#3B6D11" },
  "Other":        { bg: "#F1EFE8", color: "#5F5E5A" },
};

const THUMB_GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#fda085,#f6d365)",
  "linear-gradient(135deg,#89f7fe,#66a6ff)",
];

function thumbGradient(id) {
  return THUMB_GRADIENTS[Number(id) % THUMB_GRADIENTS.length];
}

function Avatar({ person, size = 28 }) {
  const p = FAMILIES.find(f => f.id === person) || FAMILIES[0];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: p.color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, flexShrink: 0,
      border: "2px solid #fff",
    }}>
      {p.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function CatBadge({ cat }) {
  const s = CAT_STYLES[cat] || CAT_STYLES["Other"];
  return (
    <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: s.bg, color: s.color, fontWeight: 500, whiteSpace: "nowrap" }}>
      {cat}
    </span>
  );
}

function sourceInfo(type) {
  if (type === "instagram") return { label: "Instagram", color: "#C13584" };
  if (type === "tiktok")    return { label: "TikTok",    color: "#000" };
  if (type === "blog")      return { label: "Blog",      color: "#185FA5" };
  return { label: "Link", color: "#5F5E5A" };
}

function sourceEmoji(type) {
  if (type === "instagram") return "📸";
  if (type === "tiktok")    return "🎵";
  if (type === "blog")      return "📖";
  return "🔗";
}

async function callClaude(userMsg, systemMsg) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemMsg,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("API error: " + errText);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function extractFromUrl(url) {
  const system = `You are a travel assistant. Given a URL (Instagram reel, TikTok, blog post, website), extract travel information and return ONLY valid JSON with no markdown or preamble. Make your best educated guess based on the URL and any platform context. Return exactly this shape:
{
  "name": "short place or activity name (max 6 words)",
  "description": "1-2 sentences describing what this is and why it's worth visiting",
  "location": "neighbourhood or district",
  "price": "entry price or typical cost e.g. €12, Free, €8-15 — if unknown say Unknown",
  "duration": "typical visit duration e.g. 1-2 hrs",
  "category": "one of: Food & Drink, Museums, Outdoors, Nightlife, Shopping, Day Trip, Other",
  "tips": "one practical tip for visitors, or empty string",
  "sourceType": "one of: instagram, tiktok, blog, website, other"
}`;
  const raw = await callClaude(`Extract travel info from this URL: ${url}`, system);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

async function suggestNotes(cityName) {
  const system = `You are a travel expert. Return ONLY a JSON array of strings, no markdown, no preamble.`;
  const raw = await callClaude(
    `Give me 6 must-do activities or tips for ${cityName} as a JSON array of short strings (max 8 words each).`,
    system
  );
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch { return []; }
}

export default function App() {
  const [cities, setCities]           = useState([]);
  const [activeCityId, setActiveCityId] = useState(null);
  const [activeTab, setActiveTab]     = useState("inspo");
  const [cards, setCards]             = useState([]);
  const [notes, setNotes]             = useState([]);
  const [catFilter, setCatFilter]     = useState("All");
  const [addingAs, setAddingAs]       = useState("sarah");
  const [url, setUrl]                 = useState("");
  const [extracting, setExtracting]   = useState(false);
  const [preview, setPreview]         = useState(null);
  const [openCard, setOpenCard]       = useState(null);
  const [commentText, setCommentText] = useState("");
  const [newNote, setNewNote]         = useState("");
  const [suggestingNotes, setSuggestingNotes] = useState(false);
  const [addingCity, setAddingCity]   = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newCityEmoji, setNewCityEmoji] = useState("🌍");
  const [loading, setLoading]         = useState(true);
  const noteInputRef = useRef(null);

  // Load cities on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cities").select("*").order("created_at");
      if (data?.length) {
        setCities(data);
        setActiveCityId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  // Load cards + notes when city changes
  useEffect(() => {
    if (!activeCityId) return;
    (async () => {
      const [{ data: cardData }, { data: noteData }] = await Promise.all([
        supabase.from("cards").select("*, comments(*)").eq("city_id", activeCityId).order("created_at", { ascending: false }),
        supabase.from("notes").select("*").eq("city_id", activeCityId).order("created_at"),
      ]);
      setCards(cardData || []);
      setNotes(noteData || []);
    })();
  }, [activeCityId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!activeCityId) return;
    const cardSub = supabase.channel("cards-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards", filter: `city_id=eq.${activeCityId}` }, async () => {
        const { data } = await supabase.from("cards").select("*, comments(*)").eq("city_id", activeCityId).order("created_at", { ascending: false });
        setCards(data || []);
        if (openCard) {
          const updated = (data || []).find(c => c.id === openCard.id);
          if (updated) setOpenCard(updated);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, async () => {
        const { data } = await supabase.from("cards").select("*, comments(*)").eq("city_id", activeCityId).order("created_at", { ascending: false });
        setCards(data || []);
        if (openCard) {
          const updated = (data || []).find(c => c.id === openCard.id);
          if (updated) setOpenCard(updated);
        }
      })
      .subscribe();

    const noteSub = supabase.channel("notes-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `city_id=eq.${activeCityId}` }, async () => {
        const { data } = await supabase.from("notes").select("*").eq("city_id", activeCityId).order("created_at");
        setNotes(data || []);
      })
      .subscribe();

    return () => { supabase.removeChannel(cardSub); supabase.removeChannel(noteSub); };
  }, [activeCityId, openCard?.id]);

  const activeCity = cities.find(c => c.id === activeCityId);
  const filteredCards = cards.filter(c => catFilter === "All" || c.category === catFilter);

  // --- Handlers ---

  async function handleExtract() {
    if (!url.trim()) return;
    setExtracting(true);
    setPreview(null);
    try {
      const info = await extractFromUrl(url.trim());
      if (info) setPreview({ ...info, url: url.trim() });
      else alert("Couldn't extract info — try a different link or check your Anthropic API key.");
    } catch (e) { alert("Something went wrong: " + e.message); }
    setExtracting(false);
  }

  async function handleSaveCard() {
    if (!preview) return;
    await supabase.from("cards").insert({
      city_id: activeCityId,
      name: preview.name,
      description: preview.description,
      location: preview.location,
      price: preview.price,
      duration: preview.duration,
      category: preview.category,
      tips: preview.tips,
      source_type: preview.sourceType,
      url: preview.url,
      added_by: addingAs,
      votes: [],
    });
    setPreview(null);
    setUrl("");
  }

  async function handleVote(card) {
    const alreadyVoted = (card.votes || []).includes(addingAs);
    const newVotes = alreadyVoted
      ? card.votes.filter(v => v !== addingAs)
      : [...(card.votes || []), addingAs];
    await supabase.from("cards").update({ votes: newVotes }).eq("id", card.id);
  }

  async function handleComment(cardId) {
    if (!commentText.trim()) return;
    await supabase.from("comments").insert({ card_id: cardId, author: addingAs, text: commentText.trim() });
    setCommentText("");
  }

  async function handleDeleteCard(cardId) {
    await supabase.from("cards").delete().eq("id", cardId);
    setOpenCard(null);
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    await supabase.from("notes").insert({ city_id: activeCityId, text: newNote.trim(), done: false });
    setNewNote("");
  }

  async function handleToggleNote(note) {
    await supabase.from("notes").update({ done: !note.done }).eq("id", note.id);
  }

  async function handleDeleteNote(noteId) {
    await supabase.from("notes").delete().eq("id", noteId);
  }

  async function handleSuggestNotes() {
    setSuggestingNotes(true);
    try {
      const suggestions = await suggestNotes(activeCity.name);
      for (const text of suggestions) {
        await supabase.from("notes").insert({ city_id: activeCityId, text, done: false });
      }
    } catch {}
    setSuggestingNotes(false);
  }

  async function handleAddCity() {
    if (!newCityName.trim()) return;
    const id = newCityName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    await supabase.from("cities").insert({ id, name: newCityName.trim(), emoji: newCityEmoji, country: "" });
    const { data } = await supabase.from("cities").select("*").order("created_at");
    setCities(data || []);
    setActiveCityId(id);
    setAddingCity(false);
    setNewCityName("");
    setNewCityEmoji("🌍");
  }

  // --- Styles ---
  const btn = (active, color = "#E24B4A") => ({
    padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer",
    fontSize: 14, fontWeight: 500, transition: "all 0.15s",
    background: active ? color : "#f0ece8",
    color: active ? "#fff" : "#666",
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 16, color: "#888" }}>
      Loading tripinspo...
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 0 18px", borderBottom: "1px solid #ede9e4", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: "#1a1a1a" }}>
          trip<span style={{ color: "#E24B4A" }}>inspo</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#999" }}>Adding as</span>
          <select value={addingAs} onChange={e => setAddingAs(e.target.value)}
            style={{ fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "5px 10px", background: "#fff", color: "#1a1a1a", cursor: "pointer" }}>
            {FAMILIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div style={{ display: "flex" }}>
            {FAMILIES.map((f, i) => (
              <div key={f.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 4 - i }}>
                <Avatar person={f.id} size={30} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* City pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
        {cities.map(c => (
          <button key={c.id} onClick={() => { setActiveCityId(c.id); setCatFilter("All"); setActiveTab("inspo"); }}
            style={btn(activeCityId === c.id)}>
            {c.emoji} {c.name}
          </button>
        ))}
        {addingCity ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={newCityEmoji} onChange={e => setNewCityEmoji(e.target.value)}
              style={{ width: 42, fontSize: 18, textAlign: "center", border: "1px solid #e0dbd5", borderRadius: 8, padding: "6px 4px" }} />
            <input value={newCityName} onChange={e => setNewCityName(e.target.value)} placeholder="City name"
              onKeyDown={e => e.key === "Enter" && handleAddCity()}
              style={{ fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "7px 12px", width: 140 }} />
            <button onClick={handleAddCity}
              style={{ padding: "7px 14px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Add</button>
            <button onClick={() => setAddingCity(false)}
              style={{ padding: "7px 10px", background: "#f0ece8", color: "#666", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingCity(true)}
            style={{ padding: "8px 14px", borderRadius: 99, border: "1px dashed #ccc", background: "transparent", cursor: "pointer", fontSize: 13, color: "#999" }}>
            + city
          </button>
        )}
      </div>

      {/* Sub tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #ede9e4", marginBottom: 28 }}>
        {[
          { id: "inspo", label: `✨ Inspo${cards.length ? ` (${cards.length})` : ""}` },
          { id: "notes", label: "📋 City notes" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 22px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 14, fontWeight: 500, marginBottom: -1,
              color: activeTab === tab.id ? "#E24B4A" : "#888",
              borderBottom: activeTab === tab.id ? "2px solid #E24B4A" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── INSPO TAB ── */}
      {activeTab === "inspo" && (
        <>
          {/* Add link box */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, marginBottom: 30, border: "1px solid #ede9e4" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#666", marginBottom: 12 }}>
              Drop a link from Instagram, TikTok, a blog, or anywhere ✨
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleExtract()}
                placeholder="https://www.instagram.com/reel/..."
                style={{ flex: 1, fontSize: 14, border: "1px solid #e0dbd5", borderRadius: 10, padding: "11px 14px", background: "#faf8f6" }} />
              <button onClick={handleExtract} disabled={extracting || !url.trim()}
                style={{ padding: "11px 22px", background: extracting ? "#ddd" : "#E24B4A", color: "#fff", border: "none", borderRadius: 10, cursor: extracting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                {extracting ? "Fetching..." : "Add →"}
              </button>
            </div>
            {extracting && <div style={{ marginTop: 10, fontSize: 12, color: "#E24B4A" }}>✨ AI is extracting details from the link...</div>}

            {/* Preview */}
            {preview && (
              <div style={{ marginTop: 18, background: "#faf8f6", borderRadius: 12, border: "1px solid #e0dbd5", padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#E24B4A", letterSpacing: 0.5, marginBottom: 14 }}>PREVIEW — edit anything before saving</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  {[
                    { key: "name", label: "Name" },
                    { key: "location", label: "Location" },
                    { key: "price", label: "Price" },
                    { key: "duration", label: "Duration" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{label}</div>
                      <input value={preview[key] || ""} onChange={e => setPreview(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: "100%", fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "7px 10px", background: "#fff", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Category</div>
                  <select value={preview.category} onChange={e => setPreview(p => ({ ...p, category: e.target.value }))}
                    style={{ width: "100%", fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "7px 10px", background: "#fff" }}>
                    {CATEGORIES.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Description</div>
                  <textarea value={preview.description || ""} onChange={e => setPreview(p => ({ ...p, description: e.target.value }))} rows={2}
                    style={{ width: "100%", fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "7px 10px", background: "#fff", resize: "vertical", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Tip</div>
                  <input value={preview.tips || ""} onChange={e => setPreview(p => ({ ...p, tips: e.target.value }))}
                    style={{ width: "100%", fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 8, padding: "7px 10px", background: "#fff", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSaveCard}
                    style={{ flex: 1, padding: "11px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                    Save to {activeCity?.name} ✓
                  </button>
                  <button onClick={() => { setPreview(null); setUrl(""); }}
                    style={{ padding: "11px 16px", background: "#f0ece8", color: "#666", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Category filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                style={{ padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, background: catFilter === cat ? "#1a1a1a" : "#f0ece8", color: catFilter === cat ? "#fff" : "#666" }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Cards */}
          {filteredCards.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 20px", color: "#bbb" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>{activeCity?.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#999" }}>No inspo yet for {activeCity?.name}</div>
              <div style={{ fontSize: 13, color: "#bbb", marginTop: 6 }}>Drop a link above to get started!</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
              {filteredCards.map(card => {
                const src = sourceInfo(card.source_type);
                const voted = (card.votes || []).includes(addingAs);
                return (
                  <div key={card.id} onClick={() => setOpenCard(card)}
                    style={{ background: "#fff", borderRadius: 16, border: "1px solid #ede9e4", overflow: "hidden", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                    <div style={{ height: 130, background: thumbGradient(card.id), position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 34 }}>{sourceEmoji(card.source_type)}</span>
                      <div style={{ position: "absolute", top: 9, left: 9, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "rgba(255,255,255,0.92)", color: src.color }}>
                        {src.label}
                      </div>
                      <div style={{ position: "absolute", bottom: 9, right: 9 }}>
                        <Avatar person={card.added_by} size={26} />
                      </div>
                    </div>
                    <div style={{ padding: "13px 15px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 7, lineHeight: 1.35 }}>{card.name}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <CatBadge cat={card.category} />
                        {card.location && <span style={{ fontSize: 11, color: "#999" }}>📍 {card.location}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#999", marginBottom: 10 }}>
                        {card.price && card.price !== "Unknown" && <span>💰 {card.price}</span>}
                        {card.duration && <span>⏱ {card.duration}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <button onClick={e => { e.stopPropagation(); handleVote(card); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, border: "none", background: "none", cursor: "pointer", color: voted ? "#E24B4A" : "#bbb", padding: 0 }}>
                          {voted ? "❤️" : "🤍"} {card.votes?.length || 0}
                        </button>
                        <span style={{ fontSize: 12, color: "#bbb" }}>💬 {card.comments?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── NOTES TAB ── */}
      {activeTab === "notes" && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "#1a1a1a" }}>
              {activeCity?.emoji} {activeCity?.name} — things to do
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={handleSuggestNotes} disabled={suggestingNotes}
              style={{ fontSize: 12, padding: "7px 16px", borderRadius: 99, border: "1px solid #e0dbd5", background: "#fff", color: "#555", cursor: suggestingNotes ? "not-allowed" : "pointer" }}>
              {suggestingNotes ? "Thinking..." : "✨ AI suggest ideas"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
            <input ref={noteInputRef} value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddNote()}
              placeholder="Add something to do or see..."
              style={{ flex: 1, fontSize: 14, border: "1px solid #e0dbd5", borderRadius: 10, padding: "11px 14px", background: "#fff" }} />
            <button onClick={handleAddNote}
              style={{ padding: "11px 20px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>
              + Add
            </button>
          </div>

          {notes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 14, color: "#999" }}>No notes yet — add something or let AI suggest ideas</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {notes.filter(n => !n.done).map(note => (
                <div key={note.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "#fff", borderRadius: 12, border: "1px solid #ede9e4" }}>
                  <input type="checkbox" checked={false} onChange={() => handleToggleNote(note)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#E24B4A", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#1a1a1a" }}>{note.text}</span>
                  <button onClick={() => handleDeleteNote(note.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#ddd", padding: "0 2px" }}>✕</button>
                </div>
              ))}
              {notes.filter(n => n.done).length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: "#bbb", margin: "14px 0 6px", fontWeight: 600, letterSpacing: 0.5 }}>DONE ✓</div>
                  {notes.filter(n => n.done).map(note => (
                    <div key={note.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: "#faf8f6", borderRadius: 12, border: "1px solid #ede9e4" }}>
                      <input type="checkbox" checked onChange={() => handleToggleNote(note)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#E24B4A", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, color: "#bbb", textDecoration: "line-through" }}>{note.text}</span>
                      <button onClick={() => handleDeleteNote(note.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#ddd", padding: "0 2px" }}>✕</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CARD MODAL ── */}
      {openCard && (
        <div onClick={() => { setOpenCard(null); setCommentText(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 22, width: "100%", maxWidth: 540, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ height: 190, background: thumbGradient(openCard.id), borderRadius: "22px 22px 0 0", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 52 }}>{sourceEmoji(openCard.source_type)}</span>
              <button onClick={() => { setOpenCard(null); setCommentText(""); }}
                style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.22)", border: "none", borderRadius: "50%", width: 34, height: 34, cursor: "pointer", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✕
              </button>
              <div style={{ position: "absolute", bottom: 12, left: 16 }}>
                <Avatar person={openCard.added_by} size={34} />
              </div>
              <div style={{ position: "absolute", top: 14, left: 14, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.92)", color: sourceInfo(openCard.source_type).color }}>
                {sourceInfo(openCard.source_type).label}
              </div>
            </div>

            <div style={{ padding: "22px 26px" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#1a1a1a", marginBottom: 10, lineHeight: 1.2 }}>{openCard.name}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <CatBadge cat={openCard.category} />
                {openCard.location && <span style={{ fontSize: 12, color: "#999" }}>📍 {openCard.location}</span>}
              </div>
              {openCard.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.65, marginBottom: 18 }}>{openCard.description}</p>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {openCard.price && openCard.price !== "Unknown" && (
                  <div style={{ background: "#faf8f6", borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 3 }}>Entry / Cost</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>{openCard.price}</div>
                  </div>
                )}
                {openCard.duration && (
                  <div style={{ background: "#faf8f6", borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 3 }}>Time needed</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>{openCard.duration}</div>
                  </div>
                )}
              </div>

              {openCard.tips && (
                <div style={{ background: "#fff8f0", border: "1px solid #fde8c8", borderRadius: 10, padding: "11px 14px", marginBottom: 16, fontSize: 13, color: "#854F0B", lineHeight: 1.5 }}>
                  💡 {openCard.tips}
                </div>
              )}

              <a href={openCard.url} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "#E24B4A", textDecoration: "none", marginBottom: 22 }}>
                🔗 View original {sourceInfo(openCard.source_type).label} post ↗
              </a>

              {/* Votes */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, paddingBottom: 22, borderBottom: "1px solid #f0ece8" }}>
                <button onClick={() => handleVote(openCard)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", border: "none", borderRadius: 99, cursor: "pointer", fontSize: 14, fontWeight: 500, background: (openCard.votes || []).includes(addingAs) ? "#FCEBEB" : "#f0ece8", color: (openCard.votes || []).includes(addingAs) ? "#E24B4A" : "#666" }}>
                  {(openCard.votes || []).includes(addingAs) ? "❤️" : "🤍"} {openCard.votes?.length || 0} {openCard.votes?.length === 1 ? "love" : "loves"}
                </button>
                <div style={{ display: "flex" }}>
                  {(openCard.votes || []).map((v, i) => (
                    <div key={v} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                      <Avatar person={v} size={26} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Comments */}
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Comments</div>
              {(openCard.comments || []).length === 0 && (
                <div style={{ fontSize: 13, color: "#bbb", marginBottom: 16 }}>No comments yet — be the first!</div>
              )}
              {(openCard.comments || []).map(c => (
                <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <Avatar person={c.author} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{FAMILIES.find(f => f.id === c.author)?.name}</div>
                    <div style={{ fontSize: 13, color: "#1a1a1a", background: "#faf8f6", borderRadius: 10, padding: "9px 13px", lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Avatar person={addingAs} size={32} />
                <input value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleComment(openCard.id)}
                  placeholder="Add a comment..."
                  style={{ flex: 1, fontSize: 13, border: "1px solid #e0dbd5", borderRadius: 10, padding: "9px 13px" }} />
                <button onClick={() => handleComment(openCard.id)}
                  style={{ padding: "9px 16px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                  Post
                </button>
              </div>

              <button onClick={() => handleDeleteCard(openCard.id)}
                style={{ marginTop: 22, fontSize: 12, color: "#ddd", background: "none", border: "none", cursor: "pointer" }}>
                Remove this card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
