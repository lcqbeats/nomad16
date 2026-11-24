# À faire plus tard

## Héberger les sons MPC en ligne (en attente : MPC pas sous la main)

Proposition validée dans l'idée (14 nov. 2026) :

- **Stockage** : ~~Cloudflare R2~~ écarté (24 nov. 2026) : l'activation de R2 exige un moyen de paiement, même pour l'offre gratuite, et Jérémy refuse de donner une carte. À la place, sans carte : le Dropbox de Jérémy (2 Go gratuits, déjà branché pour les projets, voir RÉGLAGES › NUAGE) ou un dépôt GitHub privé. Pas le dépôt GitHub public.
- **Script sur le Mac** (`tools/upload_mpc.py` à écrire) : parcourt les dossiers MPC, convertit en AAC (.m4a),
  lit les programmes (.pgm / .xpm, .snd selon le modèle) pour refaire des kits NOMAD (son → pad), écrit un catalogue
  JSON, envoie sur Dropbox (API) ou le dépôt privé ; relancé, il n'envoie que les nouveautés.
- **NOMAD** : BIBLIOTHÈQUE… → rubrique « MES SONS MPC » (dossiers, écoute, téléchargement à la demande) ;
  programmes MPC dans la liste des kits ; cache limité (~200 Mo) des sons récents ; kits et projets gardent l'adresse
  du son plutôt que le son.
- **À demander à Jérémy** : volume (Go, nombre de sons), modèle de MPC / formats, sons perso ou banques du commerce
  (→ accès privé avec une clé). Pas de compte Cloudflare.
