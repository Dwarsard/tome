# App iPhone de Tome : les gestes à faire

Ce guide donne, dans l’ordre, ce qui reste à faire à la main pour mettre l’app iPhone sur
l’App Store. Le code est sur la branche `appli-ios` des deux dépôts. Aucun Mac n’est nécessaire :
l’app se compile sur GitHub Actions, avec les workflows `ios-verifier` et `ios-testflight` de
`.github/workflows/`.

Ce dépôt est **public**. Aucun identifiant Apple (Team ID, Issuer ID, Key ID, identifiant
numérique de l’app), aucune clé, aucun mot de passe et aucune adresse ne s’écrit ici. Ces valeurs
vont dans les secrets et les variables de GitHub, et dans le gestionnaire de mots de passe.

L’étape 7 ne demande aucun compte Apple. Elle peut se faire dès que `appli-ios` est poussée, avant
de payer l’adhésion : la capture de l’app dit tout de suite si la compilation tient.

## Le dossier `appli/`

- `package.json` : Capacitor 8.5.3 et trois plugins (scanner, partage, fichiers), en versions
  exactes.
- `scripts/preparer-web.mjs` : copie les fichiers du site dans `www/` et adapte la copie
  d’`index.html` (CSP de l’app, pied de page). Les fichiers de la racine ne changent pas.
- `ios/` : le projet Xcode, avec Swift Package Manager (pas de CocoaPods).
- `test/` : les tests (`npm test`), dont ceux des workflows et de ce guide.

Commandes courantes, dans `appli/` :

```bash
npm ci              # dépendances, d'après package-lock.json
npm run web         # prépare www/
npx cap sync ios    # copie www/ dans le projet iOS et y déclare les plugins
npm test
```

Sous Windows, `npx cap sync ios` affiche des avertissements sur xcodebuild ou CocoaPods : c’est
normal. `npm run icones` ne sert que si `icon.svg` change ; il demande sharp, installé dans
`Tome-Social`.

## Étape 0 : mettre le serveur en ligne

L’app appelle l’API de `https://montome.fr` depuis l’origine `capacitor://localhost`. Tant que le
Worker en production n’accepte pas cette origine, l’app ne peut ni se connecter ni synchroniser.
Cette étape passe donc avant toute version TestFlight.

1. Relire les changements des deux dépôts (`git status`, `git diff`), committer, puis pousser
   `appli-ios`, dans chacun des deux dépôts. La branche n’existe pas encore sur GitHub : ce
   premier envoi la crée et la relie à la branche locale, pour que les `git push` suivants
   suffisent.

   ```bash
   git push -u origin appli-ios
   ```

2. Fusionner `appli-ios` dans `main` dans les **deux** dépôts, puis pousser `main`. La fusion se
   fait en avance rapide : `main` n’a aucun commit absent d’`appli-ios`. Elle met aussi
   `.github/workflows/ios-testflight.yml` sur la branche par défaut. Sans cela, le bouton
   « Run workflow » n’existe pas et `gh workflow run` échoue.

   ```bash
   git switch main
   git merge --ff-only appli-ios
   git push origin main
   ```

3. Déployer depuis `main` seulement, avec les deux dépôts sur `main` au moment du geste : le build
   copie l’état de travail de `Tome`, quelle que soit sa branche. Ce premier déploiement emporte
   aussi les lots 9 et 10 et les migrations 0006 et 0007, que la production n’a pas encore.
   Dans l’ordre :
   - contrôler l’état : ouvrir `https://montome.fr/sw.js`, lire la valeur de `CACHE` et la
     comparer à celle de `Tome/sw.js` ;
   - faire une sauvegarde de la base, puis `npm run migrate:remote`, puis `npm run deploy`, comme
     le décrivent les sections 1 et 3 d’`EXPLOITATION.md` (dépôt privé).
4. Contrôler le CORS. En PowerShell :

   ```powershell
   curl.exe -si -X OPTIONS https://montome.fr/api/me -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
   ```

   En Git Bash :

   ```bash
   curl -si -X OPTIONS https://montome.fr/api/me -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
   ```

   Attendu : un statut 204 et la ligne `access-control-allow-origin: capacitor://localhost`.
   Contre-épreuve avec `-H "Origin: https://exemple.invalid"` : aucune ligne
   `access-control-allow-origin` ne doit revenir. curl l’affiche `Access-Control-Allow-Origin` :
   la casse ne compte pas, ni ici ni dans la contre-épreuve. Une recherche dans la sortie
   (`findstr /i`, Ctrl+F) doit donc ignorer les majuscules.
