# Brief — « Freda Tech × Elite Auto Deal » (46 s, 4K)

**Format :** 2160×3840 (4K vertical 9:16), 30 fps, 46 s, H.264 + AAC. Même recette que la vidéo JP's Logistics v4.
**Projet présenté :** le site Elite Auto Deal (dépôt `saintjulienwidemayeur-max/elite-auto-deal-`) : vitrine de véhicules,
précommande / achat / essai, paiements MonCash · Natcash · carte via Freda Pay Issuing, suivi de dossier, espace client,
devis en ligne (PDF, e-mail, WhatsApp) et tableau de bord administrateur.

## Règle : de vraies interfaces
Le vrai serveur du dépôt a été lancé en local (Postgres + faux Freda Pay du dossier `test/`) et rempli par l'API du site
avec des données de démonstration :
- 8 véhicules = les 8 voitures de la vitrine du site (mêmes images détourées, posées sur un fond studio 4:5),
  en « Prix sur demande » (aucun prix inventé) ;
- un client de démonstration « Jean-Marc Pierre », 3 dossiers payés (précommande, consultation, essai) ;
- le devis EAD-DEV-0001 (105 $) payé par MonCash (13 860 HTG au taux 132) → dossier EAD-2026-35289.
Toutes les captures sont des écrans réels du site (PC @2x, mobile @3x) et le PDF réel généré par le serveur.

## Palette
Blanc / blanc cassé #F7F7F8, rouge Elite #C8102E, noir #0B0B0C, gris #5B5F66 (palette du README du site).
Le bleu Freda Tech reste pour l'intro et la signature de l'agence.

## Découpage (120 BPM)
| Temps | Scène |
|---|---|
| 0–3 | Hook : la Mercedes GLE Coupé rouge de la vitrine arrive à toute vitesse, « Votre prochaine voiture, en quelques clics. » |
| 3–5,5 | Freda Tech présente, logo Elite Auto Deal |
| 5,5–10 | Site sur PC, clic « Voir les véhicules », la GLE sort de l'écran et fonce vers la caméra (son de moteur Doppler) |
| 10–15 | Site en 3D : Accueil, Notre flotte, Services & tarifs, Précommande & essai, Contact |
| 15–21 | Simulation de paiement : devis → MonCash → « Paiement confirmé par Freda Pay Issuing » → suivi du dossier |
| 21–25 | Devis en ligne : lien sécurisé, PDF A4, e-mail, WhatsApp |
| 25–30 | Carrousel 3D de téléphones (accueil, fiches véhicules, espace client, dossier, paiement) |
| 30–34 | Espace client & administration (vrai tableau de bord) |
| 34–38 | Multi-écrans, laptop qui s'ouvre, une Audi Q3 traverse l'écran |
| 38–42 | Freda Tech crée : sites web, apps mobiles, systèmes informatiques |
| 42–46 | Signature Freda Tech, +1 (774) 458-5835 (appel & WhatsApp), filiale de Freda Pay LLC |

## Refaire la vidéo
1. Lancer le serveur Elite Auto Deal en local avec Postgres et `test/mock-freda.js`, puis `node seed-demo.mjs <dossier-photos>`.
2. `node capture.mjs <jetonAdmin> <cookieClient> <refDossier> <jetonDevis> [<refDevisPayé>]`
3. `python3 make_audio.py` puis `node render4k.mjs <début> <fin> <sortie.mp4>` (par segments) et assemblage ffmpeg.
