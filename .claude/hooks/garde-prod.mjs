#!/usr/bin/env node
// Garde-fou PreToolUse de Claude Code (outils Bash, PowerShell et Monitor) pour les dépôts Tome et Tome-Social.
//
// POURQUOI un hook en plus des règles deny de .claude/settings.json : une règle « Bash(wrangler deploy *) »
// ne reconnaît que la commande écrite telle quelle en tête d'une sous-commande. Le même déploiement
// écrit « npx wrangler deploy », « node node_modules/wrangler/bin/wrangler.js deploy » (c'est ainsi que
// scripts/d1.mjs lance wrangler), « npx wrangler --cwd ../Tome-Social deploy », « bash -c '…' », coupé
// par une continuation de ligne ou glissé dans une substitution $(…) lui échappe : la documentation dit
// que npx n'est pas un lanceur retiré avant la comparaison et qu'une règle « n'est pas une frontière de
// sécurité autour du programme ». Ce script, lui, reçoit le texte complet de la commande, le normalise et
// cherche partout. Il tranche AVANT les règles de permission : code de sortie 2 = commande refusée, et le
// message sur stderr est montré à l'agent, qui doit alors laisser Lucas faire l'opération à la main dans
// son terminal. Wrangler répondant « yes » tout seul hors terminal interactif, aucune confirmation ne
// protégerait la production après coup. Monitor exécute une commande shell avec les mêmes règles que
// Bash : il passe donc ici aussi (matcher « Bash|PowerShell|Monitor »).
//
// Ce qu'il refuse : tout ce qui écrit sur la production de Tome (Worker montome.fr, base D1
// « tome-social », secrets, drapeau --je-sais-que-cest-la-production des scripts d'admin), un push
// forcé, une suppression récursive, git clean et git reset --hard (ils détruisent le travail non
// commité). Il pèche par excès : il retire les guillemets pour attraper « bash -c "…" » et
// « echo … | bash », si bien qu'un simple echo ou grep qui CITE une commande interdite est refusé aussi ;
// l'agent passe alors par un fichier ou par l'outil Grep.
// La lecture de la production reste possible, mais seulement sous une forme stricte décidée sur la
// commande ENTIÈRE (voir exemptionLecture) : « wrangler d1 execute tome-social --remote --command
// "SELECT …" » seul, éventuellement précédé de « cd <chemin> && », et les sous-commandes D1 qui ne font
// que lire (export, info, list, migrations list, time-travel info).
//
// Ce n'est pas un bac à sable : un programme qui supprime par lui-même (node -e, python) lui échappe.
// Il protège des accidents et des reformulations naturelles, pas d'un agent qui voudrait nuire.
//
// Entrée : le JSON de Claude Code sur stdin ({ tool_name, tool_input:{ command } }).
// Sortie : rien et code 0 quand la commande est saine ; message en français sur stderr et code 2 sinon.
// Une entrée illisible (JSON cassé, stdin vide, autre outil) laisse passer : le garde-fou ne doit
// jamais bloquer un « ls » parce que Claude Code a changé un détail de format.
// Se teste hors Claude Code : node garde-prod.mjs < entree.json (voir test/lot9-garde.test.js).

const NBSP = '\u00a0';
// Typographie française des messages : espace insécable avant : ; ! ? et à l'intérieur des guillemets.
const fr = s => s.replace(/ ([:;!?»])/g, NBSP + '$1').replace(/« /g, '«' + NBSP);

const DEPLOI = 'Pour déployer, lance toi-même « npm run deploy » dans un terminal ouvert dans Tome-Social : il enchaîne npm run check puis wrangler deploy.';
const A_LA_MAIN = 'À faire à la main dans un terminal, après « npm run backup », jamais par l’agent.';
const SUPPR = 'Supprime ce dossier toi-même, ou demande une commande qui vise des fichiers précis, sans récursion.';

