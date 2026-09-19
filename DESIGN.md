# Tome — identité & rituel de release

*Référence issue du dossier de recherche « anti-look-IA » (vérifié à la source, 29/08/2026).
L'identité s'appelle **Fiche de bibliothèque** (clair) / **Reliure** (sombre).*

## L'identité en cinq lignes

- **Typo** : **Alegreya** pour ce qui se lit (une famille dessinée pour la littérature, au rythme calligraphique), titres de page en *italique* 500, texte 400 ; **Alegreya Sans** pour ce qui s'actionne et se compte. Auto-hébergées dans `fonts/` (Alegreya variable, latin + latin-ext, romain + italique ; Alegreya Sans 400/500/700) — jamais de CDN, jamais Inter/Roboto/Space Grotesk. Historique : Fraunces/Newsreader puis EB Garamond + Plex Mono ont été abandonnées (20/09/2026) après le reproche d'un lecteur, « ça manque d'âme, ça fait IA » : le couple serif italique + mono en capitales espacées était devenu la signature des interfaces générées.
- **Couleurs** : clair = encre `#141311` + **bleu de tampon** `#2b4c8c` sur papier blanc `#f7f6f2` (le rouge `#b8322b` ne sert qu'aux tampons et alertes) ; sombre = dorure `#cba351` sur noir chaud `#15120d`. Le token s'appelle `--green` (historique) mais sa valeur est bleu/or. JAMAIS crème + terracotta : c'est le défaut de tous les générateurs et de la moitié des sites de 2026.
- **Sans** : Alegreya Sans porte TOUT ce qui est chiffre, date, libellé et contrôle (titre courant, folio, kickers, tuiles de stats, progression, boutons, onglets). Le jeton s'appelle toujours `--font-mono` (historique, comme `--green`). Elle n'a pas de graisse 600 : 500 pour les contrôles, 700 pour l'action principale et l'état actif ; chiffres alignés (`lining-nums tabular-nums`) dans les données, elzéviriens dans le texte. Plex Mono ne reste que pour les codes à recopier (`--font-code`).
- **Filets, pas de boîtes** : une vue se compose comme une page (titre courant, filet `--rule`, marginalia). Panneaux, carte de connexion, barre « moi », lignes du fil, résultats de recherche et passages se posent sur un filet, sans fond ni bordure ; les puces sont des mots soulignés, plus des pilules ; les champs sont une ligne d'écriture ; les boutons ont 2 px de rayon. Seules les surfaces qui flottent (modale, toast, bandeaux, menus) gardent un cadre. Interdits : la barre d'accent à gauche sur fond teinté, la pilule, les rayons de 8 px et plus codés en dur.
- **Zéro emoji** : glyphes typographiques seulement (♥ ★ ❝ ✓ ✦) et le fleuron d'imprimeur ❦ dans les états vides. Un emoji change de dessin selon l'appareil et signe le gabarit.
- **Encres** : placeholders, avatars et pastilles puisent dans les palettes `PH_INKS` / `AVATAR_INKS` — jamais de teinte HSL aléatoire.
- **Matière** : grain de papier (`body::before`), tranches de pages (`--page`/`--page-edge`), filets d'imprimeur, tramage Bayer sur les cartes de partage.
- **Motion** : UNE signature (`bookopen`, la fiche s'ouvre du dos, 260 ms) — tout le reste < 300 ms, easing sortant, `reduced-motion` coupe tout.

## La voix (micro-copie)

Tome tutoie, parle à une personne et non à « l'utilisateur », et dit quoi faire plutôt que ce qui a échoué. Les règles qui évitent de réécrire dix fois la même phrase :

- **Épicène sans point médian** : jamais « auteur·e », « prévenu·e », « seul(e) », « le/la ». On tourne la phrase autrement — « Auteurs et autrices », « Recevoir une alerte », « visible de toi uniquement », « Plume de l'année », « Cette personne », « Sois la première personne à répondre ». Le point médian casse la lecture à voix haute et les lecteurs d'écran.
- **Pluriels par `plur(n, 'livre')`** (ou `plur(n, 'livre existe', 'livres existent')` quand le verbe s'accorde) : plus de « titre(s) » ni de `${n>1?'s':''}` en clair. `fmtPct(42)` → « 42 % », `fmtRatio(3, 10)` → « 3 / 10 », `fmtDec(3.5)` → « 3,5 » — espaces insécables comprises.
- **Typographie française dans le code aussi** : espace insécable (U+00A0) avant `? ! :` et à l'intérieur des guillemets « », apostrophe typographique ’, jamais de « 42% » collé. `frTypo()` s'occupe des textes saisis ; les chaînes de l'interface s'écrivent directement avec les bons caractères (le selftest le vérifie sur `SEARCH_HINT`).
- **Une seule voix pour le réseau** : toute erreur d'`api()` passe par `netMsg(e)` — « Pas de connexion — réessaie quand le réseau sera revenu. », « Trop de demandes d'un coup — attends une minute. », « Tome a un souci de son côté, réessaie dans un instant. » Pas de « Serveur injoignable » ni de « Erreur 503 ».
- **Libellés qui disent l'action, pas la technique** : « Ajout manuel » plutôt que « Manuel », « Scanner », « Compléter… » plutôt que « Détails », « Mémoriser » plutôt que « ＋ Filtre », « Importer depuis Goodreads, StoryGraph ou Babelio » plutôt que « Importer un CSV », « Texte (.md) » plutôt que « Markdown », « Suppression du compte » plutôt que « Zone danger », « à réconcilier » plutôt que « conflit-sync ».
- **Le geste réellement disponible** : sur écran tactile (`pointer:coarse`), pas de « Appuie sur Espace » ni de « clique ici » — « Touche la carte », une flèche →.
- **Bandeaux courts** : deux phrases à l'écran, le détail derrière un « Comment ça marche ? » qui ouvre une modale.

## Checklist avant chaque release (le rituel)

La structure trahit plus que la teinte. Vérifier qu'aucune nouvelle surface n'introduit :

- [ ] hero centré avec badge-pilule au-dessus du titre
- [ ] rangée de 3 cartes « features » à icône
- [ ] étapes numérotées 01 / 02 / 03
- [ ] étiquettes TOUT-EN-CAPITALES hors petites capitales de métadonnées
- [ ] emoji utilisé comme icône (SVG au trait uniquement)
- [ ] fondu-au-scroll uniforme, lueur néon, ✨
- [ ] dégradé bleu→violet, crème+terracotta mou (le rouge est SANG, pas terracotta)
- [ ] police ou script chargé depuis un CDN (CSP `script-src 'self'` non négociable)

Puis les deux tests :

1. **Test des logos cachés** — ouvrir Tome à côté de Goodreads, Babelio et StoryGraph, masquer les logos : si on ne reconnaît pas Tome immédiatement, la nouveauté a dilué l'identité.
2. **Test de la voix** — lire les nouveaux textes à voix haute : « Lucas dirait-il ça ? » Les états vides, erreurs et 404 ont une voix, pas un constat administratif.

Outil externe optionnel : `slopcop.adriankrebs.ch` (scanner open source des motifs slop).

## Les trois pièges (ne pas « améliorer » dans ces directions)

1. **Réchauffer la palette vers la crème générique** — pousser les singularités, pas la température.
2. **Le spectaculaire façon Awwwards** — calme à 95 %, mémorable sur UN geste.
3. **La modernisation qui lisse** — corriger les frictions réelles, jamais raboter les bizarreries identitaires (leçon Letterboxd : l'incohérence aimée bat le propre oubliable).
