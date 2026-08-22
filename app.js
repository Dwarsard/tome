'use strict';
/* =============== Constantes & helpers =============== */
const LS_KEY = 'tome-v1';
const LEGACY_KEYS = ['signet-v1'];
const THEME_KEY = 'tome-theme';
const UI_KEY = 'tome-ui';
const TYPE_LABEL = {livre:'Livre', bd:'BD', manga:'Manga'};
const STATUS_LABEL = {wishlist:'À lire', reading:'En cours', read:'Lu', abandoned:'Abandonné'};
const MOODS = ['entraînant','sombre','drôle','émouvant','réconfortant','tendu','réflexif','mélancolique','angoissant','inspirant','poétique','haletant'];
const PACE_LABEL = {lent:'Lent', moyen:'Moyen', rapide:'Rapide'};
const COLL = new Intl.Collator('fr', {numeric:true, sensitivity:'base'});

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* Isolation accessible des surfaces modales : le fond devient réellement indisponible au clavier
   et aux lecteurs d'écran, quel que soit le type de modale ouvert. */
const _modalHidden = new Map();
function activeModalRoot(){
  const dlg=$('#ov-dialog'); if(dlg && dlg.classList.contains('open')) return dlg;
  const pub=$('#pubprofile'); if(pub && !pub.hidden) return pub;   // page publique : couvre tout l'écran
  const welcome=$('#welcome'); if(welcome && !welcome.hidden) return welcome;
  const overlays=$$('.overlay.open');
  if(!overlays.length) return null;
  // La modale active est celle qui s'affiche AU-DESSUS : z-index d'abord, ordre DOM pour départager.
  // (#ov-card s'empile volontairement sur une modale déjà ouverte alors qu'il la précède dans le DOM ;
  // se fier au seul ordre DOM le laisserait inerte — donc visible mais impossible à cliquer.)
  const z = el => +getComputedStyle(el).zIndex || 0;
  return overlays.reduce((top, el)=> z(el) >= z(top) ? el : top);
}
function modalFocusables(root){
  if(!root) return [];
  return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]):not([hidden]),select:not([disabled]),textarea:not([disabled]):not([hidden]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.offsetParent!==null && !el.closest('[inert]'));
}
function syncModalIsolation(){
  const active=activeModalRoot();
  for(const el of [...document.body.children]){
    if(['SCRIPT','STYLE'].includes(el.tagName)) continue;
    // Surcouches globales (toast, bandeaux) : elles flottent AU-DESSUS des modales et doivent
    // rester cliquables — un « Annuler » de suppression rendu inerte ferait perdre la donnée
    // définitivement. #toast est aussi une région live : aria-hidden couperait les annonces.
    if(el.hasAttribute('data-modal-exempt')) continue;
    const hide=!!active && el!==active;
    if(hide && !_modalHidden.has(el)){
      _modalHidden.set(el,{inert:!!el.inert,aria:el.getAttribute('aria-hidden')});
      el.inert=true; el.setAttribute('aria-hidden','true');
    }else if(!hide && _modalHidden.has(el)){
      const prev=_modalHidden.get(el); el.inert=prev.inert;
      if(prev.aria===null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden',prev.aria);
      _modalHidden.delete(el);
    }
  }
}
document.addEventListener('focusin',e=>{
  const root=activeModalRoot(); if(!root || root.contains(e.target)) return;
  const first=modalFocusables(root)[0]; if(first) first.focus();
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab' || e.defaultPrevented) return;
  const root=activeModalRoot(), f=modalFocusables(root); if(!root || !f.length) return;
  const first=f[0], last=f[f.length-1];
  if(e.shiftKey && (document.activeElement===first || !root.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey && (document.activeElement===last || !root.contains(document.activeElement))){e.preventDefault();first.focus();}
});

/* =============== Modale générique (remplace prompt/confirm natifs) ===============
   uiConfirm/uiPrompt/uiChoose renvoient une Promise. Se superpose aux overlays
   existants sans les fermer (z-index dédié), piège le focus, gère Échap/Entrée. */
let _dlgResolve = null, _dlgPrevFocus = null, _dlgCancelVal = null;
function _dlgClose(val){
  const ov = $('#ov-dialog');
  if(!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  syncModalIsolation();
  // purge le contenu : un dialogue peut afficher un secret (code de secours) — il ne doit pas
  // rester lisible dans le DOM d'un appareil partagé après fermeture
  $('#dialog-msg').textContent=''; $('#dialog-title').textContent=''; $('#dialog-input').value='';
  document.removeEventListener('keydown', _dlgKey, true);
  const r = _dlgResolve; _dlgResolve = null;
  if(_dlgPrevFocus && document.contains(_dlgPrevFocus)){ try{ _dlgPrevFocus.focus(); }catch(_){} }
  if(r) r(val);
}
function _dlgFocusable(){
  return $$('#ov-dialog button, #ov-dialog input, #ov-dialog textarea').filter(el=>!el.hidden && el.offsetParent!==null);
}
function _dlgKey(e){
  if(e.defaultPrevented) return;
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); _dlgClose(_dlgCancelVal); }
  else if(e.key==='Enter'){
    if(e.target && e.target.tagName==='TEXTAREA') return;
    e.preventDefault(); e.stopPropagation();
    const def = $('#ov-dialog [data-default]'); if(def) def.click();
  }
  else if(e.key==='Tab'){
    const f = _dlgFocusable(); if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
}
// openDialog({title, message, input?, actions:[{label,value,variant,default,cancel,returnsInput}]})
function openDialog(cfg){
  return new Promise(resolve=>{
    if(_dlgResolve) _dlgClose(_dlgCancelVal); // une seule modale à la fois
    _dlgPrevFocus = document.activeElement;
    _dlgResolve = resolve;
    $('#dialog-title').textContent = cfg.title || '';
    const msg = $('#dialog-msg'); msg.textContent = cfg.message || '';
    const input = $('#dialog-input'), area = $('#dialog-textarea');
    input.hidden=true; area.hidden=true; input.value=''; area.value='';
    const inp = (cfg.input && cfg.input.multiline) ? area : input;
    if(cfg.input){
      inp.hidden=false;
      if(inp===input){ inp.type=cfg.input.type||'text'; inp.removeAttribute('maxlength'); if(inp.type==='password') inp.maxLength=256; }
      inp.value=cfg.input.value!=null?cfg.input.value:''; inp.placeholder=cfg.input.placeholder||'';
    }
    const acts = $('#dialog-actions'); acts.innerHTML='';
    const cancelAct = cfg.actions.find(a=>a.cancel);
    _dlgCancelVal = cancelAct ? cancelAct.value : null;
    cfg.actions.forEach(a=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='btn'+(a.variant==='primary'?' primary':a.variant==='danger'?' danger':'');
      if(a.default) b.setAttribute('data-default','');
      b.textContent=a.label;
      b.addEventListener('click', ()=> _dlgClose(a.returnsInput ? inp.value : a.value));
      acts.append(b);
    });
    $('#ov-dialog').classList.add('open');
    syncModalIsolation();
    document.addEventListener('keydown', _dlgKey, true);
    setTimeout(()=>{ const el = cfg.input ? inp : ($('#ov-dialog [data-default]') || acts.querySelector('button')); if(el){ el.focus(); if(el===inp) inp.select(); } }, 20);
  });
}
function uiConfirm({title, message='', okLabel='Confirmer', cancelLabel='Annuler', danger=false}){
  return openDialog({ title, message, actions:[
    { label:cancelLabel, value:false, cancel:true },
    { label:okLabel, value:true, variant: danger?'danger':'primary', default:true },
  ]});
}
function uiPrompt({title, message='', value='', placeholder='', type='text', multiline=false, okLabel='OK', cancelLabel='Annuler'}){
  return openDialog({ title, message, input:{value, placeholder, type, multiline}, actions:[
    { label:cancelLabel, value:null, cancel:true },
    { label:okLabel, variant:'primary', default:true, returnsInput:true },
  ]});
}
// uiChoose({title, message, choices:[{label,value,variant,default}]}) → value choisie, ou null si annulé
function uiChoose({title, message='', choices, cancelLabel='Annuler'}){
  return openDialog({ title, message, actions:[
    ...choices.map(c=>({ label:c.label, value:c.value, variant:c.variant, default:c.default })),
    { label:cancelLabel, value:null, cancel:true },
  ]});
}
// clic sur le fond (hors modale) = annuler
$('#ov-dialog').addEventListener('click', e=>{ if(e.target===$('#ov-dialog')) _dlgClose(_dlgCancelVal); });
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2)); }
function dateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function today(){ return dateKey(new Date()); }
function fmtDate(iso){ const t = new Date(iso+'T12:00:00'); return Number.isNaN(t.getTime()) ? String(iso) : t.toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}); }
function isoAfterDays(iso, days){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+days); return dateKey(d); }
function daysUntil(iso){ return Math.round((new Date(iso+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5); }
function loanDueInfo(loan){
  if(!loan || !isValidDate(loan.due||'')) return null;
  const days = daysUntil(loan.due);
  const text = days < 0 ? `en retard de ${-days} jour${days < -1?'s':''}`
    : days === 0 ? 'à rendre aujourd’hui'
    : days === 1 ? 'à rendre demain'
    : `à rendre le ${fmtDate(loan.due)}`;
  return {days, text, level:days<0?'overdue':days<=3?'soon':''};
}
// toast(msg) ou toast(msg, {label, onAction, ms}) pour proposer une annulation
function toast(msg, opts){
  const t = $('#toast');
  t.innerHTML = '';
  t.append(document.createTextNode(msg));
  t.classList.toggle('has-action', !!(opts && opts.onAction));
  if(opts && opts.onAction){
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = opts.label || 'Annuler';
    let done = false;
    btn.addEventListener('click', ()=>{ if(done) return; done = true; t.classList.remove('has-action','show'); opts.onAction(); });
    t.append(btn);
  }
  t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), (opts && opts.ms) || (opts && opts.onAction ? 5000 : 2400));
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BOOKS = 20000, MAX_LISTS = 500, MAX_READINGS = 2000, MAX_BOOKIDS = 20000, MAX_SMART = 100;
const MAX_STUDY_ITEMS = 300, MAX_STUDY_CARDS = 1000;
const SMART_STATUS = ['all','read','reading','wishlist','abandoned','fav','loan'];
const SORT_KEYS = ['added','rating','title','author','year'];
function isValidDate(d){ return typeof d==='string' && DATE_RE.test(d) && !Number.isNaN(new Date(d+'T12:00:00').getTime()); }
function cleanCover(v){
  if(typeof v!=='string') return '';
  if(/^https?:\/\//.test(v)) return v.replace(/^http:\/\//,'https://').slice(0,600);
  if(/^data:image\//.test(v)) return v.slice(0,200000);
  return '';
}
function numIn(v, min, max){
  const n = numOrNull(v);
  return n===null ? null : Math.min(max, Math.max(min, n));
}
function cleanTimestamp(v){
  // normalise en ISO pour que le tri « Ajout récent » compare des formats homogènes
  // (les exports CSV donnent « AAAA/MM/JJ », le natif un ISO complet)
  if(typeof v==='string'){ const t = Date.parse(v); if(!Number.isNaN(t)) return new Date(t).toISOString(); }
  return new Date().toISOString();
}
// Les synopsis des API arrivent souvent avec du HTML (<p>, <b>…) : on n'en garde que le texte.
// DOMParser ne charge aucune ressource et n'exécute aucun script.
function cleanSynopsis(v){
  if(typeof v!=='string' || !v) return '';
  let s = v;
  if(/[<&]/.test(s)){
    s = s.replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, ' ');
    try{ s = new DOMParser().parseFromString(s, 'text/html').body.textContent || ''; }catch(_){ }
  }
  return s.replace(/\s+/g,' ').trim().slice(0,5000);
}
// Nettoie une critique importée : retire le HTML mais PRÉSERVE les sauts de ligne
function cleanReview(v){
  let s = String(v||'');
  if(/[<&]/.test(s)){
    s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n');
    try{ s = new DOMParser().parseFromString(s, 'text/html').body.textContent || s; }catch(_){ }
  }
  return s.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,20000);
}

function cleanStudyText(v, max=20000){
  return String(v||'').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim().slice(0,max);
}
function emptyStudy(){
  return {objective:'', summary:'', ideas:[], lessons:[], questions:[], chapters:[], cards:[], updatedAt:null};
}
function studyHasContent(s){
  return !!(s && (s.objective || s.summary || s.ideas?.length || s.lessons?.length || s.questions?.length || s.chapters?.length || s.cards?.length));
}
function normalizeStudy(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  const sid = v => ID_RE.test(String(v||'')) ? String(v) : uid();
  const simple = arr => (Array.isArray(arr)?arr:[]).map(x=>({
    id:sid(x && typeof x==='object' ? x.id : ''),
    text:cleanStudyText(x && typeof x==='object' ? x.text : x, 4000),
  })).filter(x=>x.text).slice(-MAX_STUDY_ITEMS);
  const out = {
    objective:cleanStudyText(raw.objective, 4000),
    summary:cleanStudyText(raw.summary, 30000),
    ideas:simple(raw.ideas),
    lessons:simple(raw.lessons),
    questions:(Array.isArray(raw.questions)?raw.questions:[]).map(x=>({
      id:sid(x?.id), question:cleanStudyText(x?.question,4000), answer:cleanStudyText(x?.answer,8000),
    })).filter(x=>x.question || x.answer).slice(-MAX_STUDY_ITEMS),
    chapters:(Array.isArray(raw.chapters)?raw.chapters:[]).map(x=>({
      id:sid(x?.id), title:cleanStudyText(x?.title,500), notes:cleanStudyText(x?.notes,12000),
    })).filter(x=>x.title || x.notes).slice(-MAX_STUDY_ITEMS),
    cards:(Array.isArray(raw.cards)?raw.cards:[]).map(x=>({
      id:sid(x?.id), front:cleanStudyText(x?.front,4000), back:cleanStudyText(x?.back,8000),
      due:isValidDate(String(x?.due||'')) ? String(x.due).slice(0,10) : today(),
      interval:Math.round(numIn(x?.interval,0,36500)??0), repetitions:Math.round(numIn(x?.repetitions,0,100000)??0),
      lastReviewed:isValidDate(String(x?.lastReviewed||'')) ? String(x.lastReviewed).slice(0,10) : null,
    })).filter(x=>x.front && x.back).slice(-MAX_STUDY_CARDS),
    updatedAt:(typeof raw.updatedAt==='string' && !Number.isNaN(Date.parse(raw.updatedAt))) ? new Date(raw.updatedAt).toISOString() : null,
  };
  for(const k of ['ideas','lessons','questions','chapters','cards']){
    const seen=new Set(); for(const x of out[k]){ if(seen.has(x.id)) x.id=uid(); seen.add(x.id); }
  }
  return studyHasContent(out) ? out : null;
}
function ensureStudy(b){ if(!b.study) b.study=emptyStudy(); return b.study; }
function touchStudy(b){ const s=ensureStudy(b); s.updatedAt=new Date().toISOString(); return s; }

/* =============== Normalisation & stockage =============== */
function numOrNull(v){
  if(v===null || v===undefined || v==='') return null;
  const n = +v; return Number.isFinite(n) ? n : null;
}
function cleanRating(v){
  const n = numOrNull(v);
  return (n!==null && n>=0.5 && n<=5) ? Math.round(n*2)/2 : null;
}
function normalizeBook(b){
  return {
    id: ID_RE.test(String(b.id||'')) ? String(b.id) : uid(),
    title: String(b.title||'').slice(0,300),
    authors: Array.isArray(b.authors) ? b.authors.map(a=>String(a).slice(0,120)).slice(0,12) : [],
    type: ['livre','bd','manga'].includes(b.type) ? b.type : 'livre',
    series: typeof b.series==='string' ? b.series.slice(0,150) : '',
    volume: numIn(b.volume, 0, 9999),
    seriesTotal: numIn(b.seriesTotal, 0, 9999),
    year: numIn(b.year, -3000, 3000),
    pages: numIn(b.pages, 0, 100000),
    cover: cleanCover(b.cover),
    status: STATUS_LABEL[b.status] ? b.status : 'wishlist',
    rating: cleanRating(b.rating),
    review: typeof b.review==='string' ? b.review.slice(0,20000) : '',
    synopsis: cleanSynopsis(b.synopsis),
    favorite: !!b.favorite,
    tags: Array.isArray(b.tags) ? [...new Set(b.tags.map(t=>String(t).trim().slice(0,60)).filter(Boolean))].slice(0,20) : [],
    readings: (Array.isArray(b.readings) ? b.readings : [])
      .filter(r => r && typeof r.date==='string' && isValidDate(r.date.slice(0,10)))
      .map(r => ({ id: ID_RE.test(String(r.id||'')) ? String(r.id) : uid(), date: r.date.slice(0,10), rating: cleanRating(r.rating) }))
      .slice(-MAX_READINGS),
    currentPage: numIn(b.currentPage, 0, 1000000),
    progressLog: (Array.isArray(b.progressLog) ? b.progressLog : [])
      .filter(p => p && typeof p.date==='string' && isValidDate(p.date.slice(0,10)) && Number.isFinite(+p.page))
      .map(p => ({date: p.date.slice(0,10), page:+p.page})).slice(-500),
    moods: Array.isArray(b.moods) ? [...new Set(b.moods.filter(m=>MOODS.includes(m)))] : [],
    pace: PACE_LABEL[b.pace] ? b.pace : null,
    quotes: (Array.isArray(b.quotes) ? b.quotes : [])
      .filter(q => q && typeof q.text==='string' && q.text.trim())
      .map(q => ({ id: ID_RE.test(String(q.id||'')) ? String(q.id) : uid(), text: q.text.trim().slice(0,2000), page: numIn(q.page, 0, 1000000) }))
      .slice(-200),
    loan: (b.loan && typeof b.loan==='object' && typeof b.loan.to==='string' && b.loan.to.trim())
      ? { to: b.loan.to.trim().slice(0,120), since: isValidDate(String(b.loan.since||'').slice(0,10)) ? b.loan.since.slice(0,10) : today(),
          due: isValidDate(String(b.loan.due||'').slice(0,10)) ? b.loan.due.slice(0,10) : null }
      : null,
    study: normalizeStudy(b.study),
    addedAt: cleanTimestamp(b.addedAt),
  };
}
function normalizeData(d){
  const out = {
    books: (Array.isArray(d.books) ? d.books : [])
      .filter(b => b && typeof b.title==='string' && b.title.trim())
      .slice(0, MAX_BOOKS)
      .map(normalizeBook),
    lists: (Array.isArray(d.lists) ? d.lists : [])
      .filter(l => l && typeof l.name==='string' && l.name.trim())
      .slice(0, MAX_LISTS)
      .map(l => ({
        id: ID_RE.test(String(l.id||'')) ? String(l.id) : uid(),
        name: String(l.name).slice(0,150),
        desc: typeof l.desc==='string' ? l.desc.slice(0,500) : '',
        bookIds: Array.isArray(l.bookIds) ? l.bookIds.map(String).slice(0, MAX_BOOKIDS) : [],
        createdAt: cleanTimestamp(l.createdAt),
      })),
    goals: (d.goals && typeof d.goals==='object' && !Array.isArray(d.goals))
      ? Object.fromEntries(Object.entries(d.goals).filter(([k,v])=>/^\d{4}$/.test(k) && Number.isFinite(+v) && +v>0).slice(0,200).map(([k,v])=>[k, Math.min(100000, Math.max(1, Math.round(+v)))]))
      : {},
    meta: {
      changes: (d.meta && Number.isFinite(+d.meta.changes)) ? Math.max(0, Math.round(+d.meta.changes)) : 0,
      lastExport: (d.meta && typeof d.meta.lastExport==='string' && isValidDate(d.meta.lastExport)) ? d.meta.lastExport : null,
      // Sauvegarde compte : à quel compte cette biblio locale appartient, et sur quelle révision
      // serveur elle est basée (préservés au rechargement pour éviter perte/fuite entre comptes).
      ownerId: (d.meta && typeof d.meta.ownerId==='string') ? d.meta.ownerId.slice(0,64) : null,
      libRev: (d.meta && Number.isFinite(+d.meta.libRev)) ? Math.max(0, Math.round(+d.meta.libRev)) : 0,
      mergeConflicts: (d.meta && Number.isFinite(+d.meta.mergeConflicts)) ? Math.max(0, Math.round(+d.meta.mergeConflicts)) : 0,
    },
    // Notes/critiques au niveau série : { [seriesKey]: {rating, review, favorite, moods} }
    series: {},
    // Collections intelligentes (filtres sauvegardés « vivants »)
    smartCollections: (Array.isArray(d.smartCollections) ? d.smartCollections : [])
      .filter(c => c && typeof c.name==='string' && c.name.trim())
      .slice(0, MAX_SMART)
      .map(c => { const f = (c.f && typeof c.f==='object') ? c.f : {}; return {
        id: ID_RE.test(String(c.id||'')) ? String(c.id) : uid(),
        name: String(c.name).slice(0,80),
        f: {
          status: SMART_STATUS.includes(f.status) ? f.status : 'all',
          types: Array.isArray(f.types) ? [...new Set(f.types.filter(t=>['livre','bd','manga'].includes(t)))] : [],
          tag: typeof f.tag==='string' ? f.tag.slice(0,60) : '',
          q: typeof f.q==='string' ? f.q.slice(0,120) : '',
          sort: SORT_KEYS.includes(f.sort) ? f.sort : 'added',
        },
      }; }),
  };
  // series : validé + clés normalisées, entrées vides ignorées
  if(d.series && typeof d.series==='object' && !Array.isArray(d.series)){
    for(const [rawK, v] of Object.entries(d.series)){
      const k = String(rawK).trim().toLowerCase();
      if(!k || !v || typeof v!=='object') continue;
      const rec = {
        rating: cleanRating(v.rating),
        review: typeof v.review==='string' ? v.review.slice(0,20000) : '',
        favorite: !!v.favorite,
        moods: Array.isArray(v.moods) ? [...new Set(v.moods.filter(m=>MOODS.includes(m)))] : [],
      };
      if(rec.rating!=null || rec.review || rec.favorite || rec.moods.length) out.series[k] = rec;
    }
  }
  // unicité des id (fichiers importés bricolés) : le premier gagne, les doublons sont ré-identifiés
  const seenB = new Set();
  for(const b of out.books){
    if(seenB.has(b.id)) b.id = uid();
    seenB.add(b.id);
    const seenR = new Set();
    for(const r of b.readings){ if(seenR.has(r.id)) r.id = uid(); seenR.add(r.id); }
  }
  const seenL = new Set();
  for(const l of out.lists){ if(seenL.has(l.id)) l.id = uid(); seenL.add(l.id); }
  const seenSC = new Set();
  for(const c of out.smartCollections){ if(seenSC.has(c.id)) c.id = uid(); seenSC.add(c.id); }
  // purge des références fantômes ou dupliquées dans les listes
  const okIds = new Set(out.books.map(b=>b.id));
  for(const l of out.lists) l.bookIds = [...new Set(l.bookIds)].filter(id=>okIds.has(id));
  // purge des notes de série orphelines (plus aucun tome correspondant)
  const okSeries = new Set(out.books.map(seriesKey).filter(Boolean));
  for(const k of Object.keys(out.series)) if(!okSeries.has(k)) delete out.series[k];
  return out;
}
function load(){
  let notice = null, corrupted = false;
  // clés lues dans l'ordre : courante, sauvegarde d'avant-import, ancienne appli
  for(const key of [LS_KEY, LS_KEY+'-backup', ...LEGACY_KEYS]){
    const raw = localStorage.getItem(key);
    if(!raw) continue;
    try{
      const d = JSON.parse(raw);
      const data = normalizeData(d);
      return {data, migrated: key!==LS_KEY, notice, corrupted};
    }catch(e){
      console.warn('données illisibles pour', key, e);
      // ne pas écraser une copie corrompue déjà conservée (garde la 1re, la plus ancienne)
      try{ if(!localStorage.getItem(key+'-corrupt')) localStorage.setItem(key+'-corrupt', raw); }catch(_){}
      corrupted = true;
      notice = '⚠ Données illisibles — copie de secours conservée. Va dans Stats › Mes données pour la récupérer.';
    }
  }
  return {data:{books:[], lists:[], goals:{}, meta:{changes:0, lastExport:null}, series:{}, smartCollections:[]}, migrated:false, notice, corrupted};
}
const _loaded = load();
const state = _loaded.data;
let _cacheReadings = null, _cacheActivity = null;
function invalidateCache(){ _cacheReadings = null; _cacheActivity = null; }
let _saveBroken = false;
// Affiche/masque la bannière persistante d'échec de sauvegarde (stockage plein).
function setSaveBroken(broken){
  if(broken === _saveBroken) return;
  _saveBroken = broken;
  const bar = $('#save-warning');
  if(bar) bar.hidden = !broken;
}
function save(skipCount){
  invalidateCache();
  try{
    state.meta = state.meta || {changes:0, lastExport:null};
    if(!skipCount) state.meta.changes++;
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    setSaveBroken(false); // une écriture a réussi : on lève l'alerte
    // toute mutation de données peut changer la série de jours — les chemins rapides
    // (patchCard, actions rapides) ne repassent pas par render(), donc on rafraîchit ici
    if(typeof updateStreakPill==='function') updateStreakPill();
    // connecté ? on planifie une sauvegarde serveur (débounce) — le local reste la copie de travail
    if(typeof scheduleLibPush==='function' && typeof social!=='undefined' && social.me) scheduleLibPush();
    if(!skipCount && state.meta.changes>0 && state.meta.changes%50===0)
      toast(`💾 ${state.meta.changes} modifications depuis le dernier export — pense à sauvegarder (Stats)`);
    return true;
  }catch(e){
    console.error('save failed', e);
    setSaveBroken(true); // bannière persistante tant que le stockage n'accepte pas d'écriture
    toast('⚠ Sauvegarde impossible — stockage plein', { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
    return false;
  }
}
$('#save-warning-export').addEventListener('click', ()=>$('#btn-export').click());

const ui = {
  view:'today', status:'all', types:new Set(), q:'', tag:'', sort:'added', groupSeries:true,
  defaultStatus:'wishlist', typeMetric:'count',
  ideas:'ask',                             // idées du jour : 'ask' (proposer) | 'on' (activées) — jamais d'appel API sans opt-in
  selectMode:false, selection:new Set(),   // transitoires : jamais persistés ni sérialisés
  editId:null, detailId:null, listId:null, listMode:'list', seriesName:'', recapYear:new Date().getFullYear(),
  searchFromResult:null, heatYear:new Date().getFullYear(), lastFocus:null,
};
function clearSelection(){ ui.selection.clear(); ui.selectMode = false; document.body.classList.remove('selecting'); }
// Persistance des préférences d'affichage (filtres, tri, onglet)
function persistUI(){
  try{
    localStorage.setItem(UI_KEY, JSON.stringify({
      status:ui.status, types:[...ui.types], tag:ui.tag, sort:ui.sort,
      groupSeries:ui.groupSeries, view:ui.view, defaultStatus:ui.defaultStatus, typeMetric:ui.typeMetric,
      ideas:ui.ideas,
    }));
  }catch(_){}
}

/* =============== Helpers métier =============== */
function authorsStr(b){ return (b.authors||[]).join(', '); }
function hasTomeInTitle(t){ return /\b(tome|vol(?:ume)?\.?|t\.)\s*\d/i.test(t); }
function fullTitle(b){
  let t = b.title;
  if(b.series && b.volume!=null) t = `${b.series}, tome ${b.volume}` + (b.title && b.title.toLowerCase()!==b.series.toLowerCase() && !hasTomeInTitle(b.title) ? ` — ${b.title}` : '');
  else if(b.volume!=null && !hasTomeInTitle(b.title)) t = `${b.title} — T.${b.volume}`;
  return t;
}
/* ---- Affiliation Amazon (liens d'achat / Kindle) ----
   Pour TOUCHER une commission : mets ton identifiant Amazon Partenaires dans AMAZON_TAG
   (ex : 'lucasm-21'), obtenu sur https://partenaires.amazon.fr. Sans identifiant, les boutons
   fonctionnent quand même mais ne rapportent rien. Lien de RECHERCHE (pas d'API à gérer). */
const AMAZON_TAG = '';                 // ← ton tag Amazon Partenaires ici (ex : 'lucasm-21')
const AMAZON_HOST = 'www.amazon.fr';
function amazonUrl(b, kindle){
  const q = [fullTitle(b), (b.authors||[])[0]||''].filter(Boolean).join(' ');
  const p = new URLSearchParams({ k: q });
  if(kindle) p.set('i', 'digital-text');   // rayon « Boutique Kindle »
  if(AMAZON_TAG) p.set('tag', AMAZON_TAG);
  return 'https://' + AMAZON_HOST + '/s?' + p.toString();
}
function seriesKey(b){ return (b.series||'').trim().toLowerCase(); }
function seriesBooks(name){
  const k = name.trim().toLowerCase();
  return state.books.filter(b => seriesKey(b)===k);
}
function starsTxt(r){
  r = Number(r); if(!r || Number.isNaN(r)) return '';
  const n = Math.min(5, Math.max(0, Math.floor(r))); // borné (une note d'ami hors [0,5] ne casse pas le rendu)
  return '★'.repeat(n) + (r%1 ? '½' : '');
}
function starInputHTML(rating, cls='st'){
  return [1,2,3,4,5].map(n=>{
    let c = '';
    if(rating>=n) c='full'; else if(rating>=n-0.5) c='half';
    return `<span class="${cls} ${c}" data-n="${n}">★</span>`;
  }).join('');
}
function halfFromClick(el, clientX){
  const rect = el.getBoundingClientRect();
  return (clientX - rect.left) < rect.width/2;
}
function coverHTML(b, mini=false){
  if(b.cover) return `<img src="${esc(b.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="${esc(b.id)}">`;
  return phHTML(b, mini);
}
function phHTML(b, mini=false){
  const hues = {livre:205, bd:28, manga:340};
  const h = hues[b.type] ?? 150;
  if(mini) return `<div class="ph-mini" style="background:linear-gradient(160deg,hsl(${h},30%,24%),hsl(${h},35%,14%))">📕</div>`;
  return `<div class="ph" style="background:linear-gradient(160deg,hsl(${h},32%,26%),hsl(${h},38%,13%))">
    <div class="ph-t">${esc(fullTitle(b))}</div><div class="ph-a">${esc(authorsStr(b))}</div></div>`;
}
// Fallback des couvertures cassées : un seul écouteur en phase de capture, pas de handler inline.
document.addEventListener('error', e => {
  const img = e.target;
  if(img.tagName==='IMG' && img.dataset.fb){
    const b = state.books.find(x=>x.id===img.dataset.fb);
    const mini = img.closest('.mini') != null;
    if(b && img.parentNode) img.outerHTML = phHTML(b, mini);
  }
}, true);

function readCount(books){ return books.filter(b=>b.status==='read').length; }
function allReadings(){
  if(_cacheReadings) return _cacheReadings;
  const out = [];
  for(const b of state.books) for(const r of (b.readings||[])) out.push({b, date:r.date, rid:r.id, rating:r.rating});
  return (_cacheReadings = out);
}
function goalInfo(year){
  const goal = state.goals[String(year)];
  if(!goal) return null;
  const done = allReadings().filter(e=>e.date.startsWith(String(year))).length;
  const now = new Date();
  const isCurrent = year === now.getFullYear();
  const daysIn = (new Date(year,11,31) - new Date(year,0,1))/864e5 + 1;
  const doy = isCurrent ? Math.floor((now - new Date(year,0,1))/864e5) + 1 : daysIn;
  const expected = Math.round(goal * doy / daysIn);
  return {goal, done, delta: done - expected};
}
function paceHTML(gi){
  if(gi.done >= gi.goal) return `<span class="pace ahead">objectif atteint 🎉</span>`;
  if(gi.delta > 0) return `<span class="pace ahead">${gi.delta} lecture${gi.delta>1?'s':''} d'avance</span>`;
  if(gi.delta < 0) return `<span class="pace behind">${-gi.delta} de retard</span>`;
  return `<span class="pace">pile à jour</span>`;
}
async function setGoal(year){
  const cur = state.goals[String(year)] || '';
  const v = await uiPrompt({ title:`Objectif de lecture ${year}`, message:'Nombre de livres à lire cette année. Laisse vide pour retirer l\'objectif.', value:String(cur), placeholder:'ex : 24', type:'number', okLabel:'Enregistrer' });
  if(v===null) return;
  const n = parseInt(v, 10);
  if(!n || n<1) delete state.goals[String(year)];
  else state.goals[String(year)] = n;
  save(); render();
}

/* =============== Thème =============== */
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  $('#meta-theme').setAttribute('content', t==='light' ? '#f4f1e8' : '#12161a');
  $('#btn-theme').textContent = t==='light' ? '◑' : '◐';
}
applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
$('#btn-theme').addEventListener('click', ()=>{
  const t = document.documentElement.dataset.theme==='light' ? 'dark' : 'light';
  try{ localStorage.setItem(THEME_KEY, t); }catch(_){}
  applyTheme(t);
});

/* =============== Navigation =============== */
$('#nav').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]'); if(!btn) return;
  selectView(btn.dataset.view);
});
function selectView(view){
  ui.view = view;
  $$('#nav button').forEach(b=>{
    const on = b.dataset.view===view;
    b.classList.toggle('active', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $$('.view').forEach(v=>v.classList.toggle('active', v.id === 'view-'+view));
  if(location.hash.slice(1) !== view){ try{ history.replaceState(history.state, '', '#'+view); }catch(_){} }
  persistUI();
  render();
}
function render(){
  if(ui.view==='today') renderToday();
  else if(ui.view==='library') renderLibrary();
  else if(ui.view==='journal') renderJournal();
  else if(ui.view==='lists') renderLists();
  else if(ui.view==='stats') renderStats();
  else if(ui.view==='friends') renderFriends();
}
// Rendu du fond différé quand une modale est ouverte (inutile de repeindre une vue cachée)
let _rafRender = 0;
function scheduleRender(){
  if(document.querySelector('.overlay.open')){ _dirtyBg = true; return; }
  if(_rafRender) return;
  _rafRender = requestAnimationFrame(()=>{ _rafRender = 0; render(); });
}
let _dirtyBg = false;

/* =============== Aujourd'hui =============== */
function todayGreeting(){
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}
function dailyNextRead(day=today()){
  const options = nextReadOptions().sort((a,b)=>a.b.id.localeCompare(b.b.id));
  const total = options.reduce((n,x)=>n+x.score,0);
  if(!total) return null;
  let cursor = hashStr(day+'|tome-next') % total;
  return options.find(x=>(cursor-=x.score)<0) || options[options.length-1];
}
function todayLoans(){
  return state.books.filter(b=>b.loan).map(b=>({b, due:loanDueInfo(b.loan)}))
    .sort((a,b)=>(a.due?a.due.days:1e9)-(b.due?b.due.days:1e9));
}
function updateBookProgress(b, page, day=today()){
  let n = Number(page);
  if(!Number.isFinite(n)) n = 0;
  n = Math.max(0, Math.trunc(n));
  b.currentPage = b.pages ? Math.min(n, b.pages) : n;
  b.progressLog = Array.isArray(b.progressLog) ? b.progressLog : [];
  const sameDay = [...b.progressLog].reverse().find(x=>x.date===day);
  if(sameDay) sameDay.page = b.currentPage;
  else b.progressLog.push({date:day, page:b.currentPage});
  if(b.progressLog.length>500) b.progressLog = b.progressLog.slice(-500);
  invalidateCache();
  return b.currentPage;
}
function todayMiniCards(reading){
  const due = studyDueCards();
  const loans = todayLoans();
  const gi = goalInfo(new Date().getFullYear());
  const next = reading ? dailyNextRead() : null;
  const cards = [];
  const unrated = unratedBooks();
  if(unrated.length) cards.push(`<button class="today-mini" data-today-rate>
    <span class="today-mini-icon" aria-hidden="true">★</span><span><small>Sans note</small><b>${unrated.length} lecture${unrated.length>1?'s':''}</b><em>Les noter en moins d’une minute</em></span><span class="today-arrow" aria-hidden="true">→</span>
  </button>`);
  if(due.length) cards.push(`<button class="today-mini" data-today-study>
    <span class="today-mini-icon study" aria-hidden="true">◫</span><span><small>À réviser</small><b>${due.length} carte${due.length>1?'s':''}</b><em>Session de moins de 5 min</em></span><span class="today-arrow" aria-hidden="true">→</span>
  </button>`);
  if(loans.length){
    const first = loans[0], detail = first.due ? first.due.text : `${loans.length} prêt${loans.length>1?'s':''} en cours`;
    cards.push(`<button class="today-mini ${first.due&&first.due.days<0?'urgent':''}" data-today-loans>
      <span class="today-mini-icon loan" aria-hidden="true">↗</span><span><small>Prêts</small><b>${loans.length} livre${loans.length>1?'s':''}</b><em>${esc(detail)}</em></span><span class="today-arrow" aria-hidden="true">→</span>
    </button>`);
  }
  cards.push(`<button class="today-mini" data-today-goal>
    <span class="today-mini-icon goal" aria-hidden="true">◎</span><span><small>Objectif ${new Date().getFullYear()}</small><b>${gi?`${gi.done} / ${gi.goal}`:'À définir'}</b><em>${gi?(gi.done>=gi.goal?'Objectif atteint':gi.delta<0?`${-gi.delta} lecture${gi.delta<-1?'s':''} à rattraper`:'Tu tiens le rythme'):'Donne un cap à ton année'}</em></span><span class="today-arrow" aria-hidden="true">→</span>
  </button>`);
  if(next) cards.push(`<button class="today-mini" data-today-open="${esc(next.b.id)}">
    <span class="today-mini-icon next" aria-hidden="true">✦</span><span><small>Dans ta pile</small><b>${esc(fullTitle(next.b))}</b><em>${esc(next.why)}</em></span><span class="today-arrow" aria-hidden="true">→</span>
  </button>`);
  // Installer : proposé au bon moment (l'utilisateur a une vraie bibliothèque), une seule fois,
  // et jamais si l'app est déjà installée — le bouton des réglages reste le chemin permanent.
  let installDismissed = false;
  try{ installDismissed = !!localStorage.getItem('tome-install-hidden'); }catch(_){ }
  const canInstall = !isStandalone() && (installEvt || isIOSDevice()) && !installDismissed
    && (state.books||[]).filter(b=>!(b.tags||[]).includes('exemple')).length >= 3;
  const extra = canInstall ? `<button class="today-mini" data-today-install>
    <span class="today-mini-icon" aria-hidden="true">⬇</span><span><small>Toujours à portée</small><b>Installer Tome</b><em>Sur ton écran d’accueil, même hors ligne</em></span><span class="today-arrow" aria-hidden="true">→</span>
  </button>` : '';
  return cards.slice(0,3).join('') + extra;
}
function todayFocusHTML(reading){
  if(reading){
    const pct = progressPct(reading), readingCount = state.books.filter(b=>b.status==='reading').length;
    return `<section class="today-card today-focus" aria-labelledby="today-focus-title">
      <div class="today-kicker">Lecture en cours${readingCount>1?` · ${readingCount} livres`:''}</div>
      <div class="today-focus-main">
        <button class="today-cover" data-today-open="${esc(reading.id)}" aria-label="Ouvrir la fiche de ${esc(fullTitle(reading))}">${coverHTML(reading)}</button>
        <div class="today-focus-copy">
          <h3 id="today-focus-title">${esc(fullTitle(reading))}</h3>
          <p>${esc(authorsStr(reading)||TYPE_LABEL[reading.type])}</p>
          <div class="today-progress-meta"><span>${reading.currentPage?`Page ${reading.currentPage}${reading.pages?` sur ${reading.pages}`:''}`:'Progression non renseignée'}</span>${pct!==null?`<strong>${pct}%</strong>`:''}</div>
          ${reading.pages?`<div class="today-track" role="progressbar" aria-label="Progression de lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct||0}"><span style="width:${pct||0}%"></span></div>`:''}
          <div class="today-actions" aria-label="Mettre à jour la progression">
            <button class="btn primary" data-today-step="10" data-book="${esc(reading.id)}">＋10 pages</button>
            <button class="btn" data-today-step="25" data-book="${esc(reading.id)}">＋25</button>
            <button class="btn" data-today-exact="${esc(reading.id)}">Page exacte</button>
          </div>
          <div class="today-links">
            <button data-today-finish="${esc(reading.id)}">Marquer comme lu</button>
            ${readingCount>1?`<button data-today-reading>Voir les autres lectures</button>`:''}
          </div>
        </div>
      </div>
    </section>`;
  }
  const next = dailyNextRead();
  if(next){
    const b=next.b;
    return `<section class="today-card today-focus" aria-labelledby="today-focus-title">
      <div class="today-kicker">Ta prochaine lecture</div>
      <div class="today-focus-main">
        <button class="today-cover" data-today-open="${esc(b.id)}" aria-label="Ouvrir la fiche de ${esc(fullTitle(b))}">${coverHTML(b)}</button>
        <div class="today-focus-copy"><h3 id="today-focus-title">${esc(fullTitle(b))}</h3><p>${esc(authorsStr(b)||TYPE_LABEL[b.type])}</p>
          <div class="today-reason"><span aria-hidden="true">✦</span> ${esc(next.why)}</div>
          <div class="today-actions"><button class="btn primary" data-today-start="${esc(b.id)}">Commencer ce livre</button><button class="btn" data-today-open="${esc(b.id)}">Voir la fiche</button></div>
          <div class="today-links"><button data-today-add>Choisir un autre livre</button></div>
        </div>
      </div>
    </section>`;
  }
  if(state.books.length) return `<section class="today-card today-empty">
    <span class="today-empty-icon" aria-hidden="true">＋</span><div><div class="today-kicker">Prochaine page</div><h3>Que vas-tu lire maintenant ?</h3><p>Ajoute un titre à ta pile ou commence un livre de ta bibliothèque.</p></div>
    <div class="today-actions"><button class="btn primary" data-today-add>Ajouter un livre</button><button class="btn" data-today-library>Explorer ma bibliothèque</button></div>
  </section>`;
  return `<section class="today-card today-empty today-first">
    <span class="today-empty-icon" aria-hidden="true">T</span><div><div class="today-kicker">Bienvenue dans Tome</div><h3>Construis le journal de ta vie de lecteur.</h3><p>Ajoute ton premier livre ou importe ta bibliothèque existante. Tout restera disponible hors ligne.</p></div>
    <div class="today-actions"><button class="btn primary" data-today-add>Ajouter mon premier livre</button><button class="btn" data-today-import>Importer un CSV</button></div>
  </section>`;
}
function renderToday(){
  const reading = lastReadingBook();
  const now = new Date();
  $('#today-date').textContent = new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(now);
  const firstName = social.me && String(social.me.displayName||'').trim().split(/\s+/)[0];
  $('#today-subtitle').textContent = `${todayGreeting()}${firstName?' '+firstName:''}. ${reading?'Quelques pages suffisent pour garder le fil.':'Quelle histoire vas-tu faire entrer dans ta journée ?'}`;
  const sk=streaks(), streak=$('#today-streak');
  streak.hidden=sk.cur<1; streak.textContent=sk.cur?`🔥 ${sk.cur} jour${sk.cur>1?'s':''} d’affilée`:'';
  $('#today-body').innerHTML = `<div class="today-grid"><div>${todayFocusHTML(reading)}</div><aside class="today-side" aria-label="À ne pas oublier">${todayMiniCards(reading)}</aside></div>
    <section class="today-card today-social" aria-labelledby="today-social-title"><div class="today-section-head"><div><div class="today-kicker">Ton cercle de lecture</div><h3 id="today-social-title">Chez tes amis</h3></div><button data-today-friends>Voir le fil →</button></div><div id="today-social-feed"></div></section>`;
  renderTodaySocial();
}
let _todayFeedLoading=false;
async function loadTodayFeed(){
  if(_todayFeedLoading || !social.me) return;
  const fresh = social.todayFeed && social.todayFeedAt && Date.now()-social.todayFeedAt<5*60*1000;
  if(fresh) return;
  _todayFeedLoading=true; social.todayFeedError='';
  try{ const d=await api('/api/feed'); social.todayFeed=Array.isArray(d.feed)?d.feed:[]; social.todayFeedAt=Date.now(); social.todayFeedUser=social.me&&social.me.id; }
  catch(e){ social.todayFeedError=e.message==='offline'?'Le fil est indisponible hors ligne.':e.message; social.todayFeedAt=Date.now(); }
  finally{ _todayFeedLoading=false; if(ui.view==='today') renderTodaySocial(); }
}
function renderTodaySocial(){
  const el=$('#today-social-feed'); if(!el) return;
  if(!social.me){
    if(socToken() && social.sessionError){ el.innerHTML=`<div class="today-social-empty"><p>${social.sessionError==='offline'?'Ton cercle sera de retour dès que la connexion reviendra.':esc(social.sessionError)}</p><button class="btn" data-today-friends>Ouvrir l’espace Amis</button></div>`; return; }
    if(socToken()){ el.innerHTML=`<div class="today-social-empty"><span class="today-pulse" aria-hidden="true"></span><p>Connexion à ton cercle de lecture…</p></div>`; return; }
    el.innerHTML=`<div class="today-social-empty"><div><b>Les livres sont meilleurs quand on en parle.</b><p>Ajoute tes proches, comparez vos goûts et retrouvez leurs dernières lectures.</p></div><button class="btn" data-today-friends>Retrouver mes amis</button></div>`; return;
  }
  if(social.tosOutdated){ el.innerHTML=`<div class="today-social-empty"><p>Une mise à jour de confidentialité doit être acceptée avant de reprendre le fil.</p><button class="btn" data-today-friends>Vérifier mon compte</button></div>`; return; }
  if(social.todayFeedError && !social.todayFeed){ el.innerHTML=`<div class="today-social-empty"><p>${esc(social.todayFeedError)}</p><button class="btn" data-today-friends>Ouvrir l’espace Amis</button></div>`; return; }
  if(!social.todayFeed && !_todayFeedLoading){ el.innerHTML=`<div class="today-social-empty"><span class="today-pulse" aria-hidden="true"></span><p>Chargement des dernières lectures…</p></div>`; loadTodayFeed(); return; }
  if(_todayFeedLoading && !social.todayFeed){ el.innerHTML=`<div class="today-social-empty"><span class="today-pulse" aria-hidden="true"></span><p>Chargement des dernières lectures…</p></div>`; return; }
  const feed=(social.todayFeed||[]).slice(0,3);
  if(!feed.length){ el.innerHTML=`<div class="today-social-empty"><p>Ton fil est encore calme. Invite un ami pour commencer à partager vos lectures.</p><button class="btn" data-today-friends>Inviter un ami</button></div>`; return; }
  el.innerHTML=`<div class="today-feed">${feed.map(x=>`<button class="today-feed-row" data-today-friends>
    <span class="today-feed-cover">${x.cover?`<img src="${esc(x.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span aria-hidden="true">📕</span>'}</span>
    <span class="today-feed-copy"><b>${social.me&&x.uid===social.me.id?'Toi':esc(x.display_name)}</b><span>a lu <strong>${esc(x.title)}</strong>${x.rating?` · <span class="stars">${starsTxt(x.rating)}</span>`:''}</span></span>
    <time>${x.read_date?esc(new Date(x.read_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})):''}</time>
  </button>`).join('')}</div>`;
  loadTodayFeed();
}
$('#today-body').addEventListener('click', async e=>{
  const open=e.target.closest('[data-today-open]'); if(open){ openDetail(open.dataset.todayOpen); return; }
  const step=e.target.closest('[data-today-step]'); if(step){ const b=state.books.find(x=>x.id===step.dataset.book); if(b) setProgress(b,(b.currentPage||0)+Number(step.dataset.todayStep)); return; }
  const exact=e.target.closest('[data-today-exact]'); if(exact){
    const b=state.books.find(x=>x.id===exact.dataset.todayExact); if(!b) return;
    const v=await uiPrompt({title:`Progression — ${fullTitle(b)}`,message:b.pages?`Entre une page entre 0 et ${b.pages}.`:'Entre la page où tu t’es arrêté.',value:String(b.currentPage||''),placeholder:'Page',type:'number',okLabel:'Enregistrer'});
    if(v!==null && v!==''){ const n=Number(v); if(Number.isFinite(n) && n>=0) setProgress(b,n); else toast('Entre un numéro de page valide'); } return;
  }
  const finish=e.target.closest('[data-today-finish]'); if(finish){ const b=state.books.find(x=>x.id===finish.dataset.todayFinish); if(b){ markRead(b); save(); render(); } return; }
  const start=e.target.closest('[data-today-start]'); if(start){ const b=state.books.find(x=>x.id===start.dataset.todayStart); if(b){ b.status='reading'; if(b.currentPage==null)b.currentPage=0; save(); render(); toast('Bonne lecture 📖'); } return; }
  if(e.target.closest('[data-today-install]')){
    requestInstall().then(()=>{ try{ localStorage.setItem('tome-install-hidden','1'); }catch(_){ } renderToday(); });
    return;
  }
  if(e.target.closest('[data-today-rate]')){ openQuickRate(); return; }
  if(e.target.closest('[data-today-study]')){ startStudyReview(); return; }
  if(e.target.closest('[data-today-loans]')){ openTodayShelf('loan'); return; }
  if(e.target.closest('[data-today-goal]')){ await setGoal(new Date().getFullYear()); return; }
  if(e.target.closest('[data-today-reading]')){ openTodayShelf('reading'); return; }
  if(e.target.closest('[data-today-library]')){ openTodayShelf('all'); return; }
  if(e.target.closest('[data-today-add]')){ openSearch(); return; }
  if(e.target.closest('[data-today-import]')){ selectView('stats'); $('#btn-import-csv').click(); return; }
  if(e.target.closest('[data-today-friends]')){ social.tab='feed'; social.view=null; selectView('friends'); return; }
});
function openTodayShelf(status){
  ui.status=status; ui.types.clear(); ui.q=''; ui.tag='';
  $('#lib-q').value=''; $('#lib-tag').value='';
  $$('#status-chips .chip').forEach(x=>{const on=x.dataset.status===status;x.classList.toggle('active',on);x.setAttribute('aria-pressed',on);});
  $$('#type-chips .chip[data-type]').forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false');});
  selectView('library');
}
// Remplace une seule carte au lieu de reconstruire toute la grille (garde scroll/décodage des autres)
function patchCard(id){
  const el = document.querySelector('#lib-grid .card[data-id="'+CSS.escape(id)+'"]');
  const b = state.books.find(x=>x.id===id);
  if(el && b){ el.outerHTML = bookCardHTML(b); return true; }
  return false;
}
// Activation clavier des éléments role=button non natifs
document.addEventListener('keydown', e => {
  if((e.key==='Enter' || e.key===' ') && e.target.matches && e.target.matches('[role="button"][tabindex]')){
    e.preventDefault(); e.target.click();
  }
});

/* =============== Bibliothèque =============== */
$('#status-chips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if(!c) return;
  ui.status = c.dataset.status;
  $$('#status-chips .chip').forEach(x=>{
    const on = x===c;
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', on);
  });
  persistUI(); renderLibrary();
});
$('#type-chips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if(!c) return;
  if(c.id==='chip-series'){
    ui.groupSeries = !ui.groupSeries;
    c.classList.toggle('active', ui.groupSeries);
    c.setAttribute('aria-pressed', ui.groupSeries);
  }else{
    const t = c.dataset.type;
    ui.types.has(t) ? ui.types.delete(t) : ui.types.add(t);
    c.classList.toggle('active');
    c.setAttribute('aria-pressed', ui.types.has(t));
  }
  persistUI(); renderLibrary();
});
const _rerunLib = debounce(renderLibrary, 160);
$('#lib-more').addEventListener('click', ()=>{
  const expanded = !$('#filterbar').classList.toggle('compact'); // classe présente = replié
  $('#lib-more').setAttribute('aria-expanded', expanded);
});
$('#lib-q').addEventListener('input', e => { ui.q = e.target.value.toLowerCase().trim(); _rerunLib(); });
$('#lib-sort').addEventListener('change', e => { ui.sort = e.target.value; persistUI(); renderLibrary(); });
$('#lib-tag').addEventListener('change', e => { ui.tag = e.target.value; persistUI(); renderLibrary(); });

function filteredBooks(){
  let arr = state.books.slice();
  if(ui.status==='fav') arr = arr.filter(b=>b.favorite);
  else if(ui.status==='loan') arr = arr.filter(b=>b.loan);
  else if(ui.status!=='all') arr = arr.filter(b=>b.status===ui.status);
  if(ui.types.size) arr = arr.filter(b=>ui.types.has(b.type));
  if(ui.tag) arr = arr.filter(b=>(b.tags||[]).includes(ui.tag));
  if(ui.q) arr = arr.filter(b => bookHaystack(b).includes(ui.q));
  // décorer → trier → restituer : fullTitle/authorsStr et le collateur ne tournent qu'en O(n)
  const dec = arr.map(b => ({ b, t:fullTitle(b), a:authorsStr(b) }));
  const cmp = {
    added:(x,y)=> (y.b.addedAt||'').localeCompare(x.b.addedAt||''),
    rating:(x,y)=> (y.b.rating||0)-(x.b.rating||0) || COLL.compare(x.t, y.t),
    title:(x,y)=> COLL.compare(x.t, y.t),
    author:(x,y)=> COLL.compare(x.a, y.a) || (x.b.volume??0)-(y.b.volume??0) || COLL.compare(x.t, y.t),
    year:(x,y)=> (y.b.year||0)-(x.b.year||0) || COLL.compare(x.t, y.t),
  }[ui.sort] || ((x,y)=> (y.b.addedAt||'').localeCompare(x.b.addedAt||''));
  return dec.sort(cmp).map(o => o.b);
}
function bookHaystack(b){
  return (b.title+' '+authorsStr(b)+' '+(b.series||'')+' '+(b.tags||[]).join(' ')+' '+
    (b.review||'')+' '+(b.synopsis||'')+' '+(b.moods||[]).join(' ')+' '+
    (b.quotes||[]).map(q=>q.text).join(' ')).toLowerCase();
}
function progressPct(b){
  if(!b.pages || !b.currentPage) return null;
  return Math.min(100, Math.round(b.currentPage / b.pages * 100));
}
function renderNowReading(){
  const strip = $('#now-reading');
  const reading = state.books.filter(b=>b.status==='reading');
  if(ui.status!=='all' || !reading.length){ strip.hidden = true; strip.innerHTML=''; return; }
  strip.hidden = false;
  strip.innerHTML = reading.map(b=>{
    const pct = progressPct(b);
    return `<div class="now-card" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="En cours : ${esc(fullTitle(b))}">
      <div class="mini">${coverHTML(b, true)}</div>
      <div class="ni">
        <div class="nt">${esc(fullTitle(b))}</div>
        <div class="track"><div class="fill" style="width:${pct??0}%"></div></div>
        <div class="np">${b.currentPage ? `p. ${b.currentPage}${b.pages?' / '+b.pages:''}` : 'progression non renseignée'}${pct!==null ? ` · ${pct}%` : ''}</div>
      </div>
      <button class="btn small plus" data-plus10="${esc(b.id)}" title="Avancer de 10 pages">＋10</button>
    </div>`;
  }).join('');
}
$('#now-reading').addEventListener('click', e => {
  const plus = e.target.closest('[data-plus10]');
  if(plus){
    const b = state.books.find(x=>x.id===plus.dataset.plus10); if(!b) return;
    setProgress(b, (b.currentPage||0) + 10);
    return;
  }
  const card = e.target.closest('.now-card');
  if(card) openDetail(card.dataset.id);
});
function setProgress(b, page){
  updateBookProgress(b, page);
  if(b.pages && b.currentPage >= b.pages && b.status!=='read'){
    save();
    if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
    scheduleRender();
    // proposition non bloquante (pas de dialogue qui coupe la saisie)
    toast(`Dernière page de « ${fullTitle(b)} » 🎉`, { label:'Marquer lu', ms:6000, onAction:()=>{
      markRead(b); save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id, {pulse:true});
      scheduleRender();
    }});
    return;
  }
  save();
  if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
  scheduleRender();
}
function markRead(b){
  b.status = 'read';
  b.readings = b.readings||[];
  if(!b.readings.length) b.readings.push({id:uid(), date:today(), rating:null});
  invalidateCache(); // la lecture vient de changer : ne pas lire un décompte périmé
  const gi = goalInfo(new Date().getFullYear());
  if(gi && gi.done <= gi.goal) toast(`Lu ✓ — ${gi.done}/${gi.goal} de ton objectif ${new Date().getFullYear()}`);
  else toast('Marqué lu — ajouté au journal ✓');
}

// Bibliothèque d'exemple pour le premier lancement (couvertures Open Library, autorisées par la CSP)
const DEMO_BOOKS = [
  {title:'Berserk', series:'Berserk', volume:1, seriesTotal:41, type:'manga', authors:['Kentarō Miura'], year:1990, pages:224, status:'read', rating:5, favorite:true, tags:['dark fantasy','coup de cœur'], moods:['sombre','tendu'], pace:'moyen', review:'Un sommet du manga : violence, deuil et démesure.', cover:'https://covers.openlibrary.org/b/isbn/9781593070205-M.jpg', readings:[{date:'2025-03-12', rating:5}]},
  {title:'Watchmen', type:'bd', authors:['Alan Moore','Dave Gibbons'], year:1987, pages:416, status:'read', rating:5, favorite:true, tags:['comics','classique'], moods:['sombre','réflexif'], review:'La BD qui a fait grandir le medium.', cover:'https://covers.openlibrary.org/b/isbn/9780930289232-M.jpg', readings:[{date:'2026-01-20', rating:5}]},
  {title:'Dune', type:'livre', authors:['Frank Herbert'], year:1965, pages:688, status:'read', rating:4.5, tags:['SF','classique'], moods:['réflexif','inspirant'], pace:'lent', review:'Politique, écologie, mysticisme — dense et magistral.', cover:'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg', readings:[{date:'2026-02-15', rating:4.5}]},
  {title:'Pluto', series:'Pluto', volume:1, seriesTotal:8, type:'manga', authors:['Naoki Urasawa'], year:2003, pages:200, status:'read', rating:5, tags:['SF'], moods:['émouvant','tendu'], cover:'https://covers.openlibrary.org/b/isbn/9781421519180-M.jpg', readings:[{date:'2026-03-30', rating:5}]},
  {title:'La Horde du Contrevent', type:'livre', authors:['Alain Damasio'], year:2004, pages:736, status:'reading', currentPage:210, tags:['SF','français'], cover:'https://covers.openlibrary.org/b/isbn/9782070456253-M.jpg'},
  {title:'L\'Étranger', type:'livre', authors:['Albert Camus'], year:1942, pages:159, status:'read', rating:4, tags:['classique'], moods:['mélancolique'], cover:'https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg', readings:[{date:'2026-04-08', rating:4}]},
  {title:'Sapiens', type:'livre', authors:['Yuval Noah Harari'], year:2011, pages:512, status:'wishlist', tags:['essai','histoire']},
  {title:'Akira', series:'Akira', volume:1, seriesTotal:6, type:'manga', authors:['Katsuhiro Ōtomo'], year:1982, pages:364, status:'read', rating:4.5, tags:['SF','cyberpunk'], cover:'https://covers.openlibrary.org/b/isbn/9781935429005-M.jpg', readings:[{date:'2025-11-15', rating:4.5}]},
];
// Sélection « démarrage rapide » : incontournables à taper pour amorcer la bibliothèque (les
// couvertures manquantes retombent sur le placeholder titré — aucun échec bloquant).
const ONBOARD_PICKS = [
  {title:'Dune', type:'livre', authors:['Frank Herbert'], year:1965, cover:'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg'},
  {title:'1984', type:'livre', authors:['George Orwell'], year:1949, cover:'https://covers.openlibrary.org/b/isbn/9780451524935-M.jpg'},
  {title:'Le Petit Prince', type:'livre', authors:['Antoine de Saint-Exupéry'], year:1943, cover:'https://covers.openlibrary.org/b/isbn/9782070612758-M.jpg'},
  {title:'Harry Potter à l\'école des sorciers', type:'livre', authors:['J.K. Rowling'], year:1997, cover:'https://covers.openlibrary.org/b/isbn/9782070584628-M.jpg'},
  {title:'L\'Étranger', type:'livre', authors:['Albert Camus'], year:1942, cover:'https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg'},
  {title:'Sapiens', type:'livre', authors:['Yuval Noah Harari'], year:2011, cover:'https://covers.openlibrary.org/b/isbn/9782226257017-M.jpg'},
  {title:'Watchmen', type:'bd', authors:['Alan Moore','Dave Gibbons'], year:1987, cover:'https://covers.openlibrary.org/b/isbn/9780930289232-M.jpg'},
  {title:'Persepolis', type:'bd', authors:['Marjane Satrapi'], year:2000, cover:'https://covers.openlibrary.org/b/isbn/9782844140586-M.jpg'},
  {title:'Berserk', series:'Berserk', volume:1, type:'manga', authors:['Kentarō Miura'], year:1990, cover:'https://covers.openlibrary.org/b/isbn/9781593070205-M.jpg'},
  {title:'One Piece', series:'One Piece', volume:1, type:'manga', authors:['Eiichirō Oda'], year:1997, cover:'https://covers.openlibrary.org/b/isbn/9782723492607-M.jpg'},
  {title:'Akira', series:'Akira', volume:1, type:'manga', authors:['Katsuhiro Ōtomo'], year:1982, cover:'https://covers.openlibrary.org/b/isbn/9781935429005-M.jpg'},
  {title:'Pluto', series:'Pluto', volume:1, type:'manga', authors:['Naoki Urasawa'], year:2003, cover:'https://covers.openlibrary.org/b/isbn/9781421519180-M.jpg'},
];
function loadDemo(){
  DEMO_BOOKS.forEach(d=>{
    const b = newBook(Object.assign({}, d, {tags:[...(d.tags||[]),'exemple'], readings:(d.readings||[]).map(r=>({id:uid(), date:r.date, rating:r.rating??null}))}));
    state.books.push(b);
  });
  if(!state.goals[String(new Date().getFullYear())]) state.goals[String(new Date().getFullYear())] = 20;
  save(); render();
  toast('Bibliothèque d\'exemple chargée — explore Journal, Stats et les séries ✨');
}
function renderDemoBanner(){
  let banner = $('#demo-banner');
  const hasDemo = state.books.some(b=>(b.tags||[]).includes('exemple'));
  if(!hasDemo){ if(banner) banner.remove(); return; }
  if(!banner){
    banner = document.createElement('div'); banner.id='demo-banner'; banner.className='demo-banner';
    $('#view-library').insertBefore(banner, $('#now-reading'));
    banner.addEventListener('click', e=>{
      if(e.target.closest('#demo-clear')){
        (async()=>{
          if(!await uiConfirm({ title:'Retirer les exemples ?', message:'Les livres de démonstration seront retirés. Tes propres livres ne sont pas touchés.', okLabel:'Retirer' })) return;
          state.books = state.books.filter(b=>!(b.tags||[]).includes('exemple'));
          state.lists.forEach(l=> l.bookIds = l.bookIds.filter(id=>state.books.some(b=>b.id===id)));
          save(); render(); toast('Exemples retirés');
        })();
      }
    });
  }
  banner.innerHTML = `<span>✨ Tu explores une <b>bibliothèque d'exemple</b>. Ajoute tes vraies lectures quand tu veux.</span>
    <button class="btn small db-x" id="demo-clear">Tout effacer</button>`;
}

// Teaser de décembre : la rétro est LE moteur de partage de l'année — on la met sous les yeux
// au bon moment, une seule fois (masquable, mémorisé par année).
function isRecapSeason(d){ return (d||new Date()).getMonth()===11; }
function renderRecapTeaser(){
  let ban = $('#recap-teaser');
  const y = new Date().getFullYear();
  let show = false;
  try{ show = isRecapSeason() && !localStorage.getItem('tome-recap-teased-'+y) && yearRecap(y).count>0; }catch(_){ }
  if(!show){ if(ban) ban.remove(); return; }
  if(!ban){
    ban = document.createElement('div'); ban.id='recap-teaser'; ban.className='demo-banner';
    $('#view-library').insertBefore(ban, $('#now-reading'));
    ban.addEventListener('click', e=>{
      if(e.target.closest('#recap-open')){ showRecap(y); return; }
      if(e.target.closest('#recap-dismiss')){ try{ localStorage.setItem('tome-recap-teased-'+y,'1'); }catch(_){ } ban.remove(); }
    });
  }
  ban.innerHTML = `<span>🎁 <b>Ta rétro ${y} est prête</b> — ton année de lecture en une carte à partager.</span>
    <span style="display:flex;gap:8px"><button class="btn small primary" id="recap-open">Voir 🎉</button><button class="btn small db-x" id="recap-dismiss" aria-label="Masquer">✕</button></span>`;
}
function renderLibrary(){
  renderNowReading();
  renderDiscover();
  renderLoanAlert();
  renderStudyAlert();
  $('#btn-pick-next').hidden = !state.books.some(b=>b.status==='wishlist');
  const tagSel = $('#lib-tag');
  const allTags = [...new Set(state.books.flatMap(b=>b.tags||[]))].sort((a,b)=>a.localeCompare(b,'fr'));
  if(ui.tag && !allTags.includes(ui.tag)) ui.tag = '';
  tagSel.hidden = !allTags.length;
  tagSel.innerHTML = `<option value="">Tous les tags</option>` +
    allTags.map(t=>`<option value="${esc(t)}"${t===ui.tag?' selected':''}>#${esc(t)}</option>`).join('');
  // barre compacte : un tag choisi reste visible, et la pastille compte les filtres actifs repliables
  tagSel.classList.toggle('has-value', !!ui.tag);
  const nbActifs = (['abandoned','fav','loan'].includes(ui.status)?1:0) + ui.types.size + (ui.tag?1:0) + (ui.groupSeries?0:1);
  $('#lib-more').textContent = nbActifs ? `⚙ Filtres · ${nbActifs}` : '⚙ Filtres';
  const arr = filteredBooks();
  const grid = $('#lib-grid'), emptyBox = $('#lib-empty');
  renderDemoBanner();
  renderRecapTeaser();
  if(!state.books.length){
    grid.innerHTML = ''; $('#lib-count').textContent = '';
    emptyBox.innerHTML = `<div class="onboard">
      <div class="ob-head">
        <div class="big">📚</div>
        <h3>Commence ta bibliothèque</h3>
        <p>Ajoute des livres, BD ou manga que tu as lus — ta collection, ton journal et tes recommandations démarrent tout de suite.</p>
        <button class="btn primary lp-big" id="ob-search">🔍 Chercher un livre</button>
      </div>
      <div class="ob-or">ou tape parmi ces incontournables :</div>
      <div class="onboard-grid">
        ${ONBOARD_PICKS.map((p,i)=>`<button class="ob-pick" data-pick="${i}" aria-label="Ajouter ${esc(p.title)}">
          <div class="ob-cov">${p.cover?`<img src="${esc(p.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"><div class="ob-ph">${esc(p.title)}</div>`:`<div class="ob-ph">${esc(p.title)}</div>`}</div>
          <div class="ob-t">${esc(p.title)}</div><div class="ob-check">✓ Ajouté</div>
        </button>`).join('')}
      </div>
      <div class="ob-foot">
        <button class="btn" id="ob-demo">Voir plutôt une bibliothèque d'exemple</button>
        <button class="btn primary" id="ob-done" hidden>Voir ma bibliothèque <span id="ob-n"></span> →</button>
      </div>
    </div>`;
    $('#ob-search').addEventListener('click', openSearch);
    $('#ob-demo').addEventListener('click', loadDemo);
    let added = 0;
    $('#ob-done').addEventListener('click', ()=>render());
    emptyBox.querySelector('.onboard-grid').addEventListener('click', e=>{
      const btn = e.target.closest('.ob-pick'); if(!btn || btn.classList.contains('done')) return;
      const p = ONBOARD_PICKS[+btn.dataset.pick]; if(!p) return;
      const b = newBook(Object.assign({}, p, { status:'read', readings:[{id:uid(), date:today(), rating:null}] }));
      state.books.unshift(b); save();                          // seed la biblio (+ sync compte si connecté)
      btn.classList.add('done'); added++;
      const doneBtn = $('#ob-done'); doneBtn.hidden = false; $('#ob-n').textContent = '('+added+')';
      toast(`« ${p.title} » ajouté ✓`, {label:'Annuler', onAction:()=>{ const i=state.books.indexOf(b); if(i>=0){ state.books.splice(i,1); save(); } btn.classList.remove('done'); added=Math.max(0,added-1); if(!added){doneBtn.hidden=true;} else {$('#ob-n').textContent='('+added+')';} }});
    });
    return;
  }
  // Regroupement par série
  const items = [];
  if(ui.groupSeries){
    const groups = new Map();
    for(const b of arr){
      const k = seriesKey(b);
      if(!k) continue;
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    }
    const emitted = new Set();
    for(const b of arr){
      const k = seriesKey(b);
      if(k && groups.get(k).length>=2){
        if(!emitted.has(k)){ emitted.add(k); items.push({kind:'series', name:b.series.trim(), books:groups.get(k)}); }
      }else{
        items.push({kind:'book', book:b});
      }
    }
  }else{
    for(const b of arr) items.push({kind:'book', book:b});
  }
  const nBooks = arr.length, nItems = items.length;
  $('#lib-count').textContent = `${nBooks} ouvrage${nBooks>1?'s':''}${nItems!==nBooks ? ` · ${nItems} carte${nItems>1?'s':''}` : ''}`;
  if(!arr.length){
    emptyBox.innerHTML = `<div class="empty"><div class="big">🔍</div>
      <h3>Aucun résultat</h3><p>Aucun titre ne correspond à ces filtres.</p>
      <button class="btn" id="empty-reset">Réinitialiser les filtres</button></div>`;
    $('#empty-reset').addEventListener('click', resetFilters);
  }else emptyBox.innerHTML = '';
  grid.innerHTML = items.map(it => it.kind==='series' ? seriesCardHTML(it) : bookCardHTML(it.book)).join('');
  renderSmartChips();
  updateBulkBar();
}
function renderLoanAlert(){
  const box = $('#loan-alert');
  const urgent = state.books.map(b=>({b, due:loanDueInfo(b.loan)})).filter(x=>x.due && x.due.days<=3);
  if(!urgent.length){ box.hidden=true; box.innerHTML=''; return; }
  const overdue = urgent.filter(x=>x.due.days<0).length;
  const soon = urgent.length-overdue;
  const parts=[];
  if(overdue) parts.push(`${overdue} prêt${overdue>1?'s':''} en retard`);
  if(soon) parts.push(`${soon} retour${soon>1?'s':''} à prévoir`);
  box.hidden=false;
  box.innerHTML=`<span>📤 <b>${parts.join(' · ')}</b></span><button class="btn small" id="loan-alert-open">Voir les prêts</button>`;
  $('#loan-alert-open').onclick=()=>$('#status-chips [data-status="loan"]').click();
}
function resetFilters(){
  ui.status='all'; ui.types.clear(); ui.tag=''; ui.q='';
  $('#lib-q').value=''; $('#lib-tag').value='';
  $$('#status-chips .chip').forEach(x=>{ const on=x.dataset.status==='all'; x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  $$('#type-chips .chip[data-type]').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
  persistUI(); renderLibrary();
}
// Recommandations locales dérivées de mes propres notes (aucun réseau)
function recommendations(){
  const out = [], seen = new Set();
  const eligible = b => b && b.status!=='read' && b.status!=='reading' && b.status!=='abandoned';
  const add = (b, why)=>{ if(eligible(b) && !seen.has(b.id)){ seen.add(b.id); out.push({b, why}); } };
  // 1) tome suivant à lire des séries que j'aime (note ≥ 4)
  const bySeries = new Map();
  for(const b of state.books){ const k=seriesKey(b); if(k){ if(!bySeries.has(k)) bySeries.set(k,[]); bySeries.get(k).push(b); } }
  for(const [k,books] of bySeries){
    const rated = books.filter(b=>b.rating);
    const avg = rated.length ? rated.reduce((s,b)=>s+b.rating,0)/rated.length : 0;
    const rec = state.series[k];
    const score = (rec && rec.rating!=null) ? rec.rating : avg;
    if(score < 4) continue;
    const next = books.filter(eligible).sort((a,b)=>(a.volume??1e9)-(b.volume??1e9));
    if(next[0]) add(next[0], 'la suite d\'une série que tu aimes');
  }
  // 2) auteurs que je note haut → leurs livres à lire
  const authorScore = {};
  for(const b of state.books){ if(b.rating) for(const a of (b.authors||[])){ (authorScore[a]=authorScore[a]||[]).push(b.rating); } }
  const topAuthors = Object.entries(authorScore).map(([a,rs])=>[a, rs.reduce((s,r)=>s+r,0)/rs.length]).filter(([,m])=>m>=4).sort((x,y)=>y[1]-x[1]);
  for(const [a] of topAuthors){
    const cand = state.books.filter(b=>eligible(b) && (b.authors||[]).includes(a));
    if(cand[0]) add(cand[0], `de ${a}, que tu notes haut`);
  }
  return out.slice(0,12);
}

// Choix local dans la pile à lire : les affinités augmentent les chances, sans jamais envoyer
// la bibliothèque au réseau. Les titres anciens gardent une chance réelle de ressortir.
function nextReadOptions(excluded=new Set()){
  const loved = state.books.filter(b=>b.status==='read' && b.rating>=4);
  const likedAuthors = new Set(loved.flatMap(b=>b.authors||[]));
  const likedTags = new Set(loved.flatMap(b=>b.tags||[]).filter(t=>t!=='exemple'));
  return state.books.filter(b=>b.status==='wishlist' && !excluded.has(b.id)).map(b=>{
    let score=2; const why=[];
    const author=(b.authors||[]).find(a=>likedAuthors.has(a));
    const tag=(b.tags||[]).find(t=>likedTags.has(t));
    const previous = b.series && b.volume>1 && state.books.some(x=>seriesKey(x)===seriesKey(b) && x.volume===b.volume-1 && x.status==='read');
    if(previous){ score+=5; why.push('la suite d’une série déjà commencée'); }
    if(author){ score+=3; why.push(`${author} fait partie de tes auteurs bien notés`); }
    if(tag){ score+=2; why.push(`tu apprécies le genre #${tag}`); }
    if(b.favorite){ score+=2; why.push('tu l’as placé dans tes favoris'); }
    const ageDays = Math.max(0, Math.floor((Date.now()-new Date(b.addedAt||Date.now()).getTime())/864e5));
    score += Math.min(3, Math.floor(ageDays/120));
    if(!why.length) why.push(ageDays>180 ? 'il attend depuis un moment dans ta pile' : 'il est dans ta pile à lire');
    return {b, score, why:why.slice(0,2).join(' · ')};
  });
}
function pickNextRead(excluded=new Set()){
  const options=nextReadOptions(excluded);
  let r=Math.random()*options.reduce((sum,x)=>sum+x.score,0);
  return options.find(x=>(r-=x.score)<=0) || options[options.length-1] || null;
}
async function chooseNextRead(){
  const total=state.books.filter(b=>b.status==='wishlist').length;
  if(!total){ toast('Ta pile à lire est vide'); return; }
  const seen=new Set();
  while(seen.size<total){
    const pick=pickNextRead(seen); if(!pick) return;
    const b=pick.b;
    const action=await openDialog({
      title:`🎲 ${fullTitle(b)}`,
      message:`${authorsStr(b)||TYPE_LABEL[b.type]}\n\nPourquoi ce choix : ${pick.why}.`,
      actions:[
        ...(total-seen.size>1 ? [{label:'Une autre', value:'again'}] : []),
        {label:'Voir la fiche', value:'view'},
        {label:'Commencer', value:'start', variant:'primary', default:true},
        {label:'Annuler', value:null, cancel:true},
      ]
    });
    if(action==='again'){ seen.add(b.id); continue; }
    if(action==='view'){ openDetail(b.id); return; }
    if(action==='start'){
      b.status='reading'; if(b.currentPage==null) b.currentPage=0;
      save(); render(); openDetail(b.id); toast('Bonne lecture 📖'); return;
    }
    return;
  }
}
$('#btn-pick-next').addEventListener('click', chooseNextRead);
/* ---- Idées du jour : découverte externe « Comme X et Y », 3 idées, nouvelles chaque jour ----
   Déterministe par date (même trio toute la journée), cache localStorage (1 requête API max/jour),
   repli silencieux si aucune note ≥ 4 ou API indisponible. */
const IDEAS_KEY = 'tome-ideas-v1';
let _ideasLoading = false, _ideasNextTry = 0; // re-tentative throttlée si les API étaient indisponibles
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; } return Math.abs(h); }
const bookLibKey = (title, author) => (title+'|'+(author||'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
// Graines du jour : un auteur aimé (rotation quotidienne) + un tag partagé par ≥2 coups de cœur.
function ideaSeeds(day){
  const loved = state.books.filter(b=>b.rating>=4);
  if(!loved.length) return [];
  const out = [];
  const authors = [...new Set(loved.flatMap(b=>b.authors||[]))].filter(Boolean).sort();
  if(authors.length){
    const a = authors[hashStr(day+'|a') % authors.length];
    const ex = loved.find(b=>(b.authors||[]).includes(a));
    out.push({ q:`inauthor:"${a}"`, fallback:a, label:`Parce que tu as aimé ${ex?fullTitle(ex):a}` });
  }
  const byTag = new Map();
  loved.forEach(b=>(b.tags||[]).forEach(t=>{ if(t==='exemple') return; if(!byTag.has(t)) byTag.set(t,[]); byTag.get(t).push(b); }));
  const tags = [...byTag.keys()].filter(t=>byTag.get(t).length>=2).sort();
  if(tags.length){
    const t = tags[hashStr(day+'|t') % tags.length];
    const pair = byTag.get(t);
    out.push({ q:`subject:"${t}"`, fallback:t, label:`Comme ${fullTitle(pair[0])} et ${fullTitle(pair[1])}` });
  }
  return out;
}
async function fetchIdeas(){
  // null = pas de graines (aucun appel réseau effectué) ; [] = graines mais API muettes
  const seeds = ideaSeeds(today()); if(!seeds.length) return null;
  const mine = new Set(state.books.map(b=>bookLibKey(b.title, (b.authors||[])[0])));
  const groups = [];
  for(const s of seeds){
    let rs = [];
    try{ rs = await searchGoogleBooks(s.q); }
    catch(_){ try{ rs = await searchOpenLibrary(s.fallback); }catch(_2){ rs = []; } }
    const seen = new Set();
    const items = rs.filter(r=>{
      const k = bookLibKey(r.title, (r.authors||[])[0]);
      if(mine.has(k) || seen.has(k) || !cleanCover(r.cover)) return false;
      seen.add(k); mine.add(k);            // pas de doublon entre les deux groupes
      return true;
    }).slice(0,3).map(r=>({ title:r.title, authors:r.authors||[], type:r.type||'livre', year:r.year||null,
                            pages:r.pages||null, cover:r.cover||'', description:r.description||'' }));
    if(items.length) groups.push({ label:s.label, items });
  }
  return groups;
}
let _ideasAskMuted = false; // « Pas maintenant » : on reproposera à la prochaine session, pas avant
async function renderDailyIdeas(){
  let box = $('#daily-ideas');
  if(!box){
    box = document.createElement('div'); box.id='daily-ideas'; box.className='ideas-panel'; box.hidden=true;
    $('#discover').after(box);
    box.addEventListener('click', onIdeaAdd);
  }
  if(ui.status!=='all' || ui.q || ui.tag || ui.types.size){ box.hidden=true; return; }
  // Opt-in OBLIGATOIRE : la fonctionnalité envoie des auteurs/tags aimés à des API externes —
  // rien ne part sans un accord explicite (la proposition, elle, est 100 % locale).
  if(ui.ideas!=='on'){
    if(_ideasAskMuted || !ideaSeeds(today()).length){ box.hidden=true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="ideas-head">💡 Idées du jour</div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Reçois chaque jour quelques livres à découvrir, choisis d'après tes coups de cœur.
      Pour ça, Tome enverra le nom d'un auteur ou d'un tag que tu aimes à Google Books / Open Library (comme lors d'une recherche). Rien d'autre ne quitte ton appareil.</p>
      <div style="display:flex;gap:8px"><button class="btn small primary" data-ideas-optin>Activer</button>
      <button class="btn small" data-ideas-later>Pas maintenant</button></div>`;
    return;
  }
  let data = null;
  try{ data = JSON.parse(localStorage.getItem(IDEAS_KEY)||'null'); }catch(_){}
  if(!data || data.date!==today() || !Array.isArray(data.groups)){
    if(_ideasLoading || Date.now() < _ideasNextTry) return;
    _ideasLoading = true;
    fetchIdeas().then(groups=>{
      _ideasLoading = false;
      if(groups===null) return;                                  // pas de graines : aucun appel fait, rien à throttler
      // fournée vide (API indisponibles) : ne PAS figer la journée — on retentera dans 30 min
      if(!groups.length){ _ideasNextTry = Date.now() + 30*60*1000; return; }
      try{ localStorage.setItem(IDEAS_KEY, JSON.stringify({date:today(), groups})); }catch(_){}
      if(ui.view==='library') renderDailyIdeas();
    }).catch(()=>{ _ideasLoading = false; _ideasNextTry = Date.now() + 30*60*1000; });
    return; // rien à montrer tant que la fournée du jour n'est pas prête
  }
  // filtre au RENDU contre la bibliothèque actuelle : un livre ajouté disparaît des idées
  // (sinon le re-rendu ressusciterait son bouton « À lire » → doublons possibles)
  const libKeys = new Set(state.books.map(b=>bookLibKey(b.title, (b.authors||[])[0])));
  const groups = data.groups
    .map(g=>({ label:g.label, items:(g.items||[]).filter(r=>!libKeys.has(bookLibKey(r.title, (r.authors||[])[0]))) }))
    .filter(g=>g.items.length);
  if(!groups.length){ box.hidden=true; return; }
  window._ideaGroups = groups;
  box.hidden = false;
  box.innerHTML = `<div class="ideas-head">💡 Idées du jour <span>de nouvelles suggestions chaque jour</span></div>` +
    groups.map((g,gi)=>`<div class="idea-group"><div class="ig-label">${esc(g.label)}</div><div class="ig-items">` +
      g.items.map((r,i)=>{ const c = cleanCover(r.cover); return `<div class="idea-card">
        <div class="mini">${c?`<img src="${esc(c)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="ph-mini">📕</div>`}</div>
        <div class="ii"><b>${esc(r.title)}</b><span>${esc((r.authors||[]).join(', '))}</span></div>
        <button class="btn small" data-idea="${gi}:${i}" title="Ajouter à ma pile à lire">＋ À lire</button>
      </div>`; }).join('') + `</div></div>`).join('');
}
function onIdeaAdd(e){
  if(e.target.closest('[data-ideas-optin]')){ ui.ideas='on'; persistUI(); renderDailyIdeas(); return; }
  if(e.target.closest('[data-ideas-later]')){ _ideasAskMuted = true; renderDailyIdeas(); return; }
  const btn = e.target.closest('[data-idea]'); if(!btn || btn.disabled) return;
  const [gi, i] = btn.dataset.idea.split(':').map(Number);
  const r = ((window._ideaGroups||[])[gi]||{items:[]}).items[i]; if(!r) return;
  const pt = parseTome(r.title) || {};
  const b = newBook({ title:r.title, authors:r.authors||[], type:r.type||'livre', year:r.year||null, pages:r.pages||null,
    cover:cleanCover(r.cover||''), synopsis:cleanSynopsis(r.description||''), status:'wishlist',
    series:pt.series||'', volume:pt.volume ?? null });
  state.books.unshift(b); save(); scheduleRender();
  btn.textContent = 'Ajouté ✓'; btn.disabled = true;
  toast('Ajouté à ta pile à lire ✓', {label:'✎ Modifier', onAction:()=>openEdit(b.id)});
}
function renderDiscover(){
  let strip = $('#discover');
  if(!strip){
    strip = document.createElement('div'); strip.id='discover'; strip.className='now-strip'; strip.hidden=true;
    $('#now-reading').after(strip);
    strip.addEventListener('click', e => { const dc = e.target.closest('.now-card'); if(dc) openDetail(dc.dataset.id); });
  }
  if(ui.status!=='all' || ui.q || ui.tag || ui.types.size){ strip.hidden=true; strip.innerHTML=''; renderDailyIdeas(); return; }
  const recs = recommendations();
  renderDailyIdeas();
  if(!recs.length){ strip.hidden=true; strip.innerHTML=''; return; }
  strip.hidden=false;
  strip.innerHTML = `<div style="flex:0 0 auto; align-self:center; font-size:12px; color:var(--faint); text-transform:uppercase; letter-spacing:.08em; padding-right:4px">À découvrir</div>` +
    recs.map(({b,why})=>`<div class="now-card" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="Suggestion : ${esc(fullTitle(b))}">
      <div class="mini">${coverHTML(b, true)}</div>
      <div class="ni"><div class="nt">${esc(fullTitle(b))}</div><div class="disco-note">${esc(why)}</div></div>
    </div>`).join('');
}
function bookCardHTML(b){
  const pct = b.status==='reading' ? progressPct(b) : null;
  let ribbon = '';
  if(b.loan){ const due=loanDueInfo(b.loan); ribbon = `<span class="ribbon loan${due&&due.days<0?' overdue':''}">📤 ${due&&due.days<0?'retour en retard':'prêté'}</span>`; }
  else if(b.status==='reading') ribbon = `<span class="ribbon reading">${pct!==null ? pct+' %' : 'En cours'}${pct!==null?`<i class="rp" style="width:${pct}%"></i>`:''}</span>`;
  else if(b.status!=='read') ribbon = `<span class="ribbon ${esc(b.status)}">${STATUS_LABEL[b.status]}</span>`;
  const sel = ui.selection.has(b.id);
  return `
    <div class="card${sel?' selected':''}" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(fullTitle(b))}${b.authors.length?', '+esc(authorsStr(b)):''}">
      <div class="cover">
        <span class="badge ${esc(b.type)}">${TYPE_LABEL[b.type]||''}</span>
        <button class="selbox${sel?' on':''}" data-select="${esc(b.id)}" role="checkbox" aria-checked="${sel}" aria-label="Sélectionner">${sel?'✓':''}</button>
        <span class="qk">
          ${b.status!=='read' ? `<button data-quick="read" data-id="${esc(b.id)}" title="Marquer lu" aria-label="Marquer lu">✓</button>` : ''}
          <button data-quick="fav" data-id="${esc(b.id)}" class="${b.favorite?'on':''}" title="Favori" aria-label="Favori">♥</button>
        </span>
        ${coverHTML(b)}
        ${ribbon}
      </div>
      <div class="under">
        ${b.rating ? `<span class="stars">${starsTxt(b.rating)}</span>` : ''}
        ${b.favorite ? `<span class="fav">♥</span>` : ''}
        ${b.review ? `<span class="rv">📝</span>` : ''}
        ${(b.quotes||[]).length ? `<span class="qmark" title="${b.quotes.length} passage(s)">❝</span>` : ''}
      </div>
    </div>`;
}
function seriesCardHTML(it){
  const total = Math.max(...it.books.map(b=>b.seriesTotal||0)) || null;
  const read = readCount(it.books);
  const withCover = it.books.filter(b=>b.cover).sort((a,b)=>(b.volume??0)-(a.volume??0));
  const rep = withCover[0] || it.books[it.books.length-1];
  const ratings = it.books.filter(b=>b.rating);
  const avg = ratings.length ? ratings.reduce((s,b)=>s+b.rating,0)/ratings.length : null;
  const rec = state.series[it.name.trim().toLowerCase()];
  const shown = (rec && rec.rating!=null) ? rec.rating : avg;
  const fav = (rec && rec.favorite) || it.books.some(b=>b.favorite);
  const done = total && read >= total;
  const ids = it.books.map(b=>b.id);
  const nSel = ids.filter(id=>ui.selection.has(id)).length;
  const allSel = nSel===ids.length && nSel>0, someSel = nSel>0 && nSel<ids.length;
  return `
    <div class="card series${allSel?' selected':''}" ${someSel?'data-indet="1"':''} data-series="${esc(it.name)}" role="button" tabindex="0" aria-label="Série ${esc(it.name)}, ${read} lus sur ${total||it.books.length}">
      <div class="cover">
        <span class="badge ${esc(rep.type)}">${TYPE_LABEL[rep.type]||''}</span>
        <button class="selbox${allSel?' on':''}" data-select-series="${esc(it.name)}" role="checkbox" aria-checked="${allSel}" aria-label="Sélectionner la série">${allSel?'✓':(someSel?'–':'')}</button>
        ${coverHTML(rep)}
        <span class="ribbon serie ${done?'done':''}">${esc(it.name)} · ${read}/${total||it.books.length}${done?' ✓':''}</span>
      </div>
      <div class="under">
        ${shown ? `<span class="stars">${starsTxt(Math.round(shown*2)/2)}</span>` : ''}
        ${fav ? `<span class="fav">♥</span>` : ''}
      </div>
    </div>`;
}
// ===== Sélection multiple =====
function enterSelect(){ if(!ui.selectMode){ ui.selectMode = true; document.body.classList.add('selecting'); } }
// une carte série ne représente QUE les tomes visibles sous le filtre courant
function visibleSeriesBooks(name){ const k = name.trim().toLowerCase(); return filteredBooks().filter(b=>seriesKey(b)===k); }
function reflectCard(cardEl){
  if(!cardEl) return;
  if(cardEl.dataset.series){ cardEl.outerHTML = seriesCardHTML({name:cardEl.dataset.series.trim(), books:visibleSeriesBooks(cardEl.dataset.series)}); }
  else if(cardEl.dataset.id){ const b = state.books.find(x=>x.id===cardEl.dataset.id); if(b) cardEl.outerHTML = bookCardHTML(b); }
}
function toggleId(id, cardEl){
  ui.selection.has(id) ? ui.selection.delete(id) : ui.selection.add(id);
  reflectCard(cardEl); updateBulkBar();
}
function toggleSeries(name, cardEl){
  const ids = visibleSeriesBooks(name).map(b=>b.id);
  const all = ids.length>0 && ids.every(x=>ui.selection.has(x));
  ids.forEach(x=> all ? ui.selection.delete(x) : ui.selection.add(x));
  reflectCard(cardEl); updateBulkBar();
}
$('#lib-grid').addEventListener('click', e => {
  if(_lpFired){ _lpFired = false; e.preventDefault(); return; }
  const box = e.target.closest('[data-select]');
  if(box){ enterSelect(); toggleId(box.dataset.select, box.closest('.card')); return; }
  const sbox = e.target.closest('[data-select-series]');
  if(sbox){ enterSelect(); toggleSeries(sbox.dataset.selectSeries, sbox.closest('.card')); return; }
  if(ui.selectMode){
    const c = e.target.closest('.card');
    if(c){ c.dataset.series ? toggleSeries(c.dataset.series, c) : toggleId(c.dataset.id, c); return; }
  }
  const qk = e.target.closest('[data-quick]');
  if(qk){
    const b = state.books.find(x=>x.id===qk.dataset.id); if(!b) return;
    const kind = qk.dataset.quick;
    if(kind==='fav'){ b.favorite = !b.favorite; }
    else if(kind==='read'){ markRead(b); }
    save();
    const stillMatches = !((ui.status==='fav' && kind==='fav' && !b.favorite) || (ui.status==='reading' && kind==='read') || (ui.status==='wishlist' && kind==='read') || (ui.status==='abandoned' && kind==='read'));
    if(stillMatches && !seriesKey(b) && patchCard(b.id)){ renderNowReading(); renderDiscover(); }
    else renderLibrary();
    return;
  }
  const sc = e.target.closest('[data-series]');
  if(sc){ openSeries(sc.dataset.series); return; }
  const card = e.target.closest('.card');
  if(card && card.dataset.id) openDetail(card.dataset.id);
});
// Appui long tactile → entrer en mode sélection
let _lpTimer = null, _lpFired = false, _lpX = 0, _lpY = 0;
$('#lib-grid').addEventListener('pointerdown', e => {
  _lpFired = false; // repart propre à chaque geste (un appui long sans click ne bloque pas le tap suivant)
  if(e.pointerType!=='touch') return;
  const card = e.target.closest('.card'); if(!card) return;
  _lpX = e.clientX; _lpY = e.clientY;
  clearTimeout(_lpTimer);
  _lpTimer = setTimeout(()=>{
    enterSelect();
    card.dataset.series ? toggleSeries(card.dataset.series, card) : toggleId(card.dataset.id, card);
    _lpFired = true;
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_){}
  }, 450);
});
$('#lib-grid').addEventListener('pointermove', e => {
  if(_lpTimer && (Math.abs(e.clientX-_lpX)>10 || Math.abs(e.clientY-_lpY)>10)){ clearTimeout(_lpTimer); _lpTimer=null; }
});
['pointerup','pointercancel','pointerleave'].forEach(ev=>$('#lib-grid').addEventListener(ev, ()=>{ clearTimeout(_lpTimer); _lpTimer=null; }));
// Navigation clavier entre les couvertures (flèches)
$('#lib-grid').addEventListener('keydown', e => {
  if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
  const cards = [...$('#lib-grid').querySelectorAll('.card')];
  if(!cards.length) return;
  const cur = cards.indexOf(document.activeElement.closest('.card'));
  if(cur<0) return;
  e.preventDefault();
  const first = cards[0];
  const cols = Math.max(1, Math.round($('#lib-grid').clientWidth / (first.offsetWidth + 18)));
  let n = cur;
  if(e.key==='ArrowRight') n = Math.min(cards.length-1, cur+1);
  else if(e.key==='ArrowLeft') n = Math.max(0, cur-1);
  else if(e.key==='ArrowDown') n = Math.min(cards.length-1, cur+cols);
  else if(e.key==='ArrowUp') n = Math.max(0, cur-cols);
  else if(e.key==='Home') n = 0;
  else if(e.key==='End') n = cards.length-1;
  cards[n].focus();
});

/* =============== Actions en masse =============== */
function selectedBooks(){ return [...ui.selection].map(id=>state.books.find(b=>b.id===id)).filter(Boolean); }
function updateBulkBar(){
  const bar = $('#bulk-bar'), n = ui.selection.size;
  bar.hidden = n===0;
  $('#lib-select').classList.toggle('active', ui.selectMode);
  if(!n) return;
  bar.innerHTML = `<b>${n} sélectionné${n>1?'s':''}</b>
    <div class="bb-actions">
      ${[['type','Type'],['status','Statut'],['tag','Tag'],['fav','♥'],['list','+ Liste'],['del','Supprimer']]
        .map(([k,l])=>`<button data-bulk="${k}"${k==='del'?' class="danger"':''}>${l}</button>`).join('')}
      <button data-bulk="exit" title="Quitter la sélection">✕</button>
    </div>`;
}
$('#lib-select').addEventListener('click', ()=>{
  if(ui.selectMode){ clearSelection(); }
  else { ui.selectMode = true; document.body.classList.add('selecting'); }
  renderLibrary();
});
// applique une mutation à tous les sélectionnés, avec annulation
function applyBulk(mut, label){
  const books = selectedBooks(); if(!books.length) return;
  const snap = books.map(b=>({ id:b.id, prev:mut.snapshot(b) }));
  books.forEach(b=>mut.apply(b));
  invalidateCache();
  clearSelection(); save(); renderLibrary();
  toast(label+' ✓', {label:'Annuler', onAction:()=>{
    snap.forEach(s=>{ const b = state.books.find(x=>x.id===s.id); if(b) mut.restore(b, s.prev); });
    save(); renderLibrary();
  }});
}
async function bulkDelete(){
  const books = selectedBooks(); if(!books.length) return;
  if(!await uiConfirm({ title:`Supprimer ${books.length} titre(s) ?`, message:'Ils seront retirés de ta bibliothèque et de tes listes. Tu pourras annuler juste après.', okLabel:'Supprimer', danger:true })) return;
  const snaps = books.map(b=>({ b, idx:state.books.indexOf(b), memberOf:state.lists.filter(l=>l.bookIds.includes(b.id)).map(l=>l.id) })).sort((a,c)=>a.idx-c.idx);
  const del = new Set(books.map(b=>b.id));
  state.books = state.books.filter(b=>!del.has(b.id));
  state.lists.forEach(l=> l.bookIds = l.bookIds.filter(id=>!del.has(id)));
  clearSelection(); save(); render();
  toast(`${snaps.length} supprimé(s)`, {label:'Annuler', onAction:()=>{
    snaps.forEach(s=>{ state.books.splice(Math.min(s.idx, state.books.length), 0, s.b); s.memberOf.forEach(id=>{ const l = state.lists.find(x=>x.id===id); if(l && !l.bookIds.includes(s.b.id)) l.bookIds.push(s.b.id); }); });
    save(); render();
  }});
}
async function onBulk(action){
  const n = ui.selection.size; if(!n && action!=='exit') return;
  if(action==='exit'){ clearSelection(); renderLibrary(); return; }
  if(action==='del'){ bulkDelete(); return; }
  if(action==='type'){
    const v = await uiChoose({ title:`Type de ${n} titre(s)`, choices:[
      { label:'Livre', value:'livre', default:true }, { label:'BD', value:'bd' }, { label:'Manga', value:'manga' },
    ]});
    if(!v) return;
    applyBulk({ snapshot:b=>b.type, apply:b=>b.type=v, restore:(b,p)=>b.type=p }, `Type → ${TYPE_LABEL[v]}`);
    return;
  }
  if(action==='status'){
    const s = await uiChoose({ title:`Statut de ${n} titre(s)`, choices:[
      { label:'À lire', value:'wishlist' }, { label:'En cours', value:'reading' },
      { label:'Lu', value:'read', default:true }, { label:'Abandonné', value:'abandoned' },
    ]});
    if(!s) return;
    applyBulk({
      snapshot:b=>({status:b.status, readings:b.readings.slice()}),
      apply:b=>{ b.status=s; if(s==='read'){ b.readings=b.readings||[]; if(!b.readings.length) b.readings.push({id:uid(), date:today(), rating:null}); } },
      restore:(b,p)=>{ b.status=p.status; b.readings=p.readings; },
    }, `Statut → ${STATUS_LABEL[s]}`);
    return;
  }
  if(action==='tag'){
    const raw = await uiPrompt({ title:'Ajouter un tag', message:`Appliqué aux ${n} titre(s) sélectionné(s).`, placeholder:'ex : SF, à relire, coup de cœur', okLabel:'Ajouter' });
    const t = (raw||'').trim().slice(0,60);
    if(!t) return;
    applyBulk({
      snapshot:b=>b.tags.slice(),
      apply:b=>{ if(!b.tags.includes(t) && b.tags.length<20) b.tags=[...new Set([...b.tags, t])]; },
      restore:(b,p)=>b.tags=p,
    }, `Tag « ${t} » ajouté`);
    return;
  }
  if(action==='fav'){
    const on = await uiChoose({ title:'Favoris', message:`Pour les ${n} titre(s) sélectionné(s) :`, choices:[
      { label:'♥ Mettre en favori', value:'on', variant:'primary', default:true }, { label:'♡ Retirer des favoris', value:'off' },
    ]});
    if(on===null) return;
    const fav = (on==='on');
    applyBulk({ snapshot:b=>b.favorite, apply:b=>b.favorite=fav, restore:(b,p)=>b.favorite=p }, fav?'Ajoutés aux favoris':'Retirés des favoris');
    return;
  }
  if(action==='list'){
    if(!state.lists.length){ toast('Crée d\'abord une liste (onglet Listes)'); return; }
    const l = await uiChoose({ title:'Ajouter à une liste', choices: state.lists.map((l,i)=>({ label:l.name, value:l.id, default:i===0 })) });
    if(!l) return;
    const list = state.lists.find(x=>x.id===l); if(!list) return;
    const books = selectedBooks(); const added = [];
    books.forEach(b=>{ if(!list.bookIds.includes(b.id) && list.bookIds.length<MAX_BOOKIDS){ list.bookIds.push(b.id); added.push(b.id); } });
    clearSelection(); save(); renderLibrary();
    toast(`${added.length} ajouté(s) à « ${list.name} »`, {label:'Annuler', onAction:()=>{ list.bookIds = list.bookIds.filter(id=>!added.includes(id)); save(); }});
    return;
  }
}
$('#bulk-bar').addEventListener('click', e => {
  const b = e.target.closest('[data-bulk]'); if(b) onBulk(b.dataset.bulk);
});

/* =============== Collections intelligentes (filtres sauvegardés) =============== */
function renderSmartChips(){
  const box = $('#smart-chips'); if(!box) return;
  box.innerHTML = state.smartCollections.map(c=>
    `<button class="chip" data-sc="${esc(c.id)}">${esc(c.name)} <span class="sc-del" data-sc-del="${esc(c.id)}" aria-label="Supprimer le filtre">✕</span></button>`).join('');
}
$('#lib-savefilter').addEventListener('click', async ()=>{
  const name = await uiPrompt({ title:'Enregistrer ce filtre', message:'Retrouve cette combinaison de filtres en un clic depuis ta bibliothèque.', placeholder:'ex : Mangas en cours, SF notés 4+', okLabel:'Enregistrer' });
  if(!name || !name.trim()) return;
  state.smartCollections.push({id:uid(), name:name.trim().slice(0,80), f:{status:ui.status, types:[...ui.types], tag:ui.tag, q:ui.q, sort:ui.sort}});
  if(state.smartCollections.length>MAX_SMART) state.smartCollections = state.smartCollections.slice(-MAX_SMART);
  save(); renderSmartChips(); toast('Filtre enregistré ✓');
});
function applySmart(c){
  ui.status=c.f.status; ui.types=new Set(c.f.types); ui.tag=c.f.tag; ui.q=c.f.q; ui.sort=c.f.sort;
  $('#lib-q').value=c.f.q; $('#lib-sort').value=c.f.sort;
  $$('#status-chips .chip').forEach(x=>{ const on=x.dataset.status===c.f.status; x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  $$('#type-chips .chip[data-type]').forEach(x=>{ const on=ui.types.has(x.dataset.type); x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  persistUI(); renderLibrary();
  $('#lib-tag').value = c.f.tag;
}
$('#smart-chips').addEventListener('click', e => {
  const del = e.target.closest('[data-sc-del]');
  if(del){ e.stopPropagation(); state.smartCollections = state.smartCollections.filter(c=>c.id!==del.dataset.scDel); save(); renderSmartChips(); return; }
  const chip = e.target.closest('[data-sc]');
  if(chip){ const c = state.smartCollections.find(x=>x.id===chip.dataset.sc); if(c) applySmart(c); }
});

/* =============== Journal =============== */
function renderJournal(){
  const y = new Date().getFullYear();
  const gi = goalInfo(y);
  $('#journal-goal').innerHTML = gi ? `
    <div class="goal-line" id="jgoal" role="button" tabindex="0" aria-label="Objectif ${y} : ${gi.done} sur ${gi.goal}">
      <b>Objectif ${y}</b>
      <div class="track"><div class="fill" style="width:${Math.min(100, gi.done/gi.goal*100)}%"></div></div>
      <b>${gi.done}/${gi.goal}</b>
      ${paceHTML(gi)}
    </div>` : `
    <div class="goal-line" id="jgoal" role="button" tabindex="0" aria-label="Définir un objectif de lecture">
      <span style="color:var(--muted)">🎯 Fixe-toi un objectif de lectures pour ${y} — clique ici.</span>
    </div>`;
  $('#jgoal').addEventListener('click', ()=>setGoal(y));

  const entries = allReadings().sort((a,b)=> b.date.localeCompare(a.date));
  const box = $('#journal-body');
  if(!entries.length){
    box.innerHTML = `<div class="empty"><div class="big">🗓️</div><h3>Journal vide</h3>
      <p>Quand tu marques un titre comme « Lu » (ou que tu ajoutes une date de lecture), il apparaît ici, mois par mois — relectures comprises.</p></div>`;
    return;
  }
  const groups = new Map();
  for(const e of entries){
    const key = e.date.slice(0,7);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  // « À la même période l'an dernier » : lectures dans une fenêtre de ±15 jours autour
  // d'aujourd'hui moins un an — petit moment de nostalgie façon « souvenirs ».
  let html = '';
  const _past = new Date(); _past.setFullYear(_past.getFullYear()-1);
  const _lo = new Date(_past); _lo.setDate(_lo.getDate()-15);
  const _hi = new Date(_past); _hi.setDate(_hi.getDate()+15);
  const ago = entries.filter(e=>e.date>=dateKey(_lo) && e.date<=dateKey(_hi));
  if(ago.length){
    html += `<div class="month ago-month"><h3>📅 À la même période l'an dernier</h3>` + ago.slice(0,6).map(e=>{
      const b = e.b, d = new Date(e.date+'T12:00:00'), shown = e.rating ?? b.rating;
      return `<div class="entry" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(fullTitle(b))}, lu le ${fmtDate(e.date)}">
        <div class="day"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR',{weekday:'short'})}</span></div>
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="einfo"><div class="et">${esc(fullTitle(b))}</div><div class="ea">${esc(authorsStr(b))}</div></div>
        <div class="emeta">${shown?`<span class="stars">${starsTxt(shown)}</span>`:''}</div>
      </div>`;
    }).join('') + `</div>`;
  }
  for(const [key, list] of groups){
    const label = new Date(key+'-15T12:00:00').toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
    html += `<div class="month"><h3>${label}</h3>` + list.map(e => {
      const b = e.b;
      const d = new Date(e.date+'T12:00:00');
      const sorted = (b.readings||[]).slice().sort((x,y2)=>x.date.localeCompare(y2.date)||String(x.id).localeCompare(String(y2.id)));
      const nth = sorted.findIndex(r=>r.id===e.rid);
      const shown = e.rating ?? b.rating;
      return `<div class="entry" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(fullTitle(b))}, lu le ${fmtDate(e.date)}">
        <div class="day"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR',{weekday:'short'})}</span></div>
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="einfo">
          <div class="et">${esc(fullTitle(b))}</div>
          <div class="ea">${esc(authorsStr(b))}</div>
        </div>
        <div class="emeta">
          ${nth>0 ? `<span class="reread" title="Relecture n°${nth+1}">↻</span>` : ''}
          ${b.review ? `<span class="rv" title="Critique">📝</span>` : ''}
          ${b.favorite ? `<span class="fav" style="color:var(--orange)">♥</span>` : ''}
          <span class="tbadge ${esc(b.type)}">${TYPE_LABEL[b.type]}</span>
          <span class="stars">${starsTxt(shown)}</span>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }
  box.innerHTML = html;
}
$('#journal-body').addEventListener('click', e => {
  const row = e.target.closest('.entry'); if(row) openDetail(row.dataset.id);
});

/* =============== Recherche / ajout =============== */
const SEARCH_HINT = `<div class="search-hint">Recherche via Google Books et Open Library — couvertures et infos remplies automatiquement.<br>Astuce : « One Piece 42 » préremplit la série et le tome. Introuvable ? « Ajout manuel ».</div>`;
function openSearch(){
  openOverlay('#ov-search');
  $('#search-q').value = '';
  $('#search-results').innerHTML = SEARCH_HINT;
  setTimeout(()=>$('#search-q').focus(), 60);
}
$('#btn-open-search').addEventListener('click', openSearch);

let searchTimer = null, searchSeq = 0;
$('#search-q').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if(q.length < 2){
    searchSeq++;
    $('#search-results').innerHTML = SEARCH_HINT;
    return;
  }
  searchTimer = setTimeout(()=>doSearch(q), 420);
});
$('#search-q').addEventListener('keydown', e => {
  if(e.key==='Enter'){
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if(q.length>=2) doSearch(q);
  }
});
function guessType(hint, title){
  const h = (hint||'').toLowerCase(), t = (title||'').toLowerCase();
  if(/manga|manhwa|manhua|webtoon|shonen|shōnen|shojo|shōjo|seinen|josei|tankobon|tankōbon/.test(h) || /manga/.test(t)) return 'manga';
  if(/comic|graphic novel|bande dessin|bandes dessin|bd\b/.test(h)) return 'bd';
  return 'livre';
}
function isbnOf(q){
  const n = q.replace(/[-\s]/g,'');
  return /^(?:\d{9}[\dX]|\d{13})$/i.test(n) ? n : null;
}
async function searchGoogleBooks(q){
  const isbn = isbnOf(q);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(isbn ? 'isbn:'+isbn : q)}&maxResults=15&printType=books`;
  const data = await (await fetch(url)).json();
  if(data.error) throw new Error(data.error.message);
  return (data.items||[]).filter(it=>it.volumeInfo && it.volumeInfo.title).map(it => {
    const v = it.volumeInfo;
    return {
      title: v.title + (v.subtitle ? ' — '+v.subtitle : ''),
      authors: v.authors||[],
      year: +(v.publishedDate||'').slice(0,4) || null,
      pages: numOrNull(v.pageCount),
      cover: v.imageLinks ? (v.imageLinks.thumbnail||v.imageLinks.smallThumbnail||'').replace('http://','https://') : '',
      type: guessType((v.categories||[]).join(' '), v.title),
      description: typeof v.description==='string' ? v.description : '',
    };
  });
}
async function searchOpenLibrary(q){
  const isbn = isbnOf(q);
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(isbn ? 'isbn:'+isbn : q)}&limit=15&lang=fr&fields=title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,first_sentence`;
  const data = await (await fetch(url)).json();
  return (data.docs||[]).filter(d=>d.title).map(d => ({
    title: d.title,
    authors: d.author_name||[],
    year: numOrNull(d.first_publish_year),
    pages: numOrNull(d.number_of_pages_median),
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    type: guessType((d.subject||[]).slice(0,25).join(' '), d.title),
    description: Array.isArray(d.first_sentence) ? String(d.first_sentence[0]||'') : (typeof d.first_sentence==='string' ? d.first_sentence : ''),
  }));
}
async function doSearch(q){
  const seq = ++searchSeq;
  const box = $('#search-results');
  box.innerHTML = Array(4).fill('<div class="sr sk"><div class="mini"></div><div class="sri"><b></b><span></span></div></div>').join('');
  const settled = await Promise.allSettled([searchGoogleBooks(q), searchOpenLibrary(q)]);
  if(seq !== searchSeq) return;
  const [gb, ol] = settled.map(s => s.status==='fulfilled' ? s.value : null);
  const failed = settled.some(s => s.status==='rejected');
  if(gb===null && ol===null){
    box.innerHTML = `<div class="search-hint">Recherche indisponible (hors ligne ?). Tu peux toujours passer par « Ajout manuel ».</div>`;
    return;
  }
  const items = [], seen = new Set();
  for(const r of [...(gb||[]), ...(ol||[])]){
    const key = (r.title+'|'+(r.authors[0]||'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
    if(seen.has(key)) continue;
    seen.add(key); items.push(r);
  }
  if(!items.length){
    box.innerHTML = `<div class="search-hint">${failed
      ? 'Une des sources est indisponible (limite atteinte ?) et l\'autre n\'a rien trouvé — réessaie dans une minute ou passe par « Ajout manuel ».'
      : 'Aucun résultat. Essaie une autre orthographe, ou passe par « Ajout manuel ».'}</div>`;
    return;
  }
  window._searchItems = items;
  box.innerHTML = items.map((r,i) => { const c = cleanCover(r.cover); return `<div class="sr">
      <div class="mini">${c ? `<img src="${esc(c)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph-mini">📕</div>`}</div>
      <div class="sri">
        <b>${esc(r.title)}</b>
        <span>${esc(r.authors.join(', '))}</span>
        <span>${[r.year, r.pages?r.pages+' p.':'' ].filter(Boolean).join(' · ')}</span>
      </div>
      <button class="btn small add-edit" data-i="${i}" title="Ouvrir le formulaire complet">Détails</button>
      <button class="btn small primary add" data-i="${i}">Ajouter</button>
    </div>`; }).join('');
}
function parseTome(title){
  let m = title.match(/^(.*?)[\s,–—:-]*(?:tome|t\.|vol(?:ume)?\.?|#)\s*(\d{1,4})\b/i);
  if(m && m[1].trim()) return {series:m[1].trim().replace(/[,–—:-]+$/,'').trim(), volume:+m[2]};
  m = title.match(/^(.+?)[\s,–—-]+(\d{1,3})$/);
  if(m && +m[2] <= 300) return {series:m[1].trim(), volume:+m[2]};
  return null;
}
$('#search-results').addEventListener('click', e => {
  const edit = e.target.closest('.add-edit');
  const btn = edit || e.target.closest('.add'); if(!btn) return;
  const r = (window._searchItems||[])[+btn.dataset.i]; if(!r) return;
  const pt = parseTome(r.title) || {};
  const data = {
    title:r.title, authors:r.authors||[], type:r.type||'livre',
    year:r.year||null, pages:r.pages||null, cover:cleanCover(r.cover||''),
    synopsis:cleanSynopsis(r.description||''), status:ui.defaultStatus,
    series:pt.series||'', volume:pt.volume ?? null,
  };
  if(edit){
    // « Détails » : passer par le formulaire complet
    ui.searchFromResult = data;
    closeOverlays();
    openEdit(null);
    return;
  }
  // Ajout express : créer tout de suite, garder la recherche ouverte pour enchaîner
  const b = newBook(data);
  state.books.unshift(b);
  save(); scheduleRender();
  const row = btn.closest('.sr');
  if(row){ row.classList.add('added'); btn.textContent = 'Ajouté ✓'; btn.disabled = true; }
  toast('Ajouté ✓', {label:'✎ Modifier', onAction:()=>{ closeOverlays(); openEdit(b.id); }});
});
$('#btn-manual').addEventListener('click', ()=>{ ui.searchFromResult = null; closeOverlays(); openEdit(null); });
$('#search-status').addEventListener('click', e => {
  const b = e.target.closest('button[data-s]'); if(!b) return;
  ui.defaultStatus = b.dataset.s;
  $$('#search-status button').forEach(x=>x.classList.toggle('on', x===b));
  persistUI();
});

/* =============== Synopsis à la demande =============== */
async function fetchSynopsis(b){
  toast('Recherche du synopsis…');
  try{
    let hit = null;
    try{
      const gb = await searchGoogleBooks(`${b.title} ${b.authors[0]||''}`.trim());
      hit = gb.find(r=>r.description);
    }catch(_){ }
    if(!hit){
      try{
        const ol = await searchOpenLibrary(`${b.title} ${b.authors[0]||''}`.trim());
        hit = ol.find(r=>r.description);
      }catch(_){ }
    }
    if(hit && state.books.includes(b) && !b.synopsis){
      b.synopsis = cleanSynopsis(hit.description);
      save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
      toast('Synopsis ajouté ✓');
    }else{
      toast('Pas de synopsis trouvé — tu peux le coller via ✎ Modifier');
    }
  }catch(_){ toast('Recherche indisponible'); }
}

/* =============== Scanner ISBN (caméra) =============== */
let scanStream = null, scanTimer = null, scanPending = false;
const scanSupported = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
if(scanSupported) $('#btn-scan').hidden = false;
async function startScan(){
  if(scanStream || scanPending) return;
  scanPending = true;
  let stream;
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  }catch(e){ scanPending = false; toast('Caméra indisponible ou refusée'); return; }
  scanPending = false;
  // la modale a pu être fermée pendant la demande de permission : ne pas garder la caméra allumée
  if(!$('#ov-search').classList.contains('open')){
    stream.getTracks().forEach(t=>t.stop());
    return;
  }
  scanStream = stream;
  $('#scan-box').hidden = false;
  const video = $('#scan-video');
  video.srcObject = scanStream;
  try{ await video.play(); }catch(_){ }
  let detector;
  try{ detector = new BarcodeDetector({formats:['ean_13','ean_8']}); }
  catch(e){ stopScan(); toast('Scanner non supporté sur cet appareil'); return; }
  scanTimer = setInterval(async ()=>{
    try{
      const codes = await detector.detect(video);
      const hit = codes.find(c=>/^\d{8}$|^\d{13}$/.test(c.rawValue));
      if(hit){
        const isbn = hit.rawValue;
        stopScan();
        $('#search-q').value = isbn;
        toast('Code-barres lu ✓');
        doSearch(isbn);
      }
    }catch(_){ }
  }, 350);
}
function stopScan(){
  clearInterval(scanTimer); scanTimer = null;
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream = null; }
  const box = $('#scan-box');
  if(box) box.hidden = true;
  const v = $('#scan-video'); if(v) v.srcObject = null;
}
$('#btn-scan').addEventListener('click', startScan);
$('#scan-stop').addEventListener('click', stopScan);
// PWA mobile : couper la caméra si l'app passe en arrière-plan pendant un scan
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stopScan(); });

/* =============== Édition =============== */
function openEdit(id){
  ui.editId = id;
  const b = id ? state.books.find(x=>x.id===id) : null;
  const pre = b || ui.searchFromResult || {};
  $('#edit-title').textContent = b ? 'Modifier' : 'Nouvelle lecture';
  $('#f-title').value = pre.title||'';
  $('#f-authors').value = (pre.authors||[]).join(', ');
  $('#f-type').value = pre.type||'livre';
  $('#f-status').value = (b && b.status) || pre.status || 'wishlist';
  $('#f-series').value = pre.series||'';
  $('#f-volume').value = pre.volume ?? '';
  $('#f-stotal').value = pre.seriesTotal ?? '';
  $('#f-year').value = pre.year ?? '';
  $('#f-pages').value = pre.pages ?? '';
  $('#f-cover').value = pre.cover||'';
  $('#f-syn').value = pre.synopsis||'';
  $('#f-tags').value = (pre.tags||[]).join(', ');
  ui.searchFromResult = null;
  openOverlay('#ov-edit');
  setTimeout(()=>$('#f-title').focus(), 60);
}
$('#btn-save-edit').addEventListener('click', () => {
  const title = $('#f-title').value.trim();
  if(!title){ toast('Le titre est obligatoire'); $('#f-title').focus(); return; }
  const data = {
    title,
    authors: $('#f-authors').value.split(',').map(s=>s.trim()).filter(Boolean),
    type: $('#f-type').value,
    status: $('#f-status').value,
    series: $('#f-series').value.trim(),
    volume: numOrNull($('#f-volume').value),
    seriesTotal: numOrNull($('#f-stotal').value),
    year: numOrNull($('#f-year').value),
    pages: numOrNull($('#f-pages').value),
    cover: cleanCover($('#f-cover').value.trim()),
    synopsis: cleanSynopsis($('#f-syn').value),
    tags: $('#f-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
  };
  const wasNew = !ui.editId;
  if(ui.editId){
    const b = state.books.find(x=>x.id===ui.editId);
    if(!b) return;
    const wasRead = b.status==='read';
    Object.assign(b, data);
    if(b.status==='read' && !wasRead && !(b.readings||[]).length) b.readings = [{id:uid(), date:today(), rating:null}];
  }else{
    state.books.unshift(newBook(data));
  }
  ui.editId = null;
  save(); closeOverlays(); render();
  toast(wasNew ? 'Ajouté à ta bibliothèque ✓' : 'Modifié ✓');
});
// Construit un livre neuf complet à partir de champs partiels
function newBook(data){
  const b = Object.assign({
    id:uid(), rating:null, review:'', synopsis:'', favorite:false, tags:[], readings:[],
    currentPage:null, progressLog:[], moods:[], pace:null, quotes:[], loan:null, study:null,
    volume:null, seriesTotal:null, year:null, pages:null, cover:'', series:'', authors:[], type:'livre',
    status:'wishlist', addedAt:new Date().toISOString()
  }, data);
  if(b.status==='read' && !b.readings.length) b.readings = [{id:uid(), date:today(), rating:null}];
  return b;
}

/* =============== Mode étude =============== */
function studyCounts(b){
  const cards=(b.study&&b.study.cards)||[];
  const due=cards.filter(c=>c.due<=today()).length;
  const reviewed=cards.filter(c=>c.lastReviewed).length;
  const mastery=cards.length ? Math.round(cards.reduce((n,c)=>n+Math.min(1,(c.interval||0)/30),0)/cards.length*100) : 0;
  return {cards:cards.length,due,reviewed,mastery};
}
function studyDueCards(bookId=null, all=false){
  const out=[];
  for(const b of state.books){
    if(bookId && b.id!==bookId) continue;
    for(const card of ((b.study&&b.study.cards)||[])){
      if(all || card.due<=today()) out.push({bookId:b.id,cardId:card.id,due:card.due,title:fullTitle(b)});
    }
  }
  return out.sort((a,b)=>a.due.localeCompare(b.due)||a.title.localeCompare(b.title,'fr'));
}
function studyDueLabel(card){
  const days=daysUntil(card.due);
  if(days<0) return `En retard de ${-days} j`;
  if(days===0) return 'À réviser aujourd’hui';
  if(days===1) return 'Demain';
  return `Dans ${days} jours`;
}
function renderStudyAlert(){
  const box=$('#study-alert'); if(!box) return;
  const due=studyDueCards();
  if(!due.length){ box.hidden=true; box.innerHTML=''; return; }
  const books=new Set(due.map(x=>x.bookId)).size;
  box.hidden=false;
  box.innerHTML=`<span>🎓 <b>${due.length} carte${due.length>1?'s':''} à réviser</b> dans ${books} livre${books>1?'s':''} — une session prend moins de cinq minutes.</span><button class="btn small primary" id="study-alert-open">Commencer</button>`;
  $('#study-alert-open').onclick=()=>startStudyReview();
}
function studySimpleItems(items, kind, empty){
  if(!items.length) return `<div class="study-empty">${empty}</div>`;
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body">${esc(x.text)}</div><div><button class="btn small" data-study-edit="${kind}:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="${kind}:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyQuestionItems(items){
  if(!items.length) return '<div class="study-empty">Ajoute les questions auxquelles tu veux encore savoir répondre dans plusieurs mois.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.question)}</b>${x.answer?`<small>${esc(x.answer)}</small>`:''}</div><div><button class="btn small" data-study-qcard="${esc(x.id)}" title="Transformer en carte mémoire">Carte</button><button class="btn small" data-study-edit="questions:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="questions:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyChapterItems(items){
  if(!items.length) return '<div class="study-empty">Organise ici tes notes au fil des chapitres.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.title||'Chapitre sans titre')}</b>${x.notes?`<small>${esc(x.notes)}</small>`:''}</div><div><button class="btn small" data-study-edit="chapters:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="chapters:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyCardItems(items){
  if(!items.length) return '<div class="study-empty">Crée une première carte : une question courte devant, la réponse derrière.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.front)}</b><small>${esc(x.back)}</small><div class="study-card-due ${x.due<=today()?'now':''}">${esc(studyDueLabel(x))}${x.lastReviewed?` · intervalle ${x.interval} j`:''}</div></div><div><button class="btn small" data-study-edit="cards:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="cards:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function renderStudyEditor(b, focus=''){
  const s=b.study||emptyStudy(), c=studyCounts(b);
  $('#study-head').textContent='Mode étude';
  $('#study-body').innerHTML=`
    <div class="study-hero">
      <div><h4>${esc(fullTitle(b))}</h4><p>${esc(authorsStr(b))} · transforme ta lecture en connaissances durables.</p></div>
      <div class="study-stats"><div class="study-stat"><b>${c.cards}</b><span>cartes</span></div><div class="study-stat"><b>${c.due}</b><span>à revoir</span></div><div class="study-stat"><b>${c.mastery}%</b><span>maîtrise</span></div></div>
    </div>
    <div class="study-actions">
      <button class="btn primary" data-study-review="${c.due?'due':'all'}">${c.due?`▶ Réviser ${c.due} carte${c.due>1?'s':''}`:'▶ S’entraîner'}</button>
      <button class="btn" data-study-export="md">⬇ Markdown</button>
      <button class="btn" data-study-export="print">🖨 Imprimer / PDF</button>
      <button class="btn" data-study-back>← Revenir au livre</button>
    </div>
    <details class="study-section" open><summary>🎯 Intention et résumé</summary><div class="study-inside">
      <label class="study-label" for="st-objective">Pourquoi je lis ce livre</label><textarea id="st-objective" rows="2" placeholder="Ce que tu veux comprendre, apprendre ou changer…">${esc(s.objective)}</textarea>
      <label class="study-label" for="st-summary">Résumé avec mes propres mots</label><textarea id="st-summary" rows="6" placeholder="Explique le livre comme si tu devais le raconter à quelqu’un…">${esc(s.summary)}</textarea>
    </div></details>
    <details class="study-section" open><summary>💡 Idées essentielles <span class="pill">${s.ideas.length}</span></summary><div class="study-inside">
      ${studySimpleItems(s.ideas,'ideas','Note les principes ou arguments que tu ne veux pas oublier.')}
      <div class="study-add"><textarea id="st-idea" rows="2" placeholder="Une idée importante…"></textarea><button class="btn small primary" data-study-add="idea">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='lessons'?' open':''}><summary>✅ Leçons à appliquer <span class="pill">${s.lessons.length}</span></summary><div class="study-inside">
      ${studySimpleItems(s.lessons,'lessons','Transforme une idée en action concrète dans ta vie, tes études ou ton travail.')}
      <div class="study-add"><textarea id="st-lesson" rows="2" placeholder="Ce que je vais appliquer…"></textarea><button class="btn small primary" data-study-add="lesson">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='questions'?' open':''}><summary>❓ Questions de compréhension <span class="pill">${s.questions.length}</span></summary><div class="study-inside">
      ${studyQuestionItems(s.questions)}
      <div class="study-add two"><textarea id="st-question" rows="2" placeholder="Question…"></textarea><textarea id="st-answer" rows="2" placeholder="Réponse…"></textarea><button class="btn small primary" data-study-add="question">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='chapters'?' open':''}><summary>📑 Notes par chapitre <span class="pill">${s.chapters.length}</span></summary><div class="study-inside">
      ${studyChapterItems(s.chapters)}
      <div class="study-add two"><input id="st-chapter-title" placeholder="Titre ou numéro du chapitre"><textarea id="st-chapter-notes" rows="3" placeholder="Notes du chapitre…"></textarea><button class="btn small primary" data-study-add="chapter">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section" open><summary>🧠 Cartes mémoire <span class="pill">${s.cards.length}</span></summary><div class="study-inside">
      ${studyCardItems(s.cards)}
      <div class="study-add two"><textarea id="st-card-front" rows="2" placeholder="Question / recto…"></textarea><textarea id="st-card-back" rows="2" placeholder="Réponse / verso…"></textarea><button class="btn small primary" data-study-add="card">＋ Créer</button></div>
    </div></details>`;
}
function openStudy(id){
  const b=state.books.find(x=>x.id===id); if(!b) return;
  ui.studyBookId=b.id; renderStudyEditor(b); openOverlay('#ov-study');
}
function studyMarkdown(b){
  const s=b.study||emptyStudy(), lines=[`# ${fullTitle(b)}`, '', authorsStr(b)?`*${authorsStr(b)}*`:'', ''];
  const section=(title,text)=>{ if(text){ lines.push(`## ${title}`,'',text,''); } };
  section('Mon intention',s.objective); section('Résumé personnel',s.summary);
  if(s.ideas.length) lines.push('## Idées essentielles','',...s.ideas.map(x=>`- ${x.text.replace(/\n/g,' ')}`),'');
  if(s.lessons.length) lines.push('## Leçons à appliquer','',...s.lessons.map(x=>`- [ ] ${x.text.replace(/\n/g,' ')}`),'');
  if(s.questions.length){ lines.push('## Questions de compréhension',''); s.questions.forEach(x=>lines.push(`### ${x.question}`,'',x.answer||'*Réponse à compléter*','')); }
  if(s.chapters.length){ lines.push('## Notes par chapitre',''); s.chapters.forEach(x=>lines.push(`### ${x.title||'Chapitre'}`,'',x.notes||'','')); }
  if(s.cards.length){ lines.push('## Cartes mémoire',''); s.cards.forEach(x=>lines.push(`- **Q :** ${x.front.replace(/\n/g,' ')}`,`  **R :** ${x.back.replace(/\n/g,' ')}`)); lines.push(''); }
  if((b.quotes||[]).length){ lines.push('## Passages marquants','',...(b.quotes||[]).map(q=>`> ${q.text.replace(/\n/g,' ')}${q.page!=null?` — p. ${q.page}`:''}`),''); }
  return lines.filter((x,i,a)=>x!=='' || a[i-1]!=='').join('\n').trim()+'\n';
}
function studyFilename(b,ext){ const base=('fiche-'+fullTitle(b)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,90).toLowerCase(); return (base||'fiche-tome')+'.'+ext; }
function exportStudyMarkdown(b){ downloadBlob('\uFEFF'+studyMarkdown(b),'text/markdown;charset=utf-8',studyFilename(b,'md')); toast('Fiche Markdown téléchargée ✓'); }
function studyPrintHTML(b){
  const s=b.study||emptyStudy(), block=(title,html)=>html?`<h2>${esc(title)}</h2>${html}`:'';
  const paras=x=>esc(x).replace(/\n/g,'<br>');
  return `<h1>${esc(fullTitle(b))}</h1><div class="muted">${esc(authorsStr(b))} · Fiche d’étude Tome</div>
    ${block('Mon intention',paras(s.objective))}${block('Résumé personnel',paras(s.summary))}
    ${block('Idées essentielles',s.ideas.length?`<ul>${s.ideas.map(x=>`<li>${paras(x.text)}</li>`).join('')}</ul>`:'')}
    ${block('Leçons à appliquer',s.lessons.length?`<ul>${s.lessons.map(x=>`<li>☐ ${paras(x.text)}</li>`).join('')}</ul>`:'')}
    ${block('Questions de compréhension',s.questions.map(x=>`<h3>${esc(x.question)}</h3><div>${paras(x.answer)}</div>`).join(''))}
    ${block('Notes par chapitre',s.chapters.map(x=>`<h3>${esc(x.title||'Chapitre')}</h3><div>${paras(x.notes)}</div>`).join(''))}
    ${block('Cartes mémoire',s.cards.map(x=>`<h3>Q · ${esc(x.front)}</h3><div>R · ${paras(x.back)}</div>`).join(''))}
    ${block('Passages marquants',(b.quotes||[]).map(q=>`<blockquote>${paras(q.text)}${q.page!=null?` — p. ${q.page}`:''}</blockquote>`).join(''))}`;
}
function printStudy(b){
  // l'écouteur AVANT l'impression : window.print() peut bloquer et déclencher afterprint
  // avant de rendre la main, auquel cas un écouteur posé après ne se déclencherait jamais
  const box=$('#study-print'); box.innerHTML=studyPrintHTML(b);
  addEventListener('afterprint',()=>{ box.innerHTML=''; },{once:true});
  window.print();
}
let studySaveTimer=0;
const studySession={queue:[],index:0,revealed:false,reviewed:0,bookId:null};
function startStudyReview(bookId=null, all=false){
  const queue=studyDueCards(bookId,all).slice(0,5);
  if(!queue.length){ toast('Crée d’abord une carte mémoire'); return; }
  Object.assign(studySession,{queue,index:0,revealed:false,reviewed:0,bookId});
  openOverlay('#ov-study'); renderStudyReview();
}
function currentStudyCard(){
  const ref=studySession.queue[studySession.index]; if(!ref) return null;
  const book=state.books.find(b=>b.id===ref.bookId), card=book&&book.study&&book.study.cards.find(c=>c.id===ref.cardId);
  return book&&card?{book,card}:null;
}
function renderStudyReview(){
  $('#study-head').textContent='Révision';
  const cur=currentStudyCard();
  if(!cur){ renderStudyDone(); return; }
  const {book,card}=cur, total=studySession.queue.length, n=studySession.index+1;
  $('#study-body').innerHTML=`<div class="study-review" tabindex="0">
    <div class="study-review-top"><span>${n}/${total}</span><div class="track"><div class="fill" style="width:${Math.round((n-1)/total*100)}%"></div></div><button data-review-exit>Quitter</button></div>
    <div class="study-flash"><div class="book">${esc(fullTitle(book))}</div><div class="front">${esc(card.front)}</div>
      ${studySession.revealed?`<div class="study-answer">${esc(card.back)}</div>`:''}</div>
    <div class="study-review-actions">${studySession.revealed
      ? '<button class="btn" data-study-grade="again">À revoir</button><button class="btn" data-study-grade="hard">Difficile</button><button class="btn primary" data-study-grade="good">Bien</button><button class="btn" data-study-grade="easy">Facile</button>'
      : '<button class="btn primary" data-study-reveal>Afficher la réponse</button>'}</div>
    <div class="card-hint">${studySession.revealed?'Raccourcis : 1 à revoir · 2 difficile · 3 bien · 4 facile':'Appuie sur Espace pour révéler la réponse'}</div>
  </div>`;
  setTimeout(()=>{ const el=$('#study-body .study-review'); if(el)el.focus(); },0);
}
function gradeStudyCard(card,grade){
  const prev=Math.max(0,card.interval||0);
  if(grade==='again'){ card.interval=1; card.repetitions=0; }
  else if(grade==='hard'){ card.interval=prev ? Math.max(2,Math.round(prev*1.5)) : 2; card.repetitions=(card.repetitions||0)+1; }
  else if(grade==='good'){ card.interval=prev ? Math.max(4,Math.round(prev*2.4)) : 4; card.repetitions=(card.repetitions||0)+1; }
  else { card.interval=prev ? Math.max(7,Math.round(prev*3.5)) : 7; card.repetitions=(card.repetitions||0)+1; }
  card.lastReviewed=today(); card.due=isoAfterDays(today(),card.interval); return card.interval;
}
function renderStudyDone(){
  const remain=studyDueCards().length;
  $('#study-head').textContent='Session terminée';
  $('#study-body').innerHTML=`<div class="study-done"><div class="big">🎓</div><h4>${studySession.reviewed} carte${studySession.reviewed>1?'s':''} révisée${studySession.reviewed>1?'s':''}</h4><p>Chaque rappel réussi espace un peu plus la prochaine révision.</p><div class="study-actions" style="justify-content:center">${remain?'<button class="btn primary" data-review-more>Continuer</button>':''}${studySession.bookId?'<button class="btn" data-review-editor>Revenir à la fiche</button>':''}<button class="btn" data-close>Terminer</button></div></div>`;
  scheduleRender();
}

$('#study-body').addEventListener('input',e=>{
  const b=state.books.find(x=>x.id===ui.studyBookId); if(!b) return;
  if(e.target.id==='st-objective' || e.target.id==='st-summary'){
    const s=touchStudy(b); s[e.target.id==='st-objective'?'objective':'summary']=cleanStudyText(e.target.value,e.target.id==='st-summary'?30000:4000);
    clearTimeout(studySaveTimer); studySaveTimer=setTimeout(()=>save(),500);
  }
});
$('#study-body').addEventListener('click',e=>{
  const b=state.books.find(x=>x.id===ui.studyBookId);
  if(e.target.closest('[data-study-back]')){ if(b) openDetail(b.id); return; }
  const exp=e.target.closest('[data-study-export]');
  if(exp&&b){ exp.dataset.studyExport==='md'?exportStudyMarkdown(b):printStudy(b); return; }
  const review=e.target.closest('[data-study-review]');
  if(review&&b){ startStudyReview(b.id,review.dataset.studyReview==='all'); return; }
  const add=e.target.closest('[data-study-add]');
  if(add&&b){
    const s=touchStudy(b), kind=add.dataset.studyAdd;
    if(kind==='idea' || kind==='lesson'){
      const input=$(kind==='idea'?'#st-idea':'#st-lesson'), text=cleanStudyText(input.value,4000); if(!text){input.focus();return;}
      s[kind==='idea'?'ideas':'lessons'].push({id:uid(),text});
    }else if(kind==='question'){
      const question=cleanStudyText($('#st-question').value,4000), answer=cleanStudyText($('#st-answer').value,8000); if(!question){$('#st-question').focus();return;}
      s.questions.push({id:uid(),question,answer});
    }else if(kind==='chapter'){
      const title=cleanStudyText($('#st-chapter-title').value,500), notes=cleanStudyText($('#st-chapter-notes').value,12000); if(!title&&!notes){$('#st-chapter-title').focus();return;}
      s.chapters.push({id:uid(),title,notes});
    }else if(kind==='card'){
      const front=cleanStudyText($('#st-card-front').value,4000), back=cleanStudyText($('#st-card-back').value,8000); if(!front||!back){$(front?'#st-card-back':'#st-card-front').focus();return;}
      s.cards.push({id:uid(),front,back,due:today(),interval:0,repetitions:0,lastReviewed:null});
    }
    const focus={lesson:'lessons',question:'questions',chapter:'chapters'}[kind]||'';
    save(); renderStudyEditor(b,focus); scheduleRender(); toast('Ajouté à ta fiche ✓'); return;
  }
  const qcard=e.target.closest('[data-study-qcard]');
  if(qcard&&b){
    const s=touchStudy(b), q=s.questions.find(x=>x.id===qcard.dataset.studyQcard); if(!q||!q.answer){toast('Ajoute d’abord une réponse');return;}
    if(!s.cards.some(c=>c.front===q.question&&c.back===q.answer)) s.cards.push({id:uid(),front:q.question,back:q.answer,due:today(),interval:0,repetitions:0,lastReviewed:null});
    save(); renderStudyEditor(b,'questions'); scheduleRender(); toast('Carte mémoire créée ✓'); return;
  }
  const edit=e.target.closest('[data-study-edit]');
  if(edit&&b){
    (async()=>{
      const [kind,id]=edit.dataset.studyEdit.split(':'), s=ensureStudy(b), item=(s[kind]||[]).find(x=>x.id===id); if(!item)return;
      if(kind==='ideas' || kind==='lessons'){
        const text=await uiPrompt({title:'Modifier',value:item.text,multiline:true,okLabel:'Enregistrer'}); if(text===null)return;
        const clean=cleanStudyText(text,4000); if(!clean){toast('Le texte ne peut pas être vide');return;} item.text=clean;
      }else if(kind==='questions'){
        const question=await uiPrompt({title:'Modifier la question',value:item.question,multiline:true,okLabel:'Continuer'}); if(question===null)return;
        const answer=await uiPrompt({title:'Modifier la réponse',value:item.answer,multiline:true,okLabel:'Enregistrer'}); if(answer===null)return;
        item.question=cleanStudyText(question,4000); item.answer=cleanStudyText(answer,8000); if(!item.question){toast('La question ne peut pas être vide');return;}
      }else if(kind==='chapters'){
        const title=await uiPrompt({title:'Titre du chapitre',value:item.title,okLabel:'Continuer'}); if(title===null)return;
        const notes=await uiPrompt({title:'Notes du chapitre',value:item.notes,multiline:true,okLabel:'Enregistrer'}); if(notes===null)return;
        item.title=cleanStudyText(title,500); item.notes=cleanStudyText(notes,12000); if(!item.title&&!item.notes){toast('Ajoute un titre ou des notes');return;}
      }else if(kind==='cards'){
        const front=await uiPrompt({title:'Recto de la carte',value:item.front,multiline:true,okLabel:'Continuer'}); if(front===null)return;
        const back=await uiPrompt({title:'Verso de la carte',value:item.back,multiline:true,okLabel:'Enregistrer'}); if(back===null)return;
        item.front=cleanStudyText(front,4000); item.back=cleanStudyText(back,8000); if(!item.front||!item.back){toast('Les deux côtés sont nécessaires');return;}
      }
      touchStudy(b); save(); renderStudyEditor(b,kind); scheduleRender(); toast('Modification enregistrée ✓');
    })(); return;
  }
  const del=e.target.closest('[data-study-del]');
  if(del&&b){
    const [kind,id]=del.dataset.studyDel.split(':'), s=touchStudy(b), old=(s[kind]||[]).find(x=>x.id===id); if(!old)return;
    s[kind]=s[kind].filter(x=>x.id!==id); save(); renderStudyEditor(b,kind); scheduleRender();
    toast('Élément supprimé',{label:'Annuler',onAction:()=>{s[kind].push(old);touchStudy(b);save();if($('#ov-study').classList.contains('open'))renderStudyEditor(b,kind);scheduleRender();}}); return;
  }
  if(e.target.closest('[data-study-reveal]')){ studySession.revealed=true; renderStudyReview(); return; }
  const grade=e.target.closest('[data-study-grade]');
  if(grade){ const cur=currentStudyCard(); if(!cur)return; gradeStudyCard(cur.card,grade.dataset.studyGrade); touchStudy(cur.book); save(); studySession.reviewed++; studySession.index++; studySession.revealed=false; renderStudyReview(); return; }
  if(e.target.closest('[data-review-more]')){ startStudyReview(studySession.bookId); return; }
  if(e.target.closest('[data-review-editor]')){ const id=studySession.bookId; if(id)openStudy(id); return; }
  if(e.target.closest('[data-review-exit]')){ studySession.bookId?openStudy(studySession.bookId):closeOverlays(); return; }
});
$('#study-body').addEventListener('keydown',e=>{
  if($('#study-head').textContent!=='Révision') return;
  if(!studySession.revealed && (e.key===' ' || e.key==='Enter')){ e.preventDefault(); const btn=$('#study-body [data-study-reveal]'); if(btn)btn.click(); return; }
  if(studySession.revealed && ['1','2','3','4'].includes(e.key)){
    e.preventDefault(); const grade=['again','hard','good','easy'][+e.key-1], btn=$(`#study-body [data-study-grade="${grade}"]`); if(btn)btn.click();
  }
});

/* =============== Fiche détail =============== */
function openDetail(id, opts={}){
  ui.detailId = id;
  const b = state.books.find(x=>x.id===id); if(!b) return;
  $('#detail-head').textContent = TYPE_LABEL[b.type] || 'Détail';
  const meta = [b.year, b.pages ? b.pages+' pages' : null].filter(Boolean).join(' · ');
  const tagsHtml = (b.tags||[]).map(t=>`<button class="tagbtn" data-tag="${esc(t)}">#${esc(t)}</button>`).join(' ');
  const inLists = state.lists.filter(l=>l.bookIds.includes(b.id));
  const otherLists = state.lists.filter(l=>!l.bookIds.includes(b.id));
  const sBooks = b.series ? seriesBooks(b.series) : [];
  const maxVol = sBooks.length ? Math.max(...sBooks.map(x=>x.volume??0)) : null;
  const hasNext = b.series && b.volume!=null && !sBooks.some(x=>x.volume===b.volume+1) && b.volume===maxVol;
  const pct = progressPct(b);
  const readings = (b.readings||[]).slice().sort((a,c)=>c.date.localeCompare(a.date));
  const loanDue = loanDueInfo(b.loan);
  const study = studyCounts(b);

  $('#detail-body').innerHTML = `
    <div class="dcover"><div class="cover${b.cover?' zoomable':''}"${b.cover?' data-zoom="1"':''}>${coverHTML(b)}</div></div>
    <div class="dmain">
      <h3 class="dt" id="detail-title">${esc(fullTitle(b))}</h3>
      <div class="da">${esc(authorsStr(b))}</div>
      ${b.series ? `<div class="dserie">Série : ${esc(b.series)}${b.volume!=null ? ` · tome ${b.volume}` : ''}${(()=>{const t=Math.max(...sBooks.map(x=>x.seriesTotal||0)); return t?`/${t}`:'';})()} — ${sBooks.length} dans ta bibliothèque
        ${sBooks.length>1 ? `<button data-open-series="${esc(b.series)}">voir la série →</button>` : ''}</div>` : ''}
      <div class="dmeta">${esc(meta)}${meta && tagsHtml ? ' · ' : ''}${tagsHtml}</div>
      ${b.synopsis
        ? `<div class="syn collapsed" id="d-syn">${esc(b.synopsis)}</div>${b.synopsis.length>180 ? '<button class="syn-more" id="d-syn-more">voir plus</button>' : ''}`
        : `<button class="syn-more" id="d-syn-fetch">🔎 Chercher le synopsis</button>`}

      <div class="buy-row">
        <a class="btn buy amz" href="${esc(amazonUrl(b,false))}" target="_blank" rel="noopener nofollow sponsored" title="Ouvrir sur Amazon">🛒 Acheter</a>
        <a class="btn buy" href="${esc(amazonUrl(b,true))}" target="_blank" rel="noopener nofollow sponsored" title="Édition Kindle sur Amazon">📱 Lire sur Kindle</a>
        <span class="buy-note" tabindex="0" title="En tant que Partenaire Amazon, ce site perçoit une commission sur les achats remplissant les conditions requises. Aucun surcoût pour toi.">Partenaire Amazon</span>
      </div>

      <div class="seg" id="d-status" role="group" aria-label="Statut">
        ${Object.entries(STATUS_LABEL).map(([k,v]) =>
          `<button data-s="${k}" class="${b.status===k?'on':''}" aria-pressed="${b.status===k}">${v}</button>`).join('')}
      </div>

      ${b.status==='reading' ? `<div class="dblock">
        <label for="d-page">Ma progression</label>
        <div class="prog-row">
          <input type="number" id="d-page" min="0" ${b.pages?`max="${b.pages}"`:''} value="${b.currentPage??''}" placeholder="page" aria-label="Page courante">
          <span class="lbl2">/ ${b.pages||'?'} p.</span>
          <div class="track"><div class="fill" style="width:${pct??0}%"></div></div>
          <b>${pct!==null ? pct+' %' : '—'}</b>
        </div>
      </div>` : ''}

      <div class="rate-row${opts.pulse?' pulse':''}" id="d-rate-row">
        <div class="star-input" id="d-stars" tabindex="0" role="slider" aria-label="Ma note" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${b.rating||0}" aria-valuetext="${b.rating ? b.rating+' étoiles' : 'non noté'}">${starInputHTML(b.rating)}</div>
        ${b.rating ? `<button class="clear-rate" id="d-clear-rate">effacer</button>` : ''}
        <button class="heart ${b.favorite?'on':''}" id="d-fav" title="Favori" aria-label="Favori" aria-pressed="${b.favorite}">♥</button>
      </div>

      <div class="dblock" id="d-friends" hidden></div>

      <div class="dblock">
        <label for="d-review">Ma critique</label>
        <textarea id="d-review" rows="3" placeholder="${opts.pulse ? 'Et alors, verdict ?' : 'Qu\'est-ce que tu en as pensé ?'}">${esc(b.review||'')}</textarea>
      </div>

      <div class="study-entry">
        <div aria-hidden="true" style="font-size:25px">🎓</div>
        <div class="study-copy"><b>Mode étude${study.due?` · ${study.due} à réviser`:''}</b><span>${study.cards||studyHasContent(b.study)?`${study.cards} carte${study.cards>1?'s':''} · maîtrise ${study.mastery}%`:'Résumé, idées clés, leçons et cartes mémoire'}</span></div>
        <button class="btn small primary" id="d-study">${studyHasContent(b.study)?'Ouvrir la fiche':'Créer ma fiche'}</button>
      </div>

      <div class="dblock">
        <label>Ambiances</label>
        <div class="mood-chips" id="d-moods">
          ${MOODS.map(m=>`<button class="mood ${b.moods.includes(m)?'on':''}" data-mood="${esc(m)}" aria-pressed="${b.moods.includes(m)}">${m}</button>`).join('')}
        </div>
      </div>

      <div class="dblock">
        <label>Rythme</label>
        <div class="seg" id="d-pace" role="group" aria-label="Rythme de lecture">
          ${Object.entries(PACE_LABEL).map(([k,v])=>`<button data-pace="${k}" class="${b.pace===k?'on':''}" aria-pressed="${b.pace===k}">${v}</button>`).join('')}
        </div>
      </div>

      <div class="dblock">
        <label>Passages${(b.quotes||[]).length ? ` (${b.quotes.length})` : ''}</label>
        <div id="d-quotes">${(b.quotes||[]).map(q=>`
          <div class="quote-item">
            <div class="qtxt">« ${esc(q.text)} »</div>
            ${q.page!=null ? `<div class="qpage">page ${q.page}</div>` : ''}
            <button class="qdel" data-qdel="${esc(q.id)}" title="Supprimer" aria-label="Supprimer ce passage">✕</button>
          </div>`).join('')}</div>
        <div class="add-quote">
          <textarea id="d-quote-text" rows="2" placeholder="Un passage qui t'a marqué·e…"></textarea>
          <div class="row">
            <input type="number" id="d-quote-page" min="0" placeholder="page" aria-label="Page">
            <button class="btn small" id="d-quote-add">＋ Ajouter le passage</button>
          </div>
        </div>
      </div>

      <div class="dblock">
        <label>Prêt</label>
        <div class="loan-row" id="d-loan">
          ${b.loan
            ? `<span class="lnw">📤 Prêté à ${esc(b.loan.to)}</span><span style="color:var(--faint)">depuis le ${fmtDate(b.loan.since)}</span>${loanDue?`<span class="loan-due ${loanDue.level}">${esc(loanDue.text)}</span>`:'<span class="loan-due">sans date de retour</span>'}<button class="btn small" id="d-loan-date">📅 Date</button><button class="btn small" id="d-loan-back">Rendu ✓</button>`
            : `<button class="btn small" id="d-loan-out">📤 Prêter à…</button>`}
        </div>
      </div>

      <div class="dblock">
        <label>Lectures${readings.length>1 ? ` (${readings.length})` : ''}</label>
        <div class="readings">${readings.map(r =>
          `<div class="reading-row">📅 ${fmtDate(r.date)}
            <span class="rstars" data-rid="${esc(r.id)}" title="Note de cette lecture">${starInputHTML(r.rating, 'rst')}</span>
            <button class="del" data-rid="${esc(r.id)}" title="Supprimer cette date" aria-label="Supprimer cette date">✕</button>
          </div>`).join('') || '<span style="font-size:13px;color:var(--faint)">Aucune date enregistrée</span>'}</div>
        <div class="add-reading">
          <input type="date" id="d-newdate" value="${today()}" aria-label="Date de lecture">
          <button class="btn small" id="d-add-reading">＋ ${readings.length ? 'Relecture' : 'Ajouter'}</button>
        </div>
      </div>

      ${state.lists.length ? `<div class="dblock">
        <label>Listes</label>
        <div class="chips-line" style="margin-bottom:8px">
          ${inLists.map(l=>`<span class="pill">${esc(l.name)} <button data-unlist="${esc(l.id)}" aria-label="Retirer de ${esc(l.name)}">✕</button></span>`).join('')}
        </div>
        ${otherLists.length ? `<div class="list-add">
          <select id="d-list-sel" aria-label="Choisir une liste">${otherLists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>
          <button class="btn small" id="d-list-add">Ajouter</button>
        </div>` : ''}
      </div>` : ''}

      <div class="detail-footer">
        <button class="btn small" id="d-edit">✎ Modifier</button>
        <button class="btn small" id="d-card" title="Générer une image à partager">🖼 Carte</button>
        ${hasNext ? `<button class="btn small" id="d-next-tome">＋ Tome ${b.volume+1}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn small danger" id="d-delete">Supprimer</button>
      </div>
    </div>`;
  openOverlay('#ov-detail');
  loadDetailFriends(b);
}
// « Chez tes amis » : lectures croisées sur la fiche — silencieux si déconnecté,
// hors-ligne, ou si aucun ami ne partage ce livre (la fiche reste 100 % locale sinon).
// GARDE VIE PRIVÉE : la clé du livre ne part au serveur QUE si ce livre appartient au
// sous-ensemble partageable (même prédicat que shareableBooks) ET que le partage est actif —
// jamais pour la wishlist, jamais en mode « rien » : le serveur n'apprend rien qu'il ne
// connaisse déjà par la synchro. Cache 10 min : les interactions de la fiche ne re-fetchent pas.
const _bookFriendsCache = new Map();
async function loadDetailFriends(b){
  if(!social.me || social.me.shareMode==='none') return;
  const lastRead = (b.readings||[]).map(r=>r.date).sort().pop() || '';
  if(!(b.status==='read' || b.rating || lastRead)) return; // hors du périmètre partageable → 100 % local
  const key = shelfKey(b);
  try{
    const hit = _bookFriendsCache.get(key);
    const d = (hit && Date.now()-hit.at < 10*60*1000) ? hit.d
      : await api('/api/book-friends?k='+encodeURIComponent(key));
    _bookFriendsCache.set(key, {at: (hit && Date.now()-hit.at < 10*60*1000) ? hit.at : Date.now(), d});
    if(ui.detailId!==b.id || !d.friends || !d.friends.length) return;
    const box = $('#d-friends'); if(!box) return; // la fiche a pu être fermée/re-rendue entre-temps
    box.hidden = false;
    box.innerHTML = `<label>Chez tes amis</label>` + d.friends.map(f=>
      `<div class="dfriend"><span class="avatar sm">${esc(initials(f.displayName))}</span><b>${esc(f.displayName)}</b>${
        f.rating ? `<span class="stars">${starsTxt(f.rating)}</span>` : `<span class="df-none">pas encore noté</span>`}</div>`).join('');
  }catch(_){ /* silencieux : la fiche reste purement locale */ }
}

// Toutes les interactions de la fiche : UN SEUL écouteur délégué, le livre est résolu via ui.detailId.
// La vue de fond étant cachée, on la rafraîchit en différé (scheduleRender) — la fiche se redessine via openDetail.
$('#detail-body').addEventListener('click', e => {
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;

  if(e.target.closest('[data-zoom]') && b.cover){ openCover(b.cover); return; }
  const sbtn = e.target.closest('#d-status button[data-s]');
  if(sbtn){
    const s = sbtn.dataset.s;
    const wasRead = b.status==='read';
    b.status = s;
    if(s==='read' && !wasRead){ markRead(b); save(); openDetail(b.id, {pulse:true}); scheduleRender(); }
    else { save(); openDetail(b.id); scheduleRender(); }
    return;
  }
  const st = e.target.closest('#d-stars .st');
  if(st){
    const n = +st.dataset.n;
    b.rating = halfFromClick(st, e.clientX) ? n-0.5 : n;
    save(); openDetail(b.id); scheduleRender(); return;
  }
  const rst = e.target.closest('.rstars .rst');
  if(rst){
    const rid = rst.closest('.rstars').dataset.rid;
    const r = (b.readings||[]).find(x=>x.id===rid); if(!r) return;
    const n = +rst.dataset.n;
    r.rating = halfFromClick(rst, e.clientX) ? n-0.5 : n;
    if(!b.rating) b.rating = r.rating;
    save(); openDetail(b.id); scheduleRender(); return;
  }
  if(e.target.closest('#d-clear-rate')){ b.rating = null; save(); openDetail(b.id); scheduleRender(); return; }
  if(e.target.closest('#d-fav')){ b.favorite = !b.favorite; save(); openDetail(b.id); scheduleRender(); return; }
  const md = e.target.closest('[data-mood]');
  if(md){
    const m = md.dataset.mood;
    b.moods = b.moods||[];
    b.moods.includes(m) ? b.moods = b.moods.filter(x=>x!==m) : b.moods.push(m);
    md.classList.toggle('on'); md.setAttribute('aria-pressed', b.moods.includes(m));
    save(); scheduleRender(); return;
  }
  const pc = e.target.closest('[data-pace]');
  if(pc){
    const p = pc.dataset.pace;
    b.pace = b.pace===p ? null : p;
    save(); openDetail(b.id); scheduleRender(); return;
  }
  if(e.target.closest('#d-quote-add')){
    const txt = $('#d-quote-text').value.trim();
    if(!txt){ $('#d-quote-text').focus(); return; }
    b.quotes = b.quotes||[];
    b.quotes.push({id:uid(), text:txt.slice(0,2000), page:numIn($('#d-quote-page').value, 0, 1000000)});
    save(); openDetail(b.id); scheduleRender(); toast('Passage ajouté ✓'); return;
  }
  const qd = e.target.closest('[data-qdel]');
  if(qd){
    const q = (b.quotes||[]).find(x=>x.id===qd.dataset.qdel);
    b.quotes = (b.quotes||[]).filter(x=>x.id!==qd.dataset.qdel);
    save(); openDetail(b.id); scheduleRender();
    if(q) toast('Passage supprimé', {label:'Annuler', onAction:()=>{ b.quotes.push(q); save(); if(ui.detailId===b.id) openDetail(b.id); scheduleRender(); }});
    return;
  }
  if(e.target.closest('#d-loan-out')){
    (async()=>{
      const to = await uiPrompt({ title:'Prêter ce livre', message:'À qui prêtes-tu ce livre ?', placeholder:'Nom de la personne', okLabel:'Continuer' });
      if(!to || !to.trim()) return;
      const due = await uiPrompt({ title:'Date de retour', message:'Choisis une échéance, ou laisse le champ vide si vous n’en avez pas fixé.', value:isoAfterDays(today(),30), type:'date', okLabel:'Enregistrer le prêt' });
      if(due===null) return;
      if(due && (!isValidDate(due) || due<today())){ toast('Choisis une date future'); return; }
      b.loan = {to:to.trim().slice(0,120), since:today(), due:due||null}; save(); openDetail(b.id); scheduleRender();
    })();
    return;
  }
  if(e.target.closest('#d-loan-date')){
    (async()=>{
      const due = await uiPrompt({ title:'Date de retour', message:'Laisse le champ vide pour retirer l’échéance.', value:b.loan.due||isoAfterDays(today(),30), type:'date', okLabel:'Enregistrer' });
      if(due===null) return;
      if(due && (!isValidDate(due) || due<b.loan.since)){ toast('La date doit être postérieure au début du prêt'); return; }
      b.loan.due=due||null; save(); openDetail(b.id); scheduleRender(); toast('Date de retour mise à jour ✓');
    })();
    return;
  }
  if(e.target.closest('#d-loan-back')){ const loan=b.loan; b.loan=null; save(); openDetail(b.id); scheduleRender(); toast('Retour enregistré ✓', {label:'Annuler', onAction:()=>{b.loan=loan; save(); if(ui.detailId===b.id) openDetail(b.id); scheduleRender();}}); return; }
  if(e.target.closest('#d-add-reading')){
    const d = $('#d-newdate').value;
    if(!isValidDate(d)) return;
    b.readings = b.readings||[];
    b.readings.push({id:uid(), date:d, rating:null});
    if(b.status!=='read') b.status = 'read';
    save(); openDetail(b.id); scheduleRender(); return;
  }
  const del = e.target.closest('.del[data-rid]');
  if(del){
    const r = (b.readings||[]).find(x=>x.id===del.dataset.rid);
    b.readings = (b.readings||[]).filter(x=>x.id!==del.dataset.rid);
    save(); openDetail(b.id); scheduleRender();
    if(r) toast('Date supprimée', {label:'Annuler', onAction:()=>{ b.readings.push(r); save(); if(ui.detailId===b.id) openDetail(b.id); scheduleRender(); }});
    return;
  }
  const unl = e.target.closest('[data-unlist]');
  if(unl){
    const l = state.lists.find(x=>x.id===unl.dataset.unlist);
    if(l){ l.bookIds = l.bookIds.filter(x=>x!==b.id); save(); openDetail(b.id); scheduleRender(); }
    return;
  }
  if(e.target.closest('#d-list-add')){
    const sel = $('#d-list-sel'); if(!sel) return;
    const l = state.lists.find(x=>x.id===sel.value);
    if(l && !l.bookIds.includes(b.id)){ l.bookIds.push(b.id); save(); openDetail(b.id); scheduleRender(); toast(`Ajouté à « ${l.name} » ✓`); }
    return;
  }
  const os = e.target.closest('[data-open-series]');
  if(os){ closeOverlays(); openSeries(os.dataset.openSeries); return; }
  const sm = e.target.closest('#d-syn-more');
  if(sm){
    const s = $('#d-syn');
    if(s){ const col = s.classList.toggle('collapsed'); sm.textContent = col ? 'voir plus' : 'réduire'; }
    return;
  }
  if(e.target.closest('#d-syn-fetch')){ fetchSynopsis(b); return; }
  const tg = e.target.closest('.tagbtn');
  if(tg){
    const tag = tg.dataset.tag;
    closeOverlays();
    ui.status = 'all'; ui.types.clear(); ui.q = ''; ui.tag = tag;
    $('#lib-q').value = '';
    $$('#status-chips .chip').forEach(x=>{ const on=x.dataset.status==='all'; x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
    $$('#type-chips .chip[data-type]').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
    selectView('library');
    $('#lib-tag').value = tag;
    persistUI(); renderLibrary();
    return;
  }
  if(e.target.closest('#d-card')){ shareCard(b); return; }
  if(e.target.closest('#d-study')){ openStudy(b.id); return; }
  if(e.target.closest('#d-next-tome')){ addNextTome(b.series, {openDetailAfter:true}); return; }
  if(e.target.closest('#d-edit')){ closeOverlays(); openEdit(b.id); return; }
  if(e.target.closest('#d-delete')){
    const idx = state.books.indexOf(b);
    const memberOf = state.lists.filter(l=>l.bookIds.includes(b.id)).map(l=>l.id);
    state.books = state.books.filter(x=>x.id!==b.id);
    state.lists.forEach(l=> l.bookIds = l.bookIds.filter(x=>x!==b.id));
    save(); closeOverlays(); render();
    toast('Supprimé', {label:'Annuler', onAction:()=>{
      state.books.splice(Math.min(idx, state.books.length), 0, b);
      memberOf.forEach(id=>{ const l = state.lists.find(x=>x.id===id); if(l && !l.bookIds.includes(b.id)) l.bookIds.push(b.id); });
      save(); render();
    }});
    return;
  }
});
$('#detail-body').addEventListener('change', e => {
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;
  if(e.target.id==='d-review'){
    b.review = e.target.value.trim();
    save(); scheduleRender(); toast('Critique enregistrée ✓');
  }else if(e.target.id==='d-page'){
    const p = numOrNull(e.target.value);
    if(p!==null) setProgress(b, p);
  }
});
$('#detail-body').addEventListener('keydown', e => {
  if(!e.target.closest || !e.target.closest('#d-stars')) return;
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;
  if(e.key==='ArrowRight'){ e.preventDefault(); b.rating = Math.min(5, (b.rating||0)+0.5); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); const v = (b.rating||0)-0.5; b.rating = v<0.5 ? null : v; }
  else return;
  save(); openDetail(b.id); scheduleRender();
  $('#d-stars').focus();
});

/* =============== Tome suivant =============== */
function addNextTome(seriesName, opts={}){
  const sBooks = seriesBooks(seriesName);
  if(!sBooks.length) return;
  const withVol = sBooks.filter(b=>b.volume!=null);
  const maxVol = withVol.length ? Math.max(...withVol.map(b=>b.volume)) : 0;
  const base = withVol.find(b=>b.volume===maxVol) || sBooks[0];
  const next = maxVol + 1;
  if(base.seriesTotal && next > base.seriesTotal){
    toast(`La série est complète (${base.seriesTotal} tomes) 🎉`);
    return;
  }
  const nb = newBook({
    title: base.series, authors:[...(base.authors||[])], type: base.type,
    series: base.series, volume: next, seriesTotal: base.seriesTotal??null, status:'wishlist',
  });
  state.books.unshift(nb);
  save(); scheduleRender();
  toast(`Tome ${next} ajouté à la pile à lire ✓`);
  if(opts.openDetailAfter){ openDetail(nb.id); }
  else if(ui.listMode==='series' && $('#ov-list').classList.contains('open')) openSeries(seriesName);
  // Couverture et pages récupérées en arrière-plan
  (async ()=>{
    try{
      let results = [];
      try{ results = await searchGoogleBooks(`${base.series} ${next}`); }catch(_){ }
      if(!results.some(r=>r.cover)){
        try{ results = results.concat(await searchOpenLibrary(`${base.series} ${next}`)); }catch(_){ }
      }
      const hit = results.find(r=>r.cover);
      if(hit && state.books.includes(nb) && !nb.cover){
        nb.cover = hit.cover;
        if(nb.pages==null && hit.pages) nb.pages = hit.pages;
        if(nb.year==null && hit.year) nb.year = hit.year;
        save();
        if(ui.view==='library') renderLibrary();
        if(ui.detailId===nb.id && $('#ov-detail').classList.contains('open')) openDetail(nb.id);
        else if(ui.listMode==='series' && ui.seriesName.trim().toLowerCase()===seriesName.trim().toLowerCase() && $('#ov-list').classList.contains('open')) openSeries(seriesName);
      }
    }catch(_){ }
  })();
}

/* =============== Listes & panneau série =============== */
$('#btn-new-list').addEventListener('click', async ()=>{
  const name = await uiPrompt({ title:'Nouvelle liste', placeholder:'ex : Pépites SF, À offrir, Top 2026', okLabel:'Créer' });
  if(!name || !name.trim()) return;
  state.lists.unshift({id:uid(), name:name.trim().slice(0,150), desc:'', bookIds:[], createdAt:new Date().toISOString()});
  save(); renderLists(); toast('Liste créée ✓');
});
function renderLists(){
  const grid = $('#lists-grid'), emptyBox = $('#lists-empty');
  if(!state.lists.length){
    grid.innerHTML = '';
    emptyBox.innerHTML = `<div class="empty"><div class="big">🗂️</div><h3>Aucune liste</h3>
      <p>Crée des listes thématiques — « Pépites SF », « Mangas à finir », « À offrir à Noël »… — puis ajoute des titres depuis leur fiche.</p></div>`;
    return;
  }
  emptyBox.innerHTML = '';
  grid.innerHTML = state.lists.map(l => {
    const books = l.bookIds.map(id=>state.books.find(b=>b.id===id)).filter(Boolean);
    return `<div class="list-card" data-id="${esc(l.id)}" role="button" tabindex="0" aria-label="Liste ${esc(l.name)}, ${books.length} titres">
      <div class="fan">${books.slice(0,4).map(b=>`<div class="mini">${coverHTML(b,true)}</div>`).join('') || '<div class="empty-fan">＋</div>'}</div>
      <h4>${esc(l.name)}</h4>
      ${l.desc ? `<p class="list-desc">${esc(l.desc)}</p>` : ''}
      <div class="lc-count">${books.length} titre${books.length>1?'s':''}</div>
    </div>`;
  }).join('');
}
$('#lists-grid').addEventListener('click', e => {
  const card = e.target.closest('.list-card'); if(card) openList(card.dataset.id);
});
function openList(id){
  ui.listId = id; ui.listMode = 'list';
  const l = state.lists.find(x=>x.id===id); if(!l) return;
  const books = l.bookIds.map(bid=>state.books.find(b=>b.id===bid)).filter(Boolean);
  $('#list-head').textContent = l.name;
  $('#list-body').innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:4px; flex-wrap:wrap">
      <button class="btn small" id="l-rename">✎ Renommer</button>
      <button class="btn small" id="l-desc">📝 Décrire</button>
      <span style="flex:1"></span>
      <button class="btn small danger" id="l-delete">Supprimer la liste</button>
    </div>
    ${l.desc ? `<p class="list-desc">${esc(l.desc)}</p>` : ''}
    ${books.length ? `<div class="ld-grid">${books.map((b,i)=>`
      <div class="ld-item" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(fullTitle(b))}, position ${i+1}">
        <span class="idx">${i+1}</span>
        <div class="cover">${coverHTML(b)}</div>
        <button class="rm" data-rm="${esc(b.id)}" title="Retirer" aria-label="Retirer de la liste">✕</button>
        <span class="mv">
          <button data-mv="-1" data-bid="${esc(b.id)}" title="Avancer" aria-label="Avancer dans la liste">◂</button>
          <button data-mv="1" data-bid="${esc(b.id)}" title="Reculer" aria-label="Reculer dans la liste">▸</button>
        </span>
      </div>`).join('')}</div>`
    : `<p style="color:var(--muted); font-size:14px; padding:20px 0; text-align:center">Liste vide — ouvre la fiche d'un titre et utilise « Listes › Ajouter ».</p>`}`;
  openOverlay('#ov-list');
}
function openSeries(name){
  ui.listMode = 'series'; ui.seriesName = name;
  const books = seriesBooks(name).sort((a,b)=>(a.volume??1e9)-(b.volume??1e9));
  if(!books.length) return;
  const total = Math.max(...books.map(b=>b.seriesTotal||0)) || null;
  const read = readCount(books);
  const withVol = books.filter(b=>b.volume!=null);
  const maxVol = withVol.length ? Math.max(...withVol.map(b=>b.volume)) : 0;
  const complete = total && maxVol >= total;
  const rec = state.series[name.trim().toLowerCase()] || {rating:null, review:'', favorite:false, moods:[]};
  $('#list-head').textContent = `${name} — ${read}/${total||books.length} lus`;
  $('#list-body').innerHTML = `
    <div class="dblock" style="margin-bottom:16px">
      <label>Ma note de la série</label>
      <div class="rate-row" style="margin-bottom:10px">
        <div class="star-input" id="s-stars" tabindex="0" role="slider" aria-label="Note de la série" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${rec.rating||0}">${starInputHTML(rec.rating||0)}</div>
        ${rec.rating ? `<button class="clear-rate" id="s-clear">effacer</button>` : ''}
        <button class="heart ${rec.favorite?'on':''}" id="s-fav" title="Série favorite" aria-pressed="${rec.favorite}">♥</button>
      </div>
      <textarea id="s-review" rows="2" placeholder="Ton avis sur la série dans son ensemble…">${esc(rec.review||'')}</textarea>
    </div>
    ${books.map(b=>`
      <div class="tome-row" data-id="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(fullTitle(b))}, ${STATUS_LABEL[b.status]}">
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="ti"><b>${b.volume!=null ? 'T.'+b.volume : '—'}</b>${b.title && b.title.toLowerCase()!==name.toLowerCase() ? ' · '+esc(b.title) : ''}</div>
        ${b.rating ? `<span class="stars" style="font-size:12px">${starsTxt(b.rating)}</span>` : ''}
        <span class="st-tag ${esc(b.status)}">${STATUS_LABEL[b.status]}</span>
      </div>`).join('')}
    <div style="display:flex; margin-top:12px">
      ${!complete ? `<button class="btn small" id="s-next">＋ Tome ${maxVol+1}</button>` : `<span style="font-size:13px;color:var(--green);font-weight:600">Série complète 🎉</span>`}
      <span style="flex:1"></span>
    </div>`;
  openOverlay('#ov-list');
}
function seriesRec(name){
  const k = name.trim().toLowerCase();
  return state.series[k] || (state.series[k] = {rating:null, review:'', favorite:false, moods:[]});
}
function pruneSeriesRec(name){
  const k = name.trim().toLowerCase(); const r = state.series[k];
  if(r && r.rating==null && !r.review && !r.favorite && !(r.moods||[]).length) delete state.series[k];
}
// Un seul écouteur délégué pour le panneau liste/série, résolu via ui.listId / ui.seriesName.
$('#list-body').addEventListener('click', e => {
  if(ui.listMode==='series'){
    const st = e.target.closest('#s-stars .st');
    if(st){ const n=+st.dataset.n; seriesRec(ui.seriesName).rating = halfFromClick(st, e.clientX) ? n-0.5 : n; save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-clear')){ seriesRec(ui.seriesName).rating = null; pruneSeriesRec(ui.seriesName); save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-fav')){ const r=seriesRec(ui.seriesName); r.favorite=!r.favorite; pruneSeriesRec(ui.seriesName); save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-next')){ addNextTome(ui.seriesName); return; }
    const row = e.target.closest('.tome-row');
    if(row){ closeOverlays(); openDetail(row.dataset.id); }
    return;
  }
  if(ui.listMode==='recap'){
    if(e.target.closest('#recap-share')) shareYearCard(ui.recapYear);
    return;
  }
  const l = state.lists.find(x=>x.id===ui.listId); if(!l) return;
  if(e.target.closest('#l-rename')){
    (async()=>{
      const name = await uiPrompt({ title:'Renommer la liste', value:l.name, okLabel:'Renommer' });
      if(name && name.trim()){ l.name = name.trim().slice(0,150); save(); openList(l.id); renderLists(); }
    })();
    return;
  }
  if(e.target.closest('#l-desc')){
    (async()=>{
      const d = await uiPrompt({ title:'Description de la liste', value:l.desc||'', placeholder:'À quoi sert cette liste ?', okLabel:'Enregistrer' });
      if(d!==null){ l.desc = d.trim().slice(0,500); save(); openList(l.id); renderLists(); }
    })();
    return;
  }
  const mv = e.target.closest('[data-mv]');
  if(mv){
    const i = l.bookIds.indexOf(mv.dataset.bid);
    const j = i + (+mv.dataset.mv);
    if(i>-1 && j>=0 && j<l.bookIds.length){
      [l.bookIds[i], l.bookIds[j]] = [l.bookIds[j], l.bookIds[i]];
      save(); openList(l.id); renderLists();
    }
    return;
  }
  if(e.target.closest('#l-delete')){
    const idx = state.lists.indexOf(l);
    state.lists = state.lists.filter(x=>x.id!==l.id);
    save(); closeOverlays(); renderLists();
    toast('Liste supprimée', {label:'Annuler', onAction:()=>{ state.lists.splice(Math.min(idx, state.lists.length), 0, l); save(); renderLists(); }});
    return;
  }
  const rm = e.target.closest('[data-rm]');
  if(rm){ l.bookIds = l.bookIds.filter(x=>x!==rm.dataset.rm); save(); openList(l.id); renderLists(); return; }
  const item = e.target.closest('.ld-item');
  if(item){ closeOverlays(); openDetail(item.dataset.id); }
});
// critique de série : sauvegarde au blur (comme la fiche), sans ré-ouvrir à chaque frappe
$('#list-body').addEventListener('change', e => {
  if(ui.listMode==='series' && e.target.id==='s-review'){
    seriesRec(ui.seriesName).review = e.target.value.trim();
    pruneSeriesRec(ui.seriesName); save(); renderLibrary();
    toast('Critique de série enregistrée ✓');
  }
});

/* =============== Stats =============== */
function activityByDay(){
  if(_cacheActivity) return _cacheActivity;
  const map = {};
  for(const e of allReadings()) map[e.date] = (map[e.date]||0)+1;
  for(const b of state.books) for(const p of (b.progressLog||[])) map[p.date] = (map[p.date]||0)+1;
  return (_cacheActivity = map);
}
// Pill 🔥 du header : rend la série de jours visible (elle existait, cachée dans Stats).
function updateStreakPill(){
  const el = $('#btn-streak'); if(!el) return;
  const {cur} = streaks();
  if(cur >= 2){
    el.hidden = false;
    $('#streak-n').textContent = cur;
    const t = `${cur} jours de lecture d'affilée — continue !`;
    el.title = t; el.setAttribute('aria-label', t);
  } else el.hidden = true;
}
function streaks(){
  const days = Object.keys(activityByDay()).sort();
  if(!days.length) return {cur:0, max:0};
  let max = 1, run = 1;
  for(let i=1;i<days.length;i++){
    const prev = new Date(days[i-1]+'T12:00:00'), curd = new Date(days[i]+'T12:00:00');
    if(Math.round((curd-prev)/864e5) === 1) run++; else run = 1;
    if(run>max) max = run;
  }
  const set = new Set(days);
  let cur = 0;
  const d = new Date();
  if(!set.has(today())) d.setDate(d.getDate()-1);
  while(set.has(dateKey(d))){ cur++; d.setDate(d.getDate()-1); }
  return {cur, max};
}
function renderStats(){
  const read = state.books.filter(b=>b.status==='read');
  const readings = allReadings();
  const yr = new Date().getFullYear();
  const rated = state.books.filter(b=>b.rating);
  const avg = rated.length ? (rated.reduce((s,b)=>s+b.rating,0)/rated.length) : 0;
  const pages = read.reduce((s,b)=>s+(b.pages||0),0);
  const sk = streaks();

  $('#stat-tiles').innerHTML = `
    <div class="tile"><b>${read.length}</b><span>lus au total</span></div>
    <div class="tile"><b>${pages ? pages.toLocaleString('fr-FR') : '—'}</b><span>pages lues</span></div>
    <div class="tile"><b>${avg ? avg.toFixed(1).replace('.',',')+' ★' : '—'}</b><span>note moyenne</span></div>
    <div class="tile"><b>${state.books.filter(b=>b.status==='wishlist').length}</b><span>dans la pile à lire</span></div>
    <div class="tile"><b>${sk.cur} j${sk.cur>=3?' 🔥':''}</b><span>série en cours (record : ${sk.max} j)</span></div>`;

  // Objectif annuel
  const gi = goalInfo(yr);
  const recapBtn = `<button class="btn small" id="recap-btn" style="margin-top:12px">🎉 Rétro ${yr}</button>`;
  $('#goal-panel').innerHTML = (gi ? `
    <h4>Objectif ${yr}</h4>
    <div class="goal-big">
      <span class="gnum">${gi.done}<small> / ${gi.goal} lectures</small></span>
      <div class="gbar"><div class="fill" style="width:${Math.min(100, gi.done/gi.goal*100)}%"></div></div>
      ${paceHTML(gi)}
    </div>` : `
    <h4>Objectif ${yr}</h4>
    <p style="font-size:14px; color:var(--muted)">🎯 Aucun objectif défini — clique ici pour te lancer un défi de lectures pour ${yr}.</p>`) + recapBtn;
  $('#goal-panel').setAttribute('aria-label', `Objectif ${yr} — cliquer pour modifier`);

  // Heatmap
  const yearsInData = [...new Set([...Object.keys(activityByDay()).map(d=>+d.slice(0,4)), yr])].sort((a,b)=>b-a).slice(0,5);
  if(!yearsInData.includes(ui.heatYear)) ui.heatYear = yr;
  $('#heat-years').innerHTML = yearsInData.map(y=>
    `<button class="chip ${y===ui.heatYear?'active':''}" data-hy="${y}" aria-pressed="${y===ui.heatYear}">${y}</button>`).join('');
  renderHeat();

  // Histogramme des notes
  const histo = Array(10).fill(0);
  rated.forEach(b=>{ histo[Math.round(b.rating*2)-1]++; });
  const hmax = Math.max(...histo, 1);
  $('#histo').innerHTML = histo.map((n,i)=>{
    const v = (i+1)/2;
    return `<div class="col" title="${v} ★ : ${n}">
      <div class="bar ${n?'on':''}" style="height:${Math.max(n/hmax*100,3)}%"></div>
      <span class="rl">${i%2 ? v+'★' : '½'}</span>
    </div>`;
  }).join('');

  // Par type (bascule titres ↔ pages)
  const byTypeCount = {livre:0, bd:0, manga:0}, byTypePages = {livre:0, bd:0, manga:0};
  read.forEach(b=>{ if(byTypeCount[b.type]!=null){ byTypeCount[b.type]++; byTypePages[b.type]+=b.pages||0; } });
  const totalPages = byTypePages.livre + byTypePages.bd + byTypePages.manga;
  const metric = (ui.typeMetric==='pages' && totalPages>0) ? 'pages' : 'count';
  const byType = metric==='pages' ? byTypePages : byTypeCount;
  const tmax = Math.max(...Object.values(byType), 1);
  const tcolor = {livre:'var(--blue)', bd:'var(--orange)', manga:'var(--pink)'};
  $('#type-metric-count').classList.toggle('on', metric==='count');
  $('#type-metric-pages').classList.toggle('on', metric==='pages');
  $('#type-bars').innerHTML = Object.entries(byType).map(([t,n])=>`
    <div class="hbar"><span class="lbl">${TYPE_LABEL[t]}${t==='livre'?'s':''}</span>
    <div class="track"><div class="fill" style="width:${n/tmax*100}%; background:${tcolor[t]}"></div></div>
    <span class="val">${metric==='pages'?n.toLocaleString('fr-FR'):n}</span></div>`).join('');

  // Par année
  const byYear = {};
  readings.forEach(e=>{ const y = e.date.slice(0,4); byYear[y] = (byYear[y]||0)+1; });
  const years = Object.keys(byYear).sort().slice(-8);
  const ymax = Math.max(...years.map(y=>byYear[y]), 1);
  $('#year-bars').innerHTML = years.map(y=>`
    <div class="hbar"><span class="lbl">${y}</span>
    <div class="track"><div class="fill" style="width:${byYear[y]/ymax*100}%"></div></div>
    <span class="val">${byYear[y]}</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Aucune lecture datée pour l\'instant.</p>';

  // Note moyenne par année (livres distincts notés, lus cette année-là)
  const yearRate = {};
  years.forEach(y=>{
    const books = [...new Set(readings.filter(e=>e.date.startsWith(y)).map(e=>e.b))].filter(b=>b.rating);
    if(books.length) yearRate[y] = books.reduce((s,b)=>s+b.rating,0)/books.length;
  });
  const yrKeys = Object.keys(yearRate).sort();
  $('#yearrate-bars').innerHTML = yrKeys.map(y=>`
    <div class="hbar"><span class="lbl">${y}</span>
    <div class="track"><div class="fill" style="width:${yearRate[y]/5*100}%; background:var(--star)"></div></div>
    <span class="val">${yearRate[y].toFixed(1).replace('.',',')}★</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Note tes lectures datées pour voir cette courbe.</p>';

  // Top auteurs
  const byAuthor = {};
  read.forEach(b=>(b.authors||[]).forEach(a=>{ byAuthor[a]=(byAuthor[a]||0)+1; }));
  const top = Object.entries(byAuthor).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const amax = top.length ? top[0][1] : 1;
  $('#author-bars').innerHTML = top.map(([a,n])=>`
    <div class="hbar"><span class="lbl" title="${esc(a)}">${esc(a)}</span>
    <div class="track"><div class="fill" style="width:${n/amax*100}%; background:var(--blue)"></div></div>
    <span class="val">${n}</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Marque des titres comme lus pour voir tes auteurs favoris.</p>';

  // Rythme mois par mois (année de la heatmap)
  const my = ui.heatYear;
  const bm = Array(12).fill(0);
  readings.filter(e=>e.date.startsWith(String(my))).forEach(e=>bm[+e.date.slice(5,7)-1]++);
  const bmmax = Math.max(...bm, 1);
  $('#month-bars').innerHTML = bm.map((n,i)=>`
    <div class="col" title="${MONTHS_FR[i]} : ${n}"><div class="bar ${n?'on month':''}" style="height:${Math.max(n/bmmax*100,3)}%"></div><span class="rl">${MONTHS_MINI[i]}</span></div>`).join('');

  // Genres / tags les plus lus
  const byTag = {};
  read.forEach(b=>(b.tags||[]).forEach(t=>{ if(t!=='exemple') byTag[t]=(byTag[t]||0)+1; }));
  const tt = Object.entries(byTag).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const txm = tt.length ? tt[0][1] : 1;
  $('#tag-bars').innerHTML = tt.map(([t,n])=>`
    <div class="hbar"><span class="lbl" title="${esc(t)}">${esc(t)}</span>
    <div class="track"><div class="fill" style="width:${n/txm*100}%; background:var(--pink)"></div></div>
    <span class="val">${n}</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Ajoute des tags à tes livres pour voir tes genres favoris.</p>';

  // Séries les plus lues
  const sr = {};
  read.forEach(b=>{ if(b.series){ const k=seriesKey(b); (sr[k]=sr[k]||{name:b.series, n:0}).n++; } });
  const ts = Object.values(sr).sort((a,b)=>b.n-a.n).slice(0,6);
  const sm = ts.length ? ts[0].n : 1;
  $('#series-bars').innerHTML = ts.map(s=>`
    <div class="hbar"><span class="lbl" title="${esc(s.name)}">${esc(s.name)}</span>
    <div class="track"><div class="fill" style="width:${s.n/sm*100}%; background:var(--orange)"></div></div>
    <span class="val">${s.n}</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Renseigne le champ Série pour suivre tes sagas.</p>';

  // Infos d'export
  const m = state.meta || {};
  $('#export-info').textContent = m.lastExport
    ? `Dernier export : ${fmtDate(m.lastExport)} · ${m.changes||0} modification${(m.changes||0)>1?'s':''} depuis`
    : 'Aucun export pour l\'instant.';
  $('#btn-restore').hidden = !hasRecoverable();
}
function renderHeat(){
  const y = ui.heatYear;
  const act = activityByDay();
  const first = new Date(y, 0, 1);
  const offset = (first.getDay()+6)%7; // lundi = 0
  const cells = [];
  for(let i=0;i<offset;i++) cells.push('<i style="visibility:hidden"></i>');
  const d = new Date(y,0,1);
  while(d.getFullYear()===y){
    const key = dateKey(d);
    const n = act[key]||0;
    const lvl = n===0 ? '' : n===1 ? 'l1' : n===2 ? 'l2' : 'l3';
    const label = d.toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
    cells.push(`<i class="${lvl}" title="${label} — ${n} activité${n>1?'s':''}"></i>`);
    d.setDate(d.getDate()+1);
  }
  $('#heat').innerHTML = cells.join('');
}
$('#heat-years').addEventListener('click', e => {
  const c = e.target.closest('[data-hy]'); if(!c) return;
  ui.heatYear = +c.dataset.hy;
  renderStats();
});
$('#type-metric').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  ui.typeMetric = b.id==='type-metric-pages' ? 'pages' : 'count';
  persistUI(); renderStats();
});
$('#goal-panel').addEventListener('click', e=>{
  if(e.target.closest('#recap-btn')){ showRecap(new Date().getFullYear()); return; }
  setGoal(new Date().getFullYear());
});
// Rétrospective annuelle (« Wrapped ») — pure agrégation en lecture
function yearRecap(year){
  const ys = String(year);
  const rd = allReadings().filter(e=>e.date.startsWith(ys));
  const books = [...new Set(rd.map(e=>e.b))];
  const rated = books.filter(b=>b.rating);
  const pages = books.reduce((s,b)=>s+(b.pages||0),0);
  const avg = rated.length ? rated.reduce((s,b)=>s+b.rating,0)/rated.length : 0;
  const best = rated.slice().sort((a,b)=>b.rating-a.rating)[0] || null;
  const longest = books.filter(b=>b.pages).sort((a,b)=>b.pages-a.pages)[0] || null;
  const byAuthor = {}; books.forEach(b=>(b.authors||[]).forEach(a=>byAuthor[a]=(byAuthor[a]||0)+1));
  const topAuthor = Object.entries(byAuthor).sort((x,y)=>y[1]-x[1])[0] || null;
  const byMonth = Array(12).fill(0); rd.forEach(e=>byMonth[+e.date.slice(5,7)-1]++);
  const topMonth = byMonth.indexOf(Math.max(...byMonth));
  const byType = {livre:0, bd:0, manga:0}; books.forEach(b=>{ if(byType[b.type]!=null) byType[b.type]++; });
  const moodCount = {}; books.forEach(b=>(b.moods||[]).forEach(m=>moodCount[m]=(moodCount[m]||0)+1));
  const topMoods = Object.entries(moodCount).sort((x,y)=>y[1]-x[1]).slice(0,3).map(x=>x[0]);
  const rereads = rd.filter(e=>{
    const s = (e.b.readings||[]).slice().sort((a,c)=>a.date.localeCompare(c.date)||String(a.id).localeCompare(String(c.id)));
    return s.findIndex(r=>r.id===e.rid) > 0;
  }).length;
  const byTag = {}; books.forEach(b=>(b.tags||[]).forEach(t=>{ if(t!=='exemple') byTag[t]=(byTag[t]||0)+1; }));
  const topTag = Object.entries(byTag).sort((a,b)=>b[1]-a[1])[0] || null;
  const readingDays = new Set(rd.map(e=>e.date)).size;
  const sr = {}; books.forEach(b=>{ if(b.series){ const k=seriesKey(b); (sr[k]=sr[k]||{name:b.series, n:0, pages:0}).n++; sr[k].pages+=b.pages||0; } });
  const topSeries = Object.values(sr).sort((a,b)=>b.n-a.n)[0] || null;
  const prevCount = allReadings().filter(e=>e.date.startsWith(String(year-1))).length;
  return {year, count:rd.length, pages, avg, best, longest, topAuthor, topMonth:byMonth.some(v=>v)?topMonth:-1, byType, topMoods, rereads, byMonth, topTag, readingDays, topSeries, prevCount};
}
function deltaBadge(cur, prev){
  const d = cur - prev;
  if(!prev) return '';
  if(d>0) return `<span class="delta ahead">▲ +${d} vs ${cur-d===prev?'N-1':'N-1'}</span>`;
  if(d<0) return `<span class="delta behind">▼ ${d} vs N-1</span>`;
  return `<span class="delta">= N-1</span>`;
}
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MONTHS_MINI = ['J','F','M','A','M','J','J','A','S','O','N','D'];
function showRecap(year){
  const r = yearRecap(year);
  ui.listMode = 'recap'; ui.recapYear = year;
  $('#list-head').textContent = `Ta rétro ${r.year} 🎉`;
  if(!r.count){
    $('#list-body').innerHTML = `<p style="color:var(--muted); padding:16px 0; text-align:center">Aucune lecture datée en ${r.year} — reviens quand tu auras noirci quelques pages.</p>`;
  }else{
    const bmax = Math.max(...r.byMonth, 1);
    const monthChart = `<div class="rating-histo" style="margin-bottom:14px">${r.byMonth.map((n,i)=>
      `<div class="col" title="${MONTHS_FR[i]} : ${n}"><div class="bar ${n?'on month':''}" style="height:${Math.max(n/bmax*100,3)}%"></div><span class="rl">${MONTHS_MINI[i]}</span></div>`).join('')}</div>`;
    $('#list-body').innerHTML = `
      <div class="recap-tiles">
        <div class="tile"><b>${r.count}</b><span>lecture${r.count>1?'s':''} ${deltaBadge(r.count, r.prevCount)}</span></div>
        <div class="tile"><b>${r.pages?r.pages.toLocaleString('fr-FR'):'—'}</b><span>pages</span></div>
        <div class="tile"><b>${r.avg?r.avg.toFixed(1).replace('.',',')+' ★':'—'}</b><span>note moyenne</span></div>
        ${r.rereads?`<div class="tile"><b>${r.rereads}</b><span>relecture${r.rereads>1?'s':''}</span></div>`:''}
      </div>
      ${monthChart}
      ${r.best?`<div class="recap-hi"><div class="rl">Ton coup de cœur</div><b>${esc(fullTitle(r.best))}</b> — ${starsTxt(r.best.rating)}</div>`:''}
      ${r.topAuthor?`<div class="recap-hi"><div class="rl">Auteur·e de l'année</div><b>${esc(r.topAuthor[0])}</b> · ${r.topAuthor[1]} titre${r.topAuthor[1]>1?'s':''}</div>`:''}
      ${r.topTag?`<div class="recap-hi"><div class="rl">Genre phare</div><b>${esc(r.topTag[0])}</b> · ${r.topTag[1]} titre${r.topTag[1]>1?'s':''}</div>`:''}
      ${r.topSeries&&r.topSeries.n>1?`<div class="recap-hi"><div class="rl">Ta plus longue saga</div><b>${esc(r.topSeries.name)}</b> · ${r.topSeries.n} tomes</div>`:''}
      ${r.readingDays?`<div class="recap-hi"><div class="rl">Jours de lecture</div><b>${r.readingDays}</b> jour${r.readingDays>1?'s':''} avec une page tournée</div>`:''}
      ${r.topMoods.length?`<div class="recap-hi"><div class="rl">Tes ambiances</div><b>${r.topMoods.map(esc).join(', ')}</b></div>`:''}
      <div class="recap-hi"><div class="rl">Par type</div><b>${Object.entries(r.byType).filter(([,n])=>n).map(([t,n])=>`${n} ${TYPE_LABEL[t].toLowerCase()}${n>1&&t==='livre'?'s':''}`).join(' · ')||'—'}</b></div>
      <button class="btn primary" id="recap-share" style="margin-top:14px; width:100%">📸 Créer ma carte à partager</button>`;
  }
  openOverlay('#ov-list');
}

/* =============== Export / import =============== */
function downloadBlob(content, type, filename){
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}
function downloadJSON(obj, filename){
  downloadBlob(typeof obj==='string' ? obj : JSON.stringify(obj, null, 2), 'application/json', filename);
}
const TOME_CSV_HEADERS = [
  'Tome CSV Version','Tome ID','Title','Authors','Type','Status','Rating','Favorite',
  'Year','Pages','Series','Volume','Series Total','Current Page','Tags','Moods','Pace',
  'Review','Synopsis','Readings','Progress Log','Quotes','Loan To','Loan Since','Loan Due','Cover','Added At','Study',
];
// Toutes les cellules sont citées. Une apostrophe neutralise les préfixes interprétés comme
// formules par Excel/Sheets ; l'import Tome la retirera sans altérer la donnée d'origine.
function csvCell(value){
  let s=value==null?'':String(value);
  if(/^'[=+\-@\t\r]/.test(s) || /^[=+\-@\t\r]/.test(s)) s="'"+s;
  return `"${s.replaceAll('"','""')}"`;
}
function csvUnprotect(value){
  const s=String(value||'');
  if(/^''[=+\-@\t\r]/.test(s) || /^'[=+\-@\t\r]/.test(s)) return s.slice(1);
  return s;
}
function bookToTomeCSVRow(b){
  return [
    2,b.id,b.title,(b.authors||[]).join(' | '),b.type,b.status,b.rating??'',b.favorite?'true':'false',
    b.year??'',b.pages??'',b.series||'',b.volume??'',b.seriesTotal??'',b.currentPage??'',
    (b.tags||[]).join(' | '),(b.moods||[]).join(' | '),b.pace||'',b.review||'',b.synopsis||'',
    JSON.stringify(b.readings||[]),JSON.stringify(b.progressLog||[]),JSON.stringify(b.quotes||[]),
    b.loan?.to||'',b.loan?.since||'',b.loan?.due||'',b.cover||'',b.addedAt||'',JSON.stringify(b.study||null),
  ];
}
function buildTomeCSV(books){
  return '\uFEFF'+[TOME_CSV_HEADERS, ...books.map(bookToTomeCSVRow)].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
$('#btn-export').addEventListener('click', ()=>{
  downloadJSON(state, `tome-export-${today()}.json`);
  state.meta.changes = 0;
  state.meta.lastExport = today();
  save(true);
  if(ui.view==='stats') renderStats();
  toast('Export téléchargé ✓');
});
$('#btn-export-csv').addEventListener('click', ()=>{
  downloadBlob(buildTomeCSV(state.books), 'text/csv;charset=utf-8', `tome-livres-${today()}.csv`);
  toast(`${state.books.length} livre${state.books.length>1?'s':''} exporté${state.books.length>1?'s':''} en CSV — le JSON reste la sauvegarde complète`);
});
/* =============== Import CSV (Tome / Goodreads / StoryGraph) =============== */
// Parseur CSV maison, tolérant RFC-4180 (guillemets, virgules et retours-ligne dans les champs, BOM)
function parseCSV(text){
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', i = 0, q = false;
  const push = ()=>{ row.push(f); f=''; };
  while(i < text.length){
    const c = text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i+=2; continue; } q=false; i++; continue; }
      f+=c; i++; continue;
    }
    if(c==='"'){ q=true; i++; continue; }
    if(c===','){ push(); i++; continue; }
    if(c==='\r'){ i++; continue; }
    if(c==='\n'){ push(); rows.push(row); row=[]; i++; continue; }
    f+=c; i++;
  }
  if(f.length || row.length){ push(); rows.push(row); }
  return rows.filter(r => r.some(v => v!==''));
}
function detectSource(headers){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  if(h.includes('tome csv version') && h.includes('tome id')) return 'tome';
  if(h.includes('exclusive shelf')) return 'goodreads';
  if(h.includes('read status') || (h.includes('moods') && h.includes('pace'))) return 'storygraph';
  return null;
}
function csvPipeList(v){ return csvUnprotect(v).split('|').map(s=>s.trim()).filter(Boolean); }
function csvJsonArray(v){ try{ const x=JSON.parse(csvUnprotect(v)); return Array.isArray(x)?x:[]; }catch(_){ return []; } }
function csvJsonObject(v){ try{ const x=JSON.parse(csvUnprotect(v)); return x&&typeof x==='object'&&!Array.isArray(x)?x:null; }catch(_){ return null; } }
function csvIsbn(v){
  const s = String(v||'').replace(/^=/,'').replace(/^"|"$/g,'').replace(/[-\s]/g,'');
  return isbnOf(s) || '';
}
function csvDate(s){
  s = String(s||'').trim().split(/[-–]/).pop().replace(/\//g,'-').trim();
  return isValidDate(s) ? s : null;
}
const GR_STATUS = {'read':'read', 'currently-reading':'reading', 'to-read':'wishlist'};
const SG_STATUS = {'read':'read', 'currently-reading':'reading', 'to-read':'wishlist', 'did-not-finish':'abandoned'};
const SG_MOOD = {adventurous:'entraînant', dark:'sombre', funny:'drôle', emotional:'émouvant', hopeful:'réconfortant', relaxing:'réconfortant', lighthearted:'réconfortant', tense:'tendu', mysterious:'tendu', challenging:'réflexif', informative:'réflexif', reflective:'réflexif', inspiring:'inspirant', sad:'mélancolique'};
const SG_PACE = {slow:'lent', medium:'moyen', fast:'rapide'};
// Détection de série pour l'import : suffixe « (Série, #N) » (Goodreads) ou mention « tome/vol N ».
// N'utilise PAS l'heuristique du nombre nu de parseTome (« Catch-22 » ne doit pas devenir tome 22).
function parenTome(title){
  const m = String(title).match(/\(([^)]+?)[,#\s]+#?(\d{1,4})\)\s*$/);
  if(m && m[1].trim()) return {series:m[1].trim(), volume:+m[2]};
  const m2 = String(title).match(/^(.*?)[\s,–—:-]*(?:tome|t\.|vol(?:ume)?\.?|#)\s*(\d{1,4})\b/i);
  if(m2 && m2[1].trim()) return {series:m2[1].trim().replace(/[,–—:-]+$/,'').trim(), volume:+m2[2]};
  return null;
}
// Retire le suffixe « (Série, #N) » du titre affiché quand la série a été extraite
function stripSeriesSuffix(title){
  return String(title).replace(/\s*\([^)]*[,#][^)]*\)\s*$/,'').trim() || String(title);
}
function rowToBook(get, source){
  const title = csvUnprotect(get('Title')).trim();
  if(!title) return null;
  if(source==='tome'){
    const statusRaw=csvUnprotect(get('Status')).toLowerCase();
    const statusMap={read:'read',lu:'read',reading:'reading','en cours':'reading',wishlist:'wishlist','à lire':'wishlist',abandoned:'abandoned',abandonné:'abandoned'};
    const to=csvUnprotect(get('Loan To')).trim();
    const raw={
      id:csvUnprotect(get('Tome ID')), title,
      authors:csvPipeList(get('Authors')), type:csvUnprotect(get('Type')).toLowerCase(),
      status:statusMap[statusRaw]||'wishlist', rating:numOrNull(get('Rating')),
      favorite:/^(?:true|1|yes|oui)$/i.test(csvUnprotect(get('Favorite'))),
      year:numOrNull(get('Year')), pages:numOrNull(get('Pages')),
      series:csvUnprotect(get('Series')).trim(), volume:numOrNull(get('Volume')), seriesTotal:numOrNull(get('Series Total')),
      currentPage:numOrNull(get('Current Page')), tags:csvPipeList(get('Tags')), moods:csvPipeList(get('Moods')),
      pace:csvUnprotect(get('Pace')).toLowerCase()||null,
      review:csvUnprotect(get('Review')), synopsis:csvUnprotect(get('Synopsis')),
      readings:csvJsonArray(get('Readings')), progressLog:csvJsonArray(get('Progress Log')), quotes:csvJsonArray(get('Quotes')),
      loan:to ? {to, since:csvUnprotect(get('Loan Since')), due:csvUnprotect(get('Loan Due'))} : null,
      cover:csvUnprotect(get('Cover')), addedAt:csvUnprotect(get('Added At'))||undefined, study:csvJsonObject(get('Study')),
    };
    return {book:normalizeBook(raw), isbn:''};
  }
  let authors, type, year, pages, status, rating, review, tags, moods=[], pace=null, readings, addedAt;
  const pt = parenTome(title) || {};
  if(source==='goodreads'){
    authors = [get('Author'), ...String(get('Additional Authors')||'').split(',')].map(s=>s.trim()).filter(Boolean);
    year = numOrNull(get('Original Publication Year')) || numOrNull(get('Year Published'));
    pages = numOrNull(get('Number of Pages'));
    const shelf = String(get('Exclusive Shelf')||'').trim().toLowerCase();
    status = GR_STATUS[shelf] || (/abandon|dnf|gave-up/.test(shelf) ? 'abandoned' : 'wishlist');
    const mr = +get('My Rating'); rating = (mr>0) ? mr : null;
    review = cleanReview(get('My Review'));
    tags = String(get('Bookshelves')||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!GR_STATUS[shelf] && shelf) tags.push(shelf);
    const dr = csvDate(get('Date Read')) || csvDate(get('Date Added'));
    readings = (status==='read' && dr) ? [{id:uid(), date:dr, rating:null}] : [];
    addedAt = get('Date Added') || undefined;
    type = guessType([get('Bookshelves'), get('Binding'), get('Publisher'), title].join(' '), title);
  }else{
    const contribs = String(get('Contributors')||'').split(',').map(s=>s.replace(/\([^)]*\)/g,'').trim()).filter(Boolean);
    authors = String(get('Authors')||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!authors.length && contribs.length) authors = contribs.slice(0,3);
    year = null; pages = null;
    status = SG_STATUS[String(get('Read Status')||'').trim().toLowerCase()] || 'wishlist';
    rating = numOrNull(get('Star Rating'));
    review = cleanReview(get('Review'));
    tags = String(get('Tags')||'').split(',').map(s=>s.trim()).filter(Boolean);
    moods = String(get('Moods')||'').split(',').map(m=>SG_MOOD[m.trim().toLowerCase()]).filter(Boolean);
    pace = SG_PACE[String(get('Pace')||'').trim().toLowerCase()] || null;
    const dates = String(get('Dates Read')||'').split(',').map(csvDate).filter(Boolean);
    const fallback = csvDate(get('Last Date Read'));
    const ds = dates.length ? dates : (status==='read' && fallback ? [fallback] : []);
    readings = ds.map(d=>({id:uid(), date:d, rating:null}));
    addedAt = get('Date Added') || undefined;
    type = guessType([get('Tags'), get('Format'), title].join(' '), title);
  }
  const raw = {
    title: pt.series ? stripSeriesSuffix(title) : title,
    authors, type, year, pages, cover:'', synopsis:'',
    status, rating, review, tags, moods, pace, readings,
    series: pt.series||'', volume: pt.volume ?? null,
  };
  if(addedAt) raw.addedAt = addedAt;
  const isbn = csvIsbn(get(source==='goodreads' ? 'ISBN13' : 'ISBN/UID')) || csvIsbn(get('ISBN'));
  return { book: normalizeBook(raw), isbn };
}
// Récupération non bloquante des couvertures par ISBN via Open Library (concurrence limitée)
function queueCovers(pairs){
  pairs = pairs.filter(p=>p.isbn);
  let i=0, active=0, dirty=false, got=0;
  const next = ()=>{
    if(i>=pairs.length){ if(!active && dirty){ save(true); scheduleRender(); if(got) toast(`${got} couverture(s) récupérée(s) ✓`); } return; }
    while(active<4 && i<pairs.length){
      const {id, isbn} = pairs[i++]; active++;
      const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
      const img = new Image(); img.referrerPolicy = 'no-referrer';
      let settled = false;
      const done = ok=>{
        if(settled) return; settled = true; clearTimeout(to);
        active--;
        if(ok){ const b = state.books.find(x=>x.id===id); if(b && !b.cover){ b.cover=url; dirty=true; got++; } }
        next();
      };
      const to = setTimeout(()=>done(false), 8000); // libère le créneau si l'image ne répond jamais
      img.onload = ()=>done(img.naturalWidth>1);
      img.onerror = ()=>done(false);
      img.src = url;
    }
  };
  next();
}
async function importCSV(text){
  const rows = parseCSV(text);
  if(rows.length < 2){ toast('CSV vide ou illisible'); return; }
  const source = detectSource(rows[0]);
  if(!source){ toast('Format non reconnu — attends un export Tome, Goodreads ou StoryGraph'); return; }
  const headers = rows[0].map(x=>String(x).trim().toLowerCase());
  const idx = {}; headers.forEach((x,i)=>{ if(!(x in idx)) idx[x]=i; });
  const mkGet = row => name => { const i = idx[String(name).toLowerCase()]; return i==null ? '' : String(row[i]||'').trim(); };
  const parsed = [];
  for(let r=1; r<rows.length && parsed.length<MAX_BOOKS; r++){
    const res = rowToBook(mkGet(rows[r]), source);
    if(res && res.book.title) parsed.push(res);
  }
  if(!parsed.length){ toast('Aucun livre exploitable dans ce fichier'); return; }
  const sourceLabel = source==='goodreads'?'Goodreads':source==='storygraph'?'StoryGraph':'Tome CSV';
  const choice = await uiChoose({
    title: `Import ${sourceLabel}`,
    message: `${parsed.length} livre(s) trouvé(s).${source==='tome'?'\n\nLe CSV contient les ouvrages, pas les listes ni les objectifs. Le JSON reste le format de sauvegarde complète.':''}\n\n« Fusionner » ajoute les nouveaux titres à ta bibliothèque (recommandé).\n« Tout remplacer » efface d'abord ta bibliothèque actuelle — une sauvegarde de secours est conservée (restaurable dans Stats).`,
    choices: [
      { label:'Fusionner', value:'merge', variant:'primary', default:true },
      { label:'Tout remplacer', value:'replace', variant:'danger' },
    ],
  });
  if(choice===null) return; // Annuler / Échap / clic hors modale = AUCUNE écriture
  const doReplace = (choice==='replace');
  // dédup par titre+auteur+tome (les livres existants n'ont pas d'ISBN persisté) ET par ISBN dans le lot
  const titleKey = b => (b.title+'|'+((b.authors||[])[0]||'')+'|'+(b.volume??'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
  const pairs = [];
  let added=0, skipped=0;
  if(doReplace){
    // Remplacement : backup d'abord (réutilise le mécanisme d'import JSON)
    const prev = JSON.stringify(state);
    let backedUp=false; try{ localStorage.setItem(LS_KEY+'-backup', prev); backedUp=true; }catch(_){}
    if(!backedUp && state.books.length) downloadJSON(prev, `tome-sauvegarde-avant-import-${today()}.json`);
    state.books = []; state.lists = []; state.goals = {}; state.series = {}; state.smartCollections = [];
  }
  const seen = new Set(state.books.map(titleKey));
  for(const {book, isbn} of parsed){
    const tk = titleKey(book);
    if(seen.has(tk) || (isbn && seen.has('isbn:'+isbn))){ skipped++; continue; }
    seen.add(tk); if(isbn) seen.add('isbn:'+isbn);
    state.books.unshift(book); pairs.push({id:book.id, isbn}); added++;
  }
  if(save()){ render(); }
  else { render(); toast('⚠ Importé mais non sauvegardé (stockage plein)'); return; }
  toast(`Import ${sourceLabel} : ${added} ajoutés${skipped?`, ${skipped} déjà présents`:''}${source==='tome'?'.':'. Couvertures en cours…'}`);
  if(source!=='tome') queueCovers(pairs);
}
$('#btn-import-csv').addEventListener('click', ()=>$('#import-csv-file').click());
$('#import-csv-file').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  e.target.value = '';
  if(f.size > 25*1024*1024){ toast('Fichier trop volumineux'); return; }
  const reader = new FileReader();
  reader.onload = ()=>{ try{ importCSV(String(reader.result||'')); }catch(err){ console.error(err); toast('Import CSV impossible — fichier illisible'); } };
  reader.readAsText(f);
});

$('#btn-import').addEventListener('click', ()=>$('#import-file').click());
$('#import-file').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  e.target.value = '';
  if(f.size > 25*1024*1024){ toast('Fichier trop volumineux pour un export Tome'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const d = JSON.parse(reader.result);
      const clean = normalizeData(d);
      if(!clean.books.length && !clean.lists.length) throw new Error('vide');
      if(!await uiConfirm({ title:'Importer cette sauvegarde ?', message:`${clean.books.length} ouvrage(s) et ${clean.lists.length} liste(s). Cela remplace tes données actuelles — une sauvegarde de secours est conservée (restaurable dans Stats).`, okLabel:'Importer et remplacer', danger:true })) return;
      // sauvegarde de secours AVANT tout écrasement ; si le stockage est plein, on télécharge l'ancien état
      const prev = JSON.stringify(state);
      let backedUp = false;
      try{ localStorage.setItem(LS_KEY+'-backup', prev); backedUp = true; }catch(_){ }
      if(!backedUp && state.books.length){
        downloadJSON(prev, `tome-sauvegarde-avant-import-${today()}.json`);
        toast('Stockage plein : ancienne bibliothèque téléchargée en secours');
      }
      state.books = clean.books; state.lists = clean.lists; state.goals = clean.goals; state.meta = clean.meta; state.series = clean.series||{}; state.smartCollections = clean.smartCollections||[];
      if(save()){ render(); toast('Import réussi ✓'); }
      else { render(); toast('⚠ Importé mais non sauvegardé (stockage plein) — exporte pour sécuriser'); }
    }catch(err){ toast('Fichier invalide ou vide'); }
  };
  reader.readAsText(f);
});
// Sauvegardes restaurables : avant-import (-backup), données corrompues (-corrupt), et les copies
// de secours faites avant une réconciliation avec le compte (-preacct / -conflit / -autre).
const RESTORE_KEYS = [
  { k:'-backup',  label:"Sauvegarde d'avant-import" },
  { k:'-preacct', label:"Version locale d'avant la synchro du compte" },
  { k:'-conflit', label:"Version locale d'avant une fusion multi-appareils" },
  { k:'-autre',   label:"Bibliothèque locale d'un autre compte, mise de côté" },
];
function hasRecoverable(){ return RESTORE_KEYS.some(r=>localStorage.getItem(LS_KEY+r.k)) || !!localStorage.getItem(LS_KEY+'-corrupt'); }
$('#btn-restore').addEventListener('click', async ()=>{
  const avail = RESTORE_KEYS.map(r=>({ ...r, raw:localStorage.getItem(LS_KEY+r.k) })).filter(r=>r.raw);
  const corrupt = localStorage.getItem(LS_KEY+'-corrupt');
  if(!avail.length && corrupt){
    downloadJSON(corrupt, `tome-donnees-brutes-${today()}.json`);
    toast('Copie brute téléchargée — à réparer à la main puis réimporter'); return;
  }
  if(!avail.length){ toast('Aucune sauvegarde disponible'); return; }
  // choisir laquelle restaurer (avec le nombre d'ouvrages pour se repérer)
  let chosen = avail[0];
  if(avail.length > 1){
    const choices = avail.map(r=>{ let n='?'; try{ n=String((JSON.parse(r.raw).books||[]).length); }catch(_){} return { label:`${r.label} — ${n} ouvrage(s)`, value:r.k }; });
    const pick = await uiChoose({ title:'Quelle sauvegarde restaurer ?', choices });
    if(!pick) return; chosen = avail.find(r=>r.k===pick);
  }
  try{
    const clean = normalizeData(JSON.parse(chosen.raw));
    if(!await uiConfirm({ title:'Restaurer cette sauvegarde ?', message:`${chosen.label} : ${clean.books.length} ouvrage(s), ${clean.lists.length} liste(s). Tes données actuelles seront remplacées (elles resteront sauvegardées côté serveur si tu es connecté).`, okLabel:'Restaurer', danger:true })) return;
    replaceState(clean); libPersist(); render(); if(social.me) scheduleLibPush();
    toast('Sauvegarde restaurée ✓');
  }catch(_){ toast('Sauvegarde illisible'); }
});

/* =============== Page publique /@pseudo ===============
   Lisible sans compte : c'est le lien qu'on met dans une bio. Elle n'affiche QUE ce que le
   serveur accepte de rendre public (opt-in + mode de partage) — le front ne décide rien. */
function publicUsernameFromURL(){
  const m = location.pathname.match(/^\/@([a-z0-9_.-]{3,20})$/i);
  if(m) return m[1].toLowerCase();
  const h = location.hash.match(/^#@([a-z0-9_.-]{3,20})$/i);   // repli si l'hébergeur ne route pas /@
  return h ? h[1].toLowerCase() : '';
}
async function showPublicProfile(uname){
  const host = $('#pubprofile'), body = $('#pp-body');
  host.hidden = false; document.body.style.overflow='hidden';
  syncModalIsolation();
  body.innerHTML = `<div class="pp-empty">Chargement du profil…</div>`;
  let d;
  try{ d = await api('/api/public/'+encodeURIComponent(uname)); }
  catch(e){
    body.innerHTML = `<div class="pp-empty">
      <p>${e.message==='offline' ? 'Profil indisponible hors ligne.' : 'Ce profil n\'existe pas ou n\'est pas public.'}</p>
      <p style="margin-top:16px"><a class="btn primary" href="/">Découvrir Tome</a></p></div>`;
    return;
  }
  const u = d.user, st = d.stats||{}, shelf = d.shelf||[];
  const annee = u.since ? new Date(u.since).getFullYear() : '';
  document.title = `${u.displayName} — Tome`;
  body.innerHTML = `
    <header class="pp-head">
      <h1 class="pp-name">${esc(u.displayName)}</h1>
      <div class="pp-user">@${esc(u.username)}</div>
      ${u.bio ? `<p class="pp-bio">${esc(u.bio)}</p>` : ''}
      <div class="pp-stats">
        <div class="pp-stat"><b>${st.books||0}</b><span>livre${(st.books||0)>1?'s':''}</span></div>
        ${st.avg!=null ? `<div class="pp-stat"><b>${String(st.avg).replace('.',',')} ★</b><span>note moyenne</span></div>` : ''}
        ${annee ? `<div class="pp-stat"><b>${annee}</b><span>sur Tome depuis</span></div>` : ''}
      </div>
    </header>
    ${shelf.length ? `<div class="pp-sec">Ses lectures</div>
      <div class="pp-grid">${shelf.map(b=>`<div class="pp-item">
        <div class="pp-cov">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"><div class="pp-ph">${esc(b.title)}</div>` : `<div class="pp-ph">${esc(b.title)}</div>`}</div>
        <div class="pp-t">${esc(b.title)}</div>
        ${b.rating ? `<div class="pp-r">${starsTxt(b.rating)}</div>` : ''}
      </div>`).join('')}</div>` : `<div class="pp-empty">Ce lecteur n'a encore rien partagé.</div>`}
    <section class="pp-cta">
      <h3>Et toi, tu lis quoi ?</h3>
      <p>Note tes livres, BD et manga, garde la trace de tes lectures et compare avec tes amis. Gratuit, sans publicité.</p>
      <a class="btn primary lp-big" href="/">Créer ma bibliothèque</a>
    </section>`;
}

/* =============== Notation rapide ===============
   Une bibliothèque remplie rétrospectivement arrive souvent SANS notes (constaté chez le premier
   utilisateur réel : 41 livres lus, 0 note) — or les notes nourrissent les stats, le récap, le fil
   et les recommandations. On enchaîne donc les lectures non notées, une carte à la fois. */
function unratedBooks(){
  return state.books.filter(b => !b.rating && (b.status==='read' || (b.readings||[]).length))
                    .sort((a,b)=> (lastReadDate(b)||'').localeCompare(lastReadDate(a)||''));  // les plus récentes d'abord
}
function lastReadDate(b){ return (b.readings||[]).map(r=>r.date).filter(Boolean).sort().pop() || ''; }
let _qrQueue = [], _qrDone = 0, _qrTotal = 0;
function openQuickRate(){
  _qrQueue = unratedBooks(); _qrDone = 0; _qrTotal = _qrQueue.length;
  if(!_qrTotal){ toast('Tout est déjà noté ✓'); return; }
  renderQuickRate(); openOverlay('#ov-rate');
}
function renderQuickRate(){
  const el = $('#rate-body'); if(!el) return;
  const b = _qrQueue[0];
  if(!b){                                            // file épuisée
    const reste = unratedBooks().length;
    el.innerHTML = `<div class="qr-done"><div class="big">✨</div>
      <h4>${_qrDone ? `${_qrDone} lecture${_qrDone>1?'s':''} notée${_qrDone>1?'s':''}` : 'C\'est tout pour l\'instant'}</h4>
      <p>${_qrDone ? 'Tes stats, ton récap et ton fil viennent de gagner en relief.' : 'Reviens quand tu auras terminé un livre.'}${reste?` Il reste ${reste} titre${reste>1?'s':''} à noter plus tard.`:''}</p>
      <div class="qr-actions"><button class="btn primary" data-close>Terminer</button></div></div>`;
    return;
  }
  const when = lastReadDate(b);
  el.innerHTML = `
    <div class="qr-prog"><div class="qr-bar"><i style="width:${Math.round(_qrDone/_qrTotal*100)}%"></i></div>
      <span class="qr-count">${_qrDone} / ${_qrTotal}</span></div>
    <div class="qr-card">
      <div class="qr-cover">${b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer"><div class="qr-ph">${esc(b.title)}</div>` : `<div class="qr-ph">${esc(b.title)}</div>`}</div>
      <div class="qr-title">${esc(fullTitle(b))}</div>
      <div class="qr-author">${esc(authorsStr(b))}</div>
      ${when ? `<div class="qr-when">lu le ${fmtDate(when)}</div>` : ''}
      <div class="star-input qr-stars" id="qr-stars" tabindex="0" role="slider" aria-label="Ma note"
           aria-valuemin="0" aria-valuemax="5" aria-valuenow="0" aria-valuetext="non noté">${starInputHTML(0)}</div>
      <div class="qr-hint">Touche la moitié gauche d'une étoile pour une demi-note</div>
      <div class="qr-actions">
        <button class="btn" id="qr-skip">Passer</button>
        <button class="btn" id="qr-open">Ouvrir la fiche</button>
        <button class="btn" data-close>Fermer</button>
      </div>
    </div>`;
}
function qrAdvance(){ _qrQueue.shift(); renderQuickRate(); }
$('#rate-body').addEventListener('click', e=>{
  const b = _qrQueue[0];
  const st = e.target.closest('#qr-stars .st');
  if(st && b){
    b.rating = halfFromClick(st, e.clientX) ? +st.dataset.n-0.5 : +st.dataset.n;
    // la note de l'unique lecture suit, pour que le journal reste cohérent avec la fiche
    const rs = b.readings||[]; if(rs.length===1 && rs[0].rating==null) rs[0].rating = b.rating;
    save(); _qrDone++;
    $('#qr-stars').innerHTML = starInputHTML(b.rating);          // feedback avant d'enchaîner
    $('#rate-body').querySelector('.qr-hint').textContent = `${starsTxt(b.rating)} — enregistré ✓`;
    setTimeout(()=>{ qrAdvance(); scheduleRender(); }, 420);
    return;
  }
  if(e.target.closest('#qr-skip')){ qrAdvance(); return; }
  if(e.target.closest('#qr-open') && b){ closeOverlays(); openDetail(b.id); return; }
});
// clavier : ← → pour choisir, Entrée pour valider et enchaîner
$('#rate-body').addEventListener('keydown', e=>{
  const host = e.target.closest && e.target.closest('#qr-stars'); if(!host) return;
  const b = _qrQueue[0]; if(!b) return;
  let v = +host.getAttribute('aria-valuenow') || 0;
  if(e.key==='ArrowRight'){ e.preventDefault(); v = Math.min(5, v+0.5); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); v = Math.max(0, v-0.5); }
  else if(e.key==='Enter' && v){ e.preventDefault(); b.rating = v;
    const rs=b.readings||[]; if(rs.length===1 && rs[0].rating==null) rs[0].rating=v;
    save(); _qrDone++; qrAdvance(); scheduleRender(); return; }
  else return;
  host.setAttribute('aria-valuenow', v); host.setAttribute('aria-valuetext', v?v+' étoiles':'non noté');
  host.innerHTML = starInputHTML(v);
});

/* =============== Carte de partage =============== */
function wrapText(ctx, text, x, y, maxW, lineH, maxLines){
  // pré-découpe les « mots » plus larges que maxW (URL collée, texte sans espaces…)
  const words = [];
  for(const w0 of String(text).split(/\s+/).filter(Boolean)){
    let w = w0;
    while(ctx.measureText(w).width > maxW && w.length > 2){
      let cut = w.length;
      while(cut > 2 && ctx.measureText(w.slice(0,cut)).width > maxW) cut--;
      words.push(w.slice(0,cut));
      w = w.slice(cut);
    }
    words.push(w);
  }
  let line = '', lines = 0;
  for(const w of words){
    const t = line ? line+' '+w : w;
    if(ctx.measureText(t).width > maxW && line){
      if(lines >= maxLines-1){
        let last = line;
        while(ctx.measureText(last+'…').width > maxW && last.length > 1) last = last.slice(0,-1);
        ctx.fillText(last+'…', x, y);
        return y + lineH;
      }
      ctx.fillText(line, x, y); y += lineH; lines++;
      line = w;
    }else line = t;
  }
  if(line){ ctx.fillText(line, x, y); y += lineH; }
  return y;
}
// Aperçu + partage d'une carte générée. Sur mobile, navigator.share({files}) ouvre la feuille
// native (Instagram, WhatsApp…) — LE canal viral ; sinon repli sur le téléchargement.
const SITE_URL = 'https://tome-social.lucas-marroig.workers.dev';
let _cardUrl = ''; // blob-URL de l'aperçu courant, révoquée à la génération suivante
function presentCard(cv, filename, shareText){
  cv.toBlob(blob=>{
    if(!blob){ toast('Génération impossible'); return; }
    if(_cardUrl){ try{ URL.revokeObjectURL(_cardUrl); }catch(_){ } }
    _cardUrl = URL.createObjectURL(blob);
    // aperçu en data: (la CSP img-src autorise data: mais pas blob:) ; le blob sert au partage/téléchargement
    const dataUrl = cv.toDataURL('image/png');
    const file = new File([blob], filename, {type:'image/png'});
    const canNative = !!(navigator.canShare && navigator.canShare({files:[file]}));
    $('#card-body').innerHTML = `
      <img class="card-preview" src="${dataUrl}" alt="Aperçu de la carte">
      <div class="card-actions">
        ${canNative ? '<button class="btn primary" id="card-share">📲 Partager</button>' : ''}
        <button class="btn ${canNative?'':'primary'}" id="card-dl">⬇ Télécharger</button>
      </div>
      <p class="card-hint">En story, en message… l'adresse de Tome est sur l'image ✨</p>`;
    if(canNative) $('#card-share').addEventListener('click', async ()=>{
      try{ await navigator.share({ files:[file], title:'Tome', text:shareText }); }catch(_){ /* partage annulé */ }
    });
    $('#card-dl').addEventListener('click', ()=>{
      const a = document.createElement('a'); a.href = _cardUrl; a.download = filename; a.click();
      toast('Carte téléchargée ✓');
    });
    $('#ov-card').classList.add('open'); // par-dessus la modale ouverte (rétro/détail), sans la fermer
    syncModalIsolation(); // sinon la carte reste inerte : clics traversés vers la fiche → données modifiées
  }, 'image/png');
}
function drawCard(b, coverImg){
  const W = 1000, H = 1250;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#161c22'); g.addColorStop(1,'#0d1114');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const cw = 340, ch = 510, cx = (W-cw)/2, cy = 90;
  ctx.save();
  if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,16); ctx.clip(); }
  if(coverImg){ ctx.drawImage(coverImg, cx, cy, cw, ch); }
  else{
    const hues = {livre:205, bd:28, manga:340}; const h = hues[b.type] ?? 150;
    const pg = ctx.createLinearGradient(cx,cy,cx+cw,cy+ch);
    pg.addColorStop(0,`hsl(${h},32%,26%)`); pg.addColorStop(1,`hsl(${h},38%,13%)`);
    ctx.fillStyle = pg; ctx.fillRect(cx,cy,cw,ch);
    ctx.fillStyle = '#e8eef4'; ctx.textAlign = 'center';
    ctx.font = 'bold 26px system-ui, sans-serif';
    wrapText(ctx, fullTitle(b), cx+cw/2, cy+ch/2-20, cw-60, 34, 4);
  }
  ctx.restore();
  if(ctx.roundRect){ ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,16); ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8eef4'; ctx.font = 'bold 46px system-ui, sans-serif';
  let y = wrapText(ctx, fullTitle(b), W/2, cy+ch+84, W-160, 56, 2);
  ctx.font = '28px system-ui, sans-serif'; ctx.fillStyle = '#8fa1b3';
  y = wrapText(ctx, authorsStr(b), W/2, y+4, W-200, 36, 1);
  if(b.rating){
    ctx.font = '44px system-ui, sans-serif'; ctx.fillStyle = '#f5c14e';
    ctx.fillText(starsTxt(b.rating), W/2, y+30); y += 74;
  }
  if(b.review){
    ctx.font = 'italic 26px Georgia, serif'; ctx.fillStyle = '#b9c6d2';
    y = wrapText(ctx, '« '+b.review+' »', W/2, y+26, W-200, 38, 5);
  }
  ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillStyle = '#2fc775';
  ctx.fillText('Tome.', W/2, H-88);
  ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#7fe0ab';
  ctx.fillText('tome-social.lucas-marroig.workers.dev', W/2, H-52);
  const lastR = (b.readings||[]).slice().sort((a,c)=>c.date.localeCompare(a.date))[0];
  if(lastR){
    ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#5c6b7a';
    ctx.fillText('lu le '+fmtDate(lastR.date), W/2, H-20);
  }
  return cv;
}
function shareCard(b){
  const generate = (img)=>{
    try{
      const cv = drawCard(b, img);
      const slug = (b.title||'carte').toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,40)||'carte';
      presentCard(cv, `tome-${slug}.png`, `« ${fullTitle(b)} » — mon avis sur Tome · ${SITE_URL}`);
    }catch(e){
      // canvas « souillé » (couverture sans CORS) → on regénère sans l'image
      if(img) generate(null);
      else toast('Génération impossible');
    }
  };
  if(b.cover && /^(https?:\/\/|data:image\/)/.test(b.cover)){
    const img = new Image();
    if(/^https?:/.test(b.cover)){ img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; }
    img.onload = ()=>generate(img);
    img.onerror = ()=>generate(null);
    img.src = b.cover;
  }else generate(null);
}
// Carte de rétro annuelle, format story 1080×1350
function drawYearCard(year, coverImg){
  const r = yearRecap(year);
  const W=1080, H=1350;
  const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0,0,W*0.4,H);
  g.addColorStop(0,'#1c3327'); g.addColorStop(.5,'#141b21'); g.addColorStop(1,'#0c1013');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const halo = ctx.createRadialGradient(W*0.28,150,30,W*0.28,150,560);
  halo.addColorStop(0,'rgba(47,199,117,.2)'); halo.addColorStop(1,'rgba(47,199,117,0)');
  ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);
  const PAD=88; ctx.textAlign='left';
  ctx.fillStyle='#8fa1b3'; ctx.font='600 32px system-ui'; ctx.fillText('MA RÉTRO LECTURE', PAD, 128);
  ctx.fillStyle='#e8eef4'; ctx.font='800 165px system-ui'; ctx.fillText(String(r.year), PAD, 300);
  const hY=430;
  ctx.fillStyle='#2fc775'; ctx.font='800 128px system-ui'; ctx.fillText(String(r.count), PAD, hY);
  ctx.fillStyle='#8fa1b3'; ctx.font='600 32px system-ui'; ctx.fillText(r.count>1?'lectures':'lecture', PAD, hY+44);
  const c2=W*0.52; ctx.fillStyle='#e8eef4'; ctx.font='800 128px system-ui';
  ctx.fillText(r.pages?r.pages.toLocaleString('fr-FR'):'—', c2, hY);
  ctx.fillStyle='#8fa1b3'; ctx.font='600 32px system-ui'; ctx.fillText('pages lues', c2, hY+44);
  let y=560;
  if(r.best){
    const cw=170, ch=255, cx=PAD, cy=y; ctx.save();
    if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,14); ctx.clip(); }
    if(coverImg) ctx.drawImage(coverImg, cx, cy, cw, ch);
    else{ const hu={livre:205,bd:28,manga:340}[r.best.type]??150; const pg=ctx.createLinearGradient(cx,cy,cx+cw,cy+ch); pg.addColorStop(0,`hsl(${hu},32%,26%)`); pg.addColorStop(1,`hsl(${hu},38%,13%)`); ctx.fillStyle=pg; ctx.fillRect(cx,cy,cw,ch); }
    ctx.restore();
    const tx=cx+cw+40;
    ctx.fillStyle='#f5c14e'; ctx.font='700 26px system-ui'; ctx.fillText('COUP DE CŒUR', tx, cy+42);
    ctx.fillStyle='#e8eef4'; ctx.font='700 44px system-ui'; const aT=wrapText(ctx, fullTitle(r.best), tx, cy+100, W-PAD-tx, 50, 2);
    ctx.fillStyle='#8fa1b3'; ctx.font='28px system-ui'; const aA=wrapText(ctx, authorsStr(r.best), tx, aT+6, W-PAD-tx, 34, 1);
    ctx.fillStyle='#f5c14e'; ctx.font='36px system-ui'; ctx.fillText(starsTxt(r.best.rating), tx, aA+34);
    y=cy+ch+76;
  }
  const rows=[];
  if(r.topAuthor) rows.push(['Auteur·e de l’année', r.topAuthor[0]]);
  if(r.topTag) rows.push(['Genre phare', r.topTag[0]]);
  if(r.avg) rows.push(['Note moyenne', r.avg.toFixed(1).replace('.',',')+' ★']);
  if(r.readingDays) rows.push(['Jours de lecture', r.readingDays+' j']);
  for(const [lbl,val] of rows.slice(0,3)){ // 3 max : le graphique et le pied de carte doivent tenir
    ctx.textAlign='left'; ctx.fillStyle='#8fa1b3'; ctx.font='500 30px system-ui'; ctx.fillText(lbl, PAD, y);
    ctx.textAlign='right'; ctx.fillStyle='#e8eef4'; ctx.font='700 32px system-ui';
    let v=String(val); while(ctx.measureText(v).width>W-2*PAD-300 && v.length>1) v=v.slice(0,-1);
    ctx.fillText(v===String(val)?v:v+'…', W-PAD, y); y+=36;
    ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(PAD,y); ctx.lineTo(W-PAD,y); ctx.stroke(); y+=26;
  }
  // rythme mensuel ancré au-dessus du pied de carte, hauteur adaptée à la place restante :
  // impossible de déborder sur « Tome. » + URL quel que soit le contenu au-dessus
  ctx.textAlign='left'; y+=16;
  ctx.fillStyle='#8fa1b3'; ctx.font='600 28px system-ui'; ctx.fillText('RYTHME MOIS PAR MOIS', PAD, y);
  const barsTop = y+22, maxBarH = Math.max(60, Math.min(150, (H-176)-barsTop)), base = barsTop+maxBarH;
  const bm=r.byMonth||Array(12).fill(0), bmax=Math.max(...bm,1), cW=W-2*PAD, gap=14, bw=(cW-gap*11)/12;
  for(let i=0;i<12;i++){
    const bh=Math.max(bm[i]/bmax*maxBarH, bm[i]?6:2), bx=PAD+i*(bw+gap);
    ctx.fillStyle=bm[i]?'#2fc775':'#242e39';
    if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(bx, base-bh, bw, bh, 5); ctx.fill(); } else ctx.fillRect(bx, base-bh, bw, bh);
    ctx.fillStyle='#5c6b7a'; ctx.font='22px system-ui'; ctx.textAlign='center'; ctx.fillText(MONTHS_MINI[i], bx+bw/2, base+32);
  }
  ctx.textAlign='center'; ctx.fillStyle='#2fc775'; ctx.font='800 44px system-ui'; ctx.fillText('Tome.', W/2, H-84);
  ctx.fillStyle='#7fe0ab'; ctx.font='26px system-ui'; ctx.fillText('tome-social.lucas-marroig.workers.dev', W/2, H-40);
  return cv;
}
function shareYearCard(year){
  const r = yearRecap(year);
  if(!r.count){ toast('Rien à mettre sur la carte pour cette année'); return; }
  const generate = (img)=>{
    try{
      presentCard(drawYearCard(year, img), `tome-retro-${year}.png`, `Ma rétro lecture ${year} 📚 · ${SITE_URL}`);
    }catch(e){ if(img) generate(null); else toast('Génération impossible'); }
  };
  const cover = r.best && r.best.cover;
  if(cover && /^(https?:\/\/|data:image\/)/.test(cover)){
    const img = new Image();
    if(/^https?:/.test(cover)){ img.crossOrigin='anonymous'; img.referrerPolicy='no-referrer'; }
    img.onload = ()=>generate(img);
    img.onerror = ()=>generate(null);
    img.src = cover;
  }else generate(null);
}

/* =============== Overlays & focus =============== */
function openOverlay(sel){
  ui.lastFocus = document.activeElement;
  closeOverlays(false);
  const root=$(sel); root.classList.add('open'); syncModalIsolation();
  queueMicrotask(()=>{ if(!root.contains(document.activeElement)){ const first=modalFocusables(root)[0]; if(first) first.focus(); } });
}
function closeOverlays(restore=true){
  stopScan();
  $$('.overlay').forEach(o=>o.classList.remove('open'));
  syncModalIsolation();
  if(restore && ui.lastFocus && document.contains(ui.lastFocus)){ try{ ui.lastFocus.focus(); }catch(_){} }
  if(_dirtyBg){ _dirtyBg=false; render(); } // rattrape le rendu de fond différé pendant la modale
}
function openCover(url){
  const ov = $('#ov-cover');
  ov.querySelector('img').src = url;
  ov.classList.add('open');
  syncModalIsolation();
}
$('#ov-cover').addEventListener('click', ()=>{ $('#ov-cover').classList.remove('open'); syncModalIsolation(); });
$('#ov-card').addEventListener('click', e=>{ // se ferme seul, sans fermer la modale en dessous
  if(e.target===$('#ov-card') || e.target.closest('#card-close')){ $('#ov-card').classList.remove('open'); syncModalIsolation(); }
});
$$('.overlay').forEach(o => o.addEventListener('click', e => {
  if(o.id==='ov-cover' || o.id==='ov-card') return; // fermés par leur propre handler
  if(e.target === o || e.target.closest('[data-close]')) closeOverlays();
}));
document.addEventListener('keydown', e => {
  if(e.key!=='Escape') return;
  const cov = $('#ov-cover');
  if(cov.classList.contains('open')){ cov.classList.remove('open'); syncModalIsolation(); return; } // ferme d'abord le lightbox
  const ocd = $('#ov-card');
  if(ocd.classList.contains('open')){ ocd.classList.remove('open'); syncModalIsolation(); return; } // puis l'aperçu de carte
  if($$('.overlay.open').length){ closeOverlays(); return; }
  if(ui.selectMode){ clearSelection(); renderLibrary(); }
});
// Navigation par hash entre les onglets et deep-link #book/<id>
window.addEventListener('popstate', ()=>applyHashView());
window.addEventListener('hashchange', ()=>applyHashView());
const INVITE_RE = /^invite\/([a-z0-9_.-]{3,20})$/i; // même contrainte que les pseudos serveur
function applyHashView(hash){
  if($$('.overlay.open').length){ closeOverlays(); return; }
  const h = (hash!=null ? hash : location.hash).replace(/^#/, '');
  const inv = h.match(INVITE_RE);
  if(inv){
    social.invite = inv[1].toLowerCase();
    try{ history.replaceState(history.state, '', location.pathname + location.search); }catch(_){} // ne pas re-déclencher au refresh
    selectView('friends');
    return;
  }
  const m = h.match(/^book\/(.+)$/);
  if(m){
    let id; try{ id = decodeURIComponent(m[1]); }catch(_){ return; }
    if(state.books.some(b=>b.id===id)){ selectView('library'); openDetail(id); }
    return;
  }
  if(['today','library','journal','lists','stats','friends'].includes(h) && h!==ui.view) selectView(h);
}

/* =============== PWA =============== */
let installEvt = null;
const installButtons = () => [$('#btn-install'), $('#btn-install-welcome')].filter(Boolean);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOSDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function refreshInstallButtons(){
  const canHelpInstall = !isStandalone() && (installEvt || isIOSDevice());
  installButtons().forEach(btn => { btn.hidden = !canHelpInstall; });
}
function showManualInstallHelp(){
  const ios = isIOSDevice();
  return openDialog({
    title:'Installer Tome',
    message: ios
      ? 'Dans Safari, touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil » et enfin « Ajouter ». Tome apparaîtra comme une app et pourra fonctionner hors ligne.'
      : 'Ouvre le menu de ton navigateur, puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Si l’option n’apparaît pas, ouvre Tome dans Chrome ou Edge.',
    actions:[{label:'Compris', value:null, cancel:true, default:true}]
  });
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvt = e;
  refreshInstallButtons();
});
async function requestInstall(){
  if(isStandalone()){ refreshInstallButtons(); return; }
  if(!installEvt){ await showManualInstallHelp(); return; }
  installEvt.prompt();
  const choice = await installEvt.userChoice;
  installEvt = null;
  refreshInstallButtons();
  if(choice.outcome === 'accepted') toast('Tome est en cours d’installation ✓');
}
installButtons().forEach(btn => btn.addEventListener('click', requestInstall));
window.addEventListener('appinstalled', ()=>{
  installEvt = null;
  refreshInstallButtons();
  toast('Tome est installé ✓');
});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallButtons);
refreshInstallButtons();
/* =============== Mise à jour PWA + hors-ligne =============== */
let _swRefreshing = false;
function showUpdateBar(reg){
  const bar = $('#update-bar');
  bar.classList.add('show');
  $('#update-reload').onclick = ()=>{
    if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    else location.reload();
  };
}
if('serviceWorker' in navigator){
  addEventListener('load', async ()=>{
    try{
      const reg = await navigator.serviceWorker.register('sw.js');
      // un nouveau worker installé alors qu'un ancien contrôle déjà la page = mise à jour dispo
      reg.addEventListener('updatefound', ()=>{
        const w = reg.installing; if(!w) return;
        w.addEventListener('statechange', ()=>{
          if(w.state==='installed' && navigator.serviceWorker.controller) showUpdateBar(reg);
        });
      });
      if(reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);
      // capter les MAJ pendant une session PWA longue
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) reg.update().catch(()=>{}); });
    }catch(_){}
  });
  let _hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(_swRefreshing) return;
    if(!_hadController){ _hadController = true; return; } // 1re prise de contrôle (clients.claim) : ne pas recharger
    _swRefreshing = true; location.reload();
  });
}
if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});

// Badge hors-ligne
function updateOnline(){ $('#offline-badge').hidden = navigator.onLine; }
window.addEventListener('online', ()=>{
  // le fil d'« Aujourd'hui » resterait figé sur « indisponible hors ligne » : on le réarme
  social.todayFeedError=''; social.todayFeedAt=0;
  if(ui.view==='today') renderTodaySocial();
});
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// Multi-fenêtres (PWA + onglet, ou onglet dupliqué) : une autre instance a écrit → recharger pour ne pas écraser
let _reloadWarned = false;
window.addEventListener('storage', e => {
  if(e.key !== LS_KEY || e.newValue == null) return;
  if($$('.overlay.open').length){
    if(!_reloadWarned){ _reloadWarned = true; toast('⚠ Modifié dans une autre fenêtre — recharge pour synchroniser'); }
    return;
  }
  try{
    const fresh = normalizeData(JSON.parse(e.newValue));
    state.books = fresh.books; state.lists = fresh.lists; state.goals = fresh.goals; state.meta = fresh.meta; state.series = fresh.series||{}; state.smartCollections = fresh.smartCollections||[];
    invalidateCache(); render();
  }catch(_){ }
});

/* =============== Reprendre + FAB + raccourcis clavier =============== */
function lastReadingBook(){
  // livre en cours avec la progression la plus récente, sinon le plus récemment ajouté « en cours »
  const reading = state.books.filter(b=>b.status==='reading');
  if(!reading.length) return null;
  let best = null, bestDate = '';
  for(const b of reading){
    const last = (b.progressLog||[]).map(p=>p.date).sort().pop() || b.addedAt || '';
    if(last >= bestDate){ bestDate = last; best = b; }
  }
  return best || reading[0];
}
function refreshResume(){
  $('#btn-resume').hidden = !lastReadingBook();
}
$('#btn-resume').addEventListener('click', ()=>{ const b = lastReadingBook(); if(b) openDetail(b.id); });
$('#fab').addEventListener('click', ()=>{ ui.view==='lists' ? $('#btn-new-list').click() : openSearch(); });

document.addEventListener('keydown', e => {
  if(e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
  if($$('.overlay.open').length) return; // Escape est géré ailleurs
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if(k==='a' || k==='n'){ e.preventDefault(); openSearch(); }
  else if(k==='/'){ e.preventDefault(); selectView('library'); $('#lib-q').focus(); }
  else if(k==='r'){ const b = lastReadingBook(); if(b){ e.preventDefault(); openDetail(b.id); } }
  else if(k>='1' && k<='6'){ const btns=$$('#nav button'); if(btns[+k-1]){ e.preventDefault(); selectView(btns[+k-1].dataset.view); } }
});

/* =============== Amis (Tome Social) =============== */
// API servie par la même origine (Worker Tome-Social + assets statiques) : chemin relatif.
// Exception : launcher de dev `tome` (port 8791) sans API → Worker séparé sur 8787
// (`npx wrangler dev` dans Tome-Social sert app + API sur 8787, même origine).
const API_BASE = (location.port==='8791') ? 'http://localhost:8787' : '';
const SOC_TOKEN = 'tome-social-token';
const social = { me:null, tab:'feed', view:null, profile:null, sessionError:'' };
function socToken(){ try{ return localStorage.getItem(SOC_TOKEN)||''; }catch(_){ return ''; } }
async function api(path, opts={}){
  const headers = Object.assign({}, opts.headers);
  const tk = socToken();
  if(tk) headers['Authorization'] = 'Bearer '+tk;
  if(opts.body){ headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  let res;
  try{ res = await fetch(API_BASE+path, {...opts, headers}); }
  catch(e){ throw new Error('offline'); }
  let data = {};
  try{ data = await res.json(); }catch(_){}
  if(res.status===401 && social.me){ // session expirée en cours d'usage → retour propre à l'écran de connexion
    try{ localStorage.removeItem(SOC_TOKEN); }catch(_){}
    social.me=null; social.view=null;
    if(ui.view==='friends') renderFriends();
  }
  if(!res.ok){ const e = new Error(data.error || ('Erreur '+res.status)); e.status = res.status; throw e; }
  return data;
}
const initials = s => (String(s||'?').trim()[0]||'?').toUpperCase();
// clé stable d'un livre côté social — DOIT rester identique entre la synchro (shareableBooks)
// et les lectures croisées (« chez tes amis »), sinon les correspondances se perdent
function shelfKey(b){ return (b.title+'|'+((b.authors||[])[0]||'')+'|'+(b.volume??'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,''); }
// sous-ensemble partageable de la bibliothèque
// Miroir client de cleanSharedCover (worker) : sert uniquement à prévenir l'utilisateur ;
// le serveur reste seul juge de ce qu'il accepte.
const SHAREABLE_COVER = /^https:\/\/(covers\.openlibrary\.org\/b\/(id|isbn|olid)\/[A-Za-z0-9]+-[SML]\.jpg|books\.google(usercontent)?\.com\/books\/)/;
function shareableBooks(){
  return state.books.map(b=>{
    const key = shelfKey(b);
    const lastRead = (b.readings||[]).map(r=>r.date).sort().pop() || '';
    return {
      key, title:fullTitle(b), authors:authorsStr(b), type:b.type, series:b.series||'', volume:b.volume,
      cover:b.cover||'', rating:b.rating, review:b.review||'', status:b.status, readDate:lastRead,
    };
  }).filter(b=>b.status==='read' || b.rating || b.readDate); // on ne partage pas la pile « à lire » vierge
}
function setFriendsBadge(n){
  const b = $('#nav-friends-badge'); if(!b) return;
  if(n>0){ b.textContent = n>9?'9+':String(n); b.hidden = false; } else { b.hidden = true; }
}
// le badge de l'onglet Amis = demandes reçues + notifications non lues (tout ce qui est « nouveau »)
function refreshSocBadge(){ setFriendsBadge((social.pendingRequests||0) + (social.unreadNotifs||0)); }
async function socRefresh(){
  if(!socToken()){ social.me=null; social.sessionError=''; social.pendingRequests=0; social.unreadNotifs=0; setFriendsBadge(0); return; }
  try{ const d = await api('/api/me');
       if(social.todayFeedUser && social.todayFeedUser!==d.user.id){ social.todayFeed=null; social.todayFeedAt=0; social.todayFeedError=''; }
       social.me = d.user; social.todayFeedUser=d.user.id; social.sessionError=''; social.tosOutdated = !!d.tosOutdated;
       social.hasRecovery = !!d.hasRecovery;
       social.publicProfile = !!d.publicProfile;
       social.pendingRequests = d.pendingRequests||0; social.unreadNotifs = d.unreadNotifs||0; refreshSocBadge();
       if((social.tosOutdated || social.unreadNotifs) && ui.view==='friends') renderFriends();
       if(ui.view==='today') renderToday(); }
  catch(e){ social.sessionError=e.message; if(/401|Non authentifié/.test(e.message)){ try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} social.me=null; social.sessionError=''; social.todayFeed=null; social.todayFeedAt=0; social.todayFeedUser=''; setFriendsBadge(0); } if(ui.view==='today') renderTodaySocial(); }
}

/* =============== Bibliothèque sur le compte (sauvegarde serveur façon Letterboxd) =============== */
// Le local reste la copie de travail (rapide, hors-ligne) ; le serveur est la source de vérité
// synchronisée entre appareils. Concurrence optimiste (rev) : jamais d'écrasement silencieux.
let _libPushTimer = 0, _libPushing = false, _libDirty = false, _libRetryMs = 2000;
const LIB_STATUS = { saving:'Sauvegarde…', saved:'Enregistré', offline:'Hors ligne — sera sauvegardé au retour', error:'Erreur de sauvegarde', conflict:'Fusionné depuis un autre appareil' };
function setLibStatus(s){ social.libStatus = s; const el = $('#lib-status'); if(el){ el.dataset.s = s; el.title = LIB_STATUS[s]||''; el.hidden = !s || s==='saved'; } }
// mute state EN PLACE (const) à partir de données brutes (normalisées + sanitizées)
function replaceState(raw){ const n = normalizeData(raw||{}); for(const k of Object.keys(state)) delete state[k]; Object.assign(state, n); invalidateCache(); }
// horodate/suffixe pour ne pas écraser une sauvegarde de secours précédente
function backupLocal(suffix){ try{ localStorage.setItem(LS_KEY+suffix, localStorage.getItem(LS_KEY)||''); }catch(_){ } }
// rattache la biblio locale au compte courant + à une révision serveur (persisté → survit au reload)
function libTag(rev){ state.meta = state.meta || {}; if(social.me) state.meta.ownerId = social.me.id; if(rev!=null){ state.meta.libRev = rev; social.libRev = rev; } }
function libPersist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(_){ } }
function scheduleLibPush(delay=1400){
  if(!social.me || social.tosOutdated) return;
  _libDirty = true; clearTimeout(_libPushTimer); _libPushTimer = 0;
  if(!navigator.onLine){ setLibStatus('offline'); return; }
  _libPushTimer = setTimeout(()=>{ _libPushTimer=0; pushLibrary(); }, delay);
  scheduleShelfPush();
}
async function pushLibrary(opts){
  if(!social.me || social.tosOutdated) return;
  if(_libPushing){ _libDirty = true; return; }               // une seule requête à la fois
  _libPushing = true; _libDirty = false; clearTimeout(_libPushTimer); setLibStatus('saving');
  try{
    const res = await fetch(API_BASE+'/api/library', { method:'POST', keepalive: !!(opts&&opts.keepalive),
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+socToken() },
      body: JSON.stringify({ data: JSON.stringify(state), baseRev: social.libRev||0 }) });
    if(res.status===409){                                     // un autre appareil a écrit entre-temps
      const d = await res.json();
      backupLocal('-conflit');
      const merged = mergeLibraries(state, JSON.parse(d.data));
      const conflicts = merged.meta.mergeConflicts||0;
      replaceState(merged); state.meta.mergeConflicts=0;
      libTag(d.rev); libPersist(); scheduleRender();
      setLibStatus('conflict');
      toast(conflicts ? `${conflicts} conflit${conflicts>1?'s':''} conservé${conflicts>1?'s':''} en double (tag « conflit-sync »)` : 'Bibliothèque fusionnée avec un autre appareil ✓');
      scheduleLibPush();                                      // re-pousse la fusion
    } else if(res.ok){ const d = await res.json(); _libRetryMs=2000; libTag(d.rev); libPersist(); setLibStatus('saved'); }
    else if(res.status===401){ social.me=null; try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} setLibStatus(''); }
    else if(res.status===428){ social.tosOutdated=true; setLibStatus(''); if(ui.view==='friends') renderFriends(); }
    else if(res.status===429 || res.status>=500){ setLibStatus('error'); _libDirty=true; _libRetryMs=Math.min(_libRetryMs*2,120000); }
    else { setLibStatus('error'); }
  }catch(e){ setLibStatus('offline'); _libDirty = true; _libRetryMs=Math.min(_libRetryMs*2,120000); }
  finally{
    _libPushing = false;
    if(_libDirty && navigator.onLine && !_libPushTimer && social.me && !social.tosOutdated) scheduleLibPush(_libRetryMs);
  }
}
// Adopte la bibliothèque du serveur (cas : appareil vierge, ou biblio d'un AUTRE compte à remplacer).
function adoptServerLibrary(d){
  if(!d || !d.data) return;
  backupLocal('-preacct');
  try{ replaceState(JSON.parse(d.data)); libTag(d.rev); libPersist(); scheduleRender(); }
  catch(e){ setLibStatus('error'); }
}
// Fusion SANS perte : union des livres (id + clé titre|auteur|tome), listes, objectifs, collections, séries.
function libMergeKey(b){ return (String(b.title||'').toLowerCase()+'|'+((b.authors||[])[0]||'').toLowerCase()+'|'+(b.volume??'')).replace(/[^a-z0-9à-ÿ]/g,''); }
function mergeLibraries(localSt, serverRaw){
  const out = normalizeData(serverRaw);
  const ids = new Set(out.books.map(b=>b.id)), keys = new Set(out.books.map(libMergeKey));
  const booksById = new Map(out.books.map(b=>[b.id,b])), booksByKey = new Map(out.books.map(b=>[libMergeKey(b),b]));
  const localIdMap = new Map();
  let conflicts = 0;
  const comparable = b => {
    const x = normalizeBook(b);
    delete x.id; delete x.addedAt;
    return JSON.stringify(x);
  };
  for(const b of (localSt.books||[])){
    if((b.tags||[]).includes('exemple')) continue;                 // ne pas réinjecter la démo
    const key=libMergeKey(b), existing=booksById.get(b.id)||booksByKey.get(key);
    if(existing){
      if(comparable(b)===comparable(existing)){
        localIdMap.set(b.id, existing.id);
        continue;
      }
      // Sans historique champ par champ, choisir silencieusement un côté détruirait l'autre version.
      // On conserve donc les DEUX livres : la copie locale est clairement marquée et reçoit un nouvel
      // id uniquement en cas de collision. L'utilisateur peut ensuite réconcilier les versions.
      const localCopy = normalizeBook(b);
      if(ids.has(localCopy.id)) localCopy.id = uid();
      localCopy.tags = [...new Set([...(localCopy.tags||[]), 'conflit-sync'])].slice(0,20);
      out.books.push(localCopy); ids.add(localCopy.id); keys.add(libMergeKey(localCopy));
      booksById.set(localCopy.id, localCopy); localIdMap.set(b.id, localCopy.id); conflicts++;
      continue;
    }
    const nb = normalizeBook(b); out.books.push(nb); ids.add(nb.id); keys.add(libMergeKey(nb)); booksById.set(nb.id,nb); booksByKey.set(libMergeKey(nb),nb);
    localIdMap.set(b.id, nb.id);
  }
  const byId = new Map(out.lists.map(l=>[l.id,l]));
  for(const l of (localSt.lists||[])){
    const mappedIds = (l.bookIds||[]).map(id=>localIdMap.get(id)||id);
    if(byId.has(l.id)){ const t=byId.get(l.id); t.bookIds=[...new Set([...t.bookIds, ...mappedIds])]; }
    else out.lists.push({...l, bookIds:mappedIds});
  }
  for(const [y,v] of Object.entries(localSt.goals||{})) out.goals[y] = Math.max(out.goals[y]||0, +v||0);
  out.series = Object.assign({}, localSt.series||{}, out.series);
  // collections intelligentes : union par id (garder les locales absentes du serveur)
  const scIds = new Set((out.smartCollections||[]).map(c=>c.id));
  for(const c of (localSt.smartCollections||[])) if(!scIds.has(c.id)){ out.smartCollections.push(c); scIds.add(c.id); }
  // compteur d'export : garder la date la plus récente
  if(localSt.meta && localSt.meta.lastExport && (!out.meta.lastExport || localSt.meta.lastExport > out.meta.lastExport)) out.meta.lastExport = localSt.meta.lastExport;
  out.meta.mergeConflicts = conflicts;
  return out;
}
// À la connexion : réconcilie la biblio locale avec celle du compte, SANS perte ni fuite entre comptes.
async function syncLibraryOnLogin(){
  if(!social.me || social.tosOutdated) return;
  const myId = social.me.id;
  const localOwner = (state.meta && state.meta.ownerId) || '';
  const localRev = (state.meta && +state.meta.libRev) || 0;
  const localMine = !localOwner || localOwner===myId;              // anonyme (jamais rattachée) ou à moi
  const localHasReal = (state.books||[]).some(b=>!(b.tags||[]).includes('exemple'));
  let d;
  try{ d = await api('/api/library'); }
  catch(e){ setLibStatus('offline'); return; }                    // hors-ligne : on garde le local
  if(!localMine){
    // la biblio locale appartient à QUELQU'UN D'AUTRE (appareil partagé) → ne JAMAIS la mêler à ce compte
    backupLocal('-autre');
    if(d.exists) adoptServerLibrary(d);
    else { replaceState({}); libTag(0); libPersist(); scheduleRender(); }
    return;
  }
  if(!d.exists){
    // compte sans biblio → migrer la biblio locale (à moi/anonyme)
    libTag(0); await pushLibrary();
    if(localHasReal) toast('Bibliothèque enregistrée sur ton compte ✓');
    return;
  }
  if(localRev === d.rev){
    // le local est basé sur la version serveur courante → il peut porter des édits non poussés → LE LOCAL GAGNE
    libTag(d.rev); await pushLibrary();
    return;
  }
  // divergence (autre appareil a avancé) ou 1re fois sur ce compte → FUSION sans perte + secours
  backupLocal('-preacct');
  const merged = mergeLibraries(state, JSON.parse(d.data));
  const conflicts = merged.meta.mergeConflicts||0;
  replaceState(merged); state.meta.mergeConflicts=0;
  libTag(d.rev); libPersist(); scheduleRender();
  await pushLibrary();
  if(conflicts) toast(`${conflicts} conflit${conflicts>1?'s':''} conservé${conflicts>1?'s':''} en double (tag « conflit-sync »)`);
  else if(localHasReal) toast('Bibliothèques synchronisées ✓');
}
// Flush best-effort quand l'onglet se ferme/masque : pousse une sauvegarde en attente (keepalive
// survit à la fermeture) — évite de perdre une modif faite juste avant de quitter.
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && _libDirty && social.me && !_libPushing) pushLibrary({keepalive:true}); });
window.addEventListener('pagehide', ()=>{ if(_libDirty && social.me && !_libPushing) pushLibrary({keepalive:true}); });

/* ---- Étagère partagée : synchro AUTOMATIQUE ----
   Avant, le profil visible des amis n'existait qu'après un clic manuel dans « Mon partage » — un
   nouvel inscrit avait donc un profil vide. Désormais l'étagère suit la bibliothèque, en respectant
   le mode de partage : « Rien » = jamais rien envoyé ; « Notes seules » = critiques retirées CÔTÉ
   CLIENT. Débounce long + empreinte persistée : on n'appelle le serveur que si le contenu partagé a
   réellement changé (limite serveur : 40 synchros/h). Rattrapage à la connexion et au démarrage. */
const SHELF_TAG_KEY = 'tome-shelf-tag';
let _shelfTimer = 0, _shelfPushing = false, _shelfDirty = false, _shelfRetryMs = 5000;
function shelfPayload(mode){ const books = shareableBooks(); return mode==='ratings' ? books.map(b=>({...b, review:''})) : books; }
function shelfHash(s){ let h = 5381; for(let i=0;i<s.length;i++) h = ((h<<5)+h+s.charCodeAt(i))>>>0; return h.toString(36); }
// l'empreinte inclut l'id du compte : sur un appareil partagé, changer de compte force une resynchro
function shelfTag(mode, payload){ return (social.me?social.me.id:'')+':'+mode+':'+payload.length+':'+shelfHash(JSON.stringify(payload)); }
function rememberShelfTag(tag){ try{ localStorage.setItem(SHELF_TAG_KEY, tag); }catch(_){ } }
function scheduleShelfPush(delay=25000){
  if(!social.me || social.tosOutdated || (social.me.shareMode||'all')==='none') return;
  _shelfDirty = true; clearTimeout(_shelfTimer); _shelfTimer=0;
  if(!navigator.onLine) return;
  _shelfTimer = setTimeout(()=>{ _shelfTimer=0; pushShelf(); }, delay);
}
async function pushShelf(){
  if(!social.me || social.tosOutdated) return;
  if(_shelfPushing){ _shelfDirty = true; return; }
  const mode = social.me.shareMode||'all'; if(mode==='none') return;
  const payload = shelfPayload(mode); const tag = shelfTag(mode, payload);
  let prev = ''; try{ prev = localStorage.getItem(SHELF_TAG_KEY)||''; }catch(_){ }
  if(tag===prev){ _shelfDirty = false; return; }
  _shelfPushing = true; _shelfDirty = false;
  try{ await api('/api/sync', {method:'POST', body:{shareMode:mode, books:payload}}); rememberShelfTag(tag); _shelfRetryMs=5000; }
  catch(e){
    _shelfDirty=true;
    if(e.message!=='offline' && e.status && e.status<500 && e.status!==429) _shelfDirty=false;
    else _shelfRetryMs=Math.min(_shelfRetryMs*2,120000);
  }
  finally{ _shelfPushing = false; if(_shelfDirty && navigator.onLine && !_shelfTimer) scheduleShelfPush(_shelfRetryMs); }
}
window.addEventListener('online', ()=>{
  if(_libDirty) scheduleLibPush(0);
  if(_shelfDirty) scheduleShelfPush(0);
});
function renderFriends(){
  const box = $('#friends-body');
  if(!social.me){ renderAuth(box); return; }
  if(social.invite) processInvite(); // invitation en attente traitée dès qu'on est connecté
  if(social.view==='profile' && social.profile){ renderProfile(box, social.profile); return; }
  box.innerHTML = `
    ${social.tosOutdated ? `<div class="invite-banner" id="tos-banner">📄 Les mentions légales ont été mises à jour : ta bibliothèque est désormais enregistrée sur ton compte, pour la retrouver sur tous tes appareils (privée, exportable et supprimable à tout moment).
      <a data-legal-view style="color:var(--green);cursor:pointer;text-decoration:underline">Les lire</a>
      <button class="btn small primary" id="tos-accept" style="margin-left:8px">J'accepte</button></div>` : ''}
    <div class="me-bar">
      <div class="avatar">${esc(initials(social.me.displayName))}</div>
      <div><b>${esc(social.me.displayName)}</b><div class="muted">@${esc(social.me.username)}</div></div>
      <span class="spacer"></span>
      <button class="btn small" id="soc-logout">Se déconnecter</button>
    </div>
    <div class="friends-sub">
      <button data-tab="feed" class="${social.tab==='feed'?'on':''}">Fil</button>
      <button data-tab="friends" class="${social.tab==='friends'?'on':''}">Amis</button>
      <button data-tab="notifs" class="${social.tab==='notifs'?'on':''}" style="position:relative">🔔${social.unreadNotifs?`<span class="sub-badge">${social.unreadNotifs>9?'9+':social.unreadNotifs}</span>`:''}</button>
      <button data-tab="me" class="${social.tab==='me'?'on':''}">Partage</button>
      <button data-tab="account" class="${social.tab==='account'?'on':''}">Compte</button>
    </div>
    <div id="soc-tab"></div>`;
  const tosA = $('#tos-accept');
  if(tosA) tosA.addEventListener('click', async ()=>{
    if(tosA.disabled) return; tosA.disabled = true;
    try{
      await api('/api/account/accept-tos', {method:'POST', body:{}});
      social.tosOutdated = false; toast('Merci ✓'); const bn=$('#tos-banner'); if(bn) bn.remove();
      await syncLibraryOnLogin(); await pushShelf();
    }
    catch(e){ tosA.disabled = false; toast(e.message==='offline'?'Serveur injoignable':e.message); }
  });
  const tosL = box.querySelector('[data-legal-view]');
  if(tosL) tosL.addEventListener('click', ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}));
  if(social.tab==='feed') renderFeed();
  else if(social.tab==='friends') renderFriendsList();
  else if(social.tab==='notifs') renderNotifications();
  else if(social.tab==='account') renderAccount();
  else renderMyShare();
}
async function renderNotifications(){
  const el = $('#soc-tab'); el.innerHTML = `<p class="friends-empty">Chargement…</p>`;
  try{
    const d = await api('/api/notifications');
    // marquer lu dès l'ouverture (efface le compteur)
    if(social.unreadNotifs){ api('/api/notifications/read', {method:'POST', body:{}}).catch(()=>{}); social.unreadNotifs = 0; refreshSocBadge(); const sb=$('#friends-body .sub-badge'); if(sb) sb.remove(); }
    if(!d.notifications.length){ el.innerHTML = `<p class="friends-empty">Aucune notification pour l'instant. Ajoute des amis et partage tes lectures !</p>`; return; }
    // résout le titre d'un livre à partir de sa clé (dans MA bibliothèque locale)
    const byKey = new Map(state.books.map(b=>[shelfKey(b), b]));
    const verb = { friend_request:'t\'a envoyé une demande d\'ami', friend_accept:'a accepté ta demande d\'ami',
                   reaction:'a aimé ta lecture', comment:'a commenté ta lecture' };
    el.innerHTML = d.notifications.map(n=>{
      const b = n.bookKey ? byKey.get(n.bookKey) : null;
      const book = b ? ` <b>${esc(fullTitle(b))}</b>` : '';
      const ic = { friend_request:'👋', friend_accept:'🤝', reaction:'♥', comment:'💬' }[n.type] || '🔔';
      return `<div class="notif${n.read?'':' unread'}" ${b?`data-profile-book="${esc(b.id)}"`:''}>
        <div class="avatar sm">${esc(initials(n.displayName))}</div>
        <div class="notif-body"><span class="notif-ic">${ic}</span> <b>${esc(n.displayName)}</b> ${verb[n.type]||''}${book}
          <span class="notif-when">${notifWhen(n.at)}</span></div>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML = `<p class="friends-empty">${e.message==='offline'?'Serveur injoignable.':esc(e.message)}</p>`; }
}
function notifWhen(ts){
  const s = Math.max(0, (Date.now()-ts)/1000);
  if(s<60) return 'à l\'instant'; if(s<3600) return 'il y a '+Math.floor(s/60)+' min';
  if(s<86400) return 'il y a '+Math.floor(s/3600)+' h';
  return 'il y a '+Math.floor(s/86400)+' j';
}
async function renderAccount(){
  const el = $('#soc-tab');
  el.innerHTML = `<div class="acct">
    <h4>Profil</h4>
    <input id="acc-dn" maxlength="40" value="${esc(social.me.displayName)}" placeholder="Nom affiché" aria-label="Nom affiché">
    <textarea id="acc-bio" rows="2" maxlength="300" placeholder="Bio (visible par tes amis, optionnelle)">${esc(social.me.bio||'')}</textarea>
    <button class="btn primary" id="acc-save">Enregistrer le profil</button>
    <h4>Mot de passe</h4>
    <input id="acc-cur" type="password" maxlength="256" autocomplete="current-password" placeholder="Mot de passe actuel">
    <input id="acc-new" type="password" maxlength="256" autocomplete="new-password" placeholder="Nouveau (8 caractères min.)">
    <button class="btn" id="acc-pw">Changer le mot de passe</button>
    <h4>Ma page publique</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Une page lisible par tous, à mettre dans une bio Instagram ou TikTok. Elle n'affiche que ce que tu partages déjà (Amis → Mon partage) — <b>jamais</b> ta bibliothèque privée. Désactivée par défaut.</p>
    <div class="data-actions">
      <button class="btn ${social.publicProfile?'':'primary'}" id="acc-pub">${social.publicProfile?'Rendre ma page privée':'Publier ma page'}</button>
      ${social.publicProfile?`<button class="btn" id="acc-pub-copy">🔗 Copier le lien</button><a class="btn" id="acc-pub-open" href="/@${esc(social.me.username)}" target="_blank" rel="noopener">Voir ma page ↗</a>`:''}
    </div>
    <h4>Code de secours</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">La seule façon de récupérer ton compte si tu oublies ton mot de passe (aucun email n'est collecté). ${social.hasRecovery?'Un code est actif — le régénérer invalide l\'ancien.':'<b>Aucun code actif</b> — génère-le maintenant.'}</p>
    <input id="acc-rec" type="password" maxlength="256" autocomplete="current-password" placeholder="Mot de passe actuel">
    <button class="btn" id="acc-rec-gen">🔑 ${social.hasRecovery?'Régénérer mon code':'Générer mon code'}</button>
    <h4>Utilisateurs bloqués</h4>
    <div id="acc-blocks"><p class="friends-empty" style="padding:8px 0">Chargement…</p></div>
    <h4>Mes données</h4>
    <div class="data-actions">
      <button class="btn" id="acc-export">⬇ Exporter mes données (JSON)</button>
      <button class="btn" id="acc-logoutall">Se déconnecter partout</button>
      <button class="btn" id="acc-legal">📄 Mentions légales</button>
      <button class="btn" id="acc-pledge">💚 Toujours gratuit</button>
    </div>
    <h4 style="color:var(--red)">Zone danger</h4>
    <div class="danger-zone">
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px">La suppression est <b>définitive</b> : ton profil, tes amis et ta bibliothèque partagée seront effacés du serveur. Ta bibliothèque locale, elle, reste sur cet appareil.</p>
      <button class="btn danger" id="acc-delete">Supprimer définitivement mon compte</button>
    </div>
  </div>`;
  $('#acc-save').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/profile', {method:'POST', body:{displayName:$('#acc-dn').value, bio:$('#acc-bio').value}}); social.me=d.user; toast('Profil mis à jour ✓'); renderFriends(); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); b.disabled=false; } };
  $('#acc-pw').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ await api('/api/account/password', {method:'POST', body:{currentPassword:$('#acc-cur').value, newPassword:$('#acc-new').value}}); $('#acc-cur').value=$('#acc-new').value=''; toast('Mot de passe changé — autres appareils déconnectés ✓'); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); }
    finally{ b.disabled=false; } };
  $('#acc-pub').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/public-profile', {method:'POST', body:{public: !social.publicProfile}});
      social.publicProfile = d.public;
      toast(d.public ? 'Ta page est en ligne ✓' : 'Ta page redevient privée');
      renderAccount(); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); b.disabled=false; } };
  const pubCopy = $('#acc-pub-copy');
  if(pubCopy) pubCopy.onclick = async ()=>{
    const url = location.origin + '/@' + social.me.username;
    try{ await navigator.clipboard.writeText(url); toast('Lien copié ✓'); }
    catch(_){ openDialog({title:'Ma page publique', message:url, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); }
  };
  $('#acc-rec-gen').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/recovery-code', {method:'POST', body:{password:$('#acc-rec').value}});
      $('#acc-rec').value=''; social.hasRecovery = true;
      await showRecoveryCode(d.recoveryCode); renderAccount(); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); b.disabled=false; } };
  $('#acc-export').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/export'); const full={...d, localLibrary:state.books};
      const blob=new Blob([JSON.stringify(full,null,2)],{type:'application/json'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download='tome-mes-donnees-'+social.me.username+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      toast('Données exportées ✓'); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); }
    finally{ b.disabled=false; } };
  $('#acc-legal').onclick = ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]});
  $('#acc-pledge').onclick = showPledge;
  $('#acc-logoutall').onclick = async ()=>{
    if(!await uiConfirm({title:'Se déconnecter partout ?', message:'Toutes tes sessions seront fermées, y compris ici.', okLabel:'Déconnecter', danger:true})) return;
    let ok = true;
    try{ await api('/api/account/logout-all', {method:'POST'}); }catch(_){ ok = false; }
    try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} social.me=null; social.view=null; setFriendsBadge(0); renderFriends();
    toast(ok ? 'Déconnecté de tous tes appareils ✓' : 'Déconnecté ici — les autres appareils n\'ont pas pu être joints'); };
  $('#acc-delete').onclick = async ()=>{
    if(!await uiConfirm({title:'Supprimer ton compte ?', message:'Action IRRÉVERSIBLE. Ton profil, tes amis et ta bibliothèque partagée seront effacés du serveur. Ta bibliothèque locale reste sur cet appareil.', okLabel:'Continuer', danger:true})) return;
    const pw = await uiPrompt({title:'Confirme avec ton mot de passe', message:'Tape ton mot de passe pour supprimer définitivement le compte.', type:'password', okLabel:'Supprimer'});
    if(pw==null) return;
    try{ await api('/api/account/delete', {method:'POST', body:{password:pw}});
      try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} social.me=null; social.view=null; setFriendsBadge(0); renderFriends(); toast('Compte supprimé.'); }
    catch(err){ toast(err.message==='offline'?'Serveur injoignable':err.message); } };
  // liste des bloqués
  try{
    const d = await api('/api/blocks');
    $('#acc-blocks').innerHTML = d.blocked.length
      ? d.blocked.map(u=>`<div class="frow"><div class="avatar">${esc(initials(u.displayName))}</div><div class="fi"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div><button class="btn small" data-unblock="${esc(u.username)}">Débloquer</button></div>`).join('')
      : `<p class="friends-empty" style="padding:8px 0">Personne de bloqué.</p>`;
    $('#acc-blocks').querySelectorAll('[data-unblock]').forEach(btn=>btn.onclick=async ()=>{ try{ await api('/api/unblock',{method:'POST',body:{username:btn.dataset.unblock}}); renderAccount(); }catch(e){ toast(e.message==='offline'?'Serveur injoignable':e.message); } });
  }catch(_){ $('#acc-blocks').innerHTML = `<p class="friends-empty" style="padding:8px 0">—</p>`; }
}
// ---- Code de secours : seule voie de récupération (aucun email collecté) ----
// Reste affiché jusqu'à confirmation explicite ; copie et téléchargement proposés.
async function showRecoveryCode(code, intro){
  const msg = `${intro||''}${intro?'\n\n':''}${code}\n\nC'est la SEULE façon de récupérer ton compte si tu oublies ton mot de passe — aucun email n'est collecté. Copie-le ou télécharge-le, puis range-le en lieu sûr : il ne sera plus jamais affiché.`;
  for(;;){
    // « C'est noté » est la seule sortie : Échap/clic-fond renvoient null → on réaffiche
    const v = await openDialog({ title:'🔑 Ton code de secours', message: msg, actions:[
      {label:'📋 Copier', value:'copy'},
      {label:'⬇ Télécharger', value:'dl'},
      {label:'C\'est noté ✓', value:'ok', variant:'primary', default:true},
    ]});
    if(v==='ok') return;
    if(v==='copy'){ try{ await navigator.clipboard.writeText(code); toast('Code copié ✓'); }catch(_){ toast('Copie impossible — note-le à la main'); } }
    else if(v==='dl'){
      const txt = `Code de secours Tome\nPseudo : ${social.me?social.me.username:''}\n\n${code}\n\nCe code permet de récupérer ton compte en cas d'oubli du mot de passe.\nGarde ce fichier en lieu sûr — l'utiliser en génère un nouveau.\n${SITE_URL}\n`;
      const blob = new Blob([txt], {type:'text/plain'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tome-code-de-secours.txt';
      a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000); toast('Fichier téléchargé ✓');
    }
    // v === null (Échap / clic-fond) : on boucle → le dialogue se réaffiche
  }
}
// ---- Invitation par lien : #invite/<pseudo> ----
// Le lien ne fait que pré-remplir une demande d'ami confirmée par l'utilisateur ;
// aucun nouveau point d'entrée serveur (la demande passe par /api/friends/request).
async function shareInvite(){
  if(!social.me) return;
  const url = location.origin + location.pathname + '#invite/' + encodeURIComponent(social.me.username);
  if(navigator.share){
    try{ await navigator.share({ title:'Tome', text:'Rejoins-moi sur Tome pour partager nos lectures !', url }); return; }
    catch(e){ if(e && e.name==='AbortError') return; /* sinon : repli presse-papiers */ }
  }
  try{ await navigator.clipboard.writeText(url); toast('Lien d\'invitation copié ✓ — envoie-le à un ami'); }
  catch(_){ openDialog({ title:'Mon lien d\'invitation', message:url, actions:[{label:'Fermer', value:null, cancel:true, default:true}] }); }
}
async function processInvite(){
  const uname = social.invite; social.invite = null;
  if(!social.me || !uname) return;
  if(uname === social.me.username){ toast('C\'est ton propre lien d\'invitation 😄'); return; }
  const ok = await uiConfirm({ title:'Invitation', message:`Envoyer une demande d'ami à @${uname} ?`, okLabel:'Envoyer la demande' });
  if(!ok) return;
  try{
    const r = await api('/api/friends/request', {method:'POST', body:{username:uname}});
    toast(r.status==='accepted' ? 'Vous êtes maintenant amis ✓' : 'Demande envoyée ✓');
    if(social.tab==='friends') loadFriendLists();
  }catch(e){ toast(e.message==='offline' ? 'Serveur injoignable' : e.message); }
}
function renderAuth(box, mode='login', errMsg=''){
  box.innerHTML = `
    ${social.invite ? `<div class="invite-banner">💌 <b>@${esc(social.invite)}</b> t'invite sur Tome — connecte-toi ou crée un compte pour l'ajouter en ami.</div>` : ''}
    <div class="auth-card">
      <h3>${mode==='login'?'Se connecter':'Créer un compte'}</h3>
      <p class="sub">Retrouve tes amis, compare vos lectures et suis leurs coups de cœur. Ta bibliothèque privée reste sur ton appareil ; seul ce que tu choisis de partager est synchronisé.</p>
      <label for="soc-user">Pseudo</label>
      <input id="soc-user" autocomplete="username" placeholder="ex : lucas_bd">
      ${mode==='signup'?`<label for="soc-name">Nom affiché</label><input id="soc-name" placeholder="ex : Lucas">`:''}
      <label for="soc-pass">Mot de passe</label>
      <input id="soc-pass" type="password" maxlength="256" autocomplete="${mode==='login'?'current-password':'new-password'}" placeholder="8 caractères minimum">
      ${mode==='signup'?`<label class="consent-row" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--text);display:flex;gap:8px;align-items:flex-start;margin-top:12px">
        <input type="checkbox" id="soc-consent" style="width:auto;margin-top:3px">
        <span>J'accepte les <a data-legal style="color:var(--green);cursor:pointer">mentions légales et la politique de confidentialité</a>.</span></label>`:''}
      <div class="auth-err">${esc(errMsg)}</div>
      <button class="btn primary" id="soc-submit" style="width:100%; justify-content:center">${mode==='login'?'Connexion':'Créer mon compte'}</button>
      <div class="switch">${mode==='login'
        ? `Pas encore de compte ? <a data-auth="signup">Créer un compte</a><br><a data-auth="recover" style="font-size:12.5px">Mot de passe oublié ?</a>`
        : `Déjà inscrit ? <a data-auth="login">Se connecter</a>`}</div>
    </div>`;
  // affiche l'erreur SANS re-render (préserve pseudo/mot de passe/nom/consentement déjà saisis)
  const showErr = m => { const e=$('#friends-body .auth-err'); if(e) e.textContent=m; const s=$('#soc-submit'); if(s){ s.disabled=false; s.textContent = mode==='login'?'Connexion':'Créer mon compte'; } };
  const submit = async ()=>{
    const username = $('#soc-user').value.trim();
    const password = $('#soc-pass').value;
    const displayName = mode==='signup' ? ($('#soc-name').value.trim()||username) : '';
    if(!username || !password){ showErr('Remplis le pseudo et le mot de passe.'); return; }
    if(mode==='signup' && !$('#soc-consent').checked){ showErr('Tu dois accepter les mentions légales pour créer un compte.'); return; }
    $('#soc-submit').textContent = '…'; $('#soc-submit').disabled = true;
    try{
      const body = mode==='login' ? {username, password} : {username, password, displayName, consent:true};
      const d = await api(mode==='login'?'/api/login':'/api/signup', {method:'POST', body});
      localStorage.setItem(SOC_TOKEN, d.token); social.me = d.user; social.tosOutdated = mode!=='signup'; social.tab='feed'; social.view=null;
      try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}   // ne plus montrer la page d'accueil
      await socRefresh(); // récupère aussi tosOutdated AVANT toute sauvegarde privée
      if(!social.tosOutdated) syncLibraryOnLogin().then(()=>pushShelf());
      // le code AVANT renderFriends : sinon la confirmation d'invitation (#invite) écraserait le
      // dialogue du code (une seule modale à la fois) — l'invitation s'ouvrira après « C'est noté »
      if(d.recoveryCode) await showRecoveryCode(d.recoveryCode, 'Bienvenue sur Tome ! Avant tout, note ton code de secours :');
      renderFriends();
    }catch(e){
      showErr(e.message==='offline' ? 'Serveur injoignable — réessaie plus tard.' : e.message);
    }
  };
  $('#soc-submit').addEventListener('click', submit);
  $('#soc-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  const legal = $('#friends-body [data-legal]'); if(legal) legal.addEventListener('click', ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}));
  $$('#friends-body [data-auth]').forEach(a=>a.addEventListener('click', ()=>a.dataset.auth==='recover' ? renderRecover(box) : renderAuth(box, a.dataset.auth)));
}
// Récupération de compte par code de secours (« mot de passe oublié »)
function renderRecover(box, errMsg=''){
  box.innerHTML = `
    <div class="auth-card">
      <h3>Récupérer mon compte</h3>
      <p class="sub">Entre ton pseudo et ton code de secours (montré à la création du compte, ou régénéré depuis les réglages), puis choisis un nouveau mot de passe. Toutes tes sessions seront déconnectées et un nouveau code te sera remis.</p>
      <label for="rec-user">Pseudo</label>
      <input id="rec-user" autocomplete="username" placeholder="ex : lucas_bd">
      <label for="rec-code">Code de secours</label>
      <input id="rec-code" autocomplete="one-time-code" placeholder="TOME-XXXXX-XXXXX-XXXXX-XXXXX" style="text-transform:uppercase">
      <label for="rec-pass">Nouveau mot de passe</label>
      <input id="rec-pass" type="password" maxlength="256" autocomplete="new-password" placeholder="8 caractères minimum">
      <div class="auth-err">${esc(errMsg)}</div>
      <button class="btn primary" id="rec-submit" style="width:100%; justify-content:center">Récupérer mon compte</button>
      <div class="switch"><a data-auth="login">← Retour à la connexion</a></div>
    </div>`;
  const showErr = m => { const e=$('#friends-body .auth-err'); if(e) e.textContent=m; const s=$('#rec-submit'); if(s){ s.disabled=false; s.textContent='Récupérer mon compte'; } };
  const submit = async ()=>{
    const username = $('#rec-user').value.trim(), code = $('#rec-code').value.trim(), newPassword = $('#rec-pass').value;
    if(!username || !code || !newPassword){ showErr('Remplis les trois champs.'); return; }
    $('#rec-submit').textContent = '…'; $('#rec-submit').disabled = true;
    try{
      const d = await api('/api/recover', {method:'POST', body:{username, code, newPassword}});
      localStorage.setItem(SOC_TOKEN, d.token); social.me = d.user; social.tosOutdated = true; social.tab='feed'; social.view=null;
      await socRefresh();
      if(!social.tosOutdated) syncLibraryOnLogin().then(()=>pushShelf());
      // même ordre qu'à l'inscription : le code d'abord, l'onglet Amis (et une éventuelle invitation) ensuite
      if(d.recoveryCode) await showRecoveryCode(d.recoveryCode, 'Compte récupéré ✓ Voici ton NOUVEAU code de secours (l\'ancien ne fonctionne plus) :');
      renderFriends();
    }catch(e){ showErr(e.message==='offline' ? 'Serveur injoignable — réessaie plus tard.' : e.message); }
  };
  $('#rec-submit').addEventListener('click', submit);
  $('#rec-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  $$('#friends-body [data-auth]').forEach(a=>a.addEventListener('click', ()=>renderAuth(box, a.dataset.auth)));
}
// La promesse publique du modèle : le cœur reste gratuit, le payant (un jour) sera du confort en
// plus — jamais une reprise de l'existant. C'est un ENGAGEMENT : ne jamais l'affaiblir en douce.
const FREE_PLEDGE = `Ce qui restera toujours gratuit — la promesse de Tome.

Tome proposera peut-être un jour des options payantes (du confort, du soutien au projet). Mais le cœur de l'app est gratuit, pour toujours :

• Bibliothèque, séries et listes ILLIMITÉES — jamais de plafond de livres.
• Journal de lecture, notes, critiques, citations, ambiances, objectif annuel, streak.
• Amis, fil d'activité, réactions ♥, réponses, notifications.
• Récap annuel et cartes de partage.
• Import ET export complets — tes données t'appartiennent, tu peux partir à tout moment.
• Multi-appareils : ta bibliothèque enregistrée sur ton compte, privée.

Et trois « jamais » :
• Jamais de publicité display.
• Jamais de vente de tes données individuelles.
• Jamais de limite rétroactive : ce qui est gratuit aujourd'hui le reste.

Si des options payantes arrivent, ce sera du confort EN PLUS (statistiques avancées, personnalisation, soutien) — jamais une rançon sur ce que tu utilises déjà.`;
function showPledge(){ openDialog({title:'💚 Toujours gratuit', message:FREE_PLEDGE, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); }
const LEGAL_TEXT = `Tome Social — mentions légales et confidentialité.

Responsable de traitement : Lucas Marroig (lucas.marroig@essec.edu).
Données traitées : ton pseudo, ton nom affiché, ta bio, un mot de passe haché (jamais en clair), un code de secours haché (jamais en clair — seule voie de récupération, aucun email n'étant collecté), ta bibliothèque de lecture enregistrée sur ton compte (pour la retrouver sur tous tes appareils — livres, notes, critiques, listes, dates, résumés personnels et cartes mémoire), le sous-ensemble que tu choisis de partager avec tes amis, tes liens d'amitié, tes réactions ♥ et tes réponses sous les lectures de tes amis (horodatées, supprimables par toi à tout moment), et ton adresse IP (uniquement pour limiter les abus).
Finalité : héberger ta bibliothèque pour toi, te permettre de retrouver des amis et de partager tes lectures.
Base légale : ton consentement (recueilli à l'inscription).
Visibilité : ta bibliothèque enregistrée sur ton compte est PRIVÉE — visible de toi seul(e). Tes résumés, notes d’étude, questions et cartes mémoire ne font jamais partie du profil partagé. Seul le sous-ensemble autorisé par ton mode de partage (réglable dans Amis → Mon partage : « Tout », « Notes seules » sans tes critiques, ou « Rien ») est synchronisé automatiquement et visible de tes amis acceptés uniquement. « Rien » n'envoie jamais rien. Aucune publicité, aucun traceur, aucune revente. Chiffrement en transit (HTTPS). Hébergeur : Cloudflare.
Liens d'affiliation : les boutons « Acheter » / « Kindle » des fiches livres renvoient vers Amazon. En tant que Partenaire Amazon, ce site peut percevoir une commission sur les achats remplissant les conditions requises — sans aucun surcoût pour toi. Ces liens ne transmettent aucune donnée personnelle ; une fois sur Amazon, ce sont les conditions et cookies d'Amazon qui s'appliquent.
Conservation : sessions 30 jours ; compte et bibliothèque supprimés après 24 mois d'inactivité ; suppression immédiate possible à tout moment via « Mon compte ».
Tes droits (RGPD) : accès et rectification (Mon compte), portabilité (Exporter mes données — inclut ta bibliothèque), effacement (Supprimer mon compte efface aussi ta bibliothèque du serveur). Tu peux aussi utiliser Tome sans compte : dans ce cas ta bibliothèque reste uniquement sur ton appareil.`;
async function renderFeed(){
  const el = $('#soc-tab'); el.innerHTML = `<p class="friends-empty">Chargement…</p>`;
  try{
    const d = await api('/api/feed'); social.todayFeed=d.feed||[]; social.todayFeedAt=Date.now(); social.todayFeedUser=social.me&&social.me.id; social.todayFeedError='';
    if(!d.feed.length){ el.innerHTML = `<p class="friends-empty">Rien pour l'instant. Ajoute des amis et invite-les à partager leurs lectures.</p>`; return; }
    el.innerHTML = d.feed.map((x,fi)=>{
      const rv = String(x.review||'').trim();
      const isMe = social.me && x.uid===social.me.id; // ma propre lecture : pas d'auto-cœur, mais je vois et modère les réponses
      return `
      <div class="feed-cell">
      <div class="feed-item">
        <div class="mini">${x.cover?`<img src="${esc(x.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="ph-mini">📕</div>`}</div>
        <div class="fx">
          <div class="who">${isMe?'Toi':esc(x.display_name)} <span style="color:var(--muted);font-weight:400">${isMe?'as lu':'a lu'}</span></div>
          <div class="what">${esc(x.title)}${x.rating?` · ${starsTxt(x.rating)}`:''}</div>
          ${rv?`<div class="feed-review">« ${esc(rv.slice(0,280))}${rv.length>280?'…':''} »</div>`:''}
        </div>
        <div class="feed-side">
          <div class="feed-date">${x.read_date?esc(fmtDate(x.read_date)):''}</div>
          <div style="display:flex;gap:6px">
            ${isMe ? (x.hearts?`<span class="heart-btn on" style="cursor:default" aria-label="${heartLabel(x.hearts)}">♥<span class="hn">${x.hearts}</span></span>`:'') : `
            <button class="heart-btn${x.i_hearted?' on':''}" data-react="${esc(x.book_key)}" data-owner="${esc(x.username)}"
              aria-pressed="${x.i_hearted?'true':'false'}" title="J'aime" aria-label="${heartLabel(x.hearts)}">♥<span class="hn">${x.hearts||''}</span></button>`}
            <button class="heart-btn cmt-btn" data-thread="${esc(x.username)}" data-key="${esc(x.book_key)}"
              aria-expanded="false" aria-controls="feed-thread-${fi}" title="Réponses" aria-label="${x.comments?`Réponses — ${x.comments}`:'Répondre'}">💬<span class="hn">${x.comments||''}</span></button>
          </div>
        </div>
      </div>
      <div class="feed-thread" id="feed-thread-${fi}" hidden></div>
      </div>`;}).join('');
    // délégué, une seule fois par élément #soc-tab (le flag meurt avec le nœud)
    if(!el.dataset.feedBound){
      el.dataset.feedBound = '1';
      el.addEventListener('click', onFeedClick);
      el.addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.classList.contains('cmt-input')) sendComment(e.target); });
    }
  }catch(e){ el.innerHTML = `<p class="friends-empty">${e.message==='offline'?'Serveur injoignable.':esc(e.message)}</p>`; }
}
// le nom accessible remplace le contenu du bouton : il doit donc porter aussi le compteur
const heartLabel = n => n ? `J'aime cette lecture — ${n} j'aime` : `J'aime cette lecture`;
// Un seul écouteur délégué pour le fil : cœurs, dépliage des réponses, envoi, suppression.
function onFeedClick(e){
  if(e.target.closest('[data-react]')) return onFeedHeart(e);
  const tb = e.target.closest('[data-thread]');
  if(tb) return toggleThread(tb);
  const send = e.target.closest('.cmt-send');
  if(send) return sendComment(send.closest('.feed-thread').querySelector('.cmt-input'));
  const del = e.target.closest('[data-cmt-del]');
  if(del) return deleteComment(del);
}
// --- fil de discussion sous une entrée ---
function threadHTML(d){
  const rows = d.comments.map(c=>`
    <div class="cmt-row">
      <div class="avatar sm">${esc(initials(c.displayName))}</div>
      <div class="cmt-body"><b>${esc(c.displayName)}</b> ${esc(c.text)}
        <span class="cmt-date">${new Date(c.at).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span></div>
      ${(c.mine || d.canModerate) ? `<button class="cmt-del" data-cmt-del="${esc(c.id)}" title="Supprimer" aria-label="Supprimer ce commentaire">×</button>` : ''}
    </div>`).join('');
  return (rows || `<p class="cmt-none">Sois le premier à répondre.</p>`) + `
    <div class="cmt-compose">
      <input class="cmt-input" maxlength="500" placeholder="Répondre…" aria-label="Répondre">
      <button class="btn small primary cmt-send">Envoyer</button>
    </div>`;
}
async function loadThread(cell){
  const th = cell.querySelector('.feed-thread');
  const btn = cell.querySelector('[data-thread]');
  // un rechargement (envoi, suppression) ne doit jamais avaler un brouillon en cours de frappe
  const draft = (th.querySelector('.cmt-input')||{}).value || '';
  if(!th.querySelector('.cmt-row')) th.innerHTML = `<p class="cmt-none">Chargement…</p>`;
  try{
    const d = await api(`/api/comments?u=${encodeURIComponent(btn.dataset.thread)}&k=${encodeURIComponent(btn.dataset.key)}`);
    th.innerHTML = threadHTML(d);
    if(draft){ const i = th.querySelector('.cmt-input'); if(i) i.value = draft; }
    // le compteur de l'entrée suit le fil réel
    const cn = btn.querySelector('.hn'); cn.textContent = d.comments.length || '';
    btn.setAttribute('aria-label', d.comments.length?`Réponses — ${d.comments.length}`:'Répondre');
  }catch(err){ th.innerHTML = `<p class="cmt-none">${err.message==='offline'?'Serveur injoignable.':esc(err.message)}</p>`; }
}
function toggleThread(btn){
  const cell = btn.closest('.feed-cell');
  const th = cell.querySelector('.feed-thread');
  const open = th.hidden;
  th.hidden = !open;
  btn.setAttribute('aria-expanded', open?'true':'false');
  if(open) loadThread(cell).then(()=>{ const i = th.querySelector('.cmt-input'); if(i) i.focus(); });
}
async function sendComment(input){
  if(!input || !input.value.trim()) return;
  const cell = input.closest('.feed-cell');
  const btn = cell.querySelector('[data-thread]');
  const sendBtn = cell.querySelector('.cmt-send');
  if(sendBtn.disabled) return; sendBtn.disabled = true;
  const sent = input.value; input.value = ''; // le brouillon envoyé ne doit pas être restauré par loadThread
  try{
    await api('/api/comment', {method:'POST', body:{username:btn.dataset.thread, bookKey:btn.dataset.key, text:sent.trim()}});
    await loadThread(cell);
    const i = cell.querySelector('.cmt-input'); if(i) i.focus(); // le focus survit au re-rendu
  }catch(err){
    toast(err.message==='offline'?'Serveur injoignable':err.message);
    const i = cell.querySelector('.cmt-input'); if(i){ i.value = sent; i.focus(); } // rien de perdu
    sendBtn.disabled = false;
  }
}
async function deleteComment(del){
  if(del.disabled) return; del.disabled = true;
  const cell = del.closest('.feed-cell');
  try{
    await api('/api/comment/delete', {method:'POST', body:{id:del.dataset.cmtDel}});
    await loadThread(cell);
    const i = cell.querySelector('.cmt-input'); if(i) i.focus(); // le focus ne retombe pas sur <body>
  }
  catch(err){ del.disabled = false; toast(err.message==='offline'?'Serveur injoignable':err.message); }
}
// Bascule ♥ optimiste : l'UI répond tout de suite, puis se cale sur la réponse serveur (ou revient en arrière).
async function onFeedHeart(e){
  const hb = e.target.closest('[data-react]'); if(!hb || hb.disabled) return;
  hb.disabled = true;
  const on = !hb.classList.contains('on');
  const cnt = hb.querySelector('.hn');
  const prev = +(cnt.textContent||0);
  const setN = n => { cnt.textContent = n || ''; hb.setAttribute('aria-label', heartLabel(n)); };
  hb.classList.toggle('on', on); hb.setAttribute('aria-pressed', on?'true':'false');
  setN(on ? prev+1 : Math.max(0, prev-1));
  try{
    const r = await api('/api/react', {method:'POST', body:{username: hb.dataset.owner, bookKey: hb.dataset.react, on}});
    setN(r.hearts);
  }catch(err){
    hb.classList.toggle('on', !on); hb.setAttribute('aria-pressed', !on?'true':'false');   // retour arrière
    setN(prev);
    toast(err.message==='offline' ? 'Serveur injoignable' : err.message);
  }finally{ hb.disabled = false; }
}
async function renderFriendsList(){
  const el = $('#soc-tab');
  el.innerHTML = `
    <div class="add-friend">
      <input id="friend-search" placeholder="Rechercher quelqu'un (pseudo ou nom)…" aria-label="Rechercher un utilisateur" autocomplete="off">
      <button class="btn" id="friend-invite" title="Partager mon lien d'invitation">🔗 Inviter</button>
    </div>
    <div id="search-res"></div>
    <div id="friend-lists"><p class="friends-empty">Chargement…</p></div>`;
  $('#friend-invite').addEventListener('click', shareInvite);
  const addUser = async (uname, btn)=>{ if(btn.disabled) return; btn.disabled = true;
    try{ const r = await api('/api/friends/request', {method:'POST', body:{username:uname}});
      toast(r.status==='accepted'?'Vous êtes maintenant amis ✓':'Demande envoyée ✓');
      doSearchUsers($('#friend-search').value); loadFriendLists(); }
    catch(e){ btn.disabled=false; toast(e.message==='offline'?'Serveur injoignable':e.message); } };
  let seq = 0, tmr = 0;
  function doSearchUsers(q){
    q = (q||'').trim(); const res = $('#search-res');
    if(q.length < 2){ res.innerHTML = ''; return; }
    const my = ++seq; clearTimeout(tmr);
    tmr = setTimeout(async ()=>{
      try{
        const d = await api('/api/search-users?q='+encodeURIComponent(q)); if(my!==seq) return;
        if(!d.users.length){ res.innerHTML = `<p class="friends-empty" style="padding:8px 0">Personne pour « ${esc(q)} ». Tu peux inviter par lien 🔗.</p>`; return; }
        res.innerHTML = `<div class="search-res-h">Résultats</div>` + d.users.map(u=>{
          const act = u.relation==='friend' ? `<span class="frel">✓ ami</span>`
            : u.relation==='sent' ? `<span class="frel">en attente</span>`
            : `<button class="btn small primary" data-add="${esc(u.username)}">${u.relation==='incoming'?'Accepter':'＋ Ajouter'}</button>`;
          return `<div class="frow"><div class="avatar">${esc(initials(u.displayName))}</div>
            <div class="fi clickable" data-profile="${esc(u.username)}"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div>
            <div class="fa">${act}</div></div>`;
        }).join('');
      }catch(e){ if(my===seq) res.innerHTML = `<p class="friends-empty" style="padding:8px 0">${e.message==='offline'?'Serveur injoignable':esc(e.message)}</p>`; }
    }, 280);
  }
  $('#friend-search').addEventListener('input', e=>doSearchUsers(e.target.value));
  $('#search-res').addEventListener('click', e=>{ const b=e.target.closest('[data-add]'); if(b) addUser(b.dataset.add, b); });
  loadFriendLists();
}
async function loadFriendLists(){
  const el = $('#friend-lists');
  try{
    const d = await api('/api/friends');
    const person = (p, actions)=>`<div class="frow"><div class="avatar">${esc(initials(p.displayName))}</div>
      <div class="fi clickable" data-profile="${esc(p.username)}"><b>${esc(p.displayName)}</b><span>@${esc(p.username)}</span></div>
      <div class="fa">${actions}</div></div>`;
    let html = '';
    if(d.incoming.length){ html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:8px 0">Demandes reçues</h4>`;
      html += d.incoming.map(p=>person(p, `<button class="btn small primary" data-accept="${esc(p.id)}">Accepter</button><button class="btn small" data-remove="${esc(p.id)}">Refuser</button>`)).join(''); }
    html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">Amis (${d.friends.length})</h4>`;
    html += d.friends.length ? d.friends.map(p=>person(p, `<button class="btn small" data-remove="${esc(p.id)}">Retirer</button>`)).join('')
      : `<p class="friends-empty">Aucun ami pour l'instant.</p>`;
    if(d.outgoing.length){ html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">Demandes envoyées</h4>`;
      html += d.outgoing.map(p=>person(p, `<span style="font-size:12px;color:var(--faint)">en attente</span><button class="btn small" data-remove="${esc(p.id)}">Annuler</button>`)).join(''); }
    el.innerHTML = html;
    social.pendingRequests = d.incoming.length; refreshSocBadge();
  }catch(e){ el.innerHTML = `<p class="friends-empty">${e.message==='offline'?'Serveur injoignable.':esc(e.message)}</p>`; }
}
async function renderMyShare(){
  const el = $('#soc-tab');
  const mode = social.me.shareMode || 'all';
  const shareable = shareableBooks();
  el.innerHTML = `
    <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">Choisis ce que tes amis peuvent voir — ton étagère se synchronise ensuite automatiquement. ${shareable.length} titre(s) partageables (lus ou notés).${(()=>{
      // le serveur n'accepte que les couvertures des catalogues de livres (une image quelconque
      // pourrait pister tes amis) : on le dit au lieu de les faire disparaître en silence
      const n = shareable.filter(b=>b.cover && !SHAREABLE_COVER.test(b.cover)).length;
      return n ? ` <span style="color:var(--faint)">${n} couverture(s) ne seront pas partagée(s) — image hors catalogue, le titre reste visible.</span>` : '';
    })()}</p>
    <div class="seg" id="share-mode" style="margin-bottom:14px">
      <button data-mode="all" class="${mode==='all'?'on':''}">Tout</button>
      <button data-mode="ratings" class="${mode==='ratings'?'on':''}">Notes seules</button>
      <button data-mode="none" class="${mode==='none'?'on':''}">Rien</button>
    </div>
    <p style="font-size:12.5px;color:var(--faint);margin-bottom:16px">« Tout » : titres, notes, critiques, dates. « Notes seules » : sans tes critiques. « Rien » : profil masqué — ton étagère partagée et les ♥ reçus sont effacés du serveur.</p>
    <button class="btn primary" id="share-sync">↻ Appliquer et synchroniser maintenant</button>
    <div id="share-status" style="font-size:13px;color:var(--muted);margin-top:12px"></div>`;
  let chosen = mode;
  $$('#share-mode button').forEach(btn=>btn.addEventListener('click', ()=>{ chosen=btn.dataset.mode; $$('#share-mode button').forEach(b=>b.classList.toggle('on', b===btn)); }));
  $('#share-sync').addEventListener('click', async (ev)=>{
    const btn = ev.currentTarget; if(btn.disabled) return; btn.disabled = true;
    $('#share-status').textContent = 'Synchronisation…';
    // le mode « notes seules » ne DOIT PAS envoyer les critiques (confidentialité garantie côté client)
    const payload = chosen==='none' ? [] : shelfPayload(chosen);
    try{
      const d = await api('/api/sync', {method:'POST', body:{shareMode:chosen, books:payload}});
      social.me.shareMode = d.shareMode;
      rememberShelfTag(shelfTag(d.shareMode, payload));   // l'auto-synchro sait que c'est à jour
      $('#share-status').textContent = d.shareMode==='none' ? 'Profil masqué. ✓' : `${d.count} titre(s) synchronisé(s) ✓`;
      toast('Profil mis à jour ✓');
    }catch(e){ $('#share-status').textContent = e.message==='offline'?'Serveur injoignable.':e.message; }
    finally{ btn.disabled = false; }
  });
}
async function openProfile(username){
  try{
    const d = await api('/api/users/'+encodeURIComponent(username));
    social.profile = d; social.view = 'profile'; renderFriends();
  }catch(e){ toast(e.message==='offline'?'Serveur injoignable':e.message); }
}
function renderProfile(box, d){
  const myBooks = shareableBooks();
  const myByKey = new Map(myBooks.map(b=>[b.key, b]));
  const mine = new Set(myBooks.map(b=>b.key));
  const shelf = d.shelf || [];
  const common = shelf.filter(b=>mine.has(b.book_key)).length;
  // affinité de goût : livres notés des DEUX côtés
  const rated = shelf.filter(b=>b.rating!=null && myByKey.has(b.book_key) && myByKey.get(b.book_key).rating!=null)
    .map(b=>({ title:b.title, mine:myByKey.get(b.book_key).rating, them:b.rating }));
  let affinity = null;
  if(rated.length){
    const avgDiff = rated.reduce((s,r)=>s+Math.abs(r.mine-r.them),0)/rated.length;
    affinity = Math.round(Math.max(0, 100 - avgDiff/4.5*100));
  }
  const hues = {livre:205, bd:28, manga:340};
  box.innerHTML = `
    <button class="btn small" id="prof-back" style="margin-bottom:14px">← Retour</button>
    <div class="profile-head">
      <div class="avatar">${esc(initials(d.user.displayName))}</div>
      <div style="flex:1;min-width:0">
        <h3 style="font-size:20px">${esc(d.user.displayName)}</h3>
        <div class="muted" style="color:var(--muted)">@${esc(d.user.username)}</div>
      </div>
      ${d.friendState!=='self' ? `<button class="btn small" data-block="${esc(d.user.username)}" title="Bloquer">🚫</button>` : ''}
    </div>
    ${d.user.bio ? `<p style="color:var(--muted);font-size:14px;margin-bottom:14px">${esc(d.user.bio)}</p>` : ''}
    ${affinity!=null ? `<div class="affinity-ring"><span class="pct">${affinity}%</span><div><b>d'affinité de goût</b><div class="muted" style="color:var(--muted);font-size:12.5px">sur ${rated.length} livre(s) noté(s) tous les deux</div></div></div>` : ''}
    ${d.areFriends ? (shelf.length ? `
      <p style="margin-bottom:14px">${shelf.length} titre(s) partagé(s)${common?` · <span class="common-badge">${common} en commun</span>`:''}</p>
      ${rated.length ? `<div style="margin-bottom:16px">${rated.slice(0,8).map(r=>`<div class="cmp-row"><span class="ct">${esc(r.title)}</span><span class="me" title="ta note">${starsTxt(r.mine)}</span><span style="color:var(--faint)">vs</span><span class="them" title="sa note">${starsTxt(r.them)}</span></div>`).join('')}</div>` : ''}
      <div class="grid">${shelf.map(b=>`
        <div class="card"><div class="cover">
          <span class="badge ${esc(b.type)}">${TYPE_LABEL[b.type]||''}</span>
          ${b.cover?`<img src="${esc(b.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="ph" style="background:linear-gradient(160deg,hsl(${hues[b.type]??150},32%,26%),hsl(${hues[b.type]??150},38%,13%))"><div class="ph-t">${esc(b.title)}</div><div class="ph-a">${esc(b.authors)}</div></div>`}
          ${mine.has(b.book_key)?`<span class="ribbon done">✓ toi aussi</span>`:''}
        </div><div class="under">${b.rating?`<span class="stars">${starsTxt(b.rating)}</span>`:''}</div></div>`).join('')}</div>`
      : `<p class="friends-empty">${esc(d.user.displayName)} ne partage rien pour le moment.</p>`)
    : (d.iBlocked ? `<p class="friends-empty">Tu as bloqué cet utilisateur.</p>` : `<p class="friends-empty">Vous n'êtes pas encore amis — sa bibliothèque est privée.</p>`)}`;
  $('#prof-back').addEventListener('click', ()=>{ social.view=null; social.profile=null; social.tab='friends'; renderFriends(); });
  const blockBtn = box.querySelector('[data-block]');
  if(blockBtn) blockBtn.addEventListener('click', async ()=>{
    if(blockBtn.disabled) return;
    if(!await uiConfirm({title:'Bloquer '+d.user.displayName+' ?', message:'Vous ne serez plus amis et il ne pourra plus t\'ajouter.', okLabel:'Bloquer', danger:true})) return;
    blockBtn.disabled = true;
    try{ await api('/api/block', {method:'POST', body:{username:d.user.username}}); toast('Utilisateur bloqué'); social.view=null; social.profile=null; social.tab='friends'; renderFriends(); }
    catch(e){ blockBtn.disabled = false; toast(e.message); }
  });
}
// écouteur délégué unique pour toute la vue Amis
$('#friends-body').addEventListener('click', async e => {
  const sub = e.target.closest('.friends-sub button');
  if(sub){ social.tab = sub.dataset.tab; renderFriends(); return; }
  if(e.target.closest('#soc-logout')){
    try{ await api('/api/logout', {method:'POST'}); }catch(_){}
    try{ localStorage.removeItem(SOC_TOKEN); }catch(_){}
    social.me=null; social.view=null; social.libRev=0; social.todayFeed=null; social.todayFeedAt=0; social.todayFeedUser=''; social.todayFeedError=''; setLibStatus(''); // la biblio locale reste sur l'appareil
    renderFriends(); return;
  }
  const acc = e.target.closest('[data-accept]');
  if(acc){ if(acc.disabled) return; acc.disabled=true; try{ await api('/api/friends/accept', {method:'POST', body:{userId:acc.dataset.accept}}); toast('Ami ajouté ✓'); loadFriendLists(); }catch(e2){ acc.disabled=false; toast(e2.message); } return; }
  const rem = e.target.closest('[data-remove]');
  if(rem){ if(rem.disabled) return; rem.disabled=true; try{ await api('/api/friends/remove', {method:'POST', body:{userId:rem.dataset.remove}}); loadFriendLists(); }catch(e2){ rem.disabled=false; toast(e2.message); } return; }
  const prof = e.target.closest('[data-profile]');
  if(prof){ openProfile(prof.dataset.profile); return; }
});

/* =============== Restauration des préférences d'affichage =============== */
(function restoreUI(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(UI_KEY)||'null'); }catch(_){}
  if(saved && typeof saved==='object'){
    if(['all','read','reading','wishlist','abandoned','fav','loan'].includes(saved.status)) ui.status = saved.status;
    if(Array.isArray(saved.types)) ui.types = new Set(saved.types.filter(t=>['livre','bd','manga'].includes(t)));
    if(typeof saved.tag==='string') ui.tag = saved.tag;
    if(['added','rating','title','author','year'].includes(saved.sort)) ui.sort = saved.sort;
    if(typeof saved.groupSeries==='boolean') ui.groupSeries = saved.groupSeries;
    if(['wishlist','reading','read'].includes(saved.defaultStatus)) ui.defaultStatus = saved.defaultStatus;
    if(['ask','on'].includes(saved.ideas)) ui.ideas = saved.ideas;
    if(['count','pages'].includes(saved.typeMetric)) ui.typeMetric = saved.typeMetric;
    if(['today','library','journal','lists','stats','friends'].includes(saved.view)) ui.view = saved.view;
  }
  // refléter dans le DOM
  $$('#status-chips .chip').forEach(x=>{ const on=x.dataset.status===ui.status; x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  $$('#type-chips .chip[data-type]').forEach(x=>{ const on=ui.types.has(x.dataset.type); x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  $('#chip-series').classList.toggle('active', ui.groupSeries); $('#chip-series').setAttribute('aria-pressed', ui.groupSeries);
  $('#lib-sort').value = ui.sort;
  $$('#search-status button').forEach(x=>x.classList.toggle('on', x.dataset.s===ui.defaultStatus));
})();

// vue initiale : hash > préférence sauvegardée (capturer le hash AVANT que selectView ne le remplace)
const _initHash = location.hash;
const _hash = _initHash.slice(1);
if(['today','library','journal','lists','stats','friends'].includes(_hash)) ui.view = _hash;
selectView(ui.view);
refreshResume();
const _origRender = render;
render = function(){ _origRender(); refreshResume(); updateStreakPill(); };
updateStreakPill();
$('#btn-streak').addEventListener('click', ()=>selectView('stats'));
if(_initHash.startsWith('#book/') || _initHash.startsWith('#invite/')) applyHashView(_initHash);
if(_loaded.migrated) save(true); // fige la migration depuis l'ancienne clé, sans compter comme une modification
if(_loaded.notice) setTimeout(()=>toast(_loaded.notice), 600);
// restaure la session sociale si un token existe → rafraîchit la vue Amis + synchronise la biblio du compte
if(socToken()) socRefresh().then(()=>{ if(social.me){ syncLibraryOnLogin().then(()=>pushShelf()); } if(ui.view==='friends') renderFriends(); else if(ui.view==='today') renderToday(); });

// Page d'accueil : présentée aux visiteurs qui arrivent sans compte et sans bibliothèque à eux.
// (Les utilisateurs connectés, ou qui ont déjà des livres, entrent directement dans l'app.)
const _pubUser = publicUsernameFromURL();
if(_pubUser) showPublicProfile(_pubUser);   // visiteur arrivé par un lien de bio : page publique, rien d'autre
(function maybeWelcome(){
  if(_pubUser) return;                      // ne pas superposer la page d'accueil à un profil public
  let welcomed = false;
  try{ welcomed = !!localStorage.getItem('tome-welcomed'); }catch(_){}
  const hasRealBooks = (state.books||[]).some(b=>!(b.tags||[]).includes('exemple'));
  if(hasRealBooks || socToken()){ try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}; return; }
  // _initHash = hash d'ARRIVÉE (capturé avant que selectView ne pose #today) : on n'interrompt
  // pas un visiteur qui deep-linke (#book/…, #invite/…), seulement une arrivée « à froid ».
  // seuls les VRAIS deep-links suppriment la page d'accueil : le start_url de la PWA porte
  // désormais #today, qui sinon la désactiverait définitivement pour les nouveaux venus
  const deepLink = _initHash.startsWith('#book/') || _initHash.startsWith('#invite/');
  if(!welcomed && !deepLink) showWelcome();
})();

/* =============== Page d'accueil publique =============== */
function showWelcome(){ const w=$('#welcome'); if(!w) return; w.hidden=false; document.body.classList.add('welcome-open'); syncModalIsolation();
  const first=w.querySelector('[data-lp="signup"]'); if(first) try{ first.focus(); }catch(_){} }
function hideWelcome(){ const w=$('#welcome'); if(!w) return; w.hidden=true; document.body.classList.remove('welcome-open'); syncModalIsolation();
  if(location.hash==='#welcome'){ try{ history.replaceState(history.state,'',location.pathname+location.search); }catch(_){} } }
$('#welcome').addEventListener('click', e=>{
  const b = e.target.closest('[data-lp]'); if(!b) return;
  const a = b.dataset.lp;
  if(a==='legal'){ openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); return; }
  if(a==='pledge'){ showPledge(); return; }
  try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}   // ne plus l'imposer au prochain lancement
  hideWelcome();
  if(a==='signup' || a==='login'){ selectView('friends'); if(!social.me) renderAuth($('#friends-body'), a==='signup'?'signup':'login'); }
  // a==='try' : on entre simplement dans l'app (local, sans compte)
});
// couvertures de l'éventail : si une image ne charge pas (hors-ligne, 404), on la retire → la carte
// dégradée avec le titre reste en repli élégant
document.addEventListener('error', e=>{
  if(e.target && e.target.matches && e.target.matches('#welcome .lp-cover,.ob-cov img')) e.target.remove();
}, true);
// Prévisualisation : #welcome affiche la page d'accueil (le branchement au 1er lancement viendra avec les comptes)
if(location.hash==='#welcome') showWelcome();
window.addEventListener('hashchange', ()=>{ if(location.hash==='#welcome') showWelcome(); });

/* =============== Tests de fumée (?selftest) — coût nul en usage normal =============== */
if(location.search.includes('selftest')){
  let pass=0, fail=0;
  const assert=(name,cond)=>{ if(cond){pass++;} else {fail++; console.error('✗ '+name);} };
  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  assert('parseTome One Piece 42', eq(parseTome('One Piece 42'), {series:'One Piece', volume:42}));
  assert('parseTome Berserk, Tome 12', (parseTome('Berserk, Tome 12')||{}).volume===12);
  assert('parseTome plain title', parseTome('1984')===null);
  const nb=normalizeBook({title:'x', rating:9, type:'foo', tags:['a','a',' b '], volume:-5, pages:1e309, moods:['sombre','xx'], pace:'zzz'});
  assert('normalize rating clamp', nb.rating===null);
  assert('normalize type default', nb.type==='livre');
  assert('normalize tags dedup+trim', eq(nb.tags,['a','b']));
  assert('normalize volume floor', nb.volume===0);
  assert('normalize pages null on infinity', nb.pages===null);
  assert('normalize moods filter', eq(nb.moods,['sombre']));
  assert('normalize pace null', nb.pace===null);
  const nloan=normalizeBook({title:'x', loan:{to:'Alice', since:'2026-08-01', due:'2026-09-01'}});
  assert('normalize loan due date', nloan.loan && nloan.loan.due==='2026-09-01');
  assert('normalize invalid loan due', normalizeBook({title:'x', loan:{to:'Alice', due:'demain'}}).loan.due===null);
  assert('cleanSynopsis strips html', cleanSynopsis('<p>Hi<br>there</p>')==='Hi there');
  assert('cleanRating 3.7→3.5', cleanRating('3.7')===3.5);
  assert('cleanCover http→https', cleanCover('http://x/y.jpg')==='https://x/y.jpg');
  assert('fullTitle series+vol', fullTitle({title:'A', series:'A', volume:2})==='A, tome 2');
  const dd=normalizeData({books:[{id:'X',title:'A'},{id:'X',title:'B'}], lists:[{id:'L',name:'l',bookIds:['X','ghost']}]});
  assert('normalizeData dedup ids', dd.books[0].id!==dd.books[1].id);
  assert('normalizeData purge ghost bookIds', dd.lists[0].bookIds.length===1);
  assert('COLL numeric tome 2<10', COLL.compare('T2','T10')<0);
  // CSV
  const csv1 = parseCSV('a,b,c\n1,"deux, virgule","trois\nligne"');
  assert('parseCSV quoted comma', csv1[1][1]==='deux, virgule');
  assert('parseCSV quoted newline', csv1[1][2]==='trois\nligne');
  assert('parseCSV doubled quote', parseCSV('x\n"a ""b"" c"')[1][0]==='a "b" c');
  assert('detectSource tome', detectSource(['Tome CSV Version','Tome ID','Title'])==='tome');
  assert('detectSource goodreads', detectSource(['Book Id','Title','Exclusive Shelf'])==='goodreads');
  assert('detectSource storygraph', detectSource(['Title','Read Status','Moods','Pace'])==='storygraph');
  assert('detectSource none', detectSource(['foo','bar'])===null);
  assert('csvIsbn strips excel guard', csvIsbn('="9780441172719"')==='9780441172719');
  assert('csvIsbn rejects non-isbn', csvIsbn('SG-abc123')==='');
  assert('csvDate slash to dash', csvDate('2026/03/15')==='2026-03-15');
  assert('csvDate range takes end', csvDate('2026/01/01-2026/02/02')==='2026-02-02');
  const csvGuard=parseCSV(buildTomeCSV([normalizeBook({id:'csv1',title:'=DANGER',authors:['Autrice, Une','Auteur Deux'],type:'livre',status:'read',rating:4.5,favorite:true,tags:['SF','essai'],review:'ligne 1\nligne 2',readings:[{id:'r1',date:'2026-08-01',rating:4.5}],quotes:[{id:'q1',text:'Une citation',page:42}],loan:{to:'Alice',since:'2026-08-02',due:'2026-09-02'},study:{summary:'Mon résumé',ideas:[{id:'i1',text:'Idée forte'}],cards:[{id:'c1',front:'Question ?',back:'Réponse',due:'2026-08-20'}],updatedAt:'2026-08-20T10:00:00Z'}})]));
  const csvGuardHead=csvGuard[0].map(h=>h.toLowerCase()), csvGuardIdx={}; csvGuardHead.forEach((h,i)=>csvGuardIdx[h]=i);
  const csvGuardGet=n=>String(csvGuard[1][csvGuardIdx[n.toLowerCase()]]||'').trim();
  const csvRound=rowToBook(csvGuardGet,'tome').book;
  assert('Tome CSV neutralise et restaure une formule', csvRound.title==='=DANGER');
  assert('Tome CSV conserve auteurs et texte multiligne', eq(csvRound.authors,['Autrice, Une','Auteur Deux']) && csvRound.review==='ligne 1\nligne 2');
  assert('Tome CSV conserve lectures, citations et prêt', csvRound.readings.length===1 && csvRound.quotes[0].page===42 && csvRound.loan.due==='2026-09-02');
  assert('Tome CSV conserve la fiche étude', csvRound.study && csvRound.study.summary==='Mon résumé' && csvRound.study.cards[0].back==='Réponse');
  const apostropheCSV=parseCSV(buildTomeCSV([{...csvRound,id:'apostrophe',title:"'=titre"}]));
  const apostropheHead=apostropheCSV[0].map(h=>h.toLowerCase()), apostropheIdx={}; apostropheHead.forEach((h,i)=>apostropheIdx[h]=i);
  const apostropheGet=n=>String(apostropheCSV[1][apostropheIdx[n.toLowerCase()]]||'').trim();
  assert('Tome CSV conserve apostrophe légitime', rowToBook(apostropheGet,'tome').book.title==="'=titre");
  const grHead = ['Title','Author','My Rating','Exclusive Shelf','Date Read','Bookshelves','ISBN13'];
  const grRow = ['Dune','Frank Herbert','0','to-read','','sci-fi, owned','="9780441172719"'];
  const grGet = n => grRow[grHead.map(h=>h.toLowerCase()).indexOf(n.toLowerCase())] ?? '';
  const grBook = rowToBook(grGet, 'goodreads');
  assert('GR rating 0 → null', grBook.book.rating===null);
  assert('GR status to-read → wishlist', grBook.book.status==='wishlist');
  assert('GR isbn captured', grBook.isbn==='9780441172719');
  const sgHead = ['Title','Authors','Read Status','Star Rating','Moods','Pace','Dates Read'];
  const sgRow = ['Pluto','Naoki Urasawa','read','4.25','dark, emotional','medium','2026/04/10'];
  const sgGet = n => sgRow[sgHead.map(h=>h.toLowerCase()).indexOf(n.toLowerCase())] ?? '';
  const sgBook = rowToBook(sgGet, 'storygraph');
  assert('SG rating 4.25 → 4.5', sgBook.book.rating===4.5);
  assert('SG moods mapped', sgBook.book.moods.includes('sombre') && sgBook.book.moods.includes('émouvant'));
  assert('SG pace medium → moyen', sgBook.book.pace==='moyen');
  assert('SG reading date', sgBook.book.readings[0] && sgBook.book.readings[0].date==='2026-04-10');
  // v6 : collections intelligentes + notes de série
  const scd = normalizeData({smartCollections:[{id:'S', name:'x', f:{status:'zz', types:['livre','bad'], sort:'nope'}}]});
  assert('smart status default', scd.smartCollections[0].f.status==='all');
  assert('smart types filtered', eq(scd.smartCollections[0].f.types, ['livre']));
  assert('smart sort default', scd.smartCollections[0].f.sort==='added');
  const srd = normalizeData({ books:[{id:'b1', title:'Berserk', series:'Berserk', volume:1}], series:{ 'berserk':{rating:3.7, review:'top'}, 'orpheline':{rating:5} } });
  assert('series rating cleaned', srd.series['berserk'] && srd.series['berserk'].rating===3.5);
  assert('series orphan purged', !srd.series['orpheline']);
  const sre = normalizeData({ books:[], series:{ 'x':{rating:null, review:'', favorite:false, moods:[]} } });
  assert('series empty entry dropped', !sre.series['x']);
  // v7 : idées du jour + invitation par lien
  assert('hashStr déterministe', hashStr('2026-08-16|a')===hashStr('2026-08-16|a'));
  assert('hashStr varie selon la clé', hashStr('2026-08-16|a')!==hashStr('2026-08-16|t'));
  assert('hashStr positif', hashStr('x')>=0 && hashStr('')>=0);
  assert('INVITE_RE pseudo valide', (('invite/lucas_bd'.match(INVITE_RE))||[])[1]==='lucas_bd');
  assert('INVITE_RE rejette pseudo invalide', 'invite/<script>'.match(INVITE_RE)===null && 'invite/ab'.match(INVITE_RE)===null);
  assert('bookLibKey normalise', bookLibKey('Dune ', 'Frank Herbert')===bookLibKey('dune', 'frank herbert'));
  assert('shelfKey stable (sync = chez tes amis)', shelfKey({title:'Dune', authors:['Frank Herbert'], volume:2})==='dune|frankherbert|2'.replace(/\|/g,''));
  // v9 : fusion de bibliothèques (aucun livre perdu, dédup, démo ignorée)
  const _srv = {books:[{id:'s1',title:'Dune',authors:['Frank Herbert'],study:{summary:'Ancien',updatedAt:'2026-08-18T10:00:00Z'}}]};
  const _loc = {books:[{id:'l1',title:'Fondation',authors:['Asimov']},{id:'l2',title:'Dune',authors:['Frank Herbert'],study:{summary:'Récent',updatedAt:'2026-08-20T10:00:00Z'}},{id:'d1',title:'Démo',tags:['exemple']}]};
  const _m = mergeLibraries(_loc, _srv);
  assert('merge : garde le livre serveur', _m.books.some(b=>b.title==='Dune'));
  assert('merge : ajoute le livre local absent', _m.books.some(b=>b.title==='Fondation'));
  assert('merge : conserve les deux versions en conflit', _m.books.filter(b=>b.title==='Dune').length===2);
  assert('merge : ignore la démo', !_m.books.some(b=>b.title==='Démo'));
  assert('merge : marque la copie locale conflictuelle', _m.books.some(b=>b.title==='Dune' && b.tags.includes('conflit-sync') && b.study.summary==='Récent'));
  const _same=mergeLibraries({books:[{id:'local',title:'Neuromancien',authors:['William Gibson']}]},{books:[{id:'server',title:'Neuromancien',authors:['William Gibson']}]});
  assert('merge : déduplique deux versions identiques', _same.books.filter(b=>b.title==='Neuromancien').length===1);
  // v10 : fiches d'étude et répétition espacée
  const _st=normalizeStudy({objective:' comprendre ',ideas:['Idée A',''],questions:[{question:'Pourquoi ?',answer:'Parce que'}],cards:[{front:'Recto',back:'Verso',due:'invalide'}]});
  assert('study : normalise les champs et listes', _st.objective==='comprendre' && _st.ideas.length===1 && _st.questions[0].answer==='Parce que');
  assert('study : une nouvelle carte est due aujourd’hui', _st.cards[0].due===today());
  const _card={front:'Q',back:'R',due:today(),interval:0,repetitions:0,lastReviewed:null}; gradeStudyCard(_card,'good');
  assert('study : réponse bien espace de 4 jours', _card.interval===4 && _card.due===isoAfterDays(today(),4) && _card.lastReviewed===today());
  const _studyBook=normalizeBook({title:'Apprendre',authors:['A. Test'],study:{summary:'Résumé perso',lessons:['Agir'],cards:[{front:'Q',back:'R',due:today()}]}});
  assert('study : export Markdown structuré', studyMarkdown(_studyBook).includes('## Résumé personnel') && studyMarkdown(_studyBook).includes('## Cartes mémoire'));
  assert('study : fiche imprimable échappée', studyPrintHTML(normalizeBook({title:'<script>',study:{summary:'<b>x</b>'}})).includes('&lt;script&gt;'));
  // v11 : boucle quotidienne — progression compacte et bornée
  const _progressBook={pages:120,currentPage:0,progressLog:[]};
  updateBookProgress(_progressBook,35,'2026-08-21'); updateBookProgress(_progressBook,42,'2026-08-21');
  assert('today : une seule progression par jour', _progressBook.progressLog.length===1 && _progressBook.progressLog[0].page===42);
  updateBookProgress(_progressBook,999,'2026-08-22');
  assert('today : progression bornée au nombre de pages', _progressBook.currentPage===120 && _progressBook.progressLog[1].page===120);
  updateBookProgress(_progressBook,-4,'2026-08-23');
  assert('today : progression jamais négative', _progressBook.currentPage===0);
  // v12 : notation rapide — sélection des lectures à noter
  const _sav = state.books;
  state.books = [
    {id:'a', title:'Lu sans note', status:'read', rating:null, readings:[{id:'r1', date:'2026-01-05', rating:null}]},
    {id:'b', title:'Lu et noté', status:'read', rating:4, readings:[{id:'r2', date:'2026-03-01', rating:4}]},
    {id:'c', title:'À lire', status:'wishlist', rating:null, readings:[]},
    {id:'d', title:'Relu sans note', status:'reading', rating:null, readings:[{id:'r3', date:'2026-06-10', rating:null}]},
  ];
  const _u = unratedBooks();
  assert('notation rapide : ne retient que les lectures sans note', _u.length===2 && _u.every(b=>!b.rating));
  assert('notation rapide : ignore la pile « à lire » vierge', !_u.some(b=>b.id==='c'));
  assert('notation rapide : inclut un livre en cours déjà lu une fois', _u.some(b=>b.id==='d'));
  assert('notation rapide : les lectures les plus récentes en premier', _u[0].id==='d');
  state.books = _sav;

  console.log(`Tome selftest — ${pass} ✓ / ${fail} ✗`);
  toast(`Selftest : ${pass} ✓ / ${fail} ✗`);
}
