/* ===========================================================
   Foliq render engine
   Turns portfolio JSON into an HTML document. Shared by
   preview.html, editor.html and portfolio.html so the edit
   canvas, the preview tab and the published page are always
   pixel-identical.
   =========================================================== */
(function (global) {

  /* ---------- themes ---------- */
  const THEMES = {
    midnight: {
      label: 'Midnight', bg: '#0b0c10', surface: '#15151f', text: '#f4f5f7', dim: '#a7abba',
      accent: '#7c5cff', accent2: '#ff6b9d', gradient: 'linear-gradient(135deg,#7c5cff,#ff6b9d)',
      headFont: "'Space Grotesk',sans-serif", bodyFont: "'Inter',sans-serif",
      fontImport: "family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700"
    },
    sunset: {
      label: 'Sunset', bg: '#160e0c', surface: '#20140f', text: '#fbf1e9', dim: '#d8b8a4',
      accent: '#ff8a4c', accent2: '#ff4d8d', gradient: 'linear-gradient(135deg,#ff8a4c,#ff4d8d)',
      headFont: "'Space Grotesk',sans-serif", bodyFont: "'Inter',sans-serif",
      fontImport: "family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700"
    },
    forest: {
      label: 'Forest', bg: '#0a1210', surface: '#101b17', text: '#eef7f2', dim: '#a9c2b7',
      accent: '#34c98f', accent2: '#9be15d', gradient: 'linear-gradient(135deg,#34c98f,#9be15d)',
      headFont: "'Inter',sans-serif", bodyFont: "'Inter',sans-serif",
      fontImport: "family=Inter:wght@400;500;600;700;800"
    },
    mono: {
      label: 'Mono', bg: '#0a0a0a', surface: '#141414', text: '#f7f7f5', dim: '#a3a3a0',
      accent: '#ffffff', accent2: '#8f8f8f', gradient: 'linear-gradient(135deg,#ffffff,#8f8f8f)',
      headFont: "'Playfair Display',serif", bodyFont: "'Inter',sans-serif",
      fontImport: "family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700"
    },
    ocean: {
      label: 'Ocean', bg: '#071019', surface: '#0d1b28', text: '#eaf4fb', dim: '#a3c1d4',
      accent: '#3fc8ff', accent2: '#5b7dff', gradient: 'linear-gradient(135deg,#3fc8ff,#5b7dff)',
      headFont: "'Space Grotesk',sans-serif", bodyFont: "'Inter',sans-serif",
      fontImport: "family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700"
    },
    terminal: {
      label: 'Terminal', bg: '#050705', surface: '#0c110c', text: '#c9f7d6', dim: '#7fae8c',
      accent: '#43ff8c', accent2: '#ffd23f', gradient: 'linear-gradient(135deg,#43ff8c,#ffd23f)',
      headFont: "'JetBrains Mono',monospace", bodyFont: "'JetBrains Mono',monospace",
      fontImport: "family=JetBrains+Mono:wght@400;500;600;700"
    }
  };

  const SECTION_LABELS = {
    experience: 'Experience', education: 'Education', projects: 'Projects',
    skills: 'Skills', contact: 'Contact', custom: 'Section'
  };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function slugify(str) {
    return String(str || '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'me';
  }
  function findSection(data, id) { return (data.sections || []).find(s => s.id === id); }

  function getAnimTarget(data, key) {
    if (key === 'hero') return data.hero;
    if (key === 'about') return data.about;
    const m1 = /^section:([^:]+)$/.exec(key);
    if (m1) return findSection(data, m1[1]);
    const m2 = /^section:([^:]+):item:(\d+)$/.exec(key);
    if (m2) { const s = findSection(data, m2[1]); return s && s.items[+m2[2]]; }
    return null;
  }
  function setAnim(data, key, animConfig) {
    const t = getAnimTarget(data, key);
    if (!t) return;
    if (!animConfig) { delete t.animation; return; }
    t.animation = animConfig;
  }
  function getByPath(data, path) {
    const parts = path.split('.');
    let node = data;
    for (const p of parts) {
      const im = /^item:(\d+)$/.exec(p);
      const sm = /^section:(.+)$/.exec(p);
      if (im) node = node.items[+im[1]];
      else if (sm) node = findSection(data, sm[1]);
      else node = node[p];
      if (node == null) return node;
    }
    return node;
  }
  function setByPath(data, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    let node = data;
    for (const p of parts) {
      const im = /^item:(\d+)$/.exec(p);
      const sm = /^section:(.+)$/.exec(p);
      if (im) node = node.items[+im[1]];
      else if (sm) node = findSection(data, sm[1]);
      else node = node[p];
    }
    if (node) node[last] = value;
  }

  function createEmptySection(type) {
    const id = type + '-' + Math.random().toString(36).slice(2, 7);
    const base = { id, type, title: SECTION_LABELS[type] || 'Section', items: [] };
    if (type === 'skills') base.items = [{ heading: 'New skill' }];
    else if (type === 'contact') base.items = [{ label: 'Email', value: 'you@example.com', link: 'mailto:you@example.com' }];
    else base.items = [{ heading: 'Title', subheading: '', period: '', description: 'Describe it here.', tags: [] }];
    return base;
  }

  /* ---------- animation + selection attrs ---------- */
  function animAttrs(node, key, editable) {
    let out = '';
    if (editable) out += ` data-key="${esc(key)}"`;
    if (node && node.animation && node.animation.type && node.animation.type !== 'none') {
      const cfg = JSON.stringify({ type: node.animation.type, delay: Number(node.animation.delay) || 0 }).replace(/"/g, '&quot;');
      out += ` data-anim="${esc(key)}" data-anim-config="${cfg}"`;
    }
    return out;
  }
  function fieldAttr(editable, path) {
    return editable ? ` data-field="${esc(path)}" contenteditable="true" spellcheck="false"` : '';
  }

  /* ---------- item renderers per section type ---------- */
  function renderItem(item, idx, section, editable) {
    const base = `section:${section.id}.item:${idx}`;
    const animKey = `section:${section.id}:item:${idx}`;
    const aa = animAttrs(item, animKey, editable);
    if (section.type === 'skills') {
      return `<span class="f-pill foliq-target"${aa}${fieldAttr(editable, base + '.heading')}>${esc(item.heading)}</span>`;
    }
    if (section.type === 'contact') {
      const href = item.link || '#';
      return `<a class="f-contact-row foliq-target" href="${esc(href)}" target="_blank" rel="noopener"${aa}>
        <span class="f-contact-label"${fieldAttr(editable, base + '.label')}>${esc(item.label)}</span>
        <span class="f-contact-value"${fieldAttr(editable, base + '.value')}>${esc(item.value)}</span>
      </a>`;
    }
    // experience / education / projects / custom
    const tags = (item.tags || []).map(t => `<span class="f-tag">${esc(t)}</span>`).join('');
    return `<div class="f-item foliq-target"${aa}>
      <div class="f-item-top">
        <h4${fieldAttr(editable, base + '.heading')}>${esc(item.heading)}</h4>
        ${item.period ? `<span class="f-period"${fieldAttr(editable, base + '.period')}>${esc(item.period)}</span>` : `<span class="f-period muted-period"${fieldAttr(editable, base + '.period')}></span>`}
      </div>
      ${item.subheading ? `<div class="f-subheading"${fieldAttr(editable, base + '.subheading')}>${esc(item.subheading)}</div>` : ''}
      ${item.description ? `<p class="f-desc"${fieldAttr(editable, base + '.description')}>${esc(item.description)}</p>` : ''}
      ${tags ? `<div class="f-tags">${tags}</div>` : ''}
    </div>`;
  }

  function renderSection(section, editable) {
    const aa = animAttrs(section, `section:${section.id}`, editable);
    const items = (section.items || []).map((it, i) => renderItem(it, i, section, editable)).join('');
    const wrapClass = section.type === 'skills' ? 'f-skills-wrap' : (section.type === 'contact' ? 'f-contact-wrap' : 'f-items-wrap');
    return `<section class="f-section foliq-target" data-section="${esc(section.id)}"${aa}>
      <h3 class="f-section-title"${fieldAttr(editable, `section:${section.id}.title`)}>${esc(section.title)}</h3>
      <div class="${wrapClass}">${items}</div>
    </section>`;
  }

  /* ---------- top level ---------- */
  function renderBody(data, opts) {
    opts = opts || {};
    const editable = !!opts.editable;
    const hero = data.hero || {};
    const about = data.about || {};
    const heroAA = animAttrs(hero, 'hero', editable);
    const aboutAA = animAttrs(about, 'about', editable);
    const sections = (data.sections || []).map(s => renderSection(s, editable)).join('');

    return `
    <div class="f-doc">
      <header class="f-hero foliq-target"${heroAA}>
        <div class="f-hero-inner">
          <h1${fieldAttr(editable, 'hero.name')}>${esc(hero.name)}</h1>
          <p class="f-tagline"${fieldAttr(editable, 'hero.tagline')}>${esc(hero.tagline)}</p>
          ${hero.subtitle ? `<p class="f-subtitle"${fieldAttr(editable, 'hero.subtitle')}>${esc(hero.subtitle)}</p>` : ''}
        </div>
      </header>
      ${about.text ? `<section class="f-about foliq-target"${aboutAA}>
        <h3 class="f-section-title"${fieldAttr(editable, 'about.heading')}>${esc(about.heading || 'About')}</h3>
        <p${fieldAttr(editable, 'about.text')}>${esc(about.text)}</p>
      </section>` : ''}
      ${sections}
      <footer class="f-footer">Built with Foliq</footer>
    </div>`;
  }

  function themeCSS(themeName) {
    const t = THEMES[themeName] || THEMES.midnight;
    return `
    @import url('https://fonts.googleapis.com/css2?${t.fontImport}&display=swap');
    :root{
      --p-bg:${t.bg}; --p-surface:${t.surface}; --p-text:${t.text}; --p-dim:${t.dim};
      --p-accent:${t.accent}; --p-accent2:${t.accent2}; --p-gradient:${t.gradient};
      --p-head:${t.headFont}; --p-body:${t.bodyFont};
    }
    *{ box-sizing:border-box; }
    body{ margin:0; background:var(--p-bg); color:var(--p-text); font-family:var(--p-body); }
    .f-doc{ max-width:760px; margin:0 auto; padding: 64px 24px 40px; }
    .f-hero{ text-align:center; padding: 24px 0 44px; }
    .f-hero h1{ font-family:var(--p-head); font-size: clamp(34px,6vw,56px); margin:0 0 12px; font-weight:700; letter-spacing:-.02em; }
    .f-tagline{ font-family:var(--p-head); font-size:19px; background:var(--p-gradient); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:600; margin:0 0 10px; }
    .f-subtitle{ color:var(--p-dim); font-size:15px; max-width:520px; margin:0 auto; }
    .f-about{ margin: 8px 0 36px; }
    .f-about p{ color:var(--p-dim); font-size:15.5px; line-height:1.7; }
    .f-section{ margin-bottom:36px; }
    .f-section-title{ font-family:var(--p-head); font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--p-accent); margin:0 0 16px; font-weight:700; }
    .f-items-wrap{ display:flex; flex-direction:column; gap:18px; }
    .f-item{ background:var(--p-surface); border:1px solid rgba(255,255,255,.07); border-radius:14px; padding:18px 20px; }
    .f-item-top{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }
    .f-item h4{ font-family:var(--p-head); margin:0; font-size:16.5px; }
    .f-period{ font-size:12.5px; color:var(--p-dim); white-space:nowrap; min-width: 10px; display:inline-block; }
    .f-subheading{ color:var(--p-accent2); font-size:13.5px; margin-top:2px; font-weight:600; }
    .f-desc{ color:var(--p-dim); font-size:14.5px; margin: 8px 0 0; line-height:1.6; }
    .f-tags{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .f-tag{ font-size:11.5px; padding:4px 10px; border-radius:100px; background:rgba(255,255,255,.06); color:var(--p-dim); }
    .f-skills-wrap{ display:flex; flex-wrap:wrap; gap:10px; }
    .f-pill{ padding:9px 16px; border-radius:100px; background:var(--p-surface); border:1px solid rgba(255,255,255,.08); font-size:13.5px; font-weight:600; }
    .f-contact-wrap{ display:flex; flex-direction:column; gap:10px; }
    .f-contact-row{ display:flex; justify-content:space-between; background:var(--p-surface); border:1px solid rgba(255,255,255,.07); border-radius:12px; padding:14px 18px; }
    .f-contact-label{ color:var(--p-dim); font-size:13px; font-weight:600; }
    .f-contact-value{ font-size:14px; font-weight:600; }
    .f-footer{ text-align:center; color:var(--p-dim); font-size:12px; opacity:.55; margin-top:50px; }
    [data-field][contenteditable="true"]{ outline:none; border-radius:6px; transition: box-shadow .15s ease; }
    [data-field][contenteditable="true"]:hover{ box-shadow: 0 0 0 2px rgba(124,92,255,.35); }
    [data-field][contenteditable="true"]:focus{ box-shadow: 0 0 0 2px var(--p-accent); }
    [data-anim]{ will-change: opacity, transform; }
    `;
  }

  const BRIDGE_CSS = `
    .foliq-target{ position:relative; cursor:pointer; border-radius:10px; transition: box-shadow .12s ease; }
    .foliq-target:hover{ box-shadow: 0 0 0 2px rgba(124,92,255,.45); }
    .foliq-target.foliq-selected{ box-shadow: 0 0 0 2px #7c5cff, 0 0 0 5px rgba(124,92,255,.2) !important; }
  `;
  const BRIDGE_SCRIPT = `
    document.querySelectorAll('.foliq-target').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        document.querySelectorAll('.foliq-selected').forEach(function(s){ s.classList.remove('foliq-selected'); });
        el.classList.add('foliq-selected');
        parent.postMessage({ type:'foliq:select', key: el.getAttribute('data-key') }, '*');
      });
    });
    document.querySelectorAll('[data-field]').forEach(function(el){
      el.addEventListener('input', function(){
        parent.postMessage({ type:'foliq:field', path: el.getAttribute('data-field'), value: el.textContent }, '*');
      });
      el.addEventListener('click', function(e){ e.stopPropagation(); });
    });
    document.addEventListener('click', function(){
      document.querySelectorAll('.foliq-selected').forEach(function(s){ s.classList.remove('foliq-selected'); });
      parent.postMessage({ type:'foliq:select', key: null }, '*');
    });
    window.addEventListener('message', function(ev){
      var msg = ev.data || {};
      if (msg.type === 'foliq:highlight') {
        document.querySelectorAll('.foliq-selected').forEach(function(s){ s.classList.remove('foliq-selected'); });
        if (msg.key) {
          var el = document.querySelector('[data-key="' + msg.key.replace(/"/g,'') + '"]');
          if (el) { el.classList.add('foliq-selected'); el.scrollIntoView({ behavior:'smooth', block:'center' }); }
        }
      }
    });
  `;

  function fullDocument(data, opts) {
    opts = opts || {};
    const theme = data.theme || 'midnight';
    const extraCss = opts.bridge ? BRIDGE_CSS : '';
    const extraScript = opts.bridge ? BRIDGE_SCRIPT : '';
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>${themeCSS(theme)}${extraCss}</style></head>
    <body>${renderBody(data, opts)}
    <script>${TRIGGER_SCRIPT}<\/script>
    ${extraScript ? `<script>${extraScript}<\/script>` : ''}
    </body></html>`;
  }

  function initTriggers(root) {
    root = root || document;
    root.querySelectorAll('[data-anim]').forEach(function (el) {
      let cfg;
      try { cfg = JSON.parse(el.getAttribute('data-anim-config')); } catch (e) { return; }
      if (!cfg || !cfg.type || cfg.type === 'none') return;
      const delay = Math.max(0, Number(cfg.delay) || 0);
      if (cfg.type === 'fade-in') {
        el.style.transition = 'opacity .6s ease, transform .6s ease';
        el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
        setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'none'; }, delay);
      } else if (cfg.type === 'fade-out') {
        el.style.transition = 'opacity .6s ease';
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, delay);
      }
    });
  }

  const TRIGGER_SCRIPT = `
    function foliqRunTriggers(root){
      root = root || document;
      root.querySelectorAll('[data-anim]').forEach(function(el){
        var cfg; try{ cfg = JSON.parse(el.getAttribute('data-anim-config')); }catch(e){ return; }
        if(!cfg || !cfg.type || cfg.type === 'none') return;
        var delay = Math.max(0, Number(cfg.delay) || 0);
        if(cfg.type === 'fade-in'){
          el.style.transition = 'opacity .6s ease, transform .6s ease';
          el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
          setTimeout(function(){ el.style.opacity='1'; el.style.transform='none'; }, delay);
        } else if(cfg.type === 'fade-out'){
          el.style.transition = 'opacity .6s ease';
          el.style.opacity = '1';
          setTimeout(function(){ el.style.opacity='0'; }, delay);
        }
      });
    }
    document.addEventListener('DOMContentLoaded', function(){ foliqRunTriggers(document); });
    if(document.readyState !== 'loading'){ foliqRunTriggers(document); }
  `;

  global.Foliq = {
    THEMES, SECTION_LABELS,
    esc, slugify, findSection, getAnimTarget, setAnim, getByPath, setByPath,
    createEmptySection, renderBody, themeCSS, fullDocument, TRIGGER_SCRIPT, initTriggers
  };

})(window);
