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

- `architecture-splunk-to-chronicle.pdf` — document global (contexte, schéma d'ensemble,
  détail des composants, sécurité, plan de migration par phases, recommandations).
- `schema-architecture.png` — schéma d'architecture global, en image haute résolution.

Deux volets détaillés par filière de collecte :

- `architecture-cloudwatch-linux-windows.pdf` + `schema-cloudwatch-linux-windows.png` —
  architecture dédiée à la collecte **Linux/Windows** via l'agent unifié Amazon CloudWatch.
- `architecture-rsyslog-aix.pdf` + `schema-rsyslog-aix.png` — architecture dédiée à la
  collecte **AIX** via un relais rsyslog central en haute disponibilité, avec pont vers
  CloudWatch.

Les deux volets se raccordent au même socle commun (CloudWatch Logs → Kinesis Firehose →
S3 pour l'archivage, Lambda + Chronicle Ingestion API pour le SIEM), détaillé dans le volet
CloudWatch Linux/Windows.

## Hypothèse

« Cronicle » est interprété comme **Google Chronicle** (le SIEM cible remplaçant
Splunk), et non comme le scheduler de tâches open-source du même nom, qui n'a pas
de fonction SIEM.
