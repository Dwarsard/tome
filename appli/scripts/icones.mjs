// Icône et écran de lancement de l'app iPhone, générés UNE FOIS sous Windows puis versionnés.
// Ne tourne jamais en CI : sharp n'est pas une dépendance d'appli/, il est chargé par chemin
// depuis Tome-Social (ou TOME_SHARP). Source : ../icon.svg (racine de Tome), sans les coins
// arrondis (iOS applique son propre masque). Sorties en RGB sans alpha (exigé pour l'icône).
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const APPLI = join(ICI, '..');
const FOND = '#15120d';
const ICONE = join(APPLI, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
const SPLASHS = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']
  .map(f => join(APPLI, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset', f));
const COTE_LANCEMENT = 2732;
const LARGEUR_LIVRE = 560;   // largeur du livre trait compris, en pixels de l'image de lancement

function chargerSharp(){
  const chemin = process.env.TOME_SHARP || join(ICI, '..', '..', '..', 'Tome-Social', 'node_modules', 'sharp');
  if(!existsSync(chemin)) throw new Error(`icones : sharp introuvable (${chemin}). Indiquer son dossier dans TOME_SHARP.`);
  return createRequire(import.meta.url)(chemin);
}

// Icône plein cadre : le carré de fond sans rx, iOS arrondit lui-même.
export function svgIcone(svg){
  if(!svg.includes(' rx="110"')) throw new Error('icones : rx="110" introuvable dans icon.svg');
  return svg.replace(' rx="110"', '');
}

// Lancement : le livre seul (les deux tracés d'icon.svg), centré sur un carré de fond uni.
export function svgLancement(svg){
  const traces = svg.match(/<path\b[^>]*\/>/g) || [];
  if(traces.length !== 2) throw new Error('icones : icon.svg doit contenir exactement deux tracés');
  // Le livre occupe x 110..402 dans le repère 512, plus 30 de trait ; trait compris, y va de 96 à 402.
  const echelle = LARGEUR_LIVRE / (402 - 110 + 30);
  const c = COTE_LANCEMENT / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COTE_LANCEMENT}" height="${COTE_LANCEMENT}" viewBox="0 0 ${COTE_LANCEMENT} ${COTE_LANCEMENT}">`
    + `<rect width="${COTE_LANCEMENT}" height="${COTE_LANCEMENT}" fill="${FOND}"/>`
    + `<g transform="translate(${c} ${c}) scale(${echelle.toFixed(5)}) translate(-256 -249)">${traces.join('')}</g></svg>`;
}

async function main(){
  const sharp = chargerSharp();
  const source = readFileSync(join(APPLI, '..', 'icon.svg'), 'utf8');
  await sharp(Buffer.from(svgIcone(source)), { density: 1024 / 512 * 72 })
    .resize(1024, 1024)
    .flatten({ background: FOND })
    .removeAlpha()
    .png()
    .toFile(ICONE);
  const lancement = await sharp(Buffer.from(svgLancement(source)))
    .flatten({ background: FOND })
    .removeAlpha()
    .png()
    .toBuffer();
  for(const f of SPLASHS) await sharp(lancement).png().toFile(f);
  console.log('icones : AppIcon-512@2x.png (1024×1024) et trois images de lancement (2732×2732) écrites.');
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
