/**
 * Learning Hub — Dashboard Plugin
 *
 * SCORM extraction operations center. Provides:
 *   • Extractor tab — queue extractions, watch progress, preview results
 *   • Library tab — browse extracted modules with metadata
 *   • Query tab — full-text search across all extracted content
 *
 * Slot injections:
 *   • sidebar    — Live stats panel (total modules, last engine, queue status)
 *   • footer-right — "Learning Hub v1.0 — Content ready for RAG"
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const { React } = SDK;
  const { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label, Select, Separator, Tabs, TabsList, TabsTrigger } = SDK.components;
  const { useState, useEffect, useCallback, useRef } = SDK.hooks;
  const { cn } = SDK.utils;

  const API_BASE = "/api/plugins/learning-hub";

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  function cssVar(name) {
    if (typeof document === "undefined") return "";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  // -----------------------------------------------------------------------
  // Sidebar Slot — Live Stats
  // -----------------------------------------------------------------------

  function SidebarSlot() {
    const [stats, setStats] = useState({ total: 0, lastEngine: "—", lastTitle: "—", lastAt: null });

    useEffect(function () {
      let mounted = true;
      function fetchStats() {
        SDK.fetchJSON(API_BASE + "/library")
          .then(function (data) {
            if (!mounted) return;
            const items = data.items || [];
            const last = items[items.length - 1];
            setStats({
              total: items.length,
              lastEngine: last ? last.engine : "—",
              lastTitle: last ? last.title : "—",
              lastAt: last ? last.extracted_at : null,
            });
          })
          .catch(function () { /* silent */ });
      }
      fetchStats();
      const id = setInterval(fetchStats, 5000);
      return function () { mounted = false; clearInterval(id); };
    }, []);

    const accent = cssVar("--theme-color-primary") || "#00d4aa";

    return React.createElement("div", { className: "flex flex-col gap-4 p-3" },
      React.createElement("div", { className: "text-xs uppercase tracking-widest opacity-60", style: { fontFamily: cssVar("--theme-font-mono") } }, "Hub Status"),
      React.createElement("div", { className: "flex flex-col gap-3" },
        React.createElement(StatChip, { label: "Modules", value: stats.total, color: accent }),
        React.createElement(StatChip, { label: "Last Engine", value: stats.lastEngine, color: accent }),
        React.createElement("div", { className: "flex flex-col gap-1" },
          React.createElement("span", { className: "text-[0.65rem] uppercase tracking-wider opacity-50" }, "Latest"),
          React.createElement("span", { className: "text-sm font-medium leading-tight" }, stats.lastTitle),
          React.createElement("span", { className: "text-[0.65rem] opacity-40" }, timeAgo(stats.lastAt)),
        ),
      ),
    );
  }

  function StatChip(props) {
    return React.createElement("div", { className: "flex items-center justify-between border border-border/40 px-3 py-2" },
      React.createElement("span", { className: "text-[0.65rem] uppercase tracking-wider opacity-60" }, props.label),
      React.createElement("span", { className: "text-sm font-bold", style: { color: props.color } }, props.value),
    );
  }

  // -----------------------------------------------------------------------
  // Footer Slot
  // -----------------------------------------------------------------------

  function FooterSlot() {
    return React.createElement("span", { className: "text-[0.65rem] opacity-50 tracking-wider" },
      "Learning Hub v1.0 — Content ready for RAG"
    );
  }

  // -----------------------------------------------------------------------
  // Extractor Tab
  // -----------------------------------------------------------------------

  function ExtractorTab() {
    const [url, setUrl] = useState("");
    const [engine, setEngine] = useState("auto");
    const [maxSlides, setMaxSlides] = useState(100);
    const [job, setJob] = useState(null);
    const [polling, setPolling] = useState(false);
    const pollRef = useRef(null);

    const startExtraction = useCallback(function () {
      if (!url.trim()) return;
      setJob({ status: "queued", id: null });
      setPolling(true);
      SDK.fetchJSON(API_BASE + "/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), engine, max_slides: maxSlides }),
      })
        .then(function (data) {
          setJob({ status: "queued", id: data.job_id });
        })
        .catch(function (err) {
          setJob({ status: "failed", error: err.message || "Network error" });
          setPolling(false);
        });
    }, [url, engine, maxSlides]);

    useEffect(function () {
      if (!polling || !job || !job.id) return;
      pollRef.current = setInterval(function () {
        SDK.fetchJSON(API_BASE + "/jobs/" + job.id)
          .then(function (data) {
            setJob(data);
            if (data.status === "completed" || data.status === "failed") {
              setPolling(false);
              clearInterval(pollRef.current);
            }
          })
          .catch(function () { /* keep polling */ });
      }, 1200);
      return function () { clearInterval(pollRef.current); };
    }, [polling, job && job.id]);

    const accent = cssVar("--theme-color-primary") || "#00d4aa";
    const gold = cssVar("--theme-color-accent") || "#ffd700";

    return React.createElement("div", { className: "flex flex-col gap-6" },
      // Input card
      React.createElement(Card, { className: "card-notched" },
        React.createElement(CardHeader, null,
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement(CardTitle, { className: "text-lg" }, "SCORM Extractor"),
            React.createElement(Badge, { variant: "outline", style: { borderColor: accent, color: accent } }, "v1.0"),
          ),
        ),
        React.createElement(CardContent, { className: "flex flex-col gap-4" },
          React.createElement("div", { className: "flex flex-col gap-1" },
            React.createElement(Label, { className: "text-xs uppercase tracking-wider opacity-70" }, "Module URL"),
            React.createElement(Input, {
              placeholder: "https://articulate.com/demo/scorm-course",
              value: url,
              onChange: function (e) { setUrl(e.target.value); },
              className: "font-mono text-sm bg-background/50",
            }),
          ),
          React.createElement("div", { className: "grid grid-cols-2 gap-4" },
            React.createElement("div", { className: "flex flex-col gap-1" },
              React.createElement(Label, { className: "text-xs uppercase tracking-wider opacity-70" }, "Engine"),
              React.createElement(Select, {
                value: engine,
                onValueChange: setEngine,
              },
                React.createElement("option", { value: "auto" }, "Auto (CDP → Generic fallback)"),
                React.createElement("option", { value: "cdp" }, "CDP Passthrough"),
                React.createElement("option", { value: "generic" }, "Generic HTML"),
              ),
            ),
            React.createElement("div", { className: "flex flex-col gap-1" },
              React.createElement(Label, { className: "text-xs uppercase tracking-wider opacity-70" }, "Max Slides"),
              React.createElement(Input, {
                type: "number",
                min: 1,
                max: 1000,
                value: maxSlides,
                onChange: function (e) { setMaxSlides(parseInt(e.target.value) || 100); },
                className: "font-mono text-sm bg-background/50",
              }),
            ),
          ),
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement(Button, {
              onClick: startExtraction,
              disabled: !url.trim() || polling,
              className: cn(
                "inline-flex items-center gap-2 border px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
                polling ? "opacity-60" : "hover:bg-foreground/10",
              ),
              style: { borderColor: accent, color: accent },
            }, polling ? "Extracting..." : "Start Extraction"),
            job && job.status && React.createElement(StatusBadge, { status: job.status }),
          ),
        ),
      ),

      // Progress / Results
      job && job.status === "running" && React.createElement(Card, null,
        React.createElement(CardContent, { className: "flex flex-col gap-3 py-6" },
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement("span", { className: "relative flex h-3 w-3" },
              React.createElement("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", style: { backgroundColor: accent } }),
              React.createElement("span", { className: "relative inline-flex rounded-full h-3 w-3", style: { backgroundColor: accent } }),
            ),
            React.createElement("span", { className: "text-sm font-mono cursor-blink" }, "Extraction in progress…"),
          ),
          React.createElement("div", { className: "h-1 w-full bg-border/30 overflow-hidden" },
            React.createElement("div", { className: "h-full animate-pulse", style: { width: "60%", backgroundColor: accent } }),
          ),
          React.createElement("span", { className: "text-[0.65rem] font-mono opacity-50" }, "Job ID: ", job.id),
        ),
      ),

      job && job.status === "completed" && job.result && React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement("div", { className: "flex items-center justify-between" },
            React.createElement(CardTitle, { className: "text-base" }, job.result.title || "Extraction Complete"),
            React.createElement(Badge, { style: { backgroundColor: accent, color: "#000" } }, job.result.engine),
          ),
        ),
        React.createElement(CardContent, { className: "flex flex-col gap-4" },
          React.createElement("div", { className: "grid grid-cols-3 gap-3" },
            React.createElement(MiniStat, { label: "Slides", value: job.result.slides_found }),
            React.createElement(MiniStat, { label: "Engine", value: job.result.engine }),
            React.createElement(MiniStat, { label: "Source", value: new URL(job.result.source_url).hostname }),
          ),
          React.createElement(Separator, null),
          React.createElement("div", { className: "flex flex-col gap-2" },
            React.createElement("span", { className: "text-xs uppercase tracking-wider opacity-60" }, "Preview"),
            React.createElement("div", { className: "max-h-64 overflow-y-auto border border-border/40 p-3 font-mono text-xs leading-relaxed opacity-90" },
              (job.result.slides || []).slice(0, 3).map(function (s, i) {
                return React.createElement("div", { key: i, className: "mb-3" },
                  React.createElement("span", { style: { color: gold } }, "Slide ", s.slide),
                  React.createElement("p", { className: "mt-1 opacity-80" }, s.text.slice(0, 300) + (s.text.length > 300 ? "…" : "")),
                );
              }),
              (job.result.slides || []).length > 3 && React.createElement("span", { className: "opacity-40 italic" }, "+ ", job.result.slides.length - 3, " more slides"),
            ),
          ),
        ),
      ),

      job && job.status === "failed" && React.createElement(Card, null,
        React.createElement(CardContent, { className: "py-6" },
          React.createElement("div", { className: "text-sm text-danger" }, "Extraction failed: ", job.error || "Unknown error"),
        ),
      ),
    );
  }

  function MiniStat(props) {
    return React.createElement("div", { className: "flex flex-col gap-1 border border-border/30 p-3" },
      React.createElement("span", { className: "text-[0.6rem] uppercase tracking-wider opacity-50" }, props.label),
      React.createElement("span", { className: "text-lg font-bold" }, props.value),
    );
  }

  function StatusBadge(props) {
    const palette = {
      queued:  { bg: "#334155", fg: "#e2e8f0" },
      running: { bg: "#00d4aa", fg: "#000" },
      completed: { bg: "#2dd4bf", fg: "#000" },
      failed:  { bg: "#f43f5e", fg: "#fff" },
    };
    const p = palette[props.status] || palette.queued;
    return React.createElement("span", {
      className: "text-[0.65rem] uppercase tracking-wider px-2 py-1 rounded-sm font-bold",
      style: { backgroundColor: p.bg, color: p.fg },
    }, props.status);
  }

  // -----------------------------------------------------------------------
  // Library Tab
  // -----------------------------------------------------------------------

  function LibraryTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(function () {
      SDK.fetchJSON(API_BASE + "/library")
        .then(function (data) { setItems(data.items || []); })
        .catch(function () { setItems([]); })
        .finally(function () { setLoading(false); });
    }, []);

    const accent = cssVar("--theme-color-primary") || "#00d4aa";

    return React.createElement("div", { className: "flex flex-col gap-6" },
      React.createElement("div", { className: "flex items-center justify-between" },
        React.createElement("h2", { className: "text-lg font-medium" }, "Content Library"),
        React.createElement(Badge, { variant: "outline" }, items.length, " modules"),
      ),
      loading && React.createElement("p", { className: "text-sm opacity-60" }, "Loading library…"),
      !loading && items.length === 0 && React.createElement("div", { className: "flex flex-col gap-2 border border-border/30 p-6 text-center" },
        React.createElement("p", { className: "text-sm opacity-60" }, "No extractions yet."),
        React.createElement("p", { className: "text-xs opacity-40" }, "Run an extraction from the Extractor tab to populate your library."),
      ),
      React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
        items.map(function (item) {
          return React.createElement(Card, { key: item.id, className: "card-notched hover:border-primary/40 transition-colors" },
            React.createElement(CardHeader, null,
              React.createElement("div", { className: "flex items-center justify-between" },
                React.createElement(CardTitle, { className: "text-base" }, item.title),
                React.createElement(Badge, { style: { backgroundColor: accent, color: "#000" } }, item.engine),
              ),
            ),
            React.createElement(CardContent, { className: "flex flex-col gap-3" },
              React.createElement("div", { className: "flex items-center gap-3 text-xs opacity-60 font-mono" },
                React.createElement("span", null, item.slides_found, " slides"),
                React.createElement("span", null, "·"),
                React.createElement("span", null, timeAgo(item.extracted_at)),
              ),
              React.createElement("a", {
                href: item.source_url,
                target: "_blank",
                rel: "noreferrer",
                className: "text-xs opacity-50 hover:opacity-100 truncate",
              }, item.source_url),
            ),
          );
        }),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Query Tab
  // -----------------------------------------------------------------------

  function QueryTab() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    function runQuery() {
      if (!query.trim()) return;
      setLoading(true);
      SDK.fetchJSON(API_BASE + "/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query.trim(), limit: 10 }),
      })
        .then(function (data) { setResults(data.results || []); })
        .catch(function () { setResults([]); })
        .finally(function () { setLoading(false); });
    }

    return React.createElement("div", { className: "flex flex-col gap-6" },
      React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement(CardTitle, { className: "text-base" }, "Query Library"),
        ),
        React.createElement(CardContent, { className: "flex flex-col gap-4" },
          React.createElement("div", { className: "flex gap-3" },
            React.createElement(Input, {
              placeholder: "Search across extracted slides…",
              value: query,
              onChange: function (e) { setQuery(e.target.value); },
              onKeyDown: function (e) { if (e.key === "Enter") runQuery(); },
              className: "flex-1 font-mono text-sm bg-background/50",
            }),
            React.createElement(Button, {
              onClick: runQuery,
              disabled: loading || !query.trim(),
              className: "px-4 py-2 text-sm font-medium border cursor-pointer hover:bg-foreground/10",
            }, loading ? "Searching…" : "Search"),
          ),
          results.length > 0 && React.createElement("div", { className: "flex flex-col gap-3" },
            results.map(function (r, i) {
              return React.createElement("div", { key: i, className: "flex flex-col gap-1 border border-border/30 p-3" },
                React.createElement("div", { className: "flex items-center justify-between" },
                  React.createElement("span", { className: "text-sm font-medium" }, r.title),
                  React.createElement("span", { className: "text-[0.6rem] opacity-40 font-mono" }, "score ", r.score),
                ),
                React.createElement("span", { className: "text-xs opacity-70 font-mono leading-relaxed" }, "…", r.snippet, "…"),
              );
            }),
          ),
          !loading && query && results.length === 0 && React.createElement("p", { className: "text-sm opacity-50" }, "No matches found."),
        ),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Main Page
  // -----------------------------------------------------------------------

  function LearningHubPage() {
    const [activeTab, setActiveTab] = useState("extractor");

    const tabButton = function (id, label) {
      const isActive = activeTab === id;
      return React.createElement("button", {
        key: id,
        onClick: function () { setActiveTab(id); },
        className: cn(
          "px-4 py-2 text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer border-b-2",
          isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
        ),
      }, label);
    };

    return React.createElement("div", { className: "plugin-learning-hub flex flex-col gap-6" },
      React.createElement("div", { className: "flex items-center gap-3" },
        React.createElement("h1", { className: "text-2xl font-bold tracking-tight" }, "Learning Hub"),
        React.createElement(Badge, { variant: "outline", className: "font-mono text-[0.65rem]" }, "OPS CENTER"),
      ),
      React.createElement("div", { className: "flex flex-col gap-6" },
        React.createElement("div", { className: "flex border-b border-border" },
          tabButton("extractor", "Extractor"),
          tabButton("library", "Library"),
          tabButton("query", "Query"),
        ),
        activeTab === "extractor" && React.createElement(ExtractorTab),
        activeTab === "library" && React.createElement(LibraryTab),
        activeTab === "query" && React.createElement(QueryTab),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  window.__HERMES_PLUGINS__.register("learning-hub", LearningHubPage);

  const PLUGINS = window.__HERMES_PLUGINS__;
  if (PLUGINS && PLUGINS.registerSlot) {
    PLUGINS.registerSlot("learning-hub", "sidebar", SidebarSlot);
    PLUGINS.registerSlot("learning-hub", "footer-right", FooterSlot);

    /* Page-scoped slots — forward-compatible with Hermes Agent PR #15658.
       These silently no-op on v0.11.0 and render automatically once the
       dashboard supports page-scoped injection (sessions:top, skills:top, etc.). */
    function SkillsTopBanner() {
      return React.createElement(Card, { className: "mb-4 border-primary/30" },
        React.createElement(CardContent, { className: "py-2 flex items-center gap-2 text-xs" },
          React.createElement("span", { className: "inline-block h-2 w-2 rounded-full bg-primary animate-pulse" }),
          "Learning Hub extraction engine ready — ",
          React.createElement("a", { href: "#/learning-hub", className: "underline text-primary" }, "Open Ops Center")
        )
      );
    }
    PLUGINS.registerSlot("learning-hub", "skills:top", SkillsTopBanner);
  }
})();
