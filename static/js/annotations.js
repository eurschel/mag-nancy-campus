/* Tablonoir — annotations personnelles (surlignage + notes)
   Stockage local uniquement (localStorage), aucune donnée envoyée.
   Couche indépendante : ne modifie pas app.js.                    */
(function () {
  "use strict";
  var STORAGE_KEY = "tablonoir-annotations-v1";
  var MAIN_SEL = "#mainContent";

  /* ---------- storage ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
    catch (e) {}
    updateNotesCount();
  }
  function pageKey() { return (location.hash || "").replace(/^#/, "") || "home"; }
  function uid() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- toolbar selection ---------- */
  function getSelInfo() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var text = sel.toString().trim();
    if (text.length < 3 || text.length > 600) return null;
    var main = document.querySelector(MAIN_SEL);
    if (!main || !main.contains(range.startContainer)) return null;
    /* éviter les sélections à l'intérieur d'une zone déjà annotée */
    var container = range.commonAncestorContainer;
    var parentEl = container.nodeType === 1 ? container : container.parentNode;
    if (parentEl.closest && parentEl.closest("mark.ann-mark")) return null;
    /* contexte (pour la persistance) */
    var fullText = (parentEl.textContent || "");
    var idx = fullText.indexOf(text);
    var ctxBefore = idx > 0 ? fullText.slice(Math.max(0, idx - 35), idx) : "";
    var ctxAfter = idx >= 0 ? fullText.slice(idx + text.length, idx + text.length + 35) : "";
    return { text: text, ctxBefore: ctxBefore, ctxAfter: ctxAfter, range: range };
  }

  function showToolbar(info) {
    hideToolbar();
    var rect = info.range.getBoundingClientRect();
    var bar = document.createElement("div");
    bar.id = "annToolbar";
    bar.className = "ann-toolbar";
    bar.innerHTML =
      '<button data-color="yellow" title="Surligner en jaune" class="ann-tool-color ann-c-yellow"></button>' +
      '<button data-color="green"  title="Surligner en vert"  class="ann-tool-color ann-c-green"></button>' +
      '<button data-color="pink"   title="Surligner en rose"  class="ann-tool-color ann-c-pink"></button>' +
      '<div class="ann-tool-sep"></div>' +
      '<button data-action="note" class="ann-tool-note" title="Surligner + ajouter une note">+ note</button>';
    document.body.appendChild(bar);
    var x = window.scrollX + rect.left + (rect.width / 2) - (bar.offsetWidth / 2);
    var y = window.scrollY + rect.top - bar.offsetHeight - 10;
    if (y < window.scrollY + 8) y = window.scrollY + rect.bottom + 10;
    bar.style.left = Math.max(8, x) + "px";
    bar.style.top = y + "px";
    bar.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
    bar.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var btn = ev.target.closest("button"); if (!btn) return;
      if (btn.dataset.color) {
        createAnnotation(info, btn.dataset.color, null);
      } else if (btn.dataset.action === "note") {
        var note = prompt("Ta note :", "");
        if (note !== null) createAnnotation(info, "yellow", note);
      }
      hideToolbar();
      try { window.getSelection().removeAllRanges(); } catch (e) {}
    });
  }
  function hideToolbar() {
    var t = document.getElementById("annToolbar"); if (t) t.remove();
  }

  /* ---------- create / remove ---------- */
  function createAnnotation(info, color, note) {
    var ann = {
      id: uid(), page: pageKey(),
      text: info.text, ctxBefore: info.ctxBefore, ctxAfter: info.ctxAfter,
      color: color, note: note || "", created: Date.now()
    };
    var arr = load(); arr.push(ann); save(arr);
    applyAnnotations();
  }
  function removeAnnotation(id) {
    save(load().filter(function (a) { return a.id !== id; }));
    applyAnnotations();
  }
  function updateNote(id, val) {
    var arr = load();
    var i = -1;
    for (var k = 0; k < arr.length; k++) { if (arr[k].id === id) { i = k; break; } }
    if (i >= 0) { arr[i].note = val; save(arr); applyAnnotations(); }
  }

  /* ---------- apply annotations on current DOM ---------- */
  var APPLYING = false;
  function applyAnnotations() {
    if (APPLYING) return;
    APPLYING = true;
    try {
      var main = document.querySelector(MAIN_SEL);
      if (!main) return;
      /* on retire d'abord les marks existants */
      var marks = main.querySelectorAll("mark.ann-mark");
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i], p = m.parentNode;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m); p.normalize();
      }
      var pk = pageKey();
      var anns = load().filter(function (a) { return a.page === pk; });
      anns.forEach(applyOne);
    } finally { APPLYING = false; }
  }

  function applyOne(ann) {
    var main = document.querySelector(MAIN_SEL); if (!main) return;
    var w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var t = n.parentNode && n.parentNode.tagName;
        if (t === "SCRIPT" || t === "STYLE" || t === "MARK") return NodeFilter.FILTER_REJECT;
        return n.nodeValue.indexOf(ann.text) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var node, best = null, bestScore = -1;
    while ((node = w.nextNode())) {
      var idx = node.nodeValue.indexOf(ann.text); if (idx < 0) continue;
      /* score by context match */
      var before = node.nodeValue.slice(Math.max(0, idx - 35), idx);
      var after = node.nodeValue.slice(idx + ann.text.length, idx + ann.text.length + 35);
      var score = 0;
      if (ann.ctxBefore && before && tailOverlap(before, ann.ctxBefore)) score += 1;
      if (ann.ctxAfter && after && headOverlap(after, ann.ctxAfter)) score += 1;
      if (score > bestScore) { bestScore = score; best = { node: node, idx: idx }; }
      if (score === 2) break;
    }
    if (!best) return;
    try {
      var range = document.createRange();
      range.setStart(best.node, best.idx);
      range.setEnd(best.node, best.idx + ann.text.length);
      var mark = document.createElement("mark");
      mark.className = "ann-mark ann-" + ann.color;
      mark.dataset.annId = ann.id;
      if (ann.note) mark.title = ann.note;
      range.surroundContents(mark);
      mark.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        showAnnotationMenu(mark, ann.id);
      });
    } catch (e) {}
  }
  function tailOverlap(a, b) {
    /* dernier suffixe commun */
    var n = Math.min(a.length, b.length);
    for (var k = Math.min(15, n); k >= 5; k--) {
      if (a.slice(-k) === b.slice(-k)) return true;
    }
    return false;
  }
  function headOverlap(a, b) {
    var n = Math.min(a.length, b.length);
    for (var k = Math.min(15, n); k >= 5; k--) {
      if (a.slice(0, k) === b.slice(0, k)) return true;
    }
    return false;
  }

  /* ---------- popup d'un highlight existant ---------- */
  function showAnnotationMenu(markEl, id) {
    closeAnnotationMenu();
    var arr = load();
    var ann = null;
    for (var k = 0; k < arr.length; k++) { if (arr[k].id === id) { ann = arr[k]; break; } }
    if (!ann) return;
    var menu = document.createElement("div");
    menu.id = "annMenu";
    menu.className = "ann-menu";
    menu.innerHTML =
      (ann.note ? '<div class="ann-menu-note">' + esc(ann.note) + '</div>' : '') +
      '<button data-action="edit">' + (ann.note ? "Modifier la note" : "Ajouter une note") + '</button>' +
      '<button data-action="remove">Supprimer</button>';
    document.body.appendChild(menu);
    var rect = markEl.getBoundingClientRect();
    var x = window.scrollX + rect.left;
    var y = window.scrollY + rect.bottom + 4;
    if (x + menu.offsetWidth > window.scrollX + document.documentElement.clientWidth - 8) {
      x = window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - 8;
    }
    menu.style.left = x + "px"; menu.style.top = y + "px";
    setTimeout(function () { document.addEventListener("click", outsideMenu); }, 30);
    menu.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button"); if (!btn) return;
      if (btn.dataset.action === "edit") {
        var v = prompt("Ta note :", ann.note || "");
        if (v !== null) updateNote(id, v);
      } else if (btn.dataset.action === "remove") {
        removeAnnotation(id);
      }
      closeAnnotationMenu();
    });
  }
  function closeAnnotationMenu() {
    var m = document.getElementById("annMenu"); if (m) m.remove();
    document.removeEventListener("click", outsideMenu);
  }
  function outsideMenu(ev) {
    var m = document.getElementById("annMenu");
    if (!m || (m.contains(ev.target))) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains("ann-mark")) return;
    closeAnnotationMenu();
  }

  /* ---------- page « Mes notes » (route #notes) ---------- */
  function renderNotesPage() {
    var main = document.querySelector(MAIN_SEL); if (!main) return;
    var anns = load().slice().sort(function (a, b) { return b.created - a.created; });
    var html = '<div class="crumb mono"><a href="#">Tablonoir</a> / Mes notes</div>' +
      '<section class="hero"><div class="hero-badge">MES ANNOTATIONS</div>' +
      '<h1>Tes <span class="accent">notes et surlignages</span></h1>' +
      '<p class="hero-sub">' + anns.length + ' annotation' + (anns.length > 1 ? 's' : '') +
      ' enregistrée' + (anns.length > 1 ? 's' : '') +
      ' sur cet appareil uniquement. Aucune donnée envoyée. Vide ton navigateur ou supprime une par une.</p></section>';
    if (!anns.length) {
      html += '<section class="band"><div class="band-tag">// COMMENT FAIRE</div>' +
        '<p class="accroche">Sur n\'importe quelle page (dossier IA, fiche, article), <strong>sélectionne du texte</strong> avec ta souris. Une petite barre apparaît avec 3 couleurs et un bouton « + note ». Tes surlignages restent visibles à chaque retour.</p>' +
        '<p class="module-fiche-intro">Astuces : sélectionne le résumé d\'un module en jaune pour ta révision, mets en rose les passages que tu n\'as pas compris pour y revenir, et garde le vert pour les exemples concrets que tu réutiliseras.</p>' +
        '</section>';
    } else {
      /* regrouper par page */
      var groups = {};
      anns.forEach(function (a) { (groups[a.page] = groups[a.page] || []).push(a); });
      Object.keys(groups).forEach(function (page) {
        var label = humanizePage(page);
        html += '<section class="band"><div class="band-tag mono">// ' + esc(label.tag) + '</div>' +
          '<h2>' + esc(label.title) + '</h2>' +
          '<a class="ann-back-link mono" href="#' + esc(page) + '">→ Retourner à la page</a>' +
          '<ul class="ann-list">';
        groups[page].forEach(function (a) {
          html += '<li class="ann-item ann-li-' + a.color + '" data-id="' + a.id + '">' +
            '<div class="ann-item-text">« ' + esc(a.text) + ' »</div>' +
            (a.note ? '<div class="ann-item-note">📝 ' + esc(a.note) + '</div>' : '') +
            '<div class="ann-item-meta mono">' +
              new Date(a.created).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) +
              ' · <button class="ann-item-edit" data-id="' + a.id + '">' + (a.note ? "modifier note" : "ajouter note") + '</button>' +
              ' · <button class="ann-item-remove" data-id="' + a.id + '">supprimer</button>' +
            '</div>' +
          '</li>';
        });
        html += '</ul></section>';
      });
    }
    main.innerHTML = html;
    main.querySelectorAll(".ann-item-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        if (confirm("Supprimer cette annotation ?")) {
          removeAnnotation(b.dataset.id);
          renderNotesPage();
        }
      });
    });
    main.querySelectorAll(".ann-item-edit").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.id;
        var arr = load(); var cur = null;
        for (var k = 0; k < arr.length; k++) { if (arr[k].id === id) { cur = arr[k]; break; } }
        var v = prompt("Ta note :", (cur && cur.note) || "");
        if (v !== null) { updateNote(id, v); renderNotesPage(); }
      });
    });
    window.scrollTo(0, 0);
  }

  function humanizePage(p) {
    if (p === "home" || p === "") return { tag: "ACCUEIL", title: "Page d'accueil" };
    if (p === "notes") return { tag: "MES NOTES", title: "Mes notes" };
    var parts = p.split("/");
    if (parts[0] === "theme" && parts[1]) {
      var slug = parts[1];
      var label = slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      if (parts[2] === "module" && parts[3]) {
        return { tag: label.toUpperCase() + " · MODULE " + parts[3], title: "Module " + parts[3] + " — " + label };
      }
      if (parts[2] === "tool" && parts[3]) {
        return { tag: "IA · " + parts[3].toUpperCase(), title: parts[3].charAt(0).toUpperCase() + parts[3].slice(1) + " (outil IA)" };
      }
      return { tag: label.toUpperCase(), title: label };
    }
    return { tag: p.toUpperCase(), title: p };
  }

  /* ---------- nav button « Mes notes » avec compteur ---------- */
  function addNotesNavLink() {
    var actions = document.querySelector(".topnav-actions");
    if (!actions || document.getElementById("notesNav")) return;
    var count = load().length;
    var html = '<a class="nav-btn nav-btn-ghost" id="notesNav" href="#notes" title="Mes notes et surlignages">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>' +
      'Mes notes' + (count ? ' <span class="notes-count">' + count + '</span>' : '') +
      '</a>';
    var accueil = null;
    var links = actions.querySelectorAll("a.nav-btn");
    for (var k = 0; k < links.length; k++) {
      var l = links[k];
      if (!l.classList.contains("nav-btn-ghost") && !l.classList.contains("icon-only")) { accueil = l; break; }
    }
    if (accueil) accueil.insertAdjacentHTML("beforebegin", html);
    else actions.insertAdjacentHTML("afterbegin", html);
  }
  function updateNotesCount() {
    var nav = document.getElementById("notesNav"); if (!nav) return;
    var count = load().length;
    var sp = nav.querySelector(".notes-count");
    if (count > 0) {
      if (sp) sp.textContent = count;
      else nav.insertAdjacentHTML("beforeend", ' <span class="notes-count">' + count + '</span>');
    } else if (sp) { sp.remove(); }
  }

  /* ---------- routing / observer ---------- */
  function checkRoute() {
    if (pageKey() === "notes") {
      /* delay pour s'exécuter APRÈS app.js (qui ferait renderHome sur #notes) */
      setTimeout(renderNotesPage, 30);
    } else {
      setTimeout(applyAnnotations, 60);
    }
  }
  function hookRouting() {
    window.addEventListener("hashchange", checkRoute);
    var main = document.querySelector(MAIN_SEL);
    if (main) {
      var pending = null;
      new MutationObserver(function () {
        if (pending) clearTimeout(pending);
        pending = setTimeout(function () {
          if (pageKey() === "notes") return; /* déjà rendu */
          applyAnnotations();
        }, 60);
      }).observe(main, { childList: true });
    }
    checkRoute();
  }

  /* ---------- bind ---------- */
  function bindSelection() {
    document.addEventListener("mouseup", function (ev) {
      if (ev.target && ev.target.closest && (ev.target.closest(".ann-toolbar") || ev.target.closest(".ann-menu"))) return;
      setTimeout(function () {
        var info = getSelInfo();
        if (info) showToolbar(info); else hideToolbar();
      }, 10);
    });
    document.addEventListener("touchend", function (ev) {
      if (ev.target && ev.target.closest && (ev.target.closest(".ann-toolbar") || ev.target.closest(".ann-menu"))) return;
      setTimeout(function () {
        var info = getSelInfo();
        if (info) showToolbar(info);
      }, 80);
    });
    document.addEventListener("scroll", function () { hideToolbar(); }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hideToolbar(); closeAnnotationMenu(); }
    });
  }

  function init() {
    addNotesNavLink();
    bindSelection();
    hookRouting();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();
