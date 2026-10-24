# Fiche App Store de Tome (brouillon)

Brouillon à relire avant de le coller dans App Store Connect. Sous chaque titre, le texte à coller ;
les lignes en citation (« > ») sont des notes, pas du texte à coller. Ce fichier est public :
aucun identifiant ni mot de passe ici. Guide complet : `APPLI-IOS.md`.

## Nom

Tome · Journal de lecture

> 25 caractères, pour une limite de 30. Si le nom est pris : « Tome : journal de lecture » ou
> « Tome, journal de lecture ». Jamais de tiret cadratin.

## Sous-titre

Livres, BD et mangas

> 20 caractères, pour une limite de 30.

## Texte promotionnel

Ton carnet de lecture pour les livres, les BD et les mangas : scanne un code-barres, note ta lecture et vois ce que lisent tes amis.

> Limite de 170 caractères. Il se change à tout moment, sans nouvelle version.

## Description

Tome est un carnet de lecture pour les livres, les BD et les mangas. Tu y gardes ce que tu as lu, quand, et ce que tu en as pensé.

Pour ajouter un livre, scanne le code-barres au dos ou cherche-le par son titre. La couverture et les informations du livre se remplissent d’elles-mêmes, et les tomes d’une même série sont regroupés.

Chaque lecture a sa fiche : une note en demi-étoiles, ta critique, des citations, l’ambiance du livre. Tu suis ta progression et ton objectif de l’année, et une rétrospective résume tes lectures en fin d’année.

Tes amis tiennent leur propre journal. Tu vois ce qu’ils choisissent de partager et tu peux leur répondre. Il n’y a pas de classement, et ton partage reste réglé sur « Rien » tant que tu ne l’ouvres pas.

Tu peux utiliser Tome sans compte : ta bibliothèque reste alors sur ton iPhone. Avec un compte, tu la retrouves sur tous tes appareils. Aucune adresse e-mail n’est demandée.

Ta bibliothèque reste consultable hors connexion. Tu peux l’importer depuis un fichier CSV et l’exporter à tout moment, en JSON ou en CSV, dans l’app Fichiers.

Pas de publicité, aucun traceur, et le cœur du service reste gratuit.

> Texte brut, sans mise en forme. Aucun nom d’autre app ni d’autre plateforme : Apple le refuse
> dans les métadonnées.

## Mots-clés

bibliothèque,carnet,critique,roman,ISBN,code-barres,étagère,bande dessinée,comics,citations

> 95 octets, pour une limite de 100 octets en UTF-8 : une lettre accentuée compte pour deux.
> Chaque mot-clé fait plus de deux caractères. Les mots du nom et du sous-titre comptent déjà :
> inutile de les répéter. Aucun nom d’app concurrente.

## Catégorie

Livres

> Catégorie secondaire facultative, à choisir par Lucas.

## Copyright

2026 Lucas Marroig

> Champ obligatoire des informations de version : l’année, puis le titulaire des droits. App
> Store Connect ajoute lui-même le symbole ©.

## Captures

> Trois à cinq captures, prises dans l’app réelle (version TestFlight) et montrant l’app en
> usage : jamais l’accueil ni l’écran de connexion (règle 2.3.3), jamais le site ouvert dans un
> navigateur.
>
> Case obligatoire : iPhone avec Dynamic Island, écran moyen (« medium display » dans les
> spécifications d’Apple), en 1179 x 2556 ou 1206 x 2622 : iPhone 14 Pro, 15, 15 Pro, 16, 16 Pro,
> 17, 17 Pro, 18 Pro. Les captures d’un Pro Max, d’un Plus ou d’un Air (1320 x 2868, 1290 x 2796,
> 1260 x 2736) sont réduites par App Store Connect : vérifier à l’envoi que la case moyenne est
> bien remplie. Celles d’un iPhone 13, 13 Pro, 14, 16e ou 17e (1170 x 2532 ou moins) ne la
> remplissent pas : emprunter un iPhone de la liste, ou porter les captures à 1179 x 2556.
>
> La capture `accueil.png` du job `fumee` d’`ios-verifier` montre l’accueil : elle sert au
> contrôle de la compilation, pas à l’App Store.
>
> Fichiers PNG ou JPEG sans canal alpha. Les prendre avec le compte de démonstration : aucun
> pseudo ni aucune critique d’une autre personne à l’écran.
>
> Idées, dans l’ordre : la bibliothèque avec ses couvertures ; la fiche d’un livre noté, avec sa
> critique ; le scanner de code-barres ; le fil des amis ; les statistiques de l’année.

## Notes de revue (en anglais)

> À coller dans App Store Connect, Informations de revue, Notes. Remplacer
> `[délai à confirmer par Lucas]` avant l’envoi. La modération décrite ici est celle de l’étape 14
> d’`APPLI-IOS.md` : n’y ajouter aucune promesse (suspension, filtre automatique) que Tome ne
> tient pas.

Tome is a reading journal for books, comics and manga. All of the app's web assets are bundled in the app: no remote code is loaded. The app calls its own API (https://montome.fr/api) for accounts and sync, and public book catalogues (Open Library, BnF, Google Books) for search and covers.

Native features:
- Barcode scanner (Apple Vision, on device) for ISBN codes when adding a book, and for the QR codes used to invite a friend.
- Library export (JSON or CSV) written to the Files app (On My iPhone > Tome), then offered in the share sheet.
- Native share sheet for reading cards (images, which can be saved to Photos) and book links.
- Full offline use: the library is stored on the device and the app opens without any network connection.
- Status bar that follows the light or dark theme.

Account deletion: avatar button at the top of the screen > "Mon compte" > "Suppression du compte" > "Supprimer définitivement mon compte". The account and all its server data are deleted at once.

Moderation of user-generated content:
- Users must accept the terms of use to create an account (required checkbox, also checked by the server). The terms forbid illegal content, harassment, hate, spam and impersonation, and abusive accounts are closed.
- Every review, reply and public profile has a Report button ("Signaler").
- Any user can be blocked ("Bloquer"). Blocking ends the friendship and removes the reactions and replies exchanged.
- Replies can only be posted under the readings of accepted friends, and the owner of a reading can delete any reply under it.
- Sharing is set to "Rien" (nothing) by default, and public pages are opt-in.
- Contact information is published on the privacy page (https://montome.fr/confidentialite).
- Reports are reviewed by the developer within [délai à confirmer par Lucas]. A reply that breaks the terms of use is deleted. When a review or a profile breaks them, the author's account is closed: the account and all of its content are deleted from the server.

Demo account: the sign-in details are in the "Sign-in required" fields of this submission. To reach the sign-in form, open the app and tap "Se connecter" at the top of the welcome screen.
