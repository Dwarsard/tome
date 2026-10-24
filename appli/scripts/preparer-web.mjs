// Prépare www/ pour Capacitor : copie des fichiers du site (racine de Tome) que l'app embarque,
// sans rien changer à la source. Seule la COPIE d'index.html est transformée (CSP, pied de page).
// Fonctions pures exportées (testées) et main gardé : importer ce module n'écrit rien.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ORIGINE_DEV = ' http://localhost:8787';   // API locale du site en dev (CSP de Tome/index.html)
export const ORIGINE_API = ' https://montome.fr';      // l'app parle toujours à la production
export const ORIGINE_APP = 'capacitor://localhost';    // origine de la page dans WKWebView
export const PIED_SITE = ' · un site de Lucas Marroig';
export const PIED_APP = ' · par Lucas Marroig';         // un « site » dans une app est un signe de 4.2

// Une liste `const NOM = [ '...', ... ];` de sw.js, chaînes seulement.
function tableauSw(swSource, nom){
  const m = swSource.match(new RegExp(`const ${nom}\\s*=\\s*\\[([^\\]]*)\\]`));
  if(!m) throw new Error(`preparer-web : const ${nom} introuvable dans sw.js`);
  const items = [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]);
  if(!items.length) throw new Error(`preparer-web : const ${nom} vide dans sw.js`);
  return items;
}

// Source de vérité des fichiers hors ligne du site : ASSETS et FONTS de sw.js, './' retiré.
// La racine './' (la page elle-même) et sw.js ne sont jamais des fichiers à copier.
export function listeSw(swSource){
  const tout = [...tableauSw(swSource, 'ASSETS'), ...tableauSw(swSource, 'FONTS')];
  return [...new Set(tout.map(p => p.replace(/^\.\//, '').replace(/^\//, ''))
    .filter(p => p && p !== 'sw.js'))];
}

// Références locales d'index.html (src et href qui commencent par / ou ./) avec extension :
// on y trouve lp-1..4.jpg, absents d'ASSETS. Sans extension (/, /confidentialite, /cgu) : pages, pas fichiers.
export function referencesLocales(html){
  const out = new Set();
  for(const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)){
    const v = m[1];
    if(!(v.startsWith('./') || (v.startsWith('/') && !v.startsWith('//')))) continue;
    const chemin = v.split(/[?#]/)[0].replace(/^\.\//, '').replace(/^\//, '');
    const dernier = chemin.split('/').pop();
    if(dernier && /\.[A-Za-z0-9]+$/.test(dernier)) out.add(chemin);
  }
  return [...out];
}

const RE_CSP = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;

export function csp(html){ return (html.match(RE_CSP) || [])[2] || ''; }

// Copie d'index.html pour l'app : (1) l'API de dev de la CSP devient la production ;
// (2) chaque 'self' de la CSP est suivi de capacitor://localhost (la correspondance de 'self'
// avec un schéma personnalisé n'est pas documentée : l'ajout est sans risque) ;
// (3) « un site de » du pied de page de l'accueil devient « par ». Échec bruyant si un motif manque.
export function transformerIndex(html){
  const m = html.match(RE_CSP);
  if(!m) throw new Error('preparer-web : CSP introuvable dans index.html');
  let contenu = m[2];
  if(!contenu.includes(ORIGINE_DEV)) throw new Error('preparer-web : origine de dev introuvable dans la CSP d’index.html');
  contenu = contenu.replaceAll(ORIGINE_DEV, ORIGINE_API);
  if(!contenu.includes("'self'")) throw new Error('preparer-web : aucun \'self\' dans la CSP d’index.html');
  contenu = contenu.replaceAll("'self'", `'self' ${ORIGINE_APP}`);
  let sortie = html.replace(RE_CSP, (_, a, _c, z) => a + contenu + z);
  if(!sortie.includes(PIED_SITE)) throw new Error('preparer-web : pied de page « un site de » introuvable dans index.html');
  sortie = sortie.replace(PIED_SITE, PIED_APP);
  return sortie;
}

// Liste complète, triée : union des fichiers de sw.js et des références locales d'index.html.
export function fichiersAEmbarquer(source){
  const sw = readFileSync(join(source, 'sw.js'), 'utf8');
  const html = readFileSync(join(source, 'index.html'), 'utf8');
  return [...new Set([...listeSw(sw), ...referencesLocales(html)])].filter(p => p !== 'sw.js').sort();
}

// Garde : rmSync ne s'applique qu'à un dossier nommé www, ou à un dossier temporaire (tests),
// jamais à la source ni à un dossier qui la contient.
export function verifierSortie({ source, sortie }){
  const s = resolve(sortie), src = resolve(source);
  if(basename(s) !== 'www' && !s.startsWith(resolve(tmpdir()) + sep)) throw new Error('preparer-web : sortie refusée');
  if(s === src || (src + sep).startsWith(s + sep)) throw new Error('preparer-web : sortie refusée');
  return s;
}

export function preparer({ source, sortie }){
  const s = verifierSortie({ source, sortie });
  const liste = fichiersAEmbarquer(source);
  const manquants = liste.filter(p => !existsSync(join(source, p)));
  if(manquants.length) throw new Error('preparer-web : fichiers absents de la source : ' + manquants.join(', '));
  const index = transformerIndex(readFileSync(join(source, 'index.html'), 'utf8'));
  rmSync(s, { recursive: true, force: true });
  for(const p of liste){
    mkdirSync(dirname(join(s, p)), { recursive: true });
    if(p === 'index.html') writeFileSync(join(s, p), index);
    else copyFileSync(join(source, p), join(s, p));
  }
  if(!liste.includes('index.html')) writeFileSync(join(s, 'index.html'), index);
  return { fichiers: [...new Set([...liste, 'index.html'])].sort() };
}

const ICI = dirname(fileURLToPath(import.meta.url));
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const r = preparer({ source: process.env.TOME_SRC || join(ICI, '..', '..'), sortie: join(ICI, '..', 'www') });
  console.log(`preparer-web : www/ prêt (${r.fichiers.length} fichiers, dont ${r.fichiers.filter(f => f.startsWith('fonts/')).length} polices).`);
}
