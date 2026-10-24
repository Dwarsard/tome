// Garde-fous de la compilation dans le cloud (workflows GitHub de l'app iPhone) et des deux guides.
// Le dépôt Tome est PUBLIC : aucun secret ne doit y entrer, et les secrets d'Apple ne doivent
// atteindre que les étapes qui appellent app-store-connect, après tout le code npm. Ce n'est pas
// un isolement : dans un même job, une étape npm compromise pourrait agir sur les suivantes
// ($GITHUB_PATH, $GITHUB_ENV, fichiers du disque, processus resté en arrière-plan). Ces règles
// réduisent l'exposition ; le verrou npm, ignore-scripts et les hachages de ci/codemagic.txt font
// le reste.
// Aucun paquet requis : les YAML sont lus par un petit analyseur limité au sous-ensemble employé
// ici (style en bloc seulement), qui échoue bruyamment sur tout le reste. Lancer depuis appli/ :
// node --test test/guide-ci.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const APPLI = join(ICI, '..');
const RACINE = join(APPLI, '..');
const WF = join(RACINE, '.github', 'workflows');
const GUIDE = join(APPLI, 'APPLI-IOS.md');
const FICHE = join(APPLI, 'FICHE-APP-STORE.md');
const CODEMAGIC = join(APPLI, 'ci', 'codemagic.txt');
const RESOLU = 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';
const lire = p => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Actions épinglées (SHA relevés par git ls-remote le 24/10/2026, étiquettes légères).
const ACTIONS = {
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  'actions/setup-node': ['949feb2413d6458794dcd2491c4babbbce0c15c1', 'v7.1.0'],
  'actions/setup-python': ['6d4fd22b20465ccc0f7354476588e8df7c9ca0e0', 'v7.1.0'],
  'actions/upload-artifact': ['cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'v7.0.2'],
};
const SECRETS_ATTENDUS = ['APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_IDENTIFIER',
  'APP_STORE_CONNECT_PRIVATE_KEY', 'CERTIFICATE_PRIVATE_KEY'];
// Marqueurs construits par morceaux : ce fichier ne doit pas se détecter lui-même.
const MARQUEUR_CLE = new RegExp('-----' + 'BEGIN [A-Z ]*' + 'PRIVATE' + ' KEY');
const MARQUEURS = [MARQUEUR_CLE, new RegExp('PRIVATE' + ' KEY' + '-----')];
// Tiret cadratin (U+2014) par son code : le caractère lui-même n'a rien à faire dans ce dépôt.
const CADRATIN = String.fromCharCode(0x2014);

/* ---------- analyseur YAML minimal (style en bloc) ---------- */
function analyserYaml(texte, nom){
  if(/\t/.test(texte)) throw new Error(`${nom} : tabulation interdite dans un YAML`);
  const lignes = texte.replace(/\r\n/g, '\n').split('\n').map((brut, k) => ({ brut, n: k + 1 }));
  let i = 0;
  const echec = (msg, n) => { throw new Error(`${nom}:${n ?? (lignes[i] ? lignes[i].n : lignes.length)} : ${msg}`); };
  const retrait = s => /^ */.exec(s)[0].length;
  const vide = s => /^ *(#.*)?$/.test(s);
  const sauterVides = () => { while(i < lignes.length && vide(lignes[i].brut)) i++; };
  const CLE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*) *:(?: +(.*))?$/;
  const PUCE = /^-( |$)/;

  function scalaire(v, n){
    if(v.startsWith("'")){
      const m = /^'((?:[^']|'')*)'(?: +#.*)?$/.exec(v);
      if(!m) echec('chaîne entre apostrophes mal fermée', n);
      return m[1].replace(/''/g, "'");
    }
    if(v.startsWith('"')){
      const m = /^("(?:[^"\\]|\\.)*")(?: +#.*)?$/.exec(v);
      if(!m) echec('chaîne entre guillemets mal fermée', n);
      return JSON.parse(m[1]);
    }
    const k = v.search(/ #/);
    const s = (k >= 0 ? v.slice(0, k) : v).trimEnd();
    if(/^[[\]{}&*!|>%@`,#]/.test(s) || /^[-?:]( |$)/.test(s)) echec('scalaire hors du sous-ensemble pris en charge : ' + s, n);
    if(/: |:$/.test(s)) echec('« : » dans un scalaire sans guillemets : ' + s, n);
    if(s === 'true') return true;
    if(s === 'false') return false;
    if(s === 'null' || s === '~') return null;
    if(/^-?\d+$/.test(s)) return Number(s);
    return s;
  }
  function blocLitteral(retraitParent, indicateur){
    if(!/^\|-?$/.test(indicateur)) echec('seuls les blocs « | » et « |- » sont pris en charge');
    const sortie = []; let col = null;
    while(i < lignes.length){
      const l = lignes[i].brut;
      if(/^ *$/.test(l)){ sortie.push(''); i++; continue; }
      const r = retrait(l);
      if(col === null){ if(r <= retraitParent) break; col = r; }
      if(r < col) break;
      sortie.push(l.slice(col)); i++;
    }
    if(col === null) echec('bloc littéral vide');
    while(sortie.length && sortie[sortie.length - 1] === '') sortie.pop();
    return sortie.join('\n') + (indicateur === '|-' ? '' : '\n');
  }
  function valeur(v, r, n){
    if(v === undefined || v === ''){
      sauterVides();
      if(i >= lignes.length) return null;
      const l = lignes[i].brut, ri = retrait(l), reste = l.slice(ri);
      if(ri > r) return PUCE.test(reste) ? sequence(ri) : table(ri);
      if(ri === r && PUCE.test(reste)) return sequence(ri);
      return null;
    }
    if(/^[|>]/.test(v)) return blocLitteral(r, v.replace(/ +#.*$/, ''));
    return scalaire(v, n);
  }
  function table(ind){
    const obj = {};
    for(;;){
      sauterVides(); if(i >= lignes.length) break;
      const { brut, n } = lignes[i]; const r = retrait(brut);
      if(r < ind) break;
      if(r > ind) echec('retrait inattendu', n);
      const reste = brut.slice(r);
      if(PUCE.test(reste)) echec('élément de liste à la place d’une clé', n);
      const m = CLE.exec(reste);
      if(!m) echec('clé attendue : ' + reste, n);
      if(Object.prototype.hasOwnProperty.call(obj, m[1])) echec('clé en double : ' + m[1], n);
      i++;
      obj[m[1]] = valeur(m[2], r, n);
    }
    return obj;
  }
  function sequence(ind){
    const liste = [];
    for(;;){
      sauterVides(); if(i >= lignes.length) break;
      const { brut, n } = lignes[i]; const r = retrait(brut);
      if(r < ind) break;
      if(r > ind) echec('retrait inattendu', n);
      const reste = brut.slice(r);
      if(!PUCE.test(reste)) break;
      const contenu = reste.slice(1).replace(/^ +/, '');
      const col = r + reste.length - contenu.length;
      if(contenu === '' || contenu.startsWith('#')){ i++; liste.push(valeur('', r, n)); continue; }
      if(CLE.test(contenu)){ lignes[i] = { brut: ' '.repeat(col) + contenu, n }; liste.push(table(col)); }
      else { i++; liste.push(scalaire(contenu, n)); }
    }
    return liste;
  }
  sauterVides();
  const doc = table(0);
  sauterVides();
  if(i < lignes.length) echec('contenu inattendu après le document');
  return doc;
}

const _wf = {};
function workflow(nom){
  if(!_wf[nom]){
    const chemin = join(WF, nom);
    const brut = lire(chemin);
    _wf[nom] = { brut, doc: analyserYaml(brut, nom) };
  }
  return _wf[nom];
}
const VERIF = 'ios-verifier.yml', TF = 'ios-testflight.yml';
const etapes = doc => Object.entries(doc.jobs).flatMap(([job, j]) => (j.steps || []).map((s, k) => ({ job, k, s })));
const script = s => (typeof s.run === 'string' ? s.run : '');
// Lignes de commande d'un script (commentaires shell exclus), continuations « \ » recollées.
const commandes = s => script(s).replace(/\\\n\s*/g, ' ').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const appelleNpm = s => commandes(s).some(l => /(^|[\s;&|(])(npm|npx)\s/.test(l));
const texteDe = v => JSON.stringify(v ?? null);

/* ---------- les workflows ---------- */

test('les deux workflows se lisent (YAML en bloc, retraits cohérents) et ont la forme attendue', () => {
  for(const nom of [VERIF, TF]){
    const { doc } = workflow(nom);
    assert.equal(doc.name, basename(nom, '.yml'));
    assert.deepEqual(doc.permissions, { contents: 'read' }, nom + ' : permissions minimales');
    assert.deepEqual(doc.defaults, { run: { 'working-directory': 'appli' } });
    assert.ok(doc.jobs && Object.keys(doc.jobs).length, nom + ' : au moins un job');
    for(const [nomJob, j] of Object.entries(doc.jobs)){
      assert.equal(j['runs-on'], 'macos-26', `${nom} › ${nomJob} : macos-26`);
      assert.ok(Number.isInteger(j['timeout-minutes']) && j['timeout-minutes'] <= 60, `${nom} › ${nomJob} : délai borné`);
      assert.ok(j.permissions === undefined || texteDe(j.permissions) === texteDe({ contents: 'read' }), `${nom} › ${nomJob} : aucune permission en écriture`);
      assert.ok(Array.isArray(j.steps) && j.steps.length, `${nom} › ${nomJob} : des étapes`);
      for(const s of j.steps) assert.ok((typeof s.run === 'string') !== (typeof s.uses === 'string'), `${nom} › ${nomJob} : chaque étape a run OU uses (${s.name})`);
      const xcode = j.steps.find(s => /xcode-select -s /.test(script(s)));
      assert.ok(xcode && script(xcode).includes('/Applications/Xcode_26.6.app'), `${nom} › ${nomJob} : Xcode 26.6 choisi`);
    }
    assert.match(workflow(nom).brut, /Xcode_26/);
  }
});

test('déclencheurs : TestFlight à la main seulement, vérification sur appli-ios et main, jamais pull_request_target', () => {
  const tf = workflow(TF).doc, ve = workflow(VERIF).doc;
  assert.deepEqual(Object.keys(tf.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(ve.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(ve.on.push.branches, ['appli-ios', 'main']);
  assert.deepEqual(ve.on.push.paths, ['appli/**', 'app.js', 'app.css', 'index.html', 'qr.js', 'sw.js', 'fonts/**',
    '*.png', '*.jpg', 'icon.svg', 'manifest.webmanifest', '.github/workflows/ios-*.yml']);
  for(const nom of [VERIF, TF]) assert.doesNotMatch(workflow(nom).brut, /pull_request_target/, nom);
  assert.doesNotMatch(workflow(TF).brut, /pull_request/, 'TestFlight ne part jamais d’une contribution extérieure');
  assert.deepEqual(ve.concurrency, { group: 'ios-verifier-${{ github.ref }}', 'cancel-in-progress': true });
  assert.deepEqual(tf.concurrency, { group: 'ios-testflight', 'cancel-in-progress': false });
});

test('chaque action est épinglée sur le SHA convenu, suivi de son étiquette en commentaire', () => {
  for(const nom of [VERIF, TF]){
    const lignesUses = workflow(nom).brut.split('\n').filter(l => /^\s*(- )?uses:/.test(l));
    assert.ok(lignesUses.length >= 2, nom);
    for(const l of lignesUses){
      const m = /^\s*(?:- )?uses: ([\w.-]+\/[\w.-]+)@([0-9a-f]{40}) # (v\d+\.\d+\.\d+)$/.exec(l);
      assert.ok(m, `${nom} : action non épinglée ou sans commentaire de version : ${l.trim()}`);
      assert.ok(ACTIONS[m[1]], `${nom} : action inattendue ${m[1]}`);
      assert.deepEqual([m[2], m[3]], ACTIONS[m[1]], `${nom} : SHA ou étiquette de ${m[1]}`);
    }
    for(const { s } of etapes(workflow(nom).doc)){
      if(s.uses) assert.match(s.uses, /^actions\/[\w-]+@[0-9a-f]{40}$/, nom + ' : ' + s.uses);
      if(String(s.uses || '').startsWith('actions/checkout@'))
        assert.equal(s.with && s.with['persist-credentials'], false, nom + ' : persist-credentials: false après chaque checkout');
    }
  }
});

test('xcodebuild et xcode-project visent toujours ios/App/App.xcodeproj ; vérificateur sans signature', () => {
  let builds = 0, xp = 0;
  for(const nom of [VERIF, TF]) for(const { s } of etapes(workflow(nom).doc)) for(const l of commandes(s)){
    if(/\bxcode-project /.test(l)){ xp++; assert.match(l, /--project ios\/App\/App\.xcodeproj(\s|$)/, nom + ' : ' + l); }
    if(/\bxcodebuild /.test(l) && !/\bxcodebuild -version\b/.test(l)){
      builds++;
      assert.match(l, /xcodebuild -project ios\/App\/App\.xcodeproj -scheme App /, nom + ' : ' + l);
    }
  }
  assert.ok(builds >= 2 && xp >= 2, 'des compilations à contrôler');
  const verif = workflow(VERIF).doc.jobs.verifier.steps.flatMap(commandes).filter(l => /xcodebuild -project/.test(l));
  assert.equal(verif.length, 1);
  assert.match(verif[0], /-configuration Release /);
  assert.match(verif[0], /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow(VERIF).brut, /CODE_SIGNING_ALLOWED=NO/);
  const fumee = workflow(VERIF).doc.jobs.fumee.steps.flatMap(commandes);
  assert.ok(fumee.some(l => /xcodebuild -project .* -configuration Debug .*-sdk iphonesimulator/.test(l)));
  assert.ok(fumee.some(l => /xcrun simctl launch .*"\$UDID" fr\.montome\.app$/.test(l)), 'lancement de fr.montome.app');
  // Vers un fichier, la sortie de l'app est mise en tampon par blocs : sortie.txt resterait vide.
  const lancement = fumee.filter(l => /xcrun simctl launch /.test(l));
  assert.equal(lancement.length, 1);
  assert.match(lancement[0], /^SIMCTL_CHILD_STDBUF1=L (\w+=\w+ )*xcrun simctl launch --stdout="\$PWD\/fumee\/sortie\.txt" /, 'sortie de l’app en tampon par ligne');
  assert.ok(fumee.some(l => /xcrun simctl io "\$UDID" screenshot fumee\/accueil\.png/.test(l)), 'capture de l’accueil');
});

// Exigences d'un fichier pip : continuations « \ » recollées, commentaires et lignes vides exclus.
const exigences = texte => texte.replace(/ *\\\n\s*/g, ' ').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const aSecret = s => /secrets\./.test(texteDe(s.env));

test('outillage figé : codemagic-cli-tools 0.70.0 et ses dépendances par hachage, dans un venv neuf sur Python 3.13 ; aucune trace de commandes', () => {
  const { brut, doc } = workflow(TF);
  const steps = doc.jobs.testflight.steps;
  assert.match(brut, /python-version: '3\.13'/);
  const iPy = steps.findIndex(s => String(s.uses || '').startsWith('actions/setup-python@'));
  const py = steps[iPy];
  assert.ok(py && py.id === 'py' && py.with['python-version'] === '3.13');
  assert.doesNotMatch(brut, /\bpipx\b/, 'plus de pipx : il ne figeait que le paquet de tête');
  // Le fichier d'exigences : chaque paquet à version exacte avec ses hachages, rien d'autre
  // (ni index, ni lien, ni option qui changerait la source des paquets).
  assert.ok(existsSync(CODEMAGIC), 'appli/ci/codemagic.txt absent');
  const req = lire(CODEMAGIC);
  assert.equal(req.split('\n')[0], '# -*- coding: utf-8 -*-', 'déclaration d’encodage : pip lit l’en-tête accentué quelle que soit la locale');
  const noms = new Set();
  for(const l of exigences(req)){
    const m = /^([a-z0-9][a-z0-9._-]*)==([0-9][0-9A-Za-z.+!-]*)((?: --hash=sha256:[0-9a-f]{64})+)$/.exec(l);
    assert.ok(m, 'exigence hors du format « nom==version --hash=sha256:… » : ' + l.slice(0, 120));
    assert.ok(!noms.has(m[1]), 'paquet en double : ' + m[1]);
    noms.add(m[1]);
  }
  assert.ok(exigences(req).some(l => l.startsWith('codemagic-cli-tools==0.70.0 --hash=sha256:')), 'codemagic-cli-tools 0.70.0');
  for(const n of ['cryptography', 'cffi', 'requests', 'urllib3', 'certifi', 'pyjwt', 'google-api-python-client', 'psutil'])
    assert.ok(noms.has(n), 'dépendance transitive non figée : ' + n);
  // L'installation : venv neuf, hachages exigés, roues seulement, contrôle, puis bin en dernier
  // dans GITHUB_PATH (il passe devant ce qu'une étape précédente y aurait mis).
  const iInstall = steps.findIndex(s => s.name === 'Installer codemagic-cli-tools');
  const install = steps[iInstall];
  assert.ok(install && !install.env, 'installation sans secret');
  assert.deepEqual(commandes(install), [
    'VENV="$RUNNER_TEMP/codemagic"',
    '"${{ steps.py.outputs.python-path }}" -I -m venv --clear "$VENV"',
    '"$VENV/bin/python" -I -m pip install --isolated --disable-pip-version-check --require-hashes --no-deps --only-binary=:all: -r ci/codemagic.txt',
    '"$VENV/bin/python" -I -m pip check',
    'echo "$VENV/bin" >> "$GITHUB_PATH"',
  ]);
  assert.equal(doc.defaults.run['working-directory'], 'appli', 'ci/codemagic.txt se lit depuis appli/');
  const iDerniereNpm = steps.map(appelleNpm).lastIndexOf(true), iPremierSecret = steps.findIndex(aSecret);
  assert.ok(iDerniereNpm < iPy && iPy < iInstall && iInstall < iPremierSecret, `ordre : npm (${iDerniereNpm}), Python (${iPy}), installation (${iInstall}), secrets (${iPremierSecret})`);
  assert.deepEqual(steps.filter(s => script(s).includes('GITHUB_PATH')).map(s => s.name), ['Installer codemagic-cli-tools'], 'une seule étape touche GITHUB_PATH');
  for(const nom of [VERIF, TF]){
    const b = workflow(nom).brut;
    assert.doesNotMatch(b, /! grep/, nom + ' : une commande niée ne fait pas échouer set -e');
    assert.doesNotMatch(b, /set -[a-z]*x|set -o xtrace|xtrace/, nom + ' : jamais de trace des commandes');
  }
});

test('contrôles du vérificateur : CSP exacte, plus de localhost:8787, trois plugins, plist', () => {
  const lignes = workflow(VERIF).doc.jobs.verifier.steps.flatMap(commandes);
  const tout = lignes.join('\n');
  assert.ok(tout.includes(`grep -qF "connect-src 'self' capacitor://localhost https://openlibrary.org https://montome.fr" "$PAGE"`));
  assert.ok(tout.includes('PAGE=ios/App/App/public/index.html'));
  assert.match(tout, /if grep -q "localhost:8787" "\$PAGE"; then/);
  assert.match(tout, /for CLASSE in CapacitorBarcodeScannerPlugin SharePlugin FilesystemPlugin; do/);
  assert.ok(tout.includes('CONFIG=ios/App/App/capacitor.config.json'));
  assert.ok(lignes.includes('plutil -lint ios/App/App/Info.plist ios/App/App/PrivacyInfo.xcprivacy ios/App/App/fr.lproj/Localizable.strings'));
  // l'ordre : npm ci, npm run web, npx cap sync ios, npm test, puis la compilation
  for(const job of ['verifier', 'fumee']){
    const run = workflow(VERIF).doc.jobs[job].steps.map(script).join('\n');
    const pos = ['npm ci', 'npm run web', 'npx cap sync ios', 'xcodebuild -project'].map(x => run.indexOf(x));
    assert.ok(pos.every((p, k) => p >= 0 && (k === 0 || p > pos[k - 1])), job + ' : ordre des étapes');
  }
});

test('artefacts : Package.resolved, capture et journal, jamais d’IPA', () => {
  const ups = [VERIF, TF].flatMap(nom => etapes(workflow(nom).doc).filter(({ s }) => String(s.uses || '').startsWith('actions/upload-artifact@')).map(e => ({ nom, ...e })));
  assert.deepEqual(ups.map(u => `${u.nom}›${u.job}`), [`${VERIF}›verifier`, `${VERIF}›fumee`]);
  const [resolu, fumee] = ups.map(u => u.s);
  assert.equal(resolu.with.path, 'appli/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');
  assert.equal(resolu.with['retention-days'], 7);
  assert.equal(resolu.with['if-no-files-found'], 'warn');
  assert.equal(fumee.with.path, 'appli/fumee/');
  assert.equal(fumee.with['retention-days'], 3);
  assert.equal(fumee.if, 'always()');
  for(const u of ups) assert.doesNotMatch(texteDe(u.s.with), /ipa|xcarchive/i, 'aucune IPA publiée');
});

test('secrets : seulement dans le env des étapes qui appellent app-store-connect, après tout le code npm', () => {
  const ve = workflow(VERIF), tf = workflow(TF);
  assert.doesNotMatch(ve.brut, /secrets\.|environment:/, 'le vérificateur ne reçoit aucun secret');
  assert.equal(tf.doc.env, undefined, 'aucun env au niveau du workflow');
  const job = tf.doc.jobs.testflight;
  assert.equal(job.if, "github.ref == 'refs/heads/appli-ios' || github.ref == 'refs/heads/main'");
  assert.equal(job.environment, 'testflight');
  assert.deepEqual(job.env, { BUNDLE_ID: 'fr.montome.app', APP_STORE_APP_ID: '${{ vars.APP_STORE_APP_ID }}' }, 'env du job sans secret');
  const total = (tf.brut.match(/secrets\./g) || []).length;
  let vus = 0, premiere = -1, derniereNpm = -1;
  const noms = new Set();
  job.steps.forEach((s, k) => {
    if(appelleNpm(s)) derniereNpm = k;
    const ailleurs = texteDe({ ...s, env: undefined });
    assert.doesNotMatch(ailleurs, /secrets\./, `étape « ${s.name} » : secret hors du bloc env`);
    const env = s.env || {};
    const dansEnv = Object.entries(env).filter(([, v]) => /secrets\./.test(String(v)));
    if(!dansEnv.length) return;
    if(premiere < 0) premiere = k;
    assert.ok(commandes(s).some(l => /(^|[\s$(])app-store-connect /.test(l)), `étape « ${s.name} » : secret sans app-store-connect`);
    assert.ok(!appelleNpm(s), `étape « ${s.name} » : secret et npm dans la même étape`);
    for(const [cle, v] of dansEnv){
      const m = /^\$\{\{ secrets\.([A-Z_]+) \}\}$/.exec(v);
      assert.ok(m && m[1] === cle, `étape « ${s.name} » : ${cle} doit valoir exactement son secret`);
      noms.add(cle); vus++;
    }
  });
  assert.equal(vus, total, 'chaque « secrets. » du fichier est dans le env d’une étape');
  assert.deepEqual([...noms].sort(), [...SECRETS_ATTENDUS].sort());
  assert.ok(derniereNpm >= 0 && premiere > derniereNpm, `ordre : dernière étape npm (${derniereNpm}) avant le premier secret (${premiere})`);
  // la compilation ne voit aucun secret ; jamais d'echo d'une variable secrète
  const build = job.steps.find(s => commandes(s).some(l => l.startsWith('xcode-project build-ipa')));
  assert.ok(build && !build.env, 'compilation sans secret');
  for(const { s } of etapes(tf.doc)) for(const l of commandes(s))
    assert.doesNotMatch(l, /\becho\b.*\$\{?(APP_STORE_CONNECT_|CERTIFICATE_PRIVATE_KEY)/, 'echo d’un secret : ' + l);
});

test('TestFlight : signature, numéro de build, envoi en test interne, trousseau rendu', () => {
  const steps = workflow(TF).doc.jobs.testflight.steps;
  const lignes = steps.flatMap(commandes);
  const ordre = ['npm test', 'keychain initialize', 'app-store-connect fetch-signing-files "$BUNDLE_ID" --platform IOS --type IOS_APP_STORE --create',
    'keychain add-certificates', 'xcode-project use-profiles --project ios/App/App.xcodeproj',
    'app-store-connect get-latest-testflight-build-number', 'xcode-project build-ipa', 'app-store-connect publish', 'keychain use-login'];
  const pos = ordre.map(x => lignes.findIndex(l => l.includes(x)));
  assert.ok(pos.every((p, k) => p >= 0 && (k === 0 || p > pos[k - 1])), 'ordre : ' + JSON.stringify(pos));
  const publish = lignes.find(l => l.startsWith('app-store-connect publish'));
  assert.equal(publish, 'app-store-connect publish --path "$(ls build/ios/ipa/*.ipa | head -1)"');
  assert.doesNotMatch(publish, /--testflight/, 'test interne, sans revue');
  assert.ok(lignes.includes('xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App --archive-xcargs "CURRENT_PROJECT_VERSION=$BUILD_NUMBER"'));
  assert.ok(lignes.some(l => l.includes('>> "$GITHUB_ENV"') && l.includes('BUILD_NUMBER=')));
  // Numéro de build : sous « bash -e » sans pipefail, un échec d'app-store-connect passerait pour
  // un TestFlight vide et le numéro repartirait à 1 ; son journal (stderr) reste visible.
  const numero = steps.find(s => commandes(s).some(l => l.includes('app-store-connect get-latest-testflight-build-number')));
  const ln = commandes(numero);
  const iPipefail = ln.indexOf('set -o pipefail');
  assert.ok(iPipefail >= 0 && iPipefail < ln.findIndex(l => l.includes('get-latest-testflight-build-number')), 'pipefail avant la lecture du dernier numéro');
  assert.doesNotMatch(script(numero), /2>\s*\/dev\/null|\|\|\s*(true\b|:(\s|$))/m, 'une erreur d’app-store-connect n’est ni cachée ni avalée');
  const fin = steps[steps.length - 1];
  assert.equal(fin.if, 'always()');
  assert.equal(script(fin).trim(), 'keychain use-login');
});

test('Package.resolved exigé avant toute étape à secret, versions Swift contrôlées avant l’envoi', () => {
  const steps = workflow(TF).doc.jobs.testflight.steps;
  const indice = f => steps.findIndex(s => commandes(s).some(f));
  const iSync = indice(l => l === 'npx cap sync ios'), iPremierSecret = steps.findIndex(aSecret);
  const iControle = indice(l => l === 'if [ ! -f "$RESOLU" ]; then');
  assert.ok(iControle >= 0, 'contrôle de présence de Package.resolved');
  assert.ok(iSync < iControle && iControle < iPremierSecret, `ordre : synchronisation (${iSync}), contrôle (${iControle}), premier secret (${iPremierSecret})`);
  const controle = steps[iControle], lc = commandes(controle);
  assert.ok(!controle.env, 'contrôle sans secret');
  assert.ok(lc.includes('RESOLU=' + RESOLU));
  assert.ok(lc.some(l => l.includes('git ls-files --error-unmatch "$RESOLU"') && l.includes('git diff --quiet -- "$RESOLU"')), 'Package.resolved versionné et inchangé');
  assert.ok(lc.includes('case "$APP_STORE_APP_ID" in') && lc.includes("''|*[!0-9]*)"), 'APP_STORE_APP_ID vide ou non numérique refusé avant les secrets');
  // Après la compilation : les révisions résolues doivent être celles du fichier versionné.
  const iBuild = indice(l => l.startsWith('xcode-project build-ipa')), iPublish = indice(l => l.startsWith('app-store-connect publish'));
  const iPins = indice(l => l === 'git show "HEAD:./$RESOLU" > "$RUNNER_TEMP/package-resolved-versionne.json"');
  assert.ok(iBuild < iPins && iPins < iPublish, `ordre : compilation (${iBuild}), contrôle des versions (${iPins}), envoi (${iPublish})`);
  assert.ok(!steps[iPins].env && commandes(steps[iPins]).includes('RESOLU=' + RESOLU));
  // Même fichier que l'artefact du vérificateur.
  const artefact = workflow(VERIF).doc.jobs.verifier.steps.find(s => String(s.uses || '').startsWith('actions/upload-artifact@'));
  assert.equal(artefact.with.path, 'appli/' + RESOLU);
});

test('aucune valeur qui ressemble à un secret dans les workflows', () => {
  for(const nom of [VERIF, TF]){
    const sansUses = workflow(nom).brut.split('\n').filter(l => !/^\s*(- )?uses:/.test(l)).join('\n');
    assertSansSecret(sansUses, nom);
  }
});

/* ---------- .gitignore et clés privées ---------- */

const git = (...args) => spawnSync('git', ['-C', RACINE, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ignore = p => {
  const r = git('check-ignore', '--no-index', '-q', p);
  assert.ok(r.status === 0 || r.status === 1, `git check-ignore ${p} : ${r.stderr}`);
  return r.status === 0;
};

test('.gitignore racine : clés et certificats Apple ignorés partout dans le dépôt', () => {
  for(const p of ['AuthKey_TEST.p8', 'ios_distribution_private_key', 'x.p12', 'x.mobileprovision', 'x.cer', 'x.pem'])
    assert.ok(ignore(p), 'devrait être ignoré : ' + p);
  for(const p of ['index.html', 'appli/package-lock.json']) assert.ok(!ignore(p), 'doit rester suivi : ' + p);
});

test('aucun fichier suivi ou à suivre ne contient de clé privée', () => {
  const r = git('ls-files', '-z', '-co', '--exclude-standard');
  assert.equal(r.status, 0, r.stderr);
  const fichiers = r.stdout.split('\0').filter(p => p && !p.includes('node_modules/'));
  assert.ok(fichiers.length > 10, 'liste des fichiers');
  for(const p of fichiers){
    const chemin = join(RACINE, p);
    if(!existsSync(chemin) || !statSync(chemin).isFile()) continue;
    const contenu = readFileSync(chemin, 'latin1');
    for(const m of MARQUEURS) assert.doesNotMatch(contenu, m, 'marqueur de clé privée dans ' + p);
  }
});

/* ---------- les guides ---------- */

function assertSansSecret(texte, nom){
  for(const m of MARQUEURS) assert.doesNotMatch(texte, m, nom + ' : marqueur de clé privée');
  assert.doesNotMatch(texte, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, nom + ' : identifiant qui ressemble à un Issuer ID');
  assert.doesNotMatch(texte, /\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10}\b/, nom + ' : identifiant qui ressemble à un Key ID ou un Team ID');
  assert.doesNotMatch(texte, /\b\d{9,}\b/, nom + ' : nombre qui ressemble à un identifiant d’app');
  // Longue chaîne de base 64 : un chemin (mots séparés par « / », sans chiffres) n'en est pas une.
  for(const [chaine] of texte.matchAll(/[A-Za-z0-9+/=]{40,}/g)){
    const compte = re => (chaine.match(re) || []).length;
    const melange = compte(/\d/g) >= 4 && compte(/[A-Z]/g) >= 4 && compte(/[a-z]/g) >= 4;
    assert.ok(!melange && !chaine.split('/').some(m => m.length >= 32), `${nom} : longue chaîne qui ressemble à une clé : ${chaine}`);
  }
  assert.doesNotMatch(texte, /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{10,}|AKIA[0-9A-Z]{16}/, nom + ' : jeton');
  assert.doesNotMatch(texte, /[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}\b/, nom + ' : adresse e-mail');
}

// Prose d'un guide : sans blocs de code, code en ligne, URL et, pour la fiche, sans la section anglaise.
function prose(md, { sansAnglais = false } = {}){
  let t = md;
  if(sansAnglais) t = t.replace(/^## Notes de revue \(en anglais\)\n[\s\S]*?(?=^## |(?![\s\S]))/m, '');
  t = t.replace(/^ *```[^\n]*\n[\s\S]*?\n *```[ \t]*$/gm, '');
  t = t.replace(/`[^`\n]*`/g, '');
  t = t.replace(/<?https?:\/\/[^\s)>]+>?/g, '');
  return t;
}
function assertTypographie(texte, nom){
  const lignes = texte.split('\n');
  lignes.forEach((l, k) => {
    const ou = `${nom}, ligne de prose ${k + 1} : ${l.trim().slice(0, 90)}`;
    assert.doesNotMatch(l, / [:;?!]/, 'espace simple avant une ponctuation double. ' + ou);
    // \s couvre aussi les espaces insécables (U+00A0, U+202F) : \S y est un caractère collé.
    assert.doesNotMatch(l, /\S[;?!]/,'espace insécable manquante avant ; ? ! ' + ou);
    assert.doesNotMatch(l, /\S:(?=\s|$)/, 'espace insécable manquante avant « : ». ' + ou);
    assert.doesNotMatch(l, /« | »/, 'espace simple dans des guillemets. ' + ou);
    assert.doesNotMatch(l, /\p{L}'\p{L}/u, 'apostrophe droite dans la prose. ' + ou);
  });
}

test('guides : typographie, aucun tiret cadratin, aucune valeur figée ni donnée personnelle', () => {
  for(const [chemin, sansAnglais] of [[GUIDE, false], [FICHE, true]]){
    const nom = basename(chemin);
    const md = lire(chemin);
    assert.ok(!md.includes(CADRATIN), nom + ' : tiret cadratin');
    assert.doesNotMatch(md, /tome-v\d+/, nom + ' : valeur de CACHE figée');
    assertSansSecret(md, nom);
    assertTypographie(prose(md, { sansAnglais }), nom);
  }
  const fiche = prose(lire(FICHE), { sansAnglais: true });
  assert.doesNotMatch(fiche, /(?<![\p{L}\p{N}_])je(?!\p{L})/iu, 'fiche : jamais de « je »');
  assert.doesNotMatch(fiche, /(?<!\p{L})j[’']/iu, 'fiche : jamais de « j’ »');
});

test('guide : mise en ligne d’abord, les six gestes Apple et GitHub, puis TestFlight et la soumission', () => {
  const md = lire(GUIDE);
  for(let n = 0; n <= 16; n++) assert.match(md, new RegExp(`^##+ Étape ${n}\\b`, 'm'), 'étape ' + n);
  for(const motif of [/\bmain\b/, /gh workflow run ios-testflight\.yml --ref main/, /curl(\.exe)? -si -X OPTIONS https:\/\/montome\.fr\/api\/me/,
    /access-control-allow-origin: capacitor:\/\/localhost/, /capacitor:\/\/localhost/, /migrate:remote/, /Package\.resolved/,
    // les six gestes
    /Apple Developer Program/, /fr\.montome\.app/, /App Store Connect/, /App Manager/,
    /ssh-keygen -t rsa -b 2048 -m PEM -f ios_distribution_private_key/, /gh secret set [A-Z_]+ --env testflight/])
    assert.match(md, motif, 'le guide doit mentionner ' + motif);
  assert.ok(md.includes('```powershell') && md.includes('```bash'), 'contrôle curl en PowerShell et en Git Bash');
  // les noms posés par le guide sont ceux que lit le workflow
  for(const s of SECRETS_ATTENDUS) assert.ok(md.includes(s), 'secret non documenté : ' + s);
  assert.ok(md.includes('APP_STORE_APP_ID') && workflow(TF).brut.includes('vars.APP_STORE_APP_ID'));
  assert.ok(md.includes('appli/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'));
});

// Valeur d'une section de la fiche : ses lignes hors notes (citations « > ») et hors lignes vides au bord.
function section(md, titre){
  const m = new RegExp(`^## ${titre.replace(/[()]/g, '\\$&')}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(md);
  assert.ok(m, 'section absente : ' + titre);
  return m[1].split('\n').filter(l => !l.startsWith('>')).join('\n').trim();
}

test('fiche App Store : limites d’Apple, aucune app concurrente, notes de revue en anglais', () => {
  const md = lire(FICHE);
  const nom = section(md, 'Nom'), sousTitre = section(md, 'Sous-titre'), promo = section(md, 'Texte promotionnel');
  const description = section(md, 'Description'), mots = section(md, 'Mots-clés'), categorie = section(md, 'Catégorie');
  assert.equal(nom, 'Tome · Journal de lecture');
  assert.ok([...nom].length <= 30 && [...sousTitre].length <= 30 && sousTitre.length > 0, 'nom et sous-titre : 30 caractères au plus');
  assert.ok(promo.length > 0 && [...promo].length <= 170, 'texte promotionnel : 170 caractères au plus');
  assert.ok(description.length > 200 && [...description].length <= 4000, 'description : 4 000 caractères au plus');
  // Apple compte les mots-clés en octets : une lettre accentuée en vaut deux en UTF-8.
  const octets = Buffer.byteLength(mots, 'utf8');
  assert.ok(!mots.includes('\n') && octets <= 100, `mots-clés : une ligne, 100 octets UTF-8 au plus (${octets} octets, ${[...mots].length} caractères)`);
  for(const m of mots.split(',')) assert.ok([...m.trim()].length > 2, 'mot-clé de plus de deux caractères : ' + m);
  assert.match(categorie, /Livres/);
  assert.doesNotMatch(md, /goodreads|babelio|storygraph|gleeph|letterboxd|senscritique|livraddict|booknode|bookly/i, 'aucune app concurrente');
  assert.doesNotMatch(description + promo + sousTitre, /android|google play|play store|windows|\bweb\b|navigateur/i, 'aucune autre plateforme');
  assert.doesNotMatch(description, /[*_#`]/, 'description en texte brut, sans Markdown');
  const notes = section(md, 'Notes de revue (en anglais)');
  assert.ok(notes.includes('[délai à confirmer par Lucas]'), 'délai de modération laissé à Lucas');
  for(const motif of [/Vision/, /ISBN/, /QR/, /Files/, /share sheet/i, /offline/i, /no remote code/i, /delet/i, /Report/, /Block/, /demo account/i])
    assert.match(notes, motif, 'notes de revue : ' + motif);
  assert.doesNotMatch(notes, /\b(I|I'm|my|we|our)\b/, 'notes de revue impersonnelles');
});

/* ---------- contrat avec le projet Capacitor (I3) ---------- */

test('contrat avec le projet Capacitor : scripts, verrou npm, projet, schéma App, bundle', t => {
  if(!existsSync(join(APPLI, 'package.json'))){ t.skip('appli/package.json absent : projet Capacitor pas encore créé'); return; }
  const pkg = JSON.parse(lire(join(APPLI, 'package.json')));
  for(const s of ['test', 'web']) assert.ok(pkg.scripts && pkg.scripts[s], 'script npm attendu par la CI : ' + s);
  assert.ok(existsSync(join(APPLI, 'package-lock.json')), 'package-lock.json : npm ci et le cache de setup-node en dépendent');
  for(const p of ['ios/App/App.xcodeproj/project.pbxproj', 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',
    'ios/App/App/Info.plist', 'ios/App/App/PrivacyInfo.xcprivacy', 'ios/App/App/fr.lproj/Localizable.strings'])
    assert.ok(existsSync(join(APPLI, p)), 'fichier attendu par la CI : ' + p);
  const config = JSON.parse(lire(join(APPLI, 'capacitor.config.json')));
  assert.equal(config.appId, workflow(TF).doc.jobs.testflight.env.BUNDLE_ID, 'même bundle que la CI');
  assert.match(lire(join(APPLI, 'ios/App/App.xcodeproj/project.pbxproj')), /PRODUCT_BUNDLE_IDENTIFIER = fr\.montome\.app;/);
  assert.match(lire(join(APPLI, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme')), /BuildableName = "App\.app"/);
});
