---
name: svn-workflow
description: Workflow de commit SVN pour mes projets dans C:\dev\. Utiliser ce skill au démarrage de chaque session sur n'importe quel projet. Le project_path est le dossier du projet en cours (ex: C:\dev\atornai, C:\dev\common) — les sous-dossiers sont acceptés, le MCP remonte automatiquement à la racine SVN. Propose systématiquement un message de commit après chaque modification de fichier, et exécute le commit directement via l'outil MCP svn_commit si disponible, sinon demande à l'utilisateur de lancer commit.bat.
---

# SVN Workflow

## Principe

J'ai accès à un serveur MCP SVN (`svn_mcp`) qui me permet d'exécuter les opérations SVN directement.
La working copy SVN est à la racine `C:\dev` — le MCP accepte n'importe quel sous-dossier comme `project_path` et remonte automatiquement à la racine SVN.
Mon rôle : **proposer un message de commit clair après chaque modification**, obtenir confirmation, puis **exécuter le commit moi-même**.

---

## Règle absolue

Après **chaque modification de fichier(s)**, je dois :
1. Appeler `svn_status` sur le `project_path` et présenter le résultat à l'utilisateur
2. Si des fichiers `?` (non versionnés) inattendus apparaissent, signaler et demander confirmation avant de continuer
3. Résumer ce qui va changer et proposer un message de commit formaté
4. **Attendre une confirmation explicite de l'utilisateur** — un mot comme "oui", "ok", "vas-y" ou équivalent
5. Ne jamais appeler `svn_commit` sans cette confirmation, même si le contexte semble évident
6. Si l'utilisateur confirme → appeler `svn_commit` avec le `project_path` et le `message`
7. Rapporter le résultat du commit à l'utilisateur

> **Pourquoi le status d'abord ?** Le MCP ajoute automatiquement tous les fichiers `?` visibles sous `project_path`. Un fichier non versionné inattendu peut ainsi se retrouver dans le commit sans que personne ne l'ait voulu.

> **Pourquoi la confirmation est bloquante ?** Un commit SVN est immédiat et partagé. Un code instable, un fichier parasite ou un message mal formulé ne peuvent pas être ignorés — la confirmation protège l'intégrité du dépôt.

Ne jamais enchaîner plusieurs lots logiques de modifications sans proposer un commit intermédiaire. Un lot logique regroupe les fichiers modifiés pour une même raison fonctionnelle.

### Si le MCP n'est pas disponible
Fallback : dire explicitement *"Lance `commit.bat` depuis ton dossier projet avec ce message"* (`C:\dev\common\scripts\commit.bat`) et afficher le message prêt à copier.

---

## Identifier le project_path

Le `project_path` à passer à `svn_commit` est le dossier du projet en cours (pas forcément la racine SVN `C:\dev`).
Il est fourni explicitement dans les instructions d'amorçage du fil — ne pas tenter de le déduire du chemin du skill.
Exemple : les instructions d'amorçage indiquent `You are DEV, ... in C:\dev\atornai\`, donc `project_path = "C:\dev\atornai"`.
Autre exemple : `You are TST, ... in C:\dev\common\`, donc `project_path = "C:\dev\common"`.
Le MCP se charge de trouver la racine SVN — le fil n'a pas à s'en préoccuper.
Si le `project_path` n'est pas clairement identifiable, demander confirmation à l'utilisateur avant tout commit.

---

## Format des messages de commit

### Commits projet (le cas habituel)
```
[PROJET][TAG] Description courte et claire
```
Exemple : `[ATORNAI][FEAT] Ajout formulaire login`

### Commits transverses (common, skills partagés, config globale)
```
[COMMON][TAG] Description courte et claire
```
Exemple : `[COMMON][SKILL] svn-workflow mis à jour`

### Commits multi-projets (TST, COMMON — touche plusieurs projets en une passe)
```
[TRANSVERSE][TAG] Description courte et claire
```
Exemple : `[TRANSVERSE][CONFIG] svn:ignore backups/pruned propagé sur tous les projets`

---

| Tag | Quand l'utiliser |
|---|---|
| `[FEAT]` | Nouvelle fonctionnalité |
| `[FIX]` | Correction de bug |
| `[STYLE]` | Changements purement visuels sans impact fonctionnel |
| `[REFACTOR]` | Réécriture sans changement de comportement |
| `[DOCS]` | Modification documentation / ETAT_ACTUEL.md |
| `[SKILL]` | Ajout ou modification d'un skill |
| `[TEST]` | Écriture de tests unitaires |
| `[CONFIG]` | Changement de config (vite, tailwind, package.json...) |
| `[WIP]` | Travail en cours, état instable |

## Exemples

```
[ATORNAI][FEAT] Ajout formulaire de saisie utilisateur
[LABYFLECHE][FIX] Correction calcul résultat incorrect en cas limite
[COMMON][DOCS] Mise à jour ETAT_ACTUEL et notes de version
[COMMON][SKILL] Ajout skill svn-workflow
[ATORNAI][REFACTOR] Extraction logique métier dans module dédié
[LABYFLECHE][CONFIG] Mise à jour dépendances package.json
[ATORNAI][WIP] Intégration API en cours, non fonctionnel
[TRANSVERSE][CONFIG] svn:ignore backups/pruned propagé sur tous les projets
```

---

## Rappel en fin de session

À la fin de chaque session, si des fichiers ont été modifiés sans commit, rappeler et proposer d'exécuter le commit immédiatement.
