# JPS-logistis

## Pré-alerte (annoncer un colis)
Dans l'espace client, le client annonce un colis avant son arrivée à Miami : transporteur, numéro de suivi final, boutique, contenu, valeur, avion ou bateau (et « attendre mes autres commandes »). Rien d'autre.
- **À faire une fois :** exécuter la section 13 de `jps-logistics-supabase-schema.sql` dans Supabase (SQL Editor). Tant que ce n'est pas fait, la section reste cachée sur le site.
- L'application interne (warehouse) lit la table `prealerts` avec la clé service_role et reconnaît le colis dès qu'on scanne le numéro de suivi.
