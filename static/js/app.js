/* Tablonoir — multi-thematic public veille platform (read-only SPA) */
(function () {
  "use strict";
  var CFG = window.TABLONOIR || {};
  var STATE = { data: null, slug: null };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(id) { return document.getElementById(id); }
  function themes() { return (STATE.data && STATE.data.thematics) || {}; }
  function th(slug) { return themes()[slug] || null; }
  function modulesOf(slug) { var t = th(slug); return (t && t.modules) || {}; }
  function toolsOf(slug) { var t = th(slug); return (t && t.tools) || {}; }
  function toolGroupsOf(slug) { var t = th(slug); return (t && t.tool_groups) || []; }
  function hasTools(slug) { return Object.keys(toolsOf(slug)).length > 0; }
  function modKeys(slug) {
    var m = modulesOf(slug);
    return Object.keys(m).sort(function (a, b) { return (m[a].num || +a) - (m[b].num || +b); });
  }
  function fichesOf(slug) {
    var out = [], m = modulesOf(slug);
    Object.keys(m).forEach(function (k) { (m[k].fiches || []).forEach(function (f) { out.push({ mod: k, fiche: f }); }); });
    return out;
  }
  function countFiches(slug) { return fichesOf(slug).length; }
  function countResources(slug) {
    var n = 0; var mods = modulesOf(slug);
    Object.keys(mods).forEach(function (k) {
      var v = (mods[k] && mods[k].veille) || {};
      n += (v.articles || []).length + (v.videos || []).length + (v.whitepapers || []).length;
    });
    return n;
  }
  function countModuleResources(m) {
    var v = (m && m.veille) || {};
    return (v.articles || []).length + (v.videos || []).length + (v.whitepapers || []).length;
  }
  function shopLink(code) { var b = CFG.shopUrl || "#"; return b + (code ? ("?q=" + encodeURIComponent(code)) : ""); }

  /* ---------- boot ---------- */
  function boot() {
    fetch("/api/data").then(function (r) { return r.json(); }).then(function (d) {
      STATE.data = d;
      var shop = el("shopCta"); if (shop) shop.href = shopLink("");
      var foot = el("footMeta"); if (foot) foot.textContent = "Le Mag Campus Nancy · maj " + (d.build_date || "");
      route();
    }).catch(function (e) {
      el("mainContent").innerHTML = '<div class="empty">Erreur de chargement. ' + esc(e.message) + "</div>";
    });
    window.addEventListener("hashchange", route);
    initTheme();
    var s = el("globalSearch"); if (s) s.addEventListener("input", onSearch);
  }

  function applyTheme(slug) {
    var t = th(slug);
    var root = document.documentElement;
    if (t) {
      root.style.setProperty("--cyan", t.color || "#00BFFF");
      root.style.setProperty("--secondary", t.color_secondary || "#1B1B27");
    } else {
      root.style.setProperty("--cyan", "#00BFFF");
    }
    var suf = el("brandSuffix");
    if (suf) suf.textContent = t ? ("." + (t.discipline || "").toLowerCase().replace(/\s/g, "")) : "";
  }

  /* ---------- routing ---------- */
  function route() {
    var h = (location.hash || "").replace(/^#/, "");
    var p = h.split("/");
    if (p[0] === "theme" && p[1]) {
      STATE.slug = p[1];
      applyTheme(p[1]);
      renderSidebar(p[1]);
      if (p[2] === "module" && p[3]) return renderModule(p[1], p[3]);
      if (p[2] === "fiche" && p[3]) {
        /* Redirection : la fiche individuelle a été remplacée par la page module enrichie. */
        var code = decodeURIComponent(p[3]);
        var hit = null;
        fichesOf(p[1]).forEach(function (x) { if (x.fiche.code === code) hit = x.mod; });
        if (hit) { location.replace("#theme/" + p[1] + "/module/" + hit); return; }
        return renderTheme(p[1]);
      }
      if (p[2] === "tool" && p[3]) return renderTool(p[1], decodeURIComponent(p[3]));
      return renderTheme(p[1]);
    }
    if (p[0] === "newsletter") {
      STATE.slug = null; applyTheme(null); renderSidebar(null);
      return renderNewsletter();
    }
    if (p[0] === "confidentialite") {
      STATE.slug = null; applyTheme(null); renderSidebar(null);
      return renderConfidentialite();
    }
    if (p[0] === "notes") {
      STATE.slug = null; applyTheme(null); renderSidebar(null);
      var main = el("mainContent");
      if (main && window.tablonoirRenderNotesPage) { window.tablonoirRenderNotesPage(main); return; }
    }
    STATE.slug = null;
    applyTheme(null);
    renderSidebar(null);
    return renderHome();
  }

  /* ---------- sidebar ---------- */
  function renderSidebar(slug) {
    var nav = el("moduleNav"), lbl = el("modulesLabel"), home = el("homeNav");
    if (!slug) {
      if (lbl) lbl.textContent = "Les " + Object.keys(themes()).length + " thèmes";
      if (home) home.style.display = "none";
      nav.innerHTML = Object.keys(themes()).map(function (s) {
        var t = themes()[s];
        return '<a class="sidebar-item" href="#theme/' + esc(s) + '">' +
          '<span class="dot" style="background:' + esc(t.color) + '"></span>' +
          '<span class="label">' + esc(t.discipline) + "</span>" +
          '<span class="mod-count">' + countResources(s) + "</span></a>";
      }).join("");
    } else if (hasTools(slug)) {
      if (home) home.style.display = "";
      if (lbl) lbl.textContent = Object.keys(toolsOf(slug)).length + " outils";
      nav.innerHTML = Object.keys(toolsOf(slug)).map(function (k) {
        var to = toolsOf(slug)[k];
        return '<a class="sidebar-item" href="#theme/' + esc(slug) + "/tool/" + esc(k) + '">' +
          '<span class="dot" style="background:var(--cyan)"></span>' +
          '<span class="label">' + esc(to.name) + "</span></a>";
      }).join("");
    } else {
      if (home) home.style.display = "";
      if (lbl) lbl.textContent = modKeys(slug).length + " modules";
      nav.innerHTML = modKeys(slug).map(function (k) {
        var m = modulesOf(slug)[k];
        return '<a class="sidebar-item" href="#theme/' + esc(slug) + "/module/" + esc(k) + '">' +
          '<span class="mod-num">' + esc(("0" + (m.num || k)).slice(-2)) + "</span>" +
          '<span class="label">' + esc(m.short || m.title) + "</span>" +
          '<span class="mod-count">' + countModuleResources(m) + "</span></a>";
      }).join("");
    }
  }

  /* ---------- vignette ---------- */
  /* Proxy d'image pour contourner les blocages anti-hotlink des sites sources. */
  function proxyImage(url) {
    if (!url) return "";
    /* On nettoie : si plusieurs URLs concatenees par virgule (mal extrait), garde la premiere */
    var u = String(url).split(",")[0].trim();
    if (!/^https?:\/\//i.test(u)) return "";
    return "https://wsrv.nl/?url=" + encodeURIComponent(u) + "&w=640&output=jpg&we&n=-1";
  }

  /* Thumbnail YouTube réelle déduite de l'URL de la ressource.
     mqdefault = 320x180, 16:9 natif (hqdefault est en 4:3 avec bandes noires). */
  function youtubeThumb(url) {
    var m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    return m ? "https://i.ytimg.com/vi/" + m[1] + "/mqdefault.jpg" : "";
  }
  /* Variante redimensionnée d'une URL Unsplash (les cartes n'ont pas besoin du 1600px) */
  function imgW(url, w) {
    return String(url || "").replace(/([?&])w=\d+/, "$1w=" + w);
  }
  /* Favicon du domaine source — petit visuel quand la ressource n'a pas d'image */
  function faviconUrl(url) {
    var m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
    return m ? "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(m[1]) : "";
  }

  /* Détermine la catégorie de la vignette à partir du type/source/url */
  function vignetteKind(item) {
    var t = (item.type || "").toLowerCase();
    var u = (item.url || "").toLowerCase();
    if (/vid[ée]o|youtube|ted|talk|conf[ée]rence/.test(t) || /youtube\.com|youtu\.be|ted\.com/.test(u)) return "video";
    if (/livre|book|mooc|cours/.test(t)) return "book";
    if (/[ée]tude|rapport|whitepaper|livre blanc|recherche|paper/.test(t) || /scholar|cairn/.test(u)) return "study";
    if (/actu|news/.test(t)) return "news";
    return "article";
  }
  /* Icône SVG par catégorie (overlay sur la vignette) */
  function kindIcon(kind) {
    switch (kind) {
      case "video": return '<svg viewBox="0 0 24 24" width="38" height="38" fill="#fff"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="M10 8l6 4-6 4z"/></svg>';
      case "book": return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
      case "study": return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';
      case "news": return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>';
      default: return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    }
  }
  function vignette(item) {
    var type = item.type || "Lien";
    var title = item.title || item.label || "";
    var src = item.source || "";
    var kind = vignetteKind(item);
    var imgSrc = item.image ? proxyImage(item.image) : youtubeThumb(item.url);
    var hasThumb = !!imgSrc;
    var thumbOverlay = kind === "video" ? '<div class="vignette-play">' + kindIcon("video") + '</div>' : "";
    var img = imgSrc ? '<div class="vignette-thumb"><img src="' + esc(imgSrc) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'; this.closest(\'.vignette\').classList.remove(\'has-thumb\');">' + thumbOverlay + '</div>' : "";
    var noThumbIcon = !imgSrc ? '<div class="vignette-icon">' + kindIcon(kind) + '</div>' : "";
    var fav = !hasThumb ? faviconUrl(item.url) : "";
    var favImg = fav ? '<img class="vignette-fav" src="' + esc(fav) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : "";
    return '<a class="vignette k-' + kind + (hasThumb ? ' has-thumb' : '') + ' t-' + esc(type.toLowerCase()) + '" href="' + esc(item.url || "#") + '" target="_blank" rel="noopener">' +
      img +
      '<div class="vignette-top"><span class="vignette-type">' + esc(type) + "</span></div>" +
      noThumbIcon +
      '<div class="vignette-body"><div class="vignette-title">' + esc(title) + "</div>" +
      (src ? '<div class="vignette-src mono">' + favImg + esc(src) + " ↗</div>" : "") + "</div></a>";
  }
  function vignetteGrid(items, extraClass) {
    /* Une même og:image générique (bannière du site) ne s'affiche qu'une fois par grille ;
       les doublons retombent sur le favicon — évite le mur de bannières identiques. */
    var seen = {};
    return '<div class="vignette-grid' + (extraClass ? ' ' + extraClass : '') + '">' + (items || []).map(function (it) {
      if (it && it.image) {
        if (seen[it.image]) {
          var copy = {}; for (var k in it) { if (k !== "image") copy[k] = it[k]; }
          it = copy;
        } else { seen[it.image] = 1; }
      }
      return vignette(it);
    }).join("") + "</div>";
  }

  /* ---------- Le Récap ---------- */
  function recapPicto() {
    return '<svg class="recap-picto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/><path d="M6.5 8.5h8M6.5 11.5h5"/></svg>';
  }
  function recapItems(slug) {
    var items = [], t = th(slug), v = (t && t.veille) || {};
    if (v.articles && v.articles.length) v.articles.forEach(function (a) { items.push({ type: a.source || "Article", title: a.title || a.label, source: a.source, url: a.url, image: a.image }); });
    var mods = modulesOf(slug);
    modKeys(slug).forEach(function (k) { (mods[k].feed || []).slice(0, 1).forEach(function (f) { items.push(f); }); });
    return items.slice(0, 6);
  }
  function recapHead(name, accroche) {
    return '<div class="recap-head">' + recapPicto() +
      '<div><div class="recap-name">' + esc(name) + "</div>" +
      '<div class="recap-accroche">' + esc(accroche) + "</div></div>" +
      '<a class="recap-soon recap-soon-live" href="#newsletter">Recevoir Le Récap chaque dim. →</a></div>';
  }
  function recapDossier(v) {
    var d = v && v.dossier;
    if (!d || !d.file) return "";
    var url = "/static/" + d.file;
    var icon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15l3 3 3-3"/></svg>';
    return '<a class="dossier-link" href="' + url + '" download>' + icon +
      '<span><strong>Télécharger le dossier complet</strong>' +
      (d.title ? '<span class="dossier-sub">' + esc(d.title) + " · PDF</span>" : '<span class="dossier-sub">PDF</span>') +
      "</span></a>";
  }
  function recapSection(slug) {
    var t = th(slug), items = recapItems(slug), v = (t && t.veille) || {};
    if (!items.length) return "";
    var recapEnd = '<div class="nl-recap-end">' +
      '<div class="nl-fb-tag">// NEWSLETTER</div>' +
      '<h3>Reçois Le Récap chaque dimanche</h3>' +
      '<p>Tout ça, livré dans ta boîte mail. Désabonnement en 1 clic.</p>' +
      newsletterFormHTML("recap") +
    '</div>';
    return '<section class="band recap-band">' +
      recapHead("Le Récap " + t.discipline, "Chaque semaine, l'essentiel de l'actu " + t.discipline.toLowerCase() + " — trié, sourcé, lu en 5 minutes.") +
      (v.synthese ? '<p class="recap-synthese">' + esc(v.synthese) + "</p>" : "") +
      recapDossier(v) +
      vignetteGrid(items) + recapEnd + "</section>";
  }
  function recapHomePromo() {
    return '<section class="band inverted recap-band">' +
      recapHead("Le Récap", "Chaque dimanche, l'essentiel de l'actu pro — par discipline. Trié, sourcé, lu en 5 minutes.") +
      '<p class="recap-note mono">Choisis une discipline ci-dessus pour voir son Récap de la semaine.</p></section>';
  }

  /* ---------- discipline icons ---------- */
  var DISCIPLINE_ICONS = {
    marketing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    management: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    'relation-client': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-4a9 9 0 0 1 18 0v4"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"/></svg>',
    'ressources-humaines': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><path d="M19 8v6M16 11h6"/></svg>',
    'gestion-de-projet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>',
    'outils-transversaux': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    ia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>'
  };
  function disciplineIcon(slug) { return DISCIPLINE_ICONS[slug] || DISCIPLINE_ICONS.marketing; }

  /* ---------- HOME (umbrella) ---------- */
  function renderHome() {
    var ts = themes();
    var totF = Object.keys(ts).reduce(function (a, s) { return a + countFiches(s); }, 0);
    /* Hero éditorial : on récupère le dossier IA + les 3 dernières actus IA pour mise en avant */
    var ia = th('ia') || {}, iaVeille = ia.veille || {}, iaDossier = iaVeille.dossier || null;
    var iaNews = [];
    (ia.tool_groups || []).forEach(function (g) {
      (g.news || []).forEach(function (n) { iaNews.push({ src: g.name, n: n }); });
    });
    iaNews = iaNews.slice(0, 5);
    var html = "";
    html += '<div class="home-banner">'
      + '<div class="home-banner-tag"><span class="home-banner-tag-dot"></span>Le Mag Campus Nancy — Édition ' + (window.TABLONOIR && window.TABLONOIR.buildYear || new Date().getFullYear()) + '</div>'
      + '</div>';
    /* Présentation campus unifiée — pas de segmentation par école */
    html += '<section class="schools-banner">'
      + '<div class="schools-banner-head">'
      + '<div class="schools-banner-tag">// Campus Eduservices Nancy</div>'
      + '<div class="schools-banner-sub">Un campus, 700+ étudiants, au cœur des Rives-de-Meurthe — commerce, communication, digital, RH, gestion et sport business, du BTS au MBA.</div>'
      + '</div>'
      + '<div class="campus-chips">'
      +   '<span class="campus-chip">700+ étudiants</span>'
      +   '<span class="campus-chip">Rives-de-Meurthe · Nancy</span>'
      +   '<span class="campus-chip">BTS · Bachelor · MBA</span>'
      + '</div>'
      + '</section>';
    html += '<section class="hero home-hero hero-visual hero-editorial">' +
      '<div class="hero-bg"><svg viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="hg1" cx="20%" cy="30%" r="60%"><stop offset="0%" stop-color="#00BFFF" stop-opacity=".55"/><stop offset="100%" stop-color="#00BFFF" stop-opacity="0"/></radialGradient><radialGradient id="hg2" cx="80%" cy="70%" r="50%"><stop offset="0%" stop-color="#C084FC" stop-opacity=".4"/><stop offset="100%" stop-color="#C084FC" stop-opacity="0"/></radialGradient><pattern id="hp1" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="30" cy="30" r="1.5" fill="rgba(255,255,255,0.05)"/></pattern></defs><rect width="1200" height="460" fill="url(#hp1)"/><rect width="1200" height="460" fill="url(#hg1)"/><rect width="1200" height="460" fill="url(#hg2)"/></svg></div>' +
      '<div class="hero-editorial-grid">' +
        '<div class="hero-text">' +
          '<div class="hero-badge">LE MAG · ÉDITION ' + esc((STATE.data.build_date || "").slice(0, 7).replace('-', '/')) + "</div>" +
          '<h1>Le mag <span class="accent">qui sert tes études</span>, semaine après semaine.</h1>' +
          '<p class="hero-sub">12 thématiques, ' + Object.keys(ts).reduce(function (a, s) { return a + countResources(s); }, 0) + ' ressources vérifiées et triées par tes profs : culture générale, anglais, CEJM, marketing, com, RH, gestion, IA. Et un Récap chaque dimanche.</p>' +
        '</div>' +
        (iaDossier ? (
          '<a class="hero-featured" href="' + esc('/static/' + (iaDossier.file || '')) + '" target="_blank" rel="noopener">' +
            '<div class="hero-featured-tag mono">// DOSSIER DU MOIS · IA</div>' +
            '<div class="hero-featured-title">' + esc(iaDossier.title || "") + '</div>' +
            '<div class="hero-featured-stand">' + esc((iaDossier.standfirst || "").slice(0, 180)) + (iaDossier.standfirst && iaDossier.standfirst.length > 180 ? "…" : "") + '</div>' +
            '<div class="hero-featured-cta mono">Télécharger le dossier (PDF) →</div>' +
          '</a>'
        ) : '') +
      '</div>' +
      (iaNews.length ? (
        '<div class="hero-ticker">' +
          '<span class="hero-ticker-label mono">// ACTUS IA</span>' +
          '<div class="hero-ticker-track">' +
            iaNews.map(function (it) {
              return '<a class="hero-ticker-item" href="' + esc(it.n.url || "#") + '" target="_blank" rel="noopener">' +
                '<span class="hero-ticker-src mono">' + esc(it.n.source || "") + '</span> ' +
                '<span class="hero-ticker-t">' + esc(it.n.title || "") + '</span></a>';
            }).join('') +
          '</div>' +
        '</div>'
      ) : '') +
      '</section>';
    html += '<section class="band"><div class="band-tag">// LES DISCIPLINES</div><h2>Choisis ton thème</h2>' +
      '<div class="theme-grid">' + Object.keys(ts).map(function (s) {
        var t = ts[s];
        return '<a class="theme-card" href="#theme/' + esc(s) + '" style="--c:' + esc(t.color) + '">' +
          '<div class="theme-card-bar"></div>' +
          (t.image ? '<div class="theme-card-photo"><img src="' + esc(imgW(t.image, 640)) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></div>' : '') +
          '<div class="theme-card-body">' +
          (t.image ? "" : '<div class="theme-card-icon">' + disciplineIcon(s) + "</div>") +
          '<div class="theme-card-title">' + esc(t.discipline) + "</div>" +
          '<div class="theme-card-tag">' + esc(t.tagline || "") + "</div>" +
          '<div class="theme-card-foot mono">' + (t.tools && Object.keys(t.tools).length ? (Object.keys(t.tools).length + " outils · mode tuto →") : (modKeys(s).length + " modules · " + countResources(s) + " ressources →")) + "</div>" +
          "</div></a>";
      }).join("") + "</div></section>";
    html += recapHomePromo();
    html += '<section class="nl-footer-box">' +
      '<div class="nl-fb-tag">// LE RÉCAP HEBDO</div>' +
      '<h3>Une fois par semaine, l\'essentiel dans ta boîte mail.</h3>' +
      '<p>Le Récap, c\'est 15 min pour faire le point : actu IA, méthodes qui marchent, ressources triées. Zéro fluff, désabo en 1 clic.</p>' +
      newsletterFormHTML("card") +
    '</section>';
    setMain(html);
    window.scrollTo(0, 0);
  }

  /* ---------- THEME landing ---------- */
  function renderTheme(slug) {
    var t = th(slug); if (!t) return renderHome();
    var v = t.veille || {}, hero = v.hero || {};
    var html = "";
    html += '<div class="crumb mono"><a href="#">Accueil</a> / ' + esc(t.discipline) + "</div>";
    /* Bandeau photo par thématique : photo + voile bleu marine (lisibilité texte) */
    var themePhoto = t.image ? 'background-image:linear-gradient(90deg,rgba(2,24,45,.93),rgba(2,24,45,.55)),url(' + esc(t.image) + ');' : '';
    html += '<section class="hero theme-hero' + (t.image ? ' has-photo' : '') + '" style="--c:' + esc(t.color || "#00BFFF") + ';' + themePhoto + '">' +
      '<div class="theme-hero-bg"><div class="theme-hero-icon">' + disciplineIcon(slug) + '</div></div>' +
      '<div class="hero-badge">' + esc(t.discipline.toUpperCase()) + " · VEILLE</div>" +
      "<h1>" + esc(hero.title_main || t.tagline) + ' <span class="accent">' + esc(hero.title_accent || "") + "</span></h1>" +
      '<p class="hero-sub">' + esc(hero.subtitle || "") + "</p>" +
      '<div class="hero-meta mono">' + (hasTools(slug) ? (Object.keys(toolsOf(slug)).length + " outils · mode tuto") : (modKeys(slug).length + " modules · " + countResources(slug) + " ressources")) + "</div></section>";
    html += recapSection(slug);

    if (v.stats && v.stats.length) {
      html += '<section class="band"><div class="band-tag">// LES CHIFFRES</div><h2>Ce que disent les données</h2><div class="stat-grid">' +
        v.stats.map(function (s) {
          return '<div class="stat"><div class="stat-val">' + esc(s.value || s.stat || "") + "</div>" +
            '<div class="stat-label">' + esc(s.label || s.text || "") + "</div>" +
            '<div class="stat-src mono">' + esc(s.source || "") + "</div></div>";
        }).join("") + "</div></section>";
    }
    if (hasTools(slug)) {
      var tools = toolsOf(slug), groups = toolGroupsOf(slug);
      if (!groups.length) { groups = [{ name: "Outils", slugs: Object.keys(tools) }]; }
      groups.forEach(function (grp) {
        var newsHtml = "";
        if (grp.news && grp.news.length) {
          newsHtml = '<div class="group-news-head mono">// Actus à suivre</div>' +
            vignetteGrid(grp.news.map(function (a) { return { type: a.type || "Actu", title: a.title, source: a.source, url: a.url, image: a.image }; }));
        }
        html += '<section class="band"><div class="band-tag">// ' + esc((grp.name || "").toUpperCase()) + '</div><h2>' + esc(grp.name || "") + '</h2><div class="tool-grid">' +
          (grp.slugs || []).map(function (k) {
            var to = tools[k]; if (!to) return "";
            return '<a class="tool-card" href="#theme/' + esc(slug) + "/tool/" + esc(k) + '">' +
              (to.logo ? '<div class="tool-card-logo"><img src="' + esc(to.logo) + '" alt="' + esc(to.name) + ' logo" loading="lazy"></div>' : '') +
              '<div class="tool-card-by mono">' + esc(to.by || "") + "</div>" +
              '<div class="tool-card-title">' + esc(to.name) + "</div>" +
              '<div class="tool-card-tag">' + esc(to.tagline || "") + "</div>" +
              '<div class="tool-card-foot mono">Mode tuto →</div></a>';
          }).join("") + "</div>" + newsHtml + "</section>";
      });
    } else {
      /* Modules en accès rapide (chips compactes) — la sidebar les liste déjà */
      html += '<section class="band module-strip-band"><div class="band-tag">// LES MODULES</div><div class="module-strip">' +
        modKeys(slug).map(function (k) {
          var m = modulesOf(slug)[k];
          return '<a class="module-chip" href="#theme/' + esc(slug) + "/module/" + esc(k) + '">' +
            '<span class="module-chip-num mono">' + esc(("0" + (m.num || k)).slice(-2)) + "</span>" +
            '<span>' + esc(m.short || m.title) + "</span></a>";
        }).join("") + "</div></section>";
      /* Veille agrégée du thème, répartie par sources (comme le mag perso),
         en grosses vignettes quinconce (masonry façon feed tablette) */
      var agg = { articles: [], videos: [], whitepapers: [], books: [] };
      var seenUrl = {};
      modKeys(slug).forEach(function (k) {
        var mv = modulesOf(slug)[k].veille || {};
        ["articles", "videos", "whitepapers", "books"].forEach(function (kk) {
          (mv[kk] || []).forEach(function (r) {
            var key = kk + "|" + (r.url || "");
            if (r.url && !seenUrl[key]) { seenUrl[key] = 1; agg[kk].push(r); }
          });
        });
      });
      var tGroups = [["Articles & blogs", agg.articles], ["Vidéos & conférences", agg.videos], ["Études & livres blancs", agg.whitepapers], ["Livres & MOOCs", agg.books]];
      if (tGroups.some(function (g) { return g[1].length; })) {
        html += '<section class="band"><div class="band-tag">// LA VEILLE ' + esc(t.discipline.toUpperCase()) + '</div><h2>Ce qu\'il faut lire, regarder et explorer</h2>';
        tGroups.forEach(function (g) { if (g[1].length) html += '<h3 class="res-h">' + esc(g[0]) + "</h3>" + vignetteGrid(g[1], "vignette-masonry"); });
        html += "</section>";
      }
    }
    if (t.channels && t.channels.length) {
      html += '<section class="band"><div class="band-tag">// VEILLE VIDÉO</div><h2>Chaînes YouTube à suivre</h2>' +
        '<p class="channel-intro">Une sélection curée de créateurs francophones pour suivre l\'actu IA et progresser en pratique. Liens directs vers leurs chaînes officielles.</p>' +
        '<div class="channel-grid">' +
        t.channels.map(function (c) {
          var tags = (c.tags || []).map(function (g) { return '<span class="channel-tag">' + esc(g) + '</span>'; }).join("");
          return '<a class="channel-card" href="' + esc(c.url) + '" target="_blank" rel="noopener">' +
            '<div class="channel-yt-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="#FF0000" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.121 2.136c1.873.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff"/></svg></div>' +
            '<div class="channel-card-top">' +
              '<div class="channel-name">' + esc(c.name) + "</div>" +
              '<div class="channel-handle mono">' + esc(c.handle || "") + (c.audience ? " · " + esc(c.audience) : "") + "</div>" +
            "</div>" +
            '<div class="channel-focus">' + esc(c.focus) + "</div>" +
            '<div class="channel-tags">' + tags + "</div>" +
            '<div class="channel-go mono">Voir la chaîne →</div>' +
          "</a>";
        }).join("") + "</div></section>";
    }
    setMain(html);
    window.scrollTo(0, 0);
  }

  /* ---------- TOOL (page tuto) ---------- */
  function renderTool(slug, key) {
    var t = th(slug); if (!t) return renderHome();
    var to = (t.tools || {})[key];
    if (!to) return renderTheme(slug);
    var html = "";
    html += '<div class="crumb mono"><a href="#">Accueil</a> / <a href="#theme/' + esc(slug) + '">' + esc(t.discipline) + "</a> / " + esc(to.name) + "</div>";
    /* Reading time : estimation à partir du contenu rédactionnel (~200 mots/min) */
    var wordCount = 0;
    if (to.what) wordCount += to.what.split(/\s+/).length;
    if (to.what_for) wordCount += to.what_for.split(/\s+/).length;
    (to.tuto || []).forEach(function (sec) {
      (sec.paras || []).forEach(function (p) { wordCount += p.split(/\s+/).length; });
    });
    (to.use_cases || []).forEach(function (u) {
      if (u.desc) wordCount += u.desc.split(/\s+/).length;
    });
    var readingMin = Math.max(1, Math.round(wordCount / 200));
    html += '<section class="tool-hero">' +
      (to.logo ? '<div class="tool-hero-logo"><img src="' + esc(to.logo) + '" alt="' + esc(to.name) + ' logo"></div>' : '') +
      '<div class="tool-hero-by mono">' + esc(to.by || "") + " · " + esc(to.family || "") + ' · <span class="reading-time">⏱ ' + readingMin + ' min de lecture</span></div>' +
      "<h1>" + esc(to.name) + "</h1>" +
      (to.tagline ? '<p class="tool-hero-tag">' + esc(to.tagline) + "</p>" : "") +
      "</section>";

    if (to.what) {
      html += '<section class="band"><div class="band-tag">// C\'EST QUOI</div>' +
        '<p class="accroche">' + esc(to.what) + "</p>" +
        (to.what_for ? '<p class="tool-whatfor"><strong>À quoi ça sert :</strong> ' + esc(to.what_for) + "</p>" : "") +
        "</section>";
    }

    if (to.tuto && to.tuto.length) {
      html += '<section class="band inverted"><div class="band-tag">// TUTORIEL COMPLET</div><h2>Tout savoir pour bien démarrer</h2><div class="tuto">' +
        to.tuto.map(function (sec) {
          return '<div class="tuto-section"><h3 class="tuto-h">' + esc(sec.heading || "") + '</h3>' +
            (sec.paras || []).map(function (p) { return '<p class="tuto-p">' + esc(p) + "</p>"; }).join("") +
            "</div>";
        }).join("") + "</div></section>";
    }

    if (to.use_cases && to.use_cases.length) {
      html += '<section class="band"><div class="band-tag">// CAS D\'USAGE</div><h2>Quand l\'utiliser</h2><div class="usecase-grid">' +
        to.use_cases.map(function (u) {
          return '<div class="usecase"><div class="usecase-title">' + esc(u.title) + "</div>" +
            '<div class="usecase-desc">' + esc(u.desc || "") + "</div></div>";
        }).join("") + "</div></section>";
    }

    if (to.resources && to.resources.length) {
      html += '<section class="band"><div class="band-tag">// MEILLEURS TUTOS & SOURCES</div><h2>Pour aller plus loin</h2>' +
        vignetteGrid(to.resources.map(function (r) {
          return { type: r.type || "Lien", title: r.title, source: r.type || "", url: r.url, image: r.image };
        })) + "</section>";
    }

    if ((to.tips && to.tips.length) || (to.traps && to.traps.length)) {
      html += '<section class="band inverted"><div class="tips-grid">';
      if (to.tips && to.tips.length) {
        html += '<div class="tips-col"><div class="band-tag">// ASTUCES</div><ul class="tips">' +
          to.tips.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
      }
      if (to.traps && to.traps.length) {
        html += '<div class="tips-col"><div class="band-tag">// PIÈGES À ÉVITER</div><ul class="traps">' +
          to.traps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
      }
      html += "</div></section>";
    }

    setMain(html);
    window.scrollTo(0, 0);
  }

  /* ---------- MODULE ---------- */
  function renderModule(slug, num) {
    var t = th(slug); if (!t) return renderHome();
    var m = modulesOf(slug)[num]; if (!m) return renderTheme(slug);
    /* Photo du module, sinon celle du thème (cohérence visuelle des hero) */
    var img = (m.media && m.media.images && m.media.images[0] && m.media.images[0].url) || m.image || t.image || "";
    var fiches = m.fiches || [];

    /* Ressources : on privilégie la curation au niveau module (m.veille), sinon
       on retombe sur l'agrégation dédupliquée des fiches. */
    var agg = { articles: [], videos: [], whitepapers: [], books: [] };
    var mv = m.veille || {};
    var curated = ["articles", "videos", "whitepapers", "books"].some(function (k) { return (mv[k] || []).length; });
    if (curated) {
      ["articles", "videos", "whitepapers", "books"].forEach(function (k) { agg[k] = (mv[k] || []).slice(); });
    } else {
      var seen = {};
      fiches.forEach(function (f) {
        var v = f.veille || {};
        ["articles", "videos", "whitepapers", "books"].forEach(function (k) {
          (v[k] || []).forEach(function (r) {
            var u = r.url || "";
            var key = k + "|" + u;
            if (u && !seen[key]) { seen[key] = 1; agg[k].push(r); }
          });
        });
      });
    }

    /* Une vidéo de référence pour le module : la première fiche qui en a une (et valide) */
    var refVideo = null;
    fiches.some(function (f) {
      if (f.related_video && f.related_video.id) { refVideo = f.related_video; return true; }
    });

    var html = "";
    html += '<div class="crumb mono"><a href="#">Accueil</a> / <a href="#theme/' + esc(slug) + '">' + esc(t.discipline) + "</a> / Module " + esc(m.num || num) + "</div>";

    /* Hero module */
    html += '<section class="mod-hero"' + (img ? ' style="background-image:linear-gradient(90deg,rgba(2,24,45,.95),rgba(2,24,45,.6)),url(' + esc(img) + ')"' : "") + ">" +
      '<div class="mod-hero-tag mono">' + esc(m.tag || ("MODULE " + (m.num || num))) + "</div><h1>" + esc(m.title) + "</h1>" +
      (m.punchline ? "<p>" + esc(m.punchline) + "</p>" : "") + "</section>";

    /* Actus / feed du module — on cache cette section si on a déjà une curation propre (m.veille),
       sinon le legacy m.feed (souvent vide ou générique) parasite la page. */
    if (m.feed && m.feed.length && !curated) {
      html += '<section class="band"><div class="band-tag">// ACTUS DU MODULE</div><h2>À suivre sur ce thème</h2>' +
        vignetteGrid(m.feed) + "</section>";
    }

    /* Ressources veille agrégées des fiches */
    var groups = [["Articles & blogs", agg.articles], ["Vidéos & conférences", agg.videos], ["Études & livres blancs", agg.whitepapers], ["Livres & MOOCs", agg.books]];
    var anyRes = groups.some(function (g) { return g[1].length; });
    if (anyRes) {
      html += '<section class="band"><div class="band-tag">// RESSOURCES &amp; VEILLE</div><h2>Ce qu\'il faut lire, regarder et explorer</h2>';
      groups.forEach(function (g) { if (g[1].length) html += '<h3 class="res-h">' + esc(g[0]) + "</h3>" + vignetteGrid(g[1], "vignette-masonry"); });
      html += "</section>";
    }

    /* Vidéo de référence du module */
    if (refVideo) {
      html += '<section class="band inverted"><div class="band-tag">// EN VIDÉO</div><div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/' +
        esc(refVideo.id) + '" title="' + esc(refVideo.title || "") + '" frameborder="0" allowfullscreen loading="lazy"></iframe></div>' +
        '<div class="video-cap mono">' + esc(refVideo.title || "") + " · " + esc(refVideo.channel || "") + "</div></section>";
    }

    setMain(html);
    window.scrollTo(0, 0);
  }

  /* ---------- search live (dropdown preview) ---------- */
  function searchResults(qv) {
    var scope = STATE.slug ? [STATE.slug] : Object.keys(themes());
    var res = [];
    scope.forEach(function (s) {
      fichesOf(s).forEach(function (x) {
        var f = x.fiche;
        if ((f.title || "").toLowerCase().indexOf(qv) >= 0 || (f.code || "").toLowerCase().indexOf(qv) >= 0 || (f.accroche || "").toLowerCase().indexOf(qv) >= 0)
          res.push({ slug: s, mod: x.mod, f: f });
      });
    });
    return res;
  }
  function closeSearchPreview() {
    var dd = el('searchPreview'); if (dd) dd.remove();
  }
  function showSearchPreview(qv, res) {
    closeSearchPreview();
    var input = el('globalSearch'); if (!input) return;
    var top = res.slice(0, 6);
    var html = '<div id="searchPreview" class="search-preview">';
    if (!top.length) {
      html += '<div class="search-empty">Aucun résultat pour « ' + esc(qv) + ' »</div>';
    } else {
      top.forEach(function (r) {
        html += '<a class="search-preview-item" href="#theme/' + esc(r.slug) + '/module/' + esc(r.mod) + '#fiche-' + esc(r.f.code) + '">' +
          '<span class="sp-code mono">' + esc(r.f.code) + '</span>' +
          '<span class="sp-body"><span class="sp-title">' + esc(r.f.title) + '</span>' +
          '<span class="sp-meta mono">' + esc((th(r.slug) || {}).discipline || '') + '</span></span></a>';
      });
      if (res.length > top.length) {
        html += '<a class="search-preview-more" href="#search/' + encodeURIComponent(qv) + '">Voir les ' + res.length + ' résultats →</a>';
      }
    }
    html += '</div>';
    input.insertAdjacentHTML('afterend', html);
    /* click-outside pour fermer */
    setTimeout(function () {
      document.addEventListener('click', function handler(ev) {
        var dd = el('searchPreview');
        if (dd && !dd.contains(ev.target) && ev.target !== input) {
          closeSearchPreview();
          document.removeEventListener('click', handler);
        }
      });
    }, 50);
  }
  function onSearch(e) {
    var qv = (e.target.value || "").trim().toLowerCase();
    if (qv.length < 2) { closeSearchPreview(); return; }
    var res = searchResults(qv);
    showSearchPreview(qv, res);
  }

  function setMain(h) { el("mainContent").innerHTML = h; }

  /* ---------- theme toggle ---------- */
  function initTheme() {
    var saved = null; try { saved = localStorage.getItem("tablonoir-theme"); } catch (e) {}
    if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    try { localStorage.setItem("tablonoir-theme", cur); } catch (e) {}
  }

  window.toggleTheme = toggleTheme;
  document.addEventListener("DOMContentLoaded", boot);

  /* ---------- newsletter form ---------- */
  var BREVO_FORM_URL = "https://d2066031.sibforms.com/serve/MUIFAA7QltXRc7UCwCJSFNzK2eAwiPuQA0hktrWe2TKHDtaYFJ0BpaS6FEjoK6ws1g56h29PzwlSNKi8akohiBXubmifEvFzWY_2HjyMsuQ1LoR0Nf5wIXGrR_DHZm3fA1FTGkQZNvL7nIVWtOV4V1fMbrIowkEaESt3SV3Up23F0VfcqKsw1D931vvjqGzWjVpUhQ2RjdehVBv9Lw==";

  function newsletterFormHTML(layout) {
    layout = layout || "card";
    var formId = "nl-" + Math.random().toString(36).slice(2, 7);
    return (
      '<form class="nl-form nl-form-' + layout + '" method="POST" action="' + BREVO_FORM_URL + '" id="' + formId + '" onsubmit="return tablonoirSubmitNewsletter(this, event)">' +
        '<div class="nl-row">' +
          '<input type="email" name="EMAIL" required placeholder="ton@email.fr" autocomplete="email" class="nl-input" />' +
          '<button type="submit" class="nl-btn">M’inscrire</button>' +
        '</div>' +
        '<input type="text" name="email_address_check" value="" class="nl-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />' +
        '<input type="hidden" name="locale" value="fr" />' +
        '<p class="nl-fineprint">En t’inscrivant, tu acceptes notre <a href="#confidentialite">politique de confidentialité</a>. Désabonnement en 1 clic.</p>' +
      '</form>'
    );
  }

  function renderNewsletter() {
    var main = el("mainContent"); if (!main) return;
    main.innerHTML =
      '<section class="newsletter-hero">' +
        '<div class="nl-hero-tag">Le Récap, chaque dimanche</div>' +
        '<h1 class="nl-hero-title">Une newsletter pour rester pertinent toute la semaine.</h1>' +
        '<p class="nl-hero-sub">15 minutes de lecture, 7 disciplines couvertes, zéro fluff. ' +
          'Ce que tu auras lu d’avance : les actus IA fraîches, les méthodes qui marchent, les sources fiables.</p>' +
        '<div class="nl-hero-form">' + newsletterFormHTML("hero") + '</div>' +
      '</section>' +
      '<section class="nl-promise">' +
        '<h2 class="nl-h2">Ce que tu reçois</h2>' +
        '<div class="nl-promise-grid">' +
          '<div class="nl-promise-card"><div class="nl-promise-icon">🤖</div>' +
            '<div class="nl-promise-h">L’actu IA décodée</div>' +
            '<div class="nl-promise-d">Les sorties de ChatGPT, Claude, Gemini, Notion AI, Midjourney — avec ce qui change pour toi cette semaine.</div></div>' +
          '<div class="nl-promise-card"><div class="nl-promise-icon">📚</div>' +
            '<div class="nl-promise-h">Une fiche métier mise en avant</div>' +
            '<div class="nl-promise-d">Marketing, management, RH, gestion de projet… une notion approfondie, sources à l’appui.</div></div>' +
          '<div class="nl-promise-card"><div class="nl-promise-icon">🎥</div>' +
            '<div class="nl-promise-h">3 ressources sélectionnées</div>' +
            '<div class="nl-promise-d">Une vidéo, un article, une étude — soigneusement filtrés, sources françaises de qualité.</div></div>' +
          '<div class="nl-promise-card"><div class="nl-promise-icon">🗂️</div>' +
            '<div class="nl-promise-h">Un dossier PDF par mois</div>' +
            '<div class="nl-promise-d">Le dossier IA mensuel, prêt à imprimer, format A4, sans formulaire à remplir.</div></div>' +
        '</div>' +
      '</section>' +
      '<section class="nl-cadence">' +
        '<h2 class="nl-h2">Cadence honnête</h2>' +
        '<p class="nl-text">Un envoi par semaine, le dimanche soir. Pas de spam, pas de relances commerciales, pas de partage à des tiers. ' +
          'Tu te désinscris en un clic depuis n’importe quel email reçu.</p>' +
      '</section>' +
      '<section class="nl-final-cta">' +
        '<h2 class="nl-h2">Prêt à recevoir Le Récap ?</h2>' +
        newsletterFormHTML("card") +
      '</section>';
    document.title = "Newsletter — Le Mag Campus Nancy";
    window.scrollTo(0, 0);
  }

  function renderConfidentialite() {
    var main = el("mainContent"); if (!main) return;
    var year = (window.TABLONOIR && window.TABLONOIR.buildYear) || new Date().getFullYear();
    main.innerHTML =
      '<article class="legal-page">' +
        '<h1>Politique de confidentialité</h1>' +
        '<p class="legal-meta">Dernière mise à jour : juin 2026</p>' +
        '<section><h2>1. Qui est responsable de tes données ?</h2>' +
          '<p>Le Mag Campus Nancy est édité par le campus Eduservices Nancy. ' +
          'Pour toute question relative à tes données personnelles : <a href="mailto:bonjour@news.tablonoir.fr">bonjour@news.tablonoir.fr</a>.</p></section>' +
        '<section><h2>2. Quelles données on collecte</h2>' +
          '<ul><li><strong>Inscription newsletter</strong> : ton adresse email, la date d’inscription, ton statut d’abonnement.</li>' +
          '<li><strong>Annotations personnelles</strong> : tes surlignages et notes restent dans <em>ton</em> navigateur (localStorage). On ne les reçoit jamais.</li>' +
          '<li><strong>Statistiques de visite</strong> : aucune. Pas de Google Analytics, pas de cookies de tracking, pas de pixels publicitaires.</li></ul></section>' +
        '<section><h2>3. Pourquoi on les utilise (finalité)</h2>' +
          '<p>Une seule raison : t’envoyer Le Récap hebdomadaire et le dossier IA mensuel. Pas de revente, pas de partage à des tiers (sauf notre sous-traitant Brevo, voir §5).</p></section>' +
        '<section><h2>4. Sur quelle base légale</h2>' +
          '<p>Ton <strong>consentement</strong> (article 6.1.a du RGPD), donné explicitement en t’inscrivant. Tu peux le retirer à tout moment depuis n’importe quel email reçu (lien de désinscription).</p></section>' +
        '<section><h2>5. Qui traite tes données pour nous (sous-traitants)</h2>' +
          '<p><strong>Brevo SAS</strong> (anciennement Sendinblue) — service d’emailing basé en France. Brevo héberge ta donnée sur des serveurs européens et est certifié RGPD. ' +
          'Voir : <a href="https://www.brevo.com/legal/privacypolicy/" rel="noopener" target="_blank">politique Brevo</a>.</p></section>' +
        '<section><h2>6. Durée de conservation</h2>' +
          '<p>Tant que tu es abonné, ton email reste dans la liste. Si tu te désinscris, on conserve l’historique de désinscription 3 ans (preuve du consentement et de son retrait).</p></section>' +
        '<section><h2>7. Tes droits</h2>' +
          '<p>Tu disposes à tout moment des droits suivants : accès, rectification, effacement, opposition, portabilité. ' +
          'Écris à <a href="mailto:bonjour@news.tablonoir.fr">bonjour@news.tablonoir.fr</a> et tu obtiens une réponse sous 30 jours. ' +
          'En cas de désaccord, tu peux saisir la CNIL : <a href="https://www.cnil.fr" rel="noopener" target="_blank">cnil.fr</a>.</p></section>' +
        '<section><h2>8. Cookies</h2>' +
          '<p>Aucun. Le site ne dépose aucun cookie tiers. Ton thème (clair/sombre) et tes annotations sont stockés dans <em>localStorage</em> — ce n’est pas un cookie, ça reste chez toi.</p></section>' +
        '<p class="legal-meta">© ' + year + ' Le Mag Tablonoir</p>' +
      '</article>';
    document.title = "Confidentialité — Le Mag Campus Nancy";
    window.scrollTo(0, 0);
  }

  // expose
  window.tablonoirRenderNewsletter = renderNewsletter;


  // Global submit handler exposed for inline onsubmit
  window.tablonoirSubmitNewsletter = function (form, ev) {
    ev.preventDefault();
    if (form.dataset.submitting === "1") return false;
    form.dataset.submitting = "1";
    var btn = form.querySelector(".nl-btn");
    var origBtnText = btn ? btn.innerHTML : "";
    if (btn) { btn.innerHTML = "..."; btn.disabled = true; }
    var data = new FormData(form);
    fetch(form.action, { method: "POST", body: data, mode: "no-cors", credentials: "omit" })
      .catch(function () { /* no-cors hides errors anyway */ })
      .then(function () {
        // Replace form with success state
        var msg = document.createElement("div");
        msg.className = "nl-success";
        msg.innerHTML =
          '<div class="nl-success-icon">✓</div>' +
          '<div class="nl-success-h">Inscription enregistrée !</div>' +
          '<div class="nl-success-d">Tu recevras Le Récap chaque dimanche soir. Premier envoi : ce dimanche.</div>';
        form.parentNode.replaceChild(msg, form);
      });
    return false;
  };

})();
