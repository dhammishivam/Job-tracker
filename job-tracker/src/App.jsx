import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "shivam-job-tracker-v1";

const STATUS_CONFIG = {
  saved:     { label: "Saved",     bg: "#1a1a2e", accent: "#4a4a7a", text: "#a0a0d0" },
  applied:   { label: "Applied",   bg: "#0d2137", accent: "#1a6b9e", text: "#5bb8f5" },
  interview: { label: "Interview", bg: "#1f1400", accent: "#7a4f00", text: "#f5a623" },
  offer:     { label: "Offer",     bg: "#001a0d", accent: "#0a6b2e", text: "#3dd68c" },
  rejected:  { label: "Rejected",  bg: "#1f0808", accent: "#7a1a1a", text: "#f56565" },
};

const PLATFORMS = ["LinkedIn", "Naukri", "Instahyre", "Referral", "Direct"];
const today = () => new Date().toISOString().split("T")[0];
const fmt = (d) => { if (!d) return "—"; const [y,m,day] = d.split("-"); return `${day}/${m}/${y}`; };
const isOverdue = (d) => d && new Date(d) < new Date(new Date().toDateString());

function StatusBadge({ status, onChange, id }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cfg = STATUS_CONFIG[status];
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.accent}`,
        borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
        cursor: "pointer", letterSpacing: "0.06em", fontFamily: "inherit", textTransform: "uppercase",
      }}>{cfg.label} ▾</button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 999,
          background: "#0f0f17", border: "1px solid #2a2a3e", borderRadius: 8,
          overflow: "hidden", minWidth: 130, boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
        }}>
          {Object.entries(STATUS_CONFIG).map(([val, c]) => (
            <button key={val} onClick={() => { onChange(id, val); setOpen(false); }} style={{
              display: "block", width: "100%", padding: "9px 14px", textAlign: "left",
              background: val === status ? c.bg : "transparent", color: c.text,
              border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              fontWeight: val === status ? 700 : 400, letterSpacing: "0.04em", textTransform: "uppercase",
              transition: "background 0.1s",
            }}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlat, setFilterPlat] = useState("");
  const [search, setSearch] = useState("");
  const [notesModal, setNotesModal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company: "", role: "", platform: "LinkedIn", date: today(), status: "saved", followup: "", notes: "" });

  const [scrapedJobs, setScrapedJobs] = useState(null);
  const [scrapeTime, setScrapeTime] = useState(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState(null);
  const [showScraped, setShowScraped] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const d = JSON.parse(raw); setJobs(d.jobs || []); setNextId(d.nextId || 1); }
    } catch {}
  }, []);

  // Load cached scrape results from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("scrape-cache");
      if (raw) {
        const { jobs, time } = JSON.parse(raw);
        setScrapedJobs(jobs); setScrapeTime(time); setShowScraped(true);
      }
    } catch {}
  }, []);

  const pollRef = useRef(null);
  const runMetaRef = useRef(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const checkStatus = async () => {
    const meta = runMetaRef.current;
    if (!meta) return;
    try {
      const res = await fetch(`/api/scrape-jobs?runId=${meta.runId}&datasetId=${meta.datasetId}`);
      const data = await res.json();
      if (data.status === "done") {
        setScrapedJobs(data.jobs);
        const t = Date.now();
        setScrapeTime(t);
        setShowScraped(true);
        setScraping(false);
        stopPolling();
        runMetaRef.current = null;
        try { localStorage.setItem("scrape-cache", JSON.stringify({ jobs: data.jobs, time: t })); } catch {}
      } else if (data.status === "failed") {
        setScrapeError(data.error || "Scrape failed");
        setScraping(false);
        stopPolling();
        runMetaRef.current = null;
      }
    } catch {}
  };

  const scrapeJobs = async () => {
    setScraping(true);
    setScrapeError(null);
    try {
      const res = await fetch("/api/scrape-jobs", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");
      runMetaRef.current = { runId: data.runId, datasetId: data.datasetId };
      stopPolling();
      pollRef.current = setInterval(checkStatus, 8000);
    } catch (e) {
      setScrapeError(e.message);
      setScraping(false);
    }
  };

  const persist = (newJobs, newNextId) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: newJobs, nextId: newNextId })); } catch {}
  };

  const addJob = () => {
    if (!form.company.trim() || !form.role.trim()) return;
    const newJobs = [{ ...form, id: nextId }, ...jobs];
    const newNextId = nextId + 1;
    setJobs(newJobs); setNextId(newNextId);
    setForm({ company: "", role: "", platform: "LinkedIn", date: today(), status: "saved", followup: "", notes: "" });
    setShowForm(false);
    persist(newJobs, newNextId);
  };

  const updateStatus = (id, status) => {
    const newJobs = jobs.map(j => j.id === id ? { ...j, status } : j);
    setJobs(newJobs); persist(newJobs, nextId);
  };

  const deleteJob = (id) => {
    const newJobs = jobs.filter(j => j.id !== id);
    setJobs(newJobs); persist(newJobs, nextId);
  };

  const exportCSV = () => {
    const header = "Company,Role,Platform,Date Applied,Status,Follow-up,Notes";
    const rows = jobs.map(j => [j.company, j.role, j.platform, j.date, j.status, j.followup, `"${(j.notes||'').replace(/"/g,'""')}"`].join(","));
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "job-tracker.csv"; a.click();
  };

  const filtered = jobs.filter(j =>
    (!filterStatus || j.status === filterStatus) &&
    (!filterPlat || j.platform === filterPlat) &&
    (!search || j.company.toLowerCase().includes(search.toLowerCase()) || j.role.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = Object.keys(STATUS_CONFIG).reduce((a, k) => ({ ...a, [k]: jobs.filter(j => j.status === k).length }), {});

  const inp = { background: "#0a0a12", border: "1px solid #1e1e2e", borderRadius: 7, color: "#c0c0e0", padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "#555577", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4, display: "block" };

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", padding: "32px 28px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: "#404060", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Shivam Dhammi</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e0e0ff", margin: 0, letterSpacing: "-0.03em" }}>Job Tracker</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={scrapeJobs} disabled={scraping} style={{
            background: scraping ? "#0d1a0d" : "#0d1a0d", border: `1px solid ${scraping ? "#1a4a1a" : "#1e4a1e"}`,
            borderRadius: 8, color: scraping ? "#3a7a3a" : "#3dd68c", padding: "8px 16px", fontSize: 12,
            cursor: scraping ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600,
            letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6, opacity: scraping ? 0.7 : 1,
          }}>
            {scraping ? "⏳ Scraping…" : "⚡ Scrape LinkedIn Jobs"}
          </button>
          <button onClick={exportCSV} style={{
            background: "transparent", border: "1px solid #1e1e2e", borderRadius: 8,
            color: "#555577", padding: "8px 16px", fontSize: 12, cursor: "pointer",
            fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.04em",
            display: "flex", alignItems: "center", gap: 6,
          }}>↓ Export CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        {[
          { label: "Total", val: jobs.length, color: "#e0e0ff" },
          { label: "Applied", val: counts.applied, color: "#5bb8f5" },
          { label: "Interviews", val: counts.interview, color: "#f5a623" },
          { label: "Offers", val: counts.offer, color: "#3dd68c" },
          { label: "Rejected", val: counts.rejected, color: "#f56565" },
        ].map(s => (
          <div key={s.label} style={{ background: "#0f0f17", border: "1px solid #1a1a2a", borderRadius: 10, padding: "14px 20px", flex: 1, minWidth: 90 }}>
            <div style={{ fontSize: 11, color: "#404060", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Add form toggle */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{
          width: "100%", background: "transparent", border: "1px dashed #1e1e2e",
          borderRadius: 10, color: "#404060", padding: "13px", fontSize: 13,
          cursor: "pointer", fontFamily: "inherit", marginBottom: 20, transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.target.style.borderColor = "#4040a0"; e.target.style.color = "#8080c0"; }}
          onMouseLeave={e => { e.target.style.borderColor = "#1e1e2e"; e.target.style.color = "#404060"; }}
        >+ Add new application</button>
      ) : (
        <div style={{ background: "#0d0d1a", border: "1px solid #1e1e2e", borderRadius: 12, padding: "20px 22px", marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. CRED" /></div>
            <div><label style={lbl}>Role</label><input style={inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Senior Android Dev" /></div>
            <div><label style={lbl}>Platform</label>
              <select style={inp} value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div><label style={lbl}>Date applied</label><input style={inp} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label style={lbl}>Status</label>
              <select style={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Follow-up date</label><input style={inp} type="date" value={form.followup} onChange={e => setForm(f => ({ ...f, followup: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, height: 64, resize: "none" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="JD link, recruiter name, salary range, CTC..." />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={addJob} style={{ background: "#151535", border: "1px solid #3030a0", borderRadius: 8, color: "#9090ff", padding: "10px 24px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Add application</button>
            <button onClick={() => setShowForm(false)} style={{ background: "transparent", border: "1px solid #1a1a2a", borderRadius: 8, color: "#404060", padding: "10px 18px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...inp, flex: 2, minWidth: 150, width: "auto" }} placeholder="Search company or role…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, flex: 1, minWidth: 130, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select style={{ ...inp, flex: 1, minWidth: 120, width: "auto" }} value={filterPlat} onChange={e => setFilterPlat(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#0a0a12", border: "1px solid #1a1a2a", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #141424" }}>
              {["Company","Role","Platform","Applied","Status","Follow-up",""].map((h,i) => (
                <th key={i} style={{ padding: "12px 16px", textAlign: "left", color: "#333355", fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", width: ["21%","20%","12%","11%","15%","13%","8%"][i] }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "48px", textAlign: "center", color: "#2a2a4a", fontSize: 14 }}>
                {jobs.length ? "No matches — clear filters." : "No applications yet. Add your first one above!"}
              </td></tr>
            ) : filtered.map(j => (
              <tr key={j.id} style={{ borderBottom: "1px solid #0d0d1a" }}
                onMouseEnter={e => e.currentTarget.style.background = "#0d0d1a"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "13px 16px", fontWeight: 600, color: "#d0d0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.company}</td>
                <td style={{ padding: "13px 16px", color: "#6060a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.role}</td>
                <td style={{ padding: "13px 16px" }}><span style={{ background: "#131325", color: "#4040a0", borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{j.platform}</span></td>
                <td style={{ padding: "13px 16px", color: "#404060", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(j.date)}</td>
                <td style={{ padding: "13px 16px" }}><StatusBadge status={j.status} onChange={updateStatus} id={j.id} /></td>
                <td style={{ padding: "13px 16px", color: isOverdue(j.followup) ? "#f56565" : "#404060", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(j.followup)}{isOverdue(j.followup) ? " ⚠" : ""}</td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {j.notes && <button onClick={() => setNotesModal(j)} title="Notes" style={{ background: "none", border: "none", cursor: "pointer", color: "#404060", fontSize: 14, padding: "2px 4px" }}>📋</button>}
                    <button onClick={() => deleteJob(j.id)} title="Delete"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a4a", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}
                      onMouseEnter={e => e.target.style.color = "#f56565"}
                      onMouseLeave={e => e.target.style.color = "#2a2a4a"}
                    >✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scrape error */}
      {scrapeError && (
        <div style={{ marginTop: 16, background: "#1f0808", border: "1px solid #7a1a1a", borderRadius: 10, padding: "12px 18px", color: "#f56565", fontSize: 13 }}>
          <strong>Scrape error:</strong> {scrapeError}
        </div>
      )}

      {/* Scraped LinkedIn Jobs */}
      {(scrapedJobs !== null) && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e0ff", margin: 0, letterSpacing: "-0.02em" }}>
                LinkedIn Jobs — Senior Android Developer · India
              </h2>
              {scrapeTime && (
                <span style={{ fontSize: 11, color: "#404060", fontWeight: 500 }}>
                  Last scraped {new Date(scrapeTime).toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 11, background: "#0d1a0d", color: "#3dd68c", border: "1px solid #1e4a1e", borderRadius: 5, padding: "2px 8px", fontWeight: 600 }}>
                {scrapedJobs.length} results
              </span>
            </div>
            <button onClick={() => setShowScraped(v => !v)} style={{
              background: "transparent", border: "1px solid #1e1e2e", borderRadius: 7,
              color: "#404060", padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>
              {showScraped ? "Hide" : "Show"}
            </button>
          </div>

          {showScraped && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {scrapedJobs.length === 0 ? (
                <div style={{ color: "#404060", fontSize: 13, gridColumn: "1/-1", padding: "24px 0" }}>No results returned. The actor may use different field names — check the Apify console.</div>
              ) : scrapedJobs.map((job, i) => (
                <div key={i} style={{ background: "#0a0a12", border: "1px solid #1a1a2a", borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#d0d0f0", lineHeight: 1.3 }}>{job.title || "Untitled"}</div>
                  <div style={{ fontSize: 13, color: "#5bb8f5", fontWeight: 600 }}>{job.company || "—"}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                    {job.location && (
                      <span style={{ fontSize: 11, color: "#555577" }}>📍 {job.location}</span>
                    )}
                    {job.postedAt && (
                      <span style={{ fontSize: 11, color: "#555577" }}>🕐 {job.postedAt}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    {job.applyUrl ? (
                      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" style={{
                        fontSize: 12, fontWeight: 600, color: "#9090ff", background: "#131325",
                        border: "1px solid #2020a0", borderRadius: 7, padding: "6px 14px",
                        textDecoration: "none", display: "inline-block",
                      }}>Apply →</a>
                    ) : (
                      <span style={{ fontSize: 12, color: "#2a2a4a" }}>No link</span>
                    )}
                    <button onClick={() => {
                      setForm(f => ({ ...f, company: job.company || "", role: job.title || "", platform: "LinkedIn", date: today(), status: "saved" }));
                      setShowForm(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }} style={{
                      fontSize: 12, color: "#555577", background: "transparent",
                      border: "1px solid #1a1a2a", borderRadius: 7, padding: "6px 12px",
                      cursor: "pointer", fontFamily: "inherit",
                    }}>+ Track</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes modal */}
      {notesModal && (
        <div onClick={() => setNotesModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d1a", border: "1px solid #1e1e2e", borderRadius: 14, padding: "26px 30px", maxWidth: 440, width: "90%", boxShadow: "0 32px 80px rgba(0,0,0,0.9)" }}>
            <div style={{ fontSize: 11, color: "#404060", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{notesModal.company}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#e0e0ff", marginBottom: 18 }}>{notesModal.role}</div>
            <p style={{ color: "#8080b0", fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{notesModal.notes}</p>
            <button onClick={() => setNotesModal(null)} style={{ marginTop: 22, background: "#131325", border: "1px solid #2020a0", borderRadius: 8, color: "#6060c0", padding: "9px 22px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
