// Projet iOS de l'app : dépendances exactes, configuration Capacitor sans chargement distant,
// Info.plist, manifeste de confidentialité, français, réglages Xcode, schéma partagé, images
// et fichiers ignorés par git. Tout est lu en Node pur : ce test tourne aussi sous Windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const APPLI = join(import.meta.dirname, '..');
const IOS = join(APPLI, 'ios', 'App');
const lire = (...p) => readFileSync(join(APPLI, ...p), 'utf8');
const PBX = lire('ios', 'App', 'App.xcodeproj', 'project.pbxproj');

// ---- Lecture d'un plist XML (dict, array, key, string, integer, true, false), sans dépendance.
const entites = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function lirePlist(xml){
  const s = xml.slice(xml.indexOf('<plist')).replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)(plist|dict|array|key|string|integer|real|true|false|date|data)\b[^>]*?(\/?)>/g;
  const toks = [];
  for(let m; (m = re.exec(s));) toks.push({ fin: !!m[1], nom: m[2], vide: !!m[3], pos: m.index, apres: re.lastIndex });
  let i = 1;   // toks[0] : <plist>
  function valeur(){
    const t = toks[i++];
    if(t.nom === 'true' || t.nom === 'false') return t.nom === 'true';
    if(t.vide) return t.nom === 'dict' ? {} : t.nom === 'array' ? [] : '';
    if(t.nom === 'dict'){
      const o = {};
      while(!(toks[i].fin && toks[i].nom === 'dict')){
        if(toks[i].nom !== 'key') throw new Error('plist : <key> attendu');
        const k = valeur();
        if(Object.hasOwn(o, k)) throw new Error(`plist : clé en double ${k}`);
        o[k] = valeur();
      }
      i++;
      return o;
    }
    if(t.nom === 'array'){ const a = []; while(!(toks[i].fin && toks[i].nom === 'array')) a.push(valeur()); i++; return a; }
    const fin = toks[i++];
    if(!fin.fin || fin.nom !== t.nom) throw new Error(`plist : </${t.nom}> attendu`);
    const txt = entites(s.slice(t.apres, fin.pos));
    return t.nom === 'integer' ? Number(txt) : txt;
  }
  return valeur();
}