// Motifs simples : présence du texte (normalisé) suffit. [regexp, motif, conseil]
const REGLES = [
  [/\bwrangler (?:deploy|publish|versions (?:upload|deploy)|rollback|triggers deploy|pages deploy)\b/, 'déploiement du Worker en production', DEPLOI],
  [/\b(?:npm run|node --run|yarn) deploy\b/, 'déploiement du Worker en production', DEPLOI],
  [/\bwrangler delete\b/, 'suppression du Worker en production', 'Supprimer le Worker se fait à la main, depuis un terminal ou le tableau de bord Cloudflare.'],
  [/\bwrangler d1 delete\b/, 'suppression de la base D1 de production', A_LA_MAIN],
  [/\bwrangler d1 time-travel restore\b/, 'remplacement de la base D1 de production par un état antérieur', A_LA_MAIN + ' Vérifie l’horodatage visé avant.'],
  [/\bwrangler (?:versions )?secret\b/, 'manipulation des secrets du Worker', 'Les secrets se posent à la main : « npx wrangler secret put NOM » dans un terminal, la valeur tapée par toi, jamais écrite dans un fichier du dépôt.'],
  [/\bmigrate:remote\b/, 'migration de la base D1 de production', 'Joue les migrations toi-même : « npm run backup » puis « npm run migrate:remote » dans un terminal.'],
  // scripts/d1.mjs vise la PRODUCTION par défaut : « node scripts/revoke-all.mjs --je-sais-que-cest-la-production
  // --confirmer » l'écrit sans que « --remote » figure dans la commande. Ce drapeau long est la signature d'un
  // humain qui sait ce qu'il fait (d1.mjs, DRAPEAU_PROD) : un agent qui le tape annule le garde-fou des scripts.
  [/--je-sais-que-cest-la-production\b/, 'drapeau réservé à un humain (--je-sais-que-cest-la-production : écriture sur la base de production)', 'Lance toi-même ce script dans un terminal, après « npm run backup ». Pour une répétition, vise une base jetable : --jetable C:/d1-essai --base tome-essai (voir EXPLOITATION.md, section 3).'],
  [/\bgit (?:\S+ )*reset (?:\S+ )*--hard\b/, 'git reset --hard (efface le travail non commité)', 'Si c’est voulu, fais-le toi-même après avoir vérifié « git status » et « git diff ».'],
];

// Sous-commandes de premier niveau de wrangler 4 : une option globale (« --cwd X », « -c X », « --env X »…)
// peut s'intercaler entre « wrangler » et elles. On repère la première de la liste et on recolle.
const WRANGLER_CMDS = new Set(['deploy', 'publish', 'dev', 'd1', 'kv', 'r2', 'secret', 'secrets-store', 'versions', 'rollback',
  'delete', 'tail', 'whoami', 'login', 'logout', 'pages', 'triggers', 'types', 'init', 'queues', 'deployments', 'hyperdrive',
  'vectorize', 'ai', 'workflows', 'containers', 'cloudchamber', 'dispatch-namespace', 'mtls-certificate', 'pipelines', 'docs',
  'check', 'setup', 'telemetry', 'build', 'cert', 'kv:namespace', 'kv:key', 'kv:bulk']);
const WRANGLER_OPT_VALEUR = new Set(['--cwd', '--config', '-c', '--env', '-e', '--env-file']);
// npm : options globales avant la commande, alias de « run », options entre « run » et le nom du script.
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const NPM_OPT_VALEUR = new Set(['--prefix', '-c', '-w', '--workspace', '--loglevel', '--userconfig', '--cache', '--script-shell']);

