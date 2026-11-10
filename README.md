# NOMAD-16

Sampler, looper, effets, digging et ampli guitare de poche pour Akai MPK Mini, dans le navigateur.
Usage personnel. Ouvrir dans MIDIWeb Browser sur iPhone : https://lcqbeats.github.io/nomad16/

Sons des kits : voir [kits/CREDITS.md](kits/CREDITS.md) (Virtuosity Drums, CC0, et sons synthétisés).

Bac à disques (onglet DIGGING) : extraits de la Bibliothèque du Congrès via Citizen DJ (https://citizen-dj.labs.loc.gov), chargés directement depuis leurs serveurs. Index : crate/crate.json.

Instruments de l'onglet SONS : échantillons libres (VCSL CC0, Splendid Grand Piano domaine public, D. Smolken CC0, Greg Sullivan CC BY 3.0, J. Learman jRhodes3d), hébergés par https://danigb.github.io/samples et chargés à la demande. Index : sons/instruments.json.

## Contrôles Akai (preset 3)

- Bank 1 (CC 20–27) : play/stop du looper, undo, mute des pistes 1 à 6.
- Bank 2 (CC 28–35) : kit précédent, kit suivant, lecture/arrêt du morceau (SONG), séquence précédente, note repeat, séquence suivante, onglet suivant, entrée guitare.

## Version iOS 9 (vieux iPad)

`ios9.html` est générée automatiquement à partir de `index.html` (JavaScript converti, grilles en flexbox, cales Web Audio) :
`cd tools/ios9 && npm install && node build.mjs ../..`. À ouvrir dans Web MIDI Browser : https://lcqbeats.github.io/nomad16/ios9.html
Sous iOS 9, installer d'abord le certificat racine Let's Encrypt depuis Safari : http://x1.i.lencr.org/
