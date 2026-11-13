# NOMAD-16

Sampler, looper, effets, digging et ampli guitare de poche pour Akai MPK Mini, dans le navigateur.
Usage personnel. Ouvrir dans MIDIWeb Browser sur iPhone : https://lcqbeats.github.io/nomad16/

Sons des kits : voir [kits/CREDITS.md](kits/CREDITS.md) (Virtuosity Drums, CC0, et sons synthétisés).

Bac à disques (onglet DIGGING) : extraits de la Bibliothèque du Congrès via Citizen DJ (https://citizen-dj.labs.loc.gov), chargés directement depuis leurs serveurs. Index : crate/crate.json.

Instruments de l'onglet SONS : échantillons libres (VCSL CC0, Splendid Grand Piano domaine public, D. Smolken CC0, Greg Sullivan CC BY 3.0, J. Learman jRhodes3d), hébergés par https://danigb.github.io/samples et chargés à la demande. Index : sons/instruments.json.

## Contrôles Akai (preset 3)

- Bank 1 (CC 20–27) : play/stop du looper, undo, mute des pistes 1 à 6.
- LOOPER (pads en notes) : rangée du haut = pistes 1 à 3, rangée du bas = pistes 4 à 6, comme à l'écran — banque A : pads 5-6-7 muet pistes 1-2-3, pads 1-2-3 muet pistes 4-5-6, 4 tout couper, 8 tout rétablir ; banque B : pads 13-14-15 et 9-10-11 = solos, 12 tape stop, 16 lecture.
- Bank 2 (CC 28–35) : kit précédent, kit suivant, lecture/arrêt du morceau (SONG), bank précédente, note repeat, bank suivante, onglet suivant, entrée guitare (ouvre aussi l'onglet GUITARE).
- PROG CHANGE, dans l'ordre des onglets (le numéro est écrit sous chaque onglet sur iPhone) : banque A = 1 PADS, 2 LOOPER, 3 SONS, 4 DIGGING, 5 SCRATCH, 6 GUITARE, 7 FX, 8 SP ; banque B = kits J DILLA, RZA, PETE ROCK, DAMU THE FUDGEMUNK, LO-FI CASSETTE, BOOM BAP 93, DUB STATION, ACOUSTIQUE (SONG n'a pas de raccourci).
- FX : 32 motifs sur deux pages (1–16 classiques, 17–32 plus élaborés : POLY 3, SHUFFLE, ECHO ROLL, VINYL BRAKE, BACKSPIN, TRANSFORM, CHIRPS, HALF CHOP, DUB STAB, GLITCH, BABY SCRATCH, BREAKDOWN…), chacun avec son petit graphique ; bouton MOTIFS ⇄ ou DO# du clavier pour changer de page.
- FX : les 8 premières touches blanches du clavier (do à do) choisissent la cible : TOUT, LIVE, P1 à P6 ; les autres touches jouent SONS. Sur une piste, Sustain (ou ● IMPRIMER) grave les effets FX sur cette piste pendant un tour, en temps réel, comme dans SP.
- Tonalité : l'écran affiche la tonalité estimée des boucles du looper (ex. « · Am » après le tempo) ; DIGGING affiche celle de l'extrait ; dans SONS (mode ACCORDS), CALER SUR LA BOUCLE règle les accords dessus (relative si le style est d'un autre mode).
- SONS : collections 20SYL, FKJ (rhodes, wurli, guitares, lead sax…), DUB (mélodica, basse dub, skank, bubble, cuivres, sirène, syndrum…) et LO-FI (piano cassette, rhodes usé, nappe VHS, kalimba, chip…) en tête de liste.
- SONS : PIANO À L'ÉCRAN ouvre un clavier collé en bas (2 octaves sur iPhone, 3 sur ordinateur, glissé d'une touche à l'autre, octaves ◀ ▶) pour jouer des notes seules sans le MPK.
- SONS : potard 6 = dose de l'effet (à fond = effet plein), potard 7 = attaque, potard 8 = strum ; la tonalité et le style se règlent en mode ACCORDS. SIDECHAIN (léger / fort) creuse SONS à chaque kick de la boucle ou des pads, comme le Mother Ducker de la MPC.

## Table de mixage

MIX (en haut) : 6 tranches pour les boucles de la bank choisie (sélecteur A / B / C en haut de la table) (volume, panoramique, BAS = coupe-bas 120 Hz, muet, solo) et les voies générales (PADS, SONS, GUITARE, BOUCLES, MASTER). Presets : AUTO (écoute les boucles : niveaux rapprochés, boucles graves au centre, les autres écartées à gauche et à droite, coupe-bas là où il n'y a pas de basses), À PLAT, LARGE, ÉTROIT. Panoramique et coupe-bas sont gardés dans le projet, les prises et les exports.

## Guitare → basse

8 presets BASSE (BOOM BAP, DUB, NÉO SOUL, FUNK, LO-FI, FKJ, SALE, JAZZ) sur l'ampli BASSE 300. La pédale OCT −1 (octaveur façon pédale analogique) descend la guitare d'une octave pour jouer des lignes de basse, une note à la fois ; avec une vraie basse, éteignez OCT −1.

## Banks A, B, C (LOOPER)

Trois banks de 6 pistes, qui jouent **ensemble** (18 pistes au plus, tempo commun). La bank affichée (BANK A / B / C en haut du LOOPER, ou do, ré, mi du clavier de l'Akai dans le LOOPER) est celle que commandent l'écran, REC, les pads de muet / solo / tout couper / tout rétablir, les potards, FX et SP (P1 à P6) et la table de mixage. Changer de bank n'arrête rien. Sous chaque lettre : pistes audibles / pistes. Glisser une bank sur une autre la copie (pistes coupées, pour ne pas doubler le son). Les anciens projets à séquences A à H sont convertis à l'ouverture : les séquences remplies vont dans A, B, C (3 au plus), celle qui jouait reste audible, les autres sont coupées, et le morceau devient des prises.

## Prises (LOOPER → SONG)

● ARMER UNE PRISE (LOOPER), choisir les pistes de départ, puis PLAY : la prise commence (si les boucles tournent déjà, elle commence tout de suite, depuis le début du tour en cours). Tout ce qu'on coupe, rétablit, met en solo, sur n'importe quelle bank, est retenu à l'instant près. STOP termine (fin calée sur le tour le plus proche) : la prise devient UNE ligne de SONG (« PRISE 1 · 2:47 »), sans limite de durée ; une nouvelle prise ajoute la ligne suivante. La prise ne contient aucun son, seulement les gestes : elle se rejoue sur les boucles telles qu'elles sont (une boucle retouchée plus tard en profite). PRISE → WAV rend la dernière prise ; l'export MPC met chaque piste de chaque prise dans un dossier Prise_n.

## Longueur des pistes (LOOPER)

PROCHAINE : ×1, ×2, ×4 ou ÷2 (aussi au potard 8 du LOOPER) fixe la longueur de la prochaine piste ; pendant un REC, chaque nouvel appui rallonge encore d'un tour. PISTE n choisit une piste existante (la dernière par défaut) : ÷2 garde la moitié qui joue en ce moment, ×2 la répète pour la doubler. Dès qu'une piste devient plus longue (×2, ×4), les pistes plus courtes sont recopiées jusqu'à la même longueur : le son ne change pas, mais toutes les pistes ont la même durée. Tout s'annule avec ↶.

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

Sur un grand écran avec souris, NOMAD passe tout seul en paysage, dans l'esprit d'une MPC 1000 noire : écran, touches de mode et potards à gauche, pads à droite. Les touches & é " ' ( § è ! ç de la rangée du haut (clavier AZERTY, sans Maj), ou F1 à F9, changent d'onglet ; Espace = play / stop, Entrée = REC (dans SP et FX : imprimer sur la piste), Cmd+S = SAVE ; dans l'ordre de la grille 3×3 : PADS, LOOPER, SONS / DIGGING, SCRATCH, GUITARE / FX, SP, SONG. RÉGLAGES → AFFICHAGE permet de forcer la mise en page téléphone ou ordinateur. Dans Chrome, l'Akai branché en USB fonctionne directement.

## Nouveautés sons

- SONS : famille 20SYL (12 sons de synthèse dans l'esprit de 20syl) et 14 préréglages d'effets (DREAMY, CASSETTE, SOUL 70s, RADIO, TÉLÉPHONE, SOUS L'EAU, DUB, PING-PONG, SHIMMER, CRUNCH, WOBBLE, TRÉMOLO, TRÈS PROCHE, LOINTAIN).
- Kits J DILLA, RZA, PETE ROCK, DAMU THE FUDGEMUNK : batterie CC0 (Virtuosity Drums) traitée dans l'esprit de chacun.
- SONG : mastering automatique (NATUREL, CHAUD, CLAIR, PUNCH, LO-FI ; STREAMING -14, FORT -9, DOUX -18 LUFS), appliqué aux exports WAV du morceau, des boucles et de la session. L'export multipiste + MPC reste brut.

## Pour modifier NOMAD

Le code est rangé dans `src/` : `shell.html` (la page), `style.css`, et `js/` en morceaux numérotés, collés bout à bout dans l'ordre.
Après une modification : `python3 tools/build.py` reconstruit `index.html` (la page publiée, à ne pas modifier à la main).
Tests dans un navigateur : `pip install pytest playwright && python -m playwright install chromium`, puis `python -m pytest tests -q`.
Ils tournent aussi tout seuls sur GitHub à chaque envoi (onglet Actions).

### Projets

SAVE (en haut, à côté de MIX ; Cmd/Ctrl+S sur ordinateur) enregistre le projet en cours à sa place : celui qu'on a ouvert, importé (.nomad) ou enregistré. Sans projet en cours, SAVE en crée un, daté. RÉGLAGES → ENREGISTRER SOUS crée une copie sous un autre nom ; FICHIER exporte le .nomad. Passer de l'iPhone au Mac (et inversement) : FICHIER, puis AirDrop ou iCloud Drive, puis IMPORTER UN PROJET de l'autre côté ; le projet garde son identité, la version importée remplace l'ancienne au lieu de créer un doublon. La sauvegarde automatique (SESSION AUTO, toutes les 45 s et quand on quitte l'app) reste à part et se reprend depuis l'écran d'accueil. Un kit de chops ou un kit perso est emporté dans le projet.

### SP : station de couleur

L'onglet SP colore toute la sortie, façon sampler de poche. 16 effets sur les 16 pads (à l'écran et sur l'Akai) : banque A = SP COMP, VINYL SIM, CASSETTE, LO-FI, FILTRE + DRIVE, PASSE-HAUT, RADIO, SATURATION ; banque B = LOOPER DJ, ÉCHO, RÉVERBE, SLICER, KILL BASSES, KILL AIGUS, FLANGER, DÉSACCORD. Appui court = l'effet reste allumé, appui long = seulement tant qu'on tient ; plusieurs effets peuvent tourner ensemble. Potards : 1 et 2 règlent l'effet touché en dernier, 3 le dosage de toute la couleur SP (mélange avec le son d'origine, c'est aussi ce qui s'imprime), 4 à 6 l'isolateur, 7 la découpe des effets au tempo (droit, triolet, pointé, swing 54 à 66 %), 8 coupe tous les effets tourné à gauche et les rétablit ramené à droite. Les réglages de chaque effet sont gardés. Cible : TOUT (toute la sortie) ou P1 à P6 (une seule piste du looper ; touches blanches DO à LA). Dans SP, Sustain (ou ● IMPRIMER) grave les effets sur la piste choisie pendant un tour complet, en temps réel : un effet joué sur un seul temps ne reste que là. Ensuite les effets se remettent à zéro ; Retour arrière annule. Le rééchantillonnage vers un pad reste disponible, replié en bas : ENVOYER SUR UN PAD.

### DIGGING en ligne

Huit bacs sont cherchés en direct sur internet, sans rien garder dans l'appareil (il faut une connexion) : SOUL & GOSPEL, JAZZ 20'S, TANGO & LATINO et MONDE 78 viennent des 78 tours d'Internet Archive enregistrés entre 1900 et 1925, domaine public aux États-Unis, avec la photo réelle du disque ; BRÉSIL, INDE, ASIE et AFRIQUE & ORIENT viennent de Wikimedia Commons, en domaine public ou sous licence CC BY / CC BY-SA (citer l'auteur, indiqué sous le titre). Un morceau entier est téléchargé une fois puis découpé en extraits de 30 s. Une barre fine montre le chargement. → PADS garde automatiquement le kit de chops dans l'appareil, nommé d'après le disque (« CHOPS · TITRE ») : on peut changer de kit et y revenir (liste des kits, flèches). Les 6 plus récents sont gardés. Dans l'extrait : − / + zooment, la glissière jaune (ou un appui long sur la forme d'onde) choisit où démarre la lecture, EFFACER retire toutes les coupes, CRÊTES coupe juste avant les sons les plus forts ; NORMALISER, − SOUFFLE, − CRAQUEMENTS nettoient l'extrait, ORIGINAL revient au son de départ. Le bouton ×1 au-dessus du cercle de l'écran choisit la longueur de la prochaine boucle (×1, ×2, ×4, ÷2).