5. Dans le tableau de bord Cloudflare, rubrique Security, vérifier qu’aucun défi ne s’applique à
   `/api/*` : ni Bot Fight Mode, ni règle WAF, ni mode « Under Attack ». Une page de défi arrive
   sans en-têtes CORS, et l’app la prend pour une panne réseau.

## Étapes 1 à 6 : comptes Apple et secrets GitHub

### Étape 1 : adhérer à l’Apple Developer Program

- S’inscrire sur https://developer.apple.com/programs/ en **individuel** : 99 USD par an, ou le
  montant affiché dans la devise locale.
- Le compte Apple doit avoir la double authentification.
- En individuel, le nom légal apparaît comme vendeur sur la page de l’app.
- La validation peut prendre quelques jours.

### Étape 2 : créer l’identifiant de l’app

Dans Certificates, Identifiers & Profiles, onglet Identifiers, bouton « + » : App IDs, puis App.
Description `Tome`, Bundle ID **explicite** `fr.montome.app`. Ne cocher aucune capacité, ni Push
Notifications ni Associated Domains.

### Étape 3 : créer la fiche dans App Store Connect

- Dans App Store Connect, Apps, bouton « + », Nouvelle app : plateforme iOS, nom
  `Tome · Journal de lecture` (variantes dans `FICHE-APP-STORE.md` si le nom est pris), langue
  principale Français, identifiant de bundle `fr.montome.app`, SKU libre (par exemple `tome-ios`).
- Ouvrir Informations sur l’app et lire l’identifiant Apple, un nombre. Ce n’est pas un secret,
  mais il ne s’écrit pas dans le dépôt : il va dans la variable GitHub `APP_STORE_APP_ID`
  (étape 6).

### Étape 4 : créer une clé d’API App Store Connect

- La première fois, l’accès à l’API se demande. Utilisateurs et accès, Intégrations, API App
  Store Connect : bouton Demander l’accès (Request Access), réservé au titulaire du compte.
  Accepter les conditions, envoyer, puis attendre l’accord d’Apple, donné au cas par cas. Le faire
  dès l’adhésion validée : l’étape 8 en dépend. Les clés d’équipe se créent ensuite.
- Utilisateurs et accès, Intégrations, API App Store Connect : créer une **clé d’équipe** (pas une
  clé individuelle), nommée `ci-tome`, avec l’accès **App Manager**.
- Noter l’Issuer ID, affiché en haut de la page, et le Key ID de la clé.
- Télécharger le fichier `AuthKey_<Key ID>.p8`. Apple ne le propose qu’une seule fois.
- Si l’étape « Certificat et profil » du workflow répond 403, la clé n’a pas assez de droits. En
  créer une au rôle Admin, remplacer les trois secrets `APP_STORE_CONNECT_*`, puis révoquer
  l’ancienne.

### Étape 5 : créer la clé privée du certificat

Sous Git Bash, dans un dossier hors des dépôts :

```bash
mkdir -p ~/tome-ios-cles && cd ~/tome-ios-cles && ssh-keygen -t rsa -b 2048 -m PEM -f ios_distribution_private_key -q -N ""
```

Le fichier `ios_distribution_private_key` entier, lignes de début et de fin comprises, devient le
secret `CERTIFICATE_PRIVATE_KEY`. Le workflow s’en sert pour créer le certificat de distribution au
premier passage, puis pour le retrouver aux suivants. Garder cette clé : sans elle, chaque passage
créerait un nouveau certificat, et Apple en limite le nombre. Le fichier `.pub` produit à côté ne
sert pas.

Déplacer aussi dans ce dossier le `.p8` téléchargé à l’étape 4.

### Étape 6 : créer l’environnement GitHub `testflight`

1. Sur GitHub, dépôt Tome, Settings, Environments, New environment : `testflight`. Dans
   Deployment branches and tags, choisir Selected branches and tags, puis ajouter `appli-ios` et
   `main`.
2. Poser les deux clés depuis leurs fichiers, sous Git Bash, dans le dossier du dépôt Tome (`gh`
   y trouve le dépôt) :

   ```bash
   gh secret set APP_STORE_CONNECT_PRIVATE_KEY --env testflight < ~/tome-ios-cles/AuthKey_*.p8
   gh secret set CERTIFICATE_PRIVATE_KEY --env testflight < ~/tome-ios-cles/ios_distribution_private_key
   ```