// Découpe une ligne de commande en instructions, en respectant les guillemets simples et doubles :
// séparateurs && || ; & retours à la ligne, et | sauf si garderPipes (PowerShell : « gci -Recurse |
// Remove-Item » ne doit pas être coupé en deux morceaux anodins). Le contenu d'une substitution $(…)
// reste dans son instruction, ce qui suffit puisque la recherche se fait ensuite par sous-chaîne.
function decouper(s, garderPipes){
  const out = []; let cur = '', q = null;
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(q){
      cur += c;
      if(c === '\\' && q === '"'){ cur += s[++i] ?? ''; }
      else if(c === q) q = null;
      continue;
    }
    if(c === '"' || c === "'"){ q = c; cur += c; continue; }
    if(c === '|' && garderPipes && s[i + 1] !== '|'){ cur += ' | '; continue; }
    if(c === '\n' || c === ';' || c === '&' || c === '|'){
      out.push(cur); cur = '';
      if((c === '&' || c === '|') && s[i + 1] === c) i++;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

// Recolle « wrangler <options globales> <commande> » en « wrangler <commande> », et
// « npm <options> run-script <options> deploy » en « npm run deploy ».
function recoller(s){
  const t = s.split(' ');
  for(let i = 0; i < t.length; i++){
    if(t[i] === 'wrangler'){
      let j = i + 1;
      while(j < t.length && j <= i + 8 && !WRANGLER_CMDS.has(t[j])){
        if(WRANGLER_OPT_VALEUR.has(t[j])) j += 2; else j++;
      }
      if(j < t.length && WRANGLER_CMDS.has(t[j]) && j > i + 1) t.splice(i + 1, j - i - 1);
    }
    if(t[i] === 'npm'){
      let j = i + 1;
      while(j < t.length && t[j].startsWith('-')) j += NPM_OPT_VALEUR.has(t[j]) && !t[j].includes('=') ? 2 : 1;
      if(j < t.length && NPM_RUN.has(t[j])){
        let k = j + 1;
        while(k < t.length && t[k].startsWith('-') && t[k] !== '--') k += NPM_OPT_VALEUR.has(t[k]) && !t[k].includes('=') ? 2 : 1;
        t.splice(i + 1, k - i - 1, 'run');
      }
    }
  }
  return t.join(' ');
}

// Version « à plat » d'une instruction : sans guillemets, blancs réduits, lanceurs et chemins repliés,
// pour que « npx -y wrangler@4 », « node node_modules/wrangler/bin/wrangler.js », « c:\…\git.exe »
// ou « /bin/rm » soient lus comme « wrangler », « git », « rm ».
function aplatir(st){
  // Les guillemets disparaissent sans laisser d'espace, comme dans le shell qui concatène : « dep""loy »
  // se lit « deploy », « --remot""e » se lit « --remote ». Les virgules deviennent des espaces : c'est
  // ainsi que PowerShell sépare « Start-Process npx -ArgumentList 'wrangler','deploy' ».
  let s = st.replace(/["']/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(^|[\s;&|(])(?:[^\s;&|()]*[\\/])?(wrangler|git|rm|rmdir|del|npm|npx|node|powershell|pwsh|find|xargs)(?:\.(?:exe|cmd|ps1|js|mjs))?(?=\s|$)/g, '$1$2');
  s = s.replace(/(^|\s)sudo (?:-\S+ )*/g, '$1');
  s = s.replace(/(^|\s)(?:npx(?: -y| --yes| --no-install| --package(?:=| )\S+| -p \S+)* |npm exec(?: --)? |pnpm(?: dlx| exec)? |yarn(?: dlx)? |bunx |bun x |node )wrangler(?:@\S+)?(?=\s|$)/g, '$1wrangler');
  s = s.replace(/\b(?:pnpm|yarn|bun) run\b/g, 'npm run');
  return recoller(s);
}

// Lecture seule de la production. L'exemption se décide sur la commande ENTIÈRE, jamais sur un morceau :
// avant, elle se décidait par instruction, sur le texte brut, avant les expansions du shell, et
// « X='1; DELETE FROM users'; wrangler … --command "SELECT $X" » passait, une deuxième --command passait,
// un « wrangler d1 list » cité n'importe où exemptait l'instruction, et un découpage faussé (apostrophe
// dans un here-doc, chemin PowerShell finissant par \") fusionnait un DELETE avec le SELECT qui le
// précédait. Ici, on refuse dans le doute : UNE invocation de wrangler, au plus précédée d'un
// « cd <chemin> && », sans aucun caractère que le shell interprète hors du SQL, une seule --command
// entre guillemets sans $ ni accent grave, et des ordres SELECT, EXPLAIN ou PRAGMA de lecture. Tout le
// reste en --remote est refusé ; l'agent le rend à Lucas.
const SOUS_COMMANDES_LECTURE = [['export'], ['info'], ['list'], ['migrations', 'list'], ['time-travel', 'info']];
const DRAPEAUX_EXECUTE = new Set(['--remote', '--json', '--yes', '-y']);
const DRAPEAUX_EXECUTE_VALEUR = new Set(['--config', '-c', '--env', '-e']);
function exemptionLecture(commande){
  let s = commande.trim().replace(/^cd\s+(?:"[^"$`\\]*"|'[^']*'|[^\s;&|$`"'#<>()]+)\s*&&\s*/, '');
  if((s.match(/--command\b/g) || []).length > 1) return false;
  let sql = null, reste = s;
  const m = /--command(?:=|\s+)(?:"([^"\\$`]*)"|'([^']*)')/.exec(s);
  if(/--command\b/.test(s)){
    if(!m) return false;
    sql = (m[1] ?? m[2]).trim();
    reste = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  }
  if(/[\n\r;&|<>`$"'(){}#*?\[\]!]/.test(reste)) return false;
  const toks = aplatir(reste).split(' ').filter(Boolean);
  if(toks[0] !== 'wrangler' || toks[1] !== 'd1') return false;
  const suite = toks.slice(2);
  if(SOUS_COMMANDES_LECTURE.some(sc => sc.every((t, i) => suite[i] === t))) return sql === null && !suite.includes('--file');
  if(suite[0] !== 'execute' || !suite[1] || suite[1].startsWith('-') || sql === null) return false;
  for(let i = 2; i < suite.length; i++){
    if(DRAPEAUX_EXECUTE.has(suite[i])) continue;
    if(DRAPEAUX_EXECUTE_VALEUR.has(suite[i]) && suite[i + 1] && !suite[i + 1].startsWith('-')){ i++; continue; }
    return false;
  }
  const ordres = sql.split(';').map(x => x.trim()).filter(Boolean);
  return ordres.length > 0 && ordres.every(o => /^(?:select|explain)\b/.test(o) || (/^pragma\b/.test(o) && !o.includes('=')));
}

// git … push … qui réécrit ou efface l'historique distant : --force (y compris --force-with-lease), un groupe
// de drapeaux courts contenant f ou d, une refspec forcée (+main, +HEAD:main), --mirror, --delete, --prune,
// ou une refspec de suppression (:main).
function pushForce(toks){
  const gi = toks.indexOf('git'); if(gi < 0) return false;
  const pi = toks.indexOf('push', gi + 1); if(pi < 0) return false;
  return toks.slice(pi + 1).some(t => /^--(?:force(?:-with-lease|-if-includes)?|mirror|delete|prune)(?:=.*)?$/.test(t)
    || (/^-[a-z]+$/.test(t) && /[fd]/.test(t)) || /^\+\S/.test(t) || /^:\S/.test(t));
}

// git clean efface les fichiers non suivis (-f), les dossiers (-d) et les ignorés (-x : backups/, .dev.vars).
// Seule la répétition à blanc (-n, --dry-run) passe.
function gitClean(toks){
  const gi = toks.indexOf('git'); if(gi < 0) return false;
  const ci = toks.indexOf('clean', gi + 1); if(ci < 0) return false;
  const drapeaux = toks.slice(ci + 1);
  return !drapeaux.some(t => t === '--dry-run' || (/^-[a-z]+$/.test(t) && t.includes('n')));
}

// rm avec récursion, forcée ou non : l'outil Bash n'a pas de stdin interactif, et « rm -r » n'y demande
// rien, même sur un fichier en lecture seule. Aussi : find … -delete.
// Parcours linéaire : une commande de plusieurs centaines de milliers de mots ne doit pas faire expirer le
// hook (un hook expiré ne bloque RIEN, d'après la documentation).
function rmRecursif(toks){
  if(toks.includes('find') && toks.includes('-delete')) return 'find -delete';
  // « git rm -r --cached x » ne touche qu'à l'index (arrêter de suivre un dossier qu'on vient d'ignorer) :
  // permis. Sans --cached, git rm efface aussi du disque, avec les modifications non commitées : refusé.
  const cached = toks.includes('--cached');
  let dansRm = false, dernierGit = -10;
  for(let i = 0; i < toks.length; i++){
    const t = toks[i];
    if(t === 'git') dernierGit = i;
    if(t === 'rm'){ dansRm = !(i - dernierGit <= 3 && cached); continue; }
    if(!dansRm) continue;
    if(t === '--') dansRm = false;
    else if(t === '--recursive' || (/^-[a-z]+$/i.test(t) && /r/i.test(t))) return 'rm -r';
  }
  return null;
}

// Remove-Item -Recurse et ses alias PowerShell (ri, rm, del, erase, rd, rmdir ; -r suffit à PowerShell),
// plus les formes cmd.exe « rd /s », « rd /s/q », « del /s ». rm et rmdir ne sont lus comme alias que
// côté PowerShell, pour ne pas confondre avec les programmes du même nom sous Git Bash. Le segment
// examiné peut contenir un pipeline entier (« gci x -Recurse | Remove-Item ») : -Recurse compte alors
// aussi s'il précède la suppression.
function removeItemRecursif(toks, ps){
  const REC = /^-r(?:e|ec|ecu|ecur|ecurs|ecurse)?(?::\$?true)?$/;
  const SLASH_S = /^\/[a-z/]*s/;
  const pipeline = toks.includes('|');
  const recQuelquePart = toks.some(t => REC.test(t));
  // Un seul parcours de droite à gauche : « après le mot i » se lit dans des drapeaux cumulés.
  let recApres = false, slashApres = false;
  for(let i = toks.length - 1; i >= 0; i--){
    const n = toks[i];
    const alias = n === 'remove-item' || n === 'ri' || n === 'del' || n === 'erase' || n === 'rd' || (ps && (n === 'rm' || n === 'rmdir'));
    if(alias && recApres) return 'Remove-Item -Recurse';
    if(alias && ps && pipeline && recQuelquePart) return 'Remove-Item -Recurse';
    if((n === 'rd' || n === 'rmdir' || n === 'del' || n === 'erase') && slashApres) return n + ' /s';
    if(REC.test(n)) recApres = true;
    if(SLASH_S.test(n)) slashApres = true;
  }
  return null;
}

// Rend { motif, conseil } pour la première instruction fautive, ou null.
function examiner(brute, outil){
  // Un hook qui dépasse son délai ne bloque rien : une commande démesurée est refusée d'office plutôt que
  // de risquer ce passage silencieux. Aucune commande légitime n'approche cette taille (un long contenu
  // s'écrit dans un fichier avec l'outil d'écriture).
  if(brute.length > 50000) return { motif:'commande trop longue pour être vérifiée (plus de 50 000 caractères)', conseil:'Écris ce contenu dans un fichier avec l’outil d’écriture, puis lance une commande courte.' };
  // Continuations de ligne : « \⏎ » (bash) et « `⏎ » (PowerShell) recollent une commande que le
  // découpage par ligne couperait en deux morceaux anodins (« npx wrangler \⏎ deploy »).
  const commande = brute.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ').toLowerCase();
  const ps = outil === 'PowerShell';
  const lecture = exemptionLecture(commande);
  for(const st of decouper(commande, false)){
    const plat = aplatir(st);
    const toks = plat.split(' ');
    for(const [re, motif, conseil] of REGLES) if(re.test(plat)) return { motif, conseil };
    if(/(?:^|\s)--remote(?:=true)?(?=\s|$)/.test(plat) && !lecture){
      if(/\bwrangler dev\b/.test(plat)) return { motif:'serveur de développement branché sur les ressources de production (--remote)', conseil:'Développe en local (« npm run dev », base .wrangler/state). La production ne sert jamais de bac à sable.' };
      return { motif:'écriture, ou commande non vérifiable, sur la production (--remote)', conseil:'L’agent ne lit la production qu’en SELECT, PRAGMA ou EXPLAIN via « --command », en une seule requête, sans rien d’autre dans la commande. Pour tout le reste, lance la commande toi-même dans un terminal, après « npm run backup ».' };
    }
    if(pushForce(toks)) return { motif:'push forcé (réécriture de l’historique partagé)', conseil:'Si tu es sûr de toi, fais ce push à la main ; sinon pousse une branche neuve ou un commit correctif.' };
    if(gitClean(toks)) return { motif:'git clean (efface les fichiers non suivis, voire ignorés : sauvegardes, .dev.vars)', conseil:'Regarde d’abord « git clean -n », puis supprime toi-même ce qui doit l’être.' };
    // Côté PowerShell, rm est un alias de Remove-Item : la seconde passe le traite, avec son motif.
    const rr = ps ? null : rmRecursif(toks);
    if(rr) return { motif:'suppression récursive (' + rr + ')', conseil:SUPPR };
  }
  // PowerShell et cmd : les pipelines restent entiers pour voir « gci -Recurse | Remove-Item ».
  for(const st of decouper(commande, true)){
    const plat = aplatir(st);
    const ri = removeItemRecursif(plat.split(' '), ps || /\b(?:powershell|pwsh|cmd)\b/.test(plat));
    if(ri) return { motif:'suppression récursive (' + ri + ')', conseil:SUPPR };
  }
  return null;
}

// Le message va à l'agent, qui le relaie à Lucas : la marche à suivre est donc tutoyée pour Lucas, et la
// consigne de ne pas reformuler vise l'agent (une règle deny se contourne par une autre écriture, cf. en-tête).
// fr() ne touche que nos textes : la commande citée reste telle que l'agent l'a écrite.
function message(faute, commande){
  const courte = commande.replace(/\s+/g, ' ').trim();
  return [
    fr('Garde-fou Tome : commande refusée.'),
    fr('Motif : ' + faute.motif + '.'),
    fr('Commande :') + ' ' + (courte.length > 240 ? courte.slice(0, 237) + '...' : courte),
    fr('Marche à suivre pour Lucas : ' + faute.conseil),
    fr('Ne reformule pas la commande pour passer outre : rends la main à Lucas avec cette marche à suivre.'),
    fr('Règle des dépôts Tome : l’agent ne modifie jamais la production ni l’historique partagé (.claude/hooks/garde-prod.mjs).'),
  ].join('\n') + '\n';
}

if(process.stdin.isTTY){
  process.stderr.write(fr('Usage : node garde-prod.mjs < entree.json (JSON PreToolUse de Claude Code sur stdin).') + '\n');
} else {
  let brut = '';
  try{ for await (const morceau of process.stdin) brut += morceau; }catch(_){ }
  let entree = null;
  try{ entree = JSON.parse(brut); }catch(_){ }
  const outil = entree && entree.tool_name;
  const commande = entree && entree.tool_input && entree.tool_input.command;
  if((outil === 'Bash' || outil === 'PowerShell' || outil === 'Monitor') && typeof commande === 'string'){
    const faute = examiner(commande, outil);
    if(faute){
      process.stderr.write(message(faute, commande));
      process.exitCode = 2;
    }
  }
}
