# Planning de migration — Splunk → Chronicle & Dynatrace

Ce dossier contient le planning (macro et micro) de la migration, mis à jour avec
l'architecture précise validée : flux AWS CloudWatch → Chronicle Native Feed
(AssumeRole), flux AIX rsyslog → Chronicle Forwarder, et flux Dynatrace OneAgent
pour les dashboards/logs applicatifs.

## Contenu

- `planning-migration-chronicle-dynatrace.xlsx` — classeur de pilotage :
  - **Résumé** : contexte, dates clés, schémas intégrés.
  - **Planning Macro** : 9 phases du 15/09 au 13/11/2026, avec un Gantt intégré
    (mise en forme conditionnelle sur les colonnes hebdomadaires).
  - **Planning Micro** : 35 tâches détaillées par chantier (AWS, AIX, Dynatrace,
    Validation, Gouvernance), avec owner, dates, dépendances et statut.
  - **Risques** : registre des risques, dont l'incompatibilité du binaire
    Chronicle Forwarder avec la version d'AIX en place (déjà traitée).
  - **Suivi Dynatrace** : suivi dédié de la migration des dashboards par David
    et du déploiement OneAgent.
- `planning-migration-chronicle-dynatrace.pdf` — document de synthèse (version
  imprimable/partageable du planning et de l'architecture).
- `schema-architecture-cible-v2.png` — schéma d'architecture mis à jour (3 flux :
  CloudWatch/Chronicle, rsyslog/Forwarder AIX, Dynatrace/OneAgent).
- `planning-macro-visuel.png` — visuel du planning macro (Gantt).
- `pmo-suivi-migration-chronicle-dynatrace.xlsx` — **version PMO** du même
  planning, restructurée pour un pilotage de type comité de projet :
  - **Dashboard** : KPI (jours restants, avancement global, tâches en retard),
    synthèse par chantier, prochains jalons — tout calculé par formule.
  - **Jalons** : les 7 jalons clés du projet, avec statut auto (Dépassé /
    Imminent / Planifié) recalculé à l'ouverture du fichier.
  - **Planning Macro** et **Planning Micro** : mêmes données que ci-dessus,
    enrichies d'une colonne **RAG** (Vert/Orange/Rouge) et d'un **% d'avancement**
    calculés par formule à partir du statut et de la date de fin (donc vivants :
    rouvrir le fichier un autre jour recalcule automatiquement les retards).
  - **RACI** : matrice Responsible/Accountable/Consulted/Informed par chantier
    et par rôle (Chef de projet, équipes Cloud/AWS, AIX/Unix, Sécurité/SIEM,
    David/Dynatrace, comité de pilotage).
  - **RAID Log** : Risques, Hypothèses, Problèmes (dont l'incident AIX, classé
    comme Problème puisqu'il s'est déjà produit) et Dépendances.
  - **Suivi Dynatrace** : identique au classeur précédent.

## Points clés

- **Décommissionnement Splunk visé** : 13 novembre 2026 (dernier jour ouvré
  avant l'échéance de 2 mois).
- **Checkpoint Dynatrace** : 18 septembre 2026 — résultat de la migration des
  dashboards par David, conditionnant la généralisation du déploiement OneAgent.
- **Retour d'expérience intégré** : le binaire Chronicle Forwarder ne peut pas
  s'installer directement sur la version d'AIX en place ; l'architecture retenue
  n'installe donc aucun agent sur AIX (relais `syslog` natif uniquement vers une
  VM Forwarder Linux dédiée).
- **Archivage S3 confirmé (non optionnel)** : les deux flux sécurité écrivent
  désormais directement dans le même bucket S3 — les logs Linux/Windows via
  l'export CloudWatch, et les logs AIX via le relais `rsyslog` — avec des
  préfixes distincts par OS. Ce flux d'archivage est indépendant de Dynatrace.
- **Dynatrace OneAgent installé par service** : le déploiement se fait à la
  granularité applicative (par service), et non simplement par hôte. Les logs
  collectés par OneAgent restent dans Dynatrace et ne transitent pas par S3.

Les noms d'équipes/owners utilisés (« Équipe Cloud/AWS », « Équipe AIX/Unix »,
« Chef de projet migration », etc.) sont des libellés génériques à remplacer par
les noms réels lors de l'appropriation du planning.