3. Poser les deux identifiants. Sans `<` ni `--body`, `gh` demande la valeur, qui ne reste pas
   dans l’historique du terminal. Si l’invite ne s’affiche pas dans Git Bash, lancer ces deux
   lignes dans PowerShell.

   ```bash
   gh secret set APP_STORE_CONNECT_ISSUER_ID --env testflight
   gh secret set APP_STORE_CONNECT_KEY_IDENTIFIER --env testflight
   ```

4. Poser la variable `APP_STORE_APP_ID`, qui n’est pas un secret, avec l’identifiant Apple lu à
   l’étape 3 :

   ```bash
   gh variable set APP_STORE_APP_ID --env testflight --body "<identifiant Apple de l'app>"
   ```

5. Contrôler : `gh secret list --env testflight` doit lister les quatre secrets, et
   `gh variable list --env testflight` la variable.
6. Ranger le `.p8` et `ios_distribution_private_key` dans le gestionnaire de mots de passe, en
   pièces jointes. Supprimer ensuite le dossier `~/tome-ios-cles` et la copie du `.p8` restée dans
   Téléchargements.
7. Avant chaque commit, relire `git status` : aucun fichier `.p8`, `.p12`, `.pem`, `.cer`,
   `.mobileprovision` ni `*private_key*` ne doit y figurer. Les `.gitignore` les écartent déjà ;
   la relecture reste la règle.

## Étape 7 : vérifier la compilation

- Le workflow `ios-verifier` part seul à chaque push sur `appli-ios` ou `main` qui touche l’app,
  et à la demande (Actions, ios-verifier, « Run workflow »). Il ne reçoit aucun secret.
- Le job `verifier` lance les tests, contrôle la copie embarquée (CSP, plugins) et compile en
  Release pour le simulateur.
- Le job `fumee` lance l’app dans un simulateur iPhone et publie l’artefact `fumee` : la capture
  `accueil.png` et les journaux.
- Ouvrir l’artefact `fumee` et **regarder la capture**. L’accueil de Tome doit s’afficher, pas un
  écran blanc. À faire avant de payer l’adhésion si possible. Cette capture montre l’accueil :
  elle ne sert pas à l’App Store (section Captures de `FICHE-APP-STORE.md`).
- Récupérer l’artefact `package-resolved` et versionner le fichier qu’il contient à
  `appli/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. Les
  versions des paquets Swift, dont capacitor-swift-pm et OSBarcodeLib, restent alors les mêmes
  d’une compilation à l’autre. Depuis le dossier du dépôt Tome :

  ```bash
  gh run list --workflow ios-verifier.yml --limit 3
  gh run download <ID du run> --name package-resolved --dir appli/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
  ```

  `<ID du run>` est le nombre de la colonne ID de `gh run list`, pas le numéro « #n » de l’onglet
  Actions. Commiter ce fichier sur `appli-ios` (`git switch appli-ios` d’abord) et pousser, puis
  refaire le point 2 de l’étape 0 (`git switch main`, `git merge --ff-only appli-ios`,
  `git push origin main`) : l’étape 8 compile depuis `main`, qui doit l’avoir aussi. Le workflow
  `ios-testflight` refuse de partir tant que la branche choisie n’a pas ce fichier.

## Étape 8 : envoyer une version sur TestFlight

- Actions, ios-testflight, « Run workflow », puis choisir la branche (`main` ou `appli-ios`). Ou,
  depuis le dossier du dépôt :

  ```bash
  gh workflow run ios-testflight.yml --ref main
  ```

- Depuis une autre branche, le job ne démarre pas. Il relance les tests, récupère ou crée le
  certificat et le profil, prend comme numéro de build le dernier numéro TestFlight plus un,
  compile, puis envoie l’IPA. Sans `Package.resolved` versionné (étape 7), ou si la variable
  `APP_STORE_APP_ID` est vide ou non numérique, il s’arrête avant toute étape à secret, sans rien
  signer ni envoyer. Si la compilation a résolu d’autres versions de paquets Swift que celles de
  `Package.resolved`, rien ne part sur TestFlight : le fichier est périmé, refaire l’étape 7.
- Apple traite ensuite la version (statut « Processing »). Elle apparaît dans l’onglet TestFlight
  d’App Store Connect après quelques minutes, parfois plus. Apple prévient par courriel en cas de
  problème.
- Le numéro de version affiché (`MARKETING_VERSION`, 1.0.0 au départ) se change dans
  `ios/App/App.xcodeproj/project.pbxproj` avant chaque nouvelle version publiée.

## Étape 9 : installer l’app avec TestFlight

Dans App Store Connect, ouvrir l’app, onglet TestFlight. Créer un groupe de **test interne**,
cocher la distribution automatique et s’y ajouter comme testeur. Installer TestFlight sur l’iPhone,
puis accepter l’invitation. Le test interne ne passe pas par la revue d’Apple.

## Étape 10 : liste de contrôle sur l’iPhone

- [ ] Premier lancement en mode avion : l’app s’affiche, puisque ses fichiers sont embarqués.
- [ ] Accueil compact : titre, « Créer mon compte gratuit », « Essayer d’abord » et pied de page.
- [ ] Inscription ou connexion, puis synchronisation : un livre ajouté sur le site apparaît dans
  l’app, et l’inverse.
- [ ] Scanner ISBN : refuser l’appareil photo une première fois (l’alerte doit être en français),
  l’autoriser ensuite dans Réglages › Tome, puis lire le code-barres d’un livre.
- [ ] QR d’ami dans les deux sens : l’app lit le QR d’un autre téléphone, et un autre téléphone lit
  celui de l’app.
- [ ] Carte de lecture : Partager, puis « Enregistrer l’image ». La demande d’accès aux photos est
  en français.
- [ ] Export JSON : le fichier apparaît dans Fichiers › Sur mon iPhone › Tome. Un second export
  le même jour donne un second fichier (`…-2.json`), le premier reste intact.
- [ ] Code de secours : « Enregistrer » écrit bien le fichier.
- [ ] Confidentialité et CGU, depuis le pied de page de l’accueil, s’ouvrent dans l’app.
- [ ] « Voir ma page publique » ouvre Safari.
- [ ] La barre d’état reste lisible en thème clair comme en thème sombre.
- [ ] « Acheter » ouvre Safari.
- [ ] La suppression du compte est accessible : Mon compte › Suppression du compte (à essayer sur
  un compte jetable).
- [ ] Aucune invite « Installer » n’apparaît.
- [ ] Diagnostic : Mon compte › Journal des versions › Diagnostic de l’app. Les plugins disent
  « oui » et le serveur est `https://montome.fr`.
