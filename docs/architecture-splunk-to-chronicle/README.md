# Migration des logs de sécurité : Splunk → Google Chronicle

Ce dossier contient la note d'architecture pour la migration de la collecte et de
l'analyse des logs de sécurité depuis Splunk vers Google Chronicle (Google Security
Operations), avec :

- collecte **Unix/Linux** et **Windows** via l'agent unifié **Amazon CloudWatch** ;
- collecte **AIX** via un relais **rsyslog** central (AIX ne disposant pas d'agent
  CloudWatch natif) ;
- archivage légal et immuable du log brut sur **Amazon S3** (chiffrement KMS,
  Object Lock, lifecycle Glacier/Deep Archive) ;
- diffusion vers **Google Chronicle** via Kinesis Data Firehose + Lambda de
  transformation UDM.

## Contenu

- `architecture-splunk-to-chronicle.pdf` — document complet (contexte, schéma,
  détail des composants, sécurité, plan de migration par phases, recommandations).
- `schema-architecture.png` — schéma d'architecture seul, en image haute résolution.

## Hypothèse

« Cronicle » est interprété comme **Google Chronicle** (le SIEM cible remplaçant
Splunk), et non comme le scheduler de tâches open-source du même nom, qui n'a pas
de fonction SIEM.
