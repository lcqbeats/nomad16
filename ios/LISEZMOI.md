# NOMAD 16 pour iPhone (app maison, sans MIDIWeb)

1. Xcode > File > New > Project… > iOS > **App** > Next.
   Product Name : `NOMAD16` · Team : ton compte (Personal Team) · Organization Identifier : `com.tonprenom` · Interface : **SwiftUI** · Language : **Swift** · Testing System / Storage : aucun.
2. Dans la liste des fichiers à gauche : supprimer `ContentView.swift` (Move to Trash), ouvrir `NOMAD16App.swift`, tout remplacer par le contenu de `NOMAD16App.swift` de ce dossier.
3. Cible NOMAD16 > onglet **General** : Minimum Deployments **iOS 16.0** (Xcode 16.2 sur macOS Sonoma convient) ; Supported Destinations : garder iPhone.
4. Onglet **Info** : ajouter la clé `Privacy - Microphone Usage Description` = « Entrée guitare et micro de NOMAD ».
5. `Assets` > `AppIcon` : glisser `AppIcon-1024.png` dans la case 1024.
6. Brancher l'iPhone, le choisir en haut de la fenêtre, puis ▶ (Run).
   Première fois : sur l'iPhone, Réglages > Général > VPN et gestion de l'appareil > ton identifiant > Faire confiance.
7. Avec un compte gratuit, l'app fonctionne 7 jours : rebrancher l'iPhone et refaire ▶.

## Version 5 : hors ligne

Ajouter le fichier `NOMAD16-Info.plist` à côté du dossier du projet Xcode et, dans les réglages de la cible (Build Settings), mettre « Info.plist File » = `NOMAD16-Info.plist`. Il déclare `lcqbeats.github.io` comme domaine de l'app (WKAppBoundDomains), ce qui autorise le service worker : NOMAD démarre alors sans réseau.