- [ ] Si un iPad est disponible : l’app tourne en mode compatibilité (fenêtre d’iPhone), le scanner
  marche et la feuille de partage s’ouvre en popover.

## Étape 11 : à savoir

- La bibliothèque tenue dans Safari ne passe pas d’elle-même dans l’app, qui a son propre stockage.
  Elle passe par le compte (connexion dans l’app), ou par un export JSON dans Safari suivi d’un
  import dans l’app.
- Un courriel ITMS-91053 d’Apple signale une API sensible sans raison déclarée. Ajouter la raison
  qu’il indique à `ios/App/App/PrivacyInfo.xcprivacy`, puis envoyer une nouvelle version.
- Couper une fois la télémétrie de Capacitor sur le poste : `npx cap telemetry off`, dans `appli/`.
- Envoyer les versions depuis la CI, sur `macos-26`. Une IPA compilée sur un macOS bêta est refusée
  (ITMS-90111).
- Une version TestFlight expire au bout de 90 jours.

## Étape 12 : questionnaires d’App Store Connect

Les réponses ci-dessous découlent des mentions légales de l’app (`LEGAL_TEXT` dans `app.js`) et
des CGU (`TERMS_TEXT`). Elles disent la même chose que `ios/App/App/PrivacyInfo.xcprivacy` : si
l’un change, changer l’autre.

### Confidentialité de l’app (App Privacy)

Aucun pistage. Toutes les données servent au fonctionnement de l’app, sauf les clics sur les liens
d’achat (Analyse).

