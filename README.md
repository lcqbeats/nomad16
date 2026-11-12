# NOMAD-16

Sampler, looper, effets, digging et ampli guitare de poche pour Akai MPK Mini, dans le navigateur.
Usage personnel. Ouvrir dans MIDIWeb Browser sur iPhone : https://lcqbeats.github.io/nomad16/

Sons des kits : voir [kits/CREDITS.md](kits/CREDITS.md) (Virtuosity Drums, CC0, et sons synthétisés).

Bac à disques (onglet DIGGING) : extraits de la Bibliothèque du Congrès via Citizen DJ (https://citizen-dj.labs.loc.gov), chargés directement depuis leurs serveurs. Index : crate/crate.json.

Instruments de l'onglet SONS : échantillons libres (VCSL CC0, Splendid Grand Piano domaine public, D. Smolken CC0, Greg Sullivan CC BY 3.0, J. Learman jRhodes3d), hébergés par https://danigb.github.io/samples et chargés à la demande. Index : sons/instruments.json.

## Contrôles Akai (preset 3)

- Bank 1 (CC 20–27) : play/stop du looper, undo, mute des pistes 1 à 6.
- Bank 2 (CC 28–35) : kit précédent, kit suivant, lecture/arrêt du morceau (SONG), séquence précédente, note repeat, séquence suivante, onglet suivant, entrée guitare (ouvre aussi l'onglet GUITARE).
- PROG CHANGE : banque A = onglets (1 PADS, 2 LOOPER, 3 SONG, 4 FX, 5 SP, 6 DIGGING, 7 SCRATCH, 8 SONS), banque B = kits 1 à 8.

## Longueur des pistes (LOOPER)

PROCHAINE : ×1, ×2, ×4 ou ÷2 (aussi au potard 8 du LOOPER) fixe la longueur de la prochaine piste ; pendant un REC, chaque nouvel appui rallonge encore d'un tour. PISTE n choisit une piste existante (la dernière par défaut) : ÷2 garde la moitié qui joue en ce moment, ×2 la répète pour la doubler. Tout s'annule avec ↶.

## Onglet SCRATCH

Platine tactile : le doigt posé sur le disque l'arrête et le fait tourner, en avant comme en arrière ; le son tourne en sillon fermé. Fader de coupure (zone rouge = coupé, HAMSTER inverse), boutons OUVRE / COUPE à maintenir, six phrases calées sur le tempo (baby, chirp, transform, flare, tear, stab). Sources : banque intégrée (voyelles et sons synthétisés, voix de la Bibliothèque du Congrès), bac VOIX, pads, chops de DIGGING, pistes du looper, et vos propres fichiers (gardés dans l'appareil). Tout passe dans le looper.

Akai dans SCRATCH : banque A — pad 1 arrière, pad 5 avant (vitesse selon la frappe, reprise immédiate au lâcher si le moteur tourne), 2 ouvre, 3 coupe, 4 start/stop, 6-7-8 CUE 1 à 3 ; banque B — 9-10-11 et 13-14-15 phrases (baby, chirp, transform, flare, tear, stab), 12 repère précédent, 16 repère suivant. Le clavier transpose le disque. Potards : volume, pitch, filtre, démarrage, freinage, coupure, main (déplace le disque), fader.

## Version LITE pour vieux iPad (iOS 9)

`ios9.html` : version très légère écrite à part (pads, kits, filtre, écho, pitch, full level), sans looper ni animations.
Elle ne suit pas index.html et n'est mise à jour que sur demande. À ouvrir dans Web MIDI Browser : https://lcqbeats.github.io/nomad16/ios9.html
Sous iOS 9, installer d'abord le certificat racine Let's Encrypt depuis Safari : http://x1.i.lencr.org/

## Hors ligne, sauvegardes, export MPC

L'app et les kits restent dans l'appareil (service worker) : NOMAD démarre sans réseau. La session s'enregistre toute seule (« SESSION AUTO ») et se reprend depuis l'accueil ; RÉGLAGES propose une sauvegarde complète en un fichier .nomad. L'export MULTIPISTE + MPC contient, pour chaque séquence, les WAV, un programme .xpm et un fichier .mid des notes jouées (pads sur le canal 10 avec les notes des pads de la MPC, clavier sur le canal 1).

## Sur ordinateur

Sur un grand écran avec souris, NOMAD passe tout seul en paysage, dans l'esprit d'une MPC 1000 noire : écran, touches de mode et potards à gauche, pads à droite. Les touches & é " ' ( § è ! ç de la rangée du haut (clavier AZERTY, sans Maj), ou F1 à F9, changent d'onglet, dans l'ordre de la grille 3×3 : PADS, LOOPER, SONS / DIGGING, SCRATCH, GUITARE / FX, SP, SONG. RÉGLAGES → AFFICHAGE permet de forcer la mise en page téléphone ou ordinateur. Dans Chrome, l'Akai branché en USB fonctionne directement.

## Nouveautés sons

- SONS : famille 20SYL (12 sons de synthèse dans l'esprit de 20syl) et 14 préréglages d'effets (DREAMY, CASSETTE, SOUL 70s, RADIO, TÉLÉPHONE, SOUS L'EAU, DUB, PING-PONG, SHIMMER, CRUNCH, WOBBLE, TRÉMOLO, TRÈS PROCHE, LOINTAIN).
- Kits J DILLA, RZA, PETE ROCK, DAMU THE FUDGEMUNK : batterie CC0 (Virtuosity Drums) traitée dans l'esprit de chacun.
- SONG : mastering automatique (NATUREL, CHAUD, CLAIR, PUNCH, LO-FI ; STREAMING -14, FORT -9, DOUX -18 LUFS), appliqué aux exports WAV du morceau, de la séquence et de la session. L'export multipiste + MPC reste brut.

## Pour modifier NOMAD

Le code est rangé dans `src/` : `shell.html` (la page), `style.css`, et `js/` en morceaux numérotés, collés bout à bout dans l'ordre.
Après une modification : `python3 tools/build.py` reconstruit `index.html` (la page publiée, à ne pas modifier à la main).
Tests dans un navigateur : `pip install pytest playwright && python -m playwright install chromium`, puis `python -m pytest tests -q`.
Ils tournent aussi tout seuls sur GitHub à chaque envoi (onglet Actions).
