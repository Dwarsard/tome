# Tome — identité & rituel de release

*Référence issue du dossier de recherche « anti-look-IA » (vérifié à la source, 29/08/2026).
L'identité s'appelle **Ex-Libris** (clair) / **Reliure** (sombre).*

## L'identité en cinq lignes

- **Typo** : Fraunces (titres, axe WONK sur les grands corps) + Newsreader (prose de lecture). Auto-hébergées dans `fonts/` — jamais de CDN, jamais Inter/Roboto/Space Grotesk.
- **Couleurs** : clair = encre `#231d16` + rouge sang `#9c332a` sur ivoire froid `#e9e4d8` ; sombre = dorure `#cba351` sur noir chaud `#15120d`. Le token s'appelle `--green` (historique) mais sa valeur est encre/or.
- **Encres** : placeholders, avatars et pastilles puisent dans les palettes `PH_INKS` / `AVATAR_INKS` — jamais de teinte HSL aléatoire.
- **Matière** : grain de papier (`body::before`), tranches de pages (`--page`/`--page-edge`), filets d'imprimeur, tramage Bayer sur les cartes de partage.
- **Motion** : UNE signature (`bookopen`, la fiche s'ouvre du dos, 260 ms) — tout le reste < 300 ms, easing sortant, `reduced-motion` coupe tout.

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
