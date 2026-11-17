# Plateforme de suivi des logs applicatifs Splunk

Plateforme unique pour piloter l'intégration (onboarding) des logs applicatifs dans **Splunk** :
inventaire des logs, planning **Gantt par stream**, **workflow de validation étape par étape**,
tableau de bord d'avancement et historique — accompagnée d'un **classeur Excel de suivi** équivalent.

```
platform/   Application web (HTML/JS, aucune installation côté poste)
server/     Serveur Node.js sans dépendance : données partagées entre utilisateurs
excel/      Suivi_Logs_Splunk.xlsx – classeur de suivi (formules, Gantt, tableau de bord)
tools/      Scripts : jeu de données d'exemple, génération du classeur Excel
data/       sample_data.json (exemple) – db.json est créé par le serveur (non versionné)
tests/      Tests pytest (données, classeur, API serveur)
```

## Démarrer

**Mode partagé (multi-utilisateurs, recommandé)** – Node.js ≥ 18 :

```bash
node server/server.js            # http://localhost:8080
# options : PORT=3000 HOST=0.0.0.0 DATA_FILE=/srv/suivi/db.json node server/server.js
```

Tous les utilisateurs ouvrent la même URL : les données sont stockées dans `data/db.json`
(sauvegarde quotidienne dans `data/backups/`). Les modifications des autres apparaissent toutes les 8 s ;
en cas d'éditions simultanées, l'action est rejouée automatiquement sur la dernière version.

**Mode local** : ouvrir `platform/index.html` dans un navigateur. Les données restent dans ce navigateur ;
l'échange se fait alors par fichiers Excel / JSON (menu *Import / Export*).

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Tableau de bord** | Avancement global, workflow validé, onboarding des logs, retards, validations en attente, volumétrie ; avancement par stream ; logs par statut ; échéances à 14 j ; activité récente |
| **Streams & validation** | Workflow vertical des 7 étapes par stream avec critères de passage, tâches de l'étape, boutons *Soumettre*, *Valider & passer à l'étape suivante*, *Rejeter* (motif obligatoire), *Réouvrir* (admin) |
| **Planning Gantt** | Gantt par stream (semaine / mois / trimestre), barre de synthèse par stream, partie réalisée, retards, ligne « aujourd'hui », édition d'une tâche au clic |
| **Inventaire des logs** | Filtres, pipeline de statuts cliquable, passage au statut suivant (▶), fiche complète avec **inputs.conf / props.conf / requêtes SPL générés** |
| **Validations** | File « À valider », « Mes actions » (selon l'utilisateur connecté), historique complet filtrable |
| **Import / Export** | Import Excel (classeur de suivi, **votre inventaire de logs**, **votre planning Gantt par stream** — colonnes détectées automatiquement), export Excel complet, sauvegarde/restauration JSON |
| **Paramètres** | Utilisateurs & rôles, streams (responsable, validateur, couleur), libellés et critères des étapes, statuts d'onboarding et leur % |

### Workflow de validation

1. **Cadrage & inventaire des logs** → 2. **Qualification des sources** → 3. **Configuration de la collecte**
→ 4. **Parsing & normalisation (CIM)** → 5. **Dashboards & alertes** → 6. **Recette utilisateur**
→ 7. **Mise en production & validation finale**

- Seule l'**étape active** (première non validée) peut être soumise / validée : impossible de sauter une étape.
- Valider une étape la verrouille, valide les tâches terminées de l'étape et **active automatiquement l'étape suivante**.
- Un rejet exige un motif ; le contributeur reprend l'étape puis la resoumet.
- Tâches et logs ont leur propre validation (*Non soumise → Soumise → Validée / Rejetée*).
  Le dernier statut d'un log (« Validé ») est réservé aux validateurs.
- Chaque action est tracée dans l'**historique** (qui, quand, quoi, commentaire).

**Rôles** : Admin (tout) · Validateur (valide/rejette) · Contributeur (saisit, avance, soumet) · Lecteur.
L'utilisateur courant se choisit en haut à droite (pas d'authentification : à placer derrière votre SSO / reverse-proxy si nécessaire).

## Classeur Excel `excel/Suivi_Logs_Splunk.xlsx`

| Feuille | Rôle |
|---|---|
| Guide | Mode d'emploi, code couleur, processus de validation |
| Tableau de bord | KPI, avancement par stream, logs par statut, tâches par statut, étapes validées, graphiques |
| Streams | Synthèse calculée par stream (étape courante, %, retards, statut) + Gantt par stream |
| Validations | 7 lignes par stream ; contrôle de séquence (⚠ si une étape est validée avant la précédente), « Prochaine action » |
| Tâches | Planning détaillé, statut automatique (Planifiée / En cours / En retard / Terminée), validation, **Gantt hebdomadaire** en mise en forme conditionnelle |
| Logs | Inventaire complet, statut d'onboarding (liste), % déduit, validation, requête SPL de contrôle |
| Historique | Journal des validations |
| Listes | Référentiels (étapes, critères, statuts, % , utilisateurs) |

Toutes les valeurs de synthèse sont des **formules** : le classeur se recalcule seul. Formules pré-remplies pour
400 tâches, 600 logs, 300 lignes de validation et 26 streams.

Régénérer le classeur (mise en forme complète) avec vos données réelles exportées de la plateforme :

```bash
pip install -r requirements.txt
python tools/generate_excel.py suivi_logs_splunk_AAAA-MM-JJ.json -o excel/Suivi_Logs_Splunk.xlsx
```

## Intégrer vos fichiers existants

Menu **Import / Export** → déposer votre fichier Excel d'inventaire des logs et votre planning Gantt.
Colonnes reconnues (exemples, insensibles aux accents/majuscules) : *Application, Stream/Domaine/Lot, Source/Chemin,
Méthode de collecte, Index, Sourcetype, Hôte/Serveur, Volume/Volumétrie, Criticité, Statut/État, Responsable* pour les logs ;
*Tâche/Activité, Stream, Étape/Phase, Responsable, Début, Fin, % avancement* pour le Gantt. Dans un Gantt sans colonne
« Stream », les lignes sans dates sont interprétées comme des en-têtes de stream. Les streams inconnus sont créés automatiquement.
Un aperçu (feuilles, lignes, colonnes reconnues) est affiché avant l'import.

## Développement

```bash
python tools/build_sample_data.py   # régénère data/sample_data.json et platform/js/sample-data.js
python tools/generate_excel.py      # régénère excel/Suivi_Logs_Splunk.xlsx
pytest                              # tests
```

Bibliothèque embarquée : SheetJS Community Edition 0.18.5 (`platform/vendor/`, licence Apache-2.0).
