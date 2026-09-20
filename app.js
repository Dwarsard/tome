'use strict';
/* =============== Constantes & helpers =============== */
const LS_KEY = 'tome-v1';
const LEGACY_KEYS = ['signet-v1'];
const THEME_KEY = 'tome-theme';
const UI_KEY = 'tome-ui';
// Stockage du site refusé par le navigateur (Chrome « Bloquer tous les cookies », Safari ou
// Firefox en mode strict, certaines vues intégrées) : le simple accès à localStorage lève une
// SecurityError. load() le lisait sans filet au premier niveau, donc tout le script s’arrêtait :
// page blanche. On pose à la place un stockage en mémoire de même surface — l’app fonctionne
// le temps de la visite (et un compte connecté sauvegarde sur le serveur), un bandeau prévient
// que rien ne restera sur l’appareil. Seule une LECTURE qui échoue compte : un setItem qui lève
// peut n’être qu’un stockage plein, que save() gère déjà sans perdre l’accès aux données.
const STORAGE_BLOCKED = (()=>{
  try{ window.localStorage.getItem(LS_KEY); return false; }
  catch(_){
    const memStorage = () => { const mem = new Map(); return {
      getItem: k => mem.has(String(k)) ? mem.get(String(k)) : null,
      setItem: (k, v) => { mem.set(String(k), String(v)); },
      removeItem: k => { mem.delete(String(k)); },
      clear: () => { mem.clear(); },
      key: i => [...mem.keys()][i] ?? null,
      get length(){ return mem.size; },
    }; };
    try{ Object.defineProperty(window, 'localStorage', { value: memStorage(), configurable:true, writable:true }); }catch(_){ }
    try{ window.sessionStorage.getItem('x'); }
    catch(_){ try{ Object.defineProperty(window, 'sessionStorage', { value: memStorage(), configurable:true, writable:true }); }catch(_){ } }
    return true;
  }
})();
const TYPE_LABEL = {livre:'Livre', bd:'BD', manga:'Manga'};
const STATUS_LABEL = {wishlist:'À lire', reading:'En cours', read:'Lu', abandoned:'Abandonné'};
const MOODS = ['entraînant','sombre','drôle','émouvant','réconfortant','tendu','réflexif','mélancolique','angoissant','inspirant','poétique','haletant'];
const PACE_LABEL = {lent:'Lent', moyen:'Moyen', rapide:'Rapide'};
const COLL = new Intl.Collator('fr', {numeric:true, sensitivity:'base'});
// Repli pour la recherche : sans accents, apostrophes typographiques ramenées à la droite, en
// minuscules — « etranger » doit trouver « L’Étranger », ce qu’un simple toLowerCase ne faisait pas.
const fold = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’‘]/g,"'").toLowerCase();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* =============== Icônes =================================================
   Un emoji change de dessin selon l’appareil (le d’un iPhone n’est pas celui d’Android),
   ne prend pas la couleur du thème et ne s’aligne jamais tout à fait. Ces icônes sont dessinées
   sur une grille de 24, épaisseur constante, et héritent de currentColor.
   Plus aucun emoji dans l'interface : glyphes typographiques (♥ ★ ❝ ✓) et fleuron ❦ dans les états vides. */
const ICONS = {
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  chevron:'<path d="M9 6l6 6-6 6"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  book:'<path d="M12 7c-2-1.3-5-1.3-7-.5v10c2-.8 5-.8 7 .5 2-1.3 5-1.3 7-.5v-10c-2-.8-5-.8-7 .5z"/><path d="M12 7v10.5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  star:'<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>',
  bookmark:'<path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z"/>',
  bell:'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.5 13.6a5.5 5.5 0 0 1 3 5.4"/>',
  download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/>',
  upload:'<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5"/><path d="M4 5h16"/>',
  key:'<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8M17 5l2 2M14.5 7.5l2 2"/>',
  cart:'<path d="M3 5h2l2.2 9.5a2 2 0 0 0 2 1.5h6.9a2 2 0 0 0 2-1.5L20 8H6"/><circle cx="9.5" cy="19.5" r="1.2"/><circle cx="17" cy="19.5" r="1.2"/>',
  device:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18.5h2"/>',
  chart:'<path d="M4 19V6M4 19h16"/><path d="M8 15v-3M12 17v-7M16 13V8"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6v.01M4 12v.01M4 18v.01"/>',
  cards:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M19 8v9a2 2 0 0 1-2 2"/>',
  share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.2M8.2 13.2l7.6 4.2"/>',
  link:'<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.2 1.2"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.2-1.2"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 5-4.5 4 3.2 2.5-2.2L21 18"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/>',
  checkbox:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.4 2.4L15.5 10"/>',
  restore:'<path d="M4 10a8 8 0 1 1 .7 5"/><path d="M4 5v5h5"/>',
  doc:'<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>',
  heart:'<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  play:'<path d="M8 5.5v13l10.5-6.5z"/>',
  contrast:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  lend:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  shuffle:'<path d="M16 4h4v4"/><path d="M4 19 20 4"/><path d="M16 20h4v-4"/><path d="m14.5 14.5 5.5 5.5"/><path d="M4 5l4.5 4.5"/>',
  filters:'<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h6M14 18h6"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>',
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16"/>',
  print:'<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 13h10v7H7z"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
};
/* size en px ; le trait s’affine sur les grandes tailles pour rester léger */
function ic(nom, size=18, extra=''){
  const d = ICONS[nom]; if(!d) return '';
  const w = size >= 30 ? 1.5 : 1.75;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="width:${size}px;height:${size}px;flex-shrink:0;${extra}"
    fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

/* Isolation accessible des surfaces modales : le fond devient réellement indisponible au clavier
   et aux lecteurs d’écran, quel que soit le type de modale ouvert. */
const _modalHidden = new Map();
function activeModalRoot(){
  const dlg=$('#ov-dialog'); if(dlg && dlg.classList.contains('open')) return dlg;
  const pub=$('#pubprofile'); if(pub && !pub.hidden) return pub;   // page publique : couvre tout l’écran
  const welcome=$('#welcome'); if(welcome && !welcome.hidden) return welcome;
  const overlays=$$('.overlay.open');
  if(!overlays.length) return null;
  // La modale active est celle qui s’affiche AU-DESSUS : z-index d’abord, ordre DOM pour départager.
  // (#ov-card s’empile volontairement sur une modale déjà ouverte alors qu’il la précède dans le DOM ;
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
// Boutons des surcouches exemptées réellement affichées (« Annuler » du toast, « Recharger » du
// bandeau de mise à jour…) : le piège de focus les enchaîne après le dernier champ de la modale,
// sinon ils restent visibles mais hors de portée au clavier tant qu’une fiche est ouverte.
function exemptFocusables(){
  return $$('[data-modal-exempt]')
    .filter(el=>{ const cs=getComputedStyle(el); return cs.display!=='none' && cs.visibility!=='hidden'; })
    .flatMap(el=>modalFocusables(el));
}
document.addEventListener('focusin',e=>{
  const root=activeModalRoot(); if(!root || root.contains(e.target)) return;
  if(e.target.closest && e.target.closest('[data-modal-exempt]')) return; // surcouche autorisée au-dessus de la modale
  const first=modalFocusables(root)[0]; if(first) first.focus();
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab' || e.defaultPrevented) return;
  const root=activeModalRoot(); if(!root) return;
  // cycle de tabulation : les champs de la modale, puis les boutons des surcouches exemptées
  const f=modalFocusables(root), cycle=f.concat(exemptFocusables()); if(!cycle.length) return;
  const a=document.activeElement, i=cycle.indexOf(a);
  if(i===-1){
    // ni dans la modale ni sur une surcouche (focus perdu sur <body>) : on ramène dans le cycle ;
    // un élément de la modale non listé (radio, contenteditable…) garde la tabulation naturelle
    if(root.contains(a) || (a && a.closest && a.closest('[data-modal-exempt]'))) return;
    e.preventDefault(); cycle[e.shiftKey ? cycle.length-1 : 0].focus(); return;
  }
  // on n’intervient qu’aux frontières : fin de la modale → surcouches, fin de tout → début, et inversement
  const bord = e.shiftKey ? (i===0 || i===f.length) : (i===cycle.length-1 || i===f.length-1);
  if(!bord) return;
  e.preventDefault();
  cycle[(i + (e.shiftKey ? -1 : 1) + cycle.length) % cycle.length].focus();
});

/* =============== Modale générique (remplace prompt/confirm natifs) ===============
   uiConfirm/uiPrompt/uiChoose renvoient une Promise. Se superpose aux overlays
   existants sans les fermer (z-index dédié), piège le focus, gère Échap/Entrée. */
let _dlgResolve = null, _dlgPrevFocus = null, _dlgCancelVal = null;
let _dlgDepth = 0; // niveau d’historique du dialogue ouvert (0 = aucune entrée), cf. pushOverlayHistory
// fromPop : fermeture déclenchée par le bouton Retour (popstate) — le navigateur a déjà retiré
// l’entrée d’historique du dialogue, il ne faut surtout pas reculer une seconde fois.
function _dlgClose(val, fromPop){
  const ov = $('#ov-dialog'), depth = _dlgDepth; _dlgDepth = 0;
  if(!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  syncModalIsolation();
  // purge le contenu : un dialogue peut afficher un secret (code de secours) — il ne doit pas
  // rester lisible dans le DOM d’un appareil partagé après fermeture
  $('#dialog-msg').textContent=''; $('#dialog-title').textContent=''; $('#dialog-input').value='';
  const codeOut = $('#dialog-code'); codeOut.textContent=''; codeOut.hidden=true;
  document.removeEventListener('keydown', _dlgKey, true);
  if(!fromPop) popOverlayHistory(depth); // ✕, Échap, clic-fond, bouton : on rend l’entrée poussée à l’ouverture
  const r = _dlgResolve; _dlgResolve = null;
  if(_dlgPrevFocus && document.contains(_dlgPrevFocus)){ try{ _dlgPrevFocus.focus(); }catch(_){} }
  if(r) r(val);
}
function _dlgFocusable(){
  return $$('#ov-dialog button, #ov-dialog input, #ov-dialog textarea').filter(el=>!el.hidden && !el.disabled && el.offsetParent!==null);
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
// openDialog({title, message, code?, input?, actions:[{label,value,variant,default,cancel,returnsInput,disabled}]})
// disabled : une ligne qui informe sans agir (« appartient à un autre compte ») — visible, inerte.
function openDialog(cfg){
  return new Promise(resolve=>{
    // une seule modale à la fois : un dialogue déjà ouvert est remplacé et lui lègue son entrée
    // d’historique (la rendre puis en pousser une autre ferait deux navigations pour un seul écran)
    const remplace = !!_dlgResolve, depthHeritee = _dlgDepth;
    if(remplace) _dlgClose(_dlgCancelVal, true);
    _dlgPrevFocus = document.activeElement;
    _dlgResolve = resolve;
    $('#dialog-title').textContent = cfg.title || '';
    const msg = $('#dialog-msg'); msg.textContent = cfg.message || '';
    // cfg.code : une chaîne à recopier (code de secours). Sortie du message pour qu’elle soit la
    // chose la plus grande de l’écran et sélectionnable d’un geste, pas noyée dans un paragraphe.
    const codeEl = $('#dialog-code'); codeEl.textContent = cfg.code || ''; codeEl.hidden = !cfg.code;
    const input = $('#dialog-input'), area = $('#dialog-textarea');
    input.hidden=true; area.hidden=true; input.value=''; area.value='';
    const inp = (cfg.input && cfg.input.multiline) ? area : input;
    if(cfg.input){
      inp.hidden=false;
      if(inp===input){ inp.type=cfg.input.type||'text'; inp.removeAttribute('maxlength'); if(inp.type==='password') inp.maxLength=256; }
      inp.value=cfg.input.value!=null?cfg.input.value:''; inp.placeholder=cfg.input.placeholder||'';
      // le message du dialogue décrit le champ : lu avec lui au focus, pas seulement au titre
      if(cfg.message) inp.setAttribute('aria-describedby','dialog-msg'); else inp.removeAttribute('aria-describedby');
    }
    const acts = $('#dialog-actions'); acts.innerHTML='';
    const cancelAct = cfg.actions.find(a=>a.cancel);
    _dlgCancelVal = cancelAct ? cancelAct.value : null;
    cfg.actions.forEach(a=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='btn'+(a.variant==='primary'?' primary':a.variant==='danger'?' danger':'');
      if(a.default) b.setAttribute('data-default','');
      if(a.disabled) b.disabled = true;
      b.textContent=a.label;
      b.addEventListener('click', ()=> _dlgClose(a.returnsInput ? inp.value : a.value));
      acts.append(b);
    });
    // Le dialogue entre dans l’historique : Retour (Android, geste iOS) le ferme, lui, et non la
    // fiche en dessous — qui restait sinon ouverte avec un dialogue orphelin par-dessus.
    _dlgDepth = remplace ? depthHeritee : pushOverlayHistory();
    $('#ov-dialog').classList.add('open');
    syncModalIsolation();
    document.addEventListener('keydown', _dlgKey, true);
    setTimeout(()=>{ const el = cfg.input ? inp : ($('#ov-dialog [data-default]') || acts.querySelector('button:not([disabled])')); if(el){ el.focus(); if(el===inp) inp.select(); } }, 20);
  });
}
function uiConfirm({title, message='', okLabel='Confirmer', cancelLabel='Annuler', danger=false}){
  // Sur une action destructrice, le bouton par défaut (celui qui a le focus et que valide Entrée)
  // est Annuler : une frappe réflexe ne doit jamais effacer quelque chose d’irrécupérable.
  return openDialog({ title, message, actions:[
    { label:cancelLabel, value:false, cancel:true, default:danger },
    { label:okLabel, value:true, variant: danger?'danger':'primary', default:!danger },
  ]});
}
function uiPrompt({title, message='', value='', placeholder='', type='text', multiline=false, okLabel='OK', cancelLabel='Annuler'}){
  return openDialog({ title, message, input:{value, placeholder, type, multiline}, actions:[
    { label:cancelLabel, value:null, cancel:true },
    { label:okLabel, variant:'primary', default:true, returnsInput:true },
  ]});
}
// uiChoose({title, message, choices:[{label,value,variant,default,disabled}]}) → value choisie, ou null si annulé
function uiChoose({title, message='', choices, cancelLabel='Annuler'}){
  return openDialog({ title, message, actions:[
    ...choices.map(c=>({ label:c.label, value:c.value, variant:c.variant, default:c.default, disabled:c.disabled })),
    { label:cancelLabel, value:null, cancel:true },
  ]});
}
// clic sur le fond (hors modale) = annuler
$('#ov-dialog').addEventListener('click', e=>{ if(e.target===$('#ov-dialog')) _dlgClose(_dlgCancelVal); });
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2)); }
function dateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function today(){ return dateKey(new Date()); }
// Pluriels, pourcentages, ratios et décimales : une seule écriture pour tout Tome, insécables
// comprises (« 3 livres », « 42 % », « 7 / 12 », « 3,5 ») — plus de « titre(s) » ni de « 42% ».
const plur = (n, un, des = un + 's') => `${n} ${n > 1 ? des : un}`;
const fmtPct = n => `${n} %`;
const fmtRatio = (a, b) => `${a} / ${b}`;
const fmtDec = v => String(v).replace('.', ',');
// Texte d'une note pour les lecteurs d'écran : « 3,5 étoiles », « non noté ».
const ratingText = v => v ? `${fmtDec(v)} étoile${v > 1 ? 's' : ''}` : 'non noté';
function fmtDate(iso){ const t = new Date(iso+'T12:00:00'); return Number.isNaN(t.getTime()) ? String(iso) : t.toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}); }
function isoAfterDays(iso, days){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+days); return dateKey(d); }
function daysUntil(iso){ return Math.round((new Date(iso+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5); }
function loanDueInfo(loan){
  if(!loan || !isValidDate(loan.due||'')) return null;
  const days = daysUntil(loan.due);
  const text = days < 0 ? `en retard de ${plur(-days,'jour')}`
    : days === 0 ? 'à rendre aujourd’hui'
    : days === 1 ? 'à rendre demain'
    : `à rendre le ${fmtDate(loan.due)}`;
  return {days, text, level:days<0?'overdue':days<=3?'soon':''};
}
// toast(msg) ou toast(msg, {label, onAction, ms}) pour proposer une annulation.
// Durée proportionnelle au texte (45 ms par caractère, plancher 2,4 s — 6 s avec une action —,
// plafond 8 s) : un message de 90 caractères disparaissait en 2,4 s, avant d’avoir été lu.
// Un message sans action qui arrive pendant un « Annuler » encore valable attend son tour
// (t._queue) au lieu de l’écraser : l’annulation d’une suppression restait sinon inaccessible
// dès qu’un autre retour l’avait chassée. t._h non nul = toast en vie (voir la pause plus bas).
function toast(msg, opts){
  const t = $('#toast');
  const avecAction = !!(opts && opts.onAction);
  if(!avecAction && t.classList.contains('has-action') && t._h){ (t._queue = t._queue || []).push([msg, opts]); return; }
  t.innerHTML = '';
  t.append(document.createTextNode(msg));
  t.classList.toggle('has-action', avecAction);
  // le suivant part après la sortie du précédent (transition .28 s) : deux messages distincts, pas un texte qui saute
  const suivant = ()=>{ const nx = (t._queue || []).shift(); if(nx) setTimeout(()=>toast(...nx), 300); };
  const hide = ()=>{ clearTimeout(t._h); t._h = 0; t.classList.remove('show','has-action'); suivant(); };
  if(avecAction){
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = opts.label || 'Annuler';
    btn.setAttribute('aria-keyshortcuts', 'Alt+Z');
    let done = false;
    btn.addEventListener('click', ()=>{
      if(done) return; done = true;
      clearTimeout(t._h); t._h = 0; t.classList.remove('has-action','show');
      opts.onAction();
      if(!t.classList.contains('show')) suivant(); // l’action n’a pas affiché son propre retour : la file reprend
    });
    t.append(btn);
  }
  const ms = (opts && opts.ms) || Math.min(8000, Math.max(avecAction ? 6000 : 2400, 1200 + msg.length*45));
  t.classList.add('show');
  clearTimeout(t._h); t._hide = hide; t._h = setTimeout(hide, ms);
}
// Pause du toast au survol ou au focus : celui qui vise « Annuler » ne doit pas le voir disparaître
// sous sa souris ; 1,5 s de sursis après le départ. Écouteurs posés une seule fois (pas dans toast()).
{
  const t = $('#toast');
  const pause = ()=>clearTimeout(t._h);       // t._h garde son id : le toast est toujours « en vie » pour la file
  const reprise = ()=>{ if(t._h && t._hide){ clearTimeout(t._h); t._h = setTimeout(t._hide, 1500); } };
  t.addEventListener('mouseenter', pause); t.addEventListener('mouseleave', reprise);
  t.addEventListener('focusin', pause); t.addEventListener('focusout', reprise);
}
// Alt+Z = l’action du toast courant (Annuler, Exporter…), même une modale ouverte ou depuis un
// champ : le bouton n’est visible que quelques secondes, le trouver à la tabulation prend plus.
document.addEventListener('keydown', e=>{
  if(!e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
  if(e.key.toLowerCase()!=='z' && e.code!=='KeyZ') return; // e.code : Alt+Z donne « Ω » sur Mac
  const t = $('#toast'); if(!t.classList.contains('has-action')) return;
  const btn = t.querySelector('.toast-action'); if(!btn) return;
  e.preventDefault(); btn.click();
});
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BOOKS = 20000, MAX_LISTS = 500, MAX_READINGS = 2000, MAX_BOOKIDS = 20000, MAX_SMART = 100;
const MAX_STUDY_ITEMS = 300, MAX_STUDY_CARDS = 1000;
// Marqueurs de suppression conservés au plus (les plus anciens cèdent) : ~70 octets chacun, ils
// voyagent dans chaque sauvegarde du compte et comptent dans sa limite de taille.
const MAX_DELETED_MARKS = 3000;
const SMART_STATUS = ['all','read','reading','wishlist','abandoned','fav','loan'];
const SORT_KEYS = ['added','read','rating','title','author','year'];
function isValidDate(d){ return typeof d==='string' && DATE_RE.test(d) && !Number.isNaN(new Date(d+'T12:00:00').getTime()); }
// Jour ISO (AAAA-MM-JJ) nettoyé, ou null : pour les dates optionnelles d’un enregistrement (F40)
function cleanDay(v){ const s = String(v||'').slice(0,10); return isValidDate(s) ? s : null; }
// Jours entre deux jours ISO (b − a), comptés à midi pour ignorer les changements d’heure
function daysBetween(a, b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/864e5); }
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
// Les synopsis des API arrivent souvent avec du HTML (<p>, <b>…) : on n’en garde que le texte.
// DOMParser ne charge aucune ressource et n’exécute aucun script.
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
// Compat ascendante : préserve les champs INCONNUS d’un enregistrement (typiquement ajoutés par une
// version PLUS RÉCENTE de l’app tournant sur un autre appareil) au lieu de les supprimer — sinon un
// client en retard, en re-poussant, amputerait définitivement les données côté serveur (le serveur
// stocke un blob opaque et accepte tout push au bon rev). Plafonné en taille : simple passe-plat.
function carryUnknown(src, out, cap){
  if(!src || typeof src!=='object') return out;
  for(const k of Object.keys(src)){
    if(k in out || k==='__proto__') continue;
    try{ const s = JSON.stringify(src[k]); if(s && s.length<=cap) out[k] = JSON.parse(s); }catch(_){ }
  }
  return out;
}
function normalizeBook(b){
  const out = {
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
    isbn: (typeof isbnOf==='function' ? isbnOf(String(b.isbn||'')) : String(b.isbn||'').replace(/[^0-9Xx]/g,'')) || '',
    status: STATUS_LABEL[b.status] ? b.status : 'wishlist',
    rating: cleanRating(b.rating),
    review: typeof b.review==='string' ? b.review.slice(0,20000) : '',
    synopsis: cleanSynopsis(b.synopsis),
    favorite: !!b.favorite,
    tags: Array.isArray(b.tags) ? [...new Set(b.tags.map(t=>String(t).trim().slice(0,60)).filter(Boolean))].slice(0,20) : [],
    readings: (Array.isArray(b.readings) ? b.readings : [])
      .filter(r => r && typeof r.date==='string' && isValidDate(r.date.slice(0,10)))
      .map(r => {
        // F40 : début de cette lecture (posé par markRead, corrigeable sur la fiche), jamais après la fin
        const date = r.date.slice(0,10), start = cleanDay(r.start);
        return { id: ID_RE.test(String(r.id||'')) ? String(r.id) : uid(), date, rating: cleanRating(r.rating), start: (start && start<=date) ? start : null };
      })
      .slice(-MAX_READINGS),
    currentPage: numIn(b.currentPage, 0, 1000000),
    // F40 : progression en % quand la pagination est inconnue (BD sans nombre de pages), et date de
    // début de la lecture en cours — consommée par markRead, qui la reporte dans readings[].start.
    currentPct: numIn(b.currentPct, 0, 100),
    startedAt: cleanDay(b.startedAt),
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
  return carryUnknown(b, out, 40000); // préserve les champs d’une version plus récente
}
/* ---- Marqueurs de suppression (meta.deletedBooks) ----
   Sans eux, un appareil resté hors ligne réinjectait à la fusion un livre supprimé ailleurs : la
   fusion est une union. Chaque suppression EXPLICITE (fiche, sélection, « Effacer et importer »,
   « Annuler » d’un ajout) laisse { [id]: {rev, fp} } : rev = révision de base + 1 (ordre et purge),
   fp = empreinte du livre au moment de la suppression. À la fusion — et seulement là — un livre dont
   l’id est marqué disparaît si son empreinte est la même ; modifié après ailleurs, il est GARDÉ,
   étiqueté CONFLICT_TAG. Avec une base de fusion (meta.syncFp), une copie restée égale à cette base
   n’a été modifiée par personne depuis la dernière synchro : elle disparaît aussi (mergeLibraries).
   Import, restauration et chargement ne posent ni n’appliquent jamais rien. */
function normalizeDeletedBooks(raw){
  const src = (raw && typeof raw==='object' && !Array.isArray(raw)) ? raw : {};
  const entries = [];
  for(const id of Object.keys(src)){
    const m = src[id];
    if(id==='__proto__' || !ID_RE.test(id) || !m || typeof m!=='object') continue;
    const rev = Number.isFinite(+m.rev) ? Math.round(+m.rev) : 0;
    if(rev<1 || typeof m.fp!=='string' || !m.fp || m.fp.length>32) continue;
    entries.push([id, { rev, fp:m.fp }]);
  }
  if(entries.length>MAX_DELETED_MARKS){ entries.sort((a,b)=>b[1].rev-a[1].rev); entries.length = MAX_DELETED_MARKS; }
  return Object.fromEntries(entries);
}
// Lecture sûre : un id comme « constructor » ne doit pas remonter le prototype. Object.hasOwn n’existe
// qu’à partir de Safari 15.4 : appelé dès load(), il aurait laissé l’app blanche sur un iPhone plus ancien.
function hasOwn(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
function deletionMark(deleted, id){ return (deleted && hasOwn(deleted, id)) ? deleted[id] : null; }
// Union de deux jeux de marqueurs : pour un même id, la suppression la plus récente (rev) l’emporte ;
// à rev égale, l’empreinte départage — un ordre total, pour que l’union ne dépende pas du sens de
// la fusion (commutative et associative : deux appareils convergent quel que soit l’ordre des envois).
function mergeDeletedBooks(a, b){
  const out = normalizeDeletedBooks(a);
  for(const [id, m] of Object.entries(normalizeDeletedBooks(b))){
    const cur = deletionMark(out, id);
    if(!cur || m.rev>cur.rev || (m.rev===cur.rev && m.fp>cur.fp)) out[id] = m;
  }
  return normalizeDeletedBooks(out);
}
/* ---- Base de la fusion à trois voies (meta.syncFp) ----
   Sans version de base, la fusion ne savait pas QUI avait modifié un livre : un appareil simplement
   en retard dédoublait (« à réconcilier ») tout ce qui avait changé ailleurs, sans avoir lui-même
   rien touché — livres, mais aussi listes renommées, notes de série et collections.
   syncFp = { rev, books:{[id]:empreinte}, lists:{…}, series:{[clé]:…}, smart:{…} } : les empreintes
   de la dernière version DU COMPTE que cet appareil a intégrée (reçue à une fusion ou une adoption,
   ou écrite par un envoi accepté). Une empreinte n’y entre jamais autrement : c’est ce qui permet de
   lâcher sans perte une copie locale restée égale à sa base. rev = la révision (libRev) à laquelle
   la base a été posée : si libRev avance sans elle (onglet d’une version antérieure de l’app, qui
   transporte la clé sans la comprendre), la base est ignorée et la fusion retombe sur « dans le
   doute, on garde les deux ».
   La base est PAR APPAREIL — deux appareils n’ont pas intégré la même version au même moment. Elle
   vit donc dans le stockage local, à côté de libRev (même écriture : toujours cohérents, y compris
   entre deux onglets), et ne part ni sur le compte (libraryPayload) ni dans un export. */
function emptySyncBase(){ return { books:{}, lists:{}, series:{}, smart:{} }; }
function normalizeSyncFp(raw){
  const src = (raw && typeof raw==='object' && !Array.isArray(raw)) ? raw : {};
  // `ids` : la section est indexée par identifiant (livres, listes, collections) ; sinon par clé de
  // série, un texte libre. « __proto__ » est écarté partout, et toute lecture passe par hasOwn.
  const section = (m, cap, ids) => {
    const out = {}; let n = 0;
    if(!m || typeof m!=='object' || Array.isArray(m)) return out;
    for(const k of Object.keys(m)){
      const fp = m[k];
      if(k==='__proto__' || !k || k.length>200 || (ids && !ID_RE.test(k)) || typeof fp!=='string' || !fp || fp.length>32) continue;
      if(++n>cap) break;
      out[k] = fp;
    }
    return out;
  };
  return {
    rev: Number.isFinite(+src.rev) ? Math.max(0, Math.round(+src.rev)) : 0,
    books: section(src.books, MAX_BOOKS, true), lists: section(src.lists, MAX_LISTS, true),
    series: section(src.series, MAX_BOOKS, false), smart: section(src.smart, MAX_SMART, true),
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
      // Pseudo du compte propriétaire : seul indice, à la reconnexion, qu’un compte a été supprimé
      // puis recréé sous le même pseudo (voir loadAccountLibrary) — le serveur ne sait pas le dire.
      ownerName: (d.meta && typeof d.meta.ownerName==='string') ? d.meta.ownerName.slice(0,20) : null,
      libRev: (d.meta && Number.isFinite(+d.meta.libRev)) ? Math.max(0, Math.round(+d.meta.libRev)) : 0,
      deletedBooks: normalizeDeletedBooks(d.meta && d.meta.deletedBooks),
      // Base de la fusion à trois voies : propre à l’appareil, préservée au rechargement. Celle d’un
      // fichier importé ou d’une version du compte ne vaut rien ici : replaceLocalLibrary,
      // mergeLibraries et adoptServerLibrary la remplacent.
      syncFp: normalizeSyncFp(d.meta && d.meta.syncFp),
      mergeConflicts: (d.meta && Number.isFinite(+d.meta.mergeConflicts)) ? Math.max(0, Math.round(+d.meta.mergeConflicts)) : 0,
      // Objectif posé par la bibliothèque d’exemple : préservé au rechargement pour savoir
      // qu’il doit repartir avec les exemples (jamais renvoyé au serveur, meta locale).
      demoGoal: !!(d.meta && d.meta.demoGoal),
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
  // Un livre et son marqueur de suppression ne coexistent jamais : ici c’est le marqueur qui cède —
  // les marqueurs ne s’appliquent qu’à la fusion, un état chargé ne perd aucun livre en silence.
  for(const b of out.books) if(hasOwn(out.meta.deletedBooks, b.id)) delete out.meta.deletedBooks[b.id];
  // Les clés de meta inconnues transitent aussi : sans cela, un client en retard effaçait à chaque
  // envoi une clé ajoutée par une version plus récente (les marqueurs, par exemple).
  carryUnknown(d.meta, out.meta, 40000);
  return carryUnknown(d, out, 200000); // préserve les sections d’état d’une version plus récente
}
// Pose un marqueur pour chaque livre supprimé EXPLICITEMENT (jamais pour un import ou une
// restauration : ce n’est pas une suppression, la prochaine fusion ramène ce qui manque).
function markBooksDeleted(books){
  state.meta = state.meta || {};
  const deleted = normalizeDeletedBooks(state.meta.deletedBooks);
  const rev = Math.max(1, (+state.meta.libRev||0)+1);
  for(const b of books){
    if(!b || isDemoBook(b) || b.id==='__proto__' || !ID_RE.test(String(b.id||''))) continue;
    const cur = deletionMark(deleted, b.id);
    deleted[b.id] = { rev: Math.max(cur ? cur.rev : 0, rev), fp: bookFingerprint(b) };
  }
  state.meta.deletedBooks = normalizeDeletedBooks(deleted);
}
// Un livre que l’on remet en rayon alors que son id est marqué (« Annuler », CSV réimporté avec ses
// « Tome ID », sauvegarde restaurée) devient un NOUVEL exemplaire : l’ancien id reste supprimé, y
// compris si sa suppression revient plus tard d’un autre appareil — sinon la fusion suivante
// l’effacerait à nouveau. Les listes et les références d’écran suivent le nouvel id.
function restoreBookIdentity(b, lists=state.lists, deleted=state.meta && state.meta.deletedBooks){
  if(!b || !deletionMark(deleted, b.id)) return;
  const old = b.id; b.id = uid();
  for(const l of (lists||[])) l.bookIds = (l.bookIds||[]).map(id=>id===old ? b.id : id);
  if(ui.detailId===old) ui.detailId = b.id;
  if(ui.editId===old) ui.editId = b.id;
  if(ui.selection.has(old)){ ui.selection.delete(old); ui.selection.add(b.id); }
  ui.addedRead = ui.addedRead.map(id=>id===old ? b.id : id);
}
// Remplace l’état local par une sauvegarde (import JSON, restauration) SANS poser de marqueur. Le
// compte de destination et sa révision restent ceux de l’appareil — jamais ceux du fichier, qui
// peut venir d’un autre compte ou d’une autre époque ; les marqueurs des deux côtés sont réunis, et
// un livre du fichier supprimé depuis reçoit un nouvel id (voir restoreBookIdentity). La base de
// fusion suit la révision : c’est celle de l’appareil — vus d’elle, les livres du fichier sont des
// modifications locales, que la prochaine fusion garde (et dédouble s’ils ont aussi changé ailleurs).
function replaceLocalLibrary(clean){
  const meta = state.meta || {};
  clean.meta.ownerId = meta.ownerId || null;
  clean.meta.libRev = (+meta.libRev) || 0;
  clean.meta.syncFp = normalizeSyncFp(meta.syncFp);
  clean.meta.deletedBooks = mergeDeletedBooks(meta.deletedBooks, clean.meta.deletedBooks);
  for(const b of clean.books) restoreBookIdentity(b, clean.lists, clean.meta.deletedBooks);
  replaceState(clean);
}
function load(){
  let notice = null, corrupted = false;
  // clés lues dans l’ordre : courante, sauvegarde d’avant-import, ancienne appli
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
      notice = 'Données illisibles : copie de secours conservée. Va dans Mon compte › Mes données pour la récupérer.';
    }
  }
  return {data:{books:[], lists:[], goals:{}, meta:{changes:0, lastExport:null}, series:{}, smartCollections:[]}, migrated:false, notice, corrupted};
}
const _loaded = load();
const state = _loaded.data;
let _cacheReadings = null, _cacheActivity = null;
function invalidateCache(){ _cacheReadings = null; _cacheActivity = null; }
let _saveBroken = false;
// Affiche/masque la bannière persistante d’échec de sauvegarde (stockage plein).
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
    setSaveBroken(false); // une écriture a réussi : on lève l’alerte
    // toute mutation de données peut changer la série de jours — les chemins rapides
    // (patchCard, actions rapides) ne repassent pas par render(), donc on rafraîchit ici
    if(typeof updateStreakPill==='function') updateStreakPill();
    // connecté ? on planifie une sauvegarde serveur (débounce) — le local reste la copie de travail
    if(typeof scheduleLibPush==='function' && typeof social!=='undefined' && social.me) scheduleLibPush();
    // Cette écriture est désormais la plus récente : une version reçue d’une autre fenêtre pendant
    // la modale ne doit plus l’écraser à la fermeture (dernier écrit gagne, comme avant).
    _externalState = null;
    // Rappel d’export tous les 50 changements — seulement sans compte (connecté, la bibliothèque
    // est sauvée sur le serveur). Différé de 2,5 s pour passer APRÈS le retour de l’action elle-même
    // (« Ajouté », « Supprimé — Annuler ») et actionnable : « Exporter » ouvre directement le fichier.
    if(!skipCount && state.meta.changes>0 && state.meta.changes%50===0 && !(typeof social!=='undefined' && social.me)){
      const n = state.meta.changes; let essais = 3;
      const rappel = ()=>{
        if($('#toast').classList.contains('show')){ if(--essais > 0) setTimeout(rappel, 3000); return; } // un autre retour est à l’écran : on repasse
        toast(`${n} modifications depuis ton dernier export, pense à sauvegarder`, { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
      };
      setTimeout(rappel, 2500);
    }
    return true;
  }catch(e){
    console.error('save failed', e);
    setSaveBroken(true); // bannière persistante tant que le stockage n’accepte pas d’écriture
    // Le stockage local est plein, mais la sauvegarde SERVEUR, elle, ne dépend pas de localStorage
    // (pushLibrary sérialise l’état en mémoire) : on la planifie quand même, sinon un utilisateur
    // connecté perd ses deux filets d’un coup et croit à tort être sauvé « sur son compte ».
    if(typeof scheduleLibPush==='function' && typeof social!=='undefined' && social.me){
      scheduleLibPush();
      toast('Stockage plein : sauvegardé sur ton compte, mais pense à exporter', { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
    }else{
      toast('Sauvegarde impossible : stockage plein', { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
    }
    return false;
  }
}
$('#save-warning-export').addEventListener('click', ()=>$('#btn-export').click());
// Stockage refusé (voir STORAGE_BLOCKED) : même bandeau que « stockage plein », autre message, et
// il se ferme — la personne a fait ce choix exprès, on la prévient une fois sans la harceler.
// save() réussit en mémoire et appelle setSaveBroken(false), qui ne touche au bandeau que si
// _saveBroken change : il reste donc affiché jusqu’au ✕.
if(STORAGE_BLOCKED){
  const bar = $('#save-warning'), msg = bar && bar.querySelector('span');
  if(msg){
    msg.textContent = 'Ton navigateur bloque le stockage de ce site : rien ne restera sur cet appareil après la fermeture. Connecte-toi ou exporte ta bibliothèque avant de partir.';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Fermer l’alerte');
    x.addEventListener('click', ()=>{ bar.hidden = true; });
    bar.appendChild(x);
    bar.hidden = false;
  }
}

const ui = {
  view:'today', status:'all', types:new Set(), q:'', tag:'', sort:'added', groupSeries:true, libLayout:'grid',
  sortDesc:false,                          // sens du tri inversé par rapport au sens naturel de la clé (persisté)
  _shelfJump:false,                        // transitoire : filtre posé par un raccourci d’Aujourd’hui, à ne pas persister
  defaultStatus:'wishlist', typeMetric:'count',
  ideas:'ask',                             // idées du jour : 'ask' (proposer) | 'on' (activées) — jamais d’appel API sans opt-in
  selectMode:false, selection:new Set(),   // transitoires : jamais persistés ni sérialisés
  // Pile de réouverture des modales : une fonction par couche ouverte PAR-DESSUS une autre
  // (fiche → Modifier, série → tome…), pour revenir à celle du dessous au lieu de tout fermer.
  modalStack:[],
  editSnap:'',                             // transitoire : empreinte du formulaire d’édition à son ouverture (garde anti-perte de saisie)
  // Session d’ajout (transitoires, remis à zéro à chaque ouverture de la recherche) : combien de
  // livres ont été ajoutés d’un geste, et lesquels sont des « Lu » encore sans date de lecture.
  addedInSession:0, addedRead:[],
  editId:null, detailId:null, listId:null, listMode:'list', seriesName:'', recapYear:new Date().getFullYear(),
  listPickQ:null,                          // transitoire : saisie du sélecteur « Ajouter des titres » du panneau liste (null = fermé)
  searchFromResult:null, heatYear:new Date().getFullYear(), lastFocus:null,
  journalYear:'all',                       // filtre d’année du Journal : 'all' ou '2025' (chaîne, comme les dates)
  journalSessions:false,                   // Journal : montrer les sessions de lecture (pages du jour) entre les lectures (F40)
};
function clearSelection(){ ui.selection.clear(); ui.selectMode = false; document.body.classList.remove('selecting'); }
// Persistance des préférences d’affichage (filtres, tri, onglet)
function persistUI(){
  try{
    // Raccourci d’Aujourd’hui (« Voir les autres lectures », prêts…) : le filtre posé est un saut
    // pour voir, pas un choix. Tant que _shelfJump est levé, on réécrit celui que la personne
    // avait vraiment choisi (celui déjà en réserve) au lieu de l’écraser par celui du saut.
    const keep = ui._shelfJump ? (readSavedUI() || {}) : null;
    localStorage.setItem(UI_KEY, JSON.stringify({
      // defaultStatus n’est PAS persisté : un « Lu » choisi une fois pour saisir de vieilles
      // lectures se retrouvait encore actif des semaines plus tard, et tout ce qu’on ajoutait
      // était daté « lu aujourd’hui » à notre insu. Chaque ouverture repart de « À lire ».
      status: keep ? (keep.status ?? 'all') : ui.status,
      types: keep ? (keep.types ?? []) : [...ui.types],
      tag: keep ? (keep.tag ?? '') : ui.tag,
      sort:ui.sort, sortDesc:ui.sortDesc,
      groupSeries:ui.groupSeries, view:ui.view, typeMetric:ui.typeMetric, libLayout:ui.libLayout,
      ideas:ui.ideas, searchLang:ui.searchLang, journalYear:ui.journalYear, journalSessions:ui.journalSessions,
    }));
  }catch(_){}
}
// Préférences sauvegardées telles quelles (null si absentes ou illisibles)
function readSavedUI(){
  try{ const s = JSON.parse(localStorage.getItem(UI_KEY)||'null'); return (s && typeof s==='object') ? s : null; }catch(_){ return null; }
}
// Filtres de bibliothèque (statut, types, tag) repris d’un objet sauvegardé, valeurs par défaut sinon.
// Partagé entre le démarrage (restoreUI) et le retour dans l’onglet après un saut depuis Aujourd’hui.
function restoreLibFilters(saved){
  const s = (saved && typeof saved==='object') ? saved : {};
  ui.status = SMART_STATUS.includes(s.status) ? s.status : 'all';
  ui.types = new Set(Array.isArray(s.types) ? s.types.filter(t=>['livre','bd','manga'].includes(t)) : []);
  ui.tag = typeof s.tag==='string' ? s.tag : '';
  syncFilterChips();
}
// Reflète ui.status / ui.types dans les puces (le tag, lui, est reconstruit par renderLibrary)
function syncFilterChips(){
  $$('#status-chips .chip').forEach(x=>{ const on=x.dataset.status===ui.status; x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
  $$('#type-chips .chip[data-type]').forEach(x=>{ const on=ui.types.has(x.dataset.type); x.classList.toggle('active',on); x.setAttribute('aria-pressed',on); });
}

/* =============== Helpers métier =============== */
function authorsStr(b){ return (b.authors||[]).join(', '); }
function hasTomeInTitle(t){ return /\b(tome|vol(?:ume)?\.?|t\.)\s*\d/i.test(t); }
// Titre qui porte déjà sa série ET son numéro (« Dune, livre 1 », « One piece, épisode 5 : Thriller
// bark », notices de la BnF) : le préfixer donnait « Dune, tome 1 : Dune, livre 1 ». Un titre qui
// commence seulement par la série (« Harry Potter à l’école des sorciers ») garde son « tome 1 ».
function titleCarriesSeries(b){
  const s = String(b.series||'').toLowerCase(), t = String(b.title||'').toLowerCase();
  if(!s || t.length<=s.length || !t.startsWith(s)) return false;
  return /^[\s,:.–-]*(?:(?:tome|t\.|vol(?:ume)?\.?|livre|épisode|episode|partie|cycle|n[°o]|#)\s*)?(?:\d+|[ivxlcdm]+)(?![\p{L}\p{N}])/iu.test(t.slice(s.length));
}
function fullTitle(b){
  let t = b.title;
  if(b.series && b.volume!=null && titleCarriesSeries(b)) return t;
  if(b.series && b.volume!=null) t = `${b.series}, tome ${b.volume}` + (b.title && b.title.toLowerCase()!==b.series.toLowerCase() && !hasTomeInTitle(b.title) ? ` : ${b.title}` : '');
  else if(b.volume!=null && !hasTomeInTitle(b.title)) t = `${b.title}, tome ${b.volume}`;
  return t;
}
/* ---- Affiliation Amazon (liens d’achat / Kindle) ----
   Pour TOUCHER une commission : mets ton identifiant Amazon Partenaires dans AMAZON_TAG
   (ex : 'lucasm-21'), obtenu sur https://partenaires.amazon.fr. Sans identifiant, les boutons
   fonctionnent quand même mais ne rapportent rien. Lien de RECHERCHE (pas d’API à gérer). */
const AMAZON_TAG = '';
/* ---- Soutien volontaire ----
   Colle ici ton lien Ko-fi ou Liberapay (ex : 'https://ko-fi.com/lucastome') : le bouton
   « Soutenir Tome » apparaîtra dans Mon compte. Vide = aucun bouton nulle part. */
const SUPPORT_URL = '';
// Adresse de contact : la même que celle publiée dans LEGAL_TEXT (« Contact : … ») — rien de
// nouveau n'est exposé ; si elle change, changer les deux.
const CONTACT_EMAIL = 'lucas.marroig@essec.edu';
function contactHref(sujet){
  // Le corps ne contient que ce qui aide à comprendre un souci : version et appareil, jamais de données de lecture.
  const corps = `\n\n—\nTome ${location.host} · ${navigator.userAgent.replace(/\).*$/, ')')}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}
// Avis depuis l'app : même canal que les signalements (table reports, type « avis »), lisible par
// `npm run reports` côté serveur — pas d'adresse à saisir, pas de service tiers, anonyme si l'on veut.
async function sendFeedback(){
  const txt = await openDialog({
    title:'Ton avis sur Tome',
    message:'Ce qui te manque, ce qui coince, ce que tu aimes : tout est bon à prendre. Ton message part au responsable du site, avec l\u2019écran d\u2019où tu écris. Rien d\u2019autre.',
    input:{ multiline:true, placeholder:'Je trouve que\u2026' },
    actions:[{label:'Annuler', value:null, cancel:true},{label:'Envoyer', returnsInput:true, default:true}],
  });
  if(txt==null) return;
  const reason = String(txt).trim();
  if(reason.length<5){ toast('Écris au moins quelques mots.'); return; }
  try{
    await api('/api/report', { method:'POST', body:{ targetType:'avis', targetKey:'app:'+(ui.view||'?'), reason } });
    toast('Merci, ton avis est bien arrivé.');
  }catch(e){
    // hors ligne ou serveur indisponible : ne pas perdre le texte, proposer le mail
    const ok = await uiConfirm({ title:'Envoi impossible pour l\u2019instant', message:'Tu peux l\u2019envoyer par mail à la place, ton texte sera repris dans le message.', okLabel:'Ouvrir mon mail', cancelLabel:'Plus tard' });
    if(ok) location.href = contactHref('Avis sur Tome') + encodeURIComponent('\n' + reason);
  }
}
/* ---- Google Books ----
   Plus de clé ici : depuis F04, la recherche passe par /api/books (proxy du Worker), qui porte
   la clé éventuelle et met les réponses en cache 24 h à la bordure. Le navigateur ne contacte
   plus googleapis.com directement. */
// Langue de recherche : 'auto' devine d'après l'alphabet (cyrillique → ru, grec → el, japonais → ja…),
// sinon privilégie le français ; l'utilisateur peut forcer une langue dans la fenêtre de recherche.
function guessSearchLang(q){
  if(/[\u0400-\u04FF]/.test(q)) return 'ru';
  if(/[\u0370-\u03FF]/.test(q)) return 'el';
  if(/[\u3040-\u30FF]/.test(q)) return 'ja';
  if(/[\u4E00-\u9FFF]/.test(q)) return 'zh';
  if(/[\uAC00-\uD7AF]/.test(q)) return 'ko';
  if(/[\u0590-\u05FF]/.test(q)) return 'he';
  if(/[\u0600-\u06FF]/.test(q)) return 'ar';
  return 'fr';
}
function searchLangFor(q){ const pick = (ui.searchLang||'auto'); return pick==='auto' ? guessSearchLang(q) : pick; }                 // ← ton tag Amazon Partenaires ici (ex : 'lucasm-21')
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
  const n = Math.min(5, Math.max(0, Math.floor(r))); // borné (une note d’ami hors [0,5] ne casse pas le rendu)
  return '★'.repeat(n) + (r%1 ? '½' : '');
}
// Étoiles en lecture seule (cartes, journal, fil, profils) : le glyphe ★★★½ est muet ou lu
// « étoile noire, étoile noire… » par un lecteur d’écran ; role=img + libellé donnent « 3,5 sur 5 ».
// Vide quand il n’y a pas de note, comme les appels qu’elle remplace.
function starsHTML(r, style){
  r = Number(r);
  if(!r || Number.isNaN(r)) return '';
  return `<span class="stars" role="img" aria-label="${fmtDec(r)} sur 5"${style?` style="${style}"`:''}>${starsTxt(r)}</span>`;
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
// Note du livre ↔ notes de lecture. Les deux vivaient leur vie : on notait 4 sur la fiche et le
// Journal continuait d’afficher l’ancienne note de la lecture. Règle : tant qu’aucune lecture n’a
// de note qui lui est propre (toutes vides, ou toutes alignées sur l’ancienne note générale),
// elles suivent la note du livre. Une lecture notée à part, elle, n’est jamais écrasée.
// `prev` = note du livre AVANT la modification.
function syncReadingRatings(b, prev){
  const rs = b.readings || [];
  if(!rs.length) return;
  const suivent = rs.length===1 || rs.every(r => r.rating==null || r.rating===prev || r.rating===b.rating);
  if(suivent) rs.forEach(r => { r.rating = b.rating; });
}
// Valeur d’un toucher sur une étoile (règle F16, partagée par la fiche et le mode liste) : c’est
// la moitié touchée qui décide, toujours — re-toucher la même étoile du même côté ne change rien
// (avant, TOUT re-tap basculait plein ↔ demi, on n’osait plus confirmer une note de peur de la
// perdre). Seule exception : toucher la moitié déjà dorée d’une demi-étoile la complète, le geste
// naturel pour « finir » l’étoile sans viser ses 16 px de droite.
function tapRating(cur, el, clientX){
  const n = +el.dataset.n, half = halfFromClick(el, clientX);
  return (half && cur!==n-0.5) ? n-0.5 : n;
}
// Clavier d’un curseur d’étoiles (fiche, lecture, série, notation rapide, mode liste) : ← → et
// ↑ ↓ par demi-étoile, Home efface, End met 5 — le vocabulaire attendu d’un role=slider, le même
// partout. Retourne undefined si la touche n’est pas du curseur (l’appelant laisse passer
// l’événement) et null quand la note est effacée.
function sliderKeyValue(key, cur){
  cur = cur || 0;
  if(key==='ArrowRight' || key==='ArrowUp') return Math.min(5, cur+0.5);
  if(key==='ArrowLeft' || key==='ArrowDown'){ const v = cur-0.5; return v<0.5 ? null : v; }
  if(key==='Home') return null;
  if(key==='End') return 5;
  return undefined;
}
// Pose la note d’un livre d’où qu’elle vienne (fiche, clavier, glissé, mode liste) : les lectures
// qui la suivaient suivent, et le cache des lectures — qui photographie leurs notes — est purgé,
// sinon le Journal et les stats gardaient l’ancienne note jusqu’au prochain changement de statut.
function setBookRating(b, v){
  const prev = b.rating; b.rating = v;
  syncReadingRatings(b, prev);
  invalidateCache();
}
// Glissé continu sur une rangée d’étoiles (fiche, série, notation rapide, lectures, mode liste) :
// au doigt, viser la moitié gauche d’une étoile relevait du tir de précision. On glisse, la note
// se prévisualise en continu par demi-étoile, et se pose au relâchement. Délégué au conteneur
// (les hôtes sont réécrits en innerHTML à chaque rendu). Un toucher sans déplacement (< 8 px)
// ne capture rien et laisse les handlers click faire leur travail (règle du toucher, F16) ;
// après un glissé, le click qui suit est neutralisé (data-dragged) pour ne pas re-noter au
// relâchement. Le verrou saute au geste suivant si aucun click n’est venu (glissé annulé).
function bindStarSlider(root, selector, onCommit){
  let host = null, x0 = 0, v = null, orig = '', origNow = null;
  const valueAt = x => { const r = host.getBoundingClientRect(); return Math.max(0.5, Math.min(5, Math.ceil(((x - r.left) / r.width) * 10) / 2)); };
  const setAria = val => { if(host.hasAttribute('aria-valuenow')){ host.setAttribute('aria-valuenow', val); host.setAttribute('aria-valuetext', ratingText(val)); } };
  const preview = x => {
    v = valueAt(x);
    host.innerHTML = starInputHTML(v, host.classList.contains('rstars') ? 'rst' : 'st');
    setAria(v);
  };
  const end = () => { if(host) delete host.dataset.drag; host = null; v = null; };
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest(selector); if(!h) return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    delete h.dataset.dragged;
    host = h; x0 = e.clientX; v = null; orig = h.innerHTML; origNow = +h.getAttribute('aria-valuenow') || 0;
  });
  root.addEventListener('pointermove', e => {
    if(!host) return;
    if(!host.dataset.drag){
      if(Math.abs(e.clientX - x0) < 8) return;
      host.dataset.drag = '1';
      try{ host.setPointerCapture(e.pointerId); }catch(_){}
    }
    preview(e.clientX);
  });
  root.addEventListener('pointerup', () => {
    if(!host) return;
    const h = host, val = v, dragged = !!h.dataset.drag;
    end();
    if(!dragged || !val) return;
    h.dataset.dragged = '1';
    onCommit(h, val);
  });
  // glissé interrompu (le navigateur a pris le geste pour un défilement) : on rend l’état d’avant
  root.addEventListener('pointercancel', () => { if(host && host.dataset.drag){ host.innerHTML = orig; setAria(origNow); } end(); });
  root.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest(selector);
    if(h && h.dataset.dragged){ delete h.dataset.dragged; e.stopPropagation(); e.preventDefault(); }
  }, true);
}
// Couvertures Google Books / Open Library chargées en anonyme : coupe l’envoi des
// cookies tiers (join du compte Google ↔ liste de lecture). Réservé au catalogue, qui supporte CORS ;
// une couverture perso hébergée ailleurs reste sans crossorigin pour ne pas casser son affichage.
function xorigin(u){ return CACHEABLE_COVER.test(u||'') ? ' crossorigin="anonymous"' : ''; }
function coverHTML(b, mini=false){
  // draggable=false : sur Chrome Android, un défilement amorcé sur une couverture partait en
  // glisser-déposer d’image et avalait le geste — l’appui long de sélection compris.
  if(b.cover) return `<img src="${esc(b.cover)}" alt="" loading="lazy" draggable="false"${xorigin(b.cover)} referrerpolicy="no-referrer" data-fb="${esc(b.id)}">`;
  return phHTML(b, mini);
}
// Couverture manquante : un « livre » d’éditeur à la Fitzcarraldo — aplat d’encre choisi
// dans une petite palette par type (déterministe via le titre), titre composé en Garamond,
// filet intérieur et tranche en CSS. Le placeholder devient un objet de marque, pas une absence.
const PH_INKS = {
  livre: ['#1f4560', '#2e4d38', '#2b2620', '#41465a'],
  bd:    ['#8a4a1f', '#9c332a', '#6d5416', '#374a24'],
  manga: ['#4a2b40', '#9c332a', '#233c52', '#5c2323'],
};
function phInk(b){
  const inks = PH_INKS[b.type] || PH_INKS.livre;
  return inks[hashStr(String(b.title||'') + '|' + String((b.authors||[])[0]||'')) % inks.length];
}
// Livres venus du Worker (profil, page publique) : auteurs en chaîne, type parfois absent.
function phPubHTML(b){ return phHTML({title:b.title, type:b.type||'livre', authors:[b.authors||''].flat().filter(Boolean)}); }
function phHTML(b, mini=false){
  const ink = phInk(b);
  if(mini) return `<div class="ph-mini" style="background:${ink}"><span>${esc((fullTitle(b)||'?').trim().charAt(0).toUpperCase())}</span></div>`;
  return `<div class="ph" style="background:${ink}">
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
  if(gi.done >= gi.goal) return `<span class="pace ahead">objectif atteint </span>`;
  if(gi.delta > 0) return `<span class="pace ahead">${plur(gi.delta,'lecture')} d’avance</span>`;
  // « 3 de retard » laissait deviner l’unité : on dit de quoi on a du retard.
  if(gi.delta < 0) return `<span class="pace behind">${plur(-gi.delta,'lecture')} de retard</span>`;
  return `<span class="pace">pile à jour</span>`;
}
async function setGoal(year){
  const cur = state.goals[String(year)] || '';
  const v = await uiPrompt({ title:`Objectif de lecture ${year}`, message:'Nombre de livres à lire cette année. Laisse vide pour retirer l’objectif.', value:String(cur), placeholder:'ex : 24', type:'number', okLabel:'Enregistrer' });
  if(v===null) return;
  const n = parseInt(v, 10);
  if(!n || n<1) delete state.goals[String(year)];
  else state.goals[String(year)] = n;
  save(); render();
}

/* =============== Thème =============== */
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  $('#meta-theme').setAttribute('content', t==='light' ? '#f7f6f2' : '#15120d');
  // Un interrupteur nommé par son état (« Thème sombre », enfoncé ou non) plutôt qu’un « Changer
  // de thème » qui ne dit pas où l’on est.
  const bt = $('#btn-theme');
  bt.innerHTML = ic('contrast',18);
  bt.setAttribute('aria-pressed', String(t==='dark'));
  bt.setAttribute('aria-label', 'Thème sombre'); bt.title = 'Thème sombre';
  syncThemeSeg();
}
function systemTheme(){ return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
// Le choix ENREGISTRÉ (pas le thème affiché) : 'auto' tant que l’utilisateur n’a rien figé.
function themeChoice(){ let t = ''; try{ t = localStorage.getItem(THEME_KEY) || ''; }catch(_){} return t==='light' || t==='dark' ? t : 'auto'; }
// Le segment Auto / Clair / Sombre de Mon compte › Affichage reflète le choix enregistré ; le
// bouton de l’en-tête (bascule rapide) et lui pilotent la même clé, d’où la synchro ici.
function syncThemeSeg(){
  const choice = themeChoice();
  $$('#theme-seg [data-theme-pick]').forEach(b=>{ const on = b.dataset.themePick===choice; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
applyTheme(themeChoice()==='auto' ? systemTheme() : themeChoice());
// tant que l’utilisateur n’a pas choisi lui-même, le thème suit le réglage du système en direct
// (passage auto clair/sombre au coucher du soleil sur mobile) ; son premier clic fige son choix
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', e=>{
  if(themeChoice()==='auto') applyTheme(e.matches ? 'light' : 'dark');
});
$('#btn-theme').addEventListener('click', ()=>{
  const t = document.documentElement.dataset.theme==='light' ? 'dark' : 'light';
  try{ localStorage.setItem(THEME_KEY, t); }catch(_){}
  applyTheme(t);
});
// « Auto » efface le choix : c’est le seul moyen de revenir au suivi du système une fois qu’on a
// touché au bouton de l’en-tête (qui, lui, fige toujours un thème).
$('#theme-seg').addEventListener('click', e=>{
  const b = e.target.closest('[data-theme-pick]'); if(!b) return;
  const v = b.dataset.themePick;
  try{ if(v==='auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); }catch(_){}
  applyTheme(v==='auto' ? systemTheme() : v);
});

/* =============== Navigation =============== */
// Passe à true une fois la vue initiale posée : la vue restaurée au démarrage ne doit pas
// pousser d’entrée d’historique (le premier Retour quitterait l’app sans rien changer à l’écran).
let _navReady = false;
// Position de défilement par onglet : quitter Bibliothèque à 2 000 px puis y revenir doit retrouver
// la même étagère, pas la remettre en haut. Un filtre ou un tri changé remet la sienne à zéro (la
// liste n’est plus la même), et retaper l’onglet courant ramène en haut (le geste attendu).
const _scrollByView = {};
$('#nav').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]'); if(!btn) return;
  // Retour volontaire dans Bibliothèque après un saut depuis Aujourd’hui : on rend le filtre que
  // la personne avait choisi elle-même (celui resté en réserve), pas celui du saut.
  if(btn.dataset.view==='library' && ui._shelfJump){ ui._shelfJump=false; restoreLibFilters(readSavedUI()); _scrollByView.library=0; }
  selectView(btn.dataset.view, {focus:true});
});
const VIEW_LABEL = {today:'Aujourd’hui', library:'Bibliothèque', journal:'Journal', lists:'Listes', stats:'Stats', friends:'Amis', account:'Mon compte'};
// opts.focus : l’appel vient d’un geste de navigation (onglet, bouton Mon compte, Alt+chiffre).
// Le titre du document suit la vue et le focus se pose sur son titre : sans ça un lecteur d’écran
// n’entend rien au changement d’onglet et repart de la barre de navigation. Les appels internes
// (routage au démarrage, retour d’une modale, sauts « voir ma bibliothèque ») ne bougent pas le focus.
function selectView(view, opts={}){
  if(view!==ui.view) _scrollByView[ui.view] = window.scrollY; else _scrollByView[view] = 0;
  ui.view = view;
  $$('#nav button').forEach(b=>{
    const on = b.dataset.view===view;
    b.classList.toggle('active', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $$('.view').forEach(v=>v.classList.toggle('active', v.id === 'view-'+view));
  // « Mon compte » n’a pas d’onglet : c’est le bouton avatar de l’en-tête qui dit qu’on y est.
  const me = $('#btn-me');
  if(me){ me.classList.toggle('on', view==='account'); if(view==='account') me.setAttribute('aria-current','page'); else me.removeAttribute('aria-current'); }
  // Sur l’écran de connexion/inscription, un « + » flottant n’a aucun sens (et recouvre le
  // bouton de validation sur mobile) ; il revient dès qu’on change de vue ou qu’on est connecté.
  const fab = $('#fab');
  if(fab){
    fab.hidden = ((view==='friends' || view==='account') && !social.me);
    // Sur téléphone le FAB est le seul « + » de l’écran, et il ne fait pas la même chose partout :
    // un livre dans toutes les vues, une liste dans Listes. Un lecteur d’écran qui annonce
    // « Ajouter » ne dit donc rien d’utile — le nom suit l’onglet, l’infobulle aussi.
    const fabLbl = view==='lists' ? 'Nouvelle liste' : 'Ajouter un livre';
    fab.setAttribute('aria-label', fabLbl);
    fab.title = fabLbl;
  }
  // Le profil d’un ami est un sous-écran de l’onglet Amis : quitter l’onglet l’abandonne,
  // sinon son entrée d’historique survivrait à la navigation et Retour y reviendrait.
  if(view!=='friends' && social.view==='profile'){ social.view=null; social.profile=null; }
  // Retour Android/geste iOS : le PREMIER changement d’onglet pousse une entrée (marquée tomeTab,
  // clé distincte de tomeOverlay), pour revenir à Aujourd’hui au lieu de quitter l’application ;
  // les changements suivants la remplacent — une seule entrée d’onglet, un seul appui pour sortir.
  try{
    const st = history.state || {};
    if(_navReady && view!=='today' && !st.tomeTab && !st.tomeOverlay) history.pushState({tomeTab:1}, '', '#'+view);
    else if(location.hash.slice(1) !== view) history.replaceState(st, '', '#'+view);
  }catch(_){}
  persistUI();
  render();
  // sans cela on arrive au milieu de la nouvelle vue, à la hauteur où on avait laissé l’ancienne
  // (ou en haut si on n’y était jamais venu) — et jamais à celle de la vue qu’on quitte
  if(!ui._noScrollReset) window.scrollTo({top:_scrollByView[view]||0, behavior:'instant'});
  // Le titre suit la vue dès que l’app est posée (Retour du navigateur, sauts internes compris),
  // pas seulement sur un geste de navigation — sinon l’onglet gardait le nom de la vue quittée.
  // Avant _navReady, le titre d’origine reste : c’est celui que voient les visiteurs de l’accueil.
  if(_navReady) document.title = `${VIEW_LABEL[view]||'Tome'} · Tome`;
  if(opts.focus){
    const h = $('#view-'+view+' h2');
    if(h){ h.tabIndex = -1; h.focus({preventScroll:true}); }
  }
}
function render(){
  renderDemoBanner();   // bandeau global : la démo se signale dans toutes les vues, pas seulement Bibliothèque
  syncMeButton();       // idem pour l’avatar de l’en-tête : il suit la session quel que soit le chemin
  if(ui.view==='today') renderToday();
  else if(ui.view==='library') renderLibrary();
  else if(ui.view==='journal') renderJournal();
  else if(ui.view==='lists') renderLists();
  else if(ui.view==='stats') renderStats();
  else if(ui.view==='friends') renderFriends();
  else if(ui.view==='account') renderAccountView();
}
// Rendu du fond différé quand une modale est ouverte (inutile de repeindre une vue cachée)
let _rafRender = 0;
function scheduleRender(){
  if(document.querySelector('.overlay.open')){ _dirtyBg = true; return; }
  if(_rafRender) return;
  _rafRender = requestAnimationFrame(()=>{ _rafRender = 0; render(); });
}
let _dirtyBg = false;
// Écriture d’une autre fenêtre reçue pendant qu’une modale était ouverte (JSON brut) : appliquée
// à la fermeture de la modale plutôt que sous les doigts de l’utilisateur — voir l’écouteur 'storage'.
let _externalState = null;

/* =============== Aujourd’hui =============== */
function todayGreeting(){
  const h = new Date().getHours();
  return h < 18 ? 'Bonjour' : 'Bonsoir';
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
  b.currentPct = null;   // une page connue remplace l’estimation en % (F40)
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
  // Sans email collecté, le code de secours est la SEULE voie de récupération : un compte qui
  // n’en a pas est définitivement perdu si le mot de passe l’est. On le dit, et on le repropose
  // tous les 30 jours tant que ce n’est pas fait.
  let recSnooze = 0;
  try{ recSnooze = +localStorage.getItem('tome-rec-snooze') || 0; }catch(_){ }
  if(social.me && social.hasRecovery===false && Date.now()-recSnooze > 30*864e5){
    cards.push(`<button class="today-mini urgent" data-today-recovery>
      <span><small>Sécurité du compte</small><b>Aucun code de secours</b><em>Sans lui, un mot de passe oublié = compte perdu</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
    </button>`);
  }
  const unrated = unratedBooks();
  if(unrated.length) cards.push(`<button class="today-mini" data-today-rate>
    <span><small>Sans note</small><b>${plur(unrated.length,'lecture')}</b><em>Les noter en moins d’une minute</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
  </button>`);
  if(due.length) cards.push(`<button class="today-mini" data-today-study>
    <span><small>À réviser</small><b>${plur(due.length,'carte')}</b><em>Session de moins de 5 min</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
  </button>`);
  if(loans.length){
    const first = loans[0], detail = first.due ? first.due.text : `${plur(loans.length,'prêt')} en cours`;
    cards.push(`<button class="today-mini ${first.due&&first.due.days<0?'urgent':''}" data-today-loans>
      <span><small>Prêts</small><b>${plur(loans.length,'livre')}</b><em>${esc(detail)}</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
    </button>`);
  }
  cards.push(`<button class="today-mini" data-today-goal>
    <span><small>Objectif ${new Date().getFullYear()}</small><b>${gi?fmtRatio(gi.done, gi.goal):'À définir'}</b><em>${gi?(gi.done>=gi.goal?'Objectif atteint':gi.delta<0?`${plur(-gi.delta,'lecture')} à rattraper`:'Tu tiens le rythme'):'Donne un cap à ton année'}</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
  </button>`);
  if(next) cards.push(`<button class="today-mini" data-today-open="${esc(next.b.id)}">
    <span><small>Dans ta pile</small><b>${esc(fullTitle(next.b))}</b><em>${esc(next.why)}</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
  </button>`);
  // Installer : proposé au bon moment (l’utilisateur a une vraie bibliothèque), une seule fois,
  // et jamais si l’app est déjà installée — le bouton des réglages reste le chemin permanent.
  let installDismissed = false;
  try{ installDismissed = !!localStorage.getItem('tome-install-hidden'); }catch(_){ }
  const canInstall = !isStandalone() && (installEvt || isIOSDevice()) && !installDismissed
    && (state.books||[]).filter(b=>!(b.tags||[]).includes('exemple')).length >= 3;
  const extra = canInstall ? `<button class="today-mini" data-today-install>
    <span><small>Toujours à portée</small><b>Installer Tome</b><em>Sur ton écran d’accueil, même hors ligne</em></span><span class="today-arrow" aria-hidden="true">${ic('chevron',18)}</span>
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
          <div class="today-progress-meta"><span>${esc(progressLine(reading))}</span>${pct!==null?`<strong>${fmtPct(pct)}</strong>`:''}</div>
          ${(reading.pages || pct!==null)?`<div class="today-track" role="progressbar" aria-label="Progression de lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct||0}"><span style="width:${pct||0}%"></span></div>`:''}
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
    <span class="today-empty-icon orn" aria-hidden="true">❦</span><div><div class="today-kicker">Prochaine page</div><h3>Que vas-tu lire maintenant ?</h3><p>Ajoute un titre à ta pile ou commence un livre de ta bibliothèque.</p></div>
    <div class="today-actions"><button class="btn primary" data-today-add>Ajouter un livre</button><button class="btn" data-today-library>Explorer ma bibliothèque</button></div>
  </section>`;
  return `<section class="today-card today-empty today-first">
    <span class="today-empty-icon orn" aria-hidden="true">❦</span><div><div class="today-kicker">Bienvenue dans Tome</div><h3>Construis le journal de ta vie de lecteur.</h3><p>Ajoute ton premier livre ou importe ta bibliothèque existante. Tout restera disponible hors ligne.</p></div>
    <div class="today-actions"><button class="btn primary" data-today-add="read">Ajouter mon premier livre</button><button class="btn" data-today-import>Importer depuis Goodreads ou Babelio</button></div>
  </section>`;
}
function renderToday(){
  const reading = lastReadingBook();
  const now = new Date();
  $('#today-date').textContent = new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(now);
  { // folio du titre courant : lectures de l'année · taille de la bibliothèque
    const yr = String(now.getFullYear());
    const lus = state.books.filter(b=>b.status==='read' && (b.readings||[]).some(r=>String(r.date||'').startsWith(yr))).length;
    const fol = $('#today-folio'); if(fol) fol.textContent = `${plur(lus,'lecture')} en ${yr} · ${plur(state.books.length,'titre')}`;
  }
  const firstName = social.me && String(social.me.displayName||'').trim().split(/\s+/)[0];
  // Tant que la bibliothèque n’est QUE de la démo, l’écran d’accueil le dit : « La Horde du
  // Contrevent, page 210 » ne doit pas se lire comme la lecture en cours de l’utilisateur.
  const demoOnly = state.books.some(isDemoBook) && !state.books.some(b=>!isDemoBook(b));
  $('#today-subtitle').textContent = `${demoOnly?'Bibliothèque d’exemple. ':''}${todayGreeting()}${firstName?' '+firstName:''}. ${reading?`Tu en es où de « ${fullTitle(reading)} » ?`:'Pas de lecture en cours. Tu ouvres quoi ensuite ?'}`;
  // Une « série » d’un seul jour n’en est pas une : on ne l’affiche qu’à partir de deux jours
  // (même seuil que la pill du header, updateStreakPill).
  const sk=streaks(), streak=$('#today-streak');
  streak.hidden=sk.cur<2; streak.textContent=sk.cur>=2?`${sk.cur} jours d’affilée`:'';
  $('#today-body').innerHTML = `<div class="today-grid"><div>${todayFocusHTML(reading)}</div><aside class="today-side" aria-label="À ne pas oublier">${todayMiniCards(reading)}</aside></div>
    <section class="today-card today-ideas" id="ideas-today-wrap" hidden aria-labelledby="ideas-today-title"><div class="today-section-head"><div><div class="today-kicker">Découvrir</div><h3 id="ideas-today-title">Idées du jour</h3></div></div><div id="ideas-today"></div></section>
    <section class="today-card today-social" aria-labelledby="today-social-title"><div class="today-section-head"><div><div class="today-kicker">Ton cercle de lecture</div><h3 id="today-social-title">Chez tes amis</h3></div><button data-today-friends>Voir le fil →</button></div><div id="today-social-feed"></div></section>`;
  $('#ideas-today-wrap').addEventListener('click', onIdeaAdd);
  renderDailyIdeas();
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
  if(!feed.length){ el.innerHTML=`<div class="today-social-empty"><p>Ton fil est encore calme. Invite un ami pour commencer à partager vos lectures.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn primary" data-today-invite>${ic('link',16)} Inviter un ami</button><button class="btn" data-today-friends>Voir mes amis</button></div></div>`; return; }
  el.innerHTML=`<div class="today-feed">${feed.map(x=>`<button class="today-feed-row" data-today-friends>
    <span class="today-feed-cover">${x.cover?`<img src="${esc(x.cover)}" alt="" loading="lazy"${xorigin(x.cover)} referrerpolicy="no-referrer">`:phHTML({title:x.title, authors:[], type:x.type}, true)}</span>
    <span class="today-feed-copy"><b>${social.me&&x.uid===social.me.id?'Tu':esc(x.display_name)}</b><span>${social.me&&x.uid===social.me.id?'as lu':'a lu'} <strong>${esc(x.title)}</strong>${x.rating?` · ${starsHTML(x.rating)}`:''}</span></span>
    <time>${x.read_date?esc(new Date(x.read_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})):''}</time>
  </button>`).join('')}</div>`;
  loadTodayFeed();
}
$('#today-body').addEventListener('click', async e=>{
  const open=e.target.closest('[data-today-open]'); if(open){ openDetail(open.dataset.todayOpen); return; }
  const step=e.target.closest('[data-today-step]'); if(step){ const b=state.books.find(x=>x.id===step.dataset.book); if(b) setProgress(b,(b.currentPage||0)+Number(step.dataset.todayStep)); return; }
  const exact=e.target.closest('[data-today-exact]'); if(exact){
    const b=state.books.find(x=>x.id===exact.dataset.todayExact); if(!b) return;
    const v=await uiPrompt({title:`Progression de « ${fullTitle(b)} »`,message:b.pages?`Entre une page entre 0 et ${b.pages}.`:'Entre la page où tu t’es arrêté.',value:String(b.currentPage||''),placeholder:'Page',type:'number',okLabel:'Enregistrer'});
    if(v!==null && v!==''){ const n=Number(v); if(Number.isFinite(n) && n>=0) setProgress(b,n); else toast('Entre un numéro de page valide'); } return;
  }
  const finish=e.target.closest('[data-today-finish]'); if(finish){ const b=state.books.find(x=>x.id===finish.dataset.todayFinish); if(b){ markRead(b); save(); render(); } return; }
  // Reprendre un livre déjà terminé : la progression repart de zéro, sinon la fiche s’ouvre
  // « en cours » bloquée à 100 % et le ＋10 n’a plus aucun effet.
  const start=e.target.closest('[data-today-start]'); if(start){ const b=state.books.find(x=>x.id===start.dataset.todayStart); if(b){ if(b.pages && (b.currentPage||0)>=b.pages) updateBookProgress(b,0); b.status='reading'; syncStartedAt(b); if(b.currentPage==null)b.currentPage=0; save(); render(); toast('Bonne lecture'); } return; }
  if(e.target.closest('[data-today-recovery]')){
    social.view=null; selectView('account');
    setTimeout(()=>{ const el=$('#acc-rec'); if(el){ el.scrollIntoView({block:'center'}); el.focus(); } }, 220);
    try{ localStorage.setItem('tome-rec-snooze', String(Date.now())); }catch(_){ }
    return;
  }
  if(e.target.closest('[data-today-invite]')){
    if(social.me) shareInvite();                       // partage direct du lien
    else { social.tab='feed'; social.view=null; selectView('friends'); renderAuth($('#friends-body'),'signup'); }
    return;
  }
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
  // Le statut pré-sélectionné suit la porte d’entrée : « Ajouter mon premier livre » ouvre le
  // journal d’une vie de lecteur (donc « Lu »), « Ajouter un livre » alimente la pile (« À lire »).
  { const ta = e.target.closest('[data-today-add]'); if(ta){ openSearch({status: ta.dataset.todayAdd || 'wishlist'}); return; } }
  if(e.target.closest('[data-today-import]')){ selectView('account'); $('#btn-import-csv').click(); return; }
  if(e.target.closest('[data-today-friends]')){ social.tab='feed'; social.view=null; selectView('friends'); return; }
});
function openTodayShelf(status){
  ui.status=status; ui.types.clear(); ui.q=''; ui.tag='';
  $('#lib-q').value=''; $('#lib-tag').value='';
  syncFilterChips();
  // Un raccourci d’Aujourd’hui pose un filtre pour voir, pas pour rester : on ne l’écrit pas
  // par-dessus celui que la personne avait choisi (persistUI garde ce dernier en réserve tant que
  // _shelfJump est levé) et l’onglet Bibliothèque le lui rendra au prochain appui. « Tout » n’est
  // pas un saut mais une remise à plat (import, « Ma bibliothèque ») : il se persiste.
  ui._shelfJump = status!=='all';
  _scrollByView.library = 0;
  selectView('library');
}
// Remplace une seule carte au lieu de reconstruire toute la grille (garde scroll/décodage des autres).
// En mode liste, c’est une rangée qui est remplacée — sinon une note posée depuis la liste
// transformait la rangée en affiche de grille au milieu des autres.
function patchCard(id){
  const el = document.querySelector('#lib-grid .card[data-id="'+CSS.escape(id)+'"]');
  const b = state.books.find(x=>x.id===id);
  if(el && b){ el.outerHTML = ui.libLayout==='list' ? bookRowHTML(b) : bookCardHTML(b); return true; }
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
  libFilterChanged(); renderLibrary();
});
// Un filtre ou un tri choisi à la main est un vrai choix : il lève un éventuel saut depuis
// Aujourd’hui (donc se persiste), et la liste change, donc on repartira du haut au retour.
function libFilterChanged(){ ui._shelfJump=false; _scrollByView.library=0; persistUI(); }
// « Filtre : En cours · Tout afficher » dans le décompte : le lien remet la bibliothèque à plat
$('#lib-count').addEventListener('click', e => { if(e.target.closest('#lib-showall')) resetFilters(); });
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
  libFilterChanged(); renderLibrary();
});
const _rerunLib = debounce(renderLibrary, 160);
$('#lib-more').addEventListener('click', ()=>{
  const expanded = !$('#filterbar').classList.toggle('compact'); // classe présente = replié
  $('#lib-more').setAttribute('aria-expanded', expanded);
});
$('#lib-q').addEventListener('input', e => { ui.q = fold(e.target.value).trim(); _scrollByView.library=0; _rerunLib(); });
$('#lib-sort').addEventListener('change', e => { ui.sort = e.target.value; libFilterChanged(); renderLibrary(); });
$('#lib-tag').addEventListener('change', e => { ui.tag = e.target.value; libFilterChanged(); renderLibrary(); });
// Sens du tri : « Ajout récent » à l’envers donne les plus anciens, « Titre A→Z » devient Z→A…
$('#lib-dir').addEventListener('click', ()=>{ ui.sortDesc = !ui.sortDesc; syncSortDirBtn(); libFilterChanged(); renderLibrary(); });
function syncSortDirBtn(){
  const btn = $('#lib-dir'); if(!btn) return;
  btn.setAttribute('aria-pressed', String(ui.sortDesc));
  btn.textContent = ui.sortDesc ? '↑' : '↓';
}
// Retour au tri par défaut (après un import ou une session d’ajout : les nouveaux venus en tête)
function resetSort(){ ui.sort = 'added'; ui.sortDesc = false; $('#lib-sort').value = 'added'; syncSortDirBtn(); }

function filteredBooks(){
  let arr = state.books.slice();
  if(ui.status==='fav') arr = arr.filter(b=>b.favorite);
  else if(ui.status==='loan') arr = arr.filter(b=>b.loan);
  else if(ui.status!=='all') arr = arr.filter(b=>b.status===ui.status);
  if(ui.types.size) arr = arr.filter(b=>ui.types.has(b.type));
  if(ui.tag) arr = arr.filter(b=>(b.tags||[]).includes(ui.tag));
  if(ui.q) arr = arr.filter(b => bookHaystack(b).includes(ui.q));
  // décorer → trier → restituer : fullTitle/authorsStr et le collateur ne tournent qu’en O(n)
  const dec = arr.map(b => ({ b, t:fullTitle(b), a:authorsStr(b) }));
  const cmp = {
    added:(x,y)=> (y.b.addedAt||'').localeCompare(x.b.addedAt||''),
    // dernière lecture datée la plus récente en tête ; sans date (« Lu » sans jour connu, pile), en fin
    read:(x,y)=> lastReadDate(y.b).localeCompare(lastReadDate(x.b)) || COLL.compare(x.t, y.t),
    rating:(x,y)=> (y.b.rating||0)-(x.b.rating||0) || COLL.compare(x.t, y.t),
    title:(x,y)=> COLL.compare(x.t, y.t),
    author:(x,y)=> COLL.compare(x.a, y.a) || (x.b.volume??0)-(y.b.volume??0) || COLL.compare(x.t, y.t),
    year:(x,y)=> (y.b.year||0)-(x.b.year||0) || COLL.compare(x.t, y.t),
  }[ui.sort] || ((x,y)=> (y.b.addedAt||'').localeCompare(x.b.addedAt||''));
  const out = dec.sort(cmp).map(o => o.b);
  return ui.sortDesc ? out.reverse() : out;
}
function bookHaystack(b){
  return fold(b.title+' '+authorsStr(b)+' '+(b.series||'')+' '+(b.tags||[]).join(' ')+' '+
    (b.review||'')+' '+(b.synopsis||'')+' '+(b.moods||[]).join(' ')+' '+
    (b.quotes||[]).map(q=>q.text).join(' '));
}
function progressPct(b){
  if(b.pages && b.currentPage) return Math.min(100, Math.round(b.currentPage / b.pages * 100));
  // F40 : sans pagination, la saisie « 35 % » porte la barre à elle seule
  if(!b.pages && b.currentPct!=null) return Math.min(100, Math.round(b.currentPct));
  return null;
}
// F40 : la saisie de progression accepte une page (« 210 ») ou un pourcentage (« 35 % » — ou « ,35 »,
// car le pavé décimal du mobile n’a pas de touche %). Pagination connue : le % devient une page ;
// inconnue : il est gardé tel quel (currentPct). null = champ vide ou illisible.
function parseProgressInput(v, b){
  const s = String(v==null ? '' : v).replace(/\s/g,'').replace(',', '.');
  if(!s) return null;
  let pct = null;
  const m = s.match(/^(\d{1,3})%$/);
  if(m) pct = +m[1];
  else if(/^0?\.\d{1,2}$/.test(s)) pct = Math.round(parseFloat(s)*100);
  if(pct!==null){ pct = Math.min(100, pct); return b.pages ? {page: Math.round(pct/100*b.pages)} : {pct}; }
  const n = numOrNull(s);
  return n===null ? null : {page:n};
}
// Ce que montre le champ « Ma progression » : la page, sinon le % estimé, sinon rien
function progressFieldValue(b){ return b.currentPage ?? (b.currentPct!=null ? fmtPct(b.currentPct) : ''); }
// « reste 526 p. » — vide tant que rien n’est lu ou que la pagination manque
function pagesLeftText(b){
  const n = (b.pages && b.currentPage) ? b.pages - b.currentPage : 0;
  return n>0 ? `reste ${n}\u00A0p.` : '';
}
// Ligne d’Aujourd’hui : « Page 210 sur 736 · reste 526 p. »
function progressLine(b){
  if(b.currentPage){ const left = pagesLeftText(b); return `Page ${b.currentPage}${b.pages?` sur ${b.pages}`:''}${left?` · ${left}`:''}`; }
  if(!b.pages && b.currentPct!=null) return 'Progression estimée';
  return 'Progression non renseignée';
}
function renderNowReading(){
  const strip = $('#now-reading');
  const reading = state.books.filter(b=>b.status==='reading');
  if(ui.status!=='all' || !reading.length){ strip.hidden = true; strip.innerHTML=''; return; }
  strip.hidden = false;
  strip.innerHTML = reading.map(b=>{
    const pct = progressPct(b);
    return `<div class="now-card" data-id="${esc(b.id)}">
      <button type="button" class="now-hit" aria-label="Ouvrir la lecture en cours : ${esc(fullTitle(b))}"></button>
      <div class="mini">${coverHTML(b, true)}</div>
      <div class="ni">
        <div class="nt">${esc(fullTitle(b))}</div>
        <div class="track"><div class="fill" style="width:${pct??0}%"></div></div>
        <div class="np">${b.currentPage ? `p. ${b.currentPage}${b.pages?' / '+b.pages:''}${pct!==null ? ` · ${fmtPct(pct)}` : ''}` : pct!==null ? fmtPct(pct) : 'progression non renseignée'}</div>
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
// Repeint la progression LÀ OÙ ELLE EST DÉJÀ AFFICHÉE, sans reconstruire le DOM : reconstruire
// détruit le bouton sous le doigt (le tap suivant tombe dans le vide) et referme le clavier
// mobile. Renvoie true si quelque chose a été patché — l’appelant sait alors qu’un rendu complet
// est inutile. Ne patche jamais une vue cachée : elle sera repeinte par render() en la rouvrant.
function patchProgressUI(b){
  const pct = progressPct(b);
  let done = false;
  if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')){
    const row = $('#detail-body .prog-row');
    if(row){
      const inp = row.querySelector('#d-page');
      if(inp) inp.value = progressFieldValue(b);      // reflète l’éventuel plafonnement à b.pages, ou le % (F40)
      const fill = row.querySelector('.fill'); if(fill) fill.style.width = (pct??0)+'%';
      const val = row.querySelector('b'); if(val) val.textContent = pct!==null ? fmtPct(pct) : '—';
      const rest = row.querySelector('.prog-rest'); if(rest) rest.textContent = pagesLeftText(b);
      done = true;
    }
  }
  if(ui.view==='today'){
    const focus = $('#today-body .today-focus');
    const step = focus && focus.querySelector('[data-today-step]');
    if(step && step.dataset.book===b.id){
      const meta = focus.querySelector('.today-progress-meta');
      const line = meta && meta.querySelector('span');
      if(line) line.textContent = progressLine(b);
      if(meta){
        let strong = meta.querySelector('strong');
        if(pct===null){ if(strong) strong.remove(); }
        else { if(!strong){ strong = document.createElement('strong'); meta.append(strong); } strong.textContent = fmtPct(pct); }
      }
      const track = focus.querySelector('.today-track');
      if(track){
        track.setAttribute('aria-valuenow', String(pct||0));
        const fill = track.querySelector('span'); if(fill) fill.style.width = (pct||0)+'%';
      }
      done = true;
    }
  }
  return done;
}
function setProgress(b, page){
  const prev = b.currentPage;                      // pour l’annulation : la page d’AVANT le geste
  updateBookProgress(b, page);
  save();
  // Un rendu complet n’est nécessaire que si la progression n’est visible nulle part à l’écran.
  if(!patchProgressUI(b) || $('.overlay.open')) scheduleRender();
  if(b.pages && b.currentPage >= b.pages && b.status!=='read'){
    // proposition non bloquante (pas de dialogue qui coupe la saisie)
    toast(`Dernière page de « ${fullTitle(b)} »`, { label:'Marquer comme lu', ms:6000, onAction:()=>{
      markRead(b); save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id, {pulse:true});
      scheduleRender();
    }});
    return;
  }
  toast(`Page ${b.currentPage}${b.pages?' / '+b.pages:''} ✓`, {label:'Annuler', ms:3500, onAction:()=>{
    // prev peut valoir null (« progression non renseignée ») : y revenir vraiment, plutôt que d'écrire 0
    updateBookProgress(b, prev==null ? null : prev); save();
    if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')){ openDetail(b.id); scheduleRender(); }
    else if(!patchProgressUI(b)) scheduleRender();
  }});
}
// F40 : « 35 % » sur un livre sans pagination — le pourcentage est gardé tel quel (aucune page à
// calculer, donc pas de session dans progressLog) ; comme setProgress, la barre est repeinte en place.
function setProgressPct(b, pct){
  b.currentPct = pct; b.currentPage = null; invalidateCache();
  save();
  if(!patchProgressUI(b) || $('.overlay.open')) scheduleRender();
  if(pct>=100 && b.status!=='read'){
    toast(`Dernière page de « ${fullTitle(b)} »`, { label:'Marquer comme lu', ms:6000, onAction:()=>{
      markRead(b); save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id, {pulse:true});
      scheduleRender();
    }});
    return;
  }
  toast(`Progression : ${fmtPct(pct)} ✓`);
}
// F40 : date de début d’une lecture. Posée quand le livre PASSE « en cours » (jamais rétroactivement),
// retirée quand il retourne dans la pile ou est dit « lu » sans passer par markRead (qui, lui, la
// reporte dans readings[].start) ; un abandon la garde, au cas où la lecture reprend.
function syncStartedAt(b){
  if(b.status==='reading'){ if(!b.startedAt) b.startedAt = today(); }
  else if(b.status==='wishlist' || b.status==='read') b.startedAt = null;
}
// Marque le livre comme lu. Une DEUXIÈME date n’est ajoutée que s’il s’agit d’une vraie relecture
// (livre « en cours », ou pages enregistrées après la dernière date connue) : sinon un ✓ donné par
// erreur sur un livre déjà lu inventerait une lecture datée d’aujourd’hui dans le journal.
// Le statut d’avant est lu ICI : les appelants ne doivent plus poser b.status='read' eux-mêmes.
// opts.undo==='date' : au lieu d’« Annuler », le toast propose de corriger la date qui vient d’être
// posée d’office (depuis la fiche, où l’on voit la ligne apparaître au journal).
function markRead(b, opts){
  b.readings = b.readings||[];
  const prevStatus = b.status, prevStart = b.startedAt || null;
  const last = lastReadDate(b);
  const relecture = !!b.readings.length && (prevStatus==='reading' || (b.progressLog||[]).some(p=>p.date>last));
  b.status = 'read';
  let newId = null;
  if(!b.readings.length || relecture){
    // F40 : la date de début vient du passage « en cours » (startedAt), sinon de la première page
    // enregistrée depuis la lecture précédente — et jamais d’une date postérieure à la fin.
    const firstLog = (b.progressLog||[]).map(p=>p.date).filter(d=>d>last).sort()[0] || null;
    const start = prevStart || firstLog;
    const r = {id:uid(), start: (start && start<=today()) ? start : null, date:today(), rating:null};
    b.readings.push(r); newId = r.id;
  }
  b.startedAt = null; // consommée : la lecture en cours est close
  invalidateCache(); // la lecture vient de changer : ne pas lire un décompte périmé
  const y = new Date().getFullYear();
  const gi = goalInfo(y);
  // Une date a été inventée : le dire (« aujourd’hui »), sinon le journal se remplit en douce.
  const quand = (opts && opts.undo==='date' && newId) ? ' aujourd’hui' : '';
  const msg = relecture ? (quand ? 'Relecture datée d’aujourd’hui, ajoutée au journal ✓' : 'Relecture enregistrée, nouvelle date au journal ✓')
    : (gi && gi.done <= gi.goal) ? `Lu${quand}, inscrit au journal ✓ · ${fmtRatio(gi.done, gi.goal)} de ton objectif ${y}`
    : `Marqué lu${quand}, ajouté au journal ✓`;
  if(opts && opts.quiet) return;   // appel programmatique (selftest) : l’état change, rien à annoncer
  if(quand){
    toast(msg, {label:'Autre date', ms:8000, onAction: async ()=>{
      const v = await uiPrompt({title:'Date de fin de lecture', message:`Quand as-tu terminé « ${fullTitle(b)} » ?`, value:today(), type:'date', okLabel:'Enregistrer'});
      if(!v || !isValidDate(v)) return;
      if(v > today()){ toast('Une lecture ne peut pas être datée du futur'); return; } // même garde que le champ de la fiche
      const r = (b.readings||[]).find(x=>x.id===newId); if(!r) return;
      r.date = v; if(r.start && r.start > v) r.start = null; // fin avancée avant le début : ce début n’était pas le bon
      invalidateCache(); save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
      scheduleRender();
      toast(`Lecture datée du ${fmtDate(v)} ✓`);
    }});
    return;
  }
  toast(msg, {label:'Annuler', ms:6000, onAction:()=>{
    b.status = prevStatus; b.startedAt = prevStart;
    if(newId) b.readings = (b.readings||[]).filter(r=>r.id!==newId);
    invalidateCache(); save(); scheduleRender();
    if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
  }});
}

// Bibliothèque d’exemple pour le premier lancement (couvertures Open Library, autorisées par la CSP)
const DEMO_BOOKS = [
  {title:'Berserk', series:'Berserk', volume:1, seriesTotal:41, type:'manga', authors:['Kentarō Miura'], year:1990, pages:224, status:'read', rating:5, favorite:true, tags:['dark fantasy','coup de cœur'], moods:['sombre','tendu'], pace:'moyen', review:'Premier tome brutal, presque trop. C’est à partir du troisième que ça devient immense.', cover:'https://covers.openlibrary.org/b/isbn/9781593070205-M.jpg', readings:[{date:'2025-03-12', rating:5}]},
  {title:'Watchmen', type:'bd', authors:['Alan Moore','Dave Gibbons'], year:1987, pages:416, status:'read', rating:5, favorite:true, tags:['comics','classique'], moods:['sombre','réflexif'], review:'Relu après avoir vu le film. La BD gagne, surtout pour le chapitre sur le Dr Manhattan.', cover:'https://covers.openlibrary.org/b/isbn/9780930289232-M.jpg', readings:[{date:'2026-01-20', rating:5}]},
  {title:'Dune', type:'livre', authors:['Frank Herbert'], year:1965, pages:688, status:'read', rating:4.5, tags:['SF','classique'], moods:['réflexif','inspirant'], pace:'lent', review:'Les cent premières pages sont arides, ensuite on ne le lâche plus.', cover:'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg', readings:[{start:'2026-01-20', date:'2026-02-15', rating:4.5}]},
  {title:'Pluto', series:'Pluto', volume:1, seriesTotal:8, type:'manga', authors:['Naoki Urasawa'], year:2003, pages:200, status:'read', rating:5, tags:['SF'], moods:['émouvant','tendu'], cover:'https://covers.openlibrary.org/b/isbn/9781421519180-M.jpg', readings:[{date:'2026-03-30', rating:5}]},
  // Seul exemple « en cours » : daté et jalonné pour que la démo montre le début de lecture et les
  // sessions du Journal (F40) ; Dune, ci-dessus, montre une lecture datée de bout en bout.
  {title:'La Horde du Contrevent', type:'livre', authors:['Alain Damasio'], year:2004, pages:736, status:'reading', currentPage:210, startedAt:'2026-08-28', progressLog:[{date:'2026-08-28',page:40},{date:'2026-09-01',page:120},{date:'2026-09-05',page:210}], tags:['SF','français'], cover:'https://covers.openlibrary.org/b/isbn/9782070464234-M.jpg'},
  {title:'L’Étranger', type:'livre', authors:['Albert Camus'], year:1942, pages:159, status:'read', rating:4, tags:['classique'], moods:['mélancolique'], cover:'https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg', readings:[{date:'2026-04-08', rating:4}]},
  // Seul exemple doté d’un mode étude : sans lui, la démo ne montre jamais les fiches de
  // révision (la carte est due dans le passé pour que « À réviser » apparaisse sur Aujourd’hui).
  {title:'Sapiens', cover:'https://covers.openlibrary.org/b/isbn/9782226257017-M.jpg', type:'livre', authors:['Yuval Noah Harari'], year:2011, pages:512, status:'wishlist', tags:['essai','histoire'],
   study:{objective:'Comprendre pourquoi Homo sapiens a dominé',
          ideas:[{id:'demo-i1', text:'La fiction partagée (mythes, argent, nations) permet la coopération à grande échelle.'}],
          cards:[{id:'demo-c1', front:'Quelle capacité unique explique la coopération de masse chez Sapiens ?', back:'Croire ensemble à des fictions partagées.', due:'2026-01-01', interval:0, repetitions:0, lastReviewed:null}]}},
  {title:'Akira', series:'Akira', volume:1, seriesTotal:6, type:'manga', authors:['Katsuhiro Ōtomo'], year:1982, pages:364, status:'read', rating:4.5, tags:['SF','cyberpunk'], cover:'https://covers.openlibrary.org/b/isbn/9781935429005-M.jpg', readings:[{date:'2025-11-15', rating:4.5}]},
];
// Sélection « démarrage rapide » : incontournables à taper pour amorcer la bibliothèque (les
// couvertures manquantes retombent sur le placeholder titré — aucun échec bloquant).
const ONBOARD_PICKS = [
  {title:'Dune', type:'livre', authors:['Frank Herbert'], year:1965, cover:'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg'},
  {title:'1984', type:'livre', authors:['George Orwell'], year:1949, cover:'https://covers.openlibrary.org/b/isbn/9780451524935-M.jpg'},
  {title:'Le Petit Prince', type:'livre', authors:['Antoine de Saint-Exupéry'], year:1943, cover:'https://covers.openlibrary.org/b/isbn/9782070612758-M.jpg'},
  {title:'Harry Potter à l’école des sorciers', type:'livre', authors:['J.K. Rowling'], year:1997, cover:'https://covers.openlibrary.org/b/isbn/9782070584628-M.jpg'},
  {title:'L’Étranger', type:'livre', authors:['Albert Camus'], year:1942, cover:'https://covers.openlibrary.org/b/isbn/9782070360024-M.jpg'},
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
    // newBook ne normalise pas `study` : on passe par normalizeStudy pour que la démo ait
    // exactement la forme attendue par studyCounts/studyDueCards (ids, dates, compteurs).
    const b = newBook(Object.assign({}, d, {tags:[...(d.tags||[]),'exemple'], study:normalizeStudy(d.study), readings:(d.readings||[]).map(r=>({id:uid(), start:r.start||null, date:r.date, rating:r.rating??null}))}));
    state.books.push(b);
  });
  // Objectif prêté, pas donné : on le marque pour pouvoir le retirer avec les exemples, sinon
  // le nouvel arrivant hérite d’un cap qu’il n’a jamais fixé (« 14 lectures à rattraper »).
  const y = String(new Date().getFullYear());
  state.meta = state.meta || {};
  if(!state.goals[y]){ state.goals[y] = 20; state.meta.demoGoal = true; }
  save(); render();
}
// Retire l’objectif SEULEMENT s’il vient de la démo (celui que l’utilisateur s’est fixé reste).
function clearDemoGoal(){
  if(!state.meta || !state.meta.demoGoal) return;
  delete state.goals[String(new Date().getFullYear())];
  delete state.meta.demoGoal;
}
// Entrée unique dans le bac à sable : le message d’accueil est le même d’où qu’on vienne
// (page de garde, onboarding vide, page publique d’un livre) et dure assez pour être lu.
function startDemo(){
  loadDemo();
  toast('Bac à sable : fouille, note, supprime. « Retirer les exemples » quand tu veux.', { ms:6000 });
}
function renderDemoBanner(){
  let banner = $('#demo-banner');
  const n = state.books.filter(isDemoBook).length;
  if(!n){ if(banner) banner.remove(); return; }
  if(!banner){
    banner = document.createElement('div'); banner.id='demo-banner'; banner.className='demo-banner';
    // Au-dessus de TOUTES les vues : les chiffres d’exemple se lisent aussi dans Aujourd’hui,
    // le Journal et les Stats — le bandeau doit y dire d’où ils viennent.
    $('#main-content').prepend(banner);
    banner.addEventListener('click', e=>{
      if(e.target.closest('#demo-clear')){
        (async()=>{
          if(!await uiConfirm({ title:'Retirer les exemples ?', message:'Les livres de démonstration seront retirés. Tes propres livres ne sont pas touchés.', okLabel:'Retirer' })) return;
          state.books = state.books.filter(b=>!isDemoBook(b));
          state.lists.forEach(l=> l.bookIds = l.bookIds.filter(id=>state.books.some(b=>b.id===id)));
          clearDemoGoal();
          save(); render(); toast('Exemples retirés');
        })();
      }
    });
  }
  banner.innerHTML = `<span>Tu explores une <b>bibliothèque d’exemple</b>. Ajoute tes vraies lectures quand tu veux.</span>
    <button class="btn small db-x" id="demo-clear">${n>1?`Retirer les ${n} exemples`:'Retirer l’exemple'}</button>`;
}

// Teaser de décembre : la rétro est LE moteur de partage de l’année — on la met sous les yeux
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
  ban.innerHTML = `<span><b>Ta rétro ${y} est prête</b> : ton année de lecture en une carte à partager.</span>
    <span style="display:flex;gap:8px"><button class="btn small primary" id="recap-open">Voir </button><button class="btn small db-x" id="recap-dismiss" aria-label="Masquer">✕</button></span>`;
}
function renderLibrary(){
  renderNowReading();
  renderDiscover();
  renderLoanAlert();
  renderStudyAlert();
  $('#btn-pick-next').hidden = !state.books.some(b=>b.status==='wishlist');
  // La file de notation n’était accessible que depuis l’accueil : la bibliothèque, où l’on
  // constate les notes manquantes, y mène aussi. Le compte dit ce qui attend ; masqué sinon.
  const nbANoter = unratedBooks().length, btnRate = $('#btn-rate-all');
  btnRate.hidden = !nbANoter;
  if(nbANoter){
    btnRate.querySelector('.rate-label').textContent = plur(nbANoter, 'lecture');
    btnRate.setAttribute('aria-label', `Noter ${plur(nbANoter, 'lecture')} sans note`);
  }
  // « Mémoriser » n’a de sens qu’avec des filtres à mémoriser : sur la bibliothèque entière il
  // laissait croire à un filtre supplémentaire (« ＋ Filtre ») qu’il ne posait pas.
  $('#lib-savefilter').hidden = !(ui.status!=='all' || ui.types.size || ui.tag || ui.q);
  const tagSel = $('#lib-tag');
  const allTags = [...new Set(state.books.flatMap(b=>b.tags||[]))].sort((a,b)=>a.localeCompare(b,'fr'));
  if(ui.tag && !allTags.includes(ui.tag)) ui.tag = '';
  tagSel.hidden = !allTags.length;
  tagSel.innerHTML = `<option value="">Tous les tags</option>` +
    allTags.map(t=>`<option value="${esc(t)}"${t===ui.tag?' selected':''}>#${esc(t)}</option>`).join('');
  // barre compacte : un tag choisi reste visible, et la pastille compte les filtres actifs repliables
  tagSel.classList.toggle('has-value', !!ui.tag);
  const nbActifs = (['abandoned','fav','loan'].includes(ui.status)?1:0) + ui.types.size + (ui.tag?1:0) + (ui.groupSeries?0:1);
  $('#lib-more').innerHTML = ic('filters',14) + (nbActifs ? ` Filtres · ${nbActifs}` : ' Filtres');
  const arr = filteredBooks();
  const grid = $('#lib-grid'), emptyBox = $('#lib-empty');
  renderRecapTeaser();
  if(!state.books.length){
    grid.innerHTML = ''; setLibCount('', ''); $('#lib-count').dataset.base = '';
    emptyBox.innerHTML = `<div class="onboard">
      <div class="ob-head">
        <div class="big orn" aria-hidden="true">❦</div>
        <h3>Commence ta bibliothèque</h3>
        <p>Ajoute des livres, BD ou manga que tu as lus. Ta collection, ton journal et tes recommandations démarrent tout de suite.</p>
        <button class="btn primary lp-big" id="ob-search">${ic('search',16)} Chercher un livre</button>
      </div>
      <div class="ob-or">ou tape parmi ces incontournables :</div>
      <div class="onboard-grid">
        ${ONBOARD_PICKS.map((p,i)=>`<button class="ob-pick" data-pick="${i}" aria-label="Ajouter ${esc(p.title)}">
          <div class="ob-cov">${p.cover?`<img src="${esc(p.cover)}" alt="" loading="lazy"${xorigin(p.cover)} referrerpolicy="no-referrer">`:''}${phHTML(p)}</div>
          <div class="ob-t">${esc(p.title)}</div><div class="ob-check">✓ Ajouté</div>
        </button>`).join('')}
      </div>
      <div class="ob-foot">
        <button class="btn" id="ob-demo">Voir plutôt une bibliothèque d’exemple</button>
        <button class="btn primary" id="ob-done" hidden>Voir ma bibliothèque <span id="ob-n"></span> →</button>
      </div>
    </div>`;
    // « Ajoute des livres… que tu as lus » : le segment doit dire « Lu » d’emblée, sinon tout
    // l’onboarding se retrouve en pile « À lire » et les stats restent à zéro.
    $('#ob-search').addEventListener('click', ()=>openSearch({status:'read'}));
    $('#ob-demo').addEventListener('click', ()=>startDemo());
    let added = 0;
    $('#ob-done').addEventListener('click', ()=>render());
    emptyBox.querySelector('.onboard-grid').addEventListener('click', e=>{
      const btn = e.target.closest('.ob-pick'); if(!btn || btn.classList.contains('done')) return;
      const p = ONBOARD_PICKS[+btn.dataset.pick]; if(!p) return;
      // « Lu » sans date : newBook daterait la lecture d’aujourd’hui, ce qui est faux pour un
      // classique lu on ne sait plus quand — Journal et courbe de l’année restent vides à raison,
      // et « Sans note » sur Aujourd’hui proposera de noter (et de dater) plus tard.
      const b = newBook(Object.assign({}, p, { status:'read' })); b.readings = [];
      state.books.unshift(b); save();                          // seed la biblio (+ sync compte si connecté)
      btn.classList.add('done'); added++;
      const doneBtn = $('#ob-done'); doneBtn.hidden = false; $('#ob-n').textContent = '('+added+')';
      toast(`« ${p.title} » ajouté ✓`, {label:'Annuler', onAction:()=>{ const i=state.books.indexOf(b); if(i>=0){ markBooksDeleted([b]); state.books.splice(i,1); save(); } btn.classList.remove('done'); added=Math.max(0,added-1); if(!added){doneBtn.hidden=true;} else {$('#ob-n').textContent='('+added+')';} }});
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
  // data-base garde le décompte seul : setCoverProgress() y accole la progression des couvertures
  // après un import, et un rendu intermédiaire ne doit pas l’effacer (_coverProgress la porte).
  const countTxt = `${plur(nBooks,'ouvrage')}${nItems!==nBooks ? ` · ${plur(nItems,'carte')}` : ''}`;
  $('#lib-count').dataset.base = countTxt;
  // Un statut filtré se lit aussi ici : sur téléphone la puce active peut être sortie du ruban, et
  // après un saut depuis Aujourd’hui on doit pouvoir revenir à tout d’un geste.
  const STATUS_FILTER_LBL = {read:'Lus', reading:'En cours', wishlist:'À lire', abandoned:'Abandonnés', fav:'Favoris', loan:'Prêtés'};
  setLibCount(countTxt + (_coverProgress ? ` · ${_coverProgress}` : ''),
    ui.status!=='all' ? ` · Filtre : ${esc(STATUS_FILTER_LBL[ui.status]||ui.status)} · <button type="button" class="linkish" id="lib-showall">Tout afficher</button>` : '');
  if(!arr.length){
    emptyBox.innerHTML = `<div class="empty"><div class="big orn" aria-hidden="true">❦</div>
      <h3>Rien sur cette étagère</h3><p>Ces filtres ne laissent passer aucun titre. Élargis, ou range-les.</p>
      <button class="btn" id="empty-reset">Réinitialiser les filtres</button></div>`;
    $('#empty-reset').addEventListener('click', resetFilters);
  }else emptyBox.innerHTML = '';
  grid.classList.toggle('list-mode', ui.libLayout==='list');
  syncLibLayoutBtn();
  grid.innerHTML = ui.libLayout==='list'
    ? items.map(it => it.kind==='series' ? seriesRowHTML(it) : bookRowHTML(it.book)).join('')
    : items.map(it => it.kind==='series' ? seriesCardHTML(it) : bookCardHTML(it.book)).join('');
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
  if(overdue) parts.push(`${plur(overdue,'prêt')} en retard`);
  if(soon) parts.push(`${plur(soon,'retour')} à prévoir`);
  box.hidden=false;
  box.innerHTML=`<span>${ic('lend',15)} <b>${parts.join(' · ')}</b></span><button class="btn small" id="loan-alert-open">Voir les prêts</button>`;
  $('#loan-alert-open').onclick=()=>$('#status-chips [data-status="loan"]').click();
}
function resetFilters(){
  ui.status='all'; ui.types.clear(); ui.tag=''; ui.q='';
  $('#lib-q').value=''; $('#lib-tag').value='';
  syncFilterChips();
  libFilterChanged(); renderLibrary();
}
// Recommandations locales dérivées de mes propres notes (aucun réseau)
function recommendations(){
  const out = [], seen = new Set();
  const eligible = b => b && b.status!=='read' && b.status!=='reading' && b.status!=='abandoned';
  const add = (b, why)=>{ if(eligible(b) && !seen.has(b.id)){ seen.add(b.id); out.push({b, why}); } };
  // 1) tome suivant à lire des séries que j’aime (note ≥ 4)
  const bySeries = new Map();
  for(const b of state.books){ const k=seriesKey(b); if(k){ if(!bySeries.has(k)) bySeries.set(k,[]); bySeries.get(k).push(b); } }
  for(const [k,books] of bySeries){
    const rated = books.filter(b=>b.rating);
    const avg = rated.length ? rated.reduce((s,b)=>s+b.rating,0)/rated.length : 0;
    const rec = state.series[k];
    const score = (rec && rec.rating!=null) ? rec.rating : avg;
    if(score < 4) continue;
    const next = books.filter(eligible).sort((a,b)=>(a.volume??1e9)-(b.volume??1e9));
    if(next[0]) add(next[0], 'la suite d’une série que tu aimes');
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
      title:`${fullTitle(b)}`,
      message:`${authorsStr(b)||TYPE_LABEL[b.type]}\n\nPourquoi ce choix : ${pick.why}.`,
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
      b.status='reading'; syncStartedAt(b); if(b.currentPage==null) b.currentPage=0;
      save(); render(); openDetail(b.id); toast('Bonne lecture'); return;
    }
    return;
  }
}
$('#btn-pick-next').addEventListener('click', chooseNextRead);
$('#btn-rate-all').addEventListener('click', openQuickRate);
/* ---- Idées du jour : découverte externe « Comme X et Y », 3 idées, nouvelles chaque jour ----
   Déterministe par date (même trio toute la journée), cache localStorage (1 requête API max/jour),
   repli silencieux si aucune note ≥ 4 ou API indisponible. */
const IDEAS_KEY = 'tome-ideas-v1';
let _ideasLoading = false, _ideasNextTry = 0; // re-tentative throttlée si les API étaient indisponibles
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; } return Math.abs(h); }
const bookLibKey = (title, author) => (title+'|'+(author||'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
// Graines du jour : suites de séries à jour, auteurs aimés (rotation quotidienne) et genres
// partagés par ≥2 coups de cœur. `salt` varie le tirage (bouton « D’autres idées »).
function ideaSeeds(day, salt=0){
  const sel = k => hashStr(day+'|'+salt+'|'+k);
  // Les exemples ne sont pas des goûts : ils ne doivent semer aucune suggestion.
  const mine = state.books.filter(b=>!isDemoBook(b));
  // « aimé » = noté ≥4, ou favori lu (les lecteurs qui ne notent pas ont aussi des goûts)
  const loved = mine.filter(b=>b.rating>=4 || (b.favorite && b.status==='read'));
  const out = [];
  // 1. La suite d’une série à jour — signal le plus fort : le dernier tome possédé est lu
  const bySeries = new Map();
  mine.forEach(b=>{
    if(!b.series || !b.volume) return;
    const k = seriesKey(b);
    if(!bySeries.has(k) || b.volume > bySeries.get(k).volume) bySeries.set(k, b);
  });
  const suites = [...bySeries.values()].filter(b=>b.status==='read');
  if(suites.length){
    const s2 = suites[sel('s') % suites.length];
    out.push({ q:`intitle:"${s2.series}"`, fallback:`${s2.series} ${s2.volume+1}`, series:s2.series,
               label:`La suite de ${s2.series}`, nextVol:s2.volume+1, take:2 });
  }
  // 2. Deux auteurs aimés (rotation quotidienne, jamais deux fois le même)
  const authors = [...new Set(loved.flatMap(b=>b.authors||[]))].filter(Boolean).sort();
  const dejaA = new Set();
  for(let i=0; i<2 && dejaA.size<authors.length; i++){
    let a = authors[sel('a'+i) % authors.length], garde=0;
    while(dejaA.has(a) && garde++ < authors.length) a = authors[(authors.indexOf(a)+1) % authors.length];
    if(dejaA.has(a)) break;
    dejaA.add(a);
    const ex = loved.find(b=>(b.authors||[]).includes(a));
    out.push({ q:`inauthor:"${a}"`, fallback:a, label:`Parce que tu as aimé ${ex?fullTitle(ex):a}`, take:3 });
  }
  // 3. Un genre partagé par au moins deux coups de cœur
  const byTag = new Map();
  loved.forEach(b=>(b.tags||[]).forEach(t=>{ if(t==='exemple') return; if(!byTag.has(t)) byTag.set(t,[]); byTag.get(t).push(b); }));
  const tags = [...byTag.keys()].filter(t=>byTag.get(t).length>=2).sort();
  if(tags.length){
    const t = tags[sel('t') % tags.length];
    const pair = byTag.get(t);
    out.push({ q:`subject:"${t}"`, fallback:t, lang:'fr', label:`Comme ${fullTitle(pair[0])} et ${fullTitle(pair[1])}`, take:3 });
  }
  return out.slice(0,4);
}
// « Pas pour moi » : suggestions écartées, jamais reproposées (local, plafonné à 300)
const IDEAS_HIDDEN_KEY = 'tome-ideas-hidden-v1';
function hiddenIdeas(){ try{ return new Set(JSON.parse(localStorage.getItem(IDEAS_HIDDEN_KEY)||'[]')); }catch(_){ return new Set(); } }
function hideIdeaKey(k){ const l=[...hiddenIdeas()].filter(x=>x!==k); l.push(k); try{ localStorage.setItem(IDEAS_HIDDEN_KEY, JSON.stringify(l.slice(-300))); }catch(_){ } }
function unhideIdeaKey(k){ const l=[...hiddenIdeas()].filter(x=>x!==k); try{ localStorage.setItem(IDEAS_HIDDEN_KEY, JSON.stringify(l)); }catch(_){ } }
async function fetchIdeas(salt=0){
  // null = pas de graines (aucun appel réseau effectué) ; [] = graines mais API muettes
  const seeds = ideaSeeds(today(), salt); if(!seeds.length) return null;
  const mine = new Set(state.books.map(b=>bookLibKey(b.title, (b.authors||[])[0])));
  const ecartes = hiddenIdeas();
  const groups = [];
  for(const s2 of seeds){
    let rs = [];
    try{ rs = await searchGoogleBooks(s2.q, {lang:s2.lang}); }
    // repli OpenLibrary sans filtre de langue : acceptable pour un auteur ou une série,
    // mais pour un genre il ne ramène que du bruit anglophone — mieux vaut aucun groupe.
    catch(_){ if(!s2.lang){ try{ rs = await searchOpenLibrary(s2.fallback); }catch(_2){ rs = []; } } }
    // graine « suite » : ne proposer QUE le bon numéro de tome ET la bonne série — la requête
    // intitle attrape aussi les homonymes (« Akira » Toriyama…)
    if(s2.nextVol) rs = rs.filter(r=>(parseTome(r.title)||{}).volume === s2.nextVol &&
                                     r.title.toLowerCase().includes(s2.series.toLowerCase()));
    const seen = new Set();
    const items = rs.filter(r=>{
      const k = bookLibKey(r.title, (r.authors||[])[0]);
      if(mine.has(k) || seen.has(k) || ecartes.has(k) || !cleanCover(r.cover)) return false;
      seen.add(k); mine.add(k);            // pas de doublon entre les groupes
      return true;
    }).slice(0, s2.take||3).map(r=>({ title:r.title, authors:r.authors||[], type:r.type||'livre', year:r.year||null,
                            pages:r.pages||null, cover:r.cover||'', description:r.description||'' }));
    if(items.length) groups.push({ label:s2.label, items });
  }
  return groups;
}
// Groupes du jour depuis le cache, re-filtrés bibliothèque + écartés ; null si pas prêts.
function ideasData(){
  let data = null;
  try{ data = JSON.parse(localStorage.getItem(IDEAS_KEY)||'null'); }catch(_){ }
  if(!data || data.date!==today() || !Array.isArray(data.groups)) return null;
  const libKeys = new Set(state.books.map(b=>bookLibKey(b.title, (b.authors||[])[0])));
  const ecartes = hiddenIdeas();
  const groups = data.groups
    .map(g=>({ label:g.label, items:(g.items||[]).filter(r=>{ const k=bookLibKey(r.title,(r.authors||[])[0]); return !libKeys.has(k) && !ecartes.has(k); }) }))
    .filter(g=>g.items.length);
  return { salt: data.salt||0, groups };
}
function ideasGroupsHTML(groups){
  return groups.map((g,gi)=>`<div class="idea-group"><div class="ig-label">${esc(g.label)}</div><div class="ig-items">` +
    g.items.map((r,i)=>{ const c = cleanCover(r.cover); return `<div class="idea-card">
      <div class="mini">${c?`<img src="${esc(c)}" alt="" loading="lazy"${xorigin(c)} referrerpolicy="no-referrer">`:phHTML({title:r.title, authors:r.authors, type:r.type}, true)}</div>
      <div class="ii"><b>${esc(r.title)}</b><span>${esc((r.authors||[]).join(', '))}</span></div>
      <button class="btn small" data-idea="${gi}:${i}" title="Ajouter à ma pile à lire">＋ À lire</button>
      <button class="idea-x" data-idea-x="${gi}:${i}" title="Ne plus proposer" aria-label="Écarter ${esc(r.title)}">✕</button>
    </div>`; }).join('') + `</div></div>`).join('');
}
// Deux phrases à l'écran, le détail (ce qui part, où, pourquoi) sur demande : le pavé de 330
// caractères n'était lu par personne, et l'accord donné sans lecture n'en est pas un.
const IDEAS_OPTIN_HTML = `<p style="font-size:13px;color:var(--muted);margin-bottom:10px">Reçois chaque jour quelques idées de lecture d’après tes coups de cœur. Pour ça, Tome interroge la BnF, Google Books et Open Library. Rien d’autre ne quitte ton appareil. <button type="button" class="linkish" data-ideas-how>Comment ça marche ?</button></p>
      <div style="display:flex;gap:8px"><button class="btn small primary" data-ideas-optin>Activer</button>
      <button class="btn small" data-ideas-later>Pas maintenant</button></div>`;
const IDEAS_HOW_TEXT = `Chaque jour, Tome choisit quelques pistes d’après ta bibliothèque : les suites de tes séries, les auteurs que tu as bien notés, tes genres favoris.

Pour trouver ces titres, il envoie le nom d’un auteur, d’une série ou d’un tag que tu aimes à la BnF, Google Books et Open Library, exactement comme lorsque tu fais une recherche. Ni ta bibliothèque, ni tes notes, ni ton compte ne sont transmis.

Tu peux désactiver les idées du jour à tout moment depuis la Bibliothèque.`;
let _ideasAskMuted = false; // « Pas maintenant » : on reproposera à la prochaine session, pas avant
// Deux points de montage : le panneau de la Bibliothèque et la section de l’écran Aujourd’hui.
function ideasBoxes(){
  let box = $('#daily-ideas');
  const disc = $('#discover');
  if(!box && disc){ // le panneau bibliothèque n’existe qu’une fois la vue Bibliothèque construite
    box = document.createElement('div'); box.id='daily-ideas'; box.className='ideas-panel'; box.hidden=true;
    disc.after(box);
    box.addEventListener('click', onIdeaAdd);
  }
  return [box, $('#ideas-today')].filter(Boolean);
}
function renderDailyIdeas(){
  const boxes = ideasBoxes();
  const peint = html => boxes.forEach(b=>{
    const bib = b.id==='daily-ideas';
    const wrap = bib ? null : b.closest('#ideas-today-wrap');
    if(bib && (ui.status!=='all' || ui.q || ui.tag || ui.types.size)){ b.hidden=true; return; }
    if(html===null){ b.hidden=true; if(wrap) wrap.hidden=true; return; }
    b.hidden=false; if(wrap) wrap.hidden=false;
    b.innerHTML = (bib ? `<div class="ideas-head">Idées du jour <span>de nouvelles suggestions chaque jour</span></div>` : '') + html;
  });
  // Rien à recommander depuis des goûts qui ne sont pas les siens : sur une bibliothèque
  // uniquement d’exemple, ni opt-in ni suggestions (ce serait un faux « aha »).
  if(!state.books.some(b=>!isDemoBook(b))){ peint(null); return; }
  // Opt-in OBLIGATOIRE : la fonctionnalité envoie des auteurs/tags aimés à des API externes —
  // rien ne part sans un accord explicite (la proposition, elle, est 100 % locale).
  if(ui.ideas!=='on'){
    peint(_ideasAskMuted || !ideaSeeds(today()).length ? null : IDEAS_OPTIN_HTML);
    return;
  }
  const d = ideasData();
  if(!d){
    peint(null);
    if(_ideasLoading || Date.now() < _ideasNextTry) return;
    _ideasLoading = true;
    fetchIdeas(0).then(groups=>{
      _ideasLoading = false;
      if(groups===null) return;                                  // pas de graines : aucun appel fait, rien à throttler
      // fournée vide (API indisponibles) : ne PAS figer la journée — on retentera dans 30 min
      if(!groups.length){ _ideasNextTry = Date.now() + 30*60*1000; return; }
      try{ localStorage.setItem(IDEAS_KEY, JSON.stringify({date:today(), salt:0, groups})); }catch(_){}
      if(ui.view==='library' || ui.view==='today') renderDailyIdeas();
    }).catch(()=>{ _ideasLoading = false; _ideasNextTry = Date.now() + 30*60*1000; });
    return;
  }
  if(!d.groups.length){
    // Tout le tirage du jour a été ajouté ou écarté : NE PAS cacher le panneau (ce serait un
    // cul-de-sac jusqu’à demain). On garde la porte de sortie — un nouveau tirage (salt+1).
    peint(`<p style="font-size:13px;color:var(--muted);margin:2px 0 10px">Tu as passé en revue les idées du jour.</p>`+
      `<div class="ideas-foot"><button class="btn small" data-ideas-more>↻ D’autres idées</button></div>`);
    return;
  }
  window._ideaGroups = d.groups;
  peint(ideasGroupsHTML(d.groups) +
    `<div class="ideas-foot"><button class="btn small" data-ideas-more>↻ D’autres idées</button></div>`);
}
function onIdeaAdd(e){
  if(e.target.closest('[data-ideas-optin]')){ ui.ideas='on'; persistUI(); renderDailyIdeas(); return; }
  if(e.target.closest('[data-ideas-later]')){ _ideasAskMuted = true; renderDailyIdeas(); return; }
  if(e.target.closest('[data-ideas-how]')){ openDialog({ title:'Les idées du jour', message:IDEAS_HOW_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}] }); return; }
  const more = e.target.closest('[data-ideas-more]');
  if(more){                                     // nouveau tirage : autres graines, 1 fournée par clic
    if(_ideasLoading) return;
    more.disabled = true; more.textContent = 'Je cherche…';
    const cur = ideasData();
    const salt = (cur ? cur.salt : 0) + 1;
    _ideasLoading = true;
    fetchIdeas(salt).then(groups=>{
      _ideasLoading = false;
      if(groups && groups.length){
        try{ localStorage.setItem(IDEAS_KEY, JSON.stringify({date:today(), salt, groups})); }catch(_){}
      }else if(groups!==null){ toast('Rien de neuf trouvé pour aujourd\u2019hui'); }
      renderDailyIdeas();
    }).catch(()=>{ _ideasLoading = false; renderDailyIdeas(); });
    return;
  }
  const x = e.target.closest('[data-idea-x]');
  if(x){                                        // « pas pour moi » : mémorisé, mais annulable
    const [gi, i] = x.dataset.ideaX.split(':').map(Number);
    const r = ((window._ideaGroups||[])[gi]||{items:[]}).items[i]; if(!r) return;
    const k = bookLibKey(r.title, (r.authors||[])[0]);
    hideIdeaKey(k);
    renderDailyIdeas();
    toast(`« ${r.title} » ne sera plus proposé`, { label:'Annuler', onAction:()=>{ unhideIdeaKey(k); renderDailyIdeas(); } });
    return;
  }
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
    recs.map(({b,why})=>`<div class="now-card" data-id="${esc(b.id)}">
      <button type="button" class="now-hit" aria-label="Ouvrir la suggestion : ${esc(fullTitle(b))}"></button>
      <div class="mini">${coverHTML(b, true)}</div>
      <div class="ni"><div class="nt">${esc(fullTitle(b))}</div><div class="disco-note">${esc(why)}</div></div>
    </div>`).join('');
}
function bookCardHTML(b){
  const pct = b.status==='reading' ? progressPct(b) : null;
  let ribbon = '';
  if(b.loan){ const due=loanDueInfo(b.loan); ribbon = `<span class="ribbon loan${due&&due.days<0?' overdue':''}">${ic('lend',11)} ${due&&due.days<0?'retour en retard':'prêté'}</span>`; }
  else if(b.status==='reading') ribbon = `<span class="ribbon reading">${pct!==null ? fmtPct(pct) : 'En cours'}${pct!==null?`<i class="rp" style="width:${pct}%"></i>`:''}</span>`;
  else if(b.status!=='read') ribbon = `<span class="ribbon ${esc(b.status)}">${STATUS_LABEL[b.status]}</span>`;
  const sel = ui.selection.has(b.id);
  const hitLabel = ui.selectMode ? `${sel?'Désélectionner':'Sélectionner'} ${fullTitle(b)}` : `Ouvrir ${fullTitle(b)}${b.authors.length?', '+authorsStr(b):''}`;
  return `
    <div class="card${sel?' selected':''}" data-id="${esc(b.id)}">
      <button type="button" class="card-hit" aria-label="${esc(hitLabel)}" aria-keyshortcuts="l f"${ui.selectMode?` aria-pressed="${sel}"`:''}></button>
      <div class="cover">
        <span class="badge ${esc(b.type)}">${TYPE_LABEL[b.type]||''}</span>
        <button class="selbox${sel?' on':''}" data-select="${esc(b.id)}" role="checkbox" aria-checked="${sel}" aria-label="Sélectionner" tabindex="-1">${sel?'✓':''}</button>
        <span class="qk">
          ${b.status!=='read' ? `<button data-quick="read" data-id="${esc(b.id)}" title="Marquer comme lu" aria-label="Marquer comme lu" tabindex="-1">✓</button>` : ''}
          <button data-quick="fav" data-id="${esc(b.id)}" class="${b.favorite?'on':''}" title="Favori" aria-label="Favori" tabindex="-1">♥</button>
          <button data-quick="menu" data-id="${esc(b.id)}" title="Plus d’actions" aria-label="Plus d’actions" tabindex="-1">⋯</button>
        </span>
        ${coverHTML(b)}
        ${ribbon}
      </div>
      <div class="under">
        ${starsHTML(b.rating)}
        ${b.favorite ? `<span class="fav">♥</span>` : ''}
        ${b.review ? `<span class="rv">${ic('doc',13)}</span>` : ''}
        ${(b.quotes||[]).length ? `<span class="qmark" title="${plur(b.quotes.length,'passage')}">❝</span>` : ''}
      </div>
    </div>`;
}
// ---- Mode liste de la bibliotheque (bascule grille/affiches <-> rangees lisibles) ----
// Meme classe .card + data-id : toute la delegation (clic, selection, clavier) marche telle quelle.
function bookRowHTML(b){
  const sel = ui.selection.has(b.id);
  const pct = b.status==='reading' ? progressPct(b) : null;
  const statut = b.status==='read' ? '' :
    `<span class="rstat ${esc(b.status)}">${b.status==='reading' && pct!==null ? pct+'\u00A0%' : STATUS_LABEL[b.status]}</span>`;
  const hitLabel = ui.selectMode ? `${sel?'Désélectionner':'Sélectionner'} ${fullTitle(b)}` : `Ouvrir ${fullTitle(b)}${b.authors.length?', '+authorsStr(b):''}`;
  return `
    <div class="card lrow${sel?' selected':''}" data-id="${esc(b.id)}">
      <button type="button" class="card-hit" aria-label="${esc(hitLabel)}" aria-keyshortcuts="l f"${ui.selectMode?` aria-pressed="${sel}"`:''}></button>
      <button class="selbox${sel?' on':''}" data-select="${esc(b.id)}" role="checkbox" aria-checked="${sel}" aria-label="Sélectionner" tabindex="-1">${sel?'\u2713':''}</button>
      <div class="lcov">${coverHTML(b, true)}</div>
      <div class="ri"><b class="rt">${esc(fullTitle(b))}</b><span class="ra">${esc(authorsStr(b))}</span></div>
      <div class="rmeta">
        ${statut}
        <span class="rstars row-stars${b.rating?'':' unrated'}" data-book="${esc(b.id)}" role="slider" tabindex="0" aria-label="Note" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${b.rating||0}" aria-valuetext="${ratingText(b.rating)}">${starInputHTML(b.rating||0, 'rst')}</span>
        ${b.favorite ? `<span class="fav">\u2665</span>` : ''}
        ${b.review ? `<span class="rv">${ic('doc',13)}</span>` : ''}
        <button class="rmenu" data-quick="menu" data-id="${esc(b.id)}" title="Plus d\u2019actions" aria-label="Plus d\u2019actions">\u22ef</button>
      </div>
    </div>`;
}
function seriesRowHTML(it){
  const total = Math.max(...it.books.map(b=>b.seriesTotal||0)) || null;
  const read = readCount(it.books);
  const withCover = it.books.filter(b=>b.cover).sort((a,b)=>(b.volume??0)-(a.volume??0));
  const rep = withCover[0] || it.books[it.books.length-1];
  const rec = state.series[it.name.trim().toLowerCase()];
  const ratings = it.books.filter(b=>b.rating);
  const avg = ratings.length ? ratings.reduce((x,b)=>x+b.rating,0)/ratings.length : null;
  const shown = (rec && rec.rating!=null) ? rec.rating : avg;
  const ids = it.books.map(b=>b.id), allSel = ids.length>0 && ids.every(id=>ui.selection.has(id));
  const hitLabel = ui.selectMode
    ? `${allSel?'Désélectionner':'Sélectionner'} la série ${it.name}`
    : `Ouvrir la série ${it.name}`;
  return `
    <div class="card lrow series${allSel?' selected':''}" data-series="${esc(it.name)}">
      <button type="button" class="card-hit" aria-label="${esc(hitLabel)}"${ui.selectMode?` aria-pressed="${allSel}"`:''}></button>
      <div class="lcov">${coverHTML(rep, true)}</div>
      <div class="ri"><b class="rt">${esc(it.name)}</b><span class="ra">${fmtRatio(read, total||it.books.length)} lus \u00B7 ${plur(it.books.length,'tome')}</span></div>
      <div class="rmeta">${starsHTML(shown)}</div>
    </div>`;
}
function syncLibLayoutBtn(){
  const btn = $('#lib-layout'); if(!btn) return;
  const liste = ui.libLayout==='list';
  // Pas d’aria-pressed : ce n’est pas un interrupteur « liste : oui/non » mais un bouton qui
  // fait l’action inverse de l’affichage courant — son nom suffit, et il change avec l’état.
  btn.removeAttribute('aria-pressed');
  const lbl = liste ? 'Afficher en grille' : 'Afficher en liste';
  btn.setAttribute('aria-label', lbl);
  btn.title = lbl;
  btn.innerHTML = liste
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg> Grille`
    : `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><rect x="4" y="4.6" width="2.8" height="2.8" rx="1"/><rect x="4" y="10.6" width="2.8" height="2.8" rx="1"/><rect x="4" y="16.6" width="2.8" height="2.8" rx="1"/></svg> Liste`;
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
  const hitLabel = ui.selectMode
    ? `${allSel?'Désélectionner':'Sélectionner'} la série ${it.name}`
    : `Ouvrir la série ${it.name}, ${read} lus sur ${total||it.books.length}`;
  return `
    <div class="card series${allSel?' selected':''}" ${someSel?'data-indet="1"':''} data-series="${esc(it.name)}">
      <button type="button" class="card-hit" aria-label="${esc(hitLabel)}"${ui.selectMode?` aria-pressed="${allSel}"`:''}></button>
      <div class="cover">
        <span class="badge ${esc(rep.type)}">${TYPE_LABEL[rep.type]||''}</span>
        <button class="selbox${allSel?' on':''}" data-select-series="${esc(it.name)}" role="checkbox" aria-checked="${allSel}" aria-label="Sélectionner la série" tabindex="-1">${allSel?'✓':(someSel?'–':'')}</button>
        ${coverHTML(rep)}
        <span class="ribbon serie ${done?'done':''}">${esc(it.name)} · ${read}/${total||it.books.length}${done?' ✓':''}</span>
      </div>
      <div class="under">
        ${starsHTML(shown ? Math.round(shown*2)/2 : null)}
        ${fav ? `<span class="fav">♥</span>` : ''}
      </div>
    </div>`;
}
// ===== Sélection multiple =====
// une carte série ne représente QUE les tomes visibles sous le filtre courant
function visibleSeriesBooks(name){ const k = name.trim().toLowerCase(); return filteredBooks().filter(b=>seriesKey(b)===k); }
function syncSelectionHits(){
  $$('#lib-grid .card').forEach(card=>{
    const hit=card.querySelector('.card-hit'); if(!hit) return;
    if(card.dataset.series){
      const ids=visibleSeriesBooks(card.dataset.series).map(b=>b.id), all=ids.length>0 && ids.every(id=>ui.selection.has(id));
      hit.setAttribute('aria-label', `${all?'Désélectionner':'Sélectionner'} la série ${card.dataset.series}`);
      hit.setAttribute('aria-pressed', String(all));
    }else{
      const b=state.books.find(x=>x.id===card.dataset.id); if(!b) return;
      const selected=ui.selection.has(b.id);
      hit.setAttribute('aria-label', `${selected?'Désélectionner':'Sélectionner'} ${fullTitle(b)}`);
      hit.setAttribute('aria-pressed', String(selected));
    }
  });
}
function enterSelect(){
  if(ui.selectMode) return;
  ui.selectMode = true; document.body.classList.add('selecting'); syncSelectionHits();
}
function reflectCard(cardEl){
  if(!cardEl) return;
  if(cardEl.dataset.series){
    const it={name:cardEl.dataset.series.trim(), books:visibleSeriesBooks(cardEl.dataset.series)};
    cardEl.outerHTML = ui.libLayout==='list' ? seriesRowHTML(it) : seriesCardHTML(it);
  }else if(cardEl.dataset.id){
    const b = state.books.find(x=>x.id===cardEl.dataset.id);
    if(b) cardEl.outerHTML = ui.libLayout==='list' ? bookRowHTML(b) : bookCardHTML(b);
  }
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
    if(kind==='menu'){ openCardMenu(b); return; }
    if(kind==='fav'){ b.favorite = !b.favorite; }
    else if(kind==='read'){ markRead(b); }
    save(); refreshAfterQuick(b);
    return;
  }
  // Étoiles d’une rangée (mode liste) : la note se pose sans ouvrir la fiche, même règle du
  // toucher que sur la fiche (tapRating). La rangée seule est remplacée : la liste ne se retrie
  // pas sous le doigt, même triée par note.
  const rs = e.target.closest('.row-stars .rst');
  if(rs){
    const b = state.books.find(x=>x.id===rs.closest('.row-stars').dataset.book); if(!b) return;
    setBookRating(b, tapRating(b.rating, rs, e.clientX));
    save(); patchCard(b.id);
    return;
  }
  const sc = e.target.closest('[data-series]');
  if(sc){ openSeries(sc.dataset.series); return; }
  const card = e.target.closest('.card');
  if(card && card.dataset.id) openDetail(card.dataset.id);
});
// Après une action rapide (✓, ♥, statut depuis le menu) : la carte se remplace sur place tant que
// le livre reste dans le filtre courant ; sinon la grille se reconstruit, il vient d’en sortir.
function refreshAfterQuick(b){
  const s = ui.status;
  const stillMatches = s==='all' || (s==='fav' ? !!b.favorite : s==='loan' ? !!b.loan : s===b.status);
  if(stillMatches && !seriesKey(b) && patchCard(b.id)){ renderNowReading(); renderDiscover(); }
  else renderLibrary();
}
// Glissé sur les étoiles d’une rangée : même pose que le toucher, au relâchement.
bindStarSlider($('#lib-grid'), '.row-stars', (host, v) => {
  const b = state.books.find(x=>x.id===host.dataset.book); if(!b) return;
  setBookRating(b, v); save(); patchCard(b.id);
});
// Menu d’actions d’un livre (appui long sur mobile, bouton ⋯ à la souris) : noter, changer de
// statut, favori, liste, ou passer en sélection multiple — l’appui long n’entrait avant qu’en
// sélection, la seule action qui ne s’offre nulle part ailleurs sur la carte.
async function openCardMenu(b){
  const a = await uiChoose({ title:fullTitle(b), choices:[
    { label: b.rating ? '★ Modifier la note…' : '★ Noter…', value:'rate' },
    { label: b.status==='reading' ? 'Marquer comme lu' : b.status==='wishlist' ? 'Commencer' : 'Changer le statut…', value:'status' },
    { label: b.favorite ? 'Retirer des favoris' : '♥ Mettre en favori', value:'fav' },
    { label:'Ajouter à une liste…', value:'list' },
    { label:'Sélectionner plusieurs', value:'select' },
  ]});
  if(!a) return;
  if(a==='rate'){ openDetail(b.id, {pulse:true}); return; }
  if(a==='fav'){ b.favorite = !b.favorite; save(); refreshAfterQuick(b); return; }
  if(a==='select'){
    enterSelect();
    toggleId(b.id, document.querySelector('#lib-grid .card[data-id="'+CSS.escape(b.id)+'"]'));
    return;
  }
  if(a==='list'){
    if(!state.lists.length){ toast('Crée d’abord une liste (onglet Listes)'); return; }
    const lid = await uiChoose({ title:'Ajouter à une liste', message:fullTitle(b), choices: state.lists.map((l,i)=>({ label:l.name, value:l.id, default:i===0 })) });
    const list = state.lists.find(x=>x.id===lid); if(!list) return;
    if(list.bookIds.includes(b.id)){ toast(`Déjà dans « ${list.name} »`); return; }
    if(list.bookIds.length>=MAX_BOOKIDS){ toast('Cette liste est pleine'); return; }
    list.bookIds.push(b.id); save();
    toast(`Ajouté à « ${list.name} » ✓`, {label:'Annuler', onAction:()=>{ list.bookIds = list.bookIds.filter(id=>id!==b.id); save(); }});
    return;
  }
  if(a==='status'){
    let s = b.status==='reading' ? 'read' : b.status==='wishlist' ? 'reading' : null;
    if(!s) s = await uiChoose({ title:'Changer le statut', message:fullTitle(b), choices: Object.entries(STATUS_LABEL).filter(([k])=>k!==b.status).map(([k,v])=>({ label:v, value:k })) });
    if(s) applyQuickStatus(b, s);
  }
}
// Statut depuis le menu d’une carte. « Lu » passe par markRead (relecture, journal, objectif) ;
// reprendre un livre terminé remet la progression à zéro (F14) comme sur la fiche.
function applyQuickStatus(b, s){
  if(s==='read'){ markRead(b); }
  else {
    const prev = b.status, prevStart = b.startedAt || null;
    if(s==='reading' && b.pages && (b.currentPage||0)>=b.pages) updateBookProgress(b, 0);
    b.status = s; syncStartedAt(b); invalidateCache();
    const msg = {reading:'Passé en cours de lecture ✓', wishlist:'Remis dans la pile à lire ✓', abandoned:'Marqué abandonné ✓'}[s] || `${STATUS_LABEL[s]} ✓`;
    toast(msg, {label:'Annuler', onAction:()=>{ b.status = prev; b.startedAt = prevStart; invalidateCache(); save(); renderLibrary(); }});
  }
  save(); refreshAfterQuick(b);
}
// Appui long tactile → menu d’actions du livre (une carte série, elle, entre en sélection : le
// menu ne vaut que pour un livre). Le menu s’ouvre au RELÂCHEMENT, pas à la 450e milliseconde :
// ouvert sous le doigt encore posé, le dialogue recevait le relâchement — clic sur son fond
// (donc fermé aussitôt) ou, pire, sur un de ses boutons. La vibration, elle, marque l’instant
// où l’appui a pris.
let _lpTimer = null, _lpFired = false, _lpX = 0, _lpY = 0, _lpMenu = null;
$('#lib-grid').addEventListener('pointerdown', e => {
  _lpFired = false; _lpMenu = null; // repart propre à chaque geste (un appui long sans click ne bloque pas le tap suivant)
  if(e.pointerType!=='touch') return;
  const card = e.target.closest('.card'); if(!card) return;
  _lpX = e.clientX; _lpY = e.clientY;
  clearTimeout(_lpTimer);
  _lpTimer = setTimeout(()=>{
    _lpTimer = null;
    if(card.dataset.series || ui.selectMode){
      enterSelect();
      card.dataset.series ? toggleSeries(card.dataset.series, card) : toggleId(card.dataset.id, card);
    } else _lpMenu = state.books.find(x=>x.id===card.dataset.id) || null;
    _lpFired = true;
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_){}
  }, 450);
});
$('#lib-grid').addEventListener('pointermove', e => {
  if(_lpTimer && (Math.abs(e.clientX-_lpX)>10 || Math.abs(e.clientY-_lpY)>10)){ clearTimeout(_lpTimer); _lpTimer=null; }
});
['pointerup','pointercancel','pointerleave'].forEach(ev=>$('#lib-grid').addEventListener(ev, ()=>{
  clearTimeout(_lpTimer); _lpTimer=null;
  const m = _lpMenu; _lpMenu = null;
  if(m) openCardMenu(m);
}));
// Android et iOS ouvrent leur menu « Enregistrer l’image / Copier » sur l’appui long, par-dessus
// notre mode sélection. On ne l’étouffe que pendant un appui long en cours (_lpTimer), juste après
// qu’il a abouti (_lpFired), ou en mode sélection : ailleurs, le menu du navigateur reste dû.
$('#lib-grid').addEventListener('contextmenu', e => {
  if(_lpTimer || _lpFired || ui.selectMode) e.preventDefault();
});
// La carte vient d’être reconstruite (outerHTML) : le focus clavier est tombé sur body. On le rend
// au bouton-cible de sa remplaçante, retrouvée par sa clé (data-id ou data-series).
function refocusCardHit(card){
  const key = card.dataset.series ? '[data-series="'+CSS.escape(card.dataset.series)+'"]' : '[data-id="'+CSS.escape(card.dataset.id||'')+'"]';
  const hit = document.querySelector('#lib-grid .card'+key+' .card-hit');
  if(hit) hit.focus({preventScroll:true});
}
// Navigation clavier entre les couvertures (flèches)
$('#lib-grid').addEventListener('keydown', e => {
  // Raccourcis d’une carte : L (marquer lu), F (favori), Espace (sélectionner) — actifs seulement
  // quand son bouton-cible a le focus, ce que WCAG 2.1.4 permet sans modificateur (contrairement
  // aux raccourcis globaux, qui exigent Alt). Les boutons rapides ✓ ♥ ⋯ et la case de sélection
  // sont sortis de l’ordre de tabulation : vingt cartes = vingt arrêts Tab, plus quatre-vingts.
  if(e.target.matches('.card-hit') && !e.altKey && !e.ctrlKey && !e.metaKey){
    const card = e.target.closest('.card'), k = e.key.toLowerCase();
    if(e.key===' '){
      e.preventDefault(); // sinon le bouton « clique » au relâchement et ouvre la fiche
      enterSelect();
      card.dataset.series ? toggleSeries(card.dataset.series, card) : toggleId(card.dataset.id, card);
      refocusCardHit(card);
      return;
    }
    if((k==='l' || k==='f') && card.dataset.id){
      const b = state.books.find(x=>x.id===card.dataset.id); if(!b) return;
      if(k==='l' && b.status==='read') return; // déjà lu : rien à faire, la touche reste au navigateur
      e.preventDefault();
      if(k==='f') b.favorite = !b.favorite; else markRead(b);
      save(); refreshAfterQuick(b);
      refocusCardHit(card);
      return;
    }
  }
  if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
  // Étoiles d’une rangée au clavier (← → ↑ ↓ par demi-étoile, Home efface, End met 5) : même
  // curseur que sur la fiche, sinon le slider est focusable mais muet. La rangée se reconstruit :
  // on rend le focus aux étoiles.
  if(e.target.matches('.row-stars')){
    const b = state.books.find(x=>x.id===e.target.dataset.book); if(!b) return;
    const v = sliderKeyValue(e.key, b.rating); if(v===undefined) return;
    e.preventDefault();
    setBookRating(b, v); save(); patchCard(b.id);
    const nrs = document.querySelector('#lib-grid .row-stars[data-book="'+CSS.escape(b.id)+'"]'); if(nrs) nrs.focus();
    return;
  }
  if(!e.target.matches('.card-hit')) return;
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
  const target = cards[n].querySelector('.card-hit');
  if(target) target.focus();
});
// Espace sur une carte : le keydown a déjà sélectionné ; on étouffe aussi le keyup, sur lequel
// certains navigateurs déclenchent malgré tout le click du bouton (qui ouvrirait la fiche).
$('#lib-grid').addEventListener('keyup', e => {
  if(e.key===' ' && e.target.matches && e.target.matches('.card-hit')) e.preventDefault();
});

/* =============== Actions en masse =============== */
function selectedBooks(){ return [...ui.selection].map(id=>state.books.find(b=>b.id===id)).filter(Boolean); }
function updateBulkBar(){
  const bar = $('#bulk-bar'), n = ui.selection.size;
  bar.hidden = n===0;
  $('#lib-select').classList.toggle('active', ui.selectMode); $('#lib-select').setAttribute('aria-pressed', String(ui.selectMode));
  if(!n) return;
  bar.innerHTML = `<b>${plur(n,'sélectionné')}</b>
    <div class="bb-actions">
      ${[['type','Type'],['status','Statut'],['tag','Tag'],['fav','♥'],['list','+ Liste'],['del','Supprimer']]
        .map(([k,l])=>`<button data-bulk="${k}"${k==='del'?' class="danger"':''}>${l}</button>`).join('')}
      <button data-bulk="exit" title="Quitter la sélection">✕</button>
    </div>`;
}
$('#lib-layout').addEventListener('click', ()=>{
  ui.libLayout = ui.libLayout==='list' ? 'grid' : 'list';
  persistUI(); renderLibrary();
});
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
  if(!await uiConfirm({ title:`Supprimer ${plur(books.length,'titre')} ?`, message:'Ils seront retirés de ta bibliothèque et de tes listes. Tu pourras annuler juste après.', okLabel:'Supprimer', danger:true })) return;
  const snaps = books.map(b=>({ b, idx:state.books.indexOf(b), memberOf:state.lists.filter(l=>l.bookIds.includes(b.id)).map(l=>l.id) })).sort((a,c)=>a.idx-c.idx);
  const del = new Set(books.map(b=>b.id));
  markBooksDeleted(books);                                     // suppression explicite : les autres appareils ne les ramèneront pas
  state.books = state.books.filter(b=>!del.has(b.id));
  state.lists.forEach(l=> l.bookIds = l.bookIds.filter(id=>!del.has(id)));
  clearSelection(); save(); render();
  toast(`${plur(snaps.length,'titre supprimé','titres supprimés')}`, {label:'Annuler', onAction:()=>{
    snaps.forEach(s=>{ restoreBookIdentity(s.b); state.books.splice(Math.min(s.idx, state.books.length), 0, s.b); s.memberOf.forEach(id=>{ const l = state.lists.find(x=>x.id===id); if(l && !l.bookIds.includes(s.b.id)) l.bookIds.push(s.b.id); }); });
    save(); render();
  }});
}
async function onBulk(action){
  const n = ui.selection.size; if(!n && action!=='exit') return;
  if(action==='exit'){ clearSelection(); renderLibrary(); return; }
  if(action==='del'){ bulkDelete(); return; }
  if(action==='type'){
    const v = await uiChoose({ title:`Type de ${plur(n,'titre')}`, choices:[
      { label:'Livre', value:'livre', default:true }, { label:'BD', value:'bd' }, { label:'Manga', value:'manga' },
    ]});
    if(!v) return;
    applyBulk({ snapshot:b=>b.type, apply:b=>b.type=v, restore:(b,p)=>b.type=p }, `Type → ${TYPE_LABEL[v]}`);
    return;
  }
  if(action==='status'){
    const s = await uiChoose({ title:`Statut de ${plur(n,'titre')}`, choices:[
      { label:'À lire', value:'wishlist' }, { label:'En cours', value:'reading' },
      { label:'Lu', value:'read', default:true }, { label:'Abandonné', value:'abandoned' },
    ]});
    if(!s) return;
    applyBulk({
      snapshot:b=>({status:b.status, startedAt:b.startedAt||null, readings:b.readings.slice()}),
      // la date de début (F40) part avec la lecture créée, puis syncStartedAt la pose ou la retire selon le statut
      apply:b=>{ b.status=s; if(s==='read'){ b.readings=b.readings||[]; if(!b.readings.length) b.readings.push({id:uid(), start:b.startedAt||null, date:today(), rating:null}); } syncStartedAt(b); },
      restore:(b,p)=>{ b.status=p.status; b.startedAt=p.startedAt; b.readings=p.readings; },
    }, `Statut → ${STATUS_LABEL[s]}`);
    return;
  }
  if(action==='tag'){
    const raw = await uiPrompt({ title:'Ajouter un tag', message:`Appliqué aux ${plur(n,'titre sélectionné','titres sélectionnés')}.`, placeholder:'ex : SF, à relire, coup de cœur', okLabel:'Ajouter' });
    const t = (raw||'').trim().slice(0,60);
    if(!t) return;
    applyBulk({
      snapshot:b=>b.tags.slice(),
      apply:b=>{ if(!b.tags.includes(t) && b.tags.length<20) b.tags=[...new Set([...b.tags, t])]; },
      restore:(b,p)=>b.tags=p,
    }, `Tag « ${t} » ajouté`);
    return;
  }
  if(action==='fav'){
    const on = await uiChoose({ title:'Favoris', message:`Pour les ${plur(n,'titre sélectionné','titres sélectionnés')} :`, choices:[
      { label:'♥ Mettre en favori', value:'on', variant:'primary', default:true }, { label:'♡ Retirer des favoris', value:'off' },
    ]});
    if(on===null) return;
    const fav = (on==='on');
    applyBulk({ snapshot:b=>b.favorite, apply:b=>b.favorite=fav, restore:(b,p)=>b.favorite=p }, fav?'Ajoutés aux favoris':'Retirés des favoris');
    return;
  }
  if(action==='list'){
    if(!state.lists.length){ toast('Crée d’abord une liste (onglet Listes)'); return; }
    const l = await uiChoose({ title:'Ajouter à une liste', choices: state.lists.map((l,i)=>({ label:l.name, value:l.id, default:i===0 })) });
    if(!l) return;
    const list = state.lists.find(x=>x.id===l); if(!list) return;
    const books = selectedBooks(); const added = [];
    books.forEach(b=>{ if(!list.bookIds.includes(b.id) && list.bookIds.length<MAX_BOOKIDS){ list.bookIds.push(b.id); added.push(b.id); } });
    clearSelection(); save(); renderLibrary();
    toast(`${plur(added.length,'titre ajouté','titres ajoutés')} à « ${list.name} »`, {label:'Annuler', onAction:()=>{ list.bookIds = list.bookIds.filter(id=>!added.includes(id)); save(); }});
    return;
  }
}
$('#bulk-bar').addEventListener('click', e => {
  const b = e.target.closest('[data-bulk]'); if(b) onBulk(b.dataset.bulk);
});

/* =============== Collections intelligentes (filtres sauvegardés) =============== */
function renderSmartChips(){
  const box = $('#smart-chips'); if(!box) return;
  // Deux boutons frères, pas un ✕ imbriqué dans le bouton du filtre : un contrôle dans un contrôle
  // n’existe pas pour le clavier ni le lecteur d’écran — « oublier » n’était atteignable qu’à la souris.
  box.innerHTML = state.smartCollections.map(c=>
    `<span class="sc-group"><button type="button" class="chip" data-sc="${esc(c.id)}">${esc(c.name)}</button><button type="button" class="chip sc-del" data-sc-del="${esc(c.id)}" aria-label="Oublier le filtre « ${esc(c.name)} »">✕</button></span>`).join('');
}
$('#lib-savefilter').addEventListener('click', async ()=>{
  const name = await uiPrompt({ title:'Mémoriser ces filtres', message:'Retrouve cette combinaison de filtres en un clic depuis ta bibliothèque.', placeholder:'ex : Mangas en cours, SF notés 4+', okLabel:'Mémoriser' });
  if(!name || !name.trim()) return;
  // q : le texte tel que tapé (accents compris), pas sa forme repliée — c’est lui qu’on réaffichera
  state.smartCollections.push({id:uid(), name:name.trim().slice(0,80), f:{status:ui.status, types:[...ui.types], tag:ui.tag, q:$('#lib-q').value.trim(), sort:ui.sort}});
  if(state.smartCollections.length>MAX_SMART) state.smartCollections = state.smartCollections.slice(-MAX_SMART);
  save(); renderSmartChips(); toast('Filtres mémorisés ✓');
});
function applySmart(c){
  ui.status=c.f.status; ui.types=new Set(c.f.types); ui.tag=c.f.tag; ui.q=fold(c.f.q).trim(); ui.sort=c.f.sort;
  // un filtre mémorisé porte un tri, pas un sens : « Mieux notés » doit redonner les mieux notés en tête
  ui.sortDesc=false; syncSortDirBtn();
  $('#lib-q').value=c.f.q; $('#lib-sort').value=c.f.sort;
  syncFilterChips();
  libFilterChanged(); renderLibrary();
  $('#lib-tag').value = c.f.tag;
}
$('#smart-chips').addEventListener('click', e => {
  const del = e.target.closest('[data-sc-del]');
  if(del){ e.stopPropagation(); state.smartCollections = state.smartCollections.filter(c=>c.id!==del.dataset.scDel); save(); renderSmartChips(); return; }
  const chip = e.target.closest('[data-sc]');
  if(chip){ const c = state.smartCollections.find(x=>x.id===chip.dataset.sc); if(c) applySmart(c); }
});

/* =============== Journal =============== */
// Nom accessible d’une ligne du journal : ce que la ligne montre (type, note, relecture) doit
// aussi s’entendre — avant, le lecteur d’écran n’avait que le titre et la date.
function entryLabel(b, date, shown, nth){
  return `${fullTitle(b)}, ${TYPE_LABEL[b.type]||''}, lu le ${fmtDate(date)}${shown?`, ${fmtDec(shown)} sur 5`:''}${nth>0?', relecture':''}`;
}
// F40 : sessions de lecture pour le Journal — une par jour et par livre (dernière page du jour),
// hors jours où une lecture se termine (la ligne « lu » suffit) et hors remises à zéro (page 0).
function sessionEntries(books=state.books){
  const out = [];
  for(const b of books){
    const log = b.progressLog||[]; if(!log.length) continue;
    const ends = new Set((b.readings||[]).map(r=>r.date));
    const byDay = new Map();
    for(const p of log) if(p.page>0 && !ends.has(p.date)) byDay.set(p.date, p.page);
    for(const [date, page] of byDay) out.push({kind:'session', date, b, page});
  }
  return out;
}
// Ligne compacte d’une session : le jour, le titre et la page atteinte — ni note ni badge, ce
// n’est pas une lecture terminée. Même délégation que les lectures (clic → fiche).
function sessionEntryHTML(e){
  const b = e.b, d = new Date(e.date+'T12:00:00');
  const where = `→ page ${e.page}${b.pages ? ` / ${b.pages}` : ''}`;
  return `<div class="entry session" data-id="${esc(b.id)}" data-type="${esc(b.type)}" role="button" tabindex="0" aria-label="${esc(`${fullTitle(b)}, session de lecture du ${fmtDate(e.date)}, page ${e.page}`)}">
    <div class="day"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR',{weekday:'short'})}</span></div>
    <div class="mini">${coverHTML(b, true)}</div>
    <div class="einfo"><div class="et">${esc(fullTitle(b))}</div><div class="ea">${esc(where)}</div></div>
  </div>`;
}
function renderJournal(){
  const y = new Date().getFullYear();
  const gi = goalInfo(y);
  $('#journal-goal').innerHTML = gi ? `
    <div class="goal-line" id="jgoal" role="button" tabindex="0" aria-label="Objectif ${y} : ${gi.done} sur ${gi.goal}">
      <b>Objectif ${y}</b>
      <div class="track"><div class="fill" style="width:${Math.min(100, gi.done/gi.goal*100)}%"></div></div>
      <b>${fmtRatio(gi.done, gi.goal)}</b>
      ${paceHTML(gi)}
      <span class="goal-edit-hint" aria-hidden="true">✎ Modifier</span>
    </div>` : `
    <div class="goal-line" id="jgoal" role="button" tabindex="0" aria-label="Définir un objectif de lecture">
      <span style="color:var(--muted)">Fixe-toi un objectif de lectures pour ${y} →</span>
      <span class="goal-edit-hint" aria-hidden="true">✎ Modifier</span>
    </div>`;
  $('#jgoal').addEventListener('click', ()=>setGoal(y));

  // F40 : les sessions de lecture (pages enregistrées jour par jour) se glissent entre les lectures
  // terminées, derrière une puce désactivée par défaut — elles noieraient sinon les lectures.
  const sessions = sessionEntries();
  let entries = allReadings().slice();
  if(ui.journalSessions && sessions.length) entries = entries.concat(sessions);
  entries.sort((a,b)=> b.date.localeCompare(a.date) || (a.kind==='session') - (b.kind==='session'));
  const box = $('#journal-body');
  if(!entries.length){
    // Un état vide qui explique sans rien proposer laisse au lecteur le soin de deviner par où
    // commencer : les deux gestes qui remplissent un journal sont ici, à portée de pouce.
    box.innerHTML = `<div class="empty"><div class="big orn" aria-hidden="true">❦</div><h3>Ton journal attend sa première page</h3>
      <p>Marque un titre comme « Lu » et il viendra s’inscrire ici, mois par mois, relectures comprises. Dans un an, ce sera ta plus belle liste.</p>
      <div class="today-actions">
        <button type="button" class="btn primary" id="journal-add-read">Enregistrer une lecture terminée</button>
        <button type="button" class="btn" id="journal-lib">Voir ma bibliothèque</button>
      </div></div>`;
    return;
  }
  // Navigation par année : après un import Goodreads, le journal fait plusieurs milliers de
  // lignes et l’on ne peut plus atteindre 2019 qu’au défilement. Les puces filtrent avant le
  // groupement par mois ; le choix est persisté (persistUI) car on revient souvent à la même année.
  const years = [...new Set(entries.map(e=>e.date.slice(0,4)))].sort((a,b)=>b.localeCompare(a)).slice(0,8);
  if(ui.journalYear!=='all' && !years.includes(ui.journalYear)){ ui.journalYear = 'all'; persistUI(); }
  // Puce « Sessions » (F40) : seulement s’il y a des pages enregistrées quelque part — sinon rien à montrer.
  const sessChip = sessions.length
    ? `<button type="button" class="chip chip-sess${ui.journalSessions?' active':''}" data-jsess aria-pressed="${!!ui.journalSessions}" title="Montrer les pages enregistrées jour par jour">Sessions</button>`
    : '';
  const yearsHTML = (years.length>1 || sessChip)
    ? `<div class="chips" id="journal-years" role="group" aria-label="Filtrer le journal">` +
      (years.length>1 ? ['all', ...years].map(y=>{
        const on = ui.journalYear===y;
        return `<button type="button" class="chip${on?' active':''}" data-jy="${esc(y)}" aria-pressed="${on}">${y==='all'?'Tout':esc(y)}</button>`;
      }).join('') : '') + sessChip + `</div>`
    : '';
  if(ui.journalYear!=='all') entries = entries.filter(e=>e.date.startsWith(ui.journalYear));
  const groups = new Map();
  for(const e of entries){
    const key = e.date.slice(0,7);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  // « À la même période l’an dernier » : lectures dans une fenêtre de ±15 jours autour
  // d’aujourd’hui moins un an — petit moment de nostalgie façon « souvenirs ».
  let html = yearsHTML;
  const _past = new Date(); _past.setFullYear(_past.getFullYear()-1);
  const _lo = new Date(_past); _lo.setDate(_lo.getDate()-15);
  const _hi = new Date(_past); _hi.setDate(_hi.getDate()+15);
  const ago = entries.filter(e=>e.kind!=='session' && e.date>=dateKey(_lo) && e.date<=dateKey(_hi));
  if(ago.length){
    html += `<div class="month ago-month"><h3>${ic('calendar',15)} À la même période l’an dernier</h3>` + ago.slice(0,6).map(e=>{
      const b = e.b, d = new Date(e.date+'T12:00:00'), shown = e.rating ?? b.rating;
      return `<div class="entry" data-id="${esc(b.id)}" data-type="${esc(b.type)}" role="button" tabindex="0" aria-label="${esc(entryLabel(b, e.date, shown, 0))}">
        <div class="day"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR',{weekday:'short'})}</span></div>
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="einfo"><div class="et">${esc(fullTitle(b))}</div><div class="ea">${esc(authorsStr(b))}</div></div>
        <div class="emeta">${starsHTML(shown)}</div>
      </div>`;
    }).join('') + `</div>`;
  }
  for(const [key, list] of groups){
    const label = new Date(key+'-15T12:00:00').toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
    // Le compte par mois donne le rythme d’un coup d’œil sans avoir à dénombrer les lignes.
    const nRead = list.filter(e=>e.kind!=='session').length, nSess = list.length - nRead;
    const count = [nRead ? plur(nRead,'lecture') : '', nSess ? plur(nSess,'session') : ''].filter(Boolean).join(' · ');
    html += `<div class="month"><h3>${label} <span class="mcount">· ${count}</span></h3>` + list.map(e => {
      if(e.kind==='session') return sessionEntryHTML(e);
      const b = e.b;
      const d = new Date(e.date+'T12:00:00');
      const sorted = (b.readings||[]).slice().sort((x,y2)=>x.date.localeCompare(y2.date)||String(x.id).localeCompare(String(y2.id)));
      const nth = sorted.findIndex(r=>r.id===e.rid);
      const shown = e.rating ?? b.rating;
      return `<div class="entry" data-id="${esc(b.id)}" data-type="${esc(b.type)}" role="button" tabindex="0" aria-label="${esc(entryLabel(b, e.date, shown, nth))}">
        <div class="day"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fr-FR',{weekday:'short'})}</span></div>
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="einfo">
          <div class="et">${esc(fullTitle(b))}</div>
          <div class="ea">${esc(authorsStr(b))}</div>
        </div>
        <div class="emeta">
          ${nth>0 ? `<span class="reread" title="Relecture n°${nth+1}">↻</span>` : ''}
          ${b.review ? `<span class="rv" title="Critique">${ic('doc',13)}</span>` : ''}
          ${b.favorite ? `<span class="fav" style="color:var(--orange)">♥</span>` : ''}
          <span class="tbadge ${esc(b.type)}">${TYPE_LABEL[b.type]}</span>
          ${shown ? starsHTML(shown)
                  : `<button type="button" class="btn small" data-rate="${esc(b.id)}" aria-label="Noter ${esc(fullTitle(b))}">★ Noter</button>`}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }
  box.innerHTML = html;
}
// Un seul écouteur pour un corps entièrement réécrit à chaque rendu : puces d’années,
// boutons de l’état vide et lignes de lecture passent tous par la délégation.
$('#journal-body').addEventListener('click', e => {
  const chip = e.target.closest('[data-jy]');
  if(chip){ ui.journalYear = chip.dataset.jy; persistUI(); renderJournal(); return; }
  if(e.target.closest('[data-jsess]')){ ui.journalSessions = !ui.journalSessions; persistUI(); renderJournal(); return; }
  // « Lu » comme statut par défaut : depuis le Journal on saisit une lecture terminée,
  // pas une envie (cf. openSearch({status})).
  if(e.target.closest('#journal-add-read')){ openSearch({status:'read'}); return; }
  if(e.target.closest('#journal-lib')){ selectView('library'); return; }
  // « ★ Noter » d’une ligne sans note : la fiche s’ouvre avec la ligne d’étoiles mise en avant
  // (pulse), au lieu de laisser chercher où l’on note. Le bouton vit dans une ligne role=button :
  // au lecteur d’écran la ligne reste un seul bouton (la fiche, où la note se pose aussi).
  const rt = e.target.closest('[data-rate]');
  if(rt){ e.stopPropagation(); openDetail(rt.dataset.rate, {pulse:true}); return; }
  const row = e.target.closest('.entry'); if(row) openDetail(row.dataset.id);
});

/* =============== Recherche / ajout =============== */
const SEARCH_HINT = `<div class="search-hint">Recherche via la BnF, Google Books et Open Library : couvertures et infos remplies automatiquement.<br>Astuce : « One Piece 42 » préremplit la série et le tome. Introuvable ? « Ajout manuel ».</div>`;
// opts.keep : réouverture depuis la pile de modales (retour du formulaire « Détails ») — on garde
// la requête et les résultats déjà affichés, et on ne redonne pas le focus au champ (le clavier
// mobile masquerait la liste qu’on vient justement de retrouver).
// opts.status : statut pré-sélectionné selon la porte d’entrée (« Ajouter une lecture » → Lu,
// le « + » générique → À lire). Repart de zéro à chaque ouverture, jamais d’une session à l’autre.
function openSearch(opts){
  const keep = !!(opts && opts.keep === true);
  openOverlay('#ov-search');
  requestAnimationFrame(fitSearchResults); // après le calcul de mise en page : la liste a sa position
  if(keep) return;
  setDefaultStatus((opts && opts.status) || 'wishlist');
  ui.addedInSession = 0; ui.addedRead = [];
  $('#search-q').value = '';
  _lastQ = '';
  $('#search-results').innerHTML = SEARCH_HINT;
  $('#search-live').textContent = '';
  setTimeout(()=>$('#search-q').focus(), 60);
}
// Le segment et les boutons « Ajouter » disent la même chose : on ne peut pas ajouter « Lu »
// sans le voir écrit sur le bouton qu’on touche.
function setDefaultStatus(s){
  ui.defaultStatus = ['wishlist','reading','read'].includes(s) ? s : 'wishlist';
  $$('#search-status button').forEach(x=>{
    const on = x.dataset.s === ui.defaultStatus;
    x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
  });
  relabelAddButtons();
}
const addLbl = ()=>`Ajouter · ${STATUS_LABEL[ui.defaultStatus].toLowerCase()}`;
function relabelAddButtons(){
  $$('#search-results .add:not(:disabled)').forEach(b=>{
    b.textContent = addLbl();
    b.setAttribute('aria-label', `Ajouter comme ${STATUS_LABEL[ui.defaultStatus].toLowerCase()}`);
  });
}
// Clavier mobile : il recouvre la moitié basse de l'écran sans que la mise en page CSS bouge
// (seul visualViewport rétrécit), donc la liste de résultats passait dessous — on ne voyait plus
// aucun titre après avoir tapé. On borne sa hauteur à ce qui reste réellement visible.
function fitSearchResults(){
  const box = $('#search-results');
  if(!box) return;
  const vv = window.visualViewport;
  // Tant qu'aucun clavier ne mange l'écran (ou si la mise en page, elle, a bien rétréci), on
  // laisse faire la règle CSS (max-height:52vh) : la borne inline ne sert qu'au cas du clavier.
  if(!vv || !$('#ov-search').classList.contains('open') || vv.height > innerHeight - 80){ box.style.maxHeight = ''; return; }
  const top = box.getBoundingClientRect().top;
  box.style.maxHeight = Math.max(160, vv.height + vv.offsetTop - top - 12) + 'px';
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', fitSearchResults);
  window.visualViewport.addEventListener('scroll', fitSearchResults);
}
$('#btn-open-search').addEventListener('click', ()=>openSearch());

let searchTimer = null, searchSeq = 0, searchCtl = null, _lastQ = '';
// Seuil de déclenchement : 3 lettres pour du texte (2 suffisaient à lancer une volée par lettre
// et à brûler le quota), mais 2 chiffres pour un ISBN qu'on est en train de recopier.
function searchReady(q){ return q.length >= (/^\d/.test(q) ? 2 : 3); }
$('#search-q').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if(!searchReady(q)){
    searchSeq++;
    _lastQ = '';
    $('#search-results').innerHTML = SEARCH_HINT;
    $('#search-live').textContent = ''; // plus de résultat à l'écran : rien à annoncer
    return;
  }
  if(q === _lastQ) return;          // effacer puis retaper la même chose : résultats déjà à l'écran
  _lastQ = q;
  searchTimer = setTimeout(()=>doSearch(q), 600);
});
$('#search-q').addEventListener('keydown', e => {
  if(e.key==='Enter'){
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if(searchReady(q)){ _lastQ = q; doSearch(q); }
  }
});
// La BnF et Open Library parlent MARC (« fre », « ger »…), Google Books et le menu Langue parlent ISO 639-1
// (« fr », « de »…). On ramène tout au même alphabet pour que le tri par langue et le marqueur
// affiché soient cohérents entre les deux sources. Code inconnu = laissé tel quel, en majuscules.
const MARC_TO_ISO = { fre:'fr', fra:'fr', eng:'en', ger:'de', deu:'de', spa:'es', ita:'it', jpn:'ja',
  rus:'ru', por:'pt', dut:'nl', nld:'nl', chi:'zh', zho:'zh', kor:'ko', ara:'ar', heb:'he', gre:'el', ell:'el' };
function olLang(code){
  const c = String(code||'').toLowerCase().slice(0,3);
  return MARC_TO_ISO[c] || c;
}
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
let _gbQuotaHit = false;   // quota Google épuisé : message honnête plutôt que « une source indisponible »
let _gbTooFast = false;    // limite de Tome (60 recherches/min) : c'est passager, le message doit le dire
let _gbPartial = false;    // une des deux sources du Worker (Google ou la BnF) est tombée tandis que l’autre répond
// Version des réponses de /api/books, alignée sur la clé de cache du Worker (books-v3). Le Worker
// l’ignore : elle ne sert qu’à changer l’URL, donc à écarter tout de suite du cache du NAVIGATEUR
// (max-age de 24 h) les réponses d’avant la correction de la requête BnF, où disques et films se
// mêlaient aux livres. À incrémenter avec la clé du Worker.
const BOOKS_API_V = 3;
// La recherche BnF + Google passe par /api/books (Worker) : quota propre à Tome + cache de bordure.
// Le Worker garde la forme Google historique et ajoute des résultats BnF déjà normalisés.
async function searchGoogleBooks(q, opts={}){
  const isbn = isbnOf(q);
  const forced = (ui.searchLang && ui.searchLang!=='auto' && ui.searchLang!=='all') ? ui.searchLang : (opts.lang||'');
  const url = `${API_BASE}/api/books?q=${encodeURIComponent(isbn ? 'isbn:'+isbn : q)}${forced?'&lang='+encodeURIComponent(forced):''}&v=${BOOKS_API_V}`;
  const res = await fetch(url, opts.signal ? {signal:opts.signal} : undefined);
  const data = await res.json().catch(()=>null);
  if(!res.ok || !data){
    // seul le vrai épuisement du quota Google justifie le message « limite du jour »
    if(data && data.error==='gb-quota') _gbQuotaHit = true;
    // 429 vient du garde-fou de Tome, pas de Google : réessayer dans une minute suffit
    if(res.status===429) _gbTooFast = true;
    throw new Error('gb-'+res.status);
  }
  if(data.error){ if(data.error.code===429) _gbQuotaHit = true; throw new Error('gb-'+(data.error.code||'err')); }
  const googleItems = (data.items||[]).filter(it=>it.volumeInfo && it.volumeInfo.title).map(it => {
    const v = it.volumeInfo;
    return {
      title: v.title + (v.subtitle ? ' : '+v.subtitle : ''),
      authors: v.authors||[],
      year: +(v.publishedDate||'').slice(0,4) || null,
      pages: numOrNull(v.pageCount),
      cover: v.imageLinks ? (v.imageLinks.thumbnail||v.imageLinks.smallThumbnail||'').replace('http://','https://') : '',
      isbn: (()=>{ const ids = v.industryIdentifiers||[]; const i13 = ids.find(x=>x.type==='ISBN_13'), i10 = ids.find(x=>x.type==='ISBN_10'); return (i13&&i13.identifier) || (i10&&i10.identifier) || ''; })(),
      type: guessType((v.categories||[]).join(' '), v.title),
      lang: String(v.language||''),
      description: typeof v.description==='string' ? v.description : '',
      source:'googlebooks',
    };
  });
  const bnfItems = (Array.isArray(data.bnfItems) ? data.bnfItems : []).filter(r=>r && typeof r.title==='string' && r.title.trim()).map(r=>({
    title:String(r.title).trim().slice(0,300),
    authors:Array.isArray(r.authors) ? r.authors.filter(a=>typeof a==='string' && a.trim()).map(a=>a.trim().slice(0,200)).slice(0,8) : [],
    year:numIn(r.year,1000,2200), pages:numIn(r.pages,1,100000), cover:cleanCover(r.cover),
    isbn:String(r.isbn||'').replace(/[^0-9Xx]/g,'').toUpperCase().slice(0,13),
    type:['livre','bd','manga'].includes(r.type) ? r.type : 'livre', lang:olLang(r.lang),
    description:typeof r.description==='string' ? r.description.slice(0,5000) : '',
    series:typeof r.series==='string' ? r.series.slice(0,150) : '', volume:numIn(r.volume,1,9999), source:'bnf',
  }));
  if(data.tomeSources && data.tomeSources.google!=='ok'){
    _gbPartial=true;
    if(data.tomeSources.google==='gb-quota') _gbQuotaHit=true;
  }
  // L’inverse arrive aussi : la BnF tombe (bnf-net, bnf-http, bnf-diag) ou ne répond qu’à moitié
  // (bnf-partial) pendant que Google répond. Sans ce test, une recherche vide disait « Aucun
  // résultat » alors que la première source du catalogue français n’avait pas été interrogée.
  if(data.tomeSources && data.tomeSources.bnf && data.tomeSources.bnf!=='ok') _gbPartial=true;
  // Recherche PAR ISBN : c'est l'édition qu'on a en main. Google renvoie parfois une autre
  // édition (traduction, poche) dont l'ISBN n'est pas celui scanné — on réimpose le nôtre.
  if(isbn) [...bnfItems, ...googleItems].forEach(r=>{ r.isbn = isbn; });
  return [...bnfItems, ...googleItems];
}
async function searchOpenLibrary(q, opts={}){
  const isbn = isbnOf(q);
  const l = searchLangFor(q);
  const fr = (l === 'fr');
  const fopts = opts.signal ? {signal:opts.signal} : undefined;
  const base = `https://openlibrary.org/search.json?q=${encodeURIComponent(isbn ? 'isbn:'+isbn : q)}&limit=15${(l && l!=='all') ? '&lang='+l : ''}&fields=title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,first_sentence,isbn,language`;
  // `lang=` ne fait qu'orienter le tri d'Open Library ; c'est `language=` (code MARC, « fre »)
  // qui filtre réellement les éditions. Repli sans le filtre si le français ne rend rien.
  let data = await (await fetch(base + (fr ? '&language=fre' : ''), fopts)).json();
  if(fr && !(data.docs||[]).length) data = await (await fetch(base, fopts)).json();
  const items = (data.docs||[]).filter(d=>d.title).map(d => {
    const all = d.isbn||[];
    // 978-2 = domaine linguistique français, 979-10 = France : préférés quand on cherche en
    // français, sinon on garde le premier ISBN-13 (puis ISBN-10) proposé.
    const preferred = fr ? all.find(x=>/^(?:9782|9791)\d{9}$/.test(x)) : '';
    return {
      title: d.title,
      authors: d.author_name||[],
      year: numOrNull(d.first_publish_year),
      pages: numOrNull(d.number_of_pages_median),
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
      isbn: preferred || all.find(x=>/^\d{13}$/.test(x)) || all.find(x=>/^\d{9}[\dX]$/i.test(x)) || '',
      type: guessType((d.subject||[]).slice(0,25).join(' '), d.title),
      lang: olLang((d.language||[])[0]),
      description: Array.isArray(d.first_sentence) ? String(d.first_sentence[0]||'') : (typeof d.first_sentence==='string' ? d.first_sentence : ''),
    };
  });
  if(isbn) items.forEach(r=>{ r.isbn = isbn; });   // même raison que côté Google Books
  return items;
}
async function doSearch(q){
  const seq = ++searchSeq;
  const box = $('#search-results');
  // Une seule phrase est annoncée au lecteur d'écran (#search-live), pas les 20 lignes de la liste.
  const live = $('#search-live');
  const dire = t => { if(live) live.textContent = t; };
  _gbQuotaHit=false; _gbTooFast=false; _gbPartial=false;
  dire('Recherche…');
  box.innerHTML = Array(4).fill('<div class="sr sk"><div class="mini"></div><div class="sri"><b></b><span></span></div></div>').join('');
  // Une frappe rapide lançait jusqu'à deux requêtes par lettre et laissait courir les anciennes :
  // on annule la volée précédente au lieu de la laisser consommer le quota et la bande passante.
  if(searchCtl) searchCtl.abort();
  searchCtl = new AbortController();
  const signal = searchCtl.signal;
  const settled = await Promise.allSettled([searchGoogleBooks(q, {signal}), searchOpenLibrary(q, {signal})]);
  if(seq !== searchSeq) return;
  // annulation volontaire : ne rien peindre (une recherche plus récente s'en charge)
  if(settled.some(s => s.status==='rejected' && s.reason && s.reason.name==='AbortError')) return;
  const [gb, ol] = settled.map(s => s.status==='fulfilled' ? s.value : null);
  const failed = settled.some(s => s.status==='rejected') || _gbPartial;
  if(gb===null && ol===null){
    box.innerHTML = `<div class="search-hint">Recherche indisponible (hors ligne ?). Tu peux toujours passer par « Ajout manuel ».</div>`;
    dire('Recherche indisponible');
    return;
  }
  const items = [], byIsbn = new Map(), byTitle = new Map();
  for(const r of [...(gb||[]), ...(ol||[])]){
    const isbn=String(r.isbn||'').replace(/[^0-9Xx]/g,'').toUpperCase();
    const titleKey=(r.title+'|'+(r.authors[0]||'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
    // Deux ISBN différents sont deux éditions différentes. Le titre sert de repli seulement
    // lorsqu'une source ne fournit pas d'ISBN.
    let i;
    if(isbn && byIsbn.has(isbn)) i=byIsbn.get(isbn);
    else if(!isbn && byTitle.has(titleKey)) i=byTitle.get(titleKey);
    else if(isbn && byTitle.has(titleKey) && !items[byTitle.get(titleKey)].isbn) i=byTitle.get(titleKey);
    if(i===undefined){
      i=items.length; items.push(r);
      if(isbn) byIsbn.set(isbn,i);
      byTitle.set(titleKey,i);
      continue;
    }
    const keep=items[i];
    for(const k of ['cover','description','series','volume','pages','year','lang','isbn']) if(!keep[k] && r[k]) keep[k]=r[k];
    if((!keep.authors || !keep.authors.length) && r.authors) keep.authors=r.authors;
    if(isbn) byIsbn.set(isbn,i);
  }
  if(!items.length){
    box.innerHTML = `<div class="search-hint">${failed
      ? (_gbTooFast ? 'Trop de recherches d’affilée : réessaie dans une minute ou passe par « Ajout manuel ».'
        : _gbQuotaHit ? 'Google Books a atteint sa limite du jour ; la BnF et Open Library n’ont rien trouvé. Essaie l’ISBN, une autre langue (menu Langue), ou « Ajout manuel ».'
                      : 'Une des sources est indisponible et l’autre n’a rien trouvé. Réessaie dans une minute ou passe par « Ajout manuel ».')
      : 'Aucun résultat. Essaie une autre orthographe ou une autre langue (menu Langue), ou passe par « Ajout manuel ».'}</div>`;
    dire('Aucun résultat');
    return;
  }
  // Éditions dans la langue cherchée d'abord (tri stable : à langue égale, l'ordre des sources
  // et de pertinence est conservé) — sans quoi « L'Étranger » remonte des éditions anglaises.
  const want = searchLangFor(q);
  if(want && want!=='all') items.sort((a,b) => (b.lang===want) - (a.lang===want));
  window._searchItems = items;
  const note = (failed && (_gbQuotaHit || _gbTooFast))
    ? `<div class="search-hint" style="margin-bottom:8px">${_gbTooFast
        ? 'Trop de recherches d’affilée : résultats déjà chargés seulement, puis réessaie dans une minute.'
        : 'Google Books a atteint sa limite du jour : résultats BnF et Open Library seulement.'}</div>` : '';
  // Doublons : on ajoutait deux fois le même livre sans rien voir. La bibliothèque est indexée
  // par (titre, premier auteur) — la même clé que les recommandations — et la ligne concernée
  // propose d’ouvrir la fiche existante au lieu d’un second exemplaire.
  const mine = new Map(state.books.map(b => [bookLibKey(b.title, (b.authors||[])[0]), b.id]));
  box.innerHTML = note + items.map((r,i) => {
    const c = cleanCover(r.cover);
    const owned = mine.get(bookLibKey(r.title, (r.authors||[])[0]));
    return `<div class="sr${owned?' owned':''}">
      <div class="mini">${c ? `<img src="${esc(c)}" alt="" loading="lazy"${xorigin(c)} referrerpolicy="no-referrer">` : phHTML({title:r.title, authors:r.authors, type:r.type}, true)}</div>
      <div class="sri">
        <b>${esc(r.title)}</b>
        <span>${esc(r.authors.join(', '))}</span>
        <span>${[r.year, r.pages?r.pages+' p.':'' ].filter(Boolean).join(' · ')}${r.lang?` <span class="sr-lang">${esc(r.lang.toUpperCase())}</span>`:''}</span>
      </div>
      ${owned
        ? `<button type="button" class="btn small sr-owned" data-open="${esc(owned)}">Dans ta bibliothèque · Ouvrir</button>`
        : `<button type="button" class="btn small add-edit" data-i="${i}" title="Vérifier ou compléter la fiche avant d’ajouter">Compléter…</button>
      <button type="button" class="btn small primary add" data-i="${i}" aria-label="Ajouter comme ${esc(STATUS_LABEL[ui.defaultStatus].toLowerCase())}">${esc(addLbl())}</button>`}
    </div>`; }).join('');
  dire(`${plur(items.length,'résultat')} pour « ${q} »`
    + ((failed && _gbTooFast) ? ' : trop de recherches d’affilée.'
     : (failed && _gbQuotaHit) ? ' : BnF et Open Library seulement, Google Books a atteint sa limite du jour.' : ''));
}
function parseTome(title){
  let m = title.match(/^(.*?)[\s,–—:-]*(?:tome|t\.|vol(?:ume)?\.?|#)\s*(\d{1,4})\b/i);
  if(m && m[1].trim()) return {series:m[1].trim().replace(/[,–—:-]+$/,'').trim(), volume:+m[2]};
  m = title.match(/^(.+?)[\s,–—-]+(\d{1,3})$/);
  if(m && +m[2] <= 300) return {series:m[1].trim(), volume:+m[2]};
  return null;
}
$('#search-results').addEventListener('click', async e => {
  // Ligne déjà dans la bibliothèque (ou fraîchement ajoutée) : on ouvre la fiche existante.
  const goto = e.target.closest('[data-open]');
  if(goto){ openDetail(goto.dataset.open); return; }
  const edit = e.target.closest('.add-edit');
  const btn = edit || e.target.closest('.add'); if(!btn) return;
  const r = (window._searchItems||[])[+btn.dataset.i]; if(!r) return;
  // Un nombre nu à la fin d’un titre n’est un tome que pour une BD ou un manga : sur un roman,
  // parseTome inventait des séries (« Catch-22 » → série « Catch », tome 22).
  const pt = ((r.type==='manga' || r.type==='bd') ? parseTome(r.title) : parenTome(r.title)) || {};
  const data = {
    title:r.title, authors:r.authors||[], type:r.type||'livre',
    year:r.year||null, pages:r.pages||null, cover:cleanCover(r.cover||''), isbn:r.isbn||'',
    synopsis:cleanSynopsis(r.description||''), status:ui.defaultStatus,
    series:r.series||pt.series||'', volume:r.volume ?? pt.volume ?? null,
  };
  if(edit){
    // « Détails » : passer par le formulaire complet. Pas de closeOverlays : openOverlay gère la
    // transition et empile la recherche, pour y revenir (requête et résultats intacts) après coup.
    ui.searchFromResult = data;
    openEdit(null);
    return;
  }
  // Filet de dernière minute : la liste peut dater d’avant un ajout (autre édition du même livre,
  // deuxième clic sur une ligne voisine) — on demande avant de créer un doublon.
  const dejaLa = state.books.some(b => bookLibKey(b.title, (b.authors||[])[0]) === bookLibKey(data.title, data.authors[0]));
  if(dejaLa && !await uiConfirm({ title:'Déjà dans ta bibliothèque',
    message:'Ajouter quand même une seconde fiche ?', okLabel:'Ajouter quand même' })) return;
  // Ajout express : créer tout de suite, garder la recherche ouverte pour enchaîner
  const b = newBook(data);
  // « Lu » n’est pas « lu aujourd’hui » : newBook daterait la lecture du jour sans le dire, ce qui
  // fausse le journal et l’objectif quand on saisit d’anciennes lectures. La date est demandée en
  // sortie de recherche (cf. endSearchSession).
  const sansDate = data.status === 'read';
  if(sansDate){ b.readings = []; ui.addedRead.push(b.id); }
  state.books.unshift(b);
  ui.addedInSession++;
  save(); scheduleRender();
  const row = btn.closest('.sr');
  const editBtn = row && row.querySelector('.add-edit');
  if(row){ row.classList.add('added'); btn.textContent = 'Ajouté ✓'; btn.disabled = true; }
  // « Compléter… » n’a plus de sens une fois le livre créé : le même bouton ouvre sa fiche.
  if(editBtn){ editBtn.dataset.open = b.id; editBtn.textContent = 'Ouvrir'; editBtn.title = 'Ouvrir la fiche'; }
  toast(`Ajouté · ${STATUS_LABEL[b.status].toLowerCase()} ✓`, { label:'Annuler', onAction:()=>{
    const i = state.books.indexOf(b);
    if(i >= 0){ markBooksDeleted([b]); state.books.splice(i,1); invalidateCache(); save(); scheduleRender(); }
    ui.addedInSession = Math.max(0, ui.addedInSession - 1);
    ui.addedRead = ui.addedRead.filter(id => id !== b.id);
    if(row) row.classList.remove('added');
    btn.disabled = false; btn.textContent = addLbl();
    if(editBtn){ delete editBtn.dataset.open; editBtn.textContent = 'Compléter…'; editBtn.title = 'Vérifier ou compléter la fiche avant d’ajouter'; }
  }});
});
// « One Piece 42 » tapé à la main : un nombre isolé à la fin de la requête est un tome.
// L’espace est exigée et le nombre plafonné pour ne pas transformer « Catch-22 » en série
// « Catch » ni « Fahrenheit 451 » en tome 451. parenTome, lui, ne lit que « (Série, #N) »
// et « tome N » — les deux se complètent.
function typedTome(q){
  const m = String(q).match(/^(.+?)\s+(\d{1,3})$/);
  return (m && +m[2] <= 300) ? { series:m[1].trim(), volume:+m[2] } : null;
}
$('#btn-manual').addEventListener('click', ()=>{
  // Ne pas jeter ce qui vient d’être tapé : la requête devient le titre (sauf si c’est un ISBN,
  // qui n’est pas un titre), et la série et le tome sont déduits quand ils sont explicites.
  const q = $('#search-q').value.trim();
  const pt = parenTome(q) || typedTome(q) || {};
  ui.searchFromResult = {
    // Tome déduit : le titre devient la série seule (convention d’addNextTome). Sinon fullTitle
    // recollait le numéro déjà tapé : « One Piece, tome 42 — One Piece 42 ».
    title: isbnOf(q) ? '' : (pt.series || q),
    status: ui.defaultStatus,
    series: pt.series || '',
    volume: pt.volume ?? null,
  };
  openEdit(null);
});
$('#search-status').addEventListener('click', e => {
  const b = e.target.closest('button[data-s]'); if(!b) return;
  // setDefaultStatus reboutonne AUSSI les « Ajouter » déjà affichés : le segment et le bouton
  // qu’on touche ne peuvent pas annoncer deux statuts différents. Rien n’est persisté (persistUI).
  setDefaultStatus(b.dataset.s);
});

/* ---- Fin de session d’ajout ----
   La modale Ajouter se referme pour de bon (✕, Échap, Retour) : c’est le seul moment où on peut
   solder ce qui vient d’être fait sans casser l’enchaînement des ajouts. Deux choses restent en
   suspens : les « Lu » créés sans date (newBook aurait daté d’aujourd’hui à notre insu, cf. le
   handler d’ajout) et le fait qu’on ne voit nulle part les livres ajoutés quand on n’est pas dans
   Bibliothèque. Quitter la recherche pour le formulaire « Détails » NE passe pas par ici : cette
   transition empile la recherche (openOverlay) et la session continue. */
function endSearchSession(){
  const n = ui.addedInSession;
  // Un « Lu » redevenu daté entre-temps (fiche ouverte, date saisie) ne doit plus être proposé.
  const sansDate = ui.addedRead.filter(id => {
    const b = state.books.find(x => x.id === id);
    return b && b.status === 'read' && !(b.readings || []).length;
  });
  ui.addedInSession = 0; ui.addedRead = [];
  if(!n && !sansDate.length) return;
  // Laisser l’historique se replier d’abord : closeOverlays vient de rendre ses entrées
  // (history.go différé), et pousser celle du dialogue au milieu de ce voyage la perdrait.
  setTimeout(()=>{
    (sansDate.length ? askReadDates(sansDate) : Promise.resolve(false)).then(datees=>{
      // Un seul toast à l’écran : celui qui mène aux livres ajoutés prime, sauf si on est déjà
      // dans Bibliothèque (on les y voit) — auquel cas on confirme la datation.
      if(n > 0 && ui.view !== 'library') toast(`${plur(n,'livre ajouté','livres ajoutés')}`, { label:'Voir', onAction:()=>{
        resetFilters();                 // sinon un filtre laissé actif cache justement l’ajout
        resetSort();
        persistUI(); selectView('library');
      }});
      else if(datees){ const m = sansDate.length; toast(`Lecture${m>1?'s':''} datée${m>1?'s':''} d’aujourd’hui ✓`); }
    });
  }, 160);
}
// « Lu » ne veut pas dire « lu aujourd’hui » : on demande une fois, à la sortie, plutôt que de
// dater en silence. « Je ne sais plus » est une réponse valable — la fiche reste sans date, et
// le journal comme l’objectif l’ignorent (allReadings ne lit que les lectures datées).
async function askReadDates(ids){
  const n = ids.length;
  const v = await uiChoose({
    title:'Lu quand ?',
    message:`${plur(n,'lecture ajoutée','lectures ajoutées')} sans date de fin. Sans date, elle${n>1?'s':''} ne compte${n>1?'nt':''} ni dans ton journal ni dans ton objectif.`,
    // « Je ne sais plus » sert de bouton d’annulation : Échap et Retour tombent donc dessus,
    // et rien n’est daté par défaut. Deux boutons suffisent — un troisième « Annuler » ferait
    // double emploi avec lui.
    choices:[{ label:'Aujourd’hui', value:'today', variant:'primary', default:true }],
    cancelLabel:'Je ne sais plus',
  });
  if(v !== 'today') return false;
  const d = today();
  ids.forEach(id => {
    const b = state.books.find(x => x.id === id);
    if(b && !(b.readings || []).length) b.readings = [{ id:uid(), date:d, rating:null }];
  });
  invalidateCache(); save(); scheduleRender();
  return true;   // le toast est laissé à endSearchSession, qui sait s’il a mieux à dire
}

/* =============== Synopsis à la demande =============== */
// Livres dont la recherche est en cours : un second tap pendant les quelques secondes de la
// requête relançait tout (deux appels réseau, deux toasts). Le bouton se grise ; comme la fiche
// se reconstruit à chaque action (statut, note…), openDetail le regénère grisé tant que l’id est ici.
const _synBusy = new Set();
async function fetchSynopsis(b){
  if(_synBusy.has(b.id)) return;
  _synBusy.add(b.id);
  const btn = $('#d-syn-fetch');
  if(btn){ btn.disabled = true; btn.setAttribute('aria-busy','true'); btn.textContent = 'Recherche…'; }
  toast('Recherche du synopsis…', {ms:20000}); // remplacé par le toast de résultat, jamais avant
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
      toast('Synopsis ajouté ✓');
    }else{
      toast('Pas de synopsis trouvé. Tu peux le coller via ✎ Modifier');
    }
  }catch(_){ toast('Recherche indisponible'); }
  finally{
    _synBusy.delete(b.id);
    // la fiche encore ouverte sur ce livre se reconstruit : synopsis affiché, ou bouton rendu
    if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
  }
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
  // Un ISBN est TOUJOURS un EAN-13 en 978/979 : accepter l'EAN-8 (et les 13 chiffres qui n'en
  // sont pas, comme le code-barres prix d'un magasin) lançait une recherche vouée à l'échec.
  try{ detector = new BarcodeDetector({formats:['ean_13']}); }
  catch(e){ stopScan(); toast('Scanner non supporté sur cet appareil'); return; }
  let badScanAt = 0;
  scanTimer = setInterval(async ()=>{
    try{
      const codes = await detector.detect(video);
      const hit = codes.find(c=>/^97[89]\d{10}$/.test(c.rawValue));
      if(hit){
        const isbn = hit.rawValue;
        stopScan();
        $('#search-q').value = isbn;
        _lastQ = isbn;
        toast('Code-barres lu ✓');
        doSearch(isbn);
        return;
      }
      // code-barres lu mais pas un ISBN : on guide sans couper le scan (ni répéter le message)
      if(codes.length && Date.now() - badScanAt > 4000){
        badScanAt = Date.now();
        toast('Ce code n’est pas un ISBN. Vise celui qui commence par 978');
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
// langue de recherche (persistée) : Auto = d'après l'alphabet ; sinon force Google et oriente Open Library
{ const sel = $('#search-lang');
  if(sel){ sel.value = ui.searchLang || 'auto';
    // changer de langue doit relancer la MÊME requête : on lève la garde anti-doublon
    sel.addEventListener('change', ()=>{ ui.searchLang = sel.value; persistUI(); const q = $('#search-q').value.trim(); if(searchReady(q)){ _lastQ = q; doSearch(q); } }); } }
$('#scan-stop').addEventListener('click', stopScan);
// PWA mobile : couper la caméra si l’app passe en arrière-plan pendant un scan
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stopScan(); });

/* =============== Édition =============== */
// Empreinte de tous les champs du formulaire : comparée à celle prise à l’ouverture, elle dit
// si l’utilisateur a saisi quelque chose. U+0001 comme séparateur — aucun champ ne peut le
// contenir, donc deux répartitions différentes du même texte ne peuvent pas se confondre.
const editSnapshot = () => $$('#ov-edit input, #ov-edit select, #ov-edit textarea').map(e=>e.value).join('\u0001');
// Feu vert pour fermer le formulaire : immédiat s’il n’a pas bougé, sinon on demande. Le
// formulaire est le seul écran de l’app où un geste malheureux (✕, Échap, Retour) détruit du
// travail non enregistré.
async function tryCloseEdit(){
  if(!$('#ov-edit').classList.contains('open')) return true;
  if(editSnapshot() === ui.editSnap) return true;
  return await uiConfirm({
    title:'Abandonner les modifications ?',
    message:'Ce que tu as saisi sera perdu.',
    okLabel:'Abandonner', cancelLabel:'Continuer la saisie', danger:true
  });
}
function openEdit(id){
  ui.editId = id;
  const b = id ? state.books.find(x=>x.id===id) : null;
  const pre = b || ui.searchFromResult || {};
  $('#edit-title').textContent = b ? 'Modifier' : 'Nouvelle lecture';
  $('#f-title').value = pre.title||'';
  $('#f-authors').value = (pre.authors||[]).join(', ');
  $('#f-type').value = pre.type||'livre';
  // ui.defaultStatus en dernier ressort : le statut choisi dans la fenêtre d'ajout ouverte,
  // valable pour cette session seulement (openSearch le repositionne à chaque ouverture)
  $('#f-status').value = (b && b.status) || pre.status || ui.defaultStatus || 'wishlist';
  $('#f-series').value = pre.series||'';
  $('#f-volume').value = pre.volume ?? '';
  $('#f-stotal').value = pre.seriesTotal ?? '';
  $('#f-year').value = pre.year ?? '';
  $('#f-year').max = String(new Date().getFullYear()+1); // l’année ne peut pas être calculée dans le HTML
  $('#f-pages').value = pre.pages ?? '';
  $('#f-cover').value = pre.cover||'';
  $('#f-syn').value = pre.synopsis||'';
  $('#f-tags').value = (pre.tags||[]).join(', ');
  // le formulaire est un DOM unique réutilisé : une erreur laissée par la saisie précédente
  // (« Année entre 1000 et 2027 ») s’afficherait sous un champ pourtant vierge
  $$('#ov-edit .field-err').forEach(el=>el.remove());
  $$('#ov-edit .invalid').forEach(el=>el.classList.remove('invalid'));
  // replié seulement pour un ajout manuel à froid : rien à cacher quand ces champs sont remplis
  const more = $('.frm-more');
  if(more) more.open = !!(b || pre.series || pre.year || pre.cover || pre.synopsis);
  ui.searchFromResult = null;
  openOverlay('#ov-edit');
  ui.editSnap = editSnapshot(); // référence de la garde anti-perte de saisie
  setTimeout(()=>$('#f-title').focus(), 60);
}
// Micro-typographie française : appliquée à la SAISIE des textes de lecture (critique, passages,
// avis de série, bio). Conservateur : guillemets « », apostrophe typographique, points de
// suspension, espace insécable (U+00A0 — la fine U+202F se rend mal sur certains Safari) avant
// ;!?» et après «. Les deux-points sont épargnés (heures, URLs). Les données déjà enregistrées
// ne sont jamais retouchées : seule la nouvelle saisie passe ici.
function frTypo(t){
  if(!t) return t;
  return String(t)
    .replace(/\.{3}/g, '\u2026')
    .replace(/'/g, '\u2019')
    .replace(/"([^"\n]{1,500}?)"/g, '\u00AB\u00A0$1\u00A0\u00BB')
    .replace(/\u00AB /g, '\u00AB\u00A0')
    .replace(/ \u00BB/g, '\u00A0\u00BB')
    .replace(/ +([;!?\u00BB])/g, '\u00A0$1')
    .replace(/([^\s>])([;!?])/g, '$1\u00A0$2');
}

function fieldError(inputSel, msg){
  // le message vit SOUS le champ concerné (pas dans un toast à l’autre bout de l’écran),
  // reste affiché jusqu’à la correction, et est annoncé aux lecteurs d’écran
  const inp = $(inputSel); if(!inp) return;
  let e = inp.parentElement.querySelector('.field-err');
  if(!e){ e = document.createElement('div'); e.className='field-err'; e.setAttribute('role','alert'); inp.after(e); }
  e.textContent = msg;
  // Le message est relié au champ (aria-describedby, sans écraser une description déjà là) et le
  // champ se déclare invalide : le lecteur d’écran relit l’erreur en revenant sur le champ, pas
  // seulement à l’instant où elle surgit. Les deux attributs partent avec le message.
  e.id = (inp.id || 'field') + '-err';
  const desc = (inp.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== e.id);
  inp.setAttribute('aria-describedby', desc.concat(e.id).join(' '));
  inp.setAttribute('aria-invalid', 'true');
  // champ dans un bloc replié (« Plus de détails ») : l’ouvrir, sinon le focus part sur un
  // élément invisible et le message d’erreur reste caché
  const det = inp.closest('details'); if(det) det.open = true;
  inp.classList.add('invalid'); inp.focus();
  inp.addEventListener('input', ()=>{
    e.remove(); inp.classList.remove('invalid'); inp.removeAttribute('aria-invalid');
    if(desc.length) inp.setAttribute('aria-describedby', desc.join(' ')); else inp.removeAttribute('aria-describedby');
  }, {once:true});
}
// Entrée depuis n’importe quel champ, clic sur « Enregistrer » : un seul chemin (submit du form)
$('#edit-form').addEventListener('submit', e => { e.preventDefault(); saveEdit(); });
function saveEdit(){
  const title = $('#f-title').value.trim();
  if(!title){ fieldError('#f-title', 'Donne un titre à cette lecture.'); return; }
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
  // Une année hors de portée (2 0 2 5 tapé à côté, 20255) fausserait le tri, les stats et le
  // rétro de l’année : on la refuse là où elle a été saisie plutôt que de l’enregistrer.
  const yMax = new Date().getFullYear()+1;
  if(data.year != null && (data.year < 1000 || data.year > yMax)){
    fieldError('#f-year', `Année entre 1000 et ${yMax}.`); return;
  }
  const wasNew = !ui.editId;
  if(ui.editId){
    const b = state.books.find(x=>x.id===ui.editId);
    if(!b) return;
    const wasRead = b.status==='read';
    Object.assign(b, data);
    // pagination corrigée à la baisse : une progression au-delà de la dernière page donnerait
    // 118 % sur la fiche et sur Aujourd’hui
    if(b.currentPage != null && data.pages && b.currentPage > data.pages) b.currentPage = data.pages;
    // pagination enfin connue : le % estimé (F40) devient une vraie page
    if(b.currentPage == null && b.currentPct != null && data.pages){ b.currentPage = Math.round(b.currentPct/100*data.pages); b.currentPct = null; }
    if(b.status==='read' && !wasRead && !(b.readings||[]).length) b.readings = [{id:uid(), start:b.startedAt||null, date:today(), rating:null}];
    syncStartedAt(b);
  }else{
    state.books.unshift(newBook(data));
  }
  ui.editId = null;
  ui.editSnap = editSnapshot(); // enregistré : plus rien à sauver, la garde ne doit pas se déclencher
  // Enregistrer revient à la fiche d’origine quand le formulaire a été ouvert depuis elle
  // (closeTopOverlay ferme tout si le formulaire était le premier niveau) ; le fond est repeint
  // par scheduleRender, différé tant qu’une modale reste ouverte.
  save(); scheduleRender(); closeTopOverlay();
  toast(wasNew ? 'Ajouté à ta bibliothèque ✓' : 'Modifié ✓');
}
// Construit un livre neuf complet à partir de champs partiels
function newBook(data){
  const b = Object.assign({
    id:uid(), rating:null, review:'', synopsis:'', favorite:false, tags:[], readings:[],
    currentPage:null, currentPct:null, startedAt:null, progressLog:[], moods:[], pace:null, quotes:[], loan:null, study:null,
    volume:null, seriesTotal:null, year:null, pages:null, cover:'', series:'', authors:[], type:'livre',
    status:'wishlist', addedAt:new Date().toISOString()
  }, data);
  if(b.status==='read' && !b.readings.length) b.readings = [{id:uid(), date:today(), rating:null}];
  syncStartedAt(b); // ajouté directement « en cours » : la lecture commence aujourd’hui (F40)
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
  box.innerHTML=`<span><b>${plur(due.length,'carte')} à réviser</b> dans ${plur(books,'livre')}. Une session prend moins de cinq minutes.</span><button class="btn small primary" id="study-alert-open">Commencer</button>`;
  $('#study-alert-open').onclick=()=>startStudyReview();
}
function studySimpleItems(items, kind, empty){
  if(!items.length) return `<div class="study-empty">${empty}</div>`;
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body">${esc(x.text)}</div><div><button class="btn small" data-study-edit="${kind}:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="${kind}:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyQuestionItems(items){
  if(!items.length) return '<div class="study-empty">Ajoute les questions auxquelles tu veux encore savoir répondre dans plusieurs mois.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.question)}</b>${x.answer?`<small>${esc(x.answer)}</small>`:''}</div><div><button class="btn small" data-study-qcard="${esc(x.id)}" title="Transformer en carte mémoire">En carte mémoire</button><button class="btn small" data-study-edit="questions:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="questions:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyChapterItems(items){
  if(!items.length) return '<div class="study-empty">Organise ici tes notes au fil des chapitres.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.title||'Chapitre sans titre')}</b>${x.notes?`<small>${esc(x.notes)}</small>`:''}</div><div><button class="btn small" data-study-edit="chapters:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="chapters:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function studyCardItems(items){
  if(!items.length) return '<div class="study-empty">Crée une première carte : une question courte devant, la réponse derrière.</div>';
  return `<div class="study-list">${items.map(x=>`<div class="study-item"><div class="study-item-body"><b>${esc(x.front)}</b><small>${esc(x.back)}</small><div class="study-card-due ${x.due<=today()?'now':''}">${esc(studyDueLabel(x))}${x.lastReviewed?` · intervalle ${x.interval} j`:''}</div></div><div><button class="btn small" data-study-edit="cards:${esc(x.id)}">Modifier</button><button class="study-del" data-study-del="cards:${esc(x.id)}" aria-label="Supprimer">✕</button></div></div>`).join('')}</div>`;
}
function renderStudyEditor(b, focus=''){
  const s=b.study||emptyStudy(), c=studyCounts(b);
  $('#study-head').textContent='Mode étude';
  $('#study-body').innerHTML=`
    <div class="study-hero">
      <div><h4>${esc(fullTitle(b))}</h4><p>${esc(authorsStr(b))} · transforme ta lecture en connaissances durables.</p></div>
      <div class="study-stats"><div class="study-stat"><b>${c.cards}</b><span>cartes</span></div><div class="study-stat"><b>${c.due}</b><span>à revoir</span></div><div class="study-stat"><b>${fmtPct(c.mastery)}</b><span>maîtrise</span></div></div>
    </div>
    <div class="study-actions">
      <button class="btn primary" data-study-review="${c.due?'due':'all'}">${ic('play',13)} ${c.due?`Réviser ${plur(Math.min(c.due,20),'carte')}${c.due>20?` sur ${c.due}`:''}`:'S’entraîner'}</button>
      <button class="btn" data-study-export="md">${ic('download',14)} Texte (.md)</button>
      <button class="btn" data-study-export="print">${ic('print',14)} Imprimer / PDF</button>
      <button class="btn" data-study-back>← Revenir au livre</button>
    </div>
    <details class="study-section" open><summary>Intention et résumé</summary><div class="study-inside">
      <label class="study-label" for="st-objective">Pourquoi je lis ce livre</label><textarea id="st-objective" aria-label="Mon intention de lecture" rows="2" placeholder="Ce que tu veux comprendre, apprendre ou changer…">${esc(s.objective)}</textarea>
      <label class="study-label" for="st-summary">Résumé avec mes propres mots</label><textarea id="st-summary" aria-label="Résumé personnel" rows="6" placeholder="Explique le livre comme si tu devais le raconter à quelqu’un…">${esc(s.summary)}</textarea>
    </div></details>
    <details class="study-section" open><summary>Idées essentielles <span class="pill">${s.ideas.length}</span></summary><div class="study-inside">
      ${studySimpleItems(s.ideas,'ideas','Note les principes ou arguments que tu ne veux pas oublier.')}
      <div class="study-add"><textarea id="st-idea" aria-label="Idée essentielle" rows="2" placeholder="Une idée importante…"></textarea><button class="btn small primary" data-study-add="idea">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='lessons'?' open':''}><summary>Leçons à appliquer <span class="pill">${s.lessons.length}</span></summary><div class="study-inside">
      ${studySimpleItems(s.lessons,'lessons','Transforme une idée en action concrète dans ta vie, tes études ou ton travail.')}
      <div class="study-add"><textarea id="st-lesson" aria-label="Leçon à appliquer" rows="2" placeholder="Ce que je vais appliquer…"></textarea><button class="btn small primary" data-study-add="lesson">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='questions'?' open':''}><summary>Questions de compréhension <span class="pill">${s.questions.length}</span></summary><div class="study-inside">
      ${studyQuestionItems(s.questions)}
      <div class="study-add two"><textarea id="st-question" aria-label="Question de compréhension" rows="2" placeholder="Question…"></textarea><textarea id="st-answer" aria-label="Réponse" rows="2" placeholder="Réponse…"></textarea><button class="btn small primary" data-study-add="question">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section"${focus==='chapters'?' open':''}><summary>Notes par chapitre <span class="pill">${s.chapters.length}</span></summary><div class="study-inside">
      ${studyChapterItems(s.chapters)}
      <div class="study-add two"><input id="st-chapter-title" aria-label="Titre du chapitre" placeholder="Titre ou numéro du chapitre"><textarea id="st-chapter-notes" aria-label="Notes du chapitre" rows="3" placeholder="Notes du chapitre…"></textarea><button class="btn small primary" data-study-add="chapter">＋ Ajouter</button></div>
    </div></details>
    <details class="study-section" open><summary>Cartes mémoire <span class="pill">${s.cards.length}</span></summary><div class="study-inside">
      ${studyCardItems(s.cards)}
      <div class="study-add two"><textarea id="st-card-front" aria-label="Recto de la carte mémoire" rows="2" placeholder="Question / recto…"></textarea><textarea id="st-card-back" aria-label="Verso de la carte mémoire" rows="2" placeholder="Réponse / verso…"></textarea><button class="btn small primary" data-study-add="card">＋ Créer</button></div>
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
  if((b.quotes||[]).length){ lines.push('## Passages marquants','',...(b.quotes||[]).map(q=>`> ${q.text.replace(/\n/g,' ')}${q.page!=null?` (p. ${q.page})`:''}`),''); }
  return lines.filter((x,i,a)=>x!=='' || a[i-1]!=='').join('\n').trim()+'\n';
}
function studyFilename(b,ext){ const base=('fiche-'+fullTitle(b)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,90).toLowerCase(); return (base||'fiche-tome')+'.'+ext; }
function exportStudyMarkdown(b){ downloadBlob('\uFEFF'+studyMarkdown(b),'text/markdown;charset=utf-8',studyFilename(b,'md')); toast('Fiche texte (.md) téléchargée ✓'); }
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
    ${block('Passages marquants',(b.quotes||[]).map(q=>`<blockquote>${paras(q.text)}${q.page!=null?` (p. ${q.page})`:''}</blockquote>`).join(''))}`;
}
function printStudy(b){
  // l’écouteur AVANT l’impression : window.print() peut bloquer et déclencher afterprint
  // avant de rendre la main, auquel cas un écouteur posé après ne se déclencherait jamais
  const box=$('#study-print'); box.innerHTML=studyPrintHTML(b);
  addEventListener('afterprint',()=>{ box.innerHTML=''; },{once:true});
  window.print();
}
let studySaveTimer=0;
const studySession={queue:[],index:0,revealed:false,reviewed:0,bookId:null};
function startStudyReview(bookId=null, all=false){
  // Plafond à 20 cartes par session : le bouton « Réviser N cartes » annonce le même chiffre
  // (renderStudyEditor), la promesse est donc tenue ; au-delà, « Continuer » enchaîne.
  const queue=studyDueCards(bookId,all).slice(0,20);
  if(!queue.length){
    // Des cartes existent mais aucune n’est due : demander d’en créer une serait faux.
    toast(studyDueCards(bookId,true).length ? 'Aucune carte à réviser aujourd’hui, reviens demain' : 'Crée d’abord une carte mémoire');
    return;
  }
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
  // Sur un écran tactile, « Espace » et les raccourcis 1-4 n’existent pas : l’aide parle du geste
  // réellement disponible (toucher la carte, qui révèle aussi la réponse — voir le clic délégué).
  const coarse = matchMedia('(pointer:coarse)').matches;
  $('#study-body').innerHTML=`<div class="study-review" tabindex="0">
    <div class="study-review-top"><span>${fmtRatio(n, total)}</span><div class="track"><div class="fill" style="width:${Math.round((n-1)/total*100)}%"></div></div><button class="btn small" data-review-exit>Quitter</button></div>
    <div class="study-flash"${studySession.revealed?'':' data-study-reveal'}><div class="book">${esc(fullTitle(book))}</div><div class="front">${esc(card.front)}</div>
      ${studySession.revealed?`<div class="study-answer">${esc(card.back)}</div>`:''}</div>
    <div class="study-review-actions">${studySession.revealed
      ? '<button class="btn" data-study-grade="again">À revoir</button><button class="btn" data-study-grade="hard">Difficile</button><button class="btn primary" data-study-grade="good">Bien</button><button class="btn" data-study-grade="easy">Facile</button>'
      : '<button class="btn primary" data-study-reveal>Afficher la réponse</button>'}</div>
    <div class="card-hint">${studySession.revealed ? (coarse ? 'Note ta réponse pour passer à la suivante' : 'Raccourcis : 1 à revoir · 2 difficile · 3 bien · 4 facile') : (coarse ? 'Touche la carte pour révéler la réponse' : 'Appuie sur Espace pour révéler la réponse')}</div>
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
  // « Continuer » ne vaut que pour le périmètre de la session (le livre ouvert, ou tous) : sinon
  // l’utilisateur relançait une session vide. Quand seuls d’autres livres ont des cartes dues,
  // on le dit et on propose de les réviser, sans changer le périmètre à son insu.
  const remainHere=studyDueCards(studySession.bookId).length, remainAll=studyDueCards().length;
  const next = remainHere ? '<button class="btn primary" data-review-more>Continuer</button>'
    : remainAll ? `<button class="btn primary" data-review-others>Réviser les autres livres (${remainAll})</button>` : '';
  $('#study-head').textContent='Session terminée';
  $('#study-body').innerHTML=`<div class="study-done"><div class="big orn" aria-hidden="true">❦</div><h4>${plur(studySession.reviewed,'carte révisée','cartes révisées')}</h4><p>Chaque rappel réussi espace un peu plus la prochaine révision.</p><div class="study-actions" style="justify-content:center">${next}${studySession.bookId?'<button class="btn" data-review-editor>Revenir à la fiche</button>':''}<button class="btn" data-close>Terminer</button></div></div>`;
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
      const input=$(kind==='idea'?'#st-idea':'#st-lesson'), text=cleanStudyText(input.value,4000); if(!text){fieldError(kind==='idea'?'#st-idea':'#st-lesson','Écris d’abord ton idée.');return;}
      s[kind==='idea'?'ideas':'lessons'].push({id:uid(),text});
    }else if(kind==='question'){
      const question=cleanStudyText($('#st-question').value,4000), answer=cleanStudyText($('#st-answer').value,8000); if(!question){fieldError('#st-question','Pose d’abord la question.');return;}
      s.questions.push({id:uid(),question,answer});
    }else if(kind==='chapter'){
      const title=cleanStudyText($('#st-chapter-title').value,500), notes=cleanStudyText($('#st-chapter-notes').value,12000); if(!title&&!notes){fieldError('#st-chapter-title','Donne un titre ou des notes au chapitre.');return;}
      s.chapters.push({id:uid(),title,notes});
    }else if(kind==='card'){
      const front=cleanStudyText($('#st-card-front').value,4000), back=cleanStudyText($('#st-card-back').value,8000); if(!front||!back){fieldError(front?'#st-card-back':'#st-card-front', front?'Il manque la réponse (verso).':'Il manque la question (recto).');return;}
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
  if(e.target.closest('[data-study-reveal]') || (!studySession.revealed && e.target.closest('.study-flash'))){ studySession.revealed=true; renderStudyReview(); return; }
  const grade=e.target.closest('[data-study-grade]');
  if(grade){
    const cur=currentStudyCard(); if(!cur)return;
    const ref=studySession.queue[studySession.index];
    gradeStudyCard(cur.card,grade.dataset.studyGrade); touchStudy(cur.book); save();
    // « À revoir » : la carte revient une fois en fin de session (seconde chance), pas plus —
    // sinon une carte qu’on ne sait pas rendrait la session interminable. Le compteur final
    // compte les cartes, pas les passages : le second passage n’incrémente pas.
    if(grade.dataset.studyGrade==='again' && !ref.retried) studySession.queue.push({...ref, retried:true});
    if(!ref.retried) studySession.reviewed++;
    studySession.index++; studySession.revealed=false; renderStudyReview(); return;
  }
  if(e.target.closest('[data-review-more]')){ startStudyReview(studySession.bookId); return; }
  if(e.target.closest('[data-review-others]')){ startStudyReview(); return; }
  if(e.target.closest('[data-review-editor]')){ const id=studySession.bookId; if(id)openStudy(id); return; }
  if(e.target.closest('[data-review-exit]')){ studySession.bookId?openStudy(studySession.bookId):closeTopOverlay(); return; }
});
$('#study-body').addEventListener('keydown',e=>{
  if($('#study-head').textContent!=='Révision') return;
  // La carte elle-même porte aussi data-study-reveal (tap tactile) : on vise le bouton.
  if(!studySession.revealed && (e.key===' ' || e.key==='Enter')){ e.preventDefault(); const btn=$('#study-body button[data-study-reveal]'); if(btn)btn.click(); return; }
  if(studySession.revealed && ['1','2','3','4'].includes(e.key)){
    e.preventDefault(); const grade=['again','hard','good','easy'][+e.key-1], btn=$(`#study-body [data-study-grade="${grade}"]`); if(btn)btn.click();
  }
});

/* =============== Fiche détail =============== */
// La critique grandit avec ce qu’on y écrit : trois lignes fixes donnaient l’impression qu’on
// n’attendait qu’une phrase, et relire une critique déjà écrite demandait de faire défiler dans le
// champ. field-sizing:content fait le travail dans les navigateurs récents ; ici le repli pour
// les autres (et pour le rendu initial, où aucun événement input ne se produit).
function autoGrowReview(el){
  if(!el) return;
  // Navigateur qui sait le faire : on ne pose AUCUNE hauteur en ligne — elle gagnerait sur
  // field-sizing et laisserait la dernière ligne sous le pli (hauteur figée à la frappe d’avant).
  try{ if(CSS.supports('field-sizing','content')) return; }catch(_){ }
  el.style.height = 'auto';
  const bords = el.offsetHeight - el.clientHeight; // box-sizing:border-box : scrollHeight ignore les bordures
  el.style.height = Math.min(el.scrollHeight + bords, Math.round(window.innerHeight * 0.6)) + 'px';
}
// F40 : dates d’une lecture sur la fiche. Avec un début : « du … au … · N jours », les deux dates
// corrigeables en place (.rstart / .rdate) ; sinon la seule date de fin, comme avant (F15).
function readingDatesHTML(r){
  if(!r.start) return `<label class="rdate-wrap">${ic('calendar',13)}<input type="date" class="rdate" data-rid="${esc(r.id)}" value="${esc(r.date)}" max="${today()}" aria-label="Date de cette lecture"></label>`;
  return `<span class="rdate-wrap">${ic('calendar',13)}<span class="rlbl">du</span><input type="date" class="rstart" data-rid="${esc(r.id)}" value="${esc(r.start)}" max="${esc(r.date)}" aria-label="Début de cette lecture"><span class="rlbl">au</span><input type="date" class="rdate" data-rid="${esc(r.id)}" value="${esc(r.date)}" max="${today()}" aria-label="Fin de cette lecture"></span><span class="rdays" data-rid="${esc(r.id)}">${readingDaysText(r)}</span>`;
}
function readingDaysText(r){ return r.start ? `· ${plur(Math.max(1, daysBetween(r.start, r.date)),'jour')}` : ''; }
// Repeint la durée « · N jours » (et la borne du début) d’une ligne sans reconstruire la fiche :
// reconstruire refermerait le sélecteur de date sous le doigt.
function patchReadingDays(r){
  const d = $(`#detail-body .rdays[data-rid="${CSS.escape(r.id)}"]`); if(d) d.textContent = readingDaysText(r);
  const s = $(`#detail-body .rstart[data-rid="${CSS.escape(r.id)}"]`); if(s) s.max = r.date;
}
// F40 : rythme constaté sur la dernière lecture datée de bout en bout — une indication sous les
// boutons Lent / Moyen / Rapide, pas un choix posé d’office.
function paceHintHTML(b){
  if(!b.pages) return '';
  const r = (b.readings||[]).filter(x=>x.start).sort((x,y)=>y.date.localeCompare(x.date))[0];
  if(!r) return '';
  const days = Math.max(1, daysBetween(r.start, r.date)), perDay = Math.round(b.pages/days);
  return perDay ? `<div class="card-hint" id="d-pace-hint">Lu en ${plur(days,'jour')}, soit environ ${plur(perDay,'page')} par jour</div>` : '';
}
function openDetail(id, opts={}){
  // la fiche se reconstruit en innerHTML à chaque action (note, statut, ♥…) : sans ça, le
  // focus clavier retombe sur <body> et il faut re-tabuler depuis le haut de la modale.
  // On mémorise le contrôle réutilisé par id, ou à défaut par son attribut data-* (statut,
  // rythme… qui n’ont pas d’id), et la position de défilement pour éviter le saut en haut.
  const _ae = document.activeElement;
  const _aeTag = ((_ae && _ae.tagName) || '').toLowerCase();
  let _prevFocus = '';
  // Jamais de focus rendu à un champ de saisie : sur mobile le clavier se rouvrirait sous le
  // doigt et avalerait le tap suivant (taper 215 puis toucher « Lu » demandait deux tapes).
  if(_ae && _ae.closest && _ae.closest('#ov-detail') && _aeTag!=='input' && _aeTag!=='textarea'){
    if(_ae.id) _prevFocus = '#' + CSS.escape(_ae.id);
    else for(const a of ['data-s','data-pace','data-mood']){
      const v = _ae.getAttribute && _ae.getAttribute(a);
      if(v!=null){ _prevFocus = `[${a}="${CSS.escape(v)}"]`; break; }
    }
  }
  // Brouillons non enregistrés : la fiche se reconstruit à chaque action (statut, note, passage…)
  // et emporterait un passage à moitié collé ou une critique en cours de frappe.
  const _reopen = (ui.detailId===id && $('#ov-detail').classList.contains('open'));
  const draft = _reopen ? {
    q:  ($('#d-quote-text')||{}).value || '',
    qp: ($('#d-quote-page')||{}).value || '',
    d:  ($('#d-newdate')||{}).value || '',
    rv: ($('#d-review')||{}).value
  } : null;
  const _prevScroll = (($('#ov-detail')||{}).scrollTop) || 0;
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
  // Les blocs « après lecture » (critique, ambiances, rythme, dates) n’ont rien à dire tant que le
  // livre n’a pas été lu : sur une envie de lecture ils remplissaient la fiche de champs vides et
  // repoussaient tout le reste sous la ligne de flottaison.
  const hasRead = b.status==='read' || b.status==='abandoned' || !!b.rating || readings.length>0;
  // Ce que l’on écrit ici part-il chez les amis ? La réponse doit être sous le champ, pas dans un
  // onglet à deux écrans de là — on découvrait autrement sa critique publiée après coup.
  const shareM = (social.me && !isDemoBook(b) && (b.status==='read' || b.rating || lastReadDate(b))) ? shareMode() : 'none';
  const shareHint = shareM==='none' ? '' : `<small class="share-hint">${
    shareM==='all' ? `Visible par tes amis${social.publicProfile?' et sur ta page publique':''}` : 'Tes amis voient ta note, pas ta critique'
  } · <button type="button" class="linkish" data-share-settings>Modifier</button></small>`;
  // Liens d’achat seulement quand le livre n’est PAS en main (envie, abandonné) : sur un livre lu ou
  // en cours, la première chose lue sous le synopsis ne doit pas être une invitation à l’achat.
  // Recommander et la page publique restent proposés dans tous les cas (data-buy : la mesure des
  // clics sortants ne concerne que les deux liens marchands, cf. le beacon /api/out).
  const aAcheter = b.status==='wishlist' || b.status==='abandoned';
  const buyLinks = [
    aAcheter ? `<a class="btn buy" data-buy="amazon" href="${esc(amazonUrl(b,false))}" target="_blank" rel="noopener nofollow${AMAZON_TAG?' sponsored':''}" title="Ouvrir sur Amazon">${ic('cart',16)} Acheter<span class="sr-only"> (nouvelle fenêtre)</span></a>` : '',
    aAcheter ? `<a class="btn buy" data-buy="kindle" href="${esc(amazonUrl(b,true))}" target="_blank" rel="noopener nofollow${AMAZON_TAG?' sponsored':''}" title="Édition Kindle sur Amazon">${ic('device',16)} Lire sur Kindle<span class="sr-only"> (nouvelle fenêtre)</span></a>` : '',
    social.me ? `<button type="button" class="btn buy" data-reco="${esc(b.id)}" title="Recommander ce livre à un ami">${ic('share',16)} Recommander</button>` : '',
    !isDemoBook(b) ? `<a class="btn buy" href="/livre/${esc(bookSlugOf(b))}" title="La page publique de ce livre sur Tome (avis des lecteurs)">${ic('link',16)} Page du livre</a>` : ''
  ].filter(Boolean).join('');
  const buyRowHTML = buyLinks
    ? `<div class="buy-row">${buyLinks}${AMAZON_TAG && aAcheter ? `<details class="buy-note"><summary>Partenaire Amazon</summary><p>En tant que Partenaire Amazon, ce site perçoit une commission sur les achats remplissant les conditions requises. Aucun surcoût pour toi.</p></details>` : ''}</div>`
    : '';

  $('#detail-body').innerHTML = `
    <div class="dcover">${b.cover
      ? `<button type="button" class="cover zoomable" data-zoom="1" aria-label="Agrandir la couverture de ${esc(fullTitle(b))}">${coverHTML(b)}</button>`
      : `<div class="cover">${coverHTML(b)}</div>`}</div>
    <div class="dmain">
      <h3 class="dt" id="detail-title">${esc(fullTitle(b))}</h3>
      <div class="da">${esc(authorsStr(b))}</div>
      ${b.series ? `<div class="dserie">Série : ${esc(b.series)}${b.volume!=null ? ` · tome ${b.volume}` : ''}${(()=>{const t=Math.max(...sBooks.map(x=>x.seriesTotal||0)); return t?`/${t}`:'';})()}, ${plur(sBooks.length,'tome')} dans ta bibliothèque
        ${sBooks.length>1 ? `<button data-open-series="${esc(b.series)}">voir la série →</button>` : ''}</div>` : ''}
      <div class="dmeta">${esc(meta)}${meta && tagsHtml ? ' · ' : ''}${tagsHtml}</div>
      ${b.synopsis
        ? `<div class="syn collapsed" id="d-syn">${esc(b.synopsis)}</div>${b.synopsis.length>180 ? '<button class="syn-more" id="d-syn-more">voir plus</button>' : ''}`
        : _synBusy.has(b.id)
          ? `<button class="syn-more" id="d-syn-fetch" disabled aria-busy="true">Recherche…</button>`
          : `<button class="syn-more" id="d-syn-fetch">${ic('search',13)} Chercher le synopsis</button>`}

      <div class="seg" id="d-status" role="group" aria-label="Statut">
        ${Object.entries(STATUS_LABEL).map(([k,v]) =>
          `<button data-s="${k}" class="${b.status===k?'on':''}" aria-pressed="${b.status===k}">${v}</button>`).join('')}
      </div>

      ${b.status==='reading' ? `<div class="dblock">
        <label for="d-page">Ma progression</label>
        <div class="prog-row">
          <input type="text" inputmode="decimal" id="d-page" value="${esc(String(progressFieldValue(b)))}" placeholder="page ou %" aria-label="Page courante, ou pourcentage lu" title="Une page (210) ou un pourcentage (35 %)">
          <span class="lbl2">/ ${b.pages||'?'} p.</span>
          <div class="track"><div class="fill" style="width:${pct??0}%"></div></div>
          <b>${pct!==null ? fmtPct(pct) : '—'}</b>
          <span class="lbl2 prog-rest">${pagesLeftText(b)}</span>
          <button type="button" class="btn small" data-prog-step="10" aria-label="Avancer de 10 pages">＋10</button>
          <button type="button" class="btn small" data-prog-step="25" aria-label="Avancer de 25 pages">＋25</button>
        </div>
        ${b.startedAt ? `<div class="card-hint">Lecture commencée le ${fmtDate(b.startedAt)}${daysBetween(b.startedAt, today())>0 ? ` · ${plur(daysBetween(b.startedAt, today()),'jour')}` : ''}</div>` : ''}
      </div>` : ''}

      <div class="rate-row${opts.pulse?' pulse':''}" id="d-rate-row">
        <div class="star-input" id="d-stars" tabindex="0" role="slider" aria-label="Ma note" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${b.rating||0}" aria-valuetext="${ratingText(b.rating)}">${starInputHTML(b.rating)}</div>
        ${b.rating ? `<button class="clear-rate" id="d-clear-rate">effacer</button>` : ''}
        <button class="heart ${b.favorite?'on':''}" id="d-fav" title="Favori" aria-label="Favori" aria-pressed="${b.favorite}">♥</button>
      </div>
      ${!b.rating ? `<div class="card-hint" id="d-rate-hint">Touche une étoile, ou glisse pour ajuster à la demi-étoile</div>` : ''}

      <div class="dblock" id="d-friends" hidden></div>

      ${hasRead ? `<div class="dblock">
        <label for="d-review">Ma critique</label>
        <textarea id="d-review" rows="3" placeholder="${opts.pulse ? 'Et alors, verdict ?' : 'Qu’est-ce que tu en as pensé ?'}">${esc(b.review||'')}</textarea>
        ${shareHint}
      </div>

      <div class="dblock" role="group" aria-labelledby="lbl-moods">
        <span class="lbl" id="lbl-moods">Ambiances</span>
        <div class="mood-chips" id="d-moods">
          ${MOODS.map(m=>`<button class="mood ${b.moods.includes(m)?'on':''}" data-mood="${esc(m)}" aria-pressed="${b.moods.includes(m)}">${m}</button>`).join('')}
        </div>
      </div>

      <div class="dblock">
        <span class="lbl" id="lbl-pace">Rythme</span>
        <div class="seg" id="d-pace" role="group" aria-label="Rythme de lecture">
          ${Object.entries(PACE_LABEL).map(([k,v])=>`<button data-pace="${k}" class="${b.pace===k?'on':''}" aria-pressed="${b.pace===k}">${v}</button>`).join('')}
        </div>
        ${paceHintHTML(b)}
      </div>` : `<div class="dblock wish-cta">
        <button type="button" class="btn small" id="d-mark-read">${b.status==='reading' ? 'Terminé ? Marquer comme lu et noter' : 'Déjà lu ? Marquer comme lu et noter'}</button>
      </div>`}

      <div class="dblock" role="group" aria-labelledby="lbl-quotes">
        <span class="lbl" id="lbl-quotes">Passages${(b.quotes||[]).length ? ` (${b.quotes.length})` : ''}</span>
        <div id="d-quotes">${(b.quotes||[]).map(q=>`
          <div class="quote-item">
            <div class="qtxt">« ${esc(q.text)} »</div>
            ${q.page!=null ? `<div class="qpage">page ${q.page}</div>` : ''}
            <button class="qdel" data-qdel="${esc(q.id)}" title="Supprimer" aria-label="Supprimer ce passage">✕</button>
          </div>`).join('')}</div>
        <div class="add-quote">
          <textarea id="d-quote-text" aria-label="Passage ou citation" rows="2" placeholder="Un passage marquant…"></textarea>
          <div class="row">
            <input type="number" id="d-quote-page" min="0" placeholder="page" aria-label="Page">
            <button class="btn small" id="d-quote-add">＋ Ajouter le passage</button>
          </div>
        </div>
      </div>

      <div class="study-entry">
        <div class="study-copy"><b>Mode étude${study.due?` · ${study.due} à réviser`:''}</b><span>${study.cards||studyHasContent(b.study)?`${plur(study.cards,'carte')} · maîtrise ${fmtPct(study.mastery)}`:'Résumé, idées clés, leçons et cartes mémoire'}</span></div>
        <button class="btn small${study.due?' primary':''}" id="d-study">${studyHasContent(b.study)?'Ouvrir la fiche':'Créer ma fiche'}</button>
      </div>

      <div class="dblock" role="group" aria-labelledby="lbl-loan">
        <span class="lbl" id="lbl-loan">Prêt</span>
        <div class="loan-row" id="d-loan">
          ${b.loan
            ? `<span class="lnw">Prêté à ${esc(b.loan.to)}</span><span style="color:var(--faint)">depuis le ${fmtDate(b.loan.since)}</span>${loanDue?`<span class="loan-due ${loanDue.level}">${esc(loanDue.text)}</span>`:'<span class="loan-due">sans date de retour</span>'}<button class="btn small" id="d-loan-date">${ic('calendar',13)} Date</button><button class="btn small" id="d-loan-back">Rendu ✓</button>`
            : `<button class="btn small" id="d-loan-out">${ic('lend',13)} Prêter à…</button>`}
        </div>
      </div>

      ${buyRowHTML}

      ${hasRead ? `<div class="dblock" role="group" aria-labelledby="lbl-readings">
        <span class="lbl" id="lbl-readings">Lectures${readings.length>1 ? ` (${readings.length})` : ''}</span>
        <div class="readings">${readings.map(r =>
          `<div class="reading-row">${readingDatesHTML(r)}
            ${readings.length>1 ? `<span class="rstars" data-rid="${esc(r.id)}" title="Note de cette lecture" tabindex="0" role="slider" aria-label="Note de la lecture du ${fmtDate(r.date)}" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${r.rating||0}" aria-valuetext="${ratingText(r.rating)}">${starInputHTML(r.rating, 'rst')}</span>` : ''}
            <button class="del" data-rid="${esc(r.id)}" title="Supprimer cette date" aria-label="Supprimer cette date">✕</button>
          </div>`).join('') || '<span style="font-size:13px;color:var(--faint)">Aucune date enregistrée</span>'}</div>
        <div class="add-reading">
          <input type="date" id="d-newdate" value="${today()}" aria-label="Date de lecture">
          <button class="btn small" id="d-add-reading">＋ ${readings.length ? 'Relecture' : 'Ajouter'}</button>
        </div>
      </div>` : ''}

      <div class="dblock" role="group" aria-labelledby="lbl-lists">
        <span class="lbl" id="lbl-lists">Listes</span>
        ${inLists.length ? `<div class="chips-line" style="margin-bottom:8px">
          ${inLists.map(l=>`<span class="pill">${esc(l.name)} <button data-unlist="${esc(l.id)}" aria-label="Retirer de ${esc(l.name)}">✕</button></span>`).join('')}
        </div>` : ''}
        ${otherLists.length ? `<div class="list-add">
          <select id="d-list-sel" aria-label="Choisir une liste">${otherLists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>
          <button class="btn small" id="d-list-add">Ajouter</button>
        </div>`
        // Aucune liste où ranger ce titre (pas de liste du tout, ou déjà dans toutes) : le bloc reste
        // là et propose d’en créer une, au lieu de disparaître comme si les listes n’existaient pas.
        : `<button class="btn small" id="d-list-new">＋ Créer une liste</button>`}
      </div>

      <div class="detail-footer">
        <button class="btn small" id="d-edit">✎ Modifier</button>
        <button class="btn small" id="d-card" title="Générer une image à partager">${ic('share',13)} Partager en image</button>
        ${hasNext ? `<button class="btn small" id="d-next-tome">＋ Tome ${b.volume+1}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn small danger" id="d-delete">Supprimer</button>
      </div>
    </div>`;
  openOverlay('#ov-detail');
  if(draft){
    const qt=$('#d-quote-text'); if(qt && draft.q) qt.value = draft.q;
    const qp=$('#d-quote-page'); if(qp && draft.qp) qp.value = draft.qp;
    const nd=$('#d-newdate');    if(nd && draft.d) nd.value = draft.d;
    // la critique n’est reprise que si elle diffère de ce qui est enregistré (frappe en cours)
    const rv=$('#d-review'); if(rv && draft.rv!=null && draft.rv!==(b.review||'')) rv.value = draft.rv;
  }
  autoGrowReview($('#d-review')); // une critique déjà écrite s’affiche en entier, pas par une fente de 3 lignes
  // restaure la position de défilement puis le focus sur le contrôle qui vient d’être utilisé
  const _ovd = $('#ov-detail'); if(_ovd) _ovd.scrollTop = _prevScroll;
  if(_prevFocus){ const el = _ovd && _ovd.querySelector(_prevFocus); if(el) try{ el.focus({preventScroll:true}); }catch(_){ } }
  loadDetailFriends(b);
}
// « Chez tes amis » : lectures croisées sur la fiche — silencieux si déconnecté,
// hors-ligne, ou si aucun ami ne partage ce livre (la fiche reste 100 % locale sinon).
// GARDE VIE PRIVÉE : la clé du livre ne part au serveur QUE si ce livre appartient au
// sous-ensemble partageable (même prédicat que shareableBooks) ET que le partage est actif —
// jamais pour la wishlist, jamais en mode « rien » : le serveur n’apprend rien qu’il ne
// connaisse déjà par la synchro. Cache 10 min : les interactions de la fiche ne re-fetchent pas.
const _bookFriendsCache = new Map();
async function loadDetailFriends(b){
  if(!social.me || social.me.shareMode==='none' || isDemoBook(b)) return;
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
      `<div class="dfriend">${avatarHTML(f.displayName,"sm")}<b>${esc(f.displayName)}</b>${
        f.rating ? starsHTML(f.rating) : `<span class="df-none">pas encore noté</span>`}</div>`).join('');
  }catch(_){ /* silencieux : la fiche reste purement locale */ }
}

// Toutes les interactions de la fiche : UN SEUL écouteur délégué, le livre est résolu via ui.detailId.
// La vue de fond étant cachée, on la rafraîchit en différé (scheduleRender) — la fiche se redessine via openDetail.
$('#detail-body').addEventListener('click', e => {
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;

  if(e.target.closest('[data-zoom]') && b.cover){ openCover(b.cover, fullTitle(b)); return; }
  // « Modifier » sous la critique : le réglage se change là où il se règle, sans le chercher.
  if(e.target.closest('[data-share-settings]')){ closeOverlays(); social.tab='me'; selectView('friends'); return; }
  // « Page du livre » : la page publique s’ouvre PAR-DESSUS l’app, sans rechargement (recharger
  // coûtait quatre secondes d’écran blanc sur mobile et perdait la pile de modales).
  const pl = e.target.closest('a[href^="/livre/"]');
  if(pl){ e.preventDefault(); const href = pl.getAttribute('href'); openPublicBookOver(href.slice(7), b.id, href); return; }
  // Livre pas encore lu : le seul bloc affiché sous les étoiles ouvre la suite (critique, ambiances…)
  if(e.target.closest('#d-mark-read')){ markRead(b, {undo:'date'}); save(); openDetail(b.id, {pulse:true}); scheduleRender(); return; }
  // Clic sur le petit calendrier d’une date de lecture : ouvre le sélecteur natif. Le champ
  // lui-même reste tapable au clavier (on n’ouvre pas le panneau quand on clique dans les chiffres).
  const rw = e.target.closest('.rdate-wrap');
  if(rw && !e.target.closest('input')){
    const inp = rw.querySelector('input'); // le premier champ de la ligne : le début (F40) s’il existe, sinon la fin
    if(inp){ inp.focus(); if(inp.showPicker){ try{ inp.showPicker(); }catch(_){ } } }
    return;
  }
  const ps = e.target.closest('[data-prog-step]');
  if(ps){ setProgress(b, (b.currentPage||0) + Number(ps.dataset.progStep)); return; }
  const sbtn = e.target.closest('#d-status button[data-s]');
  if(sbtn){
    const s = sbtn.dataset.s;
    const wasRead = b.status==='read';
    // markRead lit b.status pour distinguer une première lecture d’une relecture : ne pas
    // l’écraser avant l’appel.
    if(s==='read' && !wasRead){ markRead(b, {undo:'date'}); save(); openDetail(b.id, {pulse:true}); scheduleRender(); }
    else {
      // Reprendre un livre terminé : la progression repart de zéro plutôt que de rester à 100 %.
      if(s==='reading' && b.pages && (b.currentPage||0)>=b.pages) updateBookProgress(b, 0);
      b.status = s; syncStartedAt(b);
      save(); openDetail(b.id); scheduleRender();
    }
    return;
  }
  const st = e.target.closest('#d-stars .st');
  if(st){
    // règle du toucher (moitié touchée, demi-étoile complétée) : tapRating, partagée avec le mode liste
    setBookRating(b, tapRating(b.rating, st, e.clientX));
    save(); openDetail(b.id); scheduleRender(); return;
  }
  const rst = e.target.closest('.rstars .rst');
  if(rst){
    const n = +rst.dataset.n;
    setReadingRating(b, rst.closest('.rstars').dataset.rid, halfFromClick(rst, e.clientX) ? n-0.5 : n);
    return;
  }
  // Effacer la note : les lectures qui suivaient la note du livre s’effacent avec elle, sinon le
  // Journal garderait une note fantôme pour un livre redevenu « non noté ».
  if(e.target.closest('#d-clear-rate')){ const prev = b.rating; b.rating = null; syncReadingRatings(b, prev); save(); openDetail(b.id); scheduleRender(); return; }
  // ♥ et rythme basculent EN PLACE : reconstruire la fiche emporterait les brouillons de saisie
  // et ferait sauter le défilement pour un simple état de bouton.
  const fav = e.target.closest('#d-fav');
  if(fav){
    b.favorite = !b.favorite;
    fav.classList.toggle('on', b.favorite); fav.setAttribute('aria-pressed', String(b.favorite));
    save(); scheduleRender(); return;
  }
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
    $$('#d-pace button[data-pace]').forEach(x=>{
      const on = b.pace===x.dataset.pace;
      x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
    });
    save(); scheduleRender(); return;
  }
  if(e.target.closest('#d-quote-add')){
    const txt = frTypo($('#d-quote-text').value.trim());
    if(!txt){ fieldError('#d-quote-text','Colle ou écris d’abord le passage.'); return; }
    b.quotes = b.quotes||[];
    b.quotes.push({id:uid(), text:txt.slice(0,2000), page:numIn($('#d-quote-page').value, 0, 1000000)});
    // vidés AVANT le re-rendu : sinon le report des brouillons les remettrait tels quels
    $('#d-quote-text').value = ''; $('#d-quote-page').value = '';
    save(); openDetail(b.id); scheduleRender(); toast('Passage ajouté ✓'); return;
  }
  const qd = e.target.closest('[data-qdel]');
  if(qd){
    const q = (b.quotes||[]).find(x=>x.id===qd.dataset.qdel);
    b.quotes = (b.quotes||[]).filter(x=>x.id!==qd.dataset.qdel);
    save(); openDetail(b.id); scheduleRender();
    if(q) toast('Passage supprimé', {label:'Annuler', onAction:()=>{ b.quotes.push(q); save(); if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id); scheduleRender(); }});
    return;
  }
  if(e.target.closest('#d-loan-out')){
    (async()=>{
      const to = await uiPrompt({ title:'Prêter ce livre', message:'À qui prêtes-tu ce livre ?', placeholder:'Nom de la personne', okLabel:'Continuer' });
      if(!to || !to.trim()) return;
      const due = await uiPrompt({ title:'Date de retour', message:'Choisis une échéance, ou laisse le champ vide si tu n’en as pas fixé.', value:isoAfterDays(today(),30), type:'date', okLabel:'Enregistrer le prêt' });
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
  if(e.target.closest('#d-loan-back')){ const loan=b.loan; b.loan=null; save(); openDetail(b.id); scheduleRender(); toast('Retour enregistré ✓', {label:'Annuler', onAction:()=>{b.loan=loan; save(); if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id); scheduleRender();}}); return; }
  if(e.target.closest('#d-add-reading')){
    const d = $('#d-newdate').value;
    if(!isValidDate(d)) return;
    b.readings = b.readings||[];
    // un livre « en cours » qu’on date à la main garde sa date de début (F40), si elle précède la fin
    const start = (b.status==='reading' && b.startedAt && b.startedAt<=d) ? b.startedAt : null;
    b.readings.push({id:uid(), start, date:d, rating:null});
    if(b.status!=='read') b.status = 'read';
    syncStartedAt(b);
    $('#d-newdate').value = today();   // remis à zéro avant le re-rendu (report des brouillons)
    save(); openDetail(b.id); scheduleRender(); return;
  }
  const del = e.target.closest('.del[data-rid]');
  if(del){
    const r = (b.readings||[]).find(x=>x.id===del.dataset.rid);
    b.readings = (b.readings||[]).filter(x=>x.id!==del.dataset.rid);
    save(); openDetail(b.id); scheduleRender();
    if(r) toast('Date supprimée', {label:'Annuler', onAction:()=>{ b.readings.push(r); save(); if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id); scheduleRender(); }});
    return;
  }
  const unl = e.target.closest('[data-unlist]');
  if(unl){
    const l = state.lists.find(x=>x.id===unl.dataset.unlist);
    if(l){ l.bookIds = l.bookIds.filter(x=>x!==b.id); save(); openDetail(b.id); scheduleRender(); }
    return;
  }
  if(e.target.closest('#d-list-new')){
    (async()=>{
      const name = await uiPrompt({ title:'Nouvelle liste', placeholder:'ex : Pépites SF, À offrir, Top 2026', okLabel:'Créer' });
      if(!name || !name.trim()) return;
      createList(name, [b.id]); openDetail(b.id); scheduleRender();
    })();
    return;
  }
  if(e.target.closest('#d-list-add')){
    const sel = $('#d-list-sel'); if(!sel) return;
    const l = state.lists.find(x=>x.id===sel.value);
    if(l && !l.bookIds.includes(b.id)){ l.bookIds.push(b.id); save(); openDetail(b.id); scheduleRender(); toast(`Ajouté à « ${l.name} » ✓`); }
    return;
  }
  const os = e.target.closest('[data-open-series]');
  if(os){ openSeries(os.dataset.openSeries); return; }
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
  if(e.target.closest('#d-edit')){ openEdit(b.id); return; }
  if(e.target.closest('#d-delete')){
    const idx = state.books.indexOf(b);
    const memberOf = state.lists.filter(l=>l.bookIds.includes(b.id)).map(l=>l.id);
    markBooksDeleted([b]);                                     // suppression explicite : les autres appareils ne le ramèneront pas
    state.books = state.books.filter(x=>x.id!==b.id);
    state.lists.forEach(l=> l.bookIds = l.bookIds.filter(x=>x!==b.id));
    save(); closeOverlays(); render();
    toast('Supprimé', {label:'Annuler', onAction:()=>{
      restoreBookIdentity(b);                                  // nouvel exemplaire : l’ancien id reste supprimé partout
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
    b.review = frTypo(e.target.value.trim());
    save(); scheduleRender(); toast('Critique enregistrée ✓');
  }else if(e.target.id==='d-page'){
    // Saisie directe de la page : on repeint la barre en place au lieu de reconstruire la fiche.
    // Reconstruire ici volait le tap suivant (« Lu » demandait deux tapes) et fermait le clavier.
    const p = parseProgressInput(e.target.value, b);
    if(!p){ e.target.value = progressFieldValue(b); return; }   // vide ou illisible : on remontre la valeur connue
    if(p.pct!=null){ setProgressPct(b, p.pct); return; }        // BD sans pagination : « 35 % » (F40)
    updateBookProgress(b, p.page);
    save(); patchProgressUI(b); scheduleRender();
    if(b.pages && b.currentPage >= b.pages && b.status!=='read'){
      toast(`Dernière page de « ${fullTitle(b)} »`, {label:'Marquer comme lu', ms:6000, onAction:()=>{
        markRead(b); save(); openDetail(b.id, {pulse:true}); scheduleRender();
      }});
    }
  }else if(e.target.classList.contains('rdate')){
    // Correction d’une date de lecture en place : une date fausse (ou posée par défaut à
    // aujourd’hui) se rattrape sans supprimer la ligne puis la recréer, ce qui perdait sa note.
    const r = (b.readings||[]).find(x=>x.id===e.target.dataset.rid); if(!r) return;
    const v = e.target.value, old = r.date;
    // champ vidé ou date impossible : on repose la valeur connue plutôt que de laisser un vide
    if(!isValidDate(v)){ e.target.value = old; return; }
    if(v > today()){ e.target.value = old; toast('Une lecture ne peut pas être datée du futur'); return; }
    if(r.start && v < r.start){ e.target.value = old; toast('La fin ne peut pas précéder le début de la lecture'); return; }
    if(v === old) return;
    r.date = v; patchReadingDays(r);
    invalidateCache(); // objectif, séries et journal comptent par date : le cache est périmé
    save(); scheduleRender();
    // Pas de openDetail ici : la fiche se reconstruirait sous le doigt et refermerait le sélecteur.
    // Les lignes seront retriées à la prochaine ouverture.
    toast(`Lecture datée du ${fmtDate(v)} ✓`, {label:'Annuler', onAction:()=>{
      r.date = old; invalidateCache(); save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
      scheduleRender();
    }});
  }else if(e.target.classList.contains('rstart')){
    // F40 : début d’une lecture, corrigeable en place comme la fin ; champ vidé = début retiré
    const r = (b.readings||[]).find(x=>x.id===e.target.dataset.rid); if(!r) return;
    const v = e.target.value, old = r.start;
    if(!v){ r.start = null; save(); openDetail(b.id); scheduleRender(); toast('Date de début retirée'); return; }
    if(!isValidDate(v)){ e.target.value = old||''; return; }
    if(v > r.date){ e.target.value = old||''; toast('Le début ne peut pas suivre la fin de la lecture'); return; }
    if(v === old) return;
    r.start = v; patchReadingDays(r);
    save(); scheduleRender();
    toast(`Lecture commencée le ${fmtDate(v)} ✓`, {label:'Annuler', onAction:()=>{
      r.start = old; save();
      if(ui.detailId===b.id && $('#ov-detail').classList.contains('open')) openDetail(b.id);
      scheduleRender();
    }});
  }
});
$('#detail-body').addEventListener('input', e => {
  if(e.target.id==='d-review') autoGrowReview(e.target);
});
// ✎ dans l’en-tête de la fiche : « Modifier » était en bas, après Passages, Prêt et Lectures —
// hors de vue sur mobile alors que c’est l’action la plus demandée après la note.
$('#d-edit-top').addEventListener('click', ()=>{ if(ui.detailId) openEdit(ui.detailId); });
// Note du livre (#d-stars) et note d’une lecture (.rstars, résolue par data-rid) au clavier :
// les étoiles d’une lecture étaient un slider à la souris seulement.
$('#detail-body').addEventListener('keydown', e => {
  const host = e.target.closest && e.target.closest('#d-stars, .rstars'); if(!host) return;
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;
  const rid = host.dataset.rid || null;
  const r = rid ? (b.readings||[]).find(x=>x.id===rid) : null;
  if(rid && !r) return;
  const v = sliderKeyValue(e.key, r ? r.rating : b.rating); if(v===undefined) return;
  e.preventDefault();
  if(r) setReadingRating(b, rid, v);   // sauve, redessine la fiche et le fond
  else { setBookRating(b, v); save(); openDetail(b.id); scheduleRender(); }   // la lecture suit la note du livre
  const again = rid ? $('#detail-body .rstars[data-rid="'+CSS.escape(rid)+'"]') : $('#d-stars');
  if(again) again.focus();
});
// Note d’une lecture (ligne du journal de la fiche). La note de la lecture la plus récente EST la
// note du livre (c’est celle qu’affichent la bibliothèque, les stats et le fil) : elle remonte
// même si le livre était déjà noté.
function setReadingRating(b, rid, v){
  const r = (b.readings||[]).find(x=>x.id===rid); if(!r) return;
  r.rating = v;
  const recent = (b.readings||[]).slice().sort((a,c)=>(c.date||'').localeCompare(a.date||''))[0];
  if(recent && recent.id===r.id) b.rating = r.rating;
  invalidateCache(); save(); openDetail(b.id); scheduleRender();
}
// Glissé sur les étoiles de la fiche (note du livre) et sur celles d’une lecture.
bindStarSlider($('#detail-body'), '#d-stars, .rstars', (host, v) => {
  const b = state.books.find(x=>x.id===ui.detailId); if(!b) return;
  if(host.id==='d-stars'){ setBookRating(b, v); save(); openDetail(b.id); scheduleRender(); }
  else setReadingRating(b, host.dataset.rid, v);
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
    toast(`La série est complète (${base.seriesTotal} tomes) `);
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
// Une seule forme de liste, qu’elle naisse dans l’onglet Listes ou depuis la fiche d’un livre
// (qui y entre alors d’emblée) : la fiche ne fabrique pas son propre objet.
function createList(name, bookIds=[]){
  const l = {id:uid(), name:name.trim().slice(0,150), desc:'', bookIds:[...bookIds], createdAt:new Date().toISOString()};
  state.lists.unshift(l); save(); renderLists(); toast('Liste créée ✓');
  return l;
}
$('#btn-new-list').addEventListener('click', async ()=>{
  const name = await uiPrompt({ title:'Nouvelle liste', placeholder:'ex : Pépites SF, À offrir, Top 2026', okLabel:'Créer' });
  if(!name || !name.trim()) return;
  createList(name);
});
function renderLists(){
  const grid = $('#lists-grid'), emptyBox = $('#lists-empty');
  if(!state.lists.length){
    grid.innerHTML = '';
    emptyBox.innerHTML = `<div class="empty"><div class="big orn" aria-hidden="true">❦</div><h3>Aucune liste</h3>
      <p>Crée des listes thématiques (« Pépites SF », « Mangas à finir », « À offrir à Noël »…), puis remplis-les depuis la liste elle-même ou depuis la fiche d’un livre.</p></div>`;
    return;
  }
  emptyBox.innerHTML = '';
  grid.innerHTML = state.lists.map(l => {
    const books = l.bookIds.map(id=>state.books.find(b=>b.id===id)).filter(Boolean);
    return `<div class="list-card" data-id="${esc(l.id)}" role="button" tabindex="0" aria-label="Liste ${esc(l.name)}, ${books.length} titres">
      <div class="fan">${books.slice(0,4).map(b=>`<div class="mini">${coverHTML(b,true)}</div>`).join('') || '<div class="empty-fan">＋</div>'}</div>
      <h4>${esc(l.name)}</h4>
      ${l.desc ? `<p class="list-desc">${esc(l.desc)}</p>` : ''}
      <div class="lc-count">${plur(books.length,'titre')}</div>
    </div>`;
  }).join('');
}
$('#lists-grid').addEventListener('click', e => {
  const card = e.target.closest('.list-card'); if(card){ ui.listPickQ = null; openList(card.dataset.id); }
});
// Sélecteur d’ajout du panneau liste : les titres de la bibliothèque absents de la liste, filtrés
// sur titre + auteurs (fold : accents et casse ignorés), 20 au plus pour rester lisible.
function listPickHTML(l){
  const q = fold(ui.listPickQ||'').trim();
  const rest = state.books.filter(b=>!l.bookIds.includes(b.id));
  const hits = q ? rest.filter(b=>fold(fullTitle(b)+' '+authorsStr(b)).includes(q)) : rest;
  if(!hits.length){
    const why = !state.books.length ? 'Ta bibliothèque est encore vide. Ajoute d’abord quelques livres.'
      : !rest.length ? 'Toute ta bibliothèque est déjà dans cette liste.' : 'Aucun titre ne correspond.';
    return `<p class="l-pick-hint">${why}</p>`;
  }
  return hits.slice(0,20).map(b=>`<div class="sr">
      <div class="mini">${coverHTML(b,true)}</div>
      <div class="sri"><b>${esc(fullTitle(b))}</b><span>${esc(authorsStr(b))}</span></div>
      <button type="button" class="btn small primary add" data-pick="${esc(b.id)}" aria-label="Ajouter ${esc(fullTitle(b))} à la liste">Ajouter</button>
    </div>`).join('')
    + (hits.length>20 ? `<p class="l-pick-hint">${plur(hits.length-20,'autre titre')}. Précise ta recherche.</p>` : '');
}
// Ajoute un titre depuis le sélecteur et re-rend, sans fermer le panneau ni perdre la saisie.
// `keep` : 'input' (Entrée dans le champ, on y reste) ou le rang du bouton cliqué (le focus passe
// au titre qui prend sa place, pour enchaîner plusieurs ajouts sans repasser par le champ).
function pickIntoList(l, id, keep){
  const b = state.books.find(x=>x.id===id); if(!b || l.bookIds.includes(id)) return;
  l.bookIds.push(id); save(); openList(l.id); renderLists();
  let t = $('#l-pick-q');
  if(keep!=='input'){ const btns = $$('#l-pick-res [data-pick]'); t = btns[Math.min(keep, btns.length-1)] || $('#l-add'); }
  if(t) t.focus({preventScroll:true});
  toast(`« ${fullTitle(b)} » ajouté ✓`);
}
function openList(id){
  if(ui.listId!==id) ui.listPickQ = null;   // le sélecteur d’ajout ne suit pas d’une liste à l’autre
  ui.listId = id; ui.listMode = 'list';
  const l = state.lists.find(x=>x.id===id); if(!l) return;
  const books = l.bookIds.map(bid=>state.books.find(b=>b.id===bid)).filter(Boolean);
  // Liste vide : le sélecteur d’ajout EST l’état vide — plus de renvoi vers la fiche d’un titre.
  const pick = ui.listPickQ!=null || !books.length;
  $('#list-head').textContent = l.name;
  $('#list-body').innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:4px; flex-wrap:wrap">
      ${books.length ? `<button class="btn small primary" id="l-add" aria-expanded="${pick}"${pick ? ' aria-controls="l-picker"' : ''}>${ic('plus',14)} Ajouter des titres</button>` : ''}
      <button class="btn small" id="l-rename">✎ Renommer</button>
      <button class="btn small" id="l-desc">${ic('doc',13)} Décrire</button>
      <span style="flex:1"></span>
      <button class="btn small danger" id="l-delete">Supprimer la liste</button>
    </div>
    ${l.desc ? `<p class="list-desc">${esc(l.desc)}</p>` : ''}
    ${pick ? `<div class="l-picker" id="l-picker">
      ${books.length ? '' : `<p class="l-pick-empty"><span class="orn" aria-hidden="true">❦</span> Liste vide. Choisis des titres dans ta bibliothèque.</p>`}
      <input type="search" id="l-pick-q" value="${esc(ui.listPickQ||'')}" placeholder="Filtrer ma bibliothèque…" aria-label="Chercher un titre à ajouter" autocomplete="off">
      <div id="l-pick-res">${listPickHTML(l)}</div>
    </div>` : ''}
    ${books.length ? `<div class="ld-grid">${books.map((b,i)=>`
      <div class="ld-item" data-id="${esc(b.id)}">
        <button type="button" class="ld-hit" aria-label="Ouvrir ${esc(fullTitle(b))}, position ${i+1}"></button>
        <span class="idx">${i+1}</span>
        <div class="cover">${coverHTML(b)}</div>
        <button class="rm" data-rm="${esc(b.id)}" title="Retirer" aria-label="Retirer de la liste">✕</button>
        <span class="mv">
          <button data-mv="-1" data-bid="${esc(b.id)}" title="Avancer" aria-label="Avancer dans la liste">◂</button>
          <button data-mv="1" data-bid="${esc(b.id)}" title="Reculer" aria-label="Reculer dans la liste">▸</button>
          <button data-mv="top" data-bid="${esc(b.id)}" title="Mettre en tête" aria-label="Mettre en tête de la liste">⇱</button>
        </span>
      </div>`).join('')}</div>`
    : ''}`;
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
  $('#list-head').textContent = `${name} · ${read}/${total||books.length} lus`;
  $('#list-body').innerHTML = `
    <div class="dblock" style="margin-bottom:16px">
      <label>Ma note de la série</label>
      <div class="rate-row" style="margin-bottom:10px">
        <div class="star-input" id="s-stars" tabindex="0" role="slider" aria-label="Note de la série" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${rec.rating||0}" aria-valuetext="${ratingText(rec.rating)}">${starInputHTML(rec.rating||0)}</div>
        ${rec.rating ? `<button class="clear-rate" id="s-clear">effacer</button>` : ''}
        <button class="heart ${rec.favorite?'on':''}" id="s-fav" title="Série favorite" aria-pressed="${rec.favorite}">♥</button>
      </div>
      <textarea id="s-review" aria-label="Mon avis sur la série" rows="2" placeholder="Ton avis sur la série dans son ensemble…">${esc(rec.review||'')}</textarea>
    </div>
    ${books.map(b=>`
      <button type="button" class="tome-row" data-id="${esc(b.id)}" aria-label="Ouvrir ${esc(fullTitle(b))}, ${STATUS_LABEL[b.status]}">
        <div class="mini">${coverHTML(b, true)}</div>
        <div class="ti"><b>${b.volume!=null ? 'tome '+b.volume : '—'}</b>${b.title && b.title.toLowerCase()!==name.toLowerCase() ? ' · '+esc(b.title) : ''}</div>
        ${starsHTML(b.rating, 'font-size:12px')}
        <span class="st-tag ${esc(b.status)}">${STATUS_LABEL[b.status]}</span>
      </button>`).join('')}
    <div style="display:flex; margin-top:12px">
      ${!complete ? `<button class="btn small" id="s-next">＋ Tome ${maxVol+1}</button>` : `<span style="font-size:13px;color:var(--green);font-weight:600">Série complète </span>`}
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
// Note de série au clavier (←/→) : même comportement que le slider de la fiche livre (#d-stars),
// sinon le slider est focusable mais totalement inopérant au clavier et au lecteur d’écran.
$('#list-body').addEventListener('keydown', e => {
  // Entrée dans le champ du sélecteur d’ajout : le premier titre proposé entre dans la liste, le
  // curseur reste dans le champ (« du » ⏎ « la » ⏎… sans toucher la souris).
  if(e.key==='Enter' && e.target.id==='l-pick-q' && ui.listMode==='list'){
    e.preventDefault();
    const l = state.lists.find(x=>x.id===ui.listId), first = $('#l-pick-res [data-pick]');
    if(l && first) pickIntoList(l, first.dataset.pick, 'input');
    return;
  }
  if(ui.listMode!=='series' || !e.target.closest || !e.target.closest('#s-stars')) return;
  const r = seriesRec(ui.seriesName);
  const v = sliderKeyValue(e.key, r.rating); if(v===undefined) return;
  e.preventDefault();
  r.rating = v; if(v==null) pruneSeriesRec(ui.seriesName);
  save(); openSeries(ui.seriesName); renderLibrary();
  const el=$('#s-stars'); if(el) el.focus();
});
// Glissé sur la note de la série : même pose que le toucher, au relâchement.
bindStarSlider($('#list-body'), '#s-stars', (host, v) => {
  if(ui.listMode!=='series') return;
  seriesRec(ui.seriesName).rating = v; save(); openSeries(ui.seriesName); renderLibrary();
});
// Un seul écouteur délégué pour le panneau liste/série, résolu via ui.listId / ui.seriesName.
$('#list-body').addEventListener('click', e => {
  if(ui.listMode==='series'){
    const st = e.target.closest('#s-stars .st');
    if(st){ const n=+st.dataset.n; seriesRec(ui.seriesName).rating = halfFromClick(st, e.clientX) ? n-0.5 : n; save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-clear')){ seriesRec(ui.seriesName).rating = null; pruneSeriesRec(ui.seriesName); save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-fav')){ const r=seriesRec(ui.seriesName); r.favorite=!r.favorite; pruneSeriesRec(ui.seriesName); save(); openSeries(ui.seriesName); renderLibrary(); return; }
    if(e.target.closest('#s-next')){ addNextTome(ui.seriesName); return; }
    const row = e.target.closest('.tome-row');
    if(row){ openDetail(row.dataset.id); }
    return;
  }
  if(ui.listMode==='recap'){
    if(e.target.closest('#recap-share')) shareYearCard(ui.recapYear);
    return;
  }
  const l = state.lists.find(x=>x.id===ui.listId); if(!l) return;
  // « Ajouter des titres » : ouvre ou replie le sélecteur (une liste vide l’affiche d’office).
  if(e.target.closest('#l-add')){
    ui.listPickQ = ui.listPickQ==null ? '' : null;
    openList(l.id);
    const t = $('#l-pick-q') || $('#l-add'); if(t) t.focus({preventScroll:true});
    return;
  }
  const pk = e.target.closest('[data-pick]');
  if(pk){ pickIntoList(l, pk.dataset.pick, $$('#l-pick-res [data-pick]').indexOf(pk)); return; }
  if(e.target.closest('#l-rename')){
    (async()=>{
      const name = await uiPrompt({ title:'Renommer la liste', value:l.name, okLabel:'Renommer' });
      if(name && name.trim()){ l.name = name.trim().slice(0,150); save(); openList(l.id); renderLists(); }
    })();
    return;
  }
  if(e.target.closest('#l-desc')){
    (async()=>{
      const d = await uiPrompt({ title:'Description de la liste', value:l.desc||'', placeholder:'À quoi sert cette liste ?', okLabel:'Enregistrer' });
      if(d!==null){ l.desc = d.trim().slice(0,500); save(); openList(l.id); renderLists(); }
    })();
    return;
  }
  const mv = e.target.closest('[data-mv]');
  if(mv){
    const id = mv.dataset.bid, dir = mv.dataset.mv, i = l.bookIds.indexOf(id);
    if(i<0) return;
    if(dir==='top'){ if(i===0) return; l.bookIds.splice(i,1); l.bookIds.unshift(id); }
    else { const j = i + (+dir); if(j<0 || j>=l.bookIds.length) return; [l.bookIds[i], l.bookIds[j]] = [l.bookIds[j], l.bookIds[i]]; }
    save(); openList(l.id); renderLists();
    // Le focus suit le titre déplacé, sur la même commande : sinon openOverlay le renvoyait sur
    // « Renommer », tout en haut, à chaque déplacement. Les flèches ne sont rendues qu’au survol ou
    // au focus dans l’item (.mv) : on pose d’abord le focus sur le bouton d’ouverture, toujours là.
    const item = $(`#list-body .ld-item[data-id="${CSS.escape(id)}"]`);
    if(item){ item.querySelector('.ld-hit').focus({preventScroll:true}); const again = item.querySelector(`[data-mv="${dir}"]`); if(again) again.focus(); }
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
  if(rm){
    const id = rm.dataset.rm, i = l.bookIds.indexOf(id); if(i<0) return;
    l.bookIds.splice(i,1); save(); openList(l.id); renderLists();
    // Le focus passe au titre qui prend la place (ou au dernier), pas au <body>.
    const items = $$('#list-body .ld-item'), nx = items[Math.min(i, items.length-1)];
    if(nx) nx.querySelector('.ld-hit').focus({preventScroll:true});
    toast('Retiré de la liste', {label:'Annuler', onAction:()=>{
      if(!state.lists.includes(l) || l.bookIds.includes(id)) return; // liste supprimée, ou titre déjà remis entre-temps
      l.bookIds.splice(Math.min(i, l.bookIds.length), 0, id); save();   // à sa position d’origine
      if(ui.listId===l.id && $('#ov-list').classList.contains('open')) openList(l.id);
      renderLists();
    }});
    return;
  }
  const item = e.target.closest('.ld-item');
  if(item){ openDetail(item.dataset.id); }
});
// Filtre du sélecteur d’ajout : seule la colonne de résultats est re-rendue (le champ garde
// focus et curseur), la saisie est mémorisée pour survivre aux re-rendus du panneau.
$('#list-body').addEventListener('input', e => {
  if(e.target.id!=='l-pick-q' || ui.listMode!=='list') return;
  ui.listPickQ = e.target.value;
  const l = state.lists.find(x=>x.id===ui.listId), res = $('#l-pick-res');
  if(l && res) res.innerHTML = listPickHTML(l);
});
// critique de série : sauvegarde au blur (comme la fiche), sans ré-ouvrir à chaque frappe
$('#list-body').addEventListener('change', e => {
  if(ui.listMode==='series' && e.target.id==='s-review'){
    seriesRec(ui.seriesName).review = frTypo(e.target.value.trim());
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
// Pill du header : rend la série de jours visible (elle existait, cachée dans Stats).
function updateStreakPill(){
  const el = $('#btn-streak'); if(!el) return;
  const {cur} = streaks();
  if(cur >= 2){
    el.hidden = false;
    $('#streak-n').textContent = cur;
    const t = `${cur} jours de lecture d’affilée, continue !`;
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
  // Bibliothèque vide : afficher l’échafaudage complet (tuiles à 0, heatmap vide, histogrammes
  // sans barres) donne l’impression d’une app cassée. On propose plutôt une porte de sortie.
  const vide = $('#stats-empty');
  if(!state.books.length){
    $$('#view-stats > *:not(.section):not(#stats-empty)').forEach(el=>el.hidden = true);
    if(!vide){
      const d = document.createElement('div'); d.id='stats-empty'; d.className='empty';
      d.innerHTML = `<div class="big">${ic('chart',34)}</div><h3>Tes statistiques arrivent</h3>
        <p>Ajoute quelques lectures et tu verras ici ton rythme, tes genres, tes notes et ta régularité au fil de l’année.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" id="stats-add">${ic('plus',16)} Ajouter une lecture</button>
          <button class="btn" id="stats-lib">Voir ma bibliothèque</button>
        </div>`;
      $('#view-stats').appendChild(d);
      $('#stats-add').addEventListener('click', ()=>openSearch({status:'read'}));   // « Ajouter une lecture » : pas une envie, une lecture faite
      $('#stats-lib').addEventListener('click', ()=>selectView('library'));
    } else vide.hidden = false;
    return;
  }
  if(vide) vide.hidden = true;
  $$('#view-stats > *:not(#stats-empty)').forEach(el=>{ if(el.hidden && el.id!=='stats-empty') el.hidden = false; });
  const read = state.books.filter(b=>b.status==='read');
  const readings = allReadings();
  const yr = new Date().getFullYear();
  const rated = state.books.filter(b=>b.rating);
  const avg = rated.length ? (rated.reduce((s,b)=>s+b.rating,0)/rated.length) : 0;
  const pages = read.reduce((s,b)=>s+(b.pages||0),0);
  // « série en cours (record : N j) » : « série » se lit d’abord comme une saga de livres.
  // On affiche un fait sans jargon ; la suite de jours reste dans la pill du header (updateStreakPill).
  const activeDays = Object.keys(activityByDay()).filter(d=>d.startsWith(String(yr))).length;

  $('#stat-tiles').innerHTML = `
    <div class="tile"><b>${read.length}</b><span>lus au total</span></div>
    <div class="tile"><b>${pages ? pages.toLocaleString('fr-FR') : '—'}</b><span>pages lues</span></div>
    <div class="tile"><b>${avg ? avg.toFixed(1).replace('.',',')+' ★' : '—'}</b><span>note moyenne</span></div>
    <div class="tile"><b>${state.books.filter(b=>b.status==='wishlist').length}</b><span>dans la pile à lire</span></div>
    <div class="tile"><b>${activeDays}</b><span>jour${activeDays>1?'s':''} de lecture en ${yr}</span></div>`;

  // Années disponibles pour la heatmap — calculées AVANT le panneau Objectif, dont le bouton
  // « Rétro » affiche ui.heatYear (une année périmée donnerait un libellé faux le temps d’un rendu).
  const yearsInData = [...new Set([...Object.keys(activityByDay()).map(d=>+d.slice(0,4)), yr])].sort((a,b)=>b-a).slice(0,5);
  if(!yearsInData.includes(ui.heatYear)) ui.heatYear = yr;

  // Objectif annuel
  const gi = goalInfo(yr);
  // Le bouton suit l’année choisie dans la heatmap : cliquer « 2025 » puis « Rétro 2025 » doit marcher.
  const recapBtn = `<button class="btn small" id="recap-btn" style="margin-top:12px">Rétro ${ui.heatYear}</button>`;
  const goalContent = gi ? `
    <span class="goal-title">Objectif ${yr}<span class="goal-edit-hint" aria-hidden="true">✎ Modifier</span></span>
    <div class="goal-big">
      <span class="gnum">${gi.done}<small> / ${gi.goal} lectures</small></span>
      <div class="gbar"><div class="fill" style="width:${Math.min(100, gi.done/gi.goal*100)}%"></div></div>
      ${paceHTML(gi)}
    </div>` : `
    <span class="goal-title">Objectif ${yr}<span class="goal-edit-hint" aria-hidden="true">✎ Modifier</span></span>
    <span style="display:block;font-size:14px; color:var(--muted)">Aucun objectif défini. Active un défi de lectures pour ${yr}.</span>`;
  $('#goal-panel').innerHTML = `<button type="button" class="goal-edit" aria-label="Modifier l’objectif de lecture ${yr}">${goalContent}</button>${recapBtn}`;

  // Heatmap
  $('#heat-years').innerHTML = yearsInData.map(y=>
    `<button class="chip ${y===ui.heatYear?'active':''}" data-hy="${y}" aria-pressed="${y===ui.heatYear}">${y}</button>`).join('');
  renderHeat();

  // Histogramme des notes
  const histo = Array(10).fill(0);
  rated.forEach(b=>{ histo[Math.round(b.rating*2)-1]++; });
  const hmax = Math.max(...histo, 1);
  // Un « ½ » sous une barre sur deux ne disait pas de quelle note il s’agissait, et la hauteur
  // seule ne donnait aucun compte : on étiquette les entiers et on écrit le nombre au-dessus.
  $('#histo').innerHTML = histo.map((n,i)=>{
    const v = (i+1)/2;
    const vTxt = fmtDec(v);
    return `<div class="col" title="${vTxt} ★ : ${n}" role="img" aria-label="${ratingText(v)} : ${plur(n,'lecture')}">
      <span class="cnt" aria-hidden="true">${n||''}</span>
      <div class="barwrap"><div class="bar ${n?'on':''}" style="height:${Math.max(n/hmax*100,3)}%"></div></div>
      <span class="rl" aria-hidden="true">${i%2 ? v+'★' : ''}</span>
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
  $('#type-metric-count').classList.toggle('on', metric==='count'); $('#type-metric-count').setAttribute('aria-pressed', String(metric==='count'));
  $('#type-metric-pages').classList.toggle('on', metric==='pages'); $('#type-metric-pages').setAttribute('aria-pressed', String(metric==='pages'));
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
    <span class="val">${byYear[y]}</span></div>`).join('') || '<p style="font-size:13px;color:var(--faint)">Aucune lecture datée pour l’instant.</p>';

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

  // Rythme mois par mois (année de la heatmap) — l’année n’était écrite nulle part : ce panneau
  // changeait en silence quand on cliquait une puce d’année.
  const my = ui.heatYear;
  const bm = Array(12).fill(0);
  readings.filter(e=>e.date.startsWith(String(my))).forEach(e=>bm[+e.date.slice(5,7)-1]++);
  const bmmax = Math.max(...bm, 1);
  $('#month-year').textContent = my;
  $('#month-bars').innerHTML = bm.map((n,i)=>`
    <div class="col" title="${MONTHS_FR[i]} : ${n}" role="img" aria-label="${MONTHS_FR[i]} ${my} : ${plur(n,'lecture')}">
      <span class="cnt" aria-hidden="true">${n||''}</span>
      <div class="barwrap"><div class="bar ${n?'on month':''}" style="height:${Math.max(n/bmmax*100,3)}%"></div></div>
      <span class="rl" aria-hidden="true">${MONTHS_MINI[i]}</span></div>`).join('');

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

}
// Panneau « Mes données » (vue Mon compte) : infos d’export et bouton Restaurer à jour.
function refreshDataPanel(){
  const m = state.meta || {};
  const info = $('#export-info');
  if(info) info.textContent = m.lastExport
    ? `Dernier export : ${fmtDate(m.lastExport)} · ${plur(m.changes||0,'modification')} depuis`
    : 'Aucun export pour l’instant.';
  const r = $('#btn-restore'); if(r) r.hidden = !hasRecoverable();
}
function renderHeat(){
  const y = ui.heatYear;
  const act = activityByDay();
  const first = new Date(y, 0, 1);
  const offset = (first.getDay()+6)%7; // lundi = 0
  const cells = [];
  const months = [];   // {m, col} : colonne du 1er de chaque mois, pour la rangée d’en-tête
  const td = today();
  let total=0, activeDays=0, run=0, maxRun=0;
  for(let i=0;i<offset;i++) cells.push('<i style="visibility:hidden"></i>');
  const d = new Date(y,0,1);
  while(d.getFullYear()===y){
    const key = dateKey(d);
    const n = act[key]||0;
    total += n;
    if(n){ activeDays++; run++; maxRun=Math.max(maxRun,run); } else run=0;
    if(d.getDate()===1) months.push({m:d.getMonth(), col:Math.floor(cells.length/7)});
    const lvl = n===0 ? '' : n===1 ? 'l1' : n===2 ? 'l2' : 'l3';
    const label = d.toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
    const txt = `${label} : ${n ? plur(n,'lecture ou progression','lectures ou progressions') : 'rien'}`;
    // data-day : sur mobile aucun survol ne révèle le title, un appui affiche donc un toast.
    cells.push(`<i class="${lvl}${key===td?' today':''}" data-day="${key}" title="${txt}"${n?` role="img" aria-label="${txt}"`:''}></i>`);
    d.setDate(d.getDate()+1);
  }
  $('#heat').innerHTML = cells.join('');
  $('#heat-months').innerHTML = months.map(o=>
    `<span style="grid-column:${o.col+1}">${MONTHS_MINI[o.m]}</span>`).join('');
  $('#heat-summary').textContent = `${y} : ${plur(total,'lecture ou progression','lectures ou progressions')} sur ${plur(activeDays,'jour')}. Plus longue suite : ${plur(maxRun,'jour')} d’affilée.`;
  // La grille dépasse la largeur de l’écran : sur l’année en cours, on montre les semaines
  // récentes (fin de grille) plutôt que janvier.
  const w = $('.heat-wrap');
  if(w) w.scrollLeft = (y===new Date().getFullYear()) ? w.scrollWidth : 0;
}
// Un appui sur une case dit ce qui s’y est passé (le title ne s’affiche pas au doigt).
$('#heat').addEventListener('click', e => {
  const cell = e.target.closest('[data-day]'); if(!cell) return;
  toast(cell.title);
});
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
  // Le libellé dit « Rétro <année de la heatmap> » : le clic doit ouvrir cette année-là.
  if(e.target.closest('#recap-btn')){ showRecap(ui.heatYear); return; }
  if(e.target.closest('.goal-edit')) setGoal(new Date().getFullYear());
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
  // Pour l’année en cours, on ne compare que jusqu’à la même date de l’an dernier : sinon
  // un « -12 » en mars ne fait que constater que l’année n’est pas finie.
  const cutoff = `${year-1}-${today().slice(5)}`;
  const prevCount = allReadings().filter(e=>e.date.startsWith(String(year-1))
    && (year!==new Date().getFullYear() || e.date<=cutoff)).length;
  return {year, count:rd.length, pages, avg, best, longest, topAuthor, topMonth:byMonth.some(v=>v)?topMonth:-1, byType, topMoods, rereads, byMonth, topTag, readingDays, topSeries, prevCount};
}
// « ▲ +3 vs N-1 » : jargon de tableur. On écrit la comparaison en toutes lettres, et on précise
// « à la même date » pour l’année en cours (comparer 8 mois à 12 mois n’aurait aucun sens).
function deltaBadge(cur, prev, year){
  if(!prev) return '';
  const d = cur - prev;
  const same = year === new Date().getFullYear() ? ` à la même date qu’en ${year-1}` : ` par rapport à ${year-1}`;
  if(d>0) return `<span class="delta ahead">+${d}${same}</span>`;
  if(d<0) return `<span class="delta behind">${d}${same}</span>`;
  return `<span class="delta">autant qu’en ${year-1}</span>`;
}
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MONTHS_MINI = ['J','F','M','A','M','J','J','A','S','O','N','D'];
function showRecap(year){
  const r = yearRecap(year);
  ui.listMode = 'recap'; ui.recapYear = year;
  $('#list-head').textContent = `Ta rétro ${r.year} `;
  if(!r.count){
    $('#list-body').innerHTML = `<p style="color:var(--muted); padding:16px 0; text-align:center">Aucune lecture datée en ${r.year}. Reviens quand tu auras noirci quelques pages.</p>`;
  }else{
    const bmax = Math.max(...r.byMonth, 1);
    const monthChart = `<div class="rating-histo" style="margin-bottom:14px">${r.byMonth.map((n,i)=>
      `<div class="col" title="${MONTHS_FR[i]} : ${n}" role="img" aria-label="${MONTHS_FR[i]} ${r.year} : ${plur(n,'lecture')}"><div class="bar ${n?'on month':''}" style="height:${Math.max(n/bmax*100,3)}%"></div><span class="rl" aria-hidden="true">${MONTHS_MINI[i]}</span></div>`).join('')}</div>`;
    $('#list-body').innerHTML = `
      <div class="recap-tiles">
        <div class="tile"><b>${r.count}</b><span>lecture${r.count>1?'s':''} ${deltaBadge(r.count, r.prevCount, r.year)}</span></div>
        <div class="tile"><b>${r.pages?r.pages.toLocaleString('fr-FR'):'—'}</b><span>pages</span></div>
        <div class="tile"><b>${r.avg?r.avg.toFixed(1).replace('.',',')+' ★':'—'}</b><span>note moyenne</span></div>
        ${r.rereads?`<div class="tile"><b>${r.rereads}</b><span>relecture${r.rereads>1?'s':''}</span></div>`:''}
      </div>
      ${monthChart}
      ${r.best?`<div class="recap-hi"><div class="rl">Ton coup de cœur</div><b>${esc(fullTitle(r.best))}</b> · ${starsTxt(r.best.rating)}</div>`:''}
      ${r.topAuthor?`<div class="recap-hi"><div class="rl">Plume de l’année</div><b>${esc(r.topAuthor[0])}</b> · ${plur(r.topAuthor[1],'titre')}</div>`:''}
      ${r.topTag?`<div class="recap-hi"><div class="rl">Genre phare</div><b>${esc(r.topTag[0])}</b> · ${plur(r.topTag[1],'titre')}</div>`:''}
      ${r.topSeries&&r.topSeries.n>1?`<div class="recap-hi"><div class="rl">Ta plus longue saga</div><b>${esc(r.topSeries.name)}</b> · ${r.topSeries.n} tomes</div>`:''}
      ${r.readingDays?`<div class="recap-hi"><div class="rl">Jours de lecture</div><b>${r.readingDays}</b> jour${r.readingDays>1?'s':''} avec une page tournée</div>`:''}
      ${r.topMoods.length?`<div class="recap-hi"><div class="rl">Tes ambiances</div><b>${r.topMoods.map(esc).join(', ')}</b></div>`:''}
      <div class="recap-hi"><div class="rl">Par type</div><b>${Object.entries(r.byType).filter(([,n])=>n).map(([t,n])=>`${n} ${TYPE_LABEL[t].toLowerCase()}${n>1&&t==='livre'?'s':''}`).join(' · ')||'—'}</b></div>
      <button class="btn primary" id="recap-share" style="margin-top:14px; width:100%">${ic('image',16)} Créer ma carte à partager</button>`;
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
// formules par Excel/Sheets ; l’import Tome la retirera sans altérer la donnée d’origine.
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
  downloadJSON(withoutSyncBase(state), `tome-export-${today()}.json`);   // la base de fusion est propre à l’appareil : elle ne sort pas
  state.meta.changes = 0;
  state.meta.lastExport = today();
  save(true);
  refreshDataPanel();   // « Dernier export : aujourd’hui » dans Mon compte › Mes données, d’où qu’on ait exporté
  toast('Export téléchargé ✓');
});
$('#btn-export-csv').addEventListener('click', ()=>{
  downloadBlob(buildTomeCSV(state.books), 'text/csv;charset=utf-8', `tome-livres-${today()}.csv`);
  toast(`${plur(state.books.length,'livre exporté','livres exportés')} en CSV. Le JSON reste la sauvegarde complète`);
});
/* =============== Import CSV (Tome / Goodreads / StoryGraph) =============== */
// Parseur CSV maison, tolérant RFC-4180 (guillemets, virgules et retours-ligne dans les champs, BOM)
function parseCSV(text){
  text = text.replace(/^﻿/, '');
  // séparateur : « ; » si la première ligne en contient plus que de virgules (export Babelio)
  const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const sep = (first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ';' : ',';
  const rows = []; let row = [], f = '', i = 0, q = false;
  const push = ()=>{ row.push(f); f=''; };
  while(i < text.length){
    const c = text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i+=2; continue; } q=false; i++; continue; }
      f+=c; i++; continue;
    }
    if(c==='"'){ q=true; i++; continue; }
    if(c===sep){ push(); i++; continue; }
    if(c==='\r'){ i++; continue; }
    if(c==='\n'){ push(); rows.push(row); row=[]; i++; continue; }
    f+=c; i++;
  }
  if(f.length || row.length){ push(); rows.push(row); }
  return rows.filter(r => r.some(v => v!==''));
}
function decodeEntities(v){
  const t = String(v||'').replace(/&#(\d+),/g, '&#$1;');
  if(!/&[#a-z0-9]+;/i.test(t)) return t;
  const ta = document.createElement('textarea'); ta.innerHTML = t; return ta.value;
}
function detectSource(headers){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  if(h.includes('tome csv version') && h.includes('tome id')) return 'tome';
  if(h.includes('exclusive shelf')) return 'goodreads';
  if(h.includes('read status') || (h.includes('moods') && h.includes('pace'))) return 'storygraph';
  if(h.includes('titre') && h.includes('auteur') && h.includes('statut')) return 'babelio';
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
// Détection de série pour l’import : suffixe « (Série, #N) » (Goodreads) ou mention « tome/vol N ».
// N’utilise PAS l’heuristique du nombre nu de parseTome (« Catch-22 » ne doit pas devenir tome 22).
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
  let authors, type, year, pages, status, rating, review, tags, moods=[], pace=null, readings, addedAt, titleOverride='';
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
  }else if(source==='babelio'){
    // Export Babelio (« ; », 8 colonnes) : ISBN;Titre;Auteur;Editeur;Date de publication;Date d`entrée;Statut;Note.
    // Pas de date de lecture, pas de critique, pas d'étagères : on n'invente rien.
    const auteur = decodeEntities(get('Auteur'));
    const parts = auteur.split(/\s+/).filter(Boolean);
    authors = auteur ? [parts.length===2 ? `${parts[1]} ${parts[0]}` : auteur] : [];   // « Nom Prénom » → « Prénom Nom »
    const st = decodeEntities(get('Statut')).toLowerCase().replace(/[àâ]/g,'a').replace(/[éèê]/g,'e').trim();
    status = ({'lu':'read','lus':'read','en cours':'reading','je lis':'reading','a lire':'wishlist','pense-bete':'wishlist','abandonne':'abandoned'})[st] || 'wishlist';
    const nr = parseFloat(String(get('Note')||'').replace(',','.'));
    rating = (Number.isFinite(nr) && nr>0) ? Math.max(0.5, Math.min(5, Math.round(nr*2)/2)) : null;
    review = ''; tags = ['babelio']; readings = [];
    year = numOrNull(String(get('Date de publication')||'').slice(0,4));
    pages = null;
    addedAt = String(get('date_entree')||'').slice(0,10) || undefined;
    // l'éditeur trahit le type (Babelio n'exporte pas de catégorie)
    const ed = String(get('Editeur')||'').toLowerCase();
    const BD = ['dargaud','dupuis','casterman','delcourt','le lombard','lombard','soleil','urban comics','futuropolis','glénat bd','bamboo','vents d','rue de sèvres','sarbacane','fluide glacial','ankama','panini comics','dc comics','marvel'];
    const MANGA = ['kana','pika','ki-oon','kurokawa','kazé','kaze','panini manga','glénat manga','tonkam','doki-doki','akata','nobi nobi','meian','soleil manga','delcourt/tonkam','mangetsu','vega'];
    type = MANGA.some(k=>ed.includes(k)) ? 'manga' : BD.some(k=>ed.includes(k)) ? 'bd' : guessType([get('Editeur'), title].join(' '), title);
    // « Série, tome N : Titre » (forme fréquente sur Babelio)
    const m = decodeEntities(title).match(/^(.+?),\s*tome\s+(\d{1,4})\s*:\s*(.+)$/i);
    if(m){ pt.series = m[1].trim(); pt.volume = +m[2]; titleOverride = m[3].trim(); }
    else titleOverride = decodeEntities(title);
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
    title: titleOverride || (pt.series ? stripSeriesSuffix(title) : title),
    authors, type, year, pages, cover:'', synopsis:'',
    status, rating, review, tags, moods, pace, readings,
    series: pt.series||'', volume: pt.volume ?? null,
  };
  if(addedAt) raw.addedAt = addedAt;
  const isbn = csvIsbn(get(source==='goodreads' ? 'ISBN13' : 'ISBN/UID')) || csvIsbn(get('ISBN'));
  if(isbn) raw.isbn = isbn;
  return { book: normalizeBook(raw), isbn };
}
// Récupération non bloquante des couvertures par ISBN via Open Library (concurrence limitée).
// La progression s’affiche dans le compteur de la bibliothèque (« 12 ouvrages · Couvertures : 5 / 12 »)
// et l’état est écrit toutes les 20 couvertures : fermer la PWA en cours de route ne perd pas
// celles déjà obtenues — avant, tout n’était sauvé qu’à la toute fin, ou jamais.
let _coverProgress = '';
function setCoverProgress(txt){
  _coverProgress = txt;
  const el = $('#lib-count'); if(!el) return;
  // renderLibrary() a rangé le décompte seul dans data-base : on le complète sans le recalculer
  const base = el.dataset.base || '';
  const full = base + (txt ? (base ? ' · ' : '') + txt : '');
  // .lc-txt porte le décompte seul ; le lien « Tout afficher » qui le suit doit survivre à la mise à jour
  setLibCount(full);
}
// #lib-count = deux enfants fixes d’index.html : .lc-txt (role=status, le décompte) et .lc-filter
// (filtre actif + « Tout afficher »). Les écrire séparément garde la région annoncée stable :
// un lecteur d’écran n’entend que « 12 ouvrages », et seulement quand le texte change vraiment
// (renderLibrary repasse souvent avec le même décompte). filterHTML omis = filtre inchangé.
function setLibCount(txt, filterHTML){
  const el = $('#lib-count'); if(!el) return;
  const span = el.querySelector('.lc-txt'), filt = el.querySelector('.lc-filter');
  if(span){ if(span.textContent !== txt) span.textContent = txt; } else el.textContent = txt;
  if(filt && filterHTML !== undefined && filt.innerHTML !== filterHTML) filt.innerHTML = filterHTML;
}
function queueCovers(pairs){
  pairs = pairs.filter(p=>p.isbn);
  if(!pairs.length) return;
  let i=0, active=0, dirty=false, got=0, done=0;
  const progress = ()=>setCoverProgress(`Couvertures : ${fmtRatio(done, pairs.length)}`);
  progress();
  const next = ()=>{
    if(i>=pairs.length){
      if(!active){ setCoverProgress(''); if(dirty){ save(true); scheduleRender(); } if(got) toast(`${plur(got,'couverture récupérée','couvertures récupérées')} ✓`); }
      return;
    }
    while(active<4 && i<pairs.length){
      const {id, isbn} = pairs[i++]; active++;
      const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
      const img = new Image(); img.referrerPolicy = 'no-referrer';
      let settled = false;
      const fin = ok=>{
        if(settled) return; settled = true; clearTimeout(to);
        active--; done++;
        if(ok){ const b = state.books.find(x=>x.id===id); if(b && !b.cover){ b.cover=url; dirty=true; got++; } }
        progress();
        // point d’étape : ce qui est déjà obtenu est écrit et montré sans attendre la dernière image
        if(done % 20 === 0 && dirty){ save(true); scheduleRender(); dirty = false; }
        next();
      };
      const to = setTimeout(()=>fin(false), 8000); // libère le créneau si l’image ne répond jamais
      img.onload = ()=>fin(img.naturalWidth>1);
      img.onerror = ()=>fin(false);
      img.src = url;
    }
  };
  next();
}
// Éteint le toast en cours (« Lecture du fichier… ») quand ce qui suit — dialogue, résultat — le remplace.
// Avec msg, seulement s’il affiche encore ce message : un état d’attente devenu caduc ne doit pas
// emporter un retour plus récent qui l’aurait déjà remplacé.
function hideToast(msg){ const t = $('#toast'); if(t._h && t._hide && (!msg || t.textContent===msg)) t._hide(); }
// Un import raté se dit en dialogue, pas en toast de deux secondes : le message reste lisible,
// rappelle les formats acceptés et propose directement de choisir un autre fichier (input : lequel
// rouvrir — le sélecteur CSV ou le JSON, selon le bouton d’où l’on vient).
async function importFail(msg, input='#import-csv-file'){
  hideToast();
  const v = await uiChoose({
    title:'Import impossible',
    message: msg+'\n\nFormats acceptés : Goodreads (export « My Books »), StoryGraph, Babelio, CSV et JSON de Tome.',
    choices:[{ label:'Choisir un autre fichier', value:'retry', variant:'primary', default:true }],
  });
  if(v==='retry') $(input).click();
}
async function importCSV(text){
  const rows = parseCSV(text);
  if(rows.length < 2){ importFail('Ce fichier est vide ou ne contient pas de lignes lisibles.'); return; }
  const source = detectSource(rows[0]);
  if(!source){ importFail('Ce fichier n’est pas un export reconnu.'); return; }
  const headers = rows[0].map(x=>String(x).trim().toLowerCase());
  const idx = {}; headers.forEach((x,i)=>{ if(!(x in idx)) idx[x]=i; if(x.startsWith('date d') && x.includes('entr')) idx['date_entree']=i; });
  if(idx['titre']!=null && idx['title']==null) idx['title'] = idx['titre'];
  const mkGet = row => name => { const i = idx[String(name).toLowerCase()]; return i==null ? '' : String(row[i]||'').trim(); };
  const parsed = [];
  for(let r=1; r<rows.length && parsed.length<MAX_BOOKS; r++){
    const res = rowToBook(mkGet(rows[r]), source);
    if(res && res.book.title) parsed.push(res);
  }
  if(!parsed.length){ importFail('Aucune ligne avec un titre.'); return; }
  hideToast(); // « Lecture du fichier… » a fait son office : place à l’aperçu
  const sourceLabel = source==='goodreads'?'Goodreads':source==='storygraph'?'StoryGraph':source==='babelio'?'Babelio':'Tome CSV';
  // dédup par titre+auteur+tome (les livres existants n’ont pas d’ISBN persisté) ET par ISBN dans le lot
  const titleKey = b => (b.title+'|'+((b.authors||[])[0]||'')+'|'+(b.volume??'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,'');
  // Aperçu avant validation : répartition par statut, titres déjà en rayon, premiers titres — de
  // quoi repérer un mauvais export (tout « à lire », mauvais fichier) AVANT d’écrire quoi que ce soit.
  const deja = new Set(state.books.map(titleKey));
  const dup = parsed.filter(p=>deja.has(titleKey(p.book))).length;
  const by = {read:0, reading:0, wishlist:0, abandoned:0};
  parsed.forEach(p=>{ by[p.book.status] = (by[p.book.status]||0)+1; });
  const sample = parsed.slice(0,4).map(p=>p.book.title).join(', ') + (parsed.length>4 ? '…' : '');
  // Goodreads et StoryGraph ont une colonne de statut : cent pour cent « à lire » trahit presque
  // toujours un export partiel (une seule étagère) — Babelio et le CSV de Tome, eux, disent vrai.
  const suspect = by.wishlist===parsed.length && (source==='goodreads' || source==='storygraph');
  const apercu = `${plur(parsed.length,'livre')} : ${by.read} lu${by.read>1?'s':''}, ${by.reading} en cours, ${by.wishlist} à lire${by.abandoned?`, ${plur(by.abandoned,'abandonné')}`:''}.`
    + (dup ? `\n${plur(dup,'titre déjà présent','titres déjà présents')} (ignoré${dup>1?'s':''} à la fusion).` : '')
    + `\nEx. : ${sample}`
    + (suspect ? '\n\nAttention : aucun statut « lu » détecté, vérifie l’export.' : '');
  // « Tout remplacer » n’a de sens que s’il y a quelque chose à remplacer
  const choices = [{ label:'Fusionner', value:'merge', variant:'primary', default:true }];
  if(state.books.length) choices.push({ label:'Tout remplacer', value:'replace', variant:'danger' });
  const choice = await uiChoose({
    title: `Import ${sourceLabel}`,
    message: `${apercu}${source==='tome'?'\n\nLe CSV contient les ouvrages, pas les listes ni les objectifs. Le JSON reste le format de sauvegarde complète.':''}${source==='babelio'?'\n\nBabelio n’exporte ni les dates de lecture, ni les critiques, ni les étagères : tes livres lus arrivent sans date, les couvertures seront récupérées par ISBN.':''}${state.books.length?'\n\n« Fusionner » ajoute les nouveaux titres à ta bibliothèque (recommandé).\n« Tout remplacer » efface d’abord ta bibliothèque actuelle. Une sauvegarde de secours est conservée (restaurable dans Mon compte › Mes données).':''}`,
    choices,
  });
  if(choice===null) return; // Annuler / Échap / clic hors modale = AUCUNE écriture
  const doReplace = (choice==='replace');
  // Effacer une bibliothèque entière mérite une seconde confirmation, Annuler par défaut (danger)
  if(doReplace && !await uiConfirm({ title:`Effacer ${plur(state.books.length,'livre')} ?`, message:'Ils seront remplacés par le fichier. Une sauvegarde sera restaurable dans Mon compte › Mes données.', okLabel:'Effacer et importer', danger:true })) return;
  const pairs = [];
  let added=0, skipped=0;
  if(doReplace){
    // Remplacement : backup d’abord (réutilise le mécanisme d’import JSON)
    const prev = JSON.stringify(state);
    let backedUp=false; try{ localStorage.setItem(LS_KEY+'-backup', prev); backedUp=true; }catch(_){}
    if(!backedUp && state.books.length) downloadJSON(JSON.stringify(withoutSyncBase(state)), `tome-sauvegarde-avant-import-${today()}.json`);
    // Effacement explicite, doublement confirmé : marqué, sinon un autre appareil ramènerait tout.
    markBooksDeleted(state.books);
    state.books = []; state.lists = []; state.goals = {}; state.series = {}; state.smartCollections = [];
  }
  // Le CSV de Tome réutilise ses « Tome ID » : un livre dont l’id vient d’être marqué (ou l’avait été
  // avant) reçoit un nouvel id, sinon il coexisterait avec son marqueur et la fusion suivante
  // l’effacerait — bibliothèque vide au chargement d’après, partout.
  for(const p of parsed) restoreBookIdentity(p.book, []);
  const seen = new Set(state.books.map(titleKey));
  for(const {book, isbn} of parsed){
    const tk = titleKey(book);
    if(seen.has(tk) || (isbn && seen.has('isbn:'+isbn))){ skipped++; continue; }
    seen.add(tk); if(isbn) seen.add('isbn:'+isbn);
    state.books.unshift(book); pairs.push({id:book.id, isbn}); added++;
  }
  if(!save()){ render(); toast('Importé mais non sauvegardé (stockage plein)'); return; }
  toast(`${plur(added,'livre ajouté','livres ajoutés')}${skipped?` · ${plur(skipped,'déjà présent')}`:''}${source!=='tome'?' · couvertures en cours…':''}`, {ms:6000});
  if(source!=='tome') queueCovers(pairs);
  // Retour vers la bibliothèque, triée par ajout et sans filtre : les livres importés sont sous les
  // yeux au lieu de rester cachés derrière Stats (openTodayShelf vide les filtres, synchronise les
  // puces, persiste et change de vue — même chemin que « Voir » après une session d’ajout).
  // Différé : le dialogue qui vient de se fermer rend son entrée d’historique par un history.go
  // asynchrone, dont le popstate rejoue le hash de l’onglet courant (#stats) et annulerait une
  // navigation faite tout de suite — même délai qu’endSearchSession.
  setTimeout(()=>{ resetSort(); openTodayShelf('all'); }, 160);
}
$('#btn-import-csv').addEventListener('click', ()=>$('#import-csv-file').click());
$('#import-csv-file').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  e.target.value = '';
  if(f.size > 25*1024*1024){ importFail(`Fichier trop lourd (${Math.round(f.size/1048576)} Mo, maximum 25 Mo).`); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    // Décoder puis analyser un gros export bloque le fil principal quelques secondes : on annonce
    // « Lecture du fichier… » et on laisse le navigateur le peindre (60 ms) avant de s’y mettre.
    // Le dialogue d’aperçu ou d’erreur l’éteint ensuite (hideToast).
    toast('Lecture du fichier…', {ms:60000});
    await new Promise(r=>setTimeout(r, 60));
    let text = '';
    try{ text = new TextDecoder('utf-8', { fatal:true }).decode(reader.result); }
    catch(_){ try{ text = new TextDecoder('windows-1252').decode(reader.result); }catch(__){ text = ''; } } // exports Babelio parfois en latin-1
    try{ await importCSV(text); }catch(err){ console.error(err); importFail('Ce fichier n’a pas pu être lu.'); }
  };
  reader.onerror = ()=>importFail('Ce fichier n’a pas pu être lu.');
  reader.readAsArrayBuffer(f);
});

$('#btn-import').addEventListener('click', ()=>$('#import-file').click());
$('#import-file').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  e.target.value = '';
  if(f.size > 25*1024*1024){ importFail(`Fichier trop lourd (${Math.round(f.size/1048576)} Mo, maximum 25 Mo).`, '#import-file'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    // Ni « { » ni « [ » en tête : ce n’est pas du JSON. Un CSV (virgules ou points-virgules dès la
    // première ligne) est renvoyé vers le bon bouton au lieu d’être déclaré « invalide ».
    const head = String(reader.result||'').replace(/^\uFEFF/,'').trimStart();
    if(!/^[\[{]/.test(head)){
      const premiere = head.split(/\r?\n/, 1)[0];
      if(/[;,]/.test(premiere)) importFail('Ce fichier ressemble à un CSV : utilise plutôt « Importer depuis Goodreads, StoryGraph ou Babelio » juste à côté.', '#import-csv-file');
      else importFail(head ? 'Ce fichier n’est pas une sauvegarde Tome (.json).' : 'Ce fichier est vide.', '#import-file');
      return;
    }
    try{
      const d = JSON.parse(head);
      const clean = normalizeData(d);
      if(!clean.books.length && !clean.lists.length) throw new Error('vide');
      if(!await uiConfirm({ title:'Importer cette sauvegarde ?', message:`${plur(clean.books.length,'ouvrage')} et ${plur(clean.lists.length,'liste')}. Cela remplace tes données actuelles. Une sauvegarde de secours est conservée (restaurable dans Mon compte › Mes données).`, okLabel:'Importer et remplacer', danger:true })) return;
      // sauvegarde de secours AVANT tout écrasement ; si le stockage est plein, on télécharge l’ancien état
      const prev = JSON.stringify(state);
      let backedUp = false;
      try{ localStorage.setItem(LS_KEY+'-backup', prev); backedUp = true; }catch(_){ }
      if(!backedUp && state.books.length){
        downloadJSON(JSON.stringify(withoutSyncBase(state)), `tome-sauvegarde-avant-import-${today()}.json`);
        toast('Stockage plein : ancienne bibliothèque téléchargée en secours');
      }
      replaceLocalLibrary(clean);   // sans marqueur : un import n’est pas une suppression, la fusion ramène le reste
      if(save()){ render(); toast('Import réussi ✓'); }
      else { render(); toast('Importé mais non sauvegardé (stockage plein). Exporte pour sécuriser'); }
    }catch(err){
      importFail(err && err.message==='vide' ? 'Cette sauvegarde est vide : aucun livre ni liste à importer.' : 'Ce fichier n’est pas une sauvegarde Tome (.json).', '#import-file');
    }
  };
  reader.onerror = ()=>importFail('Ce fichier n’a pas pu être lu.', '#import-file');
  reader.readAsText(f);
});
// Sauvegardes restaurables : avant-import (-backup), données corrompues (-corrupt), les copies de
// secours faites avant une réconciliation avec le compte (-preacct / -conflit), les bibliothèques
// mises de côté (-autre : ancien emplacement unique ; -autre:<compte> : une copie par compte), et
// la version qu’une restauration a remplacée (-prerestore, -prerestore:<compte> : voir plus bas).
const RESTORE_KEYS = [
  { k:'-backup',  label:"Sauvegarde d’avant-import" },
  { k:'-preacct', label:"Version locale d’avant la synchro du compte" },
  { k:'-conflit', label:"Version locale d’avant une fusion multi-appareils" },
  { k:'-autre',   label:"Bibliothèque mise de côté" },
];
/* ---- Version d’avant restauration (LS_KEY-prerestore, LS_KEY-prerestore:<compte>) ----
   « Restaurer » remplaçait la bibliothèque de l’appareil, puis celle du compte à l’envoi suivant,
   sans garder nulle part ce qu’il y avait à l’écran, tout en promettant qu’elle resterait « côté
   serveur ». La version remplacée est maintenant écrite ici AVANT le remplacement, et se reprend
   par le même bouton. Si l’écriture échoue, rien n’est remplacé (voir exportBeforeRestore).
   Une copie PAR PROPRIÉTAIRE, celui de l’état copié (meta.ownerId, qui part dans la copie) : sur un
   appareil partagé, la restauration de B n’écrase pas la copie de A (la leçon de « -autre »), et
   restorableBy s’y applique comme aux autres copies. Sans la base de fusion : elle ne sert qu’à
   l’état vivant, replaceLocalLibrary garde celle de l’appareil.
   Un seul emplacement, donc une règle pour qu’il protège la bonne version. Qui cherche la bonne
   sauvegarde les essaie l’une après l’autre : au deuxième essai, l’écran ne montre plus sa
   bibliothèque mais le premier essai, et le copier ici effacerait la seule trace de la vraie. On
   note donc l’empreinte de ce que chaque restauration a produit (-prerestore-fp, par propriétaire
   aussi) ; tant que l’écran y est resté égal, il n’est qu’un essai, et l’emplacement ne bouge pas.
   Un essai ne peut être lâché que parce qu’il existe encore, tel quel, dans la copie d’où il sort :
   la marque note donc aussi cette copie (clé et empreinte du contenu), relue avant de conclure. Le
   cas qui l’a imposé : annuler une restauration APRÈS une retouche échange l’écran et l’emplacement
   (l’essai retouché y remplace la vraie bibliothèque, qui revient à l’écran) ; la source de l’écran
   est alors l’emplacement lui-même, qui ne la contient plus. Prise pour un essai, la vraie
   bibliothèque disparaissait à la restauration suivante, sous un dialogue qui la disait à l’abri. */
const PRE_RESTORE = '-prerestore', PRE_RESTORE_FP = '-prerestore-fp', PRE_RESTORE_LABEL = 'Version d’avant restauration';
function preRestoreKey(owner){ return PRE_RESTORE + (owner ? ':'+owner : ''); }
// Copies présentes, lues dans le stockage lui-même (comme asideCopies) : celles des autres comptes
// de l’appareil en font partie, l’écouteur les montre inertes.
function preRestoreKeys(){
  const out = [], own = LS_KEY+PRE_RESTORE;
  try{ for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k && (k===own || k.startsWith(own+':'))) out.push(k.slice(LS_KEY.length)); } }catch(_){ }
  return out.sort();
}
// Y a-t-il à l’écran quelque chose qu’un remplacement ferait perdre ? Les exemples et l’objectif
// qu’ils prêtent ne comptent pas : un état vide n’a pas à écraser une copie encore utile (même
// règle que -preacct, voir adoptServerLibrary), ni à buter sur un stockage plein alors qu’on
// restaure justement parce que les données étaient illisibles.
function hasLibraryContent(st){
  return (st.books||[]).some(b=>!isDemoBook(b)) || !!(st.lists||[]).length || !!(st.smartCollections||[]).length
    || !!Object.keys(st.series||{}).length || (!!Object.keys(st.goals||{}).length && !(st.meta && st.meta.demoGoal));
}
// Empreinte de ce que l’utilisateur a saisi, et de rien d’autre (ni compte, ni révision, ni
// marqueurs, ni compteurs) : dit si l’écran a changé depuis la dernière restauration. Les livres,
// intitulés de listes, notes de série et collections viennent de la base de fusion (empreintes
// mémorisées par livre) ; on y ajoute ce qu’elle laisse de côté, les livres de chaque liste et les objectifs.
function libraryContentFp(st){
  const fp = syncFingerprints(st, memoFingerprint), sorted = o => Object.entries(o||{}).sort(([a],[b])=>a<b ? -1 : a>b ? 1 : 0);
  return comparableFingerprint(JSON.stringify([sorted(fp.books), sorted(fp.lists), sorted(fp.series), sorted(fp.smart),
    (st.lists||[]).map(l=>[l.id, l.bookIds||[]]), sorted(st.goals)]));
}
// Marque de la dernière restauration du propriétaire `owner` (voir markRestored), ou null. Tout ce
// qui ne se lit pas (absente, tronquée, ou l’empreinte nue d’une version antérieure) vaut « pas de
// marque » : l’écran sera copié.
function restoredMark(owner){
  try{
    const m = JSON.parse(localStorage.getItem(LS_KEY+PRE_RESTORE_FP+(owner ? ':'+owner : ''))||'null');
    return (m && typeof m==='object' && [m.fp, m.src, m.was].every(v=>typeof v==='string' && v)) ? m : null;
  }catch(_){ return null; }
}
// Empreinte du contenu d’une copie du stockage, ou '' si elle a disparu ou ne se lit plus. Sur le
// contenu, pas sur le texte : une copie de secours refaite à l’identique par une synchro (seules
// les méta changent) contient toujours l’essai.
function storedContentFp(k){
  try{ const raw = localStorage.getItem(LS_KEY+k); return raw ? libraryContentFp(normalizeData(JSON.parse(raw))) : ''; }
  catch(_){ return ''; }
}
// Ce que devient la version à l’écran si on restaure maintenant :
//   rien  : il n’y a rien à garder ;
//   essai : l’écran est resté tel qu’une restauration l’a laissé, la copie d’où il sort le contient
//           ENCORE, et l’emplacement protège déjà une version : il n’est pas copié, l’emplacement
//           garde la version d’avant. Sans rien à protéger, ou si la copie source a été réécrite
//           (échange avec l’emplacement, import, copie purgée), pas d’exception : dans le doute, on copie ;
//   copie : il part dans l’emplacement de son propriétaire. `replaces` : il y prend la place d’une
//           autre version (sauf si c’est elle qu’on restaure : elle passe à l’écran), ce que le dialogue annonce.
function planBeforeRestore(chosen){
  const owner = (state.meta && state.meta.ownerId) || '', k = preRestoreKey(owner);
  let kept = false;
  try{ kept = !!localStorage.getItem(LS_KEY+k); }catch(_){ }
  if(!hasLibraryContent(state)) return { kind:'rien', k, owner };
  const mark = kept ? restoredMark(owner) : null;
  if(mark && mark.fp===libraryContentFp(state) && storedContentFp(mark.src)===mark.was) return { kind:'essai', k, owner };
  return { kind:'copie', k, owner, replaces: kept && chosen.k!==k };
}
// Écrit la version à l’écran dans son emplacement, et la relit. Faux si le stockage la refuse
// (plein, ou interdit) : l’ancienne copie est alors intacte, et l’appelant ne remplace rien.
function keepBeforeRestore(k){
  try{ const json = JSON.stringify(withoutSyncBase(state)); localStorage.setItem(LS_KEY+k, json); return localStorage.getItem(LS_KEY+k)===json; }
  catch(_){ return false; }
}
// Après une restauration : la marque { fp, src, was } (voir planBeforeRestore, « essai »). fp =
// empreinte de ce qu’elle a produit à l’écran ; src = la copie restaurée ; was = l’empreinte du
// contenu de cette copie. Les deux empreintes diffèrent quand la restauration ré-identifie un livre
// dont l’id porte un marqueur de suppression (restoreBookIdentity) : l’écran n’en reste pas moins
// un essai tant que sa source est intacte.
// Retirée d’abord : si la nouvelle ne s’écrit pas, mieux vaut aucune marque qu’une ancienne.
function markRestored(owner, src, was){
  const k = LS_KEY+PRE_RESTORE_FP+(owner ? ':'+owner : '');
  try{ localStorage.removeItem(k); localStorage.setItem(k, JSON.stringify({ fp:libraryContentFp(state), src, was })); }catch(_){ }
}
// Le dialogue de confirmation dit ce qui est remplacé, et où retrouver ce qui l’était. Le compte
// suit l’appareil : l’envoi qui suit la restauration y dépose la même version (une bibliothèque
// laissée hors session par un compte repart de même vers lui à sa reconnexion). Rien n’y est
// supprimé pour autant : sans marqueur, un autre appareil du compte rapporte à sa fusion les
// livres qu’il a encore (test B2).
function restoreConfirmMessage(chosen, clean, plan){
  const me = social.me ? social.me.id : '', account = !!me && plan.owner===me;
  const head = `${chosen.label} : ${plur(clean.books.length,'ouvrage')}, ${plur(clean.lists.length,'liste')}.`;
  if(plan.kind==='rien') return `${head} Il n’y a rien à remplacer sur cet appareil.`;
  const n = plur(state.books.filter(b=>!isDemoBook(b)).length, 'ouvrage');
  const where = account ? 'sur cet appareil et sur ton compte'
    : (!me && plan.owner) ? 'sur cet appareil, puis sur le compte qui a laissé sa bibliothèque ici, à sa prochaine connexion'
    : 'sur cet appareil';
  // Une copie rattachée à un compte ne se reprend que connecté à ce compte (restorableBy)
  const slot = `sous « ${PRE_RESTORE_LABEL} »`, locked = ' ; pour la reprendre, il faudra te connecter avec le compte auquel elle est rattachée';
  const mine = restorableBy(plan.owner||null, me);
  if(plan.kind==='essai'){
    return `${head} Elle remplacera ce qu’il y a à l’écran (${n}) ${where}. Ce contenu sort lui-même d’une restauration et n’a pas changé depuis : il ne sera pas gardé.`
      + (mine ? ` Ta bibliothèque d’avant reste récupérable ici même, ${slot}.` : ` Ta bibliothèque d’avant reste gardée sur cet appareil, ${slot}${locked}.`);
  }
  const only = STORAGE_BLOCKED ? ', le temps de cette visite seulement (ton navigateur bloque le stockage de ce site)' : account ? ', sur cet appareil seulement' : '';
  return `${head} Elle remplacera ta bibliothèque actuelle (${n}) ${where}. `
    + (mine ? `L’actuelle restera récupérable ici même, ${slot}${only}.` : `L’actuelle restera gardée sur cet appareil, ${slot}${locked}.`)
    + (plan.replaces ? ' Elle y prendra la place de la copie faite à la restauration précédente.' : '');
}
// La copie n’a pas pu être écrite (stockage plein, ou refusé) : rien n’a été remplacé. Seule suite
// honnête : sortir d’abord la bibliothèque actuelle dans un fichier, puis confirmer en sachant que
// ce fichier sera le seul filet. (L’import, lui, télécharge d’office et continue : on vient d’y
// choisir un fichier. Ici, un clic de trop emporterait aussi la version du compte.)
// Vrai seulement si l’export est parti, que la suite est confirmée et que l’écran n’a pas changé entre-temps.
async function exportBeforeRestore(){
  const pick = await uiChoose({ title:'Ta bibliothèque actuelle ne peut pas être mise à l’abri',
    message:'Le stockage de cet appareil est plein ou refusé : la copie de sécurité n’a pas pu être écrite, et rien n’a été remplacé. Exporte d’abord ta bibliothèque actuelle dans un fichier ; tu pourras restaurer ensuite.',
    choices:[{ label:'Exporter ma bibliothèque', value:'export', variant:'primary', default:true }] });
  if(pick!=='export') return false;
  const before = JSON.stringify(withoutSyncBase(state)), file = `tome-avant-restauration-${today()}.json`;
  downloadJSON(before, file);
  if(!await uiConfirm({ title:'Export téléchargé. Restaurer maintenant ?',
    message:`Vérifie d’abord que le fichier ${file} est bien dans tes téléchargements : ta bibliothèque actuelle n’existera plus que là. Pour la reprendre, ce sera « Importer (JSON) », dans Mon compte › Mes données.`,
    okLabel:'Restaurer', danger:true })) return false;
  if(JSON.stringify(withoutSyncBase(state))!==before){ toast('Ta bibliothèque a changé entre-temps : relance la restauration'); return false; }
  return true;
}
function restoreKeys(){ return [...preRestoreKeys().map(k=>({ k, label:PRE_RESTORE_LABEL })), ...RESTORE_KEYS, ...asideCopies().map(c=>({ k:c.key.slice(LS_KEY.length), label:'Bibliothèque mise de côté' }))]; }
function hasRecoverable(){ return restoreKeys().some(r=>localStorage.getItem(LS_KEY+r.k)) || !!localStorage.getItem(LS_KEY+'-corrupt'); }
// Une copie ne se restaure que si elle est à personne ou au compte connecté (hors session : à
// personne seulement). Sur un appareil partagé, toutes les copies sont en clair : sans cette règle,
// la bibliothèque privée de A passait sur le compte de B en deux clics.
function restorableBy(owner, me){ return !owner || (!!me && owner===me); }
$('#btn-restore').addEventListener('click', async ()=>{
  const me = social.me ? social.me.id : '';
  const copies = restoreKeys().map(r=>{
    const raw = localStorage.getItem(LS_KEY+r.k); if(!raw) return null;
    let n = null, owner = null;
    try{ const d = JSON.parse(raw); n = (d.books||[]).length; owner = (d.meta && typeof d.meta.ownerId==='string') ? d.meta.ownerId : null; }catch(_){ }
    return { ...r, raw, n, mine: restorableBy(owner, me) };
  }).filter(Boolean);
  const avail = copies.filter(c=>c.mine), foreign = copies.filter(c=>!c.mine);
  const corrupt = localStorage.getItem(LS_KEY+'-corrupt');
  if(!avail.length && corrupt){
    downloadJSON(corrupt, `tome-donnees-brutes-${today()}.json`);
    toast('Copie brute téléchargée : à réparer à la main puis réimporter'); return;
  }
  if(!avail.length){
    if(foreign.length) await openDialog({ title:'Aucune sauvegarde à toi ici', message:`${foreign.length>1 ? 'Les copies présentes appartiennent' : 'La copie présente appartient'} à un autre compte. Connecte-toi avec ce compte pour ${foreign.length>1 ? 'les' : 'la'} récupérer.`, actions:[{ label:'Fermer', value:null, cancel:true, default:true }] });
    else toast('Aucune sauvegarde disponible');
    return;
  }
  // choisir laquelle restaurer (avec le nombre d’ouvrages pour se repérer) ; les copies d’un autre
  // compte restent visibles mais inertes — on sait qu’elles existent, on ne les prend pas
  let chosen = avail[0];
  if(copies.length > 1){
    const choices = [
      ...avail.map(r=>({ label:`${r.label} · ${r.n==null ? '? ouvrage' : plur(r.n,'ouvrage')}`, value:r.k })),
      ...foreign.map(r=>({ label:`${r.label} (appartient à un autre compte)`, value:r.k, disabled:true })),
    ];
    const pick = await uiChoose({ title:'Quelle sauvegarde restaurer ?', message: foreign.length ? 'Une copie d’un autre compte se récupère en se connectant avec ce compte.' : '', choices });
    if(!pick) return; chosen = avail.find(r=>r.k===pick);
  }
  let clean;
  try{ clean = normalizeData(JSON.parse(chosen.raw)); }catch(_){ toast('Sauvegarde illisible'); return; }
  if(!await uiConfirm({ title:'Restaurer cette sauvegarde ?', message:restoreConfirmMessage(chosen, clean, planBeforeRestore(chosen)), okLabel:'Restaurer', danger:true })) return;
  // Le plan est refait APRÈS le dialogue, et la copie écrite dans le même souffle que le
  // remplacement : le temps de lire, une synchro ou une autre fenêtre a pu changer l’écran.
  const plan = planBeforeRestore(chosen);
  if(plan.kind==='copie' && !keepBeforeRestore(plan.k) && !await exportBeforeRestore()) return;
  // Sans marqueur, comme l’import : vus de la base de fusion (celle de l’appareil, que
  // replaceLocalLibrary conserve avec la révision), les livres restaurés sont des retouches locales.
  // L’envoi qui suit les dépose donc sur le compte sans rien dédoubler ; s’il tombe sur un 409, la
  // fusion ne garde en double que ce qu’un autre appareil a lui aussi retouché.
  // L’empreinte de la copie restaurée est prise AVANT le remplacement (il peut ré-identifier des
  // livres de `clean`) ; c’est elle que planBeforeRestore relira dans la clé source. Après un échange
  // avec l’emplacement (keepBeforeRestore vient d’y écrire l’écran d’avant), elle n’y sera plus :
  // l’écran, revenu de l’emplacement, ne passera donc pas pour un essai.
  const was = libraryContentFp(clean);
  replaceLocalLibrary(clean);
  markRestored(plan.owner, chosen.k, was);
  // save() plutôt que libPersist() : un stockage qui refuse l’écriture est signalé (bandeau), l’envoi
  // vers le compte est planifié, et une version reçue d’une autre fenêtre pendant une modale
  // (_externalState) ne vient plus recouvrir la restauration à la fermeture suivante.
  const saved = save(true); render();
  const dw = $('#data-warning'); if(dw) dw.hidden = true; // l’alerte « données illisibles » n’a plus lieu d’être
  if(saved) toast('Sauvegarde restaurée ✓');
  else toast('Restaurée, mais pas enregistrée sur cet appareil (stockage plein). Exporte pour sécuriser', { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
});

/* =============== Notifications push ===============
   Sans elles, on n’apprend qu’en ouvrant l’app qu’un ami a réagi : le fil social reste muet.
   Opt-in explicite (le navigateur exige un geste utilisateur), désactivable à tout moment. */
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function urlB64ToBytes(b64){
  const s = (b64+'='.repeat((4-b64.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
  return a;
}
async function pushState(){
  if(!pushSupported()) return 'unsupported';
  if(Notification.permission==='denied') return 'denied';
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    if(!reg) return 'off';
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  }catch(_){ return 'off'; }
}
async function enablePush(){
  if(!pushSupported()){ toast('Ton navigateur ne gère pas les notifications'); return false; }
  const perm = await Notification.requestPermission();
  if(perm!=='granted'){ toast(perm==='denied' ? 'Notifications refusées : à réautoriser dans les réglages du navigateur' : 'Notifications non activées'); return false; }
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('/api/push/key');
  if(!key){ toast('Notifications indisponibles pour le moment'); return false; }
  let sub = await reg.pushManager.getSubscription();
  if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlB64ToBytes(key) });
  const j = sub.toJSON();
  await api('/api/push/subscribe', {method:'POST', body:{ endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }});
  return true;
}
async function disablePush(){
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if(sub){ await api('/api/push/unsubscribe', {method:'POST', body:{ endpoint: sub.endpoint }}); await sub.unsubscribe(); }
    else await api('/api/push/unsubscribe', {method:'POST', body:{}});
  }catch(_){ }
}

/* =============== Page publique /@pseudo ===============
   Lisible sans compte : c’est le lien qu’on met dans une bio. Elle n’affiche QUE ce que le
   serveur accepte de rendre public (opt-in + mode de partage) — le front ne décide rien. */
function publicBookSlugFromURL(){
  const m = location.pathname.match(/^\/livre\/([a-z0-9-]{8,120})$/i);
  return m ? m[1].toLowerCase() : '';
}
function publicUsernameFromURL(){
  const m = location.pathname.match(/^\/@([a-z0-9_.-]{3,20})$/i);
  if(m) return m[1].toLowerCase();
  const h = location.hash.match(/^#@([a-z0-9_.-]{3,20})$/i);   // repli si l’hébergeur ne route pas /@
  return h ? h[1].toLowerCase() : '';
}
let _ppUser = null, _ppPrevTitle = '';   // page publique /@pseudo affichée (pour re-peindre son appel à l’action)
async function showPublicProfile(uname){
  const host = $('#pubprofile'), body = $('#pp-body');
  host.hidden = false; document.body.style.overflow='hidden';
  if(!_ppPrevTitle) _ppPrevTitle = document.title;
  syncModalIsolation();
  body.innerHTML = `<div class="pp-empty">Chargement du profil…</div>`;
  let d;
  try{ d = await api('/api/public/'+encodeURIComponent(uname)); }
  catch(e){
    body.innerHTML = `<div class="pp-empty">
      <p>${e.message==='offline' ? 'Profil indisponible hors ligne.' : 'Ce profil n’existe pas ou n’est pas public.'}</p>
      <p style="margin-top:16px"><a class="btn primary" href="/">Découvrir Tome</a></p></div>`;
    return;
  }
  const u = d.user, st = d.stats||{}, shelf = d.shelf||[];
  const annee = u.since ? new Date(u.since).getFullYear() : '';
  const nBooks = Number(st.books)||0;   // compteur venu du serveur : écrit comme un nombre, jamais tel quel
  // Une liste de couvertures ne donne pas envie ; un livre défendu, si. On met en avant le mieux
  // noté — en préférant celui qui porte une critique, c’est ce qui fait la valeur d’un journal.
  const coeur = shelf.filter(b=>b.rating>=4.5).sort((a,b)=>
      ((b.review?1:0)-(a.review?1:0)) || (b.rating-a.rating))[0] || null;
  // Les « 4 favoris » (le rituel de profil hérité de Letterboxd) : les mieux notés après le
  // coup de cœur. Affichés seulement s’il y en a au moins 2 — une rangée d’un seul livre est triste.
  const favoris = shelf.filter(b=>b!==coeur && b.rating>=4)
      .sort((a,b)=>(b.rating-a.rating) || ((b.review?1:0)-(a.review?1:0))).slice(0,4);
  const horsFav = new Set([coeur, ...favoris]);
  const reste = shelf.filter(b=>!horsFav.has(b));
  document.title = `${u.displayName} · Tome`;
  body.innerHTML = `
    <header class="pp-head">
      <div class="pp-avatar">${avatarHTML(u.displayName)}</div>
      <h1 class="pp-name">${esc(u.displayName)}</h1>
      <div class="pp-user">@${esc(u.username)}</div>
      ${u.bio ? `<p class="pp-bio">${esc(u.bio)}</p>` : ''}
      <div class="pp-stats">
        <div class="pp-stat"><b>${nBooks}</b><span>livre${nBooks>1?'s':''}</span></div>
        ${st.avg!=null ? `<div class="pp-stat"><b>${esc(fmtDec(st.avg))} ★</b><span>note moyenne</span></div>` : ''}
        ${annee ? `<div class="pp-stat"><b>${annee}</b><span>sur Tome depuis</span></div>` : ''}
      </div>
    </header>
    ${coeur ? `<section class="pp-fav">
      <div class="pp-fav-cov">${coeur.cover ? `<img src="${esc(coeur.cover)}" alt=""${xorigin(coeur.cover)} referrerpolicy="no-referrer">` : ''}${phPubHTML(coeur)}</div>
      <div class="pp-fav-txt">
        <div class="pp-fav-kicker">${ic('star',14)} Son coup de cœur</div>
        <div class="pp-fav-title">${esc(coeur.title)}</div>
        ${coeur.authors ? `<div class="pp-fav-author">${esc(coeur.authors)}</div>` : ''}
        <div class="pp-fav-stars">${starsTxt(coeur.rating)}</div>
        ${coeur.review ? `<blockquote class="pp-fav-quote">« ${esc(coeur.review)} »</blockquote>` : ''}
      </div>
    </section>` : ''}
    ${favoris.length>=2 ? `<div class="pp-sec">Ses favoris</div>
      <div class="pp-favs">${favoris.map(b=>`<div class="pp-item">
        <div class="pp-cov">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy"${xorigin(b.cover)} referrerpolicy="no-referrer">` : ''}${phPubHTML(b)}</div>
        <div class="pp-t">${esc(b.title)}</div>
        <div class="pp-r">${starsTxt(b.rating)}</div>
      </div>`).join('')}</div>` : ''}
    ${reste.length ? `<div class="pp-sec">${(coeur||favoris.length>=2) ? 'Ses autres lectures' : 'Ses lectures'}</div>
      <div class="pp-grid">${reste.map(b=>`<div class="pp-item">
        <div class="pp-cov">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy"${xorigin(b.cover)} referrerpolicy="no-referrer">` : ''}${phPubHTML(b)}</div>
        <div class="pp-t">${esc(b.title)}</div>
        ${b.rating ? `<div class="pp-r">${starsTxt(b.rating)}</div>` : ''}
      </div>`).join('')}</div>` : `<div class="pp-empty">Cette personne n’a encore rien partagé.</div>`}
    <div style="text-align:center;margin-top:26px"><button type="button" class="linkish" data-pp-report="${esc(u.username)}" style="font-size:var(--fs-sm);color:var(--faint)">\u2690 Signaler ce profil</button></div>
    <section class="pp-cta" id="pp-cta"></section>`;
  const ppRep = body.querySelector('[data-pp-report]');
  if(ppRep) ppRep.addEventListener('click', ()=>reportContent('profile', ppRep.dataset.ppReport));
  _ppUser = u; paintPPCta();
}
// L’appel à l’action d’une page publique dépend de QUI regarde : un visiteur crée un compte, un
// membre connecté demande l’amitié, et le propriétaire de la page va régler son partage. Comme
// socRefresh répond après le premier rendu, ce bloc est peint à part et re-peint à l’arrivée
// de la session (voir l’appel dans le .then de socRefresh au démarrage).
function paintPPCta(){
  const box = $('#pp-cta'), u = _ppUser;
  if(!box || !u) return;
  const me = social.me;
  if(me && me.username===u.username){
    box.innerHTML = `<h3>C’est ta page</h3>
      <p>Elle est lisible par tout le monde, moteurs de recherche compris. Ce qu’elle montre dépend de ton mode de partage.</p>
      <div class="pp-cta-acts"><button type="button" class="btn primary lp-big" id="pp-share">Modifier mon partage</button></div>`;
    $('#pp-share').addEventListener('click', ()=>{ closePublicProfile(); social.view=null; social.tab='me'; selectView('friends'); });
    return;
  }
  if(me){
    box.innerHTML = `<h3>Vous lisez tous les deux</h3>
      <p>Ajoute ${esc(u.displayName)} en ami : ses lectures arriveront dans ton fil et vous pourrez comparer vos notes.</p>
      <div class="pp-cta-acts"><button type="button" class="btn primary lp-big" id="pp-add">Ajouter en ami</button>
        <button type="button" class="btn" id="pp-home">Retour à ma bibliothèque</button></div>`;
    const add = $('#pp-add');
    add.addEventListener('click', async ()=>{
      if(add.disabled) return; add.disabled = true;
      try{
        const r = await api('/api/friends/request', {method:'POST', body:{username:u.username}});
        toast(r.status==='accepted' ? 'Vous êtes maintenant amis ✓' : 'Demande envoyée ✓');
        add.textContent = r.status==='accepted' ? 'Vous êtes amis ✓' : 'Demande envoyée ✓';
        socRefresh();
      }catch(e){ add.disabled = false; toast(netMsg(e)); }
    });
    $('#pp-home').addEventListener('click', closePublicProfile);
    return;
  }
  box.innerHTML = `<h3>Et toi, tu lis quoi ?</h3>
    <p>Note tes livres, BD et manga, garde la trace de tes lectures et compare avec tes amis. Gratuit, sans publicité.</p>
    <a class="btn primary lp-big" href="/">Créer ma bibliothèque</a>`;
}
// Quitte la page publique d’un membre pour l’app qui tourne déjà derrière (le visiteur connecté
// est arrivé par /@pseudo : l’URL redevient la racine, sans rechargement).
function closePublicProfile(){
  const host = $('#pubprofile'); if(host) host.hidden = true;
  document.body.style.overflow = '';
  if(_ppPrevTitle){ document.title = _ppPrevTitle; _ppPrevTitle = ''; }
  _ppUser = null;
  try{ history.replaceState(history.state, '', '/' + location.hash); }catch(_){ }
  syncModalIsolation();
}

/* =============== Page publique /livre/<slug> ===============
   Le catalogue commun : la page d'un livre, lisible sans compte, avec ce que le serveur accepte
   de rendre public — statistiques anonymes (≥ 3 notes) et critiques des membres à page publique. */
async function showPublicBook(slug){
  const host = $('#pubprofile'), body = $('#pp-body');
  host.hidden = false; document.body.style.overflow='hidden';
  syncModalIsolation();
  body.innerHTML = `<div class="pp-empty">Chargement du livre…</div>`;
  let d;
  try{ d = await api('/api/book/'+encodeURIComponent(slug)); }
  catch(e){
    body.innerHTML = `<div class="pp-empty">
      <p>${e.message==='offline' ? 'Page indisponible hors ligne.' : 'Ce livre n’a pas encore de page publique.'}</p>
      <p style="margin-top:16px"><a class="btn primary" href="/">Découvrir Tome</a></p></div>`;
    return;
  }
  const b = d.book, st = d.stats||{}, reviews = d.reviews||[];
  if(b.slug && b.slug !== slug){ try{ history.replaceState(history.state, '', '/livre/' + b.slug); }catch(_){ } } // slug canonique
  const mine = state.books.find(x=>shelfKey(x)===b.key) || null;
  // Le catalogue commun est écrit par le PREMIER membre qui partage un livre, et cette écriture
  // reste : série, tome, année et pages sont donc des données d’autrui, à échapper morceau par
  // morceau (la ligne est injectée telle quelle plus bas). Une série « <img onerror=…> » s’exécutait
  // chez tout visiteur de la page, connecté ou non.
  const meta = [b.type==='bd' ? 'BD' : b.type==='manga' ? 'Manga' : 'Livre', b.series ? `${b.series}${b.volume!=null ? ' · tome '+b.volume : ''}` : '', b.year || '', b.pages ? `${b.pages} pages` : ''].filter(Boolean).map(esc).join(' · ');
  // Les compteurs viennent du serveur eux aussi : on ne les écrit que comme des nombres.
  const nReaders = Number(st.readers)||0, nRated = Number(st.rated)||0;
  const stars = st.avg!=null ? `<b>${esc(fmtDec(st.avg))} ★</b><span>note moyenne · ${nRated} avis</span>` : `<b>${nReaders}</b><span>lecteur${nReaders>1?'s':''} public${nReaders>1?'s':''}</span>`;
  document.title = `${b.title}${b.authors ? ', ' + b.authors : ''} · Tome`;
  // Ouverte depuis la fiche (« Page du livre ») : le livre est forcément dans la bibliothèque
  // locale — on propose d’y revenir, jamais de créer un compte ni de repartir de zéro.
  const cta = (_pubReturn!=null && mine)
    ? `<button class="btn primary lp-big" data-pb-mine="${esc(mine.id)}">← Revenir à ma fiche</button>`
    : social.me
    ? (mine ? `<button class="btn primary lp-big" data-pb-mine="${esc(mine.id)}">Ma fiche</button>`
            : `<button class="btn primary lp-big" data-pb-add>Ajouter à ma pile</button>`)
    : `<a class="btn primary lp-big" href="/">Créer ma bibliothèque</a><a class="btn lp-big" href="/" data-pb-try>Essayer sans compte</a>`;
  body.innerHTML = `
    <header class="pp-head pb-head">
      <div class="pp-fav-cov pb-cov">${b.cover ? `<img src="${esc(b.cover)}" alt=""${xorigin(b.cover)} referrerpolicy="no-referrer">` : phPubHTML(b)}</div>
      <div class="pb-txt">
        <div class="pp-fav-kicker">${meta || 'Livre'}</div>
        <h1 class="pp-name">${esc(b.title)}</h1>
        ${b.authors ? `<div class="pp-user">${esc(b.authors)}</div>` : ''}
        <div class="pp-stats"><div class="pp-stat">${stars}</div>${st.avg==null && nReaders ? `<div class="pp-stat"><b>${nRated}</b><span>note${nRated>1?'s':''}, moyenne dès 3</span></div>` : ''}</div>
        <div class="pb-actions">${cta}<button class="btn" data-pb-share>Partager la page</button></div>
      </div>
    </header>
    ${b.synopsis ? `<div class="pp-sec">Résumé</div><p class="pb-synopsis">${esc(b.synopsis)}</p>${b.source==='openlibrary' ? `<p class="pb-source">Résumé : <a href="https://openlibrary.org/isbn/${esc(b.isbn||'')}" target="_blank" rel="noopener">Open Library</a></p>` : b.source==='googlebooks' ? `<p class="pb-source">Résumé : <a href="https://books.google.com/books?vid=ISBN${esc(b.isbn||'')}" target="_blank" rel="noopener">Google Books</a></p>` : ''}` : ''}
    <div class="pp-sec">${reviews.length ? `Avis des lecteurs` : 'Avis'}</div>
    ${reviews.length ? `<div class="pb-reviews">${reviews.map(r=>`<article class="pb-review">
        <div class="pb-review-head">${avatarHTML(r.displayName,'sm')}<a class="pb-review-who" href="/@${esc(r.username)}"><b>${esc(r.displayName)}</b> <span>@${esc(r.username)}</span></a>
          ${r.rating ? `<span class="pb-review-stars">${starsTxt(r.rating)}</span>` : ''}${r.readDate ? `<time class="pb-review-when">${esc(r.readDate.slice(0,4))}</time>` : ''}</div>
        <p class="pb-review-txt">${esc(r.review)}</p>
        <button type="button" class="linkish pb-report" data-pb-report="${esc(r.username)}|${esc(b.key)}">\u2690 Signaler</button>
      </article>`).join('')}</div>`
      : `<div class="pp-empty">Pas encore d’avis public. Les membres qui publient leur page font vivre celle-ci.</div>`}
    <section class="pp-cta">
      <h3>Et toi, tu l’as lu ?</h3>
      <p>Note-le, écris ce que tu en penses, et retrouve tes amis lecteurs. Gratuit, sans publicité.</p>
      ${social.me || _pubReturn!=null ? '' : `<a class="btn primary lp-big" href="/">Créer ma bibliothèque</a>`}
    </section>`;
  body.onclick = async e=>{
    const share = e.target.closest('[data-pb-share]');
    if(share){ const url = location.origin + '/livre/' + b.slug; if(navigator.share){ try{ await navigator.share({ title:b.title, url }); return; }catch(_){ } }
      try{ await navigator.clipboard.writeText(url); toast('Lien de la page copié ✓'); }catch(_){ } return; }
    const rep = e.target.closest('[data-pb-report]');
    if(rep){ reportContent('review', rep.dataset.pbReport); return; }
    const add = e.target.closest('[data-pb-add]');
    if(add){
      const nb = normalizeBook({ title:b.title, authors:String(b.authors||'').split(',').map(x=>x.trim()).filter(Boolean), type:b.type||'livre',
        series:b.series||'', volume:b.volume??null, cover:b.cover||'', isbn:b.isbn||'', synopsis:b.synopsis||'', year:b.year||null, pages:b.pages||null, status:'wishlist', tags:[], review:'', readings:[] });
      state.books.unshift(nb); save(); render();
      toast(`« ${b.title} » ajouté à ta pile ✓`);
      add.outerHTML = `<button class="btn primary lp-big" data-pb-mine="${esc(nb.id)}">Ma fiche</button>`;
      return;
    }
    const mineBtn = e.target.closest('[data-pb-mine]');
    if(mineBtn){
      // ouverte par-dessus l’app : on repasse par closePublicBook, qui rend son niveau
      // d’historique — sinon un Retour serait avalé par une entrée devenue fantôme.
      if(_pubReturn!=null){ closePublicBook(false, mineBtn.dataset.pbMine); return; }
      host.hidden = true; document.body.style.overflow=''; syncModalIsolation(); try{ history.replaceState(history.state,'','/'); }catch(_){ } openDetail(mineBtn.dataset.pbMine); return;
    }
    const tryBtn = e.target.closest('[data-pb-try]');
    if(tryBtn){ e.preventDefault(); host.hidden = true; document.body.style.overflow=''; syncModalIsolation(); try{ history.replaceState(history.state,'','/'); }catch(_){ } try{ localStorage.setItem('tome-welcomed','1'); }catch(_){ } if(!state.books.length) startDemo(); selectView('today'); }
  };
}

/* =============== Notation rapide ===============
   Une bibliothèque remplie rétrospectivement arrive souvent SANS notes (constaté chez le premier
   utilisateur réel : 41 livres lus, 0 note) — or les notes nourrissent les stats, le récap, le fil
   et les recommandations. On enchaîne donc les lectures non notées, une carte à la fois. */
function unratedBooks(){
  return state.books.filter(b => !b.rating && (b.status==='read' || (b.readings||[]).length))
                    .sort((a,b)=> (lastReadDate(b)||'').localeCompare(lastReadDate(a)||''));  // les plus récentes d’abord
}
function lastReadDate(b){ return (b.readings||[]).map(r=>r.date).filter(Boolean).sort().pop() || ''; }
let _qrQueue = [], _qrDone = 0, _qrTotal = 0;
// Pile des gestes de la session (note posée, ou titre passé) : « Précédent » remet le titre en
// tête de file et, s’il avait été noté, restaure sa note et celles de ses lectures — une étoile
// touchée par erreur ne coûte plus un détour par la fiche. _qrFeedback : le feedback « enregistré »
// avant d’enchaîner ; tant qu’il court, un second toucher ne doit pas noter le titre suivant.
let _qrHistory = [], _qrFeedback = 0;
function openQuickRate(){
  _qrQueue = unratedBooks().map(b=>b.id); _qrDone = 0; _qrTotal = _qrQueue.length;
  _qrHistory = []; clearTimeout(_qrFeedback); _qrFeedback = 0;
  if(!_qrTotal){ toast('Tout est déjà noté ✓'); return; }
  renderQuickRate(); openOverlay('#ov-rate');
}
// L’aide sous les étoiles parlait de « toucher » à tout le monde : au clavier, on ajuste aux
// flèches et on valide à Entrée ; au doigt (et à la souris), on touche, ou l’on glisse pour la
// demi-étoile — plus de « moitié gauche » à viser.
function qrHintTxt(){
  return matchMedia('(pointer:coarse)').matches
    ? 'Touche une étoile, ou glisse pour ajuster'
    : 'Clique ou glisse sur les étoiles, ou ← → puis Entrée';
}
const qrPrevBtn = () => `<button class="btn" id="qr-prev"${_qrHistory.length ? '' : ' disabled'}>← Précédent</button>`;
function renderQuickRate(){
  const el = $('#rate-body'); if(!el) return;
  while(_qrQueue.length && !state.books.some(x=>x.id===_qrQueue[0])) _qrQueue.shift(); // livres disparus entre-temps
  const b = state.books.find(x=>x.id===_qrQueue[0]);
  if(!b){                                            // file épuisée
    const reste = unratedBooks().length;
    el.innerHTML = `<div class="qr-done"><div class="big orn" aria-hidden="true">❦</div>
      <h4>${_qrDone ? `${plur(_qrDone,'lecture notée','lectures notées')}` : 'C’est tout pour l’instant'}</h4>
      <p>${_qrDone ? 'Tes stats, ton récap et ton fil viennent de gagner en relief.' : 'Reviens quand tu auras terminé un livre.'}${reste?` Il reste ${plur(reste,'titre')} à noter plus tard.`:''}</p>
      <div class="qr-actions">${_qrHistory.length ? qrPrevBtn() : ''}<button class="btn primary" data-close>Terminer</button></div></div>`;
    return;
  }
  const when = lastReadDate(b);
  const r = b.rating || 0;   // déjà notée (sur la fiche ouverte par-dessus) : étoiles pleines, pas vides
  el.innerHTML = `
    <div class="qr-prog"><div class="qr-bar"><i style="width:${Math.round(_qrDone/_qrTotal*100)}%"></i></div>
      <span class="qr-count">${_qrDone} / ${_qrTotal}</span></div>
    <div class="qr-card">
      <div class="qr-cover">${b.cover ? `<img src="${esc(b.cover)}" alt=""${xorigin(b.cover)} referrerpolicy="no-referrer">` : ''}${phHTML(b)}</div>
      <div class="qr-title">${esc(fullTitle(b))}</div>
      <div class="qr-author">${esc(authorsStr(b))}</div>
      ${when ? `<div class="qr-when">lu le ${fmtDate(when)}</div>` : ''}
      <div class="star-input qr-stars" id="qr-stars" tabindex="0" role="slider" aria-label="Ma note"
           aria-valuemin="0" aria-valuemax="5" aria-valuenow="${r}" aria-valuetext="${ratingText(r)}">${starInputHTML(r)}</div>
      <div class="qr-hint">${r ? `Déjà notée ${starsTxt(r)}. Modifie la note ou passe au titre suivant` : qrHintTxt()}</div>
      <div class="qr-actions">
        ${qrPrevBtn()}
        <button class="btn" id="qr-skip">Passer</button>
        <button class="btn" id="qr-open">Ouvrir la fiche</button>
        <button class="btn" data-close>Fermer</button>
      </div>
    </div>`;
  // Le clavier doit retrouver les étoiles à chaque carte (l’ancien nœud est parti avec le rendu)
  // et dès l’ouverture, plutôt que le ✕ de l’en-tête : sinon l’aide « ← → puis Entrée » ment.
  // Microtâche : à l’ouverture, la modale n’est .open qu’après ce rendu (cf. openQuickRate).
  queueMicrotask(()=>{ const s = $('#qr-stars'); if(s && $('#ov-rate').classList.contains('open')) s.focus({preventScroll:true}); });
}
function qrAdvance(){ clearTimeout(_qrFeedback); _qrFeedback = 0; _qrQueue.shift(); renderQuickRate(); }
// Pose la note depuis la file : l’état d’avant (note du livre ET de ses lectures, que
// syncReadingRatings va aligner) part dans la pile pour « Précédent ».
function qrRate(b, v){
  _qrHistory.push({id:b.id, prev:b.rating, prevRs:(b.readings||[]).map(r=>r.rating)});
  const prev = b.rating; b.rating = v;
  syncReadingRatings(b, prev);   // les notes de lecture suivent : le Journal reste cohérent avec la fiche
  save(); _qrDone++;
}
// « Précédent » : le dernier titre revient en tête de file ; s’il avait été noté (et non passé),
// sa note et le compteur reviennent aussi. Pendant le feedback « enregistré », c’est ce titre-là
// qu’on annule — il est encore affiché, on coupe simplement l’enchaînement programmé.
function qrUndo(){
  const h = _qrHistory.pop(); if(!h) return;
  clearTimeout(_qrFeedback); _qrFeedback = 0;
  const bb = state.books.find(x=>x.id===h.id);
  if(bb && !h.skip){
    bb.rating = h.prev;
    (bb.readings||[]).forEach((r,i)=>{ r.rating = h.prevRs[i] ?? null; });
    save(); _qrDone = Math.max(0, _qrDone-1);
  }
  _qrQueue = [h.id, ..._qrQueue.filter(id=>id!==h.id)];   // en tête, sans doublon
  renderQuickRate(); scheduleRender();
}
$('#rate-body').addEventListener('click', e=>{
  if(e.target.closest('#qr-prev')){ qrUndo(); return; }
  if(_qrFeedback) return;   // feedback d’une note en cours : on laisse la carte s’enchaîner
  const b = state.books.find(x=>x.id===_qrQueue[0]);
  const st = e.target.closest('#qr-stars .st');
  if(st && b){
    const n = +st.dataset.n;
    qrCommit(b, halfFromClick(st, e.clientX) ? n-0.5 : n);
    return;
  }
  if(e.target.closest('#qr-skip')){ if(b) _qrHistory.push({id:b.id, skip:true}); qrAdvance(); return; }
  if(e.target.closest('#qr-open') && b){ openDetail(b.id); return; }
});
// Note posée au toucher ou au glissé : feedback « enregistré » puis enchaînement sur le suivant.
function qrCommit(b, v){
  qrRate(b, v);
  $('#qr-stars').innerHTML = starInputHTML(b.rating);          // feedback avant d’enchaîner
  $('#rate-body').querySelector('.qr-hint').textContent = `${starsTxt(b.rating)}, enregistré ✓`;
  _qrFeedback = setTimeout(()=>{ qrAdvance(); scheduleRender(); }, 420);
}
bindStarSlider($('#rate-body'), '#qr-stars', (host, v) => {
  if(_qrFeedback) return;
  const b = state.books.find(x=>x.id===_qrQueue[0]); if(b) qrCommit(b, v);
});
// clavier : ← → ↑ ↓ pour choisir (Home efface, End met 5), Entrée pour valider et enchaîner
$('#rate-body').addEventListener('keydown', e=>{
  const host = e.target.closest && e.target.closest('#qr-stars'); if(!host) return;
  const b = state.books.find(x=>x.id===_qrQueue[0]); if(!b || _qrFeedback) return;
  let v = +host.getAttribute('aria-valuenow') || 0;
  if(e.key==='Enter'){ if(!v) return; e.preventDefault(); qrRate(b, v); qrAdvance(); scheduleRender(); return; }
  const nv = sliderKeyValue(e.key, v); if(nv===undefined) return;
  e.preventDefault(); v = nv || 0;   // ici 0 = « pas encore choisi », pas une note effacée
  host.setAttribute('aria-valuenow', v); host.setAttribute('aria-valuetext', ratingText(v));
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
// Aperçu + partage d’une carte générée. Sur mobile, navigator.share({files}) ouvre la feuille
// native (Instagram, WhatsApp…) — LE canal viral ; sinon repli sur le téléchargement.
const SITE_URL = 'https://montome.fr';
let _cardUrl = ''; // blob-URL de l’aperçu courant, révoquée à la génération suivante
// Une carte à la fois : polices, couverture et canvas prennent plusieurs secondes sur mobile,
// et sans retour visible un second tap relançait tout (deux aperçus empilés). Le bouton
// déclencheur reste grisé jusqu’à l’aperçu ou l’échec ; garde-fou de 30 s si la couverture ne
// répond jamais (ni onload ni onerror), pour ne pas laisser le bouton mort.
const CARD_WAIT_MSG = 'Préparation de la carte…';
let _cardBtn = null, _cardBusy = false, _cardWatch = 0;
function beginCard(btn){
  if(_cardBusy) return false;
  _cardBusy = true; _cardBtn = btn || null;
  if(btn){ btn.disabled = true; btn.setAttribute('aria-busy','true'); }
  toast(CARD_WAIT_MSG, {ms:10000});
  _cardWatch = setTimeout(endCard, 30000);
  return true;
}
function endCard(){
  clearTimeout(_cardWatch); _cardWatch = 0;
  const btn = _cardBtn; _cardBtn = null; _cardBusy = false;
  if(btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); }
}
function presentCard(cv, filename, shareText){
  cv.toBlob(blob=>{
    if(!blob){ endCard(); toast('Génération impossible'); return; }
    if(_cardUrl){ try{ URL.revokeObjectURL(_cardUrl); }catch(_){ } }
    _cardUrl = URL.createObjectURL(blob);
    // aperçu en data: (la CSP img-src autorise data: mais pas blob:) ; le blob sert au partage/téléchargement
    const dataUrl = cv.toDataURL('image/png');
    const file = new File([blob], filename, {type:'image/png'});
    const canNative = !!(navigator.canShare && navigator.canShare({files:[file]}));
    $('#card-body').innerHTML = `
      <img class="card-preview" src="${dataUrl}" alt="Aperçu de la carte">
      <div class="card-actions">
        ${canNative ? `<button class="btn primary" id="card-share">${ic('share',16)} Partager</button>` : ''}
        <button class="btn ${canNative?'':'primary'}" id="card-dl">${ic('download',16)} Télécharger</button>
      </div>
      <p class="card-hint">En story, en message… l’adresse de Tome est sur l’image </p>`;
    if(canNative) $('#card-share').addEventListener('click', async ()=>{
      try{ await navigator.share({ files:[file], title:'Tome', text:shareText }); }catch(_){ /* partage annulé */ }
    });
    $('#card-dl').addEventListener('click', ()=>{
      const a = document.createElement('a'); a.href = _cardUrl; a.download = filename; a.click();
      toast('Carte téléchargée ✓');
    });
    endCard(); hideToast(CARD_WAIT_MSG); // l’aperçu remplace l’état d’attente
    openCard(); // par-dessus la modale ouverte (rétro/détail), sans la fermer
  }, 'image/png');
}
// Le canvas ne rend une police QUE si elle est déjà chargée : on précharge les graisses
// utilisées par les cartes avant de tracer (sinon repli serif système silencieux).
// Tramage ordonne (matrice de Bayer 4x4, 5 niveaux/canal, point visible x2) : donne aux
// couvertures des cartes de partage une texture d’impression \u00AB riso \u00BB. Echoue en silence
// si le canvas est souille (couverture sans CORS) : la carte reste nette, jamais cassee.
function ditherRegion(ctx, x, y, w, h, r){
  try{
    const f=2, tw=Math.max(1,Math.round(w/f)), th=Math.max(1,Math.round(h/f));
    const t=document.createElement('canvas'); t.width=tw; t.height=th;
    const tc=t.getContext('2d');
    tc.drawImage(ctx.canvas, x, y, w, h, 0, 0, tw, th);
    const id=tc.getImageData(0,0,tw,th), d=id.data;
    const M=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]], L=6;
    for(let py=0; py<th; py++) for(let px=0; px<tw; px++){
      const i=(py*tw+px)*4, thr=(M[py&3][px&3]+0.5)/16;
      for(let c=0;c<3;c++){
        const q=Math.min(L-1, Math.floor(d[i+c]/255*(L-1)+thr));
        d[i+c]=Math.round(q*255/(L-1));
      }
    }
    tc.putImageData(id,0,0);
    ctx.save();
    if(ctx.roundRect && r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.clip(); }
    ctx.imageSmoothingEnabled=false;
    ctx.globalAlpha=.5;                       // fondu : texture d’impression, pas un damier
    ctx.drawImage(t, 0,0,tw,th, x,y,w,h);
    ctx.restore();
  }catch(_){ }
}
// Mesure première partie des clics sortants (agrégat jour\u00d7type, aucun identifiant —
// exempt de consentement). sendBeacon : jamais bloquant pour la navigation.
document.addEventListener('click', e => {
  // data-buy : seuls les deux liens marchands sont mesurés. Avant, TOUT a.btn.buy comptait —
  // « Page du livre », qui reste sur Tome, était enregistré comme un clic Kindle.
  const buy = e.target.closest && e.target.closest('a.btn.buy[data-buy]');
  if(!buy) return;
  try{
    const kind = buy.dataset.buy === 'amazon' ? 'amazon' : 'kindle';
    const blob = new Blob([JSON.stringify({ kind })], { type:'application/json' });
    navigator.sendBeacon(API_BASE + '/api/out', blob);
  }catch(_){ }
});

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-reco]');
  if(t){ e.preventDefault(); recommendBook(t.dataset.reco); }
});

// Afficher / masquer un mot de passe. Délégué sur document : les formulaires (auth, récupération,
// compte) sont re-rendus par innerHTML, un écouteur posé sur chaque bouton serait perdu à chaque
// fois. Le champ reprend systématiquement type=password quand le formulaire est reconstruit.
document.addEventListener('click', e => {
  const eye = e.target.closest && e.target.closest('.pw-eye');
  if(!eye) return;
  const inp = eye.parentElement && eye.parentElement.querySelector('input');
  if(!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  eye.textContent = show ? 'Masquer' : 'Afficher';
  eye.setAttribute('aria-pressed', String(show));
  // le nom du champ est porté par le bouton : trois « Afficher » sur l'écran Compte seraient
  // indiscernables au lecteur d'écran
  eye.setAttribute('aria-label', (show ? 'Masquer ' : 'Afficher ') + (eye.dataset.pwNoun || 'le mot de passe'));
});

async function ensureCardFonts(){
  if(!(document.fonts && document.fonts.load)) return;
  try{ await Promise.all([
    document.fonts.load("600 46px 'Alegreya'"), document.fonts.load("700 46px 'Alegreya'"),
    document.fonts.load("700 128px 'Alegreya'"), document.fonts.load("700 165px 'Alegreya'"),
    document.fonts.load("italic 400 26px 'Alegreya'"),
  ]); }catch(_){ }
}
function drawCard(b, coverImg){
  const W = 1000, H = 1250;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#1e1810'); g.addColorStop(1,'#0f0b07');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const cw = 340, ch = 510, cx = (W-cw)/2, cy = 90;
  ctx.save();
  if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,16); ctx.clip(); }
  if(coverImg){ ctx.drawImage(coverImg, cx, cy, cw, ch); }
  else{
    ctx.fillStyle = phInk(b); ctx.fillRect(cx,cy,cw,ch); // même encre que le placeholder HTML
    ctx.fillStyle = '#ece3d1'; ctx.textAlign = 'center';
    ctx.font = 'bold 26px system-ui, sans-serif';
    wrapText(ctx, fullTitle(b), cx+cw/2, cy+ch/2-20, cw-60, 34, 4);
  }
  ctx.restore();
  if(coverImg) ditherRegion(ctx, cx, cy, cw, ch, 16);
  if(ctx.roundRect){ ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,16); ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ece3d1'; ctx.font = '600 46px "Alegreya", Georgia, serif';
  let y = wrapText(ctx, fullTitle(b), W/2, cy+ch+84, W-160, 56, 2);
  ctx.font = '28px system-ui, sans-serif'; ctx.fillStyle = '#a2977e';
  y = wrapText(ctx, authorsStr(b), W/2, y+4, W-200, 36, 1);
  if(b.rating){
    ctx.font = '44px system-ui, sans-serif'; ctx.fillStyle = '#cba351';
    ctx.fillText(starsTxt(b.rating), W/2, y+30); y += 74;
  }
  if(b.review){
    ctx.font = 'italic 400 26px "Alegreya", Georgia, serif'; ctx.fillStyle = '#c7bda6';
    y = wrapText(ctx, '« '+b.review+' »', W/2, y+26, W-200, 38, 5);
  }
  ctx.font = '700 34px "Alegreya", Georgia, serif'; ctx.fillStyle = '#cba351';
  ctx.fillText('Tome.', W/2, H-88);
  ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#c9b892';
  ctx.fillText('montome.fr', W/2, H-52);
  const lastR = (b.readings||[]).slice().sort((a,c)=>c.date.localeCompare(a.date))[0];
  if(lastR){
    ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#7c7360';
    ctx.fillText('lu le '+fmtDate(lastR.date), W/2, H-20);
  }
  return cv;
}
async function shareCard(b){
  if(!beginCard($('#d-card'))) return;
  await ensureCardFonts();
  const generate = (img)=>{
    try{
      const cv = drawCard(b, img);
      const slug = (b.title||'carte').toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,40)||'carte';
      presentCard(cv, `tome-${slug}.png`, `« ${fullTitle(b)} », mon avis sur Tome · ${SITE_URL}`);
    }catch(e){
      // canvas « souillé » (couverture sans CORS) → on regénère sans l’image
      if(img) generate(null);
      else{ endCard(); toast('Génération impossible'); }
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
  g.addColorStop(0,'#241d12'); g.addColorStop(.5,'#17110a'); g.addColorStop(1,'#0e0b06');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const halo = ctx.createRadialGradient(W*0.28,150,30,W*0.28,150,560);
  halo.addColorStop(0,'rgba(203,163,81,.18)'); halo.addColorStop(1,'rgba(203,163,81,0)');
  ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);
  const PAD=88; ctx.textAlign='left';
  ctx.fillStyle='#a2977e'; ctx.font='600 32px system-ui'; ctx.fillText('MA RÉTRO LECTURE', PAD, 128);
  ctx.fillStyle='#ece3d1'; ctx.font='700 165px "Alegreya", Georgia, serif'; ctx.fillText(String(r.year), PAD, 300);
  const hY=430;
  ctx.fillStyle='#cba351'; ctx.font='700 128px "Alegreya", Georgia, serif'; ctx.fillText(String(r.count), PAD, hY);
  ctx.fillStyle='#a2977e'; ctx.font='600 32px system-ui'; ctx.fillText(r.count>1?'lectures':'lecture', PAD, hY+44);
  const c2=W*0.52; ctx.fillStyle='#ece3d1'; ctx.font='700 128px "Alegreya", Georgia, serif';
  ctx.fillText(r.pages?r.pages.toLocaleString('fr-FR'):'—', c2, hY);
  ctx.fillStyle='#a2977e'; ctx.font='600 32px system-ui'; ctx.fillText('pages lues', c2, hY+44);
  let y=560;
  if(r.best){
    const cw=170, ch=255, cx=PAD, cy=y; ctx.save();
    if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,14); ctx.clip(); }
    if(coverImg) ctx.drawImage(coverImg, cx, cy, cw, ch);
    else{ const hu={livre:205,bd:28,manga:340}[r.best.type]??150; const pg=ctx.createLinearGradient(cx,cy,cx+cw,cy+ch); pg.addColorStop(0,`hsl(${hu},32%,26%)`); pg.addColorStop(1,`hsl(${hu},38%,13%)`); ctx.fillStyle=pg; ctx.fillRect(cx,cy,cw,ch); }
    ctx.restore();
    if(coverImg) ditherRegion(ctx, cx, cy, cw, ch, 14);
    const tx=cx+cw+40;
    ctx.fillStyle='#cba351'; ctx.font='700 26px system-ui'; ctx.fillText('COUP DE CŒUR', tx, cy+42);
    ctx.fillStyle='#ece3d1'; ctx.font='600 44px "Alegreya", Georgia, serif'; const aT=wrapText(ctx, fullTitle(r.best), tx, cy+100, W-PAD-tx, 50, 2);
    ctx.fillStyle='#a2977e'; ctx.font='28px system-ui'; const aA=wrapText(ctx, authorsStr(r.best), tx, aT+6, W-PAD-tx, 34, 1);
    ctx.fillStyle='#cba351'; ctx.font='36px system-ui'; ctx.fillText(starsTxt(r.best.rating), tx, aA+34);
    y=cy+ch+76;
  }
  const rows=[];
  if(r.topAuthor) rows.push(['Plume de l’année', r.topAuthor[0]]);
  if(r.topTag) rows.push(['Genre phare', r.topTag[0]]);
  if(r.avg) rows.push(['Note moyenne', r.avg.toFixed(1).replace('.',',')+' ★']);
  if(r.readingDays) rows.push(['Jours de lecture', r.readingDays+' j']);
  for(const [lbl,val] of rows.slice(0,3)){ // 3 max : le graphique et le pied de carte doivent tenir
    ctx.textAlign='left'; ctx.fillStyle='#a2977e'; ctx.font='500 30px system-ui'; ctx.fillText(lbl, PAD, y);
    ctx.textAlign='right'; ctx.fillStyle='#ece3d1'; ctx.font='700 32px system-ui';
    let v=String(val); while(ctx.measureText(v).width>W-2*PAD-300 && v.length>1) v=v.slice(0,-1);
    ctx.fillText(v===String(val)?v:v+'…', W-PAD, y); y+=36;
    ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(PAD,y); ctx.lineTo(W-PAD,y); ctx.stroke(); y+=26;
  }
  // rythme mensuel ancré au-dessus du pied de carte, hauteur adaptée à la place restante :
  // impossible de déborder sur « Tome. » + URL quel que soit le contenu au-dessus
  ctx.textAlign='left'; y+=16;
  ctx.fillStyle='#a2977e'; ctx.font='600 28px system-ui'; ctx.fillText('RYTHME MOIS PAR MOIS', PAD, y);
  const barsTop = y+22, maxBarH = Math.max(60, Math.min(150, (H-176)-barsTop)), base = barsTop+maxBarH;
  const bm=r.byMonth||Array(12).fill(0), bmax=Math.max(...bm,1), cW=W-2*PAD, gap=14, bw=(cW-gap*11)/12;
  for(let i=0;i<12;i++){
    const bh=Math.max(bm[i]/bmax*maxBarH, bm[i]?6:2), bx=PAD+i*(bw+gap);
    ctx.fillStyle=bm[i]?'#cba351':'#2a2418';
    if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(bx, base-bh, bw, bh, 5); ctx.fill(); } else ctx.fillRect(bx, base-bh, bw, bh);
    ctx.fillStyle='#7c7360'; ctx.font='22px system-ui'; ctx.textAlign='center'; ctx.fillText(MONTHS_MINI[i], bx+bw/2, base+32);
  }
  ctx.textAlign='center'; ctx.fillStyle='#cba351'; ctx.font='700 44px "Alegreya", Georgia, serif'; ctx.fillText('Tome.', W/2, H-84);
  ctx.fillStyle='#c9b892'; ctx.font='26px system-ui'; ctx.fillText('montome.fr', W/2, H-40);
  return cv;
}
async function shareYearCard(year){
  const r = yearRecap(year);
  if(!r.count){ toast('Rien à mettre sur la carte pour cette année'); return; }
  if(!beginCard($('#recap-share'))) return;
  await ensureCardFonts();
  const generate = (img)=>{
    try{
      presentCard(drawYearCard(year, img), `tome-retro-${year}.png`, `Ma rétro lecture ${year} · ${SITE_URL}`);
    }catch(e){ if(img) generate(null); else{ endCard(); toast('Génération impossible'); } }
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
// Une modale ouverte pousse une entrée d’historique : le bouton Retour (matériel Android,
// geste iOS, ou de la souris) ferme la modale au lieu de quitter l’application.
// Chaque couche qui s’empile par-dessus (dialogue uiConfirm/uiPrompt, lightbox de couverture,
// carte à partager) pousse SA propre entrée : Retour ferme le bon niveau, la fiche reste ouverte.
// _overlayDepth = hauteur de la pile ; chaque couche mémorise le niveau qu’elle occupe
// (_dlgDepth, _coverDepth, _cardDepth — 0 = pas d’entrée).
let _overlayDepth = 0;
// Vrai pendant que la garde « abandonner les modifications ? » attend une réponse après un
// Retour : l’entrée d’historique a été repoussée, aucun autre écouteur ne doit réagir au popstate.
let _editGuardBusy = false;
// Après un rechargement, l’entrée courante porte encore le marqueur de la modale ouverte avant :
// on l’efface (aucune modale n’est ouverte au chargement), sinon Retour croirait descendre
// dans une pile qui n’existe pas et laisserait la première fiche ouverte.
try{ if((history.state||{}).tomeOverlay){ const s={...history.state}; delete s.tomeOverlay; history.replaceState(s, ''); } }catch(_){ }
// Les entrées rendues sont mises en attente, puis rendues EN UN SEUL history.go(-n) au tour
// suivant. Deux history.back() enchaînés dans le même tour (dialogue fermé PUIS modale fermée
// dans la foulée, cf. #d-delete) ne sont pas fiables : le navigateur résout les deux deltas
// depuis la même position et n’en applique qu’un, laissant une entrée fantôme.
let _histDebt = 0, _histTimer = 0;
function scheduleHistoryPop(n){
  _histDebt += n;
  if(_histTimer) return;
  _histTimer = setTimeout(()=>{
    _histTimer = 0;
    const d = _histDebt; _histDebt = 0;
    if(d > 0) try{ history.go(-d); }catch(_){ }
  }, 0);
}
// Renvoie le niveau occupé, 0 si le navigateur a refusé l’entrée (quota Safari) : la pile
// logique ne doit alors pas compter une entrée que le navigateur n’a pas.
function pushOverlayHistory(){
  // Une entrée vient d’être rendue mais pas encore consommée et une couche la remplace tout de
  // suite (showRecoveryCode qui se réaffiche en boucle, modale → dialogue) : on la reprend telle
  // quelle — elle porte déjà le bon marqueur. Sans cela, back() puis pushState se marchent dessus
  // et l’historique enfle d’une entrée à chaque tour de boucle.
  if(_histDebt > 0){ _histDebt--; return ++_overlayDepth; }
  try{ history.pushState({ tomeOverlay: _overlayDepth+1 }, ''); }catch(_){ return 0; }
  return ++_overlayDepth;
}
// Rend l’entrée d’une couche que l’utilisateur ferme lui-même (✕, Échap, clic-fond, bouton) :
// même état d’historique qu’un Retour, donc pas d’entrée fantôme. Seulement si la couche est au
// sommet de la pile — fermée en cascade sous une autre, son niveau sera simplement sauté.
function popOverlayHistory(depth){
  if(!depth || depth !== _overlayDepth) return;
  _overlayDepth--;
  scheduleHistoryPop(1);
}
window.addEventListener('popstate', e=>{
  const target = (e.state||{}).tomeOverlay || 0;
  if(target >= _overlayDepth) return; // Suivant, ou entrée qui n’est pas à nous : rien à fermer
  // Retour alors que le formulaire d’édition a une saisie non enregistrée : on REPOUSSE tout de
  // suite l’entrée que le navigateur vient de consommer (on reste donc à la même place), puis on
  // demande. Repousser d’abord, plutôt qu’après la réponse, évite de croiser le va-et-vient
  // d’historique du dialogue lui-même. Refus = rien à faire ; accord = fermeture normale.
  if($('#ov-edit').classList.contains('open') && !$('#ov-dialog').classList.contains('open')
     && editSnapshot() !== ui.editSnap){
    try{ history.pushState({ tomeOverlay:_overlayDepth }, ''); }catch(_){ }
    _editGuardBusy = true; // l’autre écouteur de popstate (navigation par hash) doit passer son tour
    tryCloseEdit().then(ok=>{ _editGuardBusy = false; if(ok) closeTopOverlay(); });
    return;
  }
  // On descend d’un niveau (Retour) — ou de plusieurs d’un coup (appui long sur Retour) : on
  // ferme la couche VISIBLE la plus haute, sans history.back() (le navigateur y est déjà).
  // Regarder ce qui est ouvert plutôt que le niveau mémorisé évite de gâcher un appui sur Retour
  // quand une couche a été refermée en cascade sans rendre son entrée.
  while(_overlayDepth > target){
    _overlayDepth--;
    if($('#ov-dialog').classList.contains('open')){ _dlgClose(_dlgCancelVal, true); continue; }
    if($('#ov-cover').classList.contains('open')){ closeCover(true, true); continue; }
    if($('#ov-card').classList.contains('open')){ closeCard(true); continue; }
    // page publique du livre ouverte par-dessus la fiche (« Page du livre ») : Retour la referme
    // et rend la fiche, comme n’importe quelle couche de la pile.
    if(_pubReturn!=null && !$('#pubprofile').hidden){ closePublicBook(true); continue; }
    // modale ouverte par-dessus une autre : Retour rouvre celle du dessous (la fiche d’origine)
    if(ui.modalStack.length && _overlayDepth > 0 && $$('.overlay.open').length){ reopenUnder(true); continue; }
    if($$('.overlay.open').length) closeOverlays(true, true); // dernier niveau : la modale de fond
  }
  syncModalIsolation();
});
// Clé de re-sélection d’un élément (id, puis data-id) : après un render(), le nœud mémorisé
// n’est plus dans le document — on retrouve son remplaçant par cette clé.
function focusKey(el){
  if(!el || el===document.body || !el.getAttribute) return '';
  if(el.id) return '#' + CSS.escape(el.id);
  const did = el.getAttribute('data-id');
  if(did) return el.tagName.toLowerCase() + '[data-id="' + CSS.escape(did) + '"]';
  // bouton SANS id dans une carte identifiée (ex. .card-hit) : on vise le même bouton de la carte reconstruite
  const host = el.closest ? el.closest('[data-id]') : null;
  if(host && host !== el && host.getAttribute('data-id')){
    const cls = el.className ? String(el.className).split(' ')[0] : '';
    return host.tagName.toLowerCase() + '[data-id="' + CSS.escape(host.getAttribute('data-id')) + '"] ' + el.tagName.toLowerCase() + (cls ? '.' + CSS.escape(cls) : '');
  }
  return '';
}
// Comment rouvrir la modale qu’on quitte, pour y revenir au ✕ / Échap / Retour. L’identifiant
// (livre, série, liste) est capturé MAINTENANT : ui.detailId aura changé quand on dépilera.
// null pour les couches qui ne se rouvrent pas (lightbox, carte à partager, QR).
function reopenerFor(ov){
  if(!ov) return null;
  switch(ov.id){
    case 'ov-detail': { const id = ui.detailId; return id ? ()=>openDetail(id) : null; }
    case 'ov-list': {
      if(ui.listMode==='series'){ const n = ui.seriesName; return n ? ()=>openSeries(n) : null; }
      if(ui.listMode==='recap'){ const y = ui.recapYear; return ()=>showRecap(y); }
      const id = ui.listId; return id ? ()=>openList(id) : null;
    }
    case 'ov-rate': return ()=>{ renderQuickRate(); openOverlay('#ov-rate'); };
    case 'ov-search': return ()=>openSearch({keep:true});
    default: return null;
  }
}
function openOverlay(sel){
  const root=$(sel);
  // Sommes-nous déjà dans la pile de modales ? (root déjà ouverte = simple re-rendu ;
  // une AUTRE overlay ouverte = transition A→B ; ou une entrée d’historique déjà posée.)
  const dansPile = _overlayDepth > 0 || $$('.overlay.open').length > 0;
  if(dansPile){
    // Re-rendu de la MÊME modale : on échange le contenu sans toucher à l’historique.
    // Transition A→B (fiche → Modifier, série → tome, file de notation → fiche) : B occupe un
    // niveau de plus et on retient comment rouvrir A. Surtout pas de closeOverlays(false)+push,
    // dont le history.back() ASYNCHRONE refermait B ~50 ms plus tard (popstate → applyHashView).
    const sortante = root.classList.contains('open') ? null : $$('.overlay.open').find(o=>o!==root);
    const rouvrir = (sortante && _overlayDepth > 0) ? reopenerFor(sortante) : null;
    $$('.overlay.open').forEach(o=>{ if(o!==root) o.classList.remove('open'); });
    // Ne PAS écraser la référence vers l’appelant d’origine (une carte hors modale) : sinon la
    // restauration de focus à la fermeture viserait un bouton devenu display:none (retour <body>).
    const ae = document.activeElement;
    if(!(ae && ae.closest && ae.closest('.overlay'))){ ui.lastFocus = ae; ui.lastFocusKey = focusKey(ae); }
    if(_overlayDepth === 0) pushOverlayHistory(); // filet : une overlay ouverte sans entrée d’historique
    else if(rouvrir){ ui.modalStack.push(rouvrir); pushOverlayHistory(); }
  }else{
    ui.lastFocus = document.activeElement; ui.lastFocusKey = focusKey(ui.lastFocus);
    pushOverlayHistory();
  }
  root.classList.add('open'); syncModalIsolation();
  // preventScroll : sans lui, focaliser le premier bouton (tout en haut de la modale) fait
  // remonter le panneau au ré-affichage, à chaque clic sur un contrôle sans id (statut, rythme…).
  queueMicrotask(()=>{ if(!root.contains(document.activeElement)){ const first=modalFocusables(root)[0]; if(first) first.focus({preventScroll:true}); } });
}
// Ferme UNE seule couche : quand la modale a été ouverte par-dessus une autre (Modifier, mode
// étude, tome d’une série, fiche ouverte depuis la file de notation), on rouvre celle du dessous
// au lieu de tout fermer ; sinon fermeture complète, comme avant.
function closeTopOverlay(){
  if(!ui.modalStack.length || _overlayDepth <= 0){ closeOverlays(); return; }
  _overlayDepth--;        // l’entrée d’historique de la couche fermée est rendue…
  scheduleHistoryPop(1);  // …en un seul history.go(-n) au tour suivant (cf. scheduleHistoryPop)
  reopenUnder();
}
// Dépile et rouvre la modale du dessous. L’entrée d’historique vient d’être rendue (✕, Échap,
// bouton) ou consommée par le navigateur (Retour) : openOverlay ne doit donc pas en repousser
// une — d’où la fermeture AVANT l’appel, qui lui présente une pile vide (aucune transition A→B).
function reopenUnder(fromPop){
  const rouvrir = ui.modalStack.pop();
  const recherche = $('#ov-search').classList.contains('open');
  $$('.overlay').forEach(o=>o.classList.remove('open'));
  _coverDepth = 0; _cardDepth = 0;
  rouvrir();
  // La recherche quittée pour de bon (et non simplement rouverte sous le formulaire « Détails ») :
  // c’est ici qu’on solde la session d’ajout.
  if(recherche && !$('#ov-search').classList.contains('open')) endSearchSession();
  if($$('.overlay.open').length){ syncModalIsolation(); return; }
  // La cible a disparu entre-temps (livre supprimé, série vidée) : on ne reste pas sur un écran
  // vide, et on rend les entrées d’historique restantes — sauf en revenant d’un Retour, où le
  // navigateur a déjà quitté ces niveaux (la boucle du popstate finit de redescendre).
  if(!fromPop && _overlayDepth > 0){ const n = _overlayDepth; _overlayDepth = 0; scheduleHistoryPop(n); }
  closeOverlays();
}
// fromPop : appel depuis le popstate (Retour) — les entrées sont déjà retirées, ne pas reculer.
function closeOverlays(restore=true, fromPop=false){
  ui.modalStack.length = 0; // toute la pile se ferme : plus rien à rouvrir
  stopScan(); if(typeof stopQRScan==='function') stopQRScan();
  const etaitOuverte = $$('.overlay.open').length > 0;
  const finRecherche = $('#ov-search').classList.contains('open'); // session d’ajout à solder (voir plus bas)
  $$('.overlay').forEach(o=>o.classList.remove('open'));
  { const sb = $('#search-results'); if(sb) sb.style.maxHeight = ''; } // borne posée pour le clavier mobile
  _coverDepth = 0; _cardDepth = 0; // #ov-cover et #ov-card sont des .overlay : fermés ici en cascade
  // rendre d’un coup les entrées d’historique de toute la pile (modale + couches empilées dessus),
  // sans re-déclencher la fermeture : le popstate ne trouve plus rien au-dessus du niveau cible
  if(!fromPop && etaitOuverte && _overlayDepth > 0){ const n = _overlayDepth; _overlayDepth = 0; scheduleHistoryPop(n); }
  syncModalIsolation();
  // une autre fenêtre a écrit pendant la modale : on prend sa version maintenant (elle repeint tout)
  if(_externalState){ const s=_externalState; _externalState=null; _dirtyBg=false; applyExternalState(s); }
  if(_dirtyBg){ _dirtyBg=false; render(); } // rattrape le rendu de fond différé AVANT de restaurer le focus
  if(restore){
    let t = (ui.lastFocus && document.contains(ui.lastFocus)) ? ui.lastFocus : null;
    if(!t && ui.lastFocusKey){ try{ t = document.querySelector(ui.lastFocusKey); }catch(_){ } }
    if(!t){ const mc = $('#main-content'); if(mc){ mc.tabIndex = -1; t = mc; } } // jamais <body>
    try{ t && t.focus({ preventScroll:true }); }catch(_){ }
  }
  // En dernier : la session d’ajout peut ouvrir un dialogue, qui doit arriver APRÈS le repli
  // de l’historique programmé plus haut (et après la restauration du focus, qu’il vole sinon).
  if(finRecherche) endSearchSession();
}
// Page publique d’un livre ouverte DEPUIS l’app (et non à froid sur /livre/<slug>) : le livre à
// rouvrir au retour, le niveau d’historique occupé, et le titre de l’onglet à remettre.
// _pubReturn non nul = « on est venu de la fiche », le seul cas où la page publique se referme.
let _pubReturn = null, _pubDepth = 0, _pubPrevTitle = '';
// La page publique se comporte comme une couche de plus de la pile de modales : elle pousse son
// entrée d’historique, la fiche reste montée (masquée) dessous, et Retour redescend d’un cran.
function openPublicBookOver(slug, backToId, href){
  _pubReturn = backToId;
  _pubPrevTitle = document.title;
  _pubDepth = pushOverlayHistory();
  // l’URL devient publique (partageable, rechargeable, indexable) sans ajouter une 2e entrée
  try{ history.replaceState({ tomeOverlay:_pubDepth, tomePub:1 }, '', href); }catch(_){ }
  $$('.overlay.open').forEach(o=>o.classList.remove('open')); // la fiche passe derrière ; son entrée reste
  showPublicBook(slug);
}
// fromPop : le navigateur a déjà retiré l’entrée (Retour) — ne pas reculer une seconde fois.
function closePublicBook(fromPop, id){
  const depth = _pubDepth, back = id || _pubReturn;
  _pubReturn = null; _pubDepth = 0;
  const host = $('#pubprofile'); if(host) host.hidden = true;
  document.body.style.overflow = '';
  if(_pubPrevTitle){ document.title = _pubPrevTitle; _pubPrevTitle = ''; }
  try{ history.replaceState(history.state, '', '/' + location.hash); }catch(_){ }
  if(!fromPop) popOverlayHistory(depth);
  syncModalIsolation();
  if(back) openDetail(back); // la fiche reprend le niveau qu’elle occupait déjà : aucune entrée en plus
}
let _coverLastFocus = null, _coverDepth = 0, _cardDepth = 0;
// Lightbox et carte : chacun occupe son propre niveau d’historique par-dessus la fiche, pour que
// Retour ne referme que lui (fromPop : le navigateur a déjà retiré l’entrée, ne pas reculer).
function closeCover(restore=true, fromPop=false){
  const ov = $('#ov-cover'), depth = _coverDepth; _coverDepth = 0;
  if(!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  syncModalIsolation();
  if(!fromPop) popOverlayHistory(depth);
  if(restore && _coverLastFocus && document.contains(_coverLastFocus)){
    try{ _coverLastFocus.focus(); }catch(_){ }
  }
  _coverLastFocus = null;
}
function openCover(url, title){
  const ov = $('#ov-cover');
  _coverLastFocus = document.activeElement;
  const img = ov.querySelector('img');
  img.src = url;
  img.alt = title ? 'Couverture de ' + title : 'Couverture';
  if(!ov.classList.contains('open')) _coverDepth = pushOverlayHistory();
  ov.classList.add('open');
  syncModalIsolation();
  queueMicrotask(()=>$('#cover-close').focus({preventScroll:true}));
}
function closeCard(fromPop=false){ // se ferme seul, sans fermer la modale en dessous
  const ov = $('#ov-card'), depth = _cardDepth; _cardDepth = 0;
  if(!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  syncModalIsolation();
  if(!fromPop) popOverlayHistory(depth);
}
function openCard(){
  const ov = $('#ov-card');
  if(!ov.classList.contains('open')) _cardDepth = pushOverlayHistory();
  ov.classList.add('open');
  syncModalIsolation(); // sinon la carte reste inerte : clics traversés vers la fiche → données modifiées
}
$('#ov-cover').addEventListener('click', e=>{
  if(e.target===$('#ov-cover') || e.target.closest('#cover-close')) closeCover();
});
$('#ov-card').addEventListener('click', e=>{
  if(e.target===$('#ov-card') || e.target.closest('#card-close')) closeCard();
});
$$('.overlay').forEach(o => o.addEventListener('click', async e => {
  if(o.id==='ov-cover' || o.id==='ov-card') return; // fermés par leur propre handler
  if(!(e.target === o || e.target.closest('[data-close]'))) return;
  // Le fond gris du formulaire ne ferme plus rien sur mobile : le pouce l’effleure sans arrêt en
  // remontant la page, et la saisie était perdue d’un coup. ✕ et « Annuler » restent la sortie.
  if(o.id==='ov-edit' && e.target === o && matchMedia('(max-width:640px)').matches) return;
  if(!await tryCloseEdit()) return; // saisie en cours dans le formulaire : on demande d’abord
  closeTopOverlay(); // rouvre la modale du dessous s’il y en a une
}));
document.addEventListener('keydown', async e => {
  if(e.key!=='Escape') return;
  const cov = $('#ov-cover');
  if(cov.classList.contains('open')){ closeCover(); return; } // ferme d’abord le lightbox
  if($('#ov-card').classList.contains('open')){ closeCard(); return; } // puis l’aperçu de carte
  if($$('.overlay.open').length){                                     // puis UNE couche de modale
    if(!await tryCloseEdit()) return;
    closeTopOverlay(); return;
  }
  if(ui.selectMode){ clearSelection(); renderLibrary(); }
});
// Navigation par hash entre les onglets et deep-link #book/<id>
window.addEventListener('popstate', e=>{
  // Le formulaire d’édition retient le Retour le temps d’une question : l’entrée d’historique a
  // déjà été repoussée, la vue de fond ne bouge pas (sinon applyHashView fermerait le formulaire).
  if(_editGuardBusy) return;
  // Retour À L’INTÉRIEUR de la pile de modales (un dialogue ou le lightbox vient de se fermer, la
  // fiche reste ouverte) : la vue de fond ne change pas — applyHashView fermerait tout.
  if((e.state||{}).tomeOverlay && _overlayDepth > 0) return;
  // Retour depuis le profil d’un ami : on revient au sous-onglet d’où l’on venait (le fil, les
  // notifications…) sans quitter la vue Amis ni toucher au hash.
  if(social.view==='profile' && !(e.state||{}).tomeProfile && ui.view==='friends'){
    social.view=null; social.profile=null; social.tab=social.profileFrom||'friends';
    renderFriends(); return;
  }
  applyHashView();
});
window.addEventListener('hashchange', ()=>applyHashView());
const INVITE_RE = /^invite\/([a-z0-9_.-]{3,20})$/i; // même contrainte que les pseudos serveur
function applyHashView(hash){
  if($$('.overlay.open').length){ closeOverlays(); return; }
  const h = (hash!=null ? hash : location.hash).replace(/^#/, '');
  const inv = h.match(INVITE_RE);
  if(inv){
    social.invite = inv[1].toLowerCase();
    // persistée : sur mobile, l’aller-retour vers l’app de messagerie ou un rechargement
    // faisait perdre l’invitation — c’est le seul canal d’acquisition de l’app.
    try{ localStorage.setItem(PENDING_INVITE, JSON.stringify({u:social.invite, at:Date.now()})); }catch(_){ }
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
  if(['today','library','journal','lists','stats','friends','account'].includes(h) && h!==ui.view) selectView(h);
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
      ? 'Dans Safari, touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil » et enfin « Ajouter ». Tome apparaîtra comme une app et pourra fonctionner hors ligne.'
      : 'Ouvre le menu de ton navigateur, puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Si l’option n’apparaît pas, ouvre Tome dans Chrome ou Edge.',
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
const UPDATE_LATER = 'tome-update-later';
function showUpdateBar(reg){
  // « Plus tard » posé dans cet onglet : on ne redemande plus, le worker en attente s’activera au
  // prochain lancement (sessionStorage : la question revient à la prochaine session, pas avant).
  let plusTard = false; try{ plusTard = !!sessionStorage.getItem(UPDATE_LATER); }catch(_){}
  if(plusTard) return;
  const bar = $('#update-bar');
  bar.classList.add('show');
  $('#update-later').onclick = ()=>{
    bar.classList.remove('show');
    try{ sessionStorage.setItem(UPDATE_LATER, '1'); }catch(_){}
  };
  $('#update-reload').onclick = async ()=>{
    // une fiche ou un formulaire ouvert : recharger jette la saisie en cours, on le dit avant
    if($$('.overlay.open').length && !await uiConfirm({ title:'Recharger maintenant ?', message:'Ce que tu es en train de saisir sera perdu.', okLabel:'Recharger' })) return;
    if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    else location.reload();
  };
}
if('serviceWorker' in navigator){
  addEventListener('load', async ()=>{
    try{
      const reg = await navigator.serviceWorker.register('/sw.js');
      // un nouveau worker installé alors qu’un ancien contrôle déjà la page = mise à jour dispo
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
  // le fil d'« Aujourd’hui » resterait figé sur « indisponible hors ligne » : on le réarme
  social.todayFeedError=''; social.todayFeedAt=0;
  if(ui.view==='today') renderTodaySocial();
});
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
// Le badge orange de l’en-tête passe inaperçu sur un téléphone : on le dit une fois, et on rassure
// tout de suite sur ce qui marche encore (tout, sauf la recherche et le réseau).
window.addEventListener('offline', ()=>toast('Hors ligne : ta bibliothèque reste disponible, la recherche non'));
updateOnline();

// Multi-fenêtres (PWA + onglet, ou onglet dupliqué) : une autre instance a écrit → on prend sa version
// pour ne pas l’écraser à la prochaine sauvegarde. Modale ouverte : on ne repeint pas sous une saisie
// en cours — la version attend dans _externalState (appliquée par closeOverlays), et « Recharger »
// sert à ceux qui la veulent tout de suite ; l’ancien toast demandait de recharger sans le permettre.
// La révision de base du prochain envoi suit l’état qu’on adopte : l’autre onglet vient peut-être
// d’écrire sur le compte (libRev avancé). Restée à l’ancienne valeur, social.libRev valait un 409 à
// la première retouche d’ici, et la fusion qui s’ensuivait dédoublait le livre retouché — la base
// de fusion (meta.syncFp), elle, arrive avec l’état, dans la même écriture.
function applyExternalState(json){
  try{
    replaceState(JSON.parse(json));
    if(social.me && state.meta && state.meta.ownerId===social.me.id) social.libRev = (+state.meta.libRev) || 0;
    render();
  }catch(_){ }
}
window.addEventListener('storage', e => {
  // Le jeton de session a changé dans un autre onglet (connexion, déconnexion, autre compte) :
  // traité AVANT tout le reste, sinon cet onglet continuerait d’envoyer vers l’ancien compte.
  if(e.key === SOC_TOKEN){ sessionChangedElsewhere(e.newValue); return; }
  if(e.key !== LS_KEY || e.newValue == null) return;
  if($$('.overlay.open').length){
    if(!_externalState) toast('Modifié dans une autre fenêtre', { label:'Recharger', ms:10000, onAction:()=>location.reload() });
    _externalState = e.newValue;
    return;
  }
  applyExternalState(e.newValue);
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

$('#btn-open-search').setAttribute('aria-keyshortcuts','Alt+A Alt+N');
$('#fab').setAttribute('aria-keyshortcuts','Alt+A Alt+N');
$('#btn-resume').setAttribute('aria-keyshortcuts','Alt+R');
$('#lib-q').setAttribute('aria-keyshortcuts','Alt+/');
$$('#nav button').forEach((btn,i)=>btn.setAttribute('aria-keyshortcuts',`Alt+${i+1}`));

document.addEventListener('keydown', e => {
  if(e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
  if($$('.overlay.open').length) return; // Escape est géré ailleurs
  // Un modificateur est obligatoire : les raccourcis à caractère seul perturbent notamment
  // la commande vocale et sont interdits par WCAG 2.1.4 sans mécanisme de désactivation.
  if(!e.altKey || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  const digit = (e.code||'').match(/^Digit([1-6])$/);
  if(k==='a' || k==='n'){ e.preventDefault(); openSearch(); }
  else if(k==='/' || e.code==='Slash'){ e.preventDefault(); selectView('library'); $('#lib-q').focus(); }
  else if(k==='r'){ const b = lastReadingBook(); if(b){ e.preventDefault(); openDetail(b.id); } }
  else if(digit){ const btns=$$('#nav button'), n=+digit[1]; if(btns[n-1]){ e.preventDefault(); selectView(btns[n-1].dataset.view, {focus:true}); } }
});

/* =============== Amis (Tome Social) =============== */
// API servie par la même origine (Worker Tome-Social + assets statiques) : chemin relatif.
// Exception : launcher de dev `tome` (port 8791) sans API → Worker séparé sur 8787
// (`npx wrangler dev` dans Tome-Social sert app + API sur 8787, même origine).
const API_BASE = (location.port==='8791') ? 'http://localhost:8787' : '';
const SOC_TOKEN = 'tome-social-token';
// Invitation en attente : conservée jusqu’à ce que la demande d’ami parte VRAIMENT (une
// invitation perdue = un utilisateur perdu — c’est le seul canal d’acquisition). Expire à 7 jours.
const PENDING_INVITE = 'tome-pending-invite';
function loadPendingInvite(){
  try{
    const raw = localStorage.getItem(PENDING_INVITE); if(!raw) return '';
    const d = JSON.parse(raw);
    if(!d || !d.u || (Date.now() - (d.at||0)) > 7*864e5){ localStorage.removeItem(PENDING_INVITE); return ''; }
    return String(d.u);
  }catch(_){ return ''; }
}
function clearPendingInvite(){ try{ localStorage.removeItem(PENDING_INVITE); }catch(_){ } }
const social = { me:null, tab:'feed', view:null, profile:null, profileFrom:'friends', sessionError:'', libStatus:'', sessionExpired:false };
function socToken(){ try{ return localStorage.getItem(SOC_TOKEN)||''; }catch(_){ return ''; } }
// Jeton avec lequel l’identité AFFICHÉE (social.me) a été authentifiée. Le jeton de localStorage
// peut être remplacé par un autre onglet : les envois de bibliothèque comparent les deux pour
// qu’une réponse tardive du compte A ne soit jamais appliquée au compte B.
let _socUserToken = '';
// Session expirée (401 alors qu’un jeton existait) : sans un mot d’explication, la sauvegarde sur
// le compte s’arrête en silence et l’utilisateur continue de croire sa bibliothèque synchronisée.
// On nettoie l’état, on le dit une fois, et on garde le motif pour l’écran de connexion.
function flagSessionExpired(){
  const premier = !social.sessionExpired;                 // un seul toast, même si plusieurs appels échouent
  social.sessionExpired = true;
  resetLibrarySync(); _socUserToken = '';                // plus rien ne doit partir sous cette session
  social.me = null; social.view = null;
  try{ localStorage.removeItem(SOC_TOKEN); }catch(_){}
  setLibStatus(''); setFriendsBadge(0); syncMeButton();
  if(ui.view==='friends' || ui.view==='account'){ render(); return; }     // l’explication est déjà sur le formulaire
  if(premier) toast('Session expirée. Reconnecte-toi pour continuer à sauvegarder ta bibliothèque',
    { label:'Se connecter', ms:8000, onAction:()=>selectView('account') });
}
// Un seul vocabulaire pour les pannes réseau : « Serveur injoignable » était répété 36 fois, sans
// dire quoi faire, et ne distinguait pas une coupure locale d'une saturation ou d'une panne de Tome.
function netMsg(e){
  if(e && e.message==='offline') return 'Pas de connexion. Réessaie quand le réseau sera revenu.';
  if(e && e.status===429) return 'Trop de demandes d’un coup. Attends une minute.';
  if(e && e.status>=500) return 'Tome a un souci de son côté, réessaie dans un instant.';
  return (e && e.message) || 'Envoi impossible';
}
async function api(path, opts={}){
  // sessionToken : jeton d’une session PRÉCISE (envois liés à la bibliothèque d’un compte) ; par
  // défaut, le jeton courant de localStorage.
  const { sessionToken, ...requestOpts } = opts; opts = requestOpts;
  const headers = Object.assign({}, opts.headers);
  const tk = sessionToken===undefined ? socToken() : sessionToken;
  if(tk) headers['Authorization'] = 'Bearer '+tk;
  if(opts.body){ headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  let res;
  try{ res = await fetch(API_BASE+path, {...opts, headers}); }
  catch(e){ throw new Error('offline'); }
  let data = {};
  try{ data = await res.json(); }catch(_){}
  // Session expirée en cours d’usage → retour propre à l’écran de connexion. Seulement si le jeton
  // refusé est ENCORE le jeton courant : un 401 tardif du compte A (déconnecté entre-temps sur cet
  // appareil) ne doit pas déconnecter le compte B qui vient d’ouvrir sa session.
  if(res.status===401 && social.me && tk===socToken()) flagSessionExpired();
  if(!res.ok){ const e = new Error(data.error || (res.status>=500 ? 'Tome a un souci de son côté' : 'Requête refusée ('+res.status+')')); e.status = res.status; throw e; }
  return data;
}
const initials = s => {
  const mots = String(s||'?').trim().split(/[\s_.-]+/).filter(Boolean);
  return ((mots[0]||'?')[0] + (mots.length>1 ? mots[mots.length-1][0] : '')).toUpperCase();
};
// Couleur d’avatar dérivée du nom : chacun a la sienne, stable, sans rien stocker.
// Dégradé saturé + texte blanc = lisible sur fond clair comme sombre.
// Avatars sur la palette d’encres de l’identité (plus de roue chromatique à 360° : un magenta
// aléatoire jurait avec l’encre et la dorure). Déterministe par pseudo, texte ivoire.
const AVATAR_INKS = ['#1f4560','#2e4d38','#8a4a1f','#9c332a','#4a2b40','#41465a','#6d5416','#233c52'];
function avatarStyle(seed){
  const s = String(seed||'?');
  let h = 0; for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))|0;
  const ink = AVATAR_INKS[Math.abs(h) % AVATAR_INKS.length];
  return `background:${ink};color:#efe8d8`;
}
// markup complet d’un avatar (une seule source de vérité pour les 8 endroits qui en affichent)
function avatarHTML(name, cls=''){
  return `<div class="avatar${cls?' '+cls:''}" style="${avatarStyle(name)}">${esc(initials(name))}</div>`;
}
// Le bouton « Mon compte » de l’en-tête dit qui est connecté : les initiales (mêmes couleurs que
// partout ailleurs) une fois connecté, une silhouette sinon. Le nom accessible suit, sinon deux
// comptes sur le même appareil s’appelleraient tous deux « Mon compte » au lecteur d’écran.
function syncMeButton(){
  const b = $('#btn-me'); if(!b) return;
  const key = social.me ? 'me:'+social.me.displayName : 'anon';
  if(b.dataset.key === key) return;            // render() repasse souvent : ne rien réécrire pour rien
  b.dataset.key = key;
  b.innerHTML = social.me ? avatarHTML(social.me.displayName, 'sm') : ic('user',18);
  const lbl = social.me ? `Mon compte (${social.me.displayName})` : 'Mon compte';
  b.setAttribute('aria-label', lbl); b.title = lbl;
}
$('#btn-feedback').addEventListener('click', sendFeedback);
{ const bv = $('#btn-versions'); if(bv) bv.addEventListener('click', ()=>showVersions()); }
$('#btn-me').addEventListener('click', ()=>selectView('account', {focus:true}));
// clé stable d’un livre côté social — DOIT rester identique entre la synchro (shareableBooks)
// et les lectures croisées (« chez tes amis »), sinon les correspondances se perdent
function shelfKey(b){ return (b.title+'|'+((b.authors||[])[0]||'')+'|'+(b.volume??'')).toLowerCase().replace(/[^a-z0-9à-ÿ]/g,''); }
// sous-ensemble partageable de la bibliothèque
// Miroir client de cleanSharedCover (worker) : sert uniquement à prévenir l’utilisateur ;
// le serveur reste seul juge de ce qu’il accepte.
const CACHEABLE_COVER = /^(?:https:\/\/(?:covers\.openlibrary\.org\/b\/(?:id|isbn|olid)\/[A-Za-z0-9]+-[SML]\.jpg|books\.google(?:usercontent)?\.com\/books\/)|https:\/\/openapi\.bnf\.fr\/couverture\/image\/image\/recupererImage\?ISBN=[0-9Xx-]+&couverture=1)/;
const SHAREABLE_COVER = /^(?:https:\/\/(?:covers\.openlibrary\.org\/b\/(?:id|isbn|olid)\/[A-Za-z0-9]+-[SML]\.jpg|books\.google(?:usercontent)?\.com\/books\/)|https:\/\/openapi\.bnf\.fr\/couverture\/image\/image\/recupererImage\?ISBN=[0-9Xx-]+&couverture=1)/;
// La bibliothèque de démonstration (tag 'exemple') est un bac à sable LOCAL : elle ne doit
// jamais être partagée ni sauvegardée sur un compte — sinon les critiques d’exemple sortent
// signées du nom de l’utilisateur sur sa page publique et chez ses amis.
function isDemoBook(b){ return !!(b && (b.tags||[]).includes('exemple')); }
function stripDemo(){
  const n = state.books.filter(isDemoBook).length;
  if(!n) return 0;
  state.books = state.books.filter(b=>!isDemoBook(b));
  state.lists.forEach(l=> l.bookIds = l.bookIds.filter(id=>state.books.some(b=>b.id===id)));
  clearDemoGoal();
  save(); scheduleRender();
  return n;
}
// Slug DÉTERMINISTE de la page publique d'un livre — même fonction dans le Worker (bookSlug) :
// titre-auteur lisibles + empreinte FNV-1a de la clé d'étagère, pour rester unique sans table.
function fnv1a(str){ let h = 0x811c9dc5; for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8,'0').slice(0,6); }
function slugPart(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40); }
function bookSlug(key, title, firstAuthor){ const t = slugPart(title) || 'livre'; const a = slugPart(firstAuthor); return (a ? t + '-' + a : t) + '-' + fnv1a(String(key)); }
function bookSlugOf(b){ return bookSlug(shelfKey(b), fullTitle(b), (b.authors||[])[0]||''); }
function shareableBooks(){
  return state.books.filter(b=>!isDemoBook(b)).map(b=>{
    const key = shelfKey(b);
    const lastRead = (b.readings||[]).map(r=>r.date).sort().pop() || '';
    return {
      key, title:fullTitle(b), authors:authorsStr(b), type:b.type, series:b.series||'', volume:b.volume,
      cover:b.cover||'', isbn:b.isbn||'', rating:b.rating, review:b.review||'', status:b.status, readDate:lastRead,
    };
  }).filter(b=>b.status==='read' || b.rating || b.readDate); // on ne partage pas la pile « à lire » vierge
}
function setFriendsBadge(n){
  const b = $('#nav-friends-badge'); if(!b) return;
  if(n>0){ b.textContent = n>9?'9+':String(n); b.hidden = false; } else { b.hidden = true; }
}
// le badge de l’onglet Amis = demandes reçues + notifications non lues (tout ce qui est « nouveau »)
function refreshSocBadge(){ setFriendsBadge((social.pendingRequests||0) + (social.unreadNotifs||0)); }
async function socRefresh(){
  const tk = socToken();
  if(!tk){ social.me=null; _socUserToken=''; social.sessionError=''; social.pendingRequests=0; social.unreadNotifs=0; setFriendsBadge(0); syncMeButton(); return; }
  try{ const d = await api('/api/me');
       // Le jeton a changé pendant l’appel (connexion ou déconnexion dans un autre onglet) : cette
       // réponse décrit une session qui n’est plus la nôtre — on l’ignore, le nouvel appel suivra.
       if(tk!==socToken()) return;
       if(social.todayFeedUser && social.todayFeedUser!==d.user.id){ social.todayFeed=null; social.todayFeedAt=0; social.todayFeedError=''; }
       social.me = d.user; _socUserToken = tk; social.todayFeedUser=d.user.id; social.sessionError=''; social.tosOutdated = !!d.tosOutdated;
       social.hasRecovery = !!d.hasRecovery;
       social.publicProfile = !!d.publicProfile;
       social.pendingRequests = d.pendingRequests||0; social.unreadNotifs = d.unreadNotifs||0; refreshSocBadge(); syncMeButton();
       if((social.tosOutdated || social.unreadNotifs) && ui.view==='friends') renderFriends();
       if(ui.view==='today') renderToday(); }
  // 401 au démarrage : le jeton stocké ne vaut plus rien (déconnexion à distance, jeton révoqué)
  catch(e){ if(tk!==socToken()) return;   // même règle : une erreur d’un jeton remplacé ne nous concerne plus
    social.sessionError=e.message; if(/401|Non authentifié/.test(e.message)){ social.sessionError=''; social.todayFeed=null; social.todayFeedAt=0; social.todayFeedUser=''; flagSessionExpired(); } if(ui.view==='today') renderTodaySocial(); }
}
// Le jeton de session a changé dans un AUTRE onglet (même appareil). Retiré : cet onglet est de
// fait déconnecté (le serveur a révoqué ce jeton) — on le dit, et ce qui n’était pas encore parti
// reste sur l’appareil (renvoyé à la prochaine connexion de ce compte). Remplacé : on repart de
// zéro pour la nouvelle session, sans jamais confondre ses envois avec ceux de l’ancienne.
function sessionChangedElsewhere(newToken){
  const pending = _libDirty || !!_libPushing;
  resetLibrarySync(); _socUserToken = '';
  if(!newToken){
    if(!social.me) return;                                 // cet onglet n’était pas connecté : rien à défaire
    social.me=null; social.view=null; social.libRev=0; social.todayFeed=null; social.todayFeedAt=0; social.todayFeedUser=''; social.todayFeedError='';
    social.sessionExpired=false;                           // une déconnexion voulue, pas une session perdue
    setLibStatus(''); setFriendsBadge(0); syncMeButton(); render();
    toast(pending ? 'Déconnecté depuis un autre onglet. Tes dernières modifications restent sur cet appareil seulement' : 'Déconnecté depuis un autre onglet', {ms:6000});
    return;
  }
  social.me=null; social.view=null; social.libRev=0; social.sessionExpired=false; setLibStatus('');
  socRefresh().then(()=>{ if(social.me && !social.tosOutdated) syncLibraryOnLogin().then(ok=>{ if(ok) pushShelf(); }); render(); });
}

/* =============== Bibliothèque sur le compte (sauvegarde serveur façon Letterboxd) =============== */
// Le local reste la copie de travail (rapide, hors-ligne) ; le serveur est la source de vérité
// synchronisée entre appareils. Concurrence optimiste (rev) : jamais d’écrasement silencieux.
let _libPushTimer = 0, _libPushing = false, _libDirty = false, _libRetryMs = 2000;
// Garde de session. Une « session » = {id du compte, jeton} figés au moment où l’on commence à
// charger la bibliothèque de ce compte. _libSession : la session en cours de chargement ;
// _libReadySession : celle dont la bibliothèque a été chargée (ou adoptée) — c’est la SEULE
// condition pour écrire vers le compte. Sur un appareil partagé, sans cette garde, un envoi
// débounced ou une réponse tardive du compte A pouvait s’appliquer au compte B.
let _libSession = null, _libReadySession = null, _libSyncPromise = null;
let _libRetryTimer = 0, _libRetryDelay = 15000;
function accountSession(){ return { id: social.me ? social.me.id : '', token: _socUserToken }; }
// La session est encore celle affichée ET celle de localStorage (un autre onglet peut l’avoir changée).
function currentAccount(s){ return !!(s && s.id && s.token && social.me && social.me.id===s.id && _socUserToken===s.token && socToken()===s.token); }
function currentLibrarySession(s){ return !!s && s===_libSession && currentAccount(s); }
// Vrai seulement quand la bibliothèque du compte courant a été chargée ou adoptée : avant, rien
// ne part (sauvegarde, étagère, titre du rappel). recommendBook n’en dépend pas, à dessein.
function libraryReady(){ return !!(_libReadySession && currentLibrarySession(_libReadySession) && !social.tosOutdated && state.meta && state.meta.ownerId===social.me.id); }
// Oublie la session de bibliothèque (déconnexion, changement de compte, session expirée) : les
// minuteries et files d’envoi sont vidées — l’état local, lui, reste tel quel.
function resetLibrarySync(){
  _libSession = _libReadySession = null;
  clearTimeout(_libPushTimer); clearTimeout(_shelfTimer); clearTimeout(_libRetryTimer);
  _libPushTimer = _shelfTimer = _libRetryTimer = 0;
  _libPushing = _shelfPushing = false; _libDirty = _shelfDirty = false;
}
// Nouvelle tentative de chargement après un échec, avec attente croissante (15 s, 30 s, 60 s…
// 5 min au plus) : relancer toutes les 15 s épuiserait le quota de lecture du serveur (240/h) et
// transformerait une panne en boucle de 429. Hors ligne, rien n’est programmé : l’événement
// « online » relance. Un refus définitif (4xx autre que 429, bibliothèque serveur illisible) n’est
// pas réessayé — cela ne changerait rien.
function retryLibrarySync(session, err){
  if(!currentLibrarySession(session)) return;
  clearTimeout(_libRetryTimer); _libRetryTimer = 0;
  if(err && err.message==='Bibliothèque invalide') return;
  if(err && err.status && err.status<500 && err.status!==429) return;
  if(!navigator.onLine) return;
  const delay = _libRetryDelay; _libRetryDelay = Math.min(_libRetryDelay*2, 300000);
  _libRetryTimer = setTimeout(()=>{ _libRetryTimer = 0; if(currentLibrarySession(session)) syncLibraryOnLogin().then(ok=>{ if(ok) pushShelf(); }); }, delay);
}
// Deux registres pour le même état : le libellé COURT s’affiche dans l’en-tête (il doit tenir sur
// un téléphone), l’explication LONGUE sert d’infobulle et de texte du toast quand l’état est
// actionnable. Jusqu’ici rien n’était rendu du tout : #lib-status n’existait pas dans le HTML.
const LIB_STATUS = {
  saving:'Sauvegarde de ta bibliothèque sur ton compte…',
  saved:'Bibliothèque enregistrée sur ton compte',
  offline:'Hors ligne : ta bibliothèque sera sauvegardée sur ton compte dès le retour du réseau',
  error:'Ta bibliothèque n’a pas pu être sauvegardée sur ton compte, elle reste sur cet appareil',
  conflict:'Fusionnée avec les modifications d’un autre appareil',
  tooLarge:'Bibliothèque trop volumineuse pour la sauvegarde du compte. Exporte-la pour la garder à l’abri',
};
const LIB_STATUS_SHORT = { saving:'Sauvegarde…', saved:'Enregistré ✓', offline:'Sauvegarde différée', error:'Non sauvegardé', conflict:'Fusionné', tooLarge:'Trop volumineux' };
function setLibStatus(s){
  social.libStatus = s;
  const el = $('#lib-status'); if(!el) return;
  clearTimeout(el._h);
  el.dataset.s = s || '';
  el.textContent = LIB_STATUS_SHORT[s] || '';
  el.title = LIB_STATUS[s] || '';
  // Seul un état à corriger est cliquable : le reste est une information, pas une commande
  // (et un bouton désactivé sort de l’ordre de tabulation, ce qui évite un arrêt inutile).
  el.disabled = !(s==='error' || s==='tooLarge');
  el.hidden = !s;
  // « Enregistré ✓ » est une confirmation, pas un état : elle s’efface d’elle-même.
  if(s==='saved') el._h = setTimeout(()=>{ el.hidden = true; }, 1500);
}
// En échec, l’en-tête devient une porte de sortie : l’export local est le vrai filet de sécurité.
$('#lib-status').addEventListener('click', ()=>{
  const s = social.libStatus;
  if(s!=='error' && s!=='tooLarge') return;
  toast(LIB_STATUS[s], { label:'Exporter', ms:8000, onAction:()=>$('#btn-export').click() });
});
// mute state EN PLACE (const) à partir de données brutes (normalisées + sanitizées)
function replaceState(raw){ const n = normalizeData(raw||{}); for(const k of Object.keys(state)) delete state[k]; Object.assign(state, n); invalidateCache(); }
// Sauvegarde de secours locale avant un remplacement d’état. Renvoie false si l’écriture échoue
// (quota plein) — précisément le cas où l’appelant doit proposer un téléchargement de secours.
function backupLocal(suffix){ try{ localStorage.setItem(LS_KEY+suffix, localStorage.getItem(LS_KEY)||''); return true; }catch(_){ return false; } }
// Filet ceinture-bretelles avant un EFFACEMENT total : si la copie localStorage échoue alors qu’il
// existe de vraies données, on télécharge l’état courant pour qu’aucun effacement ne soit définitif.
function wipeFallback(){
  if((state.books||[]).some(b=>!isDemoBook(b))){
    try{ downloadJSON(withoutSyncBase(state), `tome-sauvegarde-${today()}.json`); toast('Stockage plein : ancienne bibliothèque téléchargée en secours', {ms:7000}); }catch(_){ }
  }
}
function backupBeforeWipe(suffix){ if(!backupLocal(suffix)) wipeFallback(); }
/* ---- Bibliothèques mises de côté : une copie PAR COMPTE (LS_KEY-autre:<compte>) ----
   L’ancien emplacement unique « -autre » se faisait écraser : A partait avec des modifications non
   envoyées, B passait, A revenait → la copie de A était remplacée par celle de B, ses modifications
   perdues. Ici chaque compte a la sienne : fusionnée d’office à sa prochaine connexion sur cet
   appareil (loadAccountLibrary), purgée au premier envoi réussi (pushLibrary). Au plus MAX_ASIDE
   comptes et ~LS_BUDGET de stockage local en tout — les copies les plus anciennes cèdent. */
const ASIDE_PREFIX = LS_KEY+'-autre:', ASIDE_INDEX = LS_KEY+'-autre-index', MAX_ASIDE = 3, LS_BUDGET = 4*1024*1024;
function asideKey(id){ return ASIDE_PREFIX+id; }
// L’index note la date de chaque mise de côté (localStorage n’en garde aucune) : il sert à savoir
// laquelle est la plus ancienne. Une copie absente de l’index est réputée la plus ancienne.
function asideIndex(){ try{ const d = JSON.parse(localStorage.getItem(ASIDE_INDEX)||'{}'); return (d && typeof d==='object' && !Array.isArray(d)) ? d : {}; }catch(_){ return {}; } }
function saveAsideIndex(idx){ try{ if(Object.keys(idx).length) localStorage.setItem(ASIDE_INDEX, JSON.stringify(idx)); else localStorage.removeItem(ASIDE_INDEX); }catch(_){ } }
// Copies présentes, de la plus récente à la plus ancienne — lues dans le stockage lui-même, pas
// dans l’index (une écriture peut avoir échoué après l’avoir mis à jour).
function asideCopies(){
  const idx = asideIndex(), out = [];
  try{ for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k && k.startsWith(ASIDE_PREFIX)){ const id = k.slice(ASIDE_PREFIX.length); out.push({ id, key:k, at:+idx[id]||0 }); } } }catch(_){ }
  return out.sort((a,b)=>b.at-a.at);
}
// Poids du stockage local : deux octets par caractère (UTF-16), comme le compte le navigateur.
function lsBytes(){ let n = 0; try{ for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k)||'').length)*2; } }catch(_){ } return n; }
function readAside(id){ try{ const d = JSON.parse(localStorage.getItem(asideKey(id))||'null'); return (d && typeof d==='object' && Array.isArray(d.books)) ? d : null; }catch(_){ return null; } }
function dropAside(id){
  try{ localStorage.removeItem(asideKey(id)); }catch(_){ }
  const idx = asideIndex(); if(hasOwn(idx, id)){ delete idx[id]; saveAsideIndex(idx); }
}
// Met de côté la bibliothèque de l’appareil pour le compte `id`. Renvoie false si rien n’a pu être
// écrit (stockage plein malgré les purges) : l’appelant propose alors un téléchargement.
function setAsideFor(id){
  let raw = ''; try{ raw = localStorage.getItem(LS_KEY)||''; }catch(_){ }
  if(!raw || _saveBroken) raw = JSON.stringify(state);          // la dernière écriture a échoué : l’écran est la vérité
  const key = asideKey(id), idx = asideIndex();
  let cur = ''; try{ cur = localStorage.getItem(key)||''; }catch(_){ }
  const others = asideCopies().filter(c=>c.id!==id);            // du plus récent au plus ancien
  const need = ()=> lsBytes() - (cur.length ? (key.length+cur.length)*2 : 0) + (key.length+raw.length)*2;
  while(others.length && (others.length>=MAX_ASIDE || need()>LS_BUDGET)){ const old = others.pop(); try{ localStorage.removeItem(old.key); }catch(_){ } delete idx[old.id]; }
  try{ localStorage.setItem(key, raw); idx[id] = Date.now(); saveAsideIndex(idx); return true; }
  catch(_){ saveAsideIndex(idx); return false; }
}
function setAsideBeforeWipe(id){ if(!setAsideFor(id)) wipeFallback(); }
// Compte supprimé : sa copie mise de côté, s’il en reste une ici, redevient à personne — donc
// restaurable — au lieu de rester à jamais « d’un autre compte » qui n’existe plus.
function disownAside(id){
  const d = readAside(id); if(!d) return;
  d.meta = Object.assign({}, d.meta, { ownerId:null, ownerName:null, libRev:0, deletedBooks:{}, syncFp:normalizeSyncFp(null) });
  try{ localStorage.setItem(asideKey(id), JSON.stringify(d)); }catch(_){ }
}
// Même chose pour la version qu’une restauration a remplacée (-prerestore:<compte>) : sans cela
// elle restait à jamais « d’un autre compte », donc irrécupérable par l’interface. Elle rejoint
// l’emplacement sans propriétaire s’il est libre ; sinon elle garde sa clé mais perd son
// propriétaire (restorableBy lit le propriétaire DANS la copie), sans rien écraser.
function disownPreRestore(id){
  if(!id) return;
  const from = LS_KEY+preRestoreKey(id), to = LS_KEY+preRestoreKey('');
  try{
    const raw = localStorage.getItem(from); if(!raw) return;
    const d = JSON.parse(raw);
    d.meta = Object.assign({}, d.meta, { ownerId:null, ownerName:null, libRev:0, deletedBooks:{} });
    const free = !localStorage.getItem(to);
    localStorage.setItem(free ? to : from, JSON.stringify(d));
    if(free) localStorage.removeItem(from);
    localStorage.removeItem(LS_KEY+PRE_RESTORE_FP+':'+id);   // la marque « essai » ne parlait que de ce compte
  }catch(_){ }
}
// rattache la biblio locale au compte courant + à une révision serveur (persisté → survit au reload).
// `base` (facultatif) : empreintes de la version du compte que porte cette révision — la base de la
// prochaine fusion à trois voies (voir normalizeSyncFp). Une bibliothèque qui change de
// propriétaire perd la sienne : elle ne parlait que de l’ancien compte.
function libTag(rev, base){
  state.meta = state.meta || {};
  if(social.me){
    if(state.meta.ownerId!==social.me.id) state.meta.syncFp = normalizeSyncFp(null);
    state.meta.ownerId = social.me.id; state.meta.ownerName = social.me.username || null;
  }
  if(rev!=null){ state.meta.libRev = rev; social.libRev = rev; }
  if(base) state.meta.syncFp = { ...emptySyncBase(), ...base, rev: (+state.meta.libRev) || 0 };
}
function libPersist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(_){ } }
// Ce que la fusion compare d’une liste, d’une note de série, d’une collection. Les livres d’une liste
// n’y sont pas : ils restent unis (pas de marqueur de retrait — les départager ferait d’un import
// ancien sur un appareil un retrait sur tous les autres).
const listComparable = l => JSON.stringify([String((l&&l.name)||''), String((l&&l.desc)||'')]);
const seriesComparable = v => JSON.stringify([(v && v.rating!=null) ? v.rating : null, String((v&&v.review)||''), !!(v&&v.favorite), (v && Array.isArray(v.moods)) ? v.moods : []]);
const smartComparable = c => JSON.stringify({ name:(c&&c.name)||'', f:(c&&c.f)||{} });
// Empreinte d’un livre DE L’ÉTAT, mémorisée. Chaque envoi les reprend toutes (c’est la base de
// fusion), or normalizeBook et deux hachages par livre finissent par se sentir sur un téléphone
// au-delà du millier de livres. La clé est l’objet livre, que l’interface modifie en place : son
// JSON dit s’il a changé depuis ; un état remplacé (replaceState) emporte ses entrées avec lui.
const _fpMemo = new WeakMap();
function memoFingerprint(b){
  const s = JSON.stringify(b), hit = _fpMemo.get(b);
  if(hit && hit.s===s) return hit.fp;
  const fp = bookFingerprint(b);
  _fpMemo.set(b, { s, fp });
  return fp;
}
// Empreintes d’une version du compte — celle qu’on reçoit ou celle qu’on envoie (démo exclue : elle
// n’y va jamais). Voir normalizeSyncFp. `fpOf` : l’appelant qui a déjà de quoi les calculer le passe.
function syncFingerprints(st, fpOf=bookFingerprint){
  const out = emptySyncBase(), okId = id => id!=='__proto__' && ID_RE.test(String(id||''));
  for(const b of ((st&&st.books)||[])) if(b && !isDemoBook(b) && okId(b.id)) out.books[b.id] = fpOf(b);
  for(const l of ((st&&st.lists)||[])) if(l && okId(l.id)) out.lists[l.id] = comparableFingerprint(listComparable(l));
  for(const [k, v] of Object.entries((st&&st.series)||{})) if(k && k!=='__proto__') out.series[k] = comparableFingerprint(seriesComparable(v));
  for(const c of ((st&&st.smartCollections)||[])) if(c && okId(c.id)) out.smart[c.id] = comparableFingerprint(smartComparable(c));
  return out;
}
// Base utilisable pour fusionner l’état `st` : seulement si elle a été posée à SA révision. Sinon
// (ancienne installation, première synchro après la mise à jour, libRev avancé sans elle) : aucune.
function syncBase(st){
  const m = st && st.meta, fp = m && m.syncFp;
  if(!fp || typeof fp!=='object' || ((+fp.rev)||0)!==((+m.libRev)||0)) return emptySyncBase();
  return { ...emptySyncBase(), ...normalizeSyncFp(fp) };
}
// Empreinte de base d’un élément, ou null : lecture sûre (une série peut s’appeler « constructor »).
function baseFp(section, key){ return (section && hasOwn(section, key)) ? section[key] : null; }
// L’état sans sa base de fusion : ce qui sort de l’appareil (compte, export). La base est par
// appareil — sur le compte, un autre appareil la prendrait pour la sienne ; dans un export, elle
// n’est que du bruit (replaceLocalLibrary l’ignorerait de toute façon).
function withoutSyncBase(st){
  if(!st || !st.meta || st.meta.syncFp===undefined) return st;
  const meta = { ...st.meta }; delete meta.syncFp;
  return { ...st, meta };
}
function scheduleLibPush(delay=1400){
  if(!libraryReady()) return;
  _libDirty = true; clearTimeout(_libPushTimer); _libPushTimer = 0;
  if(!navigator.onLine){ setLibStatus('offline'); return; }
  _libPushTimer = setTimeout(()=>{ _libPushTimer=0; pushLibrary(); }, delay);
  scheduleShelfPush();
}
// état à sauvegarder sur le compte : identique à state, sans les livres de démonstration ni la base
// de fusion (propre à l’appareil, voir withoutSyncBase)
function libraryPayload(){
  // Invariant défensif avant tout envoi : aucun livre présent ne porte de marqueur de suppression
  // (sinon un autre appareil l’effacerait à sa fusion) — le marqueur cède, jamais le livre.
  const deleted = state.meta && state.meta.deletedBooks;
  if(deleted) for(const b of state.books) if(hasOwn(deleted, b.id)) delete deleted[b.id];
  const st = withoutSyncBase(state);
  if(!st.books.some(isDemoBook)) return st;
  const books = st.books.filter(b=>!isDemoBook(b));
  const ids = new Set(books.map(b=>b.id));
  return { ...st, books, lists:(st.lists||[]).map(l=>({ ...l, bookIds:(l.bookIds||[]).filter(id=>ids.has(id)) })) };
}
async function pushLibrary(opts){
  if(!libraryReady()) return false;
  const session = _libReadySession;
  if(_libPushing){ _libDirty = true; return false; }         // une seule requête à la fois
  // _libPushing porte la session : si elle est abandonnée pendant l’envoi (déconnexion, autre
  // compte), le finally de cet envoi ne touche plus à l’état de la suivante.
  _libPushing = session; _libDirty = false; clearTimeout(_libPushTimer); _libPushTimer = 0; setLibStatus('saving');
  try{
    const payload = libraryPayload();
    // Empreintes de CE QUI PART, prises maintenant : si le compte l’accepte, c’est la nouvelle base
    // de fusion — pas l’état à l’arrivée de la réponse, qu’une retouche a pu changer entre-temps.
    const sent = syncFingerprints(payload, memoFingerprint);
    const body = JSON.stringify({ data: JSON.stringify(payload), baseRev: social.libRev||0 });
    // keepalive : les navigateurs plafonnent le corps à ~64 Ko — au-delà, la requête échoue
    // silencieusement ; on retombe alors sur un fetch normal (best-effort à la fermeture).
    const keep = !!(opts&&opts.keepalive) && body.length < 60000;
    const res = await fetch(API_BASE+'/api/library', { method:'POST', keepalive: keep,
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+session.token },
      body });
    if(!currentLibrarySession(session)) return false;        // compte quitté pendant l’envoi : réponse sans objet
    if(res.status===409){                                     // un autre appareil a écrit entre-temps
      const d = await res.json();
      if(!libraryReady()) return false;
      backupLocal('-conflit');
      const merged = mergeLibraries(state, JSON.parse(d.data));
      const report = mergeReport(merged);
      replaceState(merged); state.meta.mergeConflicts=0;
      libTag(d.rev, merged.meta.syncFp); libPersist(); scheduleRender();   // nouvelle base : la version du compte qu’on vient d’intégrer
      setLibStatus('conflict');
      toast(report || 'Bibliothèque fusionnée avec un autre appareil ✓');
      scheduleLibPush();                                      // re-pousse la fusion
    } else if(res.ok){ const d = await res.json(); if(!libraryReady()) return false; _libRetryMs=2000; libTag(d.rev, sent); libPersist(); setLibStatus('saved');
      dropAside(session.id);                                  // le compte a tout : la copie mise de côté (fusionnée à la connexion) n’a plus d’objet
      return true; }
    else if(res.status===401){ flagSessionExpired(); }       // le jeton est bien le courant (vérifié juste au-dessus)
    else if(res.status===428){ social.tosOutdated=true; setLibStatus(''); if(ui.view==='friends') renderFriends(); }
    // 413 : la bibliothèque dépasse la limite du serveur — réessayer n’y changera rien, il faut exporter
    else if(res.status===413){ setLibStatus('tooLarge'); }
    else if(res.status===429 || res.status>=500){ setLibStatus('error'); _libDirty=true; _libRetryMs=Math.min(_libRetryMs*2,120000); }
    else { setLibStatus('error'); }
  }catch(e){ if(!currentLibrarySession(session)) return false; setLibStatus('offline'); _libDirty = true; _libRetryMs=Math.min(_libRetryMs*2,120000); }
  finally{
    if(_libPushing===session){
      _libPushing = false;
      if(_libDirty && navigator.onLine && !_libPushTimer && libraryReady()) scheduleLibPush(_libRetryMs);
    }
  }
  return false;
}
// Vide la file d’envoi avant une action qui coupe la sauvegarde (déconnexion). pushLibrary rend la
// main tout de suite si une requête est déjà en vol : on l’attend (15 s au plus, on ne bloque pas
// l’utilisateur indéfiniment) avant de pousser ce qui reste. Au retour, _libDirty dit la vérité :
// vrai = le serveur n’a pas tout pris.
async function flushLibrary(){
  for(let i=0; _libPushing && i<60; i++) await new Promise(r=>setTimeout(r, 250));
  if(_libDirty) await pushLibrary();
}
// Adopte la bibliothèque du serveur (cas : appareil vierge, ou écran vidé après la mise de côté
// de la bibliothèque d’un AUTRE compte). La copie « -preacct » n’a de sens que s’il y a quelque
// chose à garder : un état vide ne doit pas écraser une copie de secours encore utile.
function adoptServerLibrary(d){
  if(!d || !d.data) return;
  if((state.books||[]).some(b=>!isDemoBook(b))) backupBeforeWipe('-preacct');
  // la base de fusion est recalculée sur ce qu’on adopte : celle qui traînerait dans la version du
  // compte (déposée par un client antérieur, qui renvoie les clés qu’il ne connaît pas) est d’un autre appareil
  try{ replaceState(JSON.parse(d.data)); libTag(d.rev, syncFingerprints(state)); libPersist(); scheduleRender(); }
  catch(e){ setLibStatus('error'); }
}
// Fusion SANS perte : union des livres (id + clé titre|auteur|tome), listes, objectifs, collections, séries.
function libMergeKey(b){ return (String(b.title||'').toLowerCase()+'|'+((b.authors||[])[0]||'').toLowerCase()+'|'+(b.volume??'')).replace(/[^a-z0-9à-ÿ]/g,''); }
// Tag posé sur la copie locale d’un livre en conflit de fusion. L’ancien « conflit-sync » reste
// reconnu (bibliothèques déjà fusionnées) : les deux mènent au même filtre.
const CONFLICT_TAG = 'à réconcilier';
const CONFLICT_TAGS = [CONFLICT_TAG, 'conflit-sync'];
const hasConflictTag = b => (b.tags||[]).some(t=>CONFLICT_TAGS.includes(t));
const withConflictTag = b => { b.tags = [...new Set([...(b.tags||[]), CONFLICT_TAG])].slice(0,20); return b; };
// Contenu d’un livre sans son identité (id, date d’ajout) ni l’étiquette de conflit : deux copies
// qui ne diffèrent que par là sont le même livre — sinon la copie étiquetée par une fusion et la
// copie encore vierge de l’autre appareil se dédoubleraient à la fusion suivante.
function bookComparable(b){
  const x = normalizeBook(b);
  delete x.id; delete x.addedAt;
  x.tags = (x.tags||[]).filter(t=>!CONFLICT_TAGS.includes(t));
  return JSON.stringify(x);
}
// Empreinte courte (deux hachages 32 bits indépendants, base 36) : ce qu’un marqueur de suppression
// mémorise du livre supprimé, pour reconnaître plus tard une copie restée identique ailleurs — et ce
// que la base de fusion (meta.syncFp) mémorise de chaque livre tel que synchronisé.
// comparableFingerprint part du texte de bookComparable : la fusion, qui l’a déjà, ne le recalcule pas.
function comparableFingerprint(s){
  let h = 0x811c9dc5; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193)>>>0; }
  return shelfHash(s)+'.'+h.toString(36);
}
function bookFingerprint(b){ return comparableFingerprint(bookComparable(b)); }
// Phrase du toast après une fusion (409 ou connexion) : conflits de versions et livres gardés malgré
// une suppression ailleurs. Retire le compteur transitoire mergeKept AVANT que l’état ne soit adopté.
function mergeReport(merged){
  const conflicts = merged.meta.mergeConflicts||0, kept = merged.meta.mergeKept||0;
  delete merged.meta.mergeKept;
  const parts = [];
  if(conflicts) parts.push(`${plur(conflicts,'livre existe','livres existent')} en deux versions, marquées « ${CONFLICT_TAG} »`);
  if(kept) parts.push(`${plur(kept,'livre modifié','livres modifiés')} ailleurs après ${kept>1?'leur':'sa'} suppression, gardé${kept>1?'s':''} « ${CONFLICT_TAG} »`);
  return parts.length ? 'Fusion faite ✓ '+parts.join(' ; ') : '';
}
// Fusion à TROIS voies : `localSt` apporte sa base (meta.syncFp, voir normalizeSyncFp), c’est-à-dire
// l’empreinte de chaque livre — et de chaque intitulé de liste, note de série, collection — dans la
// dernière version du compte que l’appareil a intégrée. Pour un même élément (même id) qui diffère
// entre les deux côtés :
//   seul le compte a changé depuis la base  → on prend la version du compte (l’appareil était en retard) ;
//   seul le local a changé                  → on garde la version locale (le compte en était resté à la base) ;
//   les deux ont changé, ou base inconnue   → les DEUX sont gardées, la locale étiquetée (règle d’origine).
// Le reste ne change pas : union de ce qui n’existe que d’un côté (livres, listes, livres d’une
// liste), marqueurs de suppression appliqués avant tout, objectif le plus haut. La base sert aussi
// aux marqueurs (une copie restée à la base n’a pas été « modifiée après » la suppression), et les
// livres de même id passent AVANT ceux qu’on rapproche par titre (deux passes, voir plus bas).
// `fromAccount` : le second argument est une version du compte (lecture à la connexion, réponse 409).
// Faux pour une copie mise de côté, fusionnée avec l’état de l’appareil : deux états locaux, sans
// ancêtre commun fiable → deux voies, et la base du résultat est l’affaire de l’appelant.
function mergeLibraries(localSt, serverRaw, fromAccount=true){
  const out = normalizeData(serverRaw);
  const base = fromAccount ? syncBase(localSt) : emptySyncBase();
  // Base de la PROCHAINE fusion : la version du compte qu’on intègre ici, telle que reçue (avant
  // les marqueurs). Jamais celle que le blob transporterait : elle serait d’un autre appareil.
  // L’appelant la pose avec la révision (libTag) ; `theirs` sert aussi, plus bas, à savoir si le
  // compte en est resté à la base. Le texte comparable de chaque livre du compte n’est calculé
  // qu’une fois (normalizeBook est le gros du coût d’une fusion).
  const cmpMemo = new Map();
  const comparable = b => { let s = cmpMemo.get(b); if(s===undefined){ s = bookComparable(b); cmpMemo.set(b, s); } return s; };
  const theirs = fromAccount ? syncFingerprints(out, b=>comparableFingerprint(comparable(b))) : emptySyncBase();
  out.meta.syncFp = { ...theirs, rev:0 };
  // Marqueurs de suppression : union des deux côtés, puis application — ici et nulle part ailleurs.
  // Côté serveur, un livre marqué disparaît s’il est resté tel qu’au moment de la suppression ;
  // modifié après (autre appareil), il est gardé sous un nouvel id, étiqueté : jamais de perte muette.
  // « Modifié après » se juge AUSSI sur la base, des deux côtés : l’empreinte du marqueur est celle
  // de la dernière version supprimée, pas forcément celle que l’autre côté connaissait. Un livre
  // retouché PUIS supprimé hors ligne retrouvait sur le compte sa version d’avant la retouche, que
  // personne n’avait touchée : elle ressuscitait étiquetée, et l’annonce « modifié ailleurs » mentait.
  // Donc, quand c’est CET appareil qui porte le marqueur : la copie du compte restée égale à la base
  // de l’appareil part avec lui (même règle en miroir plus bas, pour la copie locale). Sans base,
  // rien ne change : dans le doute, on garde.
  const ownMarks = normalizeDeletedBooks(localSt.meta && localSt.meta.deletedBooks);
  const deleted = mergeDeletedBooks(out.meta.deletedBooks, ownMarks);
  out.meta.deletedBooks = deleted;
  let kept = 0;
  const serverRemap = new Map(), dropped = new Set();
  out.books = out.books.filter(b=>{
    const mark = deletionMark(deleted, b.id);
    if(!mark) return true;
    const there = comparableFingerprint(comparable(b)), was = baseFp(base.books, b.id);
    if(mark.fp===there || (was && was===there && deletionMark(ownMarks, b.id))){ dropped.add(b.id); return false; }
    const old = b.id; b.id = uid(); serverRemap.set(old, b.id); withConflictTag(b); kept++;
    return true;
  });
  if(serverRemap.size || dropped.size) for(const l of out.lists) l.bookIds = l.bookIds.filter(id=>!dropped.has(id)).map(id=>serverRemap.get(id)||id);
  const ids = new Set(out.books.map(b=>b.id)), keys = new Set(out.books.map(libMergeKey));
  const booksById = new Map(out.books.map(b=>[b.id,b])), booksByKey = new Map(out.books.map(b=>[libMergeKey(b),b]));
  const localIdMap = new Map();
  let conflicts = 0;
  // DEUX PASSES : d’abord les livres locaux dont l’id existe sur le compte (règle à trois voies),
  // ensuite ceux qu’il reste à rapprocher par titre|auteur|tome. En une seule passe, dans l’ordre
  // de l’état (les ajouts sont en tête), un livre rajouté pouvait être rapproché d’un livre du compte
  // identique, donc lâché au profit de celui-ci… que la retouche locale du MÊME id remplaçait
  // l’instant d’après : « tome 1 » renuméroté en « tome 2 » puis rajouté, et le tome 1 n’existait
  // plus nulle part, sans conflit annoncé. Le rapprochement se fait maintenant contre le contenu
  // définitif des livres du compte (booksByKey suit chaque remplacement).
  const locals = (localSt.books||[]).filter(Boolean);
  const ordered = [...locals.filter(b=>booksById.has(b.id)), ...locals.filter(b=>!booksById.has(b.id))];
  for(const b of ordered){
    if((b.tags||[]).includes('exemple')) continue;                 // ne pas réinjecter la démo
    // Même règle côté local : supprimé ailleurs et inchangé ici → la suppression l’emporte ;
    // modifié ici → il continue comme n’importe quel livre, sous un nouvel id et étiqueté.
    // « Inchangé ici » : égal à la version supprimée, ou resté à la base de l’appareil. Noté PUIS
    // supprimé ailleurs, le livre d’un appareil simplement en retard n’a pas l’empreinte du marqueur.
    const mark = deletionMark(deleted, b.id);
    if(mark){ const fpHere = bookFingerprint(b); if(mark.fp===fpHere || baseFp(base.books, b.id)===fpHere) continue; }
    const key=libMergeKey(b), existing=booksById.get(b.id)||booksByKey.get(key);
    if(existing){
      const here = bookComparable(b), there = comparable(existing);
      if(here===there){
        localIdMap.set(b.id, existing.id);
        continue;
      }
      // Trois voies : seulement pour LE MÊME livre (même id, sans marqueur en jeu) dont la base est
      // connue. Un rapprochement par titre|auteur|tome entre deux id différents reste à deux voies :
      // la base ne dit rien du livre d’en face.
      const was = (existing.id===b.id && !mark) ? baseFp(base.books, b.id) : null;
      if(was && comparableFingerprint(here)===was){               // inchangé ici depuis la base : le compte a la suite
        localIdMap.set(b.id, existing.id);
        continue;
      }
      if(was && comparableFingerprint(there)===was){              // le compte en est resté à la base : la retouche locale la remplace
        const nb = normalizeBook(b);
        out.books[out.books.indexOf(existing)] = nb; booksById.set(nb.id, nb);
        if(booksByKey.get(libMergeKey(existing))===existing) booksByKey.delete(libMergeKey(existing));
        if(!booksByKey.has(key)) booksByKey.set(key, nb);
        keys.add(key); localIdMap.set(b.id, nb.id);
        continue;
      }
      // Vrai conflit (les deux côtés ont changé), ou pas de base : sans historique champ par champ,
      // choisir silencieusement un côté détruirait l’autre version.
      // On conserve donc les DEUX livres : la copie locale est clairement marquée et reçoit un nouvel
      // id uniquement en cas de collision. L’utilisateur peut ensuite réconcilier les versions.
      const localCopy = normalizeBook(b);
      if(ids.has(localCopy.id) || mark) localCopy.id = uid();
      withConflictTag(localCopy);
      out.books.push(localCopy); ids.add(localCopy.id); keys.add(libMergeKey(localCopy));
      booksById.set(localCopy.id, localCopy); localIdMap.set(b.id, localCopy.id); conflicts++;
      continue;
    }
    const nb = normalizeBook(b);
    if(mark){ nb.id = uid(); withConflictTag(nb); kept++; }
    out.books.push(nb); ids.add(nb.id); keys.add(libMergeKey(nb)); booksById.set(nb.id,nb); booksByKey.set(libMergeKey(nb),nb);
    localIdMap.set(b.id, nb.id);
  }
  const byId = new Map(out.lists.map(l=>[l.id,l]));
  for(const l of (localSt.lists||[])){
    const mappedIds = (l.bookIds||[]).map(id=>localIdMap.get(id)||id);
    if(byId.has(l.id)){
      const t=byId.get(l.id);
      t.bookIds=[...new Set([...t.bookIds, ...mappedIds])];
      // un renommage / une description locale divergente ne doit pas disparaître : on préserve la
      // version locale comme liste distincte (les livres, eux, sont déjà unionnés juste au-dessus).
      // Trois voies d’abord, comme pour les livres : intitulé resté à la base ici → celui du compte
      // suffit ; resté à la base sur le compte → celui d’ici le remplace ; sinon, les deux listes.
      if((l.name||'')!==(t.name||'') || (l.desc||'')!==(t.desc||'')){
        const was = baseFp(base.lists, l.id);
        if(was && comparableFingerprint(listComparable(l))===was) continue;
        if(was && baseFp(theirs.lists, l.id)===was){ t.name = l.name; t.desc = l.desc; continue; }
        out.lists.push({ ...l, id: uid(), name: (l.name||'Liste')+' ('+CONFLICT_TAG+')', bookIds: mappedIds });
        conflicts++;
      }
    }
    else out.lists.push({...l, bookIds:mappedIds});
  }
  for(const [y,v] of Object.entries(localSt.goals||{})) out.goals[y] = Math.max(out.goals[y]||0, +v||0);
  // séries : le serveur reste la valeur courante, mais on ne détruit JAMAIS une note/critique locale
  // divergente — la critique est rattachée sous un marqueur de conflit, la note/favori récupérés si
  // le serveur n’en a pas. (L’ancien Object.assign faisait gagner le serveur en silence.)
  out.series = out.series || {};
  for(const [name, loc] of Object.entries(localSt.series||{})){
    const srv = out.series[name];
    if(!srv){ out.series[name] = loc; continue; }
    if(JSON.stringify(loc)===JSON.stringify(srv)) continue;
    // Trois voies : sans elles, un appareil en retard recollait son ancienne critique sous la nouvelle.
    const was = baseFp(base.series, name);
    if(was && comparableFingerprint(seriesComparable(loc))===was) continue;          // rien changé ici : le compte a la suite
    if(was && baseFp(theirs.series, name)===was){ out.series[name] = loc; continue; }   // rien changé sur le compte : la retouche d’ici
    const locRev=(loc&&loc.review||'').trim(), srvRev=(srv&&srv.review||'').trim();
    if(locRev && locRev!==srvRev){ srv.review = (srvRev?srvRev+'\n\n':'')+CONFLICT_TAG+' : '+locRev; conflicts++; }
    if(srv.rating==null && loc && loc.rating!=null) srv.rating = loc.rating;
    if(!srv.favorite && loc && loc.favorite) srv.favorite = true;
  }
  // collections intelligentes : union par id ; une locale modifiée (même id, contenu différent)
  // est préservée sous un nouvel id plutôt qu’ignorée silencieusement.
  // Trois voies là aussi : seule celle que les DEUX côtés ont retouchée depuis la base est dédoublée.
  const scById = new Map((out.smartCollections||[]).map(c=>[c.id,c]));
  for(const c of (localSt.smartCollections||[])){
    const t = scById.get(c.id);
    if(!t){ out.smartCollections.push(c); scById.set(c.id,c); continue; }
    if(smartComparable(c)===smartComparable(t)) continue;
    const was = baseFp(base.smart, c.id);
    if(was && comparableFingerprint(smartComparable(c))===was) continue;
    if(was && baseFp(theirs.smart, c.id)===was){ out.smartCollections[out.smartCollections.indexOf(t)] = c; scById.set(c.id, c); continue; }
    out.smartCollections.push({ ...c, id: uid(), name: (c.name||'Collection')+' ('+CONFLICT_TAG+')' }); conflicts++;
  }
  // compteur d’export : garder la date la plus récente
  if(localSt.meta && localSt.meta.lastExport && (!out.meta.lastExport || localSt.meta.lastExport > out.meta.lastExport)) out.meta.lastExport = localSt.meta.lastExport;
  out.meta.mergeConflicts = conflicts;
  out.meta.mergeKept = kept;                                     // transitoire, lu et retiré par mergeReport
  return out;
}
// À la connexion : réconcilie la biblio locale avec celle du compte, SANS perte ni fuite entre comptes.
// Renvoie vrai quand la bibliothèque du compte est prête (libraryReady) — avant, rien ne part.
function syncLibraryOnLogin(){
  // Un chargement déjà en cours pour ce compte (démarrage + retour du réseau, par exemple) : on
  // s’y joint au lieu de le recommencer et de gaspiller une lecture du quota.
  if(_libSyncPromise && _libSession && currentLibrarySession(_libSession)) return _libSyncPromise;
  const p = loadAccountLibrary();
  _libSyncPromise = p;
  const done = ()=>{ if(_libSyncPromise===p) _libSyncPromise = null; };
  p.then(done, done);
  return p;
}
async function loadAccountLibrary(){
  if(!social.me || social.tosOutdated) return false;
  const session = accountSession();
  if(!currentAccount(session)) return false;
  if(!_libSession || _libSession.id!==session.id) _libRetryDelay = 15000;   // l’attente croissante est par compte
  resetLibrarySync();
  _libSession = session;
  const myId = session.id;
  try{
    let localOwner = (state.meta && state.meta.ownerId) || '';
    let wiped = false;
    // Pas d'heuristique « même pseudo ⇒ compte recréé » : un pseudo libéré par la suppression d'un
    // compte peut être repris par quelqu'un d'autre ; sur un appareil partagé, rattacher la
    // bibliothèque de l'ancien titulaire à ce nouveau compte serait une fuite. Une bibliothèque
    // d'un autre identifiant est donc toujours mise de côté (décision du propriétaire, 9/09).
    if(localOwner && localOwner!==myId){
      // La biblio locale appartient à QUELQU’UN D’AUTRE (appareil partagé) : mise de côté et écran
      // vidé AVANT d’interroger le serveur — ainsi ce compte ne voit jamais l’autre bibliothèque,
      // même si la requête échoue (hors ligne, panne). Avant, l’échec la laissait affichée.
      let persisted = null; try{ persisted = JSON.parse(localStorage.getItem(LS_KEY)||'null'); }catch(_){ }
      const persistedOwner = (persisted && persisted.meta && persisted.meta.ownerId) || '';
      if(persistedOwner===myId){ replaceState(persisted); _externalState = null; }   // un autre onglet a déjà fait ce ménage : on prend sa version
      else { setAsideBeforeWipe(localOwner); replaceState({}); libTag(0); libPersist(); wiped = true; }
      scheduleRender();
    }
    // Une bibliothèque à personne n’a jamais rien synchronisé avec ce compte : pas de base de fusion
    // (c’est déjà le cas par construction ; garde contre un état laissé par une version antérieure).
    if(!localOwner){ state.meta = state.meta || {}; state.meta.syncFp = normalizeSyncFp(null); }
    // Copie mise de côté pour CE compte (déconnexion avec « Retirer », ou passage d’un autre compte
    // sur l’appareil) : fusionnée dans l’état courant AVANT toute lecture du serveur — hors ligne
    // compris —, elle porte peut-être des modifications que le compte n’a jamais reçues. Purgée au
    // premier envoi réussi ; d’ici là, la refusionner ne change rien (union).
    // Fusion à deux voies (deux états locaux), mais la BASE de la copie est reprise : c’est ce que
    // cet appareil avait synchronisé avec ce compte avant d’être mis de côté. Grâce à elle, la
    // fusion avec le compte qui suit ne dédouble pas les livres que la copie n’a pas touchés. Si
    // l’état courant est déjà à ce compte, sa propre base, plus récente, passe devant.
    const aside = readAside(myId);
    if(aside){
      const asideSt = normalizeData(aside);
      const asideBase = syncBase(asideSt), ownBase = (state.meta && state.meta.ownerId===myId) ? syncBase(state) : emptySyncBase();
      const base = emptySyncBase();
      for(const k of Object.keys(base)) base[k] = { ...asideBase[k], ...ownBase[k] };
      const merged = mergeLibraries(asideSt, state, false);
      const report = mergeReport(merged), rev = (state.meta && +state.meta.libRev) || 0;   // la révision reste celle de l’appareil
      replaceState(merged); state.meta.mergeConflicts = 0; libTag(rev, base); libPersist(); scheduleRender();
      if(report) toast(report);
      else if((aside.books||[]).some(b=>!isDemoBook(b))) toast('Ta bibliothèque mise de côté sur cet appareil est de retour ✓');
    }
    let d;
    try{ d = await api('/api/library', { sessionToken: session.token }); }
    catch(e){
      if(!currentLibrarySession(session)) return false;
      if(e.status===428){ social.tosOutdated=true; setLibStatus(''); if(ui.view==='friends') renderFriends(); return false; }
      setLibStatus(e.message==='offline' ? 'offline' : 'error'); retryLibrarySync(session, e);
      return false;
    }
    if(!currentLibrarySession(session)) return false;        // compte quitté pendant la requête
    let server = null;
    if(d.exists){
      try{ server = JSON.parse(d.data); }catch(_){ }
      if(!server || typeof server!=='object' || !Array.isArray(server.books)) throw new Error('Bibliothèque invalide');
    }
    // (re)lus APRÈS la requête : l’utilisateur a pu ajouter un livre pendant qu’elle était en vol
    const localRev = (state.meta && +state.meta.libRev) || 0;
    const localHasReal = (state.books||[]).some(b=>!isDemoBook(b));
    _libRetryDelay = 15000;
    if(!d.exists){
      // compte sans biblio → migrer la biblio locale (à moi/anonyme). Un écran tout juste vidé n’a
      // rien à enregistrer : pas d’envoi à vide. Pas de version du compte, donc pas de base de fusion.
      libTag(0, {}); _libReadySession = session;
      if(!wiped || localHasReal) await pushLibrary();
      if(localHasReal) toast('Bibliothèque enregistrée sur ton compte ✓');
      return libraryReady();
    }
    if(wiped && !localHasReal){
      // écran vidé et rien ajouté depuis : la bibliothèque du compte, telle quelle
      adoptServerLibrary(d); _libReadySession = session;
      return libraryReady();
    }
    if(localRev === d.rev){
      // le local est basé sur la version serveur courante → il peut porter des édits non poussés → LE LOCAL GAGNE
      libTag(d.rev); _libReadySession = session; await pushLibrary();
      return libraryReady();
    }
    // divergence (autre appareil a avancé) ou 1re fois sur ce compte → FUSION sans perte + secours
    // (un local sans livre n’a rien à mettre à l’abri : il n’écrase pas une copie encore utile).
    // À trois voies dès que l’appareil a une base : ce qu’il n’a pas touché suit le compte sans doublon.
    if(!wiped && localHasReal) backupLocal('-preacct');
    const merged = mergeLibraries(state, server);
    const report = mergeReport(merged);
    replaceState(merged); state.meta.mergeConflicts=0;
    libTag(d.rev, merged.meta.syncFp); libPersist(); scheduleRender();   // nouvelle base : la version du compte qu’on vient d’intégrer
    _libReadySession = session;
    await pushLibrary();
    if(report) toast(report);
    else if(localHasReal) toast('Bibliothèques synchronisées ✓');
    return libraryReady();
  }catch(e){
    // bibliothèque serveur illisible, ou quota local plein : état d’erreur définitif, le local reste le filet
    if(currentLibrarySession(session)){ _libReadySession = null; setLibStatus('error'); retryLibrarySync(session, e); }
    return false;
  }
}
// Flush best-effort quand l’onglet se ferme/masque : pousse une sauvegarde en attente (keepalive
// survit à la fermeture) — évite de perdre une modif faite juste avant de quitter.
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && _libDirty && social.me && !_libPushing) pushLibrary({keepalive:true}); });
window.addEventListener('pagehide', ()=>{ if(_libDirty && social.me && !_libPushing) pushLibrary({keepalive:true}); });

/* ---- Étagère partagée : synchro AUTOMATIQUE ----
   Avant, le profil visible des amis n’existait qu’après un clic manuel dans « Amis › Partage » — un
   nouvel inscrit avait donc un profil vide. Désormais l’étagère suit la bibliothèque, en respectant
   le mode de partage : « Rien » = jamais rien envoyé ; « Notes seules » = critiques retirées CÔTÉ
   CLIENT. Débounce long + empreinte persistée : on n’appelle le serveur que si le contenu partagé a
   réellement changé (limite serveur : 40 synchros/h). Rattrapage à la connexion et au démarrage. */
const SHELF_TAG_KEY = 'tome-shelf-tag';
let _shelfTimer = 0, _shelfPushing = false, _shelfDirty = false, _shelfRetryMs = 5000;
function shelfPayload(mode){ const books = shareableBooks(); return mode==='ratings' ? books.map(b=>({...b, review:''})) : books; }
function shelfHash(s){ let h = 5381; for(let i=0;i<s.length;i++) h = ((h<<5)+h+s.charCodeAt(i))>>>0; return h.toString(36); }
// l’empreinte inclut l’id du compte : sur un appareil partagé, changer de compte force une resynchro
function shelfTag(mode, payload){ return (social.me?social.me.id:'')+':'+mode+':'+payload.length+':'+shelfHash(JSON.stringify(payload)); }
function rememberShelfTag(tag){ try{ localStorage.setItem(SHELF_TAG_KEY, tag); }catch(_){ } }
function scheduleShelfPush(delay=25000){
  if(!libraryReady() || (social.me.shareMode||'none')==='none') return;
  _shelfDirty = true; clearTimeout(_shelfTimer); _shelfTimer=0;
  if(!navigator.onLine) return;
  _shelfTimer = setTimeout(()=>{ _shelfTimer=0; pushShelf(); }, delay);
}
async function pushShelf(){
  if(!libraryReady()) return;                                // l’étagère est dérivée de la bibliothèque : pas avant qu’elle soit celle du compte
  const session = _libReadySession;
  if(_shelfPushing){ _shelfDirty = true; return; }
  const mode = social.me.shareMode||'none'; if(mode==='none') return;
  const payload = shelfPayload(mode); const tag = shelfTag(mode, payload);
  let prev = ''; try{ prev = localStorage.getItem(SHELF_TAG_KEY)||''; }catch(_){ }
  if(tag===prev){ _shelfDirty = false; return; }
  _shelfPushing = session; _shelfDirty = false;
  try{ await api('/api/sync', {sessionToken:session.token, method:'POST', body:{shareMode:mode, books:payload}}); if(!libraryReady() || session!==_libReadySession) return; rememberShelfTag(tag); _shelfRetryMs=5000; }
  catch(e){
    if(!currentLibrarySession(session)) return;
    _shelfDirty=true;
    if(e.message!=='offline' && e.status && e.status<500 && e.status!==429) _shelfDirty=false;
    else _shelfRetryMs=Math.min(_shelfRetryMs*2,120000);
  }
  finally{ if(_shelfPushing===session){ _shelfPushing = false; if(_shelfDirty && navigator.onLine && !_shelfTimer) scheduleShelfPush(_shelfRetryMs); } }
}
window.addEventListener('online', ()=>{
  // Connecté mais bibliothèque du compte jamais chargée (la requête a échoué hors ligne) : on la
  // recharge d’abord — rien ne part vers le compte avant.
  if(social.me && !social.tosOutdated && !libraryReady()){ syncLibraryOnLogin().then(ok=>{ if(ok) pushShelf(); }); return; }
  if(_libDirty) scheduleLibPush(0);
  if(_shelfDirty) scheduleShelfPush(0);
});
// Les quatre sous-onglets du réseau, dans l’ordre d’affichage : une seule source pour le rendu
// (renderFriends) et pour la navigation au clavier (flèches / Origine / Fin). « Compte » n’en
// fait plus partie : il a sa propre vue (#view-account), atteinte par l’avatar de l’en-tête.
const SOC_TABS = [['feed','Fil'], ['friends','Mes amis'], ['notifs','Notifs'], ['me','Partage']];
// Un seul vocabulaire pour dire le mode de partage — barre « moi », fiche livre, invitation.
const SHARE_WORD = { none:'rien', ratings:'notes seules', all:'notes et critiques' };
function shareMode(){ return (social.me && social.me.shareMode) || 'none'; }
function meBarShareHTML(){
  return `Amis&nbsp;: ${SHARE_WORD[shareMode()]} · Page publique&nbsp;: ${social.publicProfile?'en ligne':'non'}`;
}
// Repeint la seule ligne d’état : changer de partage ne doit pas reconstruire l’onglet sous le doigt.
function updateMeBarShare(){ const el = $('#me-share-line'); if(el) el.innerHTML = meBarShareHTML(); }
function renderFriends(){
  const box = $('#friends-body');
  // Ancien sous-onglet « Compte » (état hérité d’un chemin non migré) : il vit dans sa propre vue.
  if(social.tab==='account'){ social.tab='feed'; selectView('account'); return; }
  // L’onglet s’appelle « Amis » dans tous les cas. Hors session, il s’intitulait « Mon compte » et
  // proposait l’inscription pendant que la vraie vue Mon compte (bouton avatar) proposait la
  // connexion : deux portes du même nom vers la même chose. Ici on explique ce que les amis
  // apportent, et le formulaire suit (renderAuth).
  const h = $('#view-friends h2.section'); if(h) h.textContent = 'Amis';
  // Une session expirée s’explique : sans ça, le formulaire de connexion ressemble à une
  // déconnexion inexpliquée — et on proposerait de s’inscrire à quelqu’un qui a déjà un compte.
  if(!social.me){
    if(social.sessionExpired) renderAuth(box, 'login', 'Ta session a expiré. Reconnecte-toi pour retrouver ton compte et la sauvegarde de ta bibliothèque.');
    else renderAuth(box);
    return;
  }
  const fab = $('#fab'); if(fab) fab.hidden = false;   // caché par renderAuth tant qu’on n’était pas connecté
  if(social.invite || loadPendingInvite()) processInvite(); // invitation (même persistée après un rechargement) traitée dès qu’on est connecté
  if(social.view==='profile' && social.profile){ renderProfile(box, social.profile); return; }
  box.innerHTML = `
    ${social.tosOutdated ? `<div class="invite-banner" id="tos-banner">Mentions légales mises à jour : ta bibliothèque est désormais sauvegardée sur ton compte (privée, exportable, supprimable).
      <button type="button" class="linkish" data-legal-view>Les lire</button>
      <button class="btn small primary" id="tos-accept" style="margin-left:8px">J’accepte</button></div>` : ''}
    <!-- La barre « moi » n’expose plus « Se déconnecter » (trop facile à toucher par erreur juste
         au-dessus des onglets) : elle devient elle-même le raccourci vers Compte, où la déconnexion
         a rejoint les autres actions sur ses données. role=button + tabindex : le clavier l’active
         (voir le keydown délégué plus bas), un <button> ne pouvant pas contenir ces blocs. -->
    <div class="me-bar" id="soc-me" role="button" tabindex="0">
      ${avatarHTML(social.me.displayName)}
      <div><b>${esc(social.me.displayName)}</b><div class="muted">@${esc(social.me.username)}</div></div>
      <span class="spacer"></span>
      <span class="me-go">Mon compte ›</span>
    </div>
    <!-- Qui voit quoi, en clair et en permanence : le réglage de partage ne se lisait qu’en ouvrant
         l’onglet Partage — on croyait donc partager (ou se cacher) sans le savoir. Posée SOUS la
         barre « moi » et non dedans : un bouton placé dans un role=button est inatteignable au
         lecteur d’écran, qui lit le contenu du bouton comme son nom et non comme des commandes. -->
    <div class="me-share"><span id="me-share-line">${meBarShareHTML()}</span>
      <button type="button" class="linkish" data-share-edit>Modifier</button></div>
    <div class="friends-sub" role="tablist" aria-label="Sections du réseau">
      ${SOC_TABS.map(([k,lbl])=>{
        const on = social.tab===k;
        // Notifs porte l’icône cloche et, s’il y a lieu, la pastille de non-lus (décorative :
        // le compte passe par le nom accessible, qui commence par le libellé visible pour que
        // la commande vocale « Notifs » atteigne bien l’onglet).
        const n = k==='notifs' ? (social.unreadNotifs||0) : 0;
        const alabel = k==='notifs' && n ? ` aria-label="Notifs, ${plur(n,'notification')} non lue${n>1?'s':''}"` : '';
        // tabindex roving : un seul onglet dans l’ordre de tabulation, les flèches font le reste.
        return `<button type="button" data-tab="${k}" id="soc-tab-${k}" role="tab" aria-controls="soc-tab"
          aria-selected="${on}" tabindex="${on?0:-1}"${alabel} class="${on?'on':''}"${k==='notifs'?' style="position:relative"':''}
          >${k==='notifs'?ic('bell',15):''}${lbl}${n?`<span class="sub-badge" aria-hidden="true">${n>9?'9+':n}</span>`:''}</button>`;
      }).join('')}
    </div>
    <div id="soc-tab" role="tabpanel" aria-labelledby="soc-tab-${social.tab}"></div>`;
  const tosA = $('#tos-accept');
  if(tosA) tosA.addEventListener('click', async ()=>{
    if(tosA.disabled) return; tosA.disabled = true;
    try{
      await api('/api/account/accept-tos', {method:'POST', body:{}});
      social.tosOutdated = false; toast('Merci ✓'); const bn=$('#tos-banner'); if(bn) bn.remove();
      await syncLibraryOnLogin(); await pushShelf();
    }
    catch(e){ tosA.disabled = false; toast(netMsg(e)); }
  });
  const tosL = box.querySelector('[data-legal-view]');
  if(tosL) tosL.addEventListener('click', ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}));
  if(social.tab==='feed') renderFeed();
  else if(social.tab==='friends') renderFriendsList();
  else if(social.tab==='notifs') renderNotifications();
  else renderMyShare();
}
// Vue « Mon compte » : en haut, ce qui dépend d’une session (formulaire de connexion ou réglages
// du compte) ; en dessous, les panneaux statiques d’index.html (Mes données, Affichage), qui
// valent avec ou sans compte — d’où une vue à part plutôt qu’un sous-onglet d’Amis.
function renderAccountView(){
  const box = $('#account-cloud'); if(!box) return;
  if(social.me){
    const fab = $('#fab'); if(fab) fab.hidden = false;   // caché par renderAuth tant qu’on n’était pas connecté
    renderAccount();
  }
  else if(social.sessionExpired) renderAuth(box, 'login', 'Ta session a expiré. Reconnecte-toi pour retrouver ton compte et la sauvegarde de ta bibliothèque.');
  else renderAuth(box, 'login');
  refreshDataPanel();
  const mail = $('#btn-contact'); if(mail) mail.href = contactHref('Question sur Tome');
  syncThemeSeg();
}
async function renderNotifications(){
  const el = $('#soc-tab'); el.innerHTML = `<p class="friends-empty">Chargement…</p>`;
  try{
    const d = await api('/api/notifications');
    let recos = []; try{ recos = (await api('/api/recos')).recos || []; }catch(_){ }
    // marquer lu dès l’ouverture (efface le compteur)
    if(social.unreadNotifs){ api('/api/notifications/read', {method:'POST', body:{}}).catch(()=>{}); social.unreadNotifs = 0; refreshSocBadge();
      const sb=$('#friends-body .sub-badge'); if(sb) sb.remove();
      // le nom accessible annonçait « N non lues » : sans pastille, on repasse au libellé visible seul
      const nb=$('#soc-tab-notifs'); if(nb) nb.removeAttribute('aria-label'); }
    if(!d.notifications.length && !recos.length){ el.innerHTML = `<p class="friends-empty">Aucune notification pour l’instant. Ajoute des amis et partage tes lectures !</p>`; return; }
    // résout le titre d’un livre à partir de sa clé (dans MA bibliothèque locale)
    const byKey = new Map(state.books.map(b=>[shelfKey(b), b]));
    const verb = { friend_request:'t’a envoyé une demande d’ami', friend_accept:'a accepté ta demande d’ami',
                   reaction:'a aimé ta lecture', comment:'a commenté ta lecture', reco:'te recommande un livre' };
    const recoHTML = recos.length ? `<div class="reco-list">` + recos.map(r=>`<div class="reco">
      <div class="reco-cov">${r.cover?`<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div>
      <div class="reco-body"><small>${esc(r.displayName)} te recommande</small><b>${esc(r.title)}</b>${r.authors?`<span>${esc(r.authors)}</span>`:''}${r.message?`<p class="reco-msg">❝ ${esc(r.message)}</p>`:''}
        <div class="notif-actions"><button class="btn small primary" data-reco-add="${esc(r.id)}">Ajouter à ma pile</button><button class="btn small" data-reco-dismiss="${esc(r.id)}">Ignorer</button></div></div>
    </div>`).join('') + `</div>` : '';
    el.innerHTML = recoHTML + d.notifications.map(n=>{
      const b = n.bookKey ? byKey.get(n.bookKey) : null;
      const book = b ? ` <b>${esc(fullTitle(b))}</b>` : '';
      const ic = { friend_request:'+', friend_accept:'✓', reaction:'♥', comment:'❝', reco:'✦' }[n.type] || '•';
      // une demande d’ami s’accepte ICI : c’est l’événement le plus important de l’app — et se
      // refuse ici aussi, sinon la seule issue était d’ignorer la ligne pour toujours.
      const actions = n.type==='friend_request' && n.actorId
        ? `<div class="notif-actions"><button class="btn small primary" data-accept="${esc(n.actorId)}">Accepter</button><button class="btn small" data-notif-refuse="${esc(n.actorId)}">Refuser</button></div>` : '';
      // Le nom est un vrai bouton (profil) : la ligne entière était cliquable sans être atteignable
      // au clavier ni annoncée comme un lien. Le clic sur le reste de la ligne mène au fil (plus bas).
      const who = n.username ? `<button type="button" class="linkish notif-who" data-profile-user="${esc(n.username)}"><b>${esc(n.displayName)}</b></button>` : `<b>${esc(n.displayName)}</b>`;
      return `<div class="notif${n.read?'':' unread'}" data-notif-type="${esc(n.type)}" data-book-key="${esc(n.bookKey||'')}" ${b?`data-profile-book="${esc(b.id)}"`:''}>
        ${avatarHTML(n.displayName,"sm")}
        <div class="notif-body"><span class="notif-ic">${ic}</span> ${who} ${verb[n.type]||''}${book}
          <span class="notif-when">${notifWhen(n.at)}</span>${actions}</div>
      </div>`;
    }).join('');
    el.onclick = async e=>{
      const ra = e.target.closest('[data-reco-add],[data-reco-dismiss]');
      if(ra){
        e.stopPropagation();
        const id = ra.dataset.recoAdd || ra.dataset.recoDismiss, added = !!ra.dataset.recoAdd;
        const r = recos.find(x=>x.id===id), card = ra.closest('.reco');
        if(added && r){
          const nb = normalizeBook({ title:r.title, authors:String(r.authors||'').split(/,\s*|\s*&\s*/).map(x=>x.trim()).filter(Boolean),
            type:r.type||'livre', series:r.series||'', volume:r.volume??null, cover:r.cover||'', status:'wishlist', tags:['reco'], review:'', readings:[] });
          if(!nb.cover && r.isbn) queueCovers([{ id:nb.id, isbn:r.isbn }]);
          state.books.unshift(nb); save(); render();
          toast(`« ${r.title} » ajouté à ta pile ✓`);
        }
        try{ await api('/api/reco/answer', { method:'POST', body:{ id, action: added ? 'added' : 'dismissed' } }); }catch(_){ }
        if(card) card.remove();
        return;
      }
      const acc = e.target.closest('[data-accept]');
      if(acc){
        if(acc.disabled) return; acc.disabled = true;
        try{ await api('/api/friends/accept', {method:'POST', body:{userId: acc.dataset.accept}});
          toast('Vous êtes maintenant amis ✓'); socRefresh(); renderNotifications(); }
        catch(err){ toast(netMsg(err)); acc.disabled = false; }
        return;
      }
      // Attribut à part (et non data-remove) : le délégué de #friends-body traite data-remove et
      // finit par loadFriendLists(), qui n’a pas de liste à repeindre depuis l’onglet Notifs.
      const ref = e.target.closest('[data-notif-refuse]');
      if(ref){
        if(ref.disabled) return; ref.disabled = true;
        try{ await api('/api/friends/remove', {method:'POST', body:{userId: ref.dataset.notifRefuse}});
          toast('Demande refusée'); socRefresh(); renderNotifications(); }
        catch(err){ toast(netMsg(err)); ref.disabled = false; }
        return;
      }
      const who = e.target.closest('[data-profile-user]');
      if(who){ openProfile(who.dataset.profileUser); return; }
      const row = e.target.closest('[data-notif-type]');
      if(!row) return;
      // « X a commenté ta lecture » doit MENER à cette conversation : le fil, déplié sur la bonne
      // ligne. Sans ça la notification renvoyait au profil de l’auteur, où la réponse n’est pas.
      const t = row.dataset.notifType, key = row.dataset.bookKey;
      if((t==='comment' || t==='reaction') && key && social.me) return openFeedThread(key);
    };
  }catch(e){ el.innerHTML = `<p class="friends-empty">${esc(netMsg(e))}</p>`; }
}
function notifWhen(ts){
  const s = Math.max(0, (Date.now()-ts)/1000);
  if(s<60) return 'à l’instant'; if(s<3600) return 'il y a '+Math.floor(s/60)+' min';
  if(s<86400) return 'il y a '+Math.floor(s/3600)+' h';
  return 'il y a '+Math.floor(s/86400)+' j';
}
async function renderAccount(){
  // Rendu dans la vue Mon compte (plus dans un sous-onglet d’Amis) : le conteneur est fixe.
  const el = $('#account-cloud'); if(!el || !social.me) return;
  el.innerHTML = `<div class="acct">
    <h4>Profil</h4>
    <input id="acc-dn" maxlength="40" value="${esc(social.me.displayName)}" placeholder="Nom affiché" aria-label="Nom affiché">
    <!-- La bio n’est jamais privée : le placeholder dit exactement qui la lit, page publique comprise. -->
    <textarea id="acc-bio" aria-label="Ma bio" rows="2" maxlength="300" placeholder="${social.publicProfile?'Bio, visible par tes amis et sur ta page publique':'Bio, visible par tes amis (et sur ta page si tu la publies)'}">${esc(social.me.bio||'')}</textarea>
    <button class="btn primary" id="acc-save">Enregistrer le profil</button>
    <h4>Mot de passe</h4>
    <div class="pw-wrap"><input id="acc-cur" aria-label="Mot de passe actuel" type="password" maxlength="256" autocomplete="current-password" placeholder="Mot de passe actuel">
      <button type="button" class="linkish pw-eye" data-pw-noun="le mot de passe actuel" aria-pressed="false" aria-label="Afficher le mot de passe actuel">Afficher</button></div>
    <div class="pw-wrap"><input id="acc-new" aria-label="Nouveau mot de passe" type="password" maxlength="256" autocomplete="new-password" placeholder="Nouveau (8 caractères min.)">
      <button type="button" class="linkish pw-eye" data-pw-noun="le nouveau mot de passe" aria-pressed="false" aria-label="Afficher le nouveau mot de passe">Afficher</button></div>
    <button class="btn" id="acc-pw">Changer le mot de passe</button>
    <h4>Notifications</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Recevoir une alerte quand un ami t’ajoute, aime ou commente une de tes lectures, même quand Tome est fermé. <span id="acc-push-state"></span></p>
    <div class="data-actions"><button class="btn" id="acc-push">${ic('bell',16)} Activer les notifications</button></div>
    <h4>Rappel de lecture</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Un mot chaque jour à l’heure choisie, avec ta lecture en cours. Nécessite les notifications ci-dessus.</p>
    <div class="data-actions"><select id="acc-rem" aria-label="Heure du rappel">${[['','Aucun rappel'],...Array.from({length:18},(_,i)=>[String(i+6),`${i+6} h`])].map(([v,l])=>`<option value="${v}"${String(social.me.reminderHour??'')===v?' selected':''}>${l}</option>`).join('')}</select><button class="btn" id="acc-rem-save">Enregistrer le rappel</button></div>
    <h4>Code de secours</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">La seule façon de récupérer ton compte si tu oublies ton mot de passe (aucun email n’est collecté). ${social.hasRecovery?'Un code est actif : le régénérer invalide l’ancien.':'<b>Aucun code actif</b>. Génère-le maintenant.'}</p>
    <div class="pw-wrap"><input id="acc-rec" aria-label="Mot de passe actuel (pour générer le code de secours)" type="password" maxlength="256" autocomplete="current-password" placeholder="Mot de passe actuel">
      <button type="button" class="linkish pw-eye" data-pw-noun="le mot de passe actuel" aria-pressed="false" aria-label="Afficher le mot de passe actuel">Afficher</button></div>
    <button class="btn" id="acc-rec-gen">${ic('key',16)} ${social.hasRecovery?'Régénérer mon code':'Générer mon code'}</button>
    <h4>Utilisateurs bloqués</h4>
    <div id="acc-blocks"><p class="friends-empty" style="padding:8px 0">Chargement…</p></div>
    <!-- « Compte et données » et non « Mes données » : le panneau local du même nom suit juste
         en dessous dans la vue, deux titres identiques rendraient la page illisible. -->
    <h4>Compte et données</h4>
    <div class="data-actions">
      <button class="btn" id="acc-export">${ic('download',15)} Exporter mes données (JSON)</button>
      <!-- Déplacé ici depuis la barre « moi » (F20). Placé contre « Se déconnecter partout » plutôt
           qu’en toute fin de section : les deux déconnexions se lisent et se comparent ensemble. -->
      <button class="btn" id="soc-logout">Se déconnecter</button>
      <button class="btn" id="acc-logoutall">Se déconnecter partout</button>
      <button class="btn" id="acc-legal">${ic('doc',15)} Mentions légales</button>
      <button class="btn" id="acc-pledge">${ic('heart',15)} Toujours gratuit</button>
      ${SUPPORT_URL ? `<a class="btn" id="acc-support" href="${SUPPORT_URL}" target="_blank" rel="noopener">\u2665 Soutenir Tome</a>` : ''}
    </div>
    <h4 style="color:var(--red)">Suppression du compte</h4>
    <div class="danger-zone">
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px">La suppression est <b>définitive</b> : ton profil, tes amis, ta bibliothèque privée sauvegardée et ton étagère partagée seront effacés du serveur. Ta bibliothèque locale, elle, reste sur cet appareil.</p>
      <button class="btn danger" id="acc-delete">Supprimer définitivement mon compte</button>
    </div>
  </div>`;
  $('#acc-save').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/profile', {method:'POST', body:{displayName:$('#acc-dn').value, bio:frTypo($('#acc-bio').value)}}); social.me=d.user; toast('Profil mis à jour ✓'); render(); }
    catch(err){ toast(netMsg(err)); b.disabled=false; } };
  $('#acc-pw').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ await api('/api/account/password', {method:'POST', body:{currentPassword:$('#acc-cur').value, newPassword:$('#acc-new').value}}); $('#acc-cur').value=$('#acc-new').value=''; toast('Mot de passe changé, autres appareils déconnectés ✓'); }
    catch(err){ toast(netMsg(err)); }
    finally{ b.disabled=false; } };
  $('#acc-rem-save').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{
      const v = $('#acc-rem').value; const hour = v==='' ? null : Number(v);
      if(hour!==null && (await pushState())!=='on'){ toast('Active d’abord les notifications (bouton ci-dessus).'); return; }
      const reading = state.books.find(x=>x.status==='reading' && !isDemoBook(x));
      const d = await api('/api/account/reminder', {method:'POST', body:{ hour, tz:new Date().getTimezoneOffset(), title: reading ? fullTitle(reading).slice(0,120) : '' }});
      social.me.reminderHour = d.reminderHour; social.me.reminderTitle = d.reminderTitle;
      toast(hour===null ? 'Rappel désactivé' : `Rappel réglé à ${hour} h ✓`);
    }catch(err){ toast(netMsg(err)); }
    finally{ b.disabled=false; } };
  (async ()=>{                                   // état réel des notifications (permission + abonnement)
    const st = await pushState(); const b = $('#acc-push'), lbl = $('#acc-push-state');
    if(!b) return;
    if(st==='unsupported'){ b.hidden = true; if(lbl) lbl.textContent = 'Non géré par ce navigateur.'; return; }
    if(st==='denied'){ b.disabled = true; b.innerHTML = ic('bell',16)+' Notifications bloquées'; if(lbl) lbl.textContent = 'À réautoriser dans les réglages de ton navigateur.'; return; }
    b.innerHTML = ic('bell',16) + (st==='on' ? ' Désactiver les notifications' : ' Activer les notifications');
    if(lbl) lbl.textContent = st==='on' ? 'Actives sur cet appareil.' : '';
    b.onclick = async ()=>{
      if(b.disabled) return; b.disabled = true;
      try{
        if(st==='on'){ await disablePush(); toast('Notifications désactivées'); }
        else if(await enablePush()) toast('Notifications activées ✓');
      }catch(err){ toast(netMsg(err)); }
      finally{ renderAccount(); }
    };
  })();
  $('#acc-rec-gen').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/recovery-code', {method:'POST', body:{password:$('#acc-rec').value}});
      $('#acc-rec').value=''; social.hasRecovery = true;
      await showRecoveryCode(d.recoveryCode); renderAccount(); }
    catch(err){ toast(netMsg(err)); b.disabled=false; } };
  $('#acc-export').onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    try{ const d = await api('/api/account/export'); const full={...d};
      // « Mes données » ne joint la bibliothèque locale que si c’est bien celle de CE compte,
      // chargée : sur un appareil partagé, celle d’un autre compte n’a rien à faire dans ce fichier.
      if(libraryReady()) full.localLibrary = state.books;
      const blob=new Blob([JSON.stringify(full,null,2)],{type:'application/json'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download='tome-mes-donnees-'+social.me.username+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      toast('Données exportées ✓'); }
    catch(err){ toast(netMsg(err)); }
    finally{ b.disabled=false; } };
  $('#acc-legal').onclick = ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]});
  $('#acc-pledge').onclick = showPledge;
  $('#soc-logout').onclick = socLogout;   // hors du délégué de #friends-body : le bouton n’y vit plus
  $('#acc-logoutall').onclick = async ()=>{
    if(!await uiConfirm({title:'Se déconnecter partout ?', message:'Toutes tes sessions seront fermées, y compris ici.', okLabel:'Déconnecter', danger:true})) return;
    const session = accountSession();
    let ok = true;
    try{ await api('/api/account/logout-all', {method:'POST'}); }catch(_){ ok = false; }
    if(!currentAccount(session)) return;                     // un autre onglet a changé de session entre-temps : ne pas effacer SON jeton
    resetLibrarySync(); _socUserToken='';
    try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} social.me=null; social.view=null; setFriendsBadge(0); render();
    toast(ok ? 'Déconnecté de tous tes appareils ✓' : 'Déconnecté ici. Les autres appareils n’ont pas pu être joints'); };
  $('#acc-delete').onclick = async ()=>{
    if(!await uiConfirm({title:'Supprimer ton compte ?', message:'Action IRRÉVERSIBLE. Ton profil, tes amis, ta bibliothèque privée sauvegardée et ton étagère partagée seront effacés du serveur. Ta bibliothèque locale reste sur cet appareil.', okLabel:'Continuer', danger:true})) return;
    const pw = await uiPrompt({title:'Confirme avec ton mot de passe', message:'Tape ton mot de passe pour supprimer définitivement le compte.', type:'password', okLabel:'Supprimer'});
    if(pw==null) return;
    const session = accountSession();
    try{ await api('/api/account/delete', {method:'POST', body:{password:pw}});
      if(!currentAccount(session)) return;
      resetLibrarySync(); _socUserToken='';
      // Le compte n’existe plus : la bibliothèque locale redevient « à personne » (sinon une
      // future inscription la prendrait pour celle d’un autre compte et la mettrait de côté), sans
      // révision, marqueurs de suppression ni base de fusion — ils ne parlaient qu’à ce compte. Une
      // copie mise de côté pour lui, s’il en reste une ici, redevient restaurable de la même façon.
      const mine = !!(state.meta && state.meta.ownerId===session.id);
      if(mine){ state.meta.ownerId = null; state.meta.ownerName = null; state.meta.libRev = 0; state.meta.deletedBooks = {}; state.meta.syncFp = normalizeSyncFp(null); social.libRev = 0; libPersist(); }
      disownAside(session.id); disownPreRestore(session.id);
      try{ localStorage.removeItem(SOC_TOKEN); }catch(_){} social.me=null; social.view=null; setFriendsBadge(0); render();
      toast(mine && state.books.some(b=>!isDemoBook(b)) ? 'Compte supprimé. Ta bibliothèque reste sur cet appareil, sans compte' : 'Compte supprimé.'); }
    catch(err){ toast(netMsg(err)); } };
  // liste des bloqués
  try{
    const d = await api('/api/blocks');
    $('#acc-blocks').innerHTML = d.blocked.length
      ? d.blocked.map(u=>`<div class="frow">${avatarHTML(u.displayName)}<div class="fi"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div><button class="btn small" data-unblock="${esc(u.username)}">Débloquer</button></div>`).join('')
      : `<p class="friends-empty" style="padding:8px 0">Personne de bloqué.</p>`;
    // renderAccount() redessine la liste : sans le toast, la ligne disparaît sans un mot et on doute
    // d’avoir cliqué au bon endroit.
    $('#acc-blocks').querySelectorAll('[data-unblock]').forEach(btn=>btn.onclick=async ()=>{ try{ await api('/api/unblock',{method:'POST',body:{username:btn.dataset.unblock}}); toast('Débloqué ✓'); renderAccount(); }catch(e){ toast(netMsg(e)); } });
  }catch(_){ $('#acc-blocks').innerHTML = `<p class="friends-empty" style="padding:8px 0">—</p>`; }
}
// ---- Code de secours : seule voie de récupération (aucun email collecté) ----
// Reste affiché jusqu’à confirmation explicite ; copie et téléchargement proposés.
async function showRecoveryCode(code, intro){
  // Le code n’est plus dans le message : il passe par cfg.code (bloc .dlg-code, gros et en mono).
  const msg = `${intro||''}${intro?'\n\n':''}C’est la SEULE façon de récupérer ton compte si tu oublies ton mot de passe : aucun email n’est collecté. Copie-le ou télécharge-le, puis range-le en lieu sûr : il ne sera plus jamais affiché.`;
  // Sortie conditionnée à une mise à l’abri : un code perdu ici l’est définitivement (le dialogue
  // ne se rouvre jamais et il n’existe aucune autre voie de récupération).
  let saved = false;
  for(;;){
    // « Copier » est l’action par défaut (Entrée) ; « C’est noté » ne libère qu’après copie ou
    // téléchargement. Échap/clic-fond renvoient null → on réaffiche.
    const v = await openDialog({ title:'Ton code de secours', message: msg, code, actions:[
      {label:'Copier', value:'copy', variant:'primary', default:true},
      {label:'Télécharger', value:'dl'},
      {label:'C’est noté ✓', value:'ok'},
    ]});
    if(v==='ok'){
      if(saved) return;
      toast('Copie ou télécharge d’abord ton code');
      continue;
    }
    if(v==='copy'){
      // Presse-papiers refusé (permission, contexte non sécurisé) : on ne bloque pas pour autant —
      // le bloc est en user-select:all, le code se recopie à la main en un geste.
      try{ await navigator.clipboard.writeText(code); toast('Code copié ✓'); }
      catch(_){ toast('Copie impossible. Recopie-le à la main, puis « C’est noté »'); }
      saved = true;
    }
    else if(v==='dl'){
      const txt = `Code de secours Tome\nPseudo : ${social.me?social.me.username:''}\n\n${code}\n\nCe code permet de récupérer ton compte en cas d’oubli du mot de passe.\nGarde ce fichier en lieu sûr. L’utiliser en génère un nouveau.\n${SITE_URL}\n`;
      const blob = new Blob([txt], {type:'text/plain'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tome-code-de-secours.txt';
      a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000); toast('Fichier téléchargé ✓');
      saved = true;
    }
    // v === null (Échap / clic-fond) : on boucle → le dialogue se réaffiche
  }
}
// ---- Invitation par lien : #invite/<pseudo> ----
// Le lien ne fait que pré-remplir une demande d’ami confirmée par l’utilisateur ;
// aucun nouveau point d’entrée serveur (la demande passe par /api/friends/request).
async function shareInvite(){
  if(!social.me) return;
  const url = location.origin + location.pathname + '#invite/' + encodeURIComponent(social.me.username);
  if(navigator.share){
    try{ await navigator.share({ title:'Tome', text:'Rejoins-moi sur Tome pour partager nos lectures !', url }); return; }
    catch(e){ if(e && e.name==='AbortError') return; /* sinon : repli presse-papiers */ }
  }
  try{ await navigator.clipboard.writeText(url); toast('Lien d’invitation copié, envoie-le à un ami ✓'); }
  catch(_){ openDialog({ title:'Mon lien d’invitation', message:url, actions:[{label:'Fermer', value:null, cancel:true, default:true}] }); }
}
// ---- Ajouter un ami par QR code : mon code (généré par qr.js, jamais via un service tiers),
//      mon lien, le scan du code d'un ami, et la « poignée de main » en direct : tant que la modale
//      est ouverte, les demandes entrantes s'affichent pour être acceptées d'un geste. ----
let _qrPoll = 0, _qrKnown = null, _qrStream = null, _qrTimer = null;
function inviteUrl(){ return location.origin + location.pathname + '#invite/' + encodeURIComponent(social.me.username); }
async function openFriendQR(){
  if(!social.me) return;
  const url = inviteUrl();
  $('#qr-user').textContent = social.me.username;
  try{ window.tomeQR.draw($('#qr-canvas'), url, { scale:6, margin:3, dark:'#141311', light:'#ffffff' }); }
  catch(e){ toast('QR indisponible sur cet appareil'); }
  $('#qr-share').hidden = !navigator.share;
  $('#qr-scan').hidden = true;
  if('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
    try{ const f = await BarcodeDetector.getSupportedFormats(); $('#qr-scan').hidden = !f.includes('qr_code'); }catch(_){ }
  }
  // Safari iOS n’a pas BarcodeDetector : sans « Scanner son QR », la modale n’expliquait plus
  // comment s’ajouter — alors que l’appareil photo du système lit le code et ouvre le lien.
  const qrHint = $('#ov-qr .qr-hint');
  if(qrHint) qrHint.textContent = $('#qr-scan').hidden
    ? 'Sur iPhone : ouvre l’appareil photo et vise le code de ton ami : le lien s’ouvre dans Tome. Ou envoie-lui ton lien.'
    : 'Fais scanner ce code par ton ami, ou envoie-lui ton lien. Il n’aura qu’à confirmer.';
  $('#qr-live').hidden = true; $('#qr-live').innerHTML = '';
  openOverlay('#ov-qr');
  // poignée de main : on surveille les demandes entrantes tant que la modale est ouverte (≤ 3 min)
  const myPoll = ++_qrPoll; let ticks = 0; _qrKnown = null;
  const tick = async ()=>{
    if(myPoll !== _qrPoll || !$('#ov-qr').classList.contains('open') || ticks++ > 45) return;
    try{
      const d = await api('/api/friends');
      const inc = d.incoming || [];
      if(_qrKnown === null) _qrKnown = new Set(inc.map(u=>u.id));
      const fresh = inc.filter(u=>!_qrKnown.has(u.id));
      if(fresh.length){
        const box = $('#qr-live'); box.hidden = false;
        box.innerHTML = fresh.map(u=>`<div class="frow qr-in">${avatarHTML(u.displayName)}<div class="fi"><b>${esc(u.displayName)}</b><span>@${esc(u.username)} veut devenir ton ami</span></div>
          <div class="fa"><button class="btn small primary" data-qr-accept="${esc(u.id)}">Accepter</button></div></div>`).join('') + box.innerHTML;
        fresh.forEach(u=>_qrKnown.add(u.id));
      }
    }catch(_){ }
    setTimeout(tick, 4000);
  };
  setTimeout(tick, 1500);
}
$('#qr-copy').addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(inviteUrl()); toast('Lien d’invitation copié ✓'); }
  catch(_){ openDialog({ title:'Mon lien d’invitation', message:inviteUrl(), actions:[{label:'Fermer', value:null, cancel:true, default:true}] }); }
});
$('#qr-share').addEventListener('click', shareInvite);
$('#qr-live').addEventListener('click', async e=>{
  const b = e.target.closest('[data-qr-accept]'); if(!b || b.disabled) return; b.disabled = true;
  try{ await api('/api/friends/accept', {method:'POST', body:{userId: b.dataset.qrAccept}});
    toast('Vous êtes maintenant amis ✓'); const row = b.closest('.frow'); if(row) row.remove(); socRefresh(); loadFriendLists(); }
  catch(err){ b.disabled = false; toast(netMsg(err)); }
});
async function startQRScan(){
  if(_qrStream) return;
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }); }
  catch(_){ toast('Caméra indisponible ou refusée'); return; }
  if(!$('#ov-qr').classList.contains('open')){ stream.getTracks().forEach(t=>t.stop()); return; }
  _qrStream = stream;
  const box = $('#qr-scan-box'), video = $('#qr-video');
  box.hidden = false; video.srcObject = stream;
  try{ await video.play(); }catch(_){ }
  let det; try{ det = new BarcodeDetector({ formats:['qr_code'] }); }catch(_){ stopQRScan(); toast('Scanner non supporté ici'); return; }
  _qrTimer = setInterval(async ()=>{
    try{
      const codes = await det.detect(video);
      for(const c of codes){
        const m = String(c.rawValue||'').match(/#invite\/([a-z0-9_.-]{3,20})/i);
        if(!m) continue;
        stopQRScan();
        const who = m[1].toLowerCase();
        if(who === social.me.username){ toast('C’est ton propre code'); return; }
        closeOverlays();
        social.invite = who; processInvite();   // confirmation puis demande d'ami
        return;
      }
    }catch(_){ }
  }, 300);
}
function stopQRScan(){
  clearInterval(_qrTimer); _qrTimer = null;
  if(_qrStream){ _qrStream.getTracks().forEach(t=>t.stop()); _qrStream = null; }
  const box = $('#qr-scan-box'); if(box) box.hidden = true;
  const v = $('#qr-video'); if(v) v.srcObject = null;
}
$('#qr-scan').addEventListener('click', startQRScan);
$('#qr-scan-stop').addEventListener('click', stopQRScan);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stopQRScan(); });

let _inviteBusy = false; // renderFriends est appelé souvent : un seul dialogue d’invitation à la fois
async function processInvite(){
  if(_inviteBusy) return;
  const uname = social.invite || loadPendingInvite();
  social.invite = null;
  if(!social.me || !uname) return;
  _inviteBusy = true;
  try{ await _processInvite(uname); } finally{ _inviteBusy = false; }
}
async function _processInvite(uname){
  if(uname === social.me.username){ clearPendingInvite(); toast("C’est ton propre lien d’invitation "); return; }
  // Ne pas promettre la réciprocité : en mode « Rien » (le défaut), l’ami ne verra rien de nous.
  const reciproque = shareMode()==='none'
    ? 'Tu verras ses lectures partagées. Les tiennes restent invisibles tant que ton partage est sur « Rien » (Amis › Partage).'
    : 'Vous verrez vos lectures partagées respectives.';
  const ok = await uiConfirm({ title:`@${uname} t’invite`, message:`Envoyer une demande d’ami à @${uname} ?\n\n${reciproque}`, okLabel:'Envoyer la demande' });
  if(!ok){ clearPendingInvite(); return; }          // refus explicite : ne pas redemander
  try{
    const r = await api('/api/friends/request', {method:'POST', body:{username:uname}});
    clearPendingInvite();                            // seulement une fois la demande PARTIE
    toast(r.status==='accepted' ? 'Vous êtes maintenant amis ✓' : 'Demande envoyée ✓');
    if(social.tab==='friends') loadFriendLists();
  }catch(e){
    // hors ligne / serveur injoignable : l’invitation reste en attente pour la prochaine ouverture
    toast(e.message==='offline' ? 'Pas de connexion. L’invitation est gardée pour plus tard.' : netMsg(e));
  }
}
function renderAuth(box, mode, errMsg=''){
  // un visiteur sans jeton n’a par définition pas de compte : lui présenter l’inscription,
  // pas un mur de connexion (surtout s’il arrive par l’invitation d’un ami)
  if(!mode) mode = (socToken() && !social.invite && !loadPendingInvite()) ? 'login' : 'signup';
  // renderAuth peut être appelé directement (page d’accueil, « Inviter un ami ») sans passer par
  // renderFriends : le titre est donc aussi posé ici — seulement dans Amis, la vue Mon compte
  // garde le sien
  const inFriends = !!box.closest('#view-friends');
  const h = $('#view-friends h2.section'); if(h && inFriends) h.textContent = 'Amis';
  // Dans Amis, le formulaire seul ne dit pas pourquoi on le remplit : une phrase sur ce que le
  // compte ouvre ici. Pas quand une invitation (déjà expliquée) ou une erreur occupe la place.
  const gate = inFriends && !social.invite && !errMsg
    ? `<p class="friends-gate">Ici, tu vois ce que lisent tes amis et tu leur recommandes des livres. Il faut un compte pour ça : gratuit, sans email.</p>`
    : '';
  dropOtherAuthForm(box);
  box.innerHTML = `
    ${social.invite ? `<div class="invite-banner"><b>@${esc(social.invite)}</b> t’invite sur Tome. Connecte-toi ou crée un compte pour l’ajouter en ami.</div>` : gate}
    <div class="auth-card">
      <h3>${mode==='login'?'Se connecter':'Créer un compte'}</h3>
      <p class="sub">${mode==='login'
        ? 'Retrouve ta bibliothèque privée sur tes appareils et les lectures que tes amis ont choisi de partager.'
        : 'Ta bibliothèque, sauvegardée en privé sur ton compte, te suit sur tous tes appareils.'}</p>
      <label for="soc-user">Pseudo</label>
      <input id="soc-user" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ex : lucas_bd" ${mode==='signup'?'aria-describedby="soc-user-help"':''}>
      ${mode==='signup'?`<small class="field-help" id="soc-user-help">Minuscules, chiffres, . _ - &middot; montome.fr/@pseudo</small>`:''}
      ${mode==='signup'?`<label for="soc-name">Nom affiché <span class="lbl-opt">(optionnel, sinon ton pseudo)</span></label><input id="soc-name" maxlength="40" placeholder="ex : Lucas">`:''}
      <label for="soc-pass">Mot de passe</label>
      <div class="pw-wrap">
        <input id="soc-pass" type="password" maxlength="256" autocomplete="${mode==='login'?'current-password':'new-password'}" placeholder="8 caractères minimum">
        <button type="button" class="linkish pw-eye" aria-pressed="false" aria-label="Afficher le mot de passe">Afficher</button>
      </div>
      ${mode==='signup'?`<p class="sub auth-note">Privé par défaut&nbsp;: tes amis ne voient rien tant que tu ne l’actives pas (Amis&nbsp;› Partage).</p>
      <label class="consent-row">
        <input type="checkbox" id="soc-consent">
        <span>J’accepte les <button type="button" class="linkish" data-legal>mentions légales et la confidentialité</button> et les <button type="button" class="linkish" data-cgu>conditions d’utilisation</button>.</span></label>`:''}
      <div class="auth-err" role="alert" aria-live="assertive">${esc(errMsg)}</div>
      <button class="btn primary" id="soc-submit" style="width:100%; justify-content:center">${mode==='login'?'Connexion':'Créer mon compte'}</button>
      <div class="switch">${mode==='login'
        ? `Pas encore de compte ? <button type="button" class="linkish" data-auth="signup">Créer un compte</button><br><button type="button" class="linkish" data-auth="recover">Mot de passe oublié&nbsp;?</button>`
        : `Déjà inscrit ? <button type="button" class="linkish" data-auth="login">Se connecter</button>`}</div>
    </div>`;
  // affiche l’erreur SANS re-render (préserve pseudo/mot de passe/nom/consentement déjà saisis)
  // Sélecteurs relatifs à box : le formulaire vit dans Amis (inscription) comme dans Mon compte (connexion).
  const showErr = m => { const e=box.querySelector('.auth-err'); if(e) e.textContent=m; const s=$('#soc-submit'); if(s){ s.disabled=false; s.textContent = mode==='login'?'Connexion':'Créer mon compte'; } };
  const submit = async ()=>{
    const username = $('#soc-user').value.trim().toLowerCase();
    const password = $('#soc-pass').value;
    const displayName = mode==='signup' ? ($('#soc-name').value.trim()||username) : '';
    if(!username || !password){ showErr('Remplis le pseudo et le mot de passe.'); return; }
    // Mêmes règles que le serveur (USERNAME_RE / 8 caractères) : une saisie fautive est refusée
    // ici, sans requête réseau ni attente — et sans consommer le quota anti-abus par IP.
    if(!/^[a-z0-9_.-]{3,20}$/.test(username)){ showErr('Pseudo : 3 à 20 caractères, lettres sans accent, chiffres, . _ -'); return; }
    if(mode==='signup' && password.length < 8){ showErr('8 caractères minimum pour le mot de passe.'); return; }
    if(mode==='signup' && !$('#soc-consent').checked){ showErr('Tu dois accepter les mentions légales pour créer un compte.'); return; }
    $('#soc-submit').textContent = '…'; $('#soc-submit').disabled = true;
    try{
      // Inscription toujours privée : le partage se règle plus tard dans Amis › Partage, une fois
      // qu'il y a des lectures à montrer. Un formulaire plus court, une décision mieux informée.
      const body = mode==='login' ? {username, password} : {username, password, displayName, consent:true, shareMode:'none'};
      const d = await api(mode==='login'?'/api/login':'/api/signup', {method:'POST', body});
      resetLibrarySync(); localStorage.setItem(SOC_TOKEN, d.token); social.me = d.user; _socUserToken = d.token; social.tosOutdated = mode!=='signup'; social.tab='feed'; social.view=null;
      social.sessionExpired = false;   // la session est neuve : plus rien à expliquer au prochain passage
      try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}   // ne plus montrer la page d’accueil
      await socRefresh(); // récupère aussi tosOutdated AVANT toute sauvegarde privée
      if(stripDemo()) toast('Exemples retirés. Ton compte démarre avec tes vrais livres.');
      if(!social.tosOutdated) syncLibraryOnLogin().then(()=>{ pushShelf(); refreshReminderTitle(); });
      // le code AVANT renderFriends : sinon la confirmation d’invitation (#invite) écraserait le
      // dialogue du code (une seule modale à la fois) — l’invitation s’ouvrira après « C’est noté »
      if(d.recoveryCode) await showRecoveryCode(d.recoveryCode, 'Bienvenue sur Tome ! Avant tout, note ton code de secours :');
      // Un nouvel inscrit sans livre ni invitation n’a rien à voir dans un fil vide : on l’amène
      // sur Aujourd’hui, où la carte « Bienvenue dans Tome / Ajouter mon premier livre » prend le
      // relais. Avec une invitation, l’onglet Amis reste la bonne destination (processInvite).
      const invite = social.invite || loadPendingInvite();
      if(mode==='signup' && !invite && !state.books.some(b=>!isDemoBook(b))){ selectView('today'); return; }
      render();   // la vue courante (Amis ou Mon compte) se repeint connectée
    }catch(e){
      showErr(netMsg(e));
    }
  };
  $('#soc-submit').addEventListener('click', submit);
  // Le pseudo est stocké en minuscules côté serveur : le montrer tel qu'il sera évite la
  // surprise d'un « Lucas.M » affiché ensuite en « lucas.m ». On restaure le curseur, sinon
  // réécrire value le renvoie en fin de champ dès qu'on corrige une lettre au milieu.
  $('#soc-user').addEventListener('input', e=>{
    const v = e.target.value.toLowerCase(); if(v === e.target.value) return;
    const p = e.target.selectionStart; e.target.value = v;
    try{ e.target.setSelectionRange(p, p); }catch(_){}
  });
  $('#soc-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  const legal = box.querySelector('[data-legal]'); if(legal) legal.addEventListener('click', ()=>openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}));
  const cgu = box.querySelector('[data-cgu]'); if(cgu) cgu.addEventListener('click', ()=>openDialog({title:"Conditions d’utilisation", message:TERMS_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}));
  box.querySelectorAll('[data-auth]').forEach(a=>a.addEventListener('click', ()=>a.dataset.auth==='recover' ? renderRecover(box) : renderAuth(box, a.dataset.auth)));
  const fab = $('#fab'); if(fab) fab.hidden = true;   // pas de « + » flottant par-dessus le formulaire
}
// Le formulaire de connexion vit dans deux vues (Amis hors session, Mon compte) et ses champs
// sont résolus par $() en absolu (#soc-user, #soc-pass, #rec-user…) : une copie laissée dans
// l’autre vue, plus haut dans le document, prendrait le pas sur celle qu’on remplit — « Remplis le
// pseudo » alors que tout est saisi. Une seule copie à la fois ; l’autre vue se repeint à l’entrée.
function dropOtherAuthForm(box){
  const other = box.id==='account-cloud' ? $('#friends-body') : $('#account-cloud');
  if(other && other!==box && other.querySelector('.auth-card')) other.innerHTML = '';
}
// Récupération de compte par code de secours (« mot de passe oublié »)
function renderRecover(box, errMsg=''){
  dropOtherAuthForm(box);
  box.innerHTML = `
    <div class="auth-card">
      <h3>Récupérer mon compte</h3>
      <p class="sub">Entre ton pseudo et ton code de secours (montré à la création du compte, ou régénéré depuis les réglages), puis choisis un nouveau mot de passe. Toutes tes sessions seront déconnectées et un nouveau code te sera remis.</p>
      <label for="rec-user">Pseudo</label>
      <input id="rec-user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ex : lucas_bd">
      <label for="rec-code">Code de secours</label>
      <input id="rec-code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="TOME-XXXXX-XXXXX-XXXXX-XXXXX" style="text-transform:uppercase">
      <label for="rec-pass">Nouveau mot de passe</label>
      <div class="pw-wrap">
        <input id="rec-pass" type="password" maxlength="256" autocomplete="new-password" placeholder="8 caractères minimum">
        <button type="button" class="linkish pw-eye" data-pw-noun="le nouveau mot de passe" aria-pressed="false" aria-label="Afficher le nouveau mot de passe">Afficher</button>
      </div>
      <div class="auth-err" role="alert" aria-live="assertive">${esc(errMsg)}</div>
      <button class="btn primary" id="rec-submit" style="width:100%; justify-content:center">Récupérer mon compte</button>
      <div class="switch"><button type="button" class="linkish" data-auth="login">← Retour à la connexion</button></div>
    </div>`;
  const showErr = m => { const e=box.querySelector('.auth-err'); if(e) e.textContent=m; const s=$('#rec-submit'); if(s){ s.disabled=false; s.textContent='Récupérer mon compte'; } };
  const submit = async ()=>{
    const username = $('#rec-user').value.trim(), code = $('#rec-code').value.trim(), newPassword = $('#rec-pass').value;
    if(!username || !code || !newPassword){ showErr('Remplis les trois champs.'); return; }
    $('#rec-submit').textContent = '…'; $('#rec-submit').disabled = true;
    try{
      const d = await api('/api/recover', {method:'POST', body:{username, code, newPassword}});
      resetLibrarySync(); localStorage.setItem(SOC_TOKEN, d.token); social.me = d.user; _socUserToken = d.token; social.tosOutdated = true; social.tab='feed'; social.view=null;
      social.sessionExpired = false;
      await socRefresh();
      if(!social.tosOutdated) syncLibraryOnLogin().then(()=>pushShelf());
      // même ordre qu’à l’inscription : le code d’abord, l’onglet Amis (et une éventuelle invitation) ensuite
      if(d.recoveryCode) await showRecoveryCode(d.recoveryCode, 'Compte récupéré ✓ Voici ton NOUVEAU code de secours (l’ancien ne fonctionne plus) :');
      render();
    }catch(e){ showErr(netMsg(e)); }
  };
  $('#rec-submit').addEventListener('click', submit);
  $('#rec-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  box.querySelectorAll('[data-auth]').forEach(a=>a.addEventListener('click', ()=>renderAuth(box, a.dataset.auth)));
}
// La promesse publique du modèle : le cœur reste gratuit, le payant (un jour) sera du confort en
// plus — jamais une reprise de l’existant. C’est un ENGAGEMENT : ne jamais l’affaiblir en douce.
const FREE_PLEDGE = `Ce qui restera toujours gratuit : la promesse de Tome.

Tome proposera peut-être un jour des options payantes (du confort, du soutien au projet). Mais le cœur de l’app est gratuit, pour toujours :

• Bibliothèque, séries et listes ILLIMITÉES, sans plafond de livres.
• Journal de lecture, notes, critiques, citations, ambiances, objectif annuel, streak.
• Amis, fil d’activité, réactions ♥, réponses, notifications.
• Récap annuel et cartes de partage.
• Import ET export complets : tes données t’appartiennent, tu peux partir à tout moment.
• Multi-appareils : ta bibliothèque enregistrée sur ton compte, privée.

Et trois « jamais » :
• Jamais de publicité display.
• Jamais de vente de tes données individuelles.
• Jamais de limite rétroactive : ce qui est gratuit aujourd’hui le reste.

Si des options payantes arrivent, ce sera du confort EN PLUS (statistiques avancées, personnalisation, soutien), jamais une rançon sur ce que tu utilises déjà.`;

/* ---- Recommander un livre à un ami (« tiens, lis ça ») ---- */
async function recommendBook(id){
  const b = state.books.find(x=>x.id===id); if(!b) return;
  if(!social.me){ toast('Connecte-toi pour recommander un livre à un ami.'); return; }
  let friends = [];
  try{ const d = await api('/api/friends'); friends = d.friends || []; }
  catch(e){ toast(netMsg(e)); return; }
  if(!friends.length){ toast('Ajoute d’abord un ami (onglet Amis) pour lui recommander un livre.'); return; }
  const who = await uiChoose({ title:`Recommander « ${fullTitle(b)} »`, message:'À qui ?',
    choices: friends.slice(0,12).map(f=>({ label:`${f.displayName||f.username} · @${f.username}`, value:f.username })) });
  if(!who) return;
  const msg = await uiPrompt({ title:'Un mot pour accompagner ?', message:'Optionnel : pourquoi ce livre, pour cette personne.',
    placeholder:'Tu vas adorer le premier chapitre…', okLabel:'Envoyer' });
  if(msg===null) return;
  try{
    await api('/api/reco', { method:'POST', body:{ toUsername:who, message:frTypo(String(msg||'').slice(0,280)),
      book:{ key:shelfKey(b), title:b.title, authors:authorsStr(b), type:b.type, series:b.series||'', volume:b.volume??null, isbn:b.isbn||'', cover:b.cover||'' } } });
    toast(`Recommandé à @${who} ✓`);
  }catch(e){ toast(netMsg(e)); }
}
// Le rappel de lecture cite la lecture en cours : le serveur ne connaît pas la bibliothèque
// privée, on lui envoie le titre quand il change (best-effort, silencieux).
function refreshReminderTitle(){
  if(!libraryReady() || social.me.reminderHour==null) return;   // le titre vient de la bibliothèque : seulement celle du compte
  const session = _libReadySession;
  const reading = state.books.find(x=>x.status==='reading' && !isDemoBook(x));
  const title = reading ? fullTitle(reading).slice(0,120) : '';
  if(title === (social.me.reminderTitle||'')) return;
  api('/api/account/reminder', { sessionToken:session.token, method:'POST', body:{ hour:social.me.reminderHour, tz:new Date().getTimezoneOffset(), title } })
    .then(()=>{ if(currentLibrarySession(session)) social.me.reminderTitle = title; }).catch(()=>{});
}

/* ---- Signalement de contenu (canal « notice and action ») ---- */
async function reportContent(targetType, targetKey){
  const reason = await openDialog({
    title:'Signaler ce contenu',
    message:'Explique en une phrase ce qui pose problème (contenu illicite, harcèlement, spam\u2026). Ton signalement est transmis au responsable du site.',
    input:{ multiline:true, placeholder:'Ce contenu\u2026' },
    actions:[{label:'Annuler', value:null, cancel:true},{label:'Envoyer le signalement', returnsInput:true, default:true}],
  });
  if(reason==null) return;                       // annulé (le dialogue purge ses champs à la fermeture)
  const txt = String(reason).trim();
  if(txt.length<5){ toast('Décris le problème en quelques mots.'); return; }
  try{
    await api('/api/report', { method:'POST', body:{ targetType, targetKey, reason:txt } });
    toast('Signalement envoyé. Merci, il sera examiné.');
  }catch(e){ toast(netMsg(e)); }
}
function showPledge(){ openDialog({title:'Toujours gratuit', message:FREE_PLEDGE, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); }
// Journal des versions : tenu à la main depuis l’historique git, une entrée par mise en ligne
// qui change quelque chose pour le lecteur. Rien d’inventé, rien d’embelli (cf. DESIGN.md).
const CHANGELOG = `Ce qui a changé dans Tome, du plus récent au plus ancien.

20 septembre 2026, le soir
La recherche retrouve les livres : elle ne ramène plus de disques ni de films de la BnF, cherche par titre et par auteur, et trouve un livre par son code-barres même quand la BnF ne connaît que son ancien ISBN. Une collection d’éditeur comme « Folio » n’est plus prise pour une série.
Entre deux appareils, un livre modifié sur l’un ne se dédouble plus sur l’autre. « Restaurer une sauvegarde » garde d’abord une copie de la bibliothèque actuelle. Le titre de ta lecture en cours, utilisé pour le rappel, n’est plus visible par tes amis.

20 septembre 2026
Nouvelle police, Alegreya, et des filets à la place des cadres : un lecteur trouvait que l’interface manquait d’âme. Textes relus dans toute l’app, accueil simplifié, et ce journal des versions.

13 septembre
L’onglet Amis s’explique quand on n’est pas connecté. Un avertissement s’affiche si le navigateur refuse d’enregistrer la bibliothèque.

9 septembre
La recherche interroge d’abord la BnF, puis Google Books et Open Library. « Un avis, un souci ? » arrive dans Mon compte. Un livre supprimé hors ligne ne revient plus à la synchronisation suivante.

6 au 8 septembre
Quatre séries de retouches sur l’inscription, le code de secours, l’ajout express, la notation rapide et la vue Mon compte.

3 septembre
Une page publique par livre. Ajouter un ami par QR code, lui recommander un livre, programmer un rappel de lecture. Import Babelio.

2 septembre
Thème clair « Fiche de bibliothèque ». Plus aucun emoji dans l’interface.

30 août
Mentions légales et conditions d’utilisation complètes, signalement d’un contenu, bouton « Essayer d’abord ».

29 août
Refonte visuelle « Reliure » : le livre en volume, la fiche qui s’ouvre depuis le dos, les quatre favoris.

24 août
Tome s’installe sur montome.fr. Barre d’onglets sur mobile, thème automatique.

22 août
Notifications push, page publique /@pseudo, notation à la chaîne, connexion utilisable au clavier.

19 août
Code de secours, cartes de partage, étagère partagée synchronisée, page « Toujours gratuit ».

16 au 18 août
Comptes et amis : recherche d’amis, notifications, bibliothèque enregistrée sur le compte, page d’accueil publique.

11 août
Onglet Amis, sélection multiple, collections, import CSV Goodreads et StoryGraph.

10 août 2026
Première version : un journal de lecture pour les livres, les BD et les mangas.`;
function showVersions(){ openDialog({title:'Journal des versions', message:CHANGELOG, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); }
const LEGAL_TEXT = `Tome Social : mentions légales et confidentialité.

Responsable de traitement et directeur de la publication : Lucas Marroig (lucas.marroig@essec.edu).
Données traitées : ton pseudo, ton nom affiché, ta bio, un mot de passe haché (jamais en clair), un code de secours haché (jamais en clair ; seule voie de récupération, aucun email n’étant collecté), ta bibliothèque de lecture enregistrée sur ton compte (pour la retrouver sur tous tes appareils : livres, notes, critiques, listes, dates, résumés personnels et cartes mémoire), le sous-ensemble que tu choisis de partager avec tes amis, tes liens d’amitié, tes réactions ♥ et tes réponses sous les lectures de tes amis (horodatées, supprimables par toi à tout moment), la liste des personnes que tu bloques, tes notifications reçues (qui a réagi, commenté ou demandé en ami, sur quel livre, quand, lues ou non ; les notifications lues sont effacées après 90 jours), si tu actives les notifications l’abonnement push de chaque appareil (adresse technique fournie par ton navigateur + clés de chiffrement, supprimé dès que tu les désactives), et ton adresse IP (uniquement pour limiter les abus, effacée automatiquement sous 48 heures). Si tu utilises les fonctions correspondantes : les recommandations de livres que tu envoies ou reçois entre amis (livre, mot d’accompagnement, expéditeur, destinataire ; supprimées avec le compte de l’un ou l’autre, ou à la fin de l’amitié si elles sont encore en attente) et le réglage du rappel de lecture (heure choisie, fuseau horaire, titre de ta lecture en cours envoyé au serveur pour personnaliser le message, désactivable à tout moment dans Mon compte).
Finalité : héberger ta bibliothèque pour toi, te permettre de retrouver des amis et de partager tes lectures.
Base légale : ton consentement (recueilli à l’inscription).
Âge minimum : Tome s’adresse aux 15 ans et plus (âge du consentement numérique en France) ; en dessous, l’inscription nécessite l’accord d’un parent ou tuteur.
Visibilité : ta bibliothèque enregistrée sur ton compte est PRIVÉE : visible de toi uniquement. Tes résumés, notes d’étude, questions et cartes mémoire ne font jamais partie du profil partagé. Le partage social est réglé sur « Rien » par défaut. Seul le sous-ensemble autorisé par ton mode de partage (réglable dans Amis › Partage : « Tout », « Notes seules » sans tes critiques, ou « Rien ») est synchronisé automatiquement et visible de tes amis acceptés uniquement. « Rien » n’envoie jamais rien. Exception si tu l’actives toi-même : « Ma page publique » (Amis › Partage) rend ce même sous-ensemble partagé (jamais plus, jamais ta bibliothèque privée) ainsi que ton pseudo, ton nom affiché et ta bio, lisibles par quiconque visite montome.fr/@tonpseudo, moteurs de recherche compris. Désactivée par défaut, désactivable à tout moment. Aucune publicité, aucune revente. Chiffrement en transit (HTTPS). Hébergeur : Cloudflare.
Pages publiques des livres : Tome tient un catalogue commun des livres partagés (titre, auteurs, couverture, résumé : des données de livre, jamais de personne). La page publique d’un livre affiche une note moyenne ANONYME calculée uniquement sur les membres ayant publié leur page, et seulement à partir de 3 notes (jamais une personne devinable) ; elle affiche les critiques signées de leur pseudo des seuls membres à page publique réglés sur « Tout ». Rendre ta page privée retire immédiatement tes notes et critiques de ces pages.
Services tiers : Tome n’installe aucun traceur. Ta recherche de livres transite par le serveur de Tome, qui interroge le catalogue de la BnF et Google Books à ta place : le texte cherché sert à construire ces appels puis disparaît : il n’est ni journalisé, ni conservé, ni rattaché à un compte, et ces services ne voient ni ton adresse IP ni ton navigateur. La réponse (des données de livre, jamais de personne) est mise en cache 24 heures pour tout le monde. En revanche, pour interroger Open Library et pour afficher les couvertures, ton navigateur contacte directement openlibrary.org, covers.openlibrary.org, books.google.com ou openapi.bnf.fr, qui reçoivent alors ta requête ou l’identifiant du livre et ton adresse IP, selon leurs propres politiques de confidentialité. Les couvertures sont chargées sans transmettre tes cookies. La recherche de livres n’a lieu que quand tu la déclenches ; les « Idées du jour » ne s’activent qu’avec ton accord explicite.
Cookies et traceurs : Tome n’utilise aucun cookie publicitaire ni de mesure d’audience, uniquement le stockage strictement nécessaire au service (ta bibliothèque sur ton appareil, ta session). Ces usages sont exemptés de consentement, c’est pourquoi il n’y a pas de bannière cookies.
Hébergement et transferts : Cloudflare, Inc. (101 Townsend St, San Francisco, États-Unis) ; la base de données est hébergée en Europe de l’Ouest. Les flux transitant hors de l’UE sont encadrés par les garanties reconnues (certification Data Privacy Framework et clauses contractuelles types).
Liens d’achat : les boutons « Acheter » / « Kindle » des fiches livres renvoient vers une recherche Amazon.${AMAZON_TAG ? " En tant que Partenaire Amazon, ce site peut percevoir une commission sur les achats remplissant les conditions requises, sans aucun surcoût pour toi." : " Ces liens ne contiennent aucun identifiant d’affiliation : Tome ne perçoit aucune commission."} Ces liens ne transmettent aucune donnée personnelle ; une fois sur Amazon, ce sont les conditions et cookies d’Amazon qui s’appliquent.
Conservation : sessions 30 jours ; compte et bibliothèque supprimés après 24 mois d’inactivité ; suppression immédiate possible à tout moment via Mon compte.
Tes droits (RGPD) : accès et rectification (Mon compte), portabilité (Exporter mes données : inclut ta bibliothèque), effacement (Supprimer mon compte efface aussi ta bibliothèque du serveur). Tu peux aussi utiliser Tome sans compte : dans ce cas ta bibliothèque reste uniquement sur ton appareil. Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL (cnil.fr).`;

const TERMS_TEXT = `Tome : conditions d’utilisation.

L’essentiel : Tome est un journal de lecture. Sois honnête, sois correct, et tout ira bien.

Le service : Tome te permet de tenir ta bibliothèque, de noter et critiquer tes lectures, et de les partager avec des amis si tu le décides. Le cœur du service est gratuit (voir « Toujours gratuit »).
Ton compte : tu es responsable de ce qui se passe avec ton compte et de la garde de ton mot de passe et de ton code de secours. Un compte = une personne réelle.
Tes contenus : tes critiques, avis et listes restent les tiens. En les partageant (amis ou page publique), tu autorises Tome à les afficher aux personnes que TU as choisies. Rien d’autre, aucune revente, aucune utilisation publicitaire.
Contenus interdits : contenus illégaux, harcèlement, haine, spam, usurpation d’identité, ou toute utilisation visant à nuire au service ou à ses membres.
Critiques publiques : si tu publies ta page, tes critiques peuvent apparaître sur les pages publiques des livres, signées de ton pseudo. Tu en restes l’auteur et le responsable ; elles peuvent être signalées et retirées si elles enfreignent ces règles.
Signalement : chaque critique, commentaire et profil public peut être signalé (bouton « Signaler »). Les signalements sont examinés rapidement ; un contenu manifestement illicite est retiré, et l’auteur peut en discuter par email.
Modération et résiliation : en cas d’abus, Tome peut retirer un contenu, suspendre ou fermer un compte, avec explication, sauf obligation légale contraire. Tu peux supprimer ton compte à tout moment (Mon compte), ce qui efface tes données du serveur.
Disponibilité : Tome est un projet indépendant, fourni « en l’état », sans garantie de disponibilité permanente : l’export de ta bibliothèque est là pour que tes données ne dépendent jamais du service.
Droit applicable : droit français. Contact : lucas.marroig@essec.edu.`;
let _feedRows = [];   // dernières lignes peintes par renderFeed (source du menu « … »)
async function renderFeed(){
  const el = $('#soc-tab'); el.innerHTML = `<p class="friends-empty">Chargement…</p>`;
  try{
    const d = await api('/api/feed'); social.todayFeed=d.feed||[]; social.todayFeedAt=Date.now(); social.todayFeedUser=social.me&&social.me.id; social.todayFeedError='';
    if(!d.feed.length){
      // écran d’atterrissage de tous les chemins sociaux : il DOIT proposer une issue
      el.innerHTML = `<div class="friends-empty" style="text-align:center">
        <p>Ton fil s’animera dès qu’un ami partagera une lecture.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
          <button class="btn primary" id="feed-invite">${ic('link',16)} Inviter un ami</button>
          <button class="btn" id="feed-find">Chercher quelqu’un</button>
        </div></div>`;
      $('#feed-invite').addEventListener('click', shareInvite);
      $('#feed-find').addEventListener('click', ()=>{ social.tab='friends'; renderFriends(); setTimeout(()=>{ const q=$('#friend-search'); if(q) q.focus(); },80); });
      return;
    }
    _feedRows = d.feed;   // le menu « … » d’une ligne y retrouve sa donnée par l’index rendu ici
    el.innerHTML = d.feed.map((x,fi)=>{
      const rv = String(x.review||'').trim();
      const coupe = rv.length > 280;   // repliée à 3 lignes : le texte entier attend dans data-full
      // compteurs = COUNT(*) SQL (donc des nombres), mais on coerce pour tenir l’invariant
      // « tout ce qui vient du réseau est neutralisé » si la forme de /api/feed changeait un jour.
      x.hearts = Number(x.hearts) || 0; x.comments = Number(x.comments) || 0;
      const isMe = social.me && x.uid===social.me.id; // ma propre lecture : pas d’auto-cœur, mais je vois et modère les réponses
      return `
      <div class="feed-cell">
      <div class="feed-item">
        <div class="mini">${x.cover?`<img src="${esc(x.cover)}" alt="" loading="lazy"${xorigin(x.cover)} referrerpolicy="no-referrer">`:phHTML({title:x.title, authors:[x.authors||''].flat(), type:x.type}, true)}</div>
        <div class="fx">
          <div class="who">${isMe?'Tu':`<button type="button" class="who-btn" data-profile="${esc(x.username)}">${esc(x.display_name)}</button>`} <span style="color:var(--muted);font-weight:400">${isMe?'as lu':'a lu'}</span></div>
          <div class="what">${esc(x.title)}${x.rating?` · ${starsTxt(x.rating)}`:''}</div>
          ${rv?`<div class="feed-review"${coupe?` data-expand data-full="${esc(rv)}"`:''}>« ${esc(coupe?rv.slice(0,280):rv)}${coupe?'…':''} »</div>${coupe?`<button type="button" class="linkish rv-more" data-rv-more>Lire la suite</button>`:''}`:''}
        </div>
        <div class="feed-side">
          <div class="feed-date">${x.read_date?esc(fmtDate(x.read_date)):''}</div>
          <div style="display:flex;gap:6px">
            ${isMe ? (x.hearts?`<span class="heart-btn on" style="cursor:default" aria-label="${heartLabel(x.hearts)}">♥<span class="hn">${x.hearts}</span></span>`:'') : `
            <button class="heart-btn${x.i_hearted?' on':''}" data-react="${esc(x.book_key)}" data-owner="${esc(x.username)}"
              aria-pressed="${x.i_hearted?'true':'false'}" title="J’aime" aria-label="${heartLabel(x.hearts)}">♥<span class="hn">${x.hearts||''}</span></button>`}
            <button class="heart-btn cmt-btn" data-thread="${esc(x.username)}" data-key="${esc(x.book_key)}"
              aria-expanded="false" aria-controls="feed-thread-${fi}" title="Réponses" aria-label="${x.comments?`Réponses : ${x.comments}`:'Répondre'}">❝<span class="hn">${x.comments||''}</span></button>
            ${!isMe ? `<button class="heart-btn more-btn" data-feed-more="${fi}" title="Plus d\u2019actions" aria-label="Plus d\u2019actions sur cette lecture">\u2026</button>` : ''}
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
  }catch(e){ el.innerHTML = `<p class="friends-empty">${esc(netMsg(e))}</p>`; }
}
// le nom accessible remplace le contenu du bouton : il doit donc porter aussi le compteur
const heartLabel = n => n ? `J’aime cette lecture (${n} j’aime)` : `J’aime cette lecture`;
// Un seul écouteur délégué pour le fil : cœurs, dépliage des réponses, envoi, suppression.
function onFeedClick(e){
  if(e.target.closest('[data-react]')) return onFeedHeart(e);
  const tb = e.target.closest('[data-thread]');
  if(tb) return toggleThread(tb);
  const send = e.target.closest('.cmt-send');
  if(send) return sendComment(send.closest('.feed-thread').querySelector('.cmt-input'));
  // Une critique coupée à 280 caractères s’ouvre au clic — sur le texte lui-même ou sur
  // « Lire la suite », le bouton qui la suit (hors du bloc, sinon le line-clamp l’avalerait).
  const rvm = e.target.closest('[data-rv-more]');
  if(rvm) return expandReview(rvm.previousElementSibling, rvm);
  const rvx = e.target.closest('.feed-review[data-expand]');
  if(rvx) return expandReview(rvx, rvx.nextElementSibling);
  const more = e.target.closest('[data-feed-more]');
  if(more) return feedMoreMenu(more);
  const repc = e.target.closest('[data-report-comment]');
  if(repc){ reportContent('comment', repc.dataset.reportComment); return; }
  const del = e.target.closest('[data-cmt-del]');
  if(del) return deleteComment(del);
}
// Déplie une critique : textContent (jamais innerHTML) — le texte vient d’un autre membre.
function expandReview(el, btn){
  if(!el || !el.classList.contains('feed-review')) return;
  el.textContent = '« ' + (el.dataset.full||'') + ' »';
  el.classList.add('open'); el.removeAttribute('data-expand');
  if(btn && btn.hasAttribute && btn.hasAttribute('data-rv-more')) btn.remove();
}
// « … » d’une entrée du fil : les trois gestes qui manquaient — aller au profil, mettre le livre
// dans sa pile, signaler la critique. Le fil n’était jusqu’ici qu’une vitrine sans issue.
async function feedMoreMenu(btn){
  const x = _feedRows[+btn.dataset.feedMore]; if(!x) return;
  // « l’ai-je déjà ? » se juge sur TOUTE la bibliothèque (même « à lire »), pas sur ce que je partage
  const mine = new Map(state.books.filter(b=>!isDemoBook(b)).map(b=>[shelfKey(b), b.id]));
  const owned = mine.get(x.book_key);
  const de = /^[aàâeéèêëiîïoôöuùûüyh]/i.test(String(x.display_name||'')) ? 'd’' : 'de ';   // élision
  const v = await uiChoose({ title:x.title, choices:[
    { label:`Voir le profil ${de}${x.display_name}`, value:'profile' },
    owned ? { label:'Déjà dans ta bibliothèque : ouvrir', value:'open' }
          : { label:'Ajouter à ma pile', value:'add', variant:'primary' },
    { label:'Signaler cette critique', value:'report', variant:'danger' },
  ]});
  if(v==='profile') return openProfile(x.username);
  if(v==='open') return openDetail(owned);
  if(v==='report') return reportContent('review', x.username+'|'+x.book_key);
  if(v==='add') addSharedBook(x, x.username);
}
// Ajoute à MA bibliothèque un livre vu chez quelqu’un (fil ou étagère d’un profil). Le tag
// « vu-chez-<pseudo> » garde la trace de la recommandation localement : rien n’est envoyé.
function addSharedBook(r, fromUser){
  const b = normalizeBook({ title:r.title, authors:String(r.authors||'').split(/,\s*|\s*&\s*/).map(s=>s.trim()).filter(Boolean),
    type:r.type||'livre', series:r.series||'', volume:r.volume??null, cover:r.cover||'',
    status:'wishlist', tags:['vu-chez-'+fromUser], review:'', readings:[] });
  state.books.unshift(b); save();
  // Pas de render() ici : on est dans la vue Amis, la repeindre effacerait le fil ou le profil
  // sous le doigt. Les autres vues sont reconstruites à la prochaine bascule d’onglet.
  if(ui.view!=='friends') scheduleRender();
  toast(`« ${r.title} » ajouté à ta pile ✓`, {label:'Annuler', onAction:()=>{
    const i = state.books.indexOf(b); if(i>=0){ markBooksDeleted([b]); state.books.splice(i,1); save(); if(ui.view!=='friends') scheduleRender(); }
  }});
}
// --- fil de discussion sous une entrée ---
function threadHTML(d){
  const rows = d.comments.map(c=>`
    <div class="cmt-row">
      ${avatarHTML(c.displayName,"sm")}
      <div class="cmt-body"><b>${esc(c.displayName)}</b> ${esc(c.text)}
        <span class="cmt-date">${new Date(c.at).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</span></div>
      ${(c.mine || d.canModerate) ? `<button class="cmt-del" data-cmt-del="${esc(c.id)}" title="Supprimer" aria-label="Supprimer ce commentaire">×</button>` : ''}
      ${!c.mine ? `<button class="cmt-del" data-report-comment="${esc(c.id)}" title="Signaler" aria-label="Signaler ce commentaire">\u2690</button>` : ''}
    </div>`).join('');
  return (rows || `<p class="cmt-none">Sois la première personne à répondre.</p>`) + `
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
    // le compteur de l’entrée suit le fil réel
    const cn = btn.querySelector('.hn'); cn.textContent = d.comments.length || '';
    btn.setAttribute('aria-label', d.comments.length?`Réponses : ${d.comments.length}`:'Répondre');
  }catch(err){ th.innerHTML = `<p class="cmt-none">${esc(netMsg(err))}</p>`; }
}
// Va du fil à UNE lecture précise (depuis une notification) : bascule sur l’onglet, attend que
// renderFeed — asynchrone, il interroge le serveur — ait peint la ligne, puis la déplie.
async function openFeedThread(bookKey){
  social.view = null; social.tab = 'feed'; renderFriends();
  for(let i=0; i<24; i++){
    const btn = $$('#soc-tab [data-thread]').find(b=>b.dataset.thread===social.me.username && b.dataset.key===bookKey);
    if(btn){
      if(btn.getAttribute('aria-expanded')!=='true') toggleThread(btn);
      try{ btn.closest('.feed-cell').scrollIntoView({block:'center'}); }catch(_){ }
      return;
    }
    await new Promise(r=>setTimeout(r, 150));
  }
  // le fil ne remonte que les lectures partagées : la tienne n’y est pas si tu partages « Rien »
  toast('Cette lecture n’apparaît pas dans ton fil. Vérifie ton mode de partage (Amis › Partage).', {ms:6000});
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
    toast(netMsg(err));
    const i = cell.querySelector('.cmt-input'); if(i){ i.value = sent; i.focus(); } // rien de perdu
    sendBtn.disabled = false;
  }
}
async function deleteComment(del){
  if(del.disabled) return;
  // Un × de 20 px au bout d’une ligne, sur un écran tactile, s’atteint par accident — et la réponse
  // effacée ne revient pas. On demande avant, et on le dit après.
  if(!await uiConfirm({title:'Supprimer cette réponse ?', okLabel:'Supprimer', danger:true})) return;
  del.disabled = true;
  const cell = del.closest('.feed-cell');
  try{
    await api('/api/comment/delete', {method:'POST', body:{id:del.dataset.cmtDel}});
    toast('Réponse supprimée');
    await loadThread(cell);
    const i = cell.querySelector('.cmt-input'); if(i) i.focus(); // le focus ne retombe pas sur <body>
  }
  catch(err){ del.disabled = false; toast(netMsg(err)); }
}
// Bascule ♥ optimiste : l’UI répond tout de suite, puis se cale sur la réponse serveur (ou revient en arrière).
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
    toast(netMsg(err));
  }finally{ hb.disabled = false; }
}
async function renderFriendsList(){
  const el = $('#soc-tab');
  el.innerHTML = `
    <div class="add-friend">
      <input id="friend-search" placeholder="Rechercher quelqu’un (pseudo ou nom)…" aria-label="Rechercher un utilisateur" autocomplete="off">
      <button class="btn primary" id="friend-invite" title="Mon QR code et mon lien d’invitation">${ic('link',16)} Ajouter un ami</button>
    </div>
    <div id="search-res"></div>
    <div id="friend-lists"><p class="friends-empty">Chargement…</p></div>`;
  $('#friend-invite').addEventListener('click', openFriendQR);
  const addUser = async (uname, btn)=>{ if(btn.disabled) return; btn.disabled = true;
    try{ const r = await api('/api/friends/request', {method:'POST', body:{username:uname}});
      toast(r.status==='accepted'?'Vous êtes maintenant amis ✓':'Demande envoyée ✓');
      doSearchUsers($('#friend-search').value); loadFriendLists(); }
    catch(e){ btn.disabled=false; toast(netMsg(e)); } };
  let seq = 0, tmr = 0;
  function doSearchUsers(q){
    q = (q||'').trim(); const res = $('#search-res');
    if(q.length < 2){ res.innerHTML = ''; return; }
    const my = ++seq; clearTimeout(tmr);
    tmr = setTimeout(async ()=>{
      try{
        const d = await api('/api/search-users?q='+encodeURIComponent(q)); if(my!==seq) return;
        if(!d.users.length){ res.innerHTML = `<p class="friends-empty" style="padding:8px 0">Personne pour « ${esc(q)} ». Tu peux l’inviter par QR code ou par lien (bouton « Ajouter un ami »).</p>`; return; }
        res.innerHTML = `<div class="search-res-h">Résultats</div>` + d.users.map(u=>{
          const act = u.relation==='friend' ? `<span class="frel">✓ ami</span>`
            : u.relation==='sent' ? `<span class="frel">en attente</span>`
            : `<button class="btn small primary" data-add="${esc(u.username)}">${u.relation==='incoming'?'Accepter':'＋ Ajouter'}</button>`;
          return `<div class="frow">${avatarHTML(u.displayName)}
            <button type="button" class="fi clickable" data-profile="${esc(u.username)}"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></button>
            <div class="fa">${act}</div></div>`;
        }).join('');
      }catch(e){ if(my===seq) res.innerHTML = `<p class="friends-empty" style="padding:8px 0">${esc(netMsg(e))}</p>`; }
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
    // Un <button>, pas un div cliquable : la ligne s’atteint au Tab et s’ouvre à Entrée — un
    // lecteur d’écran ne devinait pas qu’un nom d’ami menait quelque part.
    const person = (p, actions)=>`<div class="frow">${avatarHTML(p.displayName)}
      <button type="button" class="fi clickable" data-profile="${esc(p.username)}"><b>${esc(p.displayName)}</b><span>@${esc(p.username)}</span></button>
      <div class="fa">${actions}</div></div>`;
    let html = '';
    if(d.incoming.length){ html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:8px 0">Demandes reçues</h4>`;
      html += d.incoming.map(p=>person(p, `<button class="btn small primary" data-accept="${esc(p.id)}">Accepter</button><button class="btn small" data-remove="${esc(p.id)}" data-kind="refuse" data-uname="${esc(p.username)}">Refuser</button>`)).join(''); }
    html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">Amis (${d.friends.length})</h4>`;
    // data-kind : les trois boutons appellent la même route, mais ne veulent dire ni la même chose à
    // l’utilisateur (refuser ≠ rompre) ni le même retour — d’où le libellé du toast et la confirmation.
    html += d.friends.length ? d.friends.map(p=>person(p, `<button class="btn small" data-remove="${esc(p.id)}" data-kind="friend" data-uname="${esc(p.username)}">Retirer</button>`)).join('')
      : `<p class="friends-empty">Aucun ami pour l’instant.</p>`;
    if(d.outgoing.length){ html += `<h4 style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">Demandes envoyées</h4>`;
      html += d.outgoing.map(p=>person(p, `<span style="font-size:12px;color:var(--faint)">en attente</span><button class="btn small" data-remove="${esc(p.id)}" data-kind="cancel" data-uname="${esc(p.username)}">Annuler</button>`)).join(''); }
    el.innerHTML = html;
    social.pendingRequests = d.incoming.length; refreshSocBadge();
  }catch(e){ el.innerHTML = `<p class="friends-empty">${esc(netMsg(e))}</p>`; }
}
async function renderMyShare(){
  const el = $('#soc-tab');
  const mode = social.me.shareMode || 'none';
  const shareable = shareableBooks();
  el.innerHTML = `
    <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">Choisis ce que tes amis peuvent voir. Ton étagère se synchronise ensuite automatiquement. ${plur(shareable.length,'titre partageable','titres partageables')} (lus ou notés).${(()=>{
      // le serveur n’accepte que les couvertures des catalogues de livres (une image quelconque
      // pourrait pister tes amis) : on le dit au lieu de les faire disparaître en silence
      const n = shareable.filter(b=>b.cover && !SHAREABLE_COVER.test(b.cover)).length;
      return n ? ` <span style="color:var(--faint)">${plur(n,'couverture ne sera pas partagée','couvertures ne seront pas partagées')} : image hors catalogue, le titre reste visible.</span>` : '';
    })()}</p>
    <fieldset class="share-options" id="share-mode">
      <legend>Visibilité de mon étagère</legend>
      <label><input type="radio" name="my-share" value="none" ${mode==='none'?'checked':''}><span><b>Rien</b><small>Tes amis ne voient rien</small></span></label>
      <label><input type="radio" name="my-share" value="ratings" ${mode==='ratings'?'checked':''}><span><b>Notes seules</b><small>Titres, notes et dates, sans critiques</small></span></label>
      <label><input type="radio" name="my-share" value="all" ${mode==='all'?'checked':''}><span><b>Tout</b><small>Titres, notes, critiques et dates</small></span></label>
    </fieldset>
    <div class="data-actions">
      <button class="btn" id="share-preview">Voir mon profil comme un ami</button>
      <button class="btn" id="share-sync">↻ Renvoyer ma liste</button>
    </div>
    <div id="share-status" role="status" aria-live="polite" style="font-size:13px;color:var(--muted);margin-top:12px"></div>
    <h4 class="soc-h4">Ma page publique</h4>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">Une page lisible par tous, à mettre dans une bio Instagram ou TikTok. Elle n’affiche que ce que tu partages ci-dessus, <b>jamais</b> ta bibliothèque privée. Désactivée par défaut.</p>
    <div class="data-actions">
      <button class="btn ${social.publicProfile?'':'primary'}" id="acc-pub">${social.publicProfile?'Rendre ma page privée':'Publier ma page'}</button>
      ${social.publicProfile?`<button class="btn" id="acc-pub-copy">${ic('link',16)} Copier le lien</button><a class="btn" id="acc-pub-open" href="/@${esc(social.me.username)}" target="_blank" rel="noopener">Voir ma page publique ↗</a>`:''}
    </div>`;
  // Le réglage s’applique au changement : cocher une case EST le geste, personne n’allait
  // chercher le bouton en dessous (on cochait « Rien » en croyant s’être caché).
  const radios = $$('#share-mode input');
  // l’onglet peut avoir changé pendant l’appel réseau : on ne touche au DOM que s’il est encore là
  const setStatus = t => { const s = $('#share-status'); if(s) s.textContent = t; };
  async function applyShare(chosen){
    // Partager, c’est envoyer des livres : pas avant que la bibliothèque de CE compte soit chargée
    // (appareil partagé, serveur injoignable). Se cacher (« Rien ») reste toujours possible.
    if(chosen!=='none' && !libraryReady()){
      setStatus('Attends le chargement de la bibliothèque de ce compte avant de partager.');
      const back = radios.find(r=>r.value===(social.me.shareMode||'none')); if(back) back.checked = true;
      return;
    }
    const session = accountSession();
    const fs = $('#share-mode'); if(fs) fs.disabled = true;
    setStatus('Enregistrement…');
    // le mode « notes seules » ne DOIT PAS envoyer les critiques (confidentialité garantie côté client)
    const payload = chosen==='none' ? [] : shelfPayload(chosen);
    try{
      const d = await api('/api/sync', {sessionToken:session.token, method:'POST', body:{shareMode:chosen, books:payload}});
      if(!currentAccount(session)) return;                 // session changée pendant l’appel : l’écran n’est plus le sien
      social.me.shareMode = d.shareMode;
      rememberShelfTag(shelfTag(d.shareMode, payload));   // l’auto-synchro sait que c’est à jour
      // Dire qui voit quoi, pas l’état d’un transfert : c’est la seule question que l’on se pose ici.
      setStatus(d.shareMode==='none' ? 'Tes lectures ne sont plus visibles par tes amis ✓'
        : d.shareMode==='ratings' ? 'Tes amis voient maintenant : notes seules ✓'
        : 'Tes amis voient tout (notes et critiques) ✓');
      // la barre « moi » affiche le mode : elle doit suivre le réglage sans changer d’onglet
      updateMeBarShare();
    }catch(e){
      setStatus(e.message==='offline' ? 'Pas de connexion : réglage non enregistré.' : netMsg(e));
      // rien n’a changé côté serveur : la case doit redire l’état réel, pas celui qu’on voulait
      const back = radios.find(r=>r.value===(social.me.shareMode||'none')); if(back) back.checked = true;
    }
    finally{ const f = $('#share-mode'); if(f) f.disabled = false; }
  }
  radios.forEach(input=>input.addEventListener('change', ()=>{ if(input.checked) applyShare(input.value); }));
  // Renvoi manuel : utile après un import massif, quand on veut la certitude que la liste est partie.
  $('#share-sync').addEventListener('click', async (ev)=>{
    const btn = ev.currentTarget; if(btn.disabled) return; btn.disabled = true;
    const chosen = (radios.find(r=>r.checked)||{}).value || 'none';
    try{ await applyShare(chosen); } finally{ btn.disabled = false; }
  });
  // Se voir comme un ami vaut mieux que se le faire décrire : /api/users/moi renvoie déjà
  // exactement l’étagère qu’un ami reçoit (friendState 'self', bouton Bloquer masqué).
  $('#share-preview').addEventListener('click', ()=>openProfile(social.me.username));
  bindPublicPageActions(renderMyShare);
}
// Boutons de « Ma page publique ». Extrait de renderAccount : la page publique est une question de
// visibilité, elle se règle donc là où l’on règle ce que voient les amis — un seul endroit.
function bindPublicPageActions(rerender){
  const pub = $('#acc-pub');
  if(pub) pub.onclick = async (e)=>{ const b=e.currentTarget; if(b.disabled)return; b.disabled=true;
    if(!social.publicProfile){
      // Publier en mode « Rien » donnerait une page vide : on l’explique au lieu de la publier.
      if((social.me.shareMode||'none')==='none'){
        b.disabled=false;
        await openDialog({ title:'Ta page serait vide', message:'Rien n’est partagé pour l’instant. Choisis d’abord « Notes seules » ou « Tout » ci-dessus.',
          actions:[{label:'Compris', value:null, cancel:true, default:true}] });
        return;
      }
      const mode = social.me.shareMode||'none';
      const ok = await uiConfirm({ title:'Publier ma page ?', okLabel:'Publier',
        message:`Ton nom affiché, ton pseudo, ta bio et tes lectures partagées (${mode==='all'?'notes et critiques':'notes seules'}) deviennent visibles par tous sur /@${social.me.username}.\n\nTes notes comptent alors dans la moyenne anonyme des pages publiques des livres (affichée seulement à partir de 3 notes), et tes critiques y apparaissent signées de ton pseudo si ton partage est réglé sur « Tout ».\n\nTu peux redevenir privé à tout moment : tout disparaît aussitôt.` });
      if(!ok){ b.disabled=false; return; }
    }
    try{ const d = await api('/api/account/public-profile', {method:'POST', body:{public: !social.publicProfile}});
      social.publicProfile = d.public;
      toast(d.public ? 'Ta page est en ligne ✓' : 'Ta page redevient privée');
      updateMeBarShare();   // la ligne d’état annonce aussi la page publique
      rerender(); }
    catch(err){ toast(netMsg(err)); b.disabled=false; } };
  const pubCopy = $('#acc-pub-copy');
  if(pubCopy) pubCopy.onclick = async ()=>{
    const url = location.origin + '/@' + social.me.username;
    try{ await navigator.clipboard.writeText(url); toast('Lien copié ✓'); }
    catch(_){ openDialog({title:'Ma page publique', message:url, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); }
  };
}
async function openProfile(username){
  try{
    const d = await api('/api/users/'+encodeURIComponent(username));
    // Le profil est un écran à part entière : sa propre entrée d’historique (marqueur tomeProfile,
    // distinct de tomeOverlay et tomeTab) pour que Retour ramène au sous-onglet d’où l’on vient
    // — le fil, les notifications, la recherche — et non à la vue précédente.
    social.profileFrom = social.tab;
    if(!(history.state||{}).tomeProfile){ try{ history.pushState({tomeProfile:1}, ''); }catch(_){ } }
    social.profile = d; social.view = 'profile'; renderFriends();
  }catch(e){ toast(netMsg(e)); }
}
// Quitte le profil : on repasse par l’historique quand l’entrée existe (le popstate remet le
// sous-onglet), sinon on revient à la main — pushState a pu être refusé (quota Safari).
function leaveProfile(){
  if((history.state||{}).tomeProfile){ try{ history.back(); return; }catch(_){ } }
  social.view=null; social.profile=null; social.tab=social.profileFrom||'friends'; renderFriends();
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
  // Le profil ne proposait AUCUN geste : on pouvait y arriver depuis le fil ou une recherche sans
  // pouvoir demander l’amitié, ni accepter celle qu’on nous avait demandée. Une seule ligne
  // d’état + action, dictée par la relation renvoyée par le serveur (friendState / iRequested).
  const rel = d.friendState==='self' || d.iBlocked ? ''
    : d.friendState==='accepted'
      ? `<div class="prof-rel"><span class="rel-state">✓ Vous êtes amis</span><button type="button" class="btn small" data-prof-drop data-kind="friend">Retirer</button></div>`
    : d.friendState==='pending' && d.iRequested
      ? `<div class="prof-rel"><span class="rel-state">Demande envoyée</span><button type="button" class="btn small" data-prof-drop data-kind="cancel">Annuler</button></div>`
    : d.friendState==='pending'
      ? `<div class="prof-rel"><span class="rel-state">${esc(d.user.displayName)} veut devenir ton ami</span><button type="button" class="btn small primary" data-prof-accept>Accepter</button><button type="button" class="btn small" data-prof-drop data-kind="refuse">Refuser</button></div>`
      : `<div class="prof-rel"><button type="button" class="btn primary" data-prof-add>Ajouter en ami</button></div>`;
  box.innerHTML = `
    <button class="btn small" id="prof-back" style="margin-bottom:14px">← Retour</button>
    <div class="profile-head">
      ${avatarHTML(d.user.displayName)}
      <div style="flex:1;min-width:0">
        <h3 style="font-size:20px">${esc(d.user.displayName)}</h3>
        <div class="muted" style="color:var(--muted)">@${esc(d.user.username)}</div>
      </div>
      ${d.friendState!=='self' ? (d.iBlocked
        ? `<button type="button" class="btn small" data-unblock="${esc(d.user.username)}">Débloquer</button>`
        : `<button type="button" class="btn small danger" data-block="${esc(d.user.username)}" aria-label="Bloquer ${esc(d.user.displayName)}">Bloquer</button>`) : ''}
    </div>
    ${d.user.bio ? `<p style="color:var(--muted);font-size:14px;margin-bottom:14px">${esc(d.user.bio)}</p>` : ''}
    ${rel}
    ${affinity!=null ? `<div class="affinity-ring"><span class="pct">${fmtPct(affinity)}</span><div><b>d’affinité de goût</b><div class="muted" style="color:var(--muted);font-size:12.5px">sur ${plur(rated.length,'livre noté','livres notés')} tous les deux</div></div></div>` : ''}
    ${d.areFriends ? (shelf.length ? `
      <p style="margin-bottom:14px">${plur(shelf.length,'titre partagé','titres partagés')}${common?` · <span class="common-badge">${common} en commun</span>`:''}</p>
      ${rated.length ? `<div style="margin-bottom:16px">${rated.slice(0,8).map(r=>`<div class="cmp-row"><span class="ct">${esc(r.title)}</span><span class="me" title="ta note"><span class="sr-only">ta note </span><span role="img" aria-label="${fmtDec(r.mine)} sur 5">${starsTxt(r.mine)}</span></span><span style="color:var(--faint)" aria-hidden="true">vs</span><span class="them" title="sa note"><span class="sr-only">sa note </span><span role="img" aria-label="${fmtDec(r.them)} sur 5">${starsTxt(r.them)}</span></span></div>`).join('')}</div>` : ''}
      <div class="grid">${shelf.map((b,i)=>`
        <div class="card${mine.has(b.book_key)?'':' shelf-add'}"${mine.has(b.book_key)?'':` data-shelf-i="${i}" role="button" tabindex="0" aria-label="Ajouter « ${esc(b.title)} » à ma pile"`}><div class="cover">
          <span class="badge ${esc(b.type)}">${TYPE_LABEL[b.type]||''}</span>
          ${b.cover?`<img src="${esc(b.cover)}" alt="" loading="lazy"${xorigin(b.cover)} referrerpolicy="no-referrer">`:phPubHTML(b)}
          ${mine.has(b.book_key)?`<span class="ribbon done">✓ toi aussi</span>`:''}
        </div><div class="under">${starsHTML(b.rating)}</div></div>`).join('')}</div>`
      : `<p class="friends-empty">${esc(d.user.displayName)} ne partage rien pour le moment.</p>`)
    : (d.iBlocked ? `<p class="friends-empty">Tu as bloqué cet utilisateur.</p>` : `<p class="friends-empty">Vous n’êtes pas encore amis : sa bibliothèque est privée.</p>`)}`;
  $('#prof-back').addEventListener('click', leaveProfile);
  const blockBtn = box.querySelector('[data-block]');
  if(blockBtn) blockBtn.addEventListener('click', async ()=>{
    if(blockBtn.disabled) return;
    // Bloquer efface aussi les ♥ et les réponses échangées (worker : handleBlock) : le dire avant,
    // pas après, et dire où l’annuler.
    if(!await uiConfirm({title:'Bloquer '+d.user.displayName+' ?', message:'Vous ne serez plus amis ; cette personne ne pourra plus t’ajouter, voir tes lectures ni t’écrire. Vos réactions et réponses échangées seront effacées. Réversible depuis Mon compte › Utilisateurs bloqués.', okLabel:'Bloquer', danger:true})) return;
    blockBtn.disabled = true;
    try{ await api('/api/block', {method:'POST', body:{username:d.user.username}}); toast('Blocage effectif. Pour l’annuler : Mon compte', {ms:6000}); social.profileFrom='friends'; leaveProfile(); }
    catch(e){ blockBtn.disabled = false; toast(e.message); }
  });
  // Le serveur ne signale le blocage que dans un sens (celui qu’on a posé) : on propose donc
  // le déblocage ici, sans obliger à passer par Mon compte › Utilisateurs bloqués.
  const unblockBtn = box.querySelector('[data-unblock]');
  if(unblockBtn) unblockBtn.addEventListener('click', async ()=>{
    if(unblockBtn.disabled) return;
    unblockBtn.disabled = true;
    try{ await api('/api/unblock', {method:'POST', body:{username:d.user.username}}); toast('Utilisateur débloqué ✓'); openProfile(d.user.username); }
    catch(e){ unblockBtn.disabled = false; toast(netMsg(e)); }
  });
  // --- Amitié : demander, accepter, refuser, annuler, retirer. Chaque action rouvre le profil,
  //     qui re-demande la relation au serveur : l’état affiché ne peut pas mentir.
  const addBtn = box.querySelector('[data-prof-add]');
  if(addBtn) addBtn.addEventListener('click', async ()=>{
    if(addBtn.disabled) return; addBtn.disabled = true;
    try{
      const r = await api('/api/friends/request', {method:'POST', body:{username:d.user.username}});
      toast(r.status==='accepted' ? 'Vous êtes maintenant amis ✓' : 'Demande envoyée ✓');
      socRefresh(); openProfile(d.user.username);
    }catch(e){ addBtn.disabled = false; toast(netMsg(e)); }
  });
  const accBtn = box.querySelector('[data-prof-accept]');
  if(accBtn) accBtn.addEventListener('click', async ()=>{
    if(accBtn.disabled) return; accBtn.disabled = true;
    try{ await api('/api/friends/accept', {method:'POST', body:{userId:d.user.id}}); toast('Ami ajouté ✓'); socRefresh(); openProfile(d.user.username); }
    catch(e){ accBtn.disabled = false; toast(netMsg(e)); }
  });
  const dropBtn = box.querySelector('[data-prof-drop]');
  if(dropBtn) dropBtn.addEventListener('click', async ()=>{
    if(dropBtn.disabled) return;
    const kind = dropBtn.dataset.kind;
    if(kind==='friend' && !await askUnfriend(d.user.username)) return;
    dropBtn.disabled = true;
    try{
      await api('/api/friends/remove', {method:'POST', body:{userId:d.user.id}});
      toast({friend:'Ami retiré', refuse:'Demande refusée', cancel:'Demande annulée'}[kind] || 'Fait ✓');
      socRefresh(); openProfile(d.user.username);
    }catch(e){ dropBtn.disabled = false; toast(netMsg(e)); }
  });
  // --- Étagère : chaque titre qu’on n’a pas devient un ajout d’un geste (elle n’était qu’une
  //     image). Écouteurs posés sur la grille — un nœud neuf à chaque rendu, donc jamais empilés
  //     (box, lui, est #friends-body, qui survit aux rendus et porte déjà ses délégués).
  const grid = box.querySelector('.grid');
  if(grid){
    const askAdd = async card=>{
      const b = shelf[+card.dataset.shelfI]; if(!b) return;
      if(await uiChoose({ title:b.title, message:b.authors?String(b.authors):'',
        choices:[{label:'Ajouter à ma pile', value:'add', variant:'primary'}] }) === 'add') addSharedBook(b, d.user.username);
    };
    grid.addEventListener('click', e=>{ const c = e.target.closest('[data-shelf-i]'); if(c) askAdd(c); });
    grid.addEventListener('keydown', e=>{
      if(e.key!=='Enter' && e.key!==' ') return;
      const c = e.target.closest('[data-shelf-i]'); if(!c) return;
      e.preventDefault(); askAdd(c);
    });
  }
}
// Rompre une amitié détruit du contenu partagé (réactions, réponses) et coûte une nouvelle
// demande pour revenir en arrière : on demande avant. Refuser ou annuler une demande, non.
function askUnfriend(uname){
  return uiConfirm({
    title:`Retirer @${uname||''} de tes amis ?`,
    message:'Vous ne verrez plus vos lectures respectives ; vos réactions et réponses échangées seront effacées. Il faudra une nouvelle demande pour redevenir amis.',
    okLabel:'Retirer', danger:true});
}
// Se déconnecter (bouton de la vue Mon compte). Coupe la sauvegarde : ce qui n’est pas encore
// parti (note prise il y a deux secondes, envoi en vol) ne partirait plus jamais. On vide la file
// d’abord, et on ne part en silence que si le serveur a bien tout pris.
async function socLogout(){
  const hasReal = (state.books||[]).some(b=>!isDemoBook(b));
  if(!await uiConfirm({title:'Se déconnecter ?', message: hasReal ? 'Tu choisiras ensuite si ta bibliothèque reste visible sur cet appareil.' : 'Ta bibliothèque reste sur cet appareil.', okLabel:'Se déconnecter'})) return;
  if(_libDirty || _libPushing){
    toast('Envoi des dernières modifications…', {ms:15000});
    await flushLibrary();
    if(_libDirty && !await uiConfirm({title:'Modifications non envoyées', message:'Pas de connexion. Te déconnecter quand même ? Elles resteront sur cet appareil seulement.', okLabel:'Quand même', danger:true})) return;
  }
  // Appareil partagé : déconnecté, la bibliothèque restait lisible et modifiable par le suivant, sans
  // mot de passe — et ses retouches repartaient sur le compte à la reconnexion. On propose de la
  // mettre de côté (copie propre à ce compte, fusionnée d’office à sa prochaine connexion ici) :
  // un choix, jamais imposé. Rien à retirer s’il n’y a que les exemples.
  let retirer = false;
  if(hasReal){
    const saved = libraryReady() && !_libDirty;
    retirer = await uiConfirm({ title:'Retirer ma bibliothèque de cet appareil ?',
      message:(saved ? 'Elle est enregistrée sur ton compte et reviendra à ta prochaine connexion ici. ' : 'Elle sera gardée de côté sur cet appareil, avec tes modifications non envoyées, et reviendra à ta prochaine connexion ici. ')
        + 'Si tu la laisses, elle reste lisible et modifiable sans mot de passe par quiconque ouvre Tome sur cet appareil.',
      okLabel:'Retirer', cancelLabel:'La laisser' });
  }
  const owner = (state.meta && state.meta.ownerId) || social.me.id;   // à qui appartient ce qu’on met de côté (lu avant de fermer la session)
  try{ await api('/api/logout', {method:'POST'}); }catch(_){}
  resetLibrarySync(); _socUserToken='';   // APRÈS le flush : ce qui restait en file a eu sa chance de partir
  try{ localStorage.removeItem(SOC_TOKEN); }catch(_){}
  social.me=null; social.view=null; social.libRev=0; social.todayFeed=null; social.todayFeedAt=0; social.todayFeedUser=''; social.todayFeedError=''; setLibStatus('');
  social.sessionExpired=false;   // partir de son plein gré n’est pas une session perdue : pas de message d’expiration
  setFriendsBadge(0);
  if(retirer){ setAsideBeforeWipe(owner); replaceState({}); libPersist(); clearSelection(); toast('Bibliothèque retirée de cet appareil, elle reviendra à ta prochaine connexion ici', {ms:6000}); }
  render();   // Mon compte repasse au formulaire de connexion, l’avatar de l’en-tête à la silhouette
}
// écouteur délégué unique pour toute la vue Amis
$('#friends-body').addEventListener('click', async e => {
  const sub = e.target.closest('.friends-sub button');
  if(sub){ social.tab = sub.dataset.tab; renderFriends(); return; }
  // « Modifier » de la ligne d’état : va droit au réglage, sans passer par Compte.
  if(e.target.closest('[data-share-edit]')){ social.tab='me'; renderFriends(); return; }
  // La barre « moi » mène à la vue Mon compte (ex-sous-onglet Compte).
  if(e.target.closest('#soc-me')){ selectView('account'); return; }
  const acc = e.target.closest('[data-accept]');
  if(acc){ if(acc.disabled) return; acc.disabled=true; try{ await api('/api/friends/accept', {method:'POST', body:{userId:acc.dataset.accept}}); toast('Ami ajouté ✓'); loadFriendLists(); }catch(e2){ acc.disabled=false; toast(e2.message); } return; }
  const rem = e.target.closest('[data-remove]');
  if(rem){
    if(rem.disabled) return;
    const kind = rem.dataset.kind;
    // Seule la rupture d’amitié détruit du contenu partagé (réactions, réponses) et coûte une
    // nouvelle demande pour revenir en arrière : refuser ou annuler une demande, non.
    if(kind==='friend' && !await askUnfriend(rem.dataset.uname)) return;
    rem.disabled=true;
    try{
      await api('/api/friends/remove', {method:'POST', body:{userId:rem.dataset.remove}});
      toast({friend:'Ami retiré', refuse:'Demande refusée', cancel:'Demande annulée'}[kind] || 'Fait ✓');
      loadFriendLists();
    }catch(e2){ rem.disabled=false; toast(netMsg(e2)); }
    return;
  }
  const prof = e.target.closest('[data-profile]');
  if(prof){ openProfile(prof.dataset.profile); return; }
});
// Motif ARIA Tabs : dans une barre d’onglets, les flèches changent d’onglet et la tabulation
// sort de la barre. Sans ça, les quatre boutons obligent à quatre Tab pour atteindre le contenu.
$('#friends-body').addEventListener('keydown', e => {
  // La barre « moi » est un div role=button : le navigateur ne l’active pas tout seul au clavier.
  const me = e.target.closest && e.target.closest('#soc-me');
  if(me && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); me.click(); return; }
  const sub = e.target.closest && e.target.closest('.friends-sub button');
  if(!sub) return;
  const step = {ArrowLeft:-1, ArrowRight:1, Home:'first', End:'last'}[e.key];
  if(step===undefined) return;
  e.preventDefault();
  const i = SOC_TABS.findIndex(t=>t[0]===sub.dataset.tab); if(i<0) return;
  const j = step==='first' ? 0 : step==='last' ? SOC_TABS.length-1 : (i+step+SOC_TABS.length) % SOC_TABS.length;
  if(j===i) return;
  social.tab = SOC_TABS[j][0]; renderFriends();
  // renderFriends a reconstruit la barre : on retrouve le bouton par son id, pas par la référence
  const el = $('#soc-tab-'+social.tab); if(el) el.focus();
});

/* =============== Restauration des préférences d’affichage =============== */
(function restoreUI(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(UI_KEY)||'null'); }catch(_){}
  if(saved && typeof saved==='object'){
    if(SORT_KEYS.includes(saved.sort)) ui.sort = saved.sort;
    ui.sortDesc = saved.sortDesc===true;
    if(typeof saved.groupSeries==='boolean') ui.groupSeries = saved.groupSeries;
    if(['ask','on'].includes(saved.ideas)) ui.ideas = saved.ideas;
    if(['count','pages'].includes(saved.typeMetric)) ui.typeMetric = saved.typeMetric;
    if(['auto','all','fr','en','ru','es','de','it','ja'].includes(saved.searchLang)) ui.searchLang = saved.searchLang;
    if(['grid','list'].includes(saved.libLayout)) ui.libLayout = saved.libLayout;
    // Année du Journal : 'all' ou un millésime à 4 chiffres. renderJournal retombe sur 'all'
    // si l’année sauvegardée n’a plus aucune lecture (livres supprimés, import annulé).
    if(saved.journalYear==='all' || /^\d{4}$/.test(String(saved.journalYear||''))) ui.journalYear = String(saved.journalYear);
    if(typeof saved.journalSessions==='boolean') ui.journalSessions = saved.journalSessions;
    if(['today','library','journal','lists','stats','friends','account'].includes(saved.view)) ui.view = saved.view;
  }
  // statut, types, tag : même lecture (et même reflet dans les puces) qu’au retour après un saut
  restoreLibFilters(saved);
  // refléter dans le DOM
  $('#chip-series').classList.toggle('active', ui.groupSeries); $('#chip-series').setAttribute('aria-pressed', ui.groupSeries);
  $('#lib-sort').value = ui.sort; syncSortDirBtn();
  // (le segment « Ajouter en » n’est plus restauré : openSearch le repositionne à chaque ouverture)
})();

// vue initiale : hash > préférence sauvegardée (capturer le hash AVANT que selectView ne le remplace)
const _initHash = location.hash;
const _hash = _initHash.slice(1);
if(['today','library','journal','lists','stats','friends','account'].includes(_hash)) ui.view = _hash;
selectView(ui.view);
_navReady = true;   // à partir d’ici, changer d’onglet pousse une entrée d’historique (cf. selectView)
refreshResume();
const _origRender = render;
render = function(){ _origRender(); refreshResume(); updateStreakPill(); };
updateStreakPill();
$('#btn-streak').addEventListener('click', ()=>selectView('stats'));
if(_initHash.startsWith('#book/') || _initHash.startsWith('#invite/')) applyHashView(_initHash);
if(_loaded.migrated) save(true); // fige la migration depuis l’ancienne clé, sans compter comme une modification
// Données illisibles au chargement : un toast de 2,4 s disparaît avant d’avoir été lu, et il n’offre
// aucun chemin d’action. On pose un bandeau persistant (même famille que #save-warning) qui mène
// droit à « Restaurer une sauvegarde », dans Mon compte › Mes données.
if(_loaded.notice){
  const dw = $('#data-warning');
  if(dw){
    dw.hidden = false;
    $('#data-warning-restore').addEventListener('click', ()=>{
      selectView('account');
      const r = $('#btn-restore');
      // On se fie à hasRecoverable() (la vérité sur ce qui est récupérable) plutôt qu’à l’état
      // affiché du bouton, sinon le seul chemin de récupération peut rester injoignable.
      if(r && hasRecoverable()){
        r.hidden = false;
        // le clic doit rester dans le même geste utilisateur que celui d’origine (dialogues, fichiers)
        try{ r.scrollIntoView({block:'center'}); }catch(_){}
        r.click();
      }
      else toast('Aucune sauvegarde récupérable. Mon compte › Mes données pour exporter ce qui reste', {ms:6000});
    });
    $('#data-warning-close').addEventListener('click', ()=>{ dw.hidden = true; });
  }else{
    setTimeout(()=>toast(_loaded.notice), 600);   // repli si le bandeau manque (vieux HTML en cache)
  }
}
// restaure la session sociale si un token existe → rafraîchit la vue Amis + synchronise la biblio du compte
if(socToken()) socRefresh().then(()=>{ if(social.me){ syncLibraryOnLogin().then(()=>pushShelf()); } if(ui.view==='friends' || ui.view==='account') render(); else if(ui.view==='today') renderToday();
  paintPPCta(); });   // page publique ouverte : son appel à l’action dépend de la session, qui vient d’arriver

// Page d’accueil : présentée aux visiteurs qui arrivent sans compte et sans bibliothèque à eux.
// (Les utilisateurs connectés, ou qui ont déjà des livres, entrent directement dans l’app.)
const _pubUser = publicUsernameFromURL();
const _pubBook = publicBookSlugFromURL();
if(_pubUser) showPublicProfile(_pubUser);   // visiteur arrivé par un lien de bio : page publique, rien d’autre
else if(_pubBook) showPublicBook(_pubBook); // visiteur arrivé sur la page d’un livre
(function maybeWelcome(){
  if(_pubUser || _pubBook) return;                      // ne pas superposer la page d’accueil à un profil public
  let welcomed = false;
  try{ welcomed = !!localStorage.getItem('tome-welcomed'); }catch(_){}
  const hasRealBooks = (state.books||[]).some(b=>!(b.tags||[]).includes('exemple'));
  if(hasRealBooks || socToken()){ try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}; return; }
  // _initHash = hash d’ARRIVÉE (capturé avant que selectView ne pose #today) : on n’interrompt
  // pas un visiteur qui deep-linke (#book/…, #invite/…), seulement une arrivée « à froid ».
  // seuls les VRAIS deep-links suppriment la page d’accueil : le start_url de la PWA porte
  // désormais #today, qui sinon la désactiverait définitivement pour les nouveaux venus
  // Une invitation N’EST PAS un deep-link à respecter en silence : c’est le trafic le plus
  // qualifié (recommandé par un ami). Il doit voir ce qu’est Tome avant qu’on lui demande
  // de créer un compte — l’invitation est mémorisée et traitée après l’inscription.
  const deepLink = _initHash.startsWith('#book/');
  // Bibliothèque illisible : l’état chargé est vide, mais la personne n’est PAS une nouvelle venue.
  // Lui servir la page de garde « Découvre Tome » par-dessus l’alerte serait la façon la plus sûre
  // de lui faire croire que tout est perdu — et masquerait le bandeau de récupération.
  if(_loaded.corrupted) return;
  if(!welcomed && !deepLink) showWelcome();
})();

/* =============== Page d’accueil publique =============== */
function showWelcome(){ const w=$('#welcome'); if(!w) return; w.hidden=false; document.body.classList.add('welcome-open');
  try{ window.scrollTo(0,0); }catch(_){}
  // invité par un ami : le dire ici, sur la page qui explique le produit
  const who = social.invite || loadPendingInvite();
  const host = $('#lp-invite');
  if(host){ host.innerHTML = who ? `<b>@${esc(who)}</b> t’invite à rejoindre Tome.` : ''; host.hidden = !who; }
  syncModalIsolation();
  const first=w.querySelector('[data-lp="signup"]'); if(first) try{ first.focus(); }catch(_){} }
function hideWelcome(){ const w=$('#welcome'); if(!w) return; w.hidden=true; document.body.classList.remove('welcome-open'); syncModalIsolation();
  try{ window.scrollTo(0,0); }catch(_){}  // la page de garde a pu faire defiler la fenetre : l’app repart en haut
  if(location.hash==='#welcome'){ try{ history.replaceState(history.state,'',location.pathname+location.search); }catch(_){} } }
$('#welcome').addEventListener('click', e=>{
  const b = e.target.closest('[data-lp]'); if(!b) return;
  const a = b.dataset.lp;
  if(a==='legal'){ openDialog({title:'Mentions légales & confidentialité', message:LEGAL_TEXT, actions:[{label:'Fermer', value:null, cancel:true, default:true}]}); return; }
  if(a==='pledge'){ showPledge(); return; }
  if(a==='versions'){ showVersions(); return; }
  try{ localStorage.setItem('tome-welcomed','1'); }catch(_){}   // ne plus l’imposer au prochain lancement
  hideWelcome();
  if(a==='signup' || a==='login'){ selectView('friends'); if(!social.me) renderAuth($('#friends-body'), a==='signup'?'signup':'login'); }
  // « Importer ma bibliothèque » : même chemin que data-today-import — le sélecteur de fichier
  // s’ouvre dans la foulée du clic (geste utilisateur conservé), sinon le navigateur le bloquerait.
  if(a==='import'){ selectView('account'); $('#btn-import-csv').click(); return; }
  if(a==='feedback'){ sendFeedback(); return; }
  // « Essayer d’abord » sur une bibliothèque vide : on sème la démo pour montrer l’app
  // habitée plutôt qu’un écran nu (le bandeau « Tout effacer » permet de repartir à zéro).
  if(a==='try' && !state.books.length) startDemo();
});
// couvertures de l’éventail : si une image ne charge pas (hors-ligne, 404), on la retire → la carte
// dégradée avec le titre reste en repli élégant
document.addEventListener('error', e=>{
  if(e.target && e.target.matches && e.target.matches('#welcome .lp-cover,.ob-cov img')) e.target.remove();
}, true);
// Prévisualisation : #welcome affiche la page d’accueil (le branchement au 1er lancement viendra avec les comptes)
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
  // micro-typographie française (frTypo)
  assert('frTypo guillemets', frTypo('"super"') === '\u00AB\u00A0super\u00A0\u00BB');
  assert('frTypo apostrophe', frTypo("c’est") === 'c\u2019est');
  assert('frTypo insecable !', frTypo('Bravo !') === 'Bravo\u00A0!');
  assert('frTypo colle ?', frTypo('Vraiment?') === 'Vraiment\u00A0?');
  assert('frTypo deux-points epargnes', frTypo('12:30 et http://a.fr') === '12:30 et http://a.fr');
  assert('frTypo suspension', frTypo('bof...') === 'bof\u2026');
  assert('normalize pace null', nb.pace===null);
  const nloan=normalizeBook({title:'x', loan:{to:'Alice', since:'2026-08-01', due:'2026-09-01'}});
  assert('normalize loan due date', nloan.loan && nloan.loan.due==='2026-09-01');
  assert('normalize invalid loan due', normalizeBook({title:'x', loan:{to:'Alice', due:'demain'}}).loan.due===null);
  assert('cleanSynopsis strips html', cleanSynopsis('<p>Hi<br>there</p>')==='Hi there');
  assert('cleanRating 3.7→3.5', cleanRating('3.7')===3.5);
  assert('cleanCover http→https', cleanCover('http://x/y.jpg')==='https://x/y.jpg');
  assert('fullTitle series+vol', fullTitle({title:'A', series:'A', volume:2})==='A, tome 2');
  // micro-typographie des chaînes de l’interface : espace insécable avant ? ! » et après «
  assert('insécables SEARCH_HINT', !/[^\u00A0\u202F] [?!»]/.test(SEARCH_HINT) && !/« /.test(SEARCH_HINT));
  assert('plur', plur(1,'livre')==='1\u00A0livre' && plur(3,'livre')==='3\u00A0livres' && plur(2,'livre existe','livres existent')==='2\u00A0livres existent');
  assert('fmtPct/fmtRatio/fmtDec', fmtPct(42)==='42\u202F%' && fmtRatio(3,10)==='3\u00A0/\u00A010' && fmtDec(3.5)==='3,5');
  assert('netMsg', netMsg({message:'offline'}).startsWith('Pas de connexion') && netMsg({status:429, message:'x'}).startsWith('Trop de demandes') && netMsg({status:503, message:'x'}).startsWith('Tome a un souci') && netMsg({status:400, message:'Pseudo pris'})==='Pseudo pris');
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
  assert('merge : marque la copie locale conflictuelle', _m.books.some(b=>b.title==='Dune' && hasConflictTag(b) && b.study.summary==='Récent'));
  const _same=mergeLibraries({books:[{id:'local',title:'Neuromancien',authors:['William Gibson']}]},{books:[{id:'server',title:'Neuromancien',authors:['William Gibson']}]});
  assert('merge : déduplique deux versions identiques', _same.books.filter(b=>b.title==='Neuromancien').length===1);
  // F42b : marqueurs de suppression — la suppression l’emporte sur une copie inchangée, jamais sur une copie modifiée
  const _x = {id:'x1', title:'Le Rivage des Syrtes', authors:['Julien Gracq'], review:'', tags:[]};
  const _mk = {deletedBooks:{x1:{rev:2, fp:bookFingerprint(_x)}}};
  const _d1 = mergeLibraries({books:[], meta:_mk}, {books:[_x, {id:'y1', title:'Autre'}], lists:[{id:'L', name:'L', bookIds:['x1','y1']}]});
  assert('marqueur : la copie serveur inchangée disparaît (avec ses références)', !_d1.books.some(b=>b.id==='x1') && eq(_d1.lists[0].bookIds, ['y1']) && _d1.meta.deletedBooks.x1.rev===2);
  const _d2 = mergeLibraries({books:[], meta:_mk}, {books:[{..._x, review:'Écrite ailleurs après la suppression'}]});
  assert('marqueur : la copie serveur modifiée est gardée, ré-identifiée et étiquetée', _d2.books.length===1 && _d2.books[0].id!=='x1' && hasConflictTag(_d2.books[0]) && _d2.meta.mergeKept===1 && mergeReport(_d2).includes('modifié ailleurs'));
  const _d3 = mergeLibraries({books:[_x]}, {books:[], meta:_mk});
  assert('marqueur : la copie locale inchangée disparaît', _d3.books.length===0 && _d3.meta.mergeKept===0);
  const _d4 = mergeLibraries({books:[{..._x, rating:5}]}, {books:[], meta:_mk});
  assert('marqueur : la copie locale modifiée est gardée, ré-identifiée et étiquetée', _d4.books.length===1 && _d4.books[0].id!=='x1' && hasConflictTag(_d4.books[0]) && _d4.meta.mergeKept===1);
  assert('comparable : l’étiquette de conflit ne fait pas deux versions', bookComparable(_x)===bookComparable({..._x, tags:[CONFLICT_TAG]}) && bookFingerprint(_x)!==bookFingerprint({..._x, rating:5}));
  const _nd = normalizeData({books:[_x], meta:{deletedBooks:{x1:{rev:1, fp:'a.b'}, bad:{rev:0, fp:'z'}, z9:{rev:3, fp:'q.r'}, nope:'3'}, futur:{k:1}}});
  assert('marqueur : un livre présent fait céder son marqueur, les entrées invalides tombent, meta inconnue transite', _nd.books.length===1 && !_nd.meta.deletedBooks.x1 && !_nd.meta.deletedBooks.bad && !_nd.meta.deletedBooks.nope && _nd.meta.deletedBooks.z9.rev===3 && eq(_nd.meta.futur,{k:1}));
  const _big = {}; for(let i=0;i<MAX_DELETED_MARKS+5;i++) _big['m'+i] = {rev:i+1, fp:'f.p'};
  const _cap = normalizeDeletedBooks(_big);
  assert('marqueur : plafond, les plus anciens cèdent', Object.keys(_cap).length===MAX_DELETED_MARKS && !_cap.m0 && !_cap.m4 && !!_cap.m5 && !!_cap['m'+(MAX_DELETED_MARKS+4)]);
  assert('marqueur : union, la suppression la plus récente gagne', mergeDeletedBooks({a:{rev:1, fp:'x.1'}}, {a:{rev:4, fp:'x.4'}, b:{rev:2, fp:'y.2'}}).a.fp==='x.4' && mergeDeletedBooks({a:{rev:5, fp:'x.5'}}, {a:{rev:4, fp:'x.4'}}).a.fp==='x.5');
  // F42c : une copie de secours ne se restaure que si elle est à personne ou au compte connecté
  assert('restauration : à personne → toujours ; à moi → connecté seulement ; à un autre → jamais', restorableBy(null,'') && restorableBy(null,'A') && restorableBy('A','A') && !restorableBy('A','') && !restorableBy('A','B'));
  assert('restauration : la version remplacée a un emplacement par propriétaire, un écran vide ou d’exemples n’en demande pas', preRestoreKey('')==='-prerestore' && preRestoreKey('A')==='-prerestore:A' && !hasLibraryContent({books:[{title:'x', tags:['exemple']}], goals:{2026:20}, meta:{demoGoal:true}}) && hasLibraryContent({books:[{title:'x'}]}) && libraryContentFp({books:[{id:'a', title:'x'}], goals:{2026:3}})!==libraryContentFp({books:[{id:'a', title:'x'}], goals:{2026:4}}));
  assert('mise de côté : clé par compte, ownerName transite par normalizeData', asideKey('A')===LS_KEY+'-autre:A' && normalizeData({meta:{ownerName:'lucas_bd'}}).meta.ownerName==='lucas_bd' && normalizeData({meta:{ownerName:42}}).meta.ownerName===null);
  // Fusion à trois voies : avec une base, seul un livre retouché des DEUX côtés est dédoublé
  const _b0 = {id:'t1', title:'Dune', authors:['Frank Herbert']}, _b5 = {..._b0, rating:5}, _b3 = {..._b0, rating:3};
  const _base = libRev => ({libRev, syncFp:{rev:libRev, ...syncFingerprints({books:[_b0]})}});
  const _t1 = mergeLibraries({books:[_b0], meta:_base(2)}, {books:[_b5]});
  assert('trois voies : seul le compte a changé → sa version, sans doublon', _t1.books.length===1 && _t1.books[0].rating===5 && _t1.meta.mergeConflicts===0);
  const _t2 = mergeLibraries({books:[_b3], meta:_base(2)}, {books:[_b0]});
  assert('trois voies : seul le local a changé → la version locale, sans doublon', _t2.books.length===1 && _t2.books[0].rating===3 && !hasConflictTag(_t2.books[0]));
  const _t3 = mergeLibraries({books:[_b3], meta:_base(2)}, {books:[_b5]});
  assert('trois voies : vrai conflit → les deux versions, la locale étiquetée', _t3.books.length===2 && _t3.meta.mergeConflicts===1 && _t3.books.some(b=>b.rating===3 && hasConflictTag(b)));
  const _t4 = mergeLibraries({books:[_b0], meta:{..._base(2), libRev:3}}, {books:[_b5]});
  assert('trois voies : une base posée à une autre révision est ignorée', _t4.books.length===2);
  assert('trois voies : la base ne sort pas de l’appareil', withoutSyncBase({books:[], meta:_base(2)}).meta.syncFp===undefined && _t1.meta.syncFp.books.t1===bookFingerprint(_b5));
  // Contre-vérification du 20/09 : le rapprochement par titre passe APRÈS la règle à trois voies, et les marqueurs regardent la base
  const _v1 = {..._b0, volume:1}, _vBase = {libRev:2, syncFp:{rev:2, ...syncFingerprints({books:[_v1]})}};
  const _t5 = mergeLibraries({books:[{..._v1, id:'t9'}, {..._v1, volume:2}], lists:[{id:'L', name:'L', bookIds:['t9']}], meta:_vBase}, {books:[_v1]});
  assert('trois voies : un tome renuméroté puis rajouté (en tête) ne disparaît pas, la liste le garde', _t5.books.length===2 && _t5.books.some(b=>b.id==='t1' && b.volume===2) && _t5.books.some(b=>b.id==='t9' && b.volume===1) && eq(_t5.lists[0].bookIds, ['t9']) && _t5.meta.mergeConflicts===0);
  const _mk5 = {deletedBooks:{t1:{rev:3, fp:bookFingerprint(_b5)}}};
  const _t6 = mergeLibraries({books:[_b0], meta:_base(2)}, {books:[], meta:_mk5}), _t7 = mergeLibraries({books:[], meta:{..._base(2), ..._mk5}}, {books:[_b0]});
  assert('marqueur : noté puis supprimé, la copie restée à la base disparaît (locale, ou du compte si la suppression vient d’ici)', _t6.books.length===0 && _t6.meta.mergeKept===0 && _t7.books.length===0 && _t7.meta.mergeKept===0);
  assert('marqueur : sans base, ou copie retouchée depuis la base, le livre est gardé', mergeLibraries({books:[_b0]}, {books:[], meta:_mk5}).books.length===1 && mergeLibraries({books:[], meta:_mk5}, {books:[_b0]}).books.length===1 && mergeLibraries({books:[_b3], meta:_base(2)}, {books:[], meta:_mk5}).meta.mergeKept===1 && mergeLibraries({books:[], meta:{..._base(2), ..._mk5}}, {books:[_b3]}).meta.mergeKept===1);
  // v10 : fiches d’étude et répétition espacée
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
  // F40 : progression en %, date de début de lecture, sessions du Journal
  assert('F40 : « 35 % » devient une page quand la pagination est connue', parseProgressInput('35 %', {pages:200}).page===70);
  assert('F40 : « 35% » sans pagination garde le pourcentage', parseProgressInput('35%', {pages:null}).pct===35);
  assert('F40 : « ,35 » (pavé décimal) vaut 35 %, « 210 » reste une page', parseProgressInput(',35', {}).pct===35 && parseProgressInput('210', {}).page===210 && parseProgressInput('', {})===null);
  assert('F40 : la barre suit currentPct sans pagination, la page sinon', progressPct({pages:null, currentPct:35})===35 && progressPct({pages:200, currentPage:50, currentPct:90})===25);
  const _pctBook={pages:null, currentPct:35, currentPage:null, progressLog:[]}; updateBookProgress(_pctBook, 12, '2026-08-24');
  assert('F40 : une page saisie efface le % estimé', _pctBook.currentPage===12 && _pctBook.currentPct===null);
  const _nb = normalizeBook({title:'Début', startedAt:'2026-03-03', currentPct:'35', readings:[{date:'2026-03-18', start:'2026-03-03'},{date:'2026-04-01', start:'2026-05-01'}]});
  assert('F40 : normalizeBook garde startedAt, currentPct et readings[].start (jamais après la fin)', _nb.startedAt==='2026-03-03' && _nb.currentPct===35 && _nb.readings[0].start==='2026-03-03' && _nb.readings[1].start===null);
  assert('F40 : du 3 au 18 mars = 15 jours', daysBetween('2026-03-03','2026-03-18')===15 && readingDaysText({start:'2026-03-03', date:'2026-03-18'})==='· '+plur(15,'jour')); // plur pose l’insécable (F29)
  const _mr = {id:'mr', title:'Fin', status:'reading', startedAt:'2026-09-01', readings:[], progressLog:[]}; markRead(_mr, {quiet:true});
  assert('F40 : markRead reporte la date de début sur la lecture et la consomme', _mr.status==='read' && _mr.readings[0].start==='2026-09-01' && _mr.startedAt===null);
  const _sess = sessionEntries([{id:'x', pages:300, readings:[{date:'2026-02-10'}], progressLog:[{date:'2026-02-01',page:20},{date:'2026-02-01',page:60},{date:'2026-02-05',page:0},{date:'2026-02-10',page:300}]}]);
  assert('F40 : une session par jour (dernière page), sans remise à zéro ni jour de fin', _sess.length===1 && _sess[0].page===60 && _sess[0].date==='2026-02-01');
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
  // v13 : idées du jour — graines dérivées de la bibliothèque, écartés mémorisés
  const _sav2 = state.books;
  state.books = [
    {id:'s1', title:'Saga T1', series:'Saga', volume:1, status:'read', rating:5, authors:['B. K. Vaughan'], tags:['sf','space-opera']},
    {id:'s2', title:'Saga T2', series:'Saga', volume:2, status:'read', rating:4.5, authors:['B. K. Vaughan'], tags:['sf']},
    {id:'s3', title:'Autre chose', status:'read', rating:4, authors:['Ursula K. Le Guin'], tags:['sf']},
    {id:'s4', title:'Pas fini', series:'Berserk', volume:1, status:'reading', rating:null, authors:['Kentaro Miura'], tags:[]},
  ];
  const _seeds = ideaSeeds('2026-08-25');
  assert('idées : propose la suite de la série à jour (T3, pas Berserk en cours)',
         _seeds.some(x=>x.nextVol===3 && x.label.includes('Saga')) && !_seeds.some(x=>x.label.includes('Berserk')));
  assert('idées : au moins un auteur aimé et le genre partagé sf',
         _seeds.some(x=>x.q.startsWith('inauthor:')) && _seeds.some(x=>x.q==='subject:"sf"'));
  assert('idées : un autre tirage change au moins une graine',
         JSON.stringify(ideaSeeds('2026-08-25',1))!==JSON.stringify(_seeds) || _seeds.length<=1);
  const _hidSav = localStorage.getItem(IDEAS_HIDDEN_KEY);
  hideIdeaKey('titre-test|auteur'); hideIdeaKey('titre-test|auteur');
  assert('idées : un écarté est mémorisé sans doublon',
         hiddenIdeas().has('titre-test|auteur') && [...hiddenIdeas()].filter(k=>k==='titre-test|auteur').length===1);
  if(_hidSav===null) localStorage.removeItem(IDEAS_HIDDEN_KEY); else localStorage.setItem(IDEAS_HIDDEN_KEY,_hidSav);
  state.books = _sav2;

  console.log(`Tome selftest — ${pass} ✓ / ${fail} ✗`);
  toast(`Selftest : ${pass} ✓ / ${fail} ✗`);
}