| Type chez Apple | Ce que Tome garde | Lié à la personne | Finalité | Phrase de `LEGAL_TEXT` |
|---|---|---|---|---|
| Identifiant utilisateur (User ID) | pseudo, identifiant de compte | oui | Fonctionnalité de l’app | « Données traitées : ton pseudo, ton nom affiché, ta bio […] » |
| Nom (Name) | nom affiché | oui | Fonctionnalité de l’app | la même phrase, « ton nom affiché » |
| Contacts | liens d’amitié, personnes bloquées | oui | Fonctionnalité de l’app | « tes liens d’amitié », « la liste des personnes que tu bloques » |
| Autre contenu de l’utilisateur (Other User Content) | critiques, réponses, bio, bibliothèque, listes, recommandations | oui | Fonctionnalité de l’app | « ta bibliothèque de lecture enregistrée sur ton compte », « tes réactions ♥ et tes réponses sous les lectures de tes amis », « les recommandations de livres que tu envoies ou reçois entre amis » |
| Assistance client (Customer Support) | avis et signalements envoyés depuis l’app, enregistrés avec le compte | oui | Fonctionnalité de l’app | aucune phrase pour l’instant (voir plus bas) |
| Autres types de données (Other Data Types) | adresse IP dans les compteurs anti-abus, effacée sous 48 h | non | Fonctionnalité de l’app (sécurité, prévention des abus) | « ton adresse IP (uniquement pour limiter les abus, effacée automatiquement sous 48 heures) » |
| Interaction avec le produit (Product Interaction) | clics sur les liens d’achat, comptés par jour, sans compte ni appareil | non | Analyse | aucune phrase pour l’instant (voir plus bas) |

L’adresse IP est déclarée parce qu’elle est gardée, même 48 h : Apple ne dispense que l’adresse
envoyée avec une requête et non conservée. Elle ne sert ni à localiser ni à identifier un
appareil, d’où « Autres types de données » plutôt qu’une localisation.

À ne pas déclarer, d’après les mêmes textes :

- Adresse e-mail : aucune n’est demandée (« aucun email n’étant collecté »).
- Historique de recherche : « le texte cherché sert à construire ces appels puis disparaît ».
- Notifications et rappel de lecture : réglés et coupés sur le site seulement, le réglage est
  caché dans l’app. L’app peut pourtant mettre à jour le titre de la lecture en cours d’un rappel
  déjà réglé sur le site : ce titre fait partie de la bibliothèque, déjà déclarée (Other User
  Content). L’heure et le fuseau horaire envoyés avec lui ne correspondent à aucun type de la
  liste d’Apple ; lecture à confirmer par Lucas. Dans l’app, « désactivable à tout moment dans
  Mon compte » (`LEGAL_TEXT`) ne vaut donc que pour le site.
- Diagnostics : l’app n’envoie ni rapport de plantage ni mesure de performance.

`LEGAL_TEXT` ne parle aujourd’hui ni des avis et signalements gardés avec le compte, ni du
compteur anonyme des clics sur les liens d’achat. La politique de confidentialité doit dire la même chose
que les réponses ci-dessus : ajouter ces deux points avant la soumission. Le texte est aussi celui du site,
donc le changement s’y verra : décision de Lucas.

### Classification par âge

L’app a des contenus écrits par les membres et des fonctions sociales (amis, réponses, pages
publiques). Le questionnaire devrait aboutir à 13+. Les CGU et les mentions légales visent les
15 ans et plus : déclarer ou non un âge plus élevé reste une décision de Lucas.

### Chiffrement

`ITSAppUsesNonExemptEncryption` vaut `false` dans `Info.plist`. L’app n’utilise que le HTTPS du
système, et App Store Connect ne repose plus la question à chaque version.

### Contenus de tiers

Les couvertures et les résumés viennent d’Open Library, de Google Books et de la BnF. Répondre
« oui » à la question sur les contenus de tiers, après avoir vérifié les conditions de chaque
service : à confirmer par Lucas.

### Statut de commerçant (DSA)

Pour l’Union européenne, App Store Connect demande si le compte est celui d’un commerçant au sens
du règlement sur les services numériques.

- Commerçant : Apple vérifie, puis publie sur la page de l’app, dans les 27 pays de l’Union, une
  adresse (un particulier peut donner une boîte postale), un téléphone et une adresse
  électronique. Apple demande aussi un justificatif récent du nom et de l’adresse, un document qui
  rattache à la boîte postale si elle remplace l’adresse (une facture, par exemple), et des
  coordonnées bancaires.
- Non commerçant : aucune coordonnée publiée, mais la page indique aux consommateurs de l’Union
  que le droit de la consommation ne s’applique pas à leurs contrats avec le développeur.

Tome est gratuit, sans publicité ni commission aujourd’hui. Décision de Lucas ; ce guide n’est pas
un avis juridique.

### Adresses

- Politique de confidentialité : `https://montome.fr/confidentialite`
- Assistance : `https://montome.fr/confidentialite`, qui donne le contact.

### Prix et disponibilité

Gratuit. Décocher la disponibilité sur Mac (Apple silicon) et sur Apple Vision Pro : l’app n’y a
pas été essayée.

## Étape 13 : compte de démonstration

