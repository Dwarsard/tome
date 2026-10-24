// www/ de l'app iPhone : fichiers embarqués, copie transformée d'index.html, garde de la sortie,
// et contrat entre app.js (capPlugin) et les plugins déclarés dans package.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import {
  preparer, transformerIndex, listeSw, referencesLocales, fichiersAEmbarquer, csp,
  ORIGINE_DEV, PIED_SITE, PIED_APP,
} from '../scripts/preparer-web.mjs';

const APPLI = join(import.meta.dirname, '..');
const TOME = process.env.TOME_SRC || join(APPLI, '..');   // Tome/appli/test → Tome/
const INDEX = readFileSync(join(TOME, 'index.html'), 'utf8');
const SW = readFileSync(join(TOME, 'sw.js'), 'utf8');
const CONNECT_APP = "connect-src 'self' capacitor://localhost https://openlibrary.org https://montome.fr";

const dossierTemp = t => {
  const d = mkdtempSync(join(tmpdir(), 'tome-www-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const directives = c => c.split(';').map(s => s.trim()).filter(Boolean);
const neutre = h => h
  .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, '<CSP>')
  .replace(/<footer class="lp-foot">[\s\S]*?<\/footer>/, '<PIED>');
const fichiersDe = dir => {
  const out = [];
  const marche = d => { for(const n of readdirSync(d)){ const p = join(d, n); statSync(p).isDirectory() ? marche(p) : out.push(relative(dir, p).split(sep).join('/')); } };
  marche(dir);
  return out.sort();
};

test('CSP de la copie : production au lieu de dev, capacitor://localhost après chaque \'self\', rien d’autre', () => {
  const avant = csp(INDEX), apres = csp(transformerIndex(INDEX));
  assert.ok(avant.includes(ORIGINE_DEV), 'la source garde son origine de dev');
  const connect = directives(apres).find(d => d.startsWith('connect-src '));
  assert.equal(connect, CONNECT_APP);
  assert.doesNotMatch(transformerIndex(INDEX), /localhost:8787/);
  const selfs = [...apres.matchAll(/'self'/g)].length;
  assert.ok(selfs >= 5, 'plusieurs directives en \'self\'');
  assert.equal([...apres.matchAll(/'self' capacitor:\/\/localhost/g)].length, selfs, 'chaque \'self\' est suivi de capacitor://localhost');
  // Les autres directives : identiques une fois l'ajout retiré.
  assert.deepEqual(directives(apres.replaceAll(' capacitor://localhost', '')),
    directives(avant.replace(ORIGINE_DEV, ' https://montome.fr')));
  const script = directives(apres).find(d => d.startsWith('script-src '));
  assert.equal(script, "script-src 'self' capacitor://localhost");
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval|https:/);
  assert.ok(directives(apres).includes("object-src 'none'"));
  assert.ok(directives(apres).includes("base-uri 'none'"));
});

test('pied de page : « par Lucas Marroig », plus de « un site de » ; le reste du HTML est identique', () => {
  const out = transformerIndex(INDEX);
  assert.ok(INDEX.includes(PIED_SITE));
  assert.ok(out.includes(' · par Lucas Marroig'));
  assert.doesNotMatch(out, /un site de/);
  const pied = h => h.match(/<footer class="lp-foot">[\s\S]*?<\/footer>/)[0];
  assert.equal(pied(out), pied(INDEX).replace(PIED_SITE, PIED_APP), 'seul le « un site de » change dans le pied de page');
  // Couvre aussi le commentaire d'index.html qui cite 'self' hors de la CSP : il n'est pas touché.
  assert.equal(neutre(out), neutre(INDEX), 'hors CSP et pied de page, la copie est identique à la source');
});

test('motifs absents : échecs bruyants, jamais silencieux', () => {
  const meta = c => `<meta http-equiv="Content-Security-Policy" content="${c}">`;
  assert.throws(() => transformerIndex('<html><body>rien</body></html>'), /CSP introuvable/);
  assert.throws(() => transformerIndex(meta("default-src 'self'; connect-src 'self'") + PIED_SITE), /origine de dev introuvable/);
  assert.throws(() => transformerIndex(meta("connect-src 'self' http://localhost:8787") + ' · un site de quelqu’un'), /pied de page/);
  // L'origine de dev hors de la CSP ne compte pas.
  assert.throws(() => transformerIndex(meta("connect-src 'self'") + '<a href="http://localhost:8787">x</a>' + PIED_SITE), /origine de dev introuvable/);
  assert.throws(() => listeSw("const ASSETS = ['./a.js'];"), /FONTS introuvable/);
  assert.throws(() => listeSw("const ASSETS = []; const FONTS = ['./f.woff2'];"), /ASSETS vide/);
});

test('liste des fichiers : ASSETS et FONTS de sw.js, plus les références locales d’index.html', () => {
  const sw = listeSw(SW);
  assert.ok(!sw.includes('') && !sw.includes('./') && !sw.includes('sw.js'));
  assert.ok(sw.every(p => !p.startsWith('./') && !p.startsWith('/')));
  assert.equal(sw.filter(p => p.startsWith('fonts/')).length, 11);
  const refs = referencesLocales(INDEX);
  for(const n of [1, 2, 3, 4]) assert.ok(refs.includes(`lp-${n}.jpg`), `lp-${n}.jpg référencé`);
  assert.ok(!refs.some(r => !/\.[a-z0-9]+$/i.test(r)), 'que des fichiers avec extension');
  assert.deepEqual(referencesLocales('<a href="//cdn.example/x.js"></a><img src="./a/b.png?v=2"><a href="/x#y.z"></a><a href="/page">'), ['a/b.png']);
  const tout = fichiersAEmbarquer(TOME);
  assert.equal(tout.length, 25);
  assert.ok(tout.includes('index.html'));
});

test('préparation dans un dossier temporaire : 25 fichiers, 11 polices, lp-1..4, pas de sw.js', t => {
  const out = dossierTemp(t);
  const r = preparer({ source: TOME, sortie: out });
  const fichiers = fichiersDe(out);
  assert.deepEqual(fichiers, r.fichiers);
  assert.equal(fichiers.length, 25);
  assert.ok(!existsSync(join(out, 'sw.js')), 'pas de service worker dans l’app');
  assert.equal(readdirSync(join(out, 'fonts')).filter(f => f.endsWith('.woff2')).length, 11);
  for(const n of [1, 2, 3, 4]) assert.ok(existsSync(join(out, `lp-${n}.jpg`)));
  for(const f of ['app.js', 'app.css', 'qr.js', 'icon.svg', 'manifest.webmanifest']) {
    assert.ok(readFileSync(join(out, f)).equals(readFileSync(join(TOME, f))), `${f} copié tel quel`);
  }
  assert.equal(readFileSync(join(out, 'index.html'), 'utf8'), transformerIndex(INDEX));
  // Une seconde préparation repart de zéro (pas de résidu).
  writeFileSync(join(out, 'residu.txt'), 'x');
  preparer({ source: TOME, sortie: out });
  assert.ok(!existsSync(join(out, 'residu.txt')));
});

test('www/ : tout ce que référencent index.html et les url() d’app.css existe', t => {
  const out = dossierTemp(t);
  preparer({ source: TOME, sortie: out });
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const css = readFileSync(join(out, 'app.css'), 'utf8');
  const urlsCss = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map(m => m[2])
    .filter(u => !/^(?:data:|https?:|#|%23)/.test(u))   // %23 : url(#id) à l'intérieur d'un SVG en data:
    .map(u => u.split(/[?#]/)[0].replace(/^\.\//, '').replace(/^\//, ''));
  assert.ok(urlsCss.length >= 11, 'les polices passent par url()');
  const manquants = [...new Set([...referencesLocales(html), ...urlsCss])].filter(p => !existsSync(join(out, p)));
  assert.deepEqual(manquants, [], 'références sans fichier dans www/');
});

test('href locaux sans extension d’index.html : seulement /, /confidentialite et /cgu', () => {
  const sansExt = [...INDEX.matchAll(/\bhref\s*=\s*"(\/[^"]*)"/g)].map(m => m[1].split(/[?#]/)[0])
    .filter(h => !h.startsWith('//') && !/\.[a-z0-9]+$/i.test(h.split('/').pop()));
  assert.ok(sansExt.length > 0);
  for(const h of sansExt) assert.ok(['/', '/confidentialite', '/cgu'].includes(h), `${h} : page absente de l’app`);
});

test('garde de preparer : rien n’est effacé hors d’un dossier www ou d’un dossier temporaire', t => {
  const temoin = join(TOME, 'index.html');
  assert.throws(() => preparer({ source: TOME, sortie: join(APPLI, '..') }), /sortie refusée/);
  assert.throws(() => preparer({ source: TOME, sortie: join(APPLI, 'test', '..', '..') + sep }), /sortie refusée/);
  assert.ok(existsSync(temoin), 'la racine de Tome est intacte');
  const autre = join(APPLI, 'sortie-refusee-test');
  assert.throws(() => preparer({ source: TOME, sortie: autre }), /sortie refusée/);
  assert.ok(!existsSync(autre), 'aucun dossier créé');
  // Dans le dossier temporaire : ni la source elle-même, ni un dossier qui la contient.
  const base = dossierTemp(t);
  const src = join(base, 'www', 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'garde.txt'), 'x');
  assert.throws(() => preparer({ source: src, sortie: src }), /sortie refusée/);
  assert.throws(() => preparer({ source: src, sortie: join(base, 'www') }), /sortie refusée/);
  assert.throws(() => preparer({ source: src, sortie: base }), /sortie refusée/);
  assert.ok(existsSync(join(src, 'garde.txt')), 'la source est intacte');
  // Un fichier manquant dans la source : erreur AVANT d'effacer la sortie.
  const sortie = join(base, 'sortie');
  mkdirSync(sortie);
  writeFileSync(join(sortie, 'avant.txt'), 'x');
  writeFileSync(join(src, 'sw.js'), "const ASSETS = ['./', './index.html', './absent.js']; const FONTS = ['./fonts/f.woff2'];");
  writeFileSync(join(src, 'index.html'), INDEX);
  assert.throws(() => preparer({ source: src, sortie }), /fichiers absents/);
  assert.ok(existsSync(join(sortie, 'avant.txt')), 'sortie intacte après un échec');
});

// Contrat avec le front : noms JS des plugins natifs (B3).
const PLUGINS = { CapacitorBarcodeScanner: '@capacitor/barcode-scanner', Share: '@capacitor/share', Filesystem: '@capacitor/filesystem', SystemBars: null };
const PKG = JSON.parse(readFileSync(join(APPLI, 'package.json'), 'utf8'));

test('contrat : app.js n’appelle capPlugin() qu’avec des plugins connus, chacun présent dans package.json', () => {
  const app = readFileSync(join(TOME, 'app.js'), 'utf8');
  const noms = [...new Set([...app.matchAll(/\bcapPlugin\(\s*(['"`])([^'"`]+)\1\s*\)/g)].map(m => m[2]))];
  for(const n of noms) assert.ok(Object.hasOwn(PLUGINS, n), `capPlugin('${n}') : plugin inconnu de la coque`);
  // Inclusion vraie même si app.js n'appelle pas (encore) un plugin.
  for(const [nom, paquet] of Object.entries(PLUGINS)) {
    if(paquet) assert.ok(PKG.dependencies[paquet], `${nom} : ${paquet} manque dans dependencies`);
  }
  assert.ok(PKG.dependencies['@capacitor/ios'], 'SystemBars vient du cœur @capacitor/ios');
});

test('contrat : chaque nom JS est celui que déclare le code natif du paquet installé', t => {
  const nm = join(APPLI, 'node_modules', '@capacitor');
  if(!existsSync(nm)) return t.skip('node_modules absent : lancer npm ci');
  const swift = dir => {
    const out = [];
    const marche = d => { for(const n of readdirSync(d)){ const p = join(d, n); if(statSync(p).isDirectory()) marche(p); else if(n.endsWith('.swift')) out.push(readFileSync(p, 'utf8')); } };
    if(existsSync(dir)) marche(dir);
    return out.join('\n');
  };
  for(const [nom, paquet] of Object.entries(PLUGINS)) {
    const source = paquet ? swift(join(nm, paquet.split('/')[1], 'ios')) : readFileSync(join(nm, 'ios', 'Capacitor', 'Capacitor', 'Plugins', 'SystemBars.swift'), 'utf8');
    assert.match(source, new RegExp(`jsName\\s*=\\s*"${nom}"`), `${nom} déclaré par ${paquet || '@capacitor/ios'}`);
  }
});
