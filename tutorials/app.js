/*
 * Ice Bank Tutorials - single-page app with hash routing (#tutorial/lesson).
 * Content lives in content/*.js, each file pushes one tutorial onto window.ICEBANK.tutorials.
 * Progress and notes are kept in localStorage under STORAGE_KEY. Every storage access is wrapped
 * in try/catch, so the site keeps working (in memory) when storage is blocked or full.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "icebank-tutorials-v1";
  var EXPORT_APP = "icebank-tutorials";
  var STATE_VERSION = 1;
  var MAX_NOTE_LENGTH = 20000;
  var MAX_IMPORT_BYTES = 1024 * 1024;
  var KEY_RE = /^[a-z0-9-]+\/[a-z0-9-]+#\d{1,2}$/;
  var LESSON_KEY_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/;

  var tutorials = ((window.ICEBANK && window.ICEBANK.tutorials) || []).slice().sort(function (a, b) {
    return a.number - b.number;
  });

  // ---- storage --------------------------------------------------------------------------------

  var storageOk = true;

  function storageRead() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw;
    } catch (e) {
      storageOk = false;
      return null;
    }
  }

  function storageWrite(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      storageOk = true;
      return true;
    } catch (e) {
      storageOk = false;
      return false;
    }
  }

  function storageRemove() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      storageOk = false;
      return false;
    }
  }

  /** True if a test write succeeds. Some browsers expose localStorage but throw on use. */
  function probeStorage() {
    try {
      var k = STORAGE_KEY + "-probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function emptyState() {
    return { version: STATE_VERSION, done: {}, notes: {}, last: null, updatedAt: null };
  }

  /**
   * Check and clean a state object (from storage or an imported file).
   * Returns { state, ignored } or throws an Error with a message for the user.
   */
  function sanitizeState(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("The file does not contain a progress object.");
    if (obj.version !== STATE_VERSION) throw new Error("Unsupported progress version (" + String(obj.version) + "). Expected " + STATE_VERSION + ".");
    var out = emptyState();
    var ignored = 0;
    var done = obj.done == null ? {} : obj.done;
    if (typeof done !== "object" || Array.isArray(done)) throw new Error("\"done\" must be an object of exercise ticks.");
    Object.keys(done).forEach(function (k) {
      if (KEY_RE.test(k) && done[k] === true) out.done[k] = true;
      else if (done[k] !== false) ignored++;
    });
    var notes = obj.notes == null ? {} : obj.notes;
    if (typeof notes !== "object" || Array.isArray(notes)) throw new Error("\"notes\" must be an object of lesson notes.");
    Object.keys(notes).forEach(function (k) {
      if (LESSON_KEY_RE.test(k) && typeof notes[k] === "string") {
        if (notes[k].length) out.notes[k] = notes[k].slice(0, MAX_NOTE_LENGTH);
      } else ignored++;
    });
    if (typeof obj.last === "string" && LESSON_KEY_RE.test(obj.last)) out.last = obj.last;
    if (typeof obj.updatedAt === "string") out.updatedAt = obj.updatedAt;
    return { state: out, ignored: ignored };
  }

  function loadState() {
    var raw = storageRead();
    if (!raw) return emptyState();
    try {
      return sanitizeState(JSON.parse(raw)).state;
    } catch (e) {
      // Corrupt data: keep a copy aside so nothing is silently destroyed, then start fresh.
      try { window.localStorage.setItem(STORAGE_KEY + "-corrupt", raw); } catch (e2) { /* ignore */ }
      return emptyState();
    }
  }

  var state = loadState();
  if (!probeStorage()) storageOk = false;

  function persist() {
    state.updatedAt = new Date().toISOString();
    var ok = storageWrite(JSON.stringify(state));
    updateStorageBanner();
    return ok;
  }

  // ---- content helpers ------------------------------------------------------------------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function findTutorial(id) {
    for (var i = 0; i < tutorials.length; i++) if (tutorials[i].id === id) return tutorials[i];
    return null;
  }

  function findLesson(t, id) {
    for (var i = 0; i < t.lessons.length; i++) if (t.lessons[i].id === id) return t.lessons[i];
    return null;
  }

  function exKey(t, l, i) { return t.id + "/" + l.id + "#" + (i + 1); }
  function lessonKey(t, l) { return t.id + "/" + l.id; }

  function lessonStats(t, l) {
    var total = l.exercises.length, done = 0;
    for (var i = 0; i < total; i++) if (state.done[exKey(t, l, i)]) done++;
    return { done: done, total: total };
  }

  function tutorialStats(t) {
    var done = 0, total = 0, lessonsDone = 0;
    t.lessons.forEach(function (l) {
      var s = lessonStats(t, l);
      done += s.done; total += s.total;
      if (s.total && s.done === s.total) lessonsDone++;
    });
    return { done: done, total: total, lessonsDone: lessonsDone, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function overallStats() {
    var done = 0, total = 0;
    tutorials.forEach(function (t) { var s = tutorialStats(t); done += s.done; total += s.total; });
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function barHtml(pct, label, extraClass) {
    return '<div class="bar' + (pct >= 100 ? " complete" : "") + (extraClass ? " " + extraClass : "") + '" role="progressbar" aria-label="' + esc(label) +
      '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span class="bar-fill" style="width:' + pct + '%"></span></div>';
  }

  // ---- routing --------------------------------------------------------------------------------

  function parseHash() {
    var h = (window.location.hash || "").replace(/^#\/?/, "");
    try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
    if (!h || h === "home") return { view: "home" };
    var parts = h.split("/");
    var t = findTutorial(parts[0]);
    if (!t) return { view: "missing" };
    if (parts.length === 1 || !parts[1]) return { view: "tutorial", t: t };
    var l = findLesson(t, parts[1]);
    if (!l) return { view: "missing", t: t };
    return { view: "lesson", t: t, l: l };
  }

  var expanded = {};
  var firstRender = true;

  function render() {
    var r = parseHash();
    if (r.t) expanded[r.t.id] = true;
    var view = document.getElementById("view");
    if (r.view === "home") { view.innerHTML = homeHtml(); document.title = "Ice Bank Tutorials"; }
    else if (r.view === "tutorial") { view.innerHTML = tutorialHtml(r.t); document.title = r.t.title + " | Ice Bank Tutorials"; }
    else if (r.view === "lesson") {
      view.innerHTML = lessonHtml(r.t, r.l);
      document.title = r.l.title + " | " + r.t.title + " | Ice Bank Tutorials";
      state.last = lessonKey(r.t, r.l);
      persist();
      wireLesson(r.t, r.l);
    } else { view.innerHTML = missingHtml(); document.title = "Not found | Ice Bank Tutorials"; }
    renderSidebar(r);
    renderOverall();
    closeSidebar();
    if (!firstRender) {
      window.scrollTo(0, 0);
      var h1 = view.querySelector("h1");
      if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    }
    firstRender = false;
  }

  // ---- views ----------------------------------------------------------------------------------

  function homeHtml() {
    var o = overallStats();
    var cont = "";
    if (state.last) {
      var p = state.last.split("/"), t = findTutorial(p[0]), l = t && findLesson(t, p[1]);
      if (l) cont = '<a class="btn btn-primary" href="#' + esc(state.last) + '">Continue: ' + esc(l.title) + "</a>";
    }
    if (!cont && tutorials[0]) cont = '<a class="btn btn-primary" href="#' + tutorials[0].id + "/" + tutorials[0].lessons[0].id + '">Start with lesson 1</a>';
    var tiles = tutorials.map(function (t) {
      var s = tutorialStats(t);
      return '<a class="tile" href="#' + t.id + '"><span class="eyebrow">Tutorial ' + t.number + "</span><h3>" + esc(t.title) + "</h3><p>" + esc(t.summary) +
        '</p><span class="tile-progress">' + barHtml(s.pct, t.title + " progress") + "<span>" + s.done + "/" + s.total + " exercises</span></span></a>";
    }).join("");
    return '' +
      '<section class="card hero"><p class="eyebrow" style="color:#9FD0F0">Foundations for testing Ice Bank</p>' +
      "<h1>Ice Bank Tutorials</h1>" +
      '<p class="lede">Six short courses that fill the gaps around REST Assured, Selenium, SQL/JDBC and JMeter. Every example runs against Ice Bank, ' +
      "so you can try things the minute you read them. You have done " + o.done + " of " + o.total + " exercises (" + o.pct + "%).</p>" +
      '<div class="hero-actions">' + cont +
      '<a class="btn btn-secondary" href="http://localhost:3000/swagger" target="_blank" rel="noopener">Open Swagger now</a>' +
      '<a class="btn btn-secondary" href="http://localhost:3000" target="_blank" rel="noopener">Open Ice Bank</a></div></section>' +
      '<div class="grid">' + tiles + "</div>" +
      '<section class="card"><h2>How this site works</h2><div class="prose">' +
      "<ul><li>Pick a lesson in the sidebar. Each lesson has an explanation, Ice Bank examples with <strong>Copy</strong> buttons, and 2 to 5 exercises.</li>" +
      "<li>Tick an exercise when you have done it for real against Ice Bank (local or QA). The bars fill as you go.</li>" +
      "<li>Use the notes box in every lesson for the queries, commands and surprises you want to keep.</li>" +
      "<li>Progress lives in this browser only. Use <strong>Export progress</strong> now and then, and <strong>Import progress</strong> on a new laptop or after clearing your cache.</li>" +
      "<li>There are no answers here on purpose. Bring your results to the next session; the instructor has the answer keys.</li></ul></div></section>" +
      envHtml();
  }

  function envHtml() {
    return '<section class="card"><h2>Ice Bank quick reference</h2><div class="prose">' +
      '<div class="table-wrap"><table class="ref"><thead><tr><th scope="col">What</th><th scope="col">Local (clean build)</th><th scope="col">QA (buggy build)</th></tr></thead><tbody>' +
      "<tr><td>App</td><td><a href=\"http://localhost:3000\" target=\"_blank\" rel=\"noopener\">http://localhost:3000</a> (<code>npm run dev</code>)</td><td>URL from your instructor, e.g. <code>https://icebank-qa.vercel.app</code></td></tr>" +
      "<tr><td>Swagger / OpenAPI</td><td><a href=\"http://localhost:3000/swagger\" target=\"_blank\" rel=\"noopener\">/swagger</a> and <code>/api/v1/openapi.json</code></td><td>Same paths on the QA URL</td></tr>" +
      "<tr><td>API base</td><td><code>http://localhost:3000/api/v1</code></td><td><code>&lt;QA URL&gt;/api/v1</code></td></tr>" +
      "<tr><td>Ice Mail</td><td><a href=\"http://localhost:3000/mail\" target=\"_blank\" rel=\"noopener\">/mail</a>, or <code>GET /api/v1/inbox?email=…</code></td><td>Same</td></tr>" +
      "<tr><td>Sandbox key (<code>X-Sandbox-Key</code>)</td><td><code>ICEBANK-LOCAL-KEY</code>, sandbox_id <code>1</code></td><td>Your personal key and sandbox_id from the instructor</td></tr>" +
      "<tr><td>Persona password</td><td colspan=\"2\"><code>IceBank#2026</code> for every seeded persona</td></tr>" +
      "<tr><td>Emails</td><td><code>emma.tremblay@icebank.test</code></td><td>With your sandbox suffix, e.g. <code>emma.tremblay+s1@icebank.test</code></td></tr>" +
      "<tr><td>Database (JDBC)</td><td><code>jdbc:postgresql://localhost:5433/icebank</code><br><code>qa_reader</code> / <code>qa_reader</code> (read-only)<br><code>qa_writer</code> / <code>qa_writer</code> (read/write)</td><td>Supabase session-pooler string from the instructor, <code>qa_reader</code> only</td></tr>" +
      "</tbody></table></div>" +
      '<div class="table-wrap"><table class="ref"><thead><tr><th scope="col">Persona</th><th scope="col">Email (local)</th><th scope="col">Scenario</th></tr></thead><tbody>' +
      "<tr><td>Emma Tremblay</td><td><code>emma.tremblay@icebank.test</code></td><td>Happy path. Accounts 1 chequing, 2 savings (\"Rainy day\"), 3 credit card, 4 personal loan; contacts and payees</td></tr>" +
      "<tr><td>Liam Chen</td><td><code>liam.chen@icebank.test</code></td><td>Locked out (an admin must unlock); accounts 5 and 6</td></tr>" +
      "<tr><td>Olivia Singh</td><td><code>olivia.singh@icebank.test</code></td><td>Credit card (account 8) $40 under its $5,000 limit</td></tr>" +
      "<tr><td>Noah Martin</td><td><code>noah.martin@icebank.test</code></td><td>Brand new, chequing only (account 9), no history</td></tr>" +
      "<tr><td>Ava Roy</td><td><code>ava.roy@icebank.test</code></td><td>Chequing account 10 frozen by an admin</td></tr>" +
      "<tr><td>Lucas Gagnon</td><td><code>lucas.gagnon@icebank.test</code></td><td>Loan application in manual review, pending cheque deposit</td></tr>" +
      "<tr><td>Teller</td><td><code>teller@icebank.test</code></td><td><code>ADMIN</code> role, admin portal and <code>/admin/*</code> endpoints</td></tr>" +
      "<tr><td>Perf User</td><td><code>perf.user@icebank.test</code></td><td>50,000 transactions, only after <code>npm run seed:perf</code> (local)</td></tr>" +
      "</tbody></table></div>" +
      "<p class=\"hint\">The sandbox clock starts at the seed instant, Monday 2 November 2026, 09:00 in Toronto, after every reset. All \"today\", daily-limit and business-day rules use America/Toronto.</p>" +
      "</div></section>";
  }

  function tutorialHtml(t) {
    var s = tutorialStats(t);
    var items = t.lessons.map(function (l, i) {
      var ls = lessonStats(t, l), done = ls.total && ls.done === ls.total;
      return '<li><a href="#' + t.id + "/" + l.id + '"><span class="ll-num' + (done ? " done" : "") + '" aria-hidden="true">' + (done ? "&#10003;" : i + 1) +
        '</span><span class="ll-title">' + esc(l.title) + '</span><span class="ll-count">' + ls.done + "/" + ls.total +
        '<span class="sr-only"> exercises done</span></span></a></li>';
    }).join("");
    return '<div class="lesson-header"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="#home">Home</a> / Tutorial ' + t.number + "</nav>" +
      '<p class="eyebrow">Tutorial ' + t.number + " · " + t.lessons.length + " lessons</p><h1>" + esc(t.title) + "</h1>" +
      '<p class="lede">' + esc(t.summary) + "</p></div>" +
      '<section class="card"><div class="exercise-summary">' + barHtml(s.pct, t.title + " progress") + "<span>" + s.pct + "% · " + s.done + " of " + s.total +
      " exercises · " + s.lessonsDone + " of " + t.lessons.length + " lessons complete</span></div>" +
      (t.intro ? '<div class="prose" style="margin-top:14px">' + t.intro + "</div>" : "") + "</section>" +
      '<section class="card"><h2>Lessons</h2><ol class="lesson-list">' + items + "</ol></section>";
  }

  function lessonHtml(t, l) {
    var idx = t.lessons.indexOf(l);
    var ls = lessonStats(t, l);
    var key = lessonKey(t, l);
    var examples = (l.examples || []).map(function (ex, i) {
      var id = "ex-" + t.id + "-" + l.id + "-" + i;
      return '<figure class="example" style="margin-left:0;margin-right:0"><div class="example-head"><figcaption class="example-title" id="' + id + '-t">' + esc(ex.title) +
        '</figcaption><span class="lang">' + esc(ex.lang || "") + '</span><button type="button" class="btn btn-secondary btn-small copy-btn" data-copy="' + i +
        '" aria-describedby="' + id + '-t">Copy</button></div><pre tabindex="0" aria-labelledby="' + id + '-t"><code></code></pre>' +
        (ex.note ? '<div class="example-note">' + ex.note + "</div>" : "") + "</figure>";
    }).join("");
    var exercises = l.exercises.map(function (text, i) {
      var k = exKey(t, l, i), checked = !!state.done[k], id = "chk-" + t.id + "-" + l.id + "-" + (i + 1);
      return '<li class="exercise' + (checked ? " checked" : "") + '"><input type="checkbox" id="' + id + '" data-key="' + esc(k) + '"' + (checked ? " checked" : "") +
        '><label for="' + id + '"><span class="ex-num">Exercise ' + (i + 1) + ".</span> " + text + "</label></li>";
    }).join("");
    var links = (l.links || []).map(function (lk) {
      return '<a class="btn btn-secondary btn-small" href="' + esc(lk.href) + '" target="_blank" rel="noopener">' + esc(lk.label) + '<span class="sr-only"> (opens in a new tab)</span></a>';
    }).join(" ");
    var prev = t.lessons[idx - 1], next = t.lessons[idx + 1];
    var nextTut = !next && tutorials[tutorials.indexOf(t) + 1];
    var pager = '<nav class="pager" aria-label="Lesson navigation">' +
      (prev ? '<a class="prev" href="#' + t.id + "/" + prev.id + '"><span class="dir">Previous</span>' + esc(prev.title) + "</a>" : '<span class="spacer"></span>') +
      (next ? '<a class="next" href="#' + t.id + "/" + next.id + '"><span class="dir">Next</span>' + esc(next.title) + "</a>"
        : nextTut ? '<a class="next" href="#' + nextTut.id + '"><span class="dir">Next tutorial</span>' + esc(nextTut.title) + "</a>" : '<span class="spacer"></span>') +
      "</nav>";
    return '<article aria-labelledby="lesson-title"><header class="lesson-header"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="#home">Home</a> / <a href="#' + t.id + '">' +
      t.number + ". " + esc(t.title) + "</a></nav>" +
      '<p class="eyebrow">Lesson ' + (idx + 1) + " of " + t.lessons.length + "</p><h1 id=\"lesson-title\">" + esc(l.title) + "</h1>" +
      (l.summary ? '<p class="lede">' + l.summary + "</p>" : "") +
      '<div class="meta-row"><span class="pill' + (ls.total && ls.done === ls.total ? " done" : "") + '" id="lesson-pill">' + ls.done + " of " + ls.total + " exercises done</span>" +
      (links ? "<span>" + links + "</span>" : "") + "</div></header>" +
      '<section class="card" aria-labelledby="h-explain"><h2 id="h-explain">Explanation</h2><div class="prose">' + l.body + "</div></section>" +
      (examples ? '<section class="card" aria-labelledby="h-examples"><h2 id="h-examples">Ice Bank examples</h2>' + examples + "</section>" : "") +
      '<section class="card" aria-labelledby="h-exercises"><h2 id="h-exercises">Exercises</h2><p class="hint">Run these against Ice Bank (local or QA) and tick each one when you have really done it. No answers here: bring your results to the next session.</p>' +
      '<ul class="exercises">' + exercises + "</ul></section>" +
      '<section class="card notes" aria-labelledby="h-notes"><h2 id="h-notes"><label for="notes-' + t.id + "-" + l.id + '">My notes</label></h2>' +
      '<textarea id="notes-' + t.id + "-" + l.id + '" data-lesson="' + esc(key) + '" spellcheck="true" placeholder="Queries that worked, commands to remember, questions for the next session…" maxlength="' + MAX_NOTE_LENGTH + '"></textarea>' +
      '<div class="notes-status" id="notes-status" aria-live="polite"></div></section>' + pager + "</article>";
  }

  function missingHtml() {
    return '<section class="card"><h1>Lesson not found</h1><p>That link does not match any tutorial or lesson. It may have been renamed.</p><p><a class="btn btn-primary" href="#home">Go to the home page</a></p></section>';
  }

  // ---- lesson wiring --------------------------------------------------------------------------

  var noteTimer = null;

  function wireLesson(t, l) {
    var view = document.getElementById("view");
    var codes = view.querySelectorAll(".example pre code");
    (l.examples || []).forEach(function (ex, i) { if (codes[i]) codes[i].textContent = ex.code.replace(/^\n+|\s+$/g, ""); });

    var ta = view.querySelector(".notes textarea");
    var status = document.getElementById("notes-status");
    var key = lessonKey(t, l);
    ta.value = state.notes[key] || "";
    status.textContent = storageOk ? (ta.value ? "Saved in this browser." : "") : "Storage is unavailable: notes are kept only until you close this tab. Export to keep them.";
    ta.addEventListener("input", function () {
      status.textContent = "Saving…";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { saveNote(key, ta.value, status); }, 400);
    });
    ta.addEventListener("blur", function () { clearTimeout(noteTimer); saveNote(key, ta.value, status); });
  }

  function saveNote(key, value, status) {
    if (value) state.notes[key] = value.slice(0, MAX_NOTE_LENGTH); else delete state.notes[key];
    var ok = persist();
    if (status) status.textContent = ok ? "Saved in this browser." : "Could not save (storage unavailable). Export progress to keep your notes.";
  }

  function flushNotes() {
    var ta = document.querySelector(".notes textarea");
    if (ta && noteTimer) { clearTimeout(noteTimer); noteTimer = null; saveNote(ta.getAttribute("data-lesson"), ta.value, null); }
  }

  function onExerciseChange(input) {
    var k = input.getAttribute("data-key");
    if (input.checked) state.done[k] = true; else delete state.done[k];
    input.closest(".exercise").classList.toggle("checked", input.checked);
    persist();
    var r = parseHash();
    if (r.view === "lesson") {
      var ls = lessonStats(r.t, r.l);
      var pill = document.getElementById("lesson-pill");
      if (pill) { pill.textContent = ls.done + " of " + ls.total + " exercises done"; pill.classList.toggle("done", ls.total > 0 && ls.done === ls.total); }
      if (ls.total && ls.done === ls.total && input.checked) toast("Lesson complete. Nice work!");
    }
    renderSidebar(r);
    renderOverall();
  }

  // ---- sidebar and overall bar ----------------------------------------------------------------

  function renderSidebar(r) {
    var html = '<a class="side-home" href="#home"' + (r.view === "home" ? ' aria-current="page"' : "") + ">Home and quick reference</a>";
    tutorials.forEach(function (t) {
      var s = tutorialStats(t), open = !!expanded[t.id], listId = "side-list-" + t.id;
      var lessons = t.lessons.map(function (l) {
        var ls = lessonStats(t, l), cls = ls.total && ls.done === ls.total ? "done" : ls.done ? "partial" : "";
        var cur = r.view === "lesson" && r.l === l;
        return '<li><a href="#' + t.id + "/" + l.id + '"' + (cur ? ' aria-current="page"' : "") + '><span class="lesson-dot ' + cls + '" aria-hidden="true">' +
          (cls === "done" ? "&#10003;" : "") + "</span><span>" + esc(l.title) + '<span class="sr-only"> (' + ls.done + " of " + ls.total + " done)</span></span></a></li>";
      }).join("");
      html += '<div class="side-tutorial"><div class="side-tutorial-head"><button type="button" class="side-expand" aria-expanded="' + open + '" aria-controls="' + listId +
        '" data-expand="' + t.id + '"><span class="chev" aria-hidden="true">&#9654;</span><span class="sr-only">Show lessons of ' + esc(t.title) + "</span></button>" +
        '<a class="side-tutorial-link" href="#' + t.id + '"' + (r.view === "tutorial" && r.t === t ? ' aria-current="page"' : "") + '><span class="side-num">' + t.number + ".</span> " + esc(t.title) + "</a></div>" +
        '<div class="side-progress">' + barHtml(s.pct, t.title + " progress") + "<span>" + s.pct + "%</span></div>" +
        '<ul class="side-lessons" id="' + listId + '"' + (open ? "" : " hidden") + ">" + lessons + "</ul></div>";
    });
    var sc = document.getElementById("sidebar-content");
    var scroll = document.getElementById("sidebar").scrollTop;
    sc.innerHTML = html;
    document.getElementById("sidebar").scrollTop = scroll;
  }

  function renderOverall() {
    var o = overallStats();
    var bar = document.getElementById("overall-bar");
    bar.setAttribute("aria-valuenow", String(o.pct));
    bar.setAttribute("aria-valuetext", o.pct + "% (" + o.done + " of " + o.total + " exercises)");
    bar.classList.toggle("complete", o.pct >= 100);
    bar.querySelector(".bar-fill").style.width = o.pct + "%";
    document.getElementById("overall-value").textContent = o.pct + "%";
  }

  function updateStorageBanner() {
    document.getElementById("storage-banner").hidden = storageOk;
  }

  // ---- mobile sidebar -------------------------------------------------------------------------

  function openSidebar() {
    document.body.classList.add("sidebar-open");
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "true");
    document.getElementById("sidebar-scrim").hidden = false;
    var cur = document.querySelector('#sidebar [aria-current="page"]') || document.querySelector("#sidebar a");
    if (cur) cur.focus();
  }

  function closeSidebar() {
    if (!document.body.classList.contains("sidebar-open")) return;
    document.body.classList.remove("sidebar-open");
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
    document.getElementById("sidebar-scrim").hidden = true;
  }

  // ---- toast and confirm ----------------------------------------------------------------------

  var toastTimer = null;
  function toast(msg, isError) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, isError ? 6000 : 3000);
  }

  function confirmDialog(title, message, okLabel) {
    return new Promise(function (resolve) {
      var dlg = document.getElementById("confirm-dialog");
      if (!dlg || typeof dlg.showModal !== "function") { resolve(window.confirm(title + "\n\n" + message)); return; }
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-message").textContent = message;
      document.getElementById("confirm-ok").textContent = okLabel || "Confirm";
      dlg.returnValue = "cancel";
      var opener = document.activeElement;
      dlg.addEventListener("close", function onClose() {
        dlg.removeEventListener("close", onClose);
        if (opener && opener.focus) opener.focus();
        resolve(dlg.returnValue === "ok");
      });
      dlg.showModal();
      document.getElementById("confirm-cancel").focus();
    });
  }

  // ---- export / import / reset ----------------------------------------------------------------

  function hasProgress() { return Object.keys(state.done).length > 0 || Object.keys(state.notes).length > 0; }

  function exportProgress() {
    flushNotes();
    var o = overallStats();
    var data = {
      app: EXPORT_APP, version: STATE_VERSION, exportedAt: new Date().toISOString(),
      summary: { exercisesDone: o.done, exercisesTotal: o.total, percent: o.pct },
      done: state.done, notes: state.notes, last: state.last, updatedAt: state.updatedAt,
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var d = new Date();
    var stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    a.href = url;
    a.download = "icebank-tutorials-progress-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Progress exported (" + o.done + " exercises, " + Object.keys(state.notes).length + " notes).");
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { toast("That file is too large to be an Ice Bank progress file.", true); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast("The file could not be read.", true); };
    reader.onload = function () {
      var parsed, result;
      try { parsed = JSON.parse(String(reader.result)); }
      catch (e) { toast("Import failed: the file is not valid JSON.", true); return; }
      try {
        if (!parsed || parsed.app !== EXPORT_APP) throw new Error("This is not an Ice Bank Tutorials progress file.");
        result = sanitizeState(parsed);
      } catch (e) { toast("Import failed: " + e.message, true); return; }
      var n = Object.keys(result.state.done).length, m = Object.keys(result.state.notes).length;
      var go = hasProgress()
        ? confirmDialog("Replace your progress?", "The file has " + n + " ticked exercises and " + m + " notes. Importing replaces what is in this browser now.", "Replace")
        : Promise.resolve(true);
      go.then(function (ok) {
        if (!ok) { toast("Import cancelled."); return; }
        state = result.state;
        var saved = persist();
        render();
        toast("Imported " + n + " ticks and " + m + " notes" + (result.ignored ? " (" + result.ignored + " invalid entries skipped)" : "") +
          (saved ? "." : ". Storage is unavailable, so export again before you close this tab."));
      });
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    confirmDialog("Reset all progress?", "This clears every tick and every note in this browser. Export first if you might want them back.", "Reset progress")
      .then(function (ok) {
        if (!ok) return;
        clearTimeout(noteTimer); noteTimer = null;
        state = emptyState();
        storageRemove();
        persist();
        render();
        toast("Progress reset.");
      });
  }

  // ---- copy to clipboard ----------------------------------------------------------------------

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  // ---- events ---------------------------------------------------------------------------------

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (btn) {
      var r = parseHash();
      var ex = r.view === "lesson" && r.l.examples[Number(btn.getAttribute("data-copy"))];
      if (!ex) return;
      copyText(ex.code.replace(/^\n+|\s+$/g, "")).then(function () {
        btn.textContent = "Copied!"; btn.classList.add("copied"); toast("Copied to the clipboard.");
        setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
      }, function () { toast("Copy failed. Select the code and press Ctrl+C.", true); });
      return;
    }
    var exp = e.target.closest("[data-expand]");
    if (exp) {
      var id = exp.getAttribute("data-expand");
      expanded[id] = !expanded[id];
      exp.setAttribute("aria-expanded", String(expanded[id]));
      document.getElementById("side-list-" + id).hidden = !expanded[id];
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches('.exercise input[type="checkbox"]')) onExerciseChange(e.target);
  });

  document.getElementById("export-btn").addEventListener("click", exportProgress);
  document.getElementById("import-btn").addEventListener("click", function () { document.getElementById("import-file").click(); });
  document.getElementById("import-file").addEventListener("change", function (e) {
    importFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("reset-btn").addEventListener("click", resetProgress);
  document.getElementById("menu-toggle").addEventListener("click", function () {
    if (document.body.classList.contains("sidebar-open")) closeSidebar(); else openSidebar();
  });
  document.getElementById("sidebar-scrim").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) { closeSidebar(); document.getElementById("menu-toggle").focus(); }
  });

  window.addEventListener("hashchange", function () { flushNotes(); render(); });
  window.addEventListener("pagehide", flushNotes);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushNotes(); });

  // Another tab changed our progress: pick it up (unless the user is typing a note here).
  window.addEventListener("storage", function (e) {
    if (e.key !== STORAGE_KEY) return;
    var active = document.activeElement;
    if (active && active.matches && active.matches(".notes textarea")) return;
    state = loadState();
    render();
  });

  // ---- start ----------------------------------------------------------------------------------

  if (!tutorials.length) {
    document.getElementById("view").innerHTML = '<section class="card"><h1>No content loaded</h1><p>The files in <code>content/</code> did not load. Serve the site with <code>npm run tutorials</code>.</p></section>';
    return;
  }
  updateStorageBanner();
  render();
})();