// ---- Lecture du pbxproj : sections et objets.
function section(nom){
  const m = PBX.match(new RegExp(`/\\* Begin ${nom} section \\*/\\n([\\s\\S]*?)/\\* End ${nom} section \\*/`));
  assert.ok(m, `section ${nom} absente du pbxproj`);
  return m[1];
}
function objets(nom){
  const out = [];
  for(const m of section(nom).matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^*]*\*\/)? = \{([\s\S]*?)\};$/gm)) out.push({ id: m[1], corps: m[2] });
  return out;
}
const valeursReglage = cle => [...PBX.matchAll(new RegExp(`\\b${cle} = ([^;]+);`, 'g'))].map(m => m[1]);
const ressources = () => objets('PBXResourcesBuildPhase')[0].corps;
const groupeApp = () => objets('PBXGroup').find(o => /\bpath = App;/.test(o.corps)).corps;
const typo = (s, quoi) => {
  assert.doesNotMatch(s, /\u2014/, `${quoi} : tiret cadratin`);
  assert.doesNotMatch(s, /'/, `${quoi} : apostrophe droite`);
  assert.doesNotMatch(s, / [:;?!»]|« /, `${quoi} : espace simple avant : ; ? ! ou dans « »`);
};

test('package.json : versions exactes, dépendances limitées à la liste, scripts, .npmrc', () => {
  const pkg = JSON.parse(lire('package.json'));
  assert.equal(pkg.name, 'tome-appli');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22.0.0');
  assert.deepEqual(pkg.dependencies, {
    '@capacitor/barcode-scanner': '3.1.3',
    '@capacitor/core': '8.5.3',
    '@capacitor/filesystem': '8.1.5',
    '@capacitor/ios': '8.5.3',
    '@capacitor/share': '8.0.3',
  });
  assert.deepEqual(pkg.devDependencies, { '@capacitor/cli': '8.5.3' });
  assert.deepEqual(pkg.scripts, {
    web: 'node scripts/preparer-web.mjs',
    icones: 'node scripts/icones.mjs',
    sync: 'npm run web && cap sync ios',
    test: 'node --test "test/*.test.mjs"',
  });
  assert.match(lire('.npmrc'), /^ignore-scripts=true$/m);
  // Le verrou fige les mêmes versions (npm ci en CI).
  const lock = JSON.parse(lire('package-lock.json'));
  for(const [nom, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.equal(lock.packages[`node_modules/${nom}`]?.version, v, `${nom} verrouillé en ${v}`);
  }
});

test('capacitor.config.json : identité de l’app, fichiers embarqués, aucune clé server, CapacitorHttp désactivé', () => {
  const cfg = JSON.parse(lire('capacitor.config.json'));
  assert.equal(cfg.appId, 'fr.montome.app');
  assert.equal(cfg.appName, 'Tome');
  assert.equal(cfg.webDir, 'www');
  assert.equal(cfg.backgroundColor, '#15120d');
  assert.ok(!('server' in cfg), 'aucune clé server : l’origine reste capacitor://localhost');
  assert.equal(cfg.plugins.CapacitorHttp.enabled, false);
  assert.equal(cfg.ios.limitsNavigationsToAppBoundDomains, false);
  const cles = [];
  const marche = o => { for(const [k, v] of Object.entries(o)){ cles.push(k); if(v && typeof v === 'object') marche(v); } };
  marche(cfg);
  for(const interdite of ['server', 'url', 'allowNavigation', 'hostname', 'iosScheme', 'androidScheme']) {
    assert.ok(!cles.includes(interdite), `clé ${interdite} interdite`);
  }
});

test('Info.plist : français, descriptions d’usage, chiffrement exempté, Fichiers, portrait sur iPhone', () => {
  const p = lirePlist(lire('ios', 'App', 'App', 'Info.plist'));
  assert.equal(p.CFBundleDevelopmentRegion, 'fr');
  assert.deepEqual(p.CFBundleLocalizations, ['fr']);
  assert.equal(p.CFBundleDisplayName, 'Tome');
  assert.equal(p.NSCameraUsageDescription, 'Tome utilise l’appareil photo pour lire le code-barres d’un livre ou le QR code d’un ami. Aucune image n’est enregistrée ni envoyée.');
  assert.equal(p.NSPhotoLibraryAddUsageDescription, 'Tome enregistre dans tes photos les cartes de lecture que tu choisis d’y garder.');
  typo(p.NSCameraUsageDescription, 'NSCameraUsageDescription');
  typo(p.NSPhotoLibraryAddUsageDescription, 'NSPhotoLibraryAddUsageDescription');
  assert.equal(p.ITSAppUsesNonExemptEncryption, false);
  assert.equal(p.UIFileSharingEnabled, true);
  assert.equal(p.LSSupportsOpeningDocumentsInPlace, true);
  assert.deepEqual(p.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait']);
  assert.equal(p['UISupportedInterfaceOrientations~ipad'].length, 4, 'clé ~ipad du gabarit gardée telle quelle');
  assert.equal(p.UIViewControllerBasedStatusBarAppearance, true, 'SystemBars en dépend');
  // Clés du gabarit Capacitor conservées.
  assert.equal(p.CFBundleIdentifier, '$(PRODUCT_BUNDLE_IDENTIFIER)');
  assert.equal(p.CFBundleShortVersionString, '$(MARKETING_VERSION)');
  assert.equal(p.CFBundleVersion, '$(CURRENT_PROJECT_VERSION)');
  assert.equal(p.CAPACITOR_DEBUG, '$(CAPACITOR_DEBUG)');
  assert.equal(p.UILaunchStoryboardName, 'LaunchScreen');
  assert.equal(p.UIMainStoryboardFile, 'Main');
  assert.equal(p.LSRequiresIPhoneOS, true);
  assert.equal(p.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  for(const interdite of ['WKAppBoundDomains', 'NSAppTransportSecurity', 'UIBackgroundModes', 'NSUserTrackingUsageDescription', 'CFBundleURLTypes']) {
    assert.ok(!(interdite in p), `${interdite} interdit`);
  }
  const usages = Object.keys(p).filter(k => /^NS\w+UsageDescription$/.test(k)).sort();
  assert.deepEqual(usages, ['NSCameraUsageDescription', 'NSPhotoLibraryAddUsageDescription'], 'aucune autre description d’usage');
});

test('PrivacyInfo.xcprivacy : aucun pistage, sept types de données, raison C617.1, compilé dans l’app', () => {
  const p = lirePlist(lire('ios', 'App', 'App', 'PrivacyInfo.xcprivacy'));
  assert.equal(p.NSPrivacyTracking, false);
  assert.deepEqual(p.NSPrivacyTrackingDomains, []);
  const attendu = {
    NSPrivacyCollectedDataTypeUserID: [true, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    NSPrivacyCollectedDataTypeName: [true, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    NSPrivacyCollectedDataTypeContacts: [true, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    NSPrivacyCollectedDataTypeOtherUserContent: [true, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    NSPrivacyCollectedDataTypeCustomerSupport: [true, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    NSPrivacyCollectedDataTypeProductInteraction: [false, 'NSPrivacyCollectedDataTypePurposeAnalytics'],
    // Adresse IP gardée au plus 48 h dans les compteurs anti-abus (table rl), sans lien avec le
    // compte : Apple ne dispense que l'IP non conservée, d'où ce type déclaré.
    NSPrivacyCollectedDataTypeOtherDataTypes: [false, 'NSPrivacyCollectedDataTypePurposeAppFunctionality'],
  };
  assert.equal(p.NSPrivacyCollectedDataTypes.length, 7);
  for(const d of p.NSPrivacyCollectedDataTypes) {
    const a = attendu[d.NSPrivacyCollectedDataType];
    assert.ok(a, `type inattendu ${d.NSPrivacyCollectedDataType}`);
    assert.equal(d.NSPrivacyCollectedDataTypeLinked, a[0], `${d.NSPrivacyCollectedDataType} : lié`);
    assert.equal(d.NSPrivacyCollectedDataTypeTracking, false);
    assert.deepEqual(d.NSPrivacyCollectedDataTypePurposes, [a[1]]);
  }
  assert.deepEqual(new Set(p.NSPrivacyCollectedDataTypes.map(d => d.NSPrivacyCollectedDataType)), new Set(Object.keys(attendu)));
  assert.deepEqual(p.NSPrivacyAccessedAPITypes, [{ NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] }]);
  // Référencé dans le projet : fichier, build file, groupe App et phase Resources.
  const ref = objets('PBXFileReference').find(o => /\bpath = PrivacyInfo\.xcprivacy;/.test(o.corps));
  assert.ok(ref, 'PBXFileReference PrivacyInfo.xcprivacy');
  assert.match(ref.corps, /lastKnownFileType = text\.xml;/);
  assert.match(ref.corps, /sourceTree = "<group>";/);
  const bf = objets('PBXBuildFile').find(o => o.corps.includes(`fileRef = ${ref.id} `));
  assert.ok(bf, 'PBXBuildFile PrivacyInfo.xcprivacy');
  assert.ok(ressources().includes(bf.id), 'PrivacyInfo.xcprivacy dans la phase Resources');
  assert.ok(groupeApp().includes(ref.id), 'PrivacyInfo.xcprivacy dans le groupe App');
});

test('français : Localizable.strings (alerte du scanner), groupe de variantes, régions du projet', () => {
  const brut = lire('ios', 'App', 'App', 'fr.lproj', 'Localizable.strings');
  const lignes = brut.split(/\r?\n/).filter(l => l.trim());
  assert.equal(lignes.length, 4);
  const paires = {};
  for(const l of lignes) {
    const m = l.match(/^"((?:[^"\\]|\\.)*)" = "((?:[^"\\]|\\.)*)";$/);
    assert.ok(m, `ligne mal formée : ${l}`);
    paires[m[1]] = m[2];
  }
  assert.deepEqual(Object.keys(paires).sort(), ['Camera Access Not Enabled', 'OK', 'Settings', 'To continue, please go to the Settings app and enable it.'].sort());
  assert.equal(paires['Camera Access Not Enabled'], 'Accès à l’appareil photo désactivé');
  assert.equal(paires.Settings, 'Réglages');
  for(const v of Object.values(paires)) typo(v, 'Localizable.strings');
  assert.ok(!brut.startsWith('\uFEFF'), 'UTF-8 sans BOM');
  const ref = objets('PBXFileReference').find(o => /\bpath = fr\.lproj\/Localizable\.strings;/.test(o.corps));
  assert.ok(ref, 'PBXFileReference fr.lproj/Localizable.strings');
  assert.match(ref.corps, /lastKnownFileType = text\.plist\.strings;/);
  assert.match(ref.corps, /\bname = fr;/);
  const groupe = objets('PBXVariantGroup').find(o => /\bname = Localizable\.strings;/.test(o.corps));
  assert.ok(groupe, 'PBXVariantGroup Localizable.strings');
  assert.ok(groupe.corps.includes(ref.id), 'la variante fr est enfant du groupe');
  const bf = objets('PBXBuildFile').find(o => o.corps.includes(`fileRef = ${groupe.id} `));
  assert.ok(bf, 'PBXBuildFile Localizable.strings sur le groupe');
  assert.ok(ressources().includes(bf.id), 'Localizable.strings dans la phase Resources');
  assert.ok(groupeApp().includes(groupe.id), 'Localizable.strings dans le groupe App');
  assert.match(PBX, /\bdevelopmentRegion = fr;/);
  const regions = PBX.match(/knownRegions = \(([^)]*)\);/)[1].split(',').map(s => s.trim()).filter(Boolean);
  for(const r of ['en', 'fr', 'Base']) assert.ok(regions.includes(r), `région ${r}`);
});

test('pbxproj : iOS 16.4, iPhone seul, version 1.0.0, identifiant fr.montome.app, sans équipe', () => {
  const tous = (cle, v, min) => {
    const vals = valeursReglage(cle);
    assert.ok(vals.length >= min, `${cle} : au moins ${min} occurrences`);
    assert.deepEqual([...new Set(vals)], [v], `${cle} vaut partout ${v}`);
  };
  tous('IPHONEOS_DEPLOYMENT_TARGET', '16.4', 4);
  tous('TARGETED_DEVICE_FAMILY', '1', 2);
  tous('MARKETING_VERSION', '1.0.0', 2);
  tous('PRODUCT_BUNDLE_IDENTIFIER', 'fr.montome.app', 2);
  assert.doesNotMatch(PBX, /DEVELOPMENT_TEAM/, 'aucune équipe Apple dans ce dépôt public');
  assert.doesNotMatch(PBX, /com\.getcapacitor/);
});

test('pbxproj : identifiants à 24 hexadécimaux majuscules, définis une seule fois, tous résolus', () => {
  const definis = [...PBX.matchAll(/^\t\t([0-9A-Fa-f]+)(?: \/\*[^*]*\*\/)? = \{/gm)].map(m => m[1]);
  assert.ok(definis.length > 30);
  for(const id of definis) assert.match(id, /^[0-9A-F]{24}$/);
  assert.equal(new Set(definis).size, definis.length, 'aucun identifiant défini deux fois');
  const cites = new Set(PBX.match(/\b[0-9A-F]{24}\b/g));
  const absents = [...cites].filter(id => !definis.includes(id));
  assert.deepEqual(absents, [], 'chaque identifiant cité est défini');
  assert.equal((PBX.match(/\{/g) || []).length, (PBX.match(/\}/g) || []).length, 'accolades équilibrées');
  assert.equal((PBX.match(/\(/g) || []).length, (PBX.match(/\)/g) || []).length, 'parenthèses équilibrées');
});

test('schéma partagé App : construit la cible App du projet, archive en Release', () => {
  const cible = objets('PBXNativeTarget').find(o => /\bname = App;/.test(o.corps));
  assert.ok(cible, 'cible App');
  const s = lire('ios', 'App', 'App.xcodeproj', 'xcshareddata', 'xcschemes', 'App.xcscheme');
  const ids = [...s.matchAll(/BlueprintIdentifier = "([^"]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 1);
  for(const id of ids) assert.equal(id, cible.id);
  assert.ok([...s.matchAll(/BuildableName = "([^"]+)"/g)].every(m => m[1] === 'App.app'));
  assert.ok([...s.matchAll(/BlueprintName = "([^"]+)"/g)].every(m => m[1] === 'App'));
  assert.ok([...s.matchAll(/ReferencedContainer = "([^"]+)"/g)].every(m => m[1] === 'container:App.xcodeproj'));
  assert.match(s, /<ArchiveAction\s+buildConfiguration = "Release"/);
  for(const a of ['BuildAction', 'TestAction', 'LaunchAction', 'ProfileAction', 'AnalyzeAction', 'ArchiveAction']) assert.match(s, new RegExp(`<${a}\\b`));
});

test('images : icône 1024×1024 et lancement 2732×2732, RGB 8 bits sans alpha', () => {
  const ihdr = f => {
    const b = readFileSync(f);
    assert.ok(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${f} : signature PNG`);
    assert.equal(b.toString('latin1', 12, 16), 'IHDR');
    return { l: b.readUInt32BE(16), h: b.readUInt32BE(20), profondeur: b[24], type: b[25] };
  };
  const cat = join(IOS, 'App', 'Assets.xcassets');
  assert.deepEqual(ihdr(join(cat, 'AppIcon.appiconset', 'AppIcon-512@2x.png')), { l: 1024, h: 1024, profondeur: 8, type: 2 });
  const icones = JSON.parse(readFileSync(join(cat, 'AppIcon.appiconset', 'Contents.json'), 'utf8'));
  assert.deepEqual(icones.images.map(i => [i.filename, i.size]), [['AppIcon-512@2x.png', '1024x1024']]);
  const splash = JSON.parse(readFileSync(join(cat, 'Splash.imageset', 'Contents.json'), 'utf8'));
  assert.equal(splash.images.length, 3);
  for(const i of splash.images) assert.deepEqual(ihdr(join(cat, 'Splash.imageset', i.filename)), { l: 2732, h: 2732, profondeur: 8, type: 2 });
});

test('git : ce qui est produit ou secret est ignoré, le projet versionné ne l’est pas', t => {
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if(git.status !== 0) return t.skip('git absent');
  const ignore = p => {
    const r = spawnSync('git', ['check-ignore', '--no-index', '-q', p], { cwd: APPLI, encoding: 'utf8' });
    assert.ok(r.status === 0 || r.status === 1, `git check-ignore ${p} : ${r.stderr}`);
    return r.status === 0;
  };
  for(const p of ['node_modules/x', 'www/index.html', 'ios/App/App/public/index.html', 'ios/App/App/capacitor.config.json',
    'build/ios/ipa/App.ipa', 'fumee/accueil.png', 'AuthKey_TEST.p8', 'ios_distribution_private_key']) {
    assert.ok(ignore(p), `${p} doit être ignoré`);
  }
  for(const p of ['capacitor.config.json', 'package-lock.json', 'ios/App/App/Info.plist', 'ios/App/App/PrivacyInfo.xcprivacy',
    'ios/App/App/fr.lproj/Localizable.strings', 'ios/App/App.xcodeproj/project.pbxproj',
    'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme',
    'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'ios/App/CapApp-SPM/Package.swift']) {
    assert.ok(!ignore(p), `${p} doit être versionné`);
  }
});

test('configuration générée par cap sync : les trois classes de plugins sont enregistrées', t => {
  const f = join(IOS, 'App', 'capacitor.config.json');
  if(!existsSync(f)) return t.skip('ios/App/App/capacitor.config.json absent : lancer npm run web puis npx cap sync ios');
  const cfg = JSON.parse(readFileSync(f, 'utf8'));
  for(const c of ['CapacitorBarcodeScannerPlugin', 'SharePlugin', 'FilesystemPlugin']) assert.ok(cfg.packageClassList.includes(c), `${c} enregistré`);
  assert.ok(!('server' in cfg), 'aucune clé server dans la copie générée');
});