Créer dans l’app un compte réservé à la revue d’Apple, avec quelques livres notés et un ami (un
second compte de test) pour montrer les fonctions sociales. Ses identifiants se saisissent
seulement dans App Store Connect, rubrique Informations de revue, connexion requise. Jamais dans ce
dépôt, jamais dans la fiche.

## Étape 14 : modération avant la soumission

Pour les apps où les membres publient des contenus (règle 1.2), Apple attend des conditions
d’utilisation acceptées par chacun, qui ne tolèrent ni contenus répréhensibles ni comportements
abusifs, un bouton pour signaler, un moyen de bloquer, un contact publié, et le retrait rapide
d’un contenu signalé avec l’exclusion de son auteur. Ce que Tome fait déjà, et que disent les
notes de revue de `FICHE-APP-STORE.md` :

- Conditions : la case « J’accepte […] les conditions d’utilisation » est obligatoire à
  l’inscription, et le serveur la contrôle. Les CGU (`TERMS_TEXT` dans `app.js`) interdisent les
  contenus illégaux, le harcèlement, la haine, le spam et l’usurpation d’identité.
- Signaler : un bouton « Signaler » sur chaque critique, réponse et profil public.
- Bloquer : le blocage met fin à l’amitié et efface les réactions et les réponses échangées.
- Réponses : réservées aux amis acceptés ; la personne qui tient la lecture peut retirer toute
  réponse écrite dessous.
- Contact : dans les mentions légales.

Ce qu’il reste à tenir :

- Choisir le délai de traitement des signalements à annoncer ; 24 h est l’usage attendu par Apple.
  Remplacer `[délai à confirmer par Lucas]` dans `FICHE-APP-STORE.md`.
- Consulter les signalements chaque jour : `npm run reports` dans `Tome-Social`, avec un rappel
  personnel.
- Traiter un signalement fondé comme le décrit la section 12 d’`EXPLOITATION.md` (dépôt privé),
  sur les signalements et la modération. Une réponse se retire pour de bon : la synchronisation ne
  la renvoie pas. Une critique, non : retirée à la main dans la base, elle revient à la
  synchronisation suivante de son auteur, et un nom ou une présentation se réécrit à tout moment.
  La mesure durable est alors la fermeture du compte, par le script `npm run fermer-compte` de
  `Tome-Social`, qui efface le compte et tout son contenu du serveur. Ce n’est pas un bannissement : la personne peut se réinscrire.
- Les CGU parlent aussi de suspendre un compte, mais Tome n’a pas de suspension. Les notes de revue
  n’en promettent donc pas ; ne l’y écrire qu’une fois une vraie suspension en place, contrôlée à
  la connexion et à chaque synchronisation.
- Si 24 h est retenu, envisager d’aligner la phrase « examinés rapidement » des CGU (`TERMS_TEXT`
  dans `app.js`). Ce changement se voit aussi sur le site : décision de Lucas.

Cette version n’a pas de filtre automatique des contenus (reporté, décision éditoriale). La revue
peut le relever au titre de la même règle.

## Étape 15 : soumettre

1. Remplir la fiche d’après `FICHE-APP-STORE.md` : nom, sous-titre, texte promotionnel,
   description, mots-clés, catégorie, copyright et captures.
2. Informations de revue : le compte de démonstration (étape 13), les notes en anglais de la fiche
   et un contact pour la revue.
3. Choisir la build TestFlight contrôlée à l’étape 10.
4. Choisir la publication manuelle, pour fixer soi-même le jour de sortie une fois l’app acceptée.
5. Envoyer en revue.

## Étape 16 : maintenance

- Les versions installées restent en circulation des mois, sans bandeau de mise à jour. L’API doit
  rester compatible avec elles : ne pas retirer ni renommer un champ de réponse, ne pas rendre
  obligatoire un nouveau champ de requête, donner à tout nouveau refus un `error` lisible (section
  12 d’`EXPLOITATION.md`).
- Un changement du front (`app.js`, `app.css`, `index.html`…) n’arrive dans l’app qu’avec une
  nouvelle version : TestFlight (étape 8), puis soumission. Monter `MARKETING_VERSION` à chaque
  version publiée.
- Pour demander une mise à jour aux personnes connectées, `ANNOUNCE_TEXT` suffit ; il touche aussi
  le site.
- Retour arrière : une version installée ne se retire pas des iPhone. Un retour du Worker à une
  version antérieure à l’ouverture CORS coupe toute l’app (sections 2 et 12
  d’`EXPLOITATION.md`). Côté App Store, retirer l’app de la vente ou publier une version corrigée.
