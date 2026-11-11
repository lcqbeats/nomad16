# NOMAD-16

Sampler, looper, effets, digging et ampli guitare de poche pour Akai MPK Mini, dans le navigateur.
Usage personnel. Ouvrir dans MIDIWeb Browser sur iPhone : https://lcqbeats.github.io/nomad16/

Sons des kits : voir [kits/CREDITS.md](kits/CREDITS.md) (Virtuosity Drums, CC0, et sons synthétisés).

Bac à disques (onglet DIGGING) : extraits de la Bibliothèque du Congrès via Citizen DJ (https://citizen-dj.labs.loc.gov), chargés directement depuis leurs serveurs. Index : crate/crate.json.

Instruments de l'onglet SONS : échantillons libres (VCSL CC0, Splendid Grand Piano domaine public, D. Smolken CC0, Greg Sullivan CC BY 3.0, J. Learman jRhodes3d), hébergés par https://danigb.github.io/samples et chargés à la demande. Index : sons/instruments.json.

## Contrôles Akai (preset 3)

- Bank 1 (CC 20–27) : play/stop du looper, undo, mute des pistes 1 à 6.
- Bank 2 (CC 28–35) : kit précédent, kit suivant, lecture/arrêt du morceau (SONG), séquence précédente, note repeat, séquence suivante, onglet suivant, entrée guitare.

## Onglet SCRATCH

Platine tactile : le doigt posé sur le disque l'arrête et le fait tourner, en avant comme en arrière ; le son tourne en sillon fermé. Fader de coupure (zone rouge = coupé, HAMSTER inverse), boutons OUVRE / COUPE à maintenir, six phrases calées sur le tempo (baby, chirp, transform, flare, tear, stab). Sources : banque intégrée (voyelles et sons synthétisés, voix de la Bibliothèque du Congrès), bac VOIX, pads, chops de DIGGING, pistes du looper, et vos propres fichiers (gardés dans l'appareil). Tout passe dans le looper.

Akai dans SCRATCH (pads tenus) : banque A — pad 1 arrière, pad 5 avant (vitesse selon la frappe), pad 2 ouvre, pad 3 coupe, pads 4, 6, 7, 8 phrases baby, chirp, transform, flare ; banque B — 9 tear, 10 stab, 11 start/stop, 12 repère, 13 à 16 CUE 1 à 4 (frappe : poser/rappeler, tenu : effacer). Le clavier transpose le disque. Potards : volume, pitch, filtre, démarrage, freinage, coupure, main (déplace le disque), fader.

## Version LITE pour vieux iPad (iOS 9)

`ios9.html` : version très légère écrite à part (pads, kits, filtre, écho, pitch, full level), sans looper ni animations.
Elle ne suit pas index.html et n'est mise à jour que sur demande. À ouvrir dans Web MIDI Browser : https://lcqbeats.github.io/nomad16/ios9.html
Sous iOS 9, installer d'abord le certificat racine Let's Encrypt depuis Safari : http://x1.i.lencr.org/
