# Launcher du serveur

Launcher Windows pour le serveur Minecraft NeoForge 1.21.1, par N4ssD.

Il connecte le joueur avec son compte Microsoft, installe tout seul Java, Minecraft et NeoForge, synchronise les mods avec ce dépôt, puis lance le jeu directement sur le serveur.

## Télécharger

Dans l'onglet **Releases** du dépôt, prends le dernier **TonServeurSetup.exe**.

> Windows peut afficher « Windows a protégé votre ordinateur », car l'exe n'est pas signé (un certificat de signature est payant). Clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## Mettre à jour les mods du serveur

1. Dépose tes fichiers `.jar` dans **`modpack/mods/`** (sur GitHub : *Add file › Upload files*).
2. Pour supprimer un mod, supprime son fichier dans ce dossier.
3. C'est tout : GitHub met à jour `modpack/manifest.json` tout seul en moins d'une minute. Au prochain lancement, chaque joueur reçoit les nouveaux mods, et ceux qui ne sont plus dans le dossier sont retirés de chez lui.

Tu peux aussi déposer des configurations dans **`modpack/config/`**. Elles ne sont réécrites chez les joueurs que quand tu les modifies ici. Le reste du temps, les joueurs gardent leurs réglages.

Ne mets dans `modpack/mods/` que les mods utiles côté client (pas les mods uniquement serveur). Un fichier GitHub ne peut pas dépasser 100 Mo.

## Régler le serveur : `modpack/pack.json`

```json
{
  "name": "TonServeur",
  "address": "play.monserveur.fr",
  "minecraft": "1.21.1",
  "neoforge": "latest",
  "version": "1.0",
  "news": [
    { "type": "add", "text": "Nouveau mod : Create" },
    { "type": "update", "text": "2 mods mis à jour" },
    { "type": "remove", "text": "1 mod retiré" }
  ]
}
```

| Champ | Rôle |
|---|---|
| `name` | Nom affiché dans le launcher |
| `address` | Adresse du serveur, avec `:port` si ce n'est pas 25565. Le jeu s'y connecte directement |
| `neoforge` | Mets la **même version que ton serveur** (ex. `21.1.265`). `latest` prend la dernière version stable |
| `ram` | RAM conseillée pour le modpack, en Mo (ex. `8192` = 8 Go). Le mode « Automatique » du launcher l'utilise, sans dépasser ce que le PC du joueur peut supporter |
| `version` / `news` | Numéro et nouveautés affichés sur l'accueil (`add`, `update`, `remove` ou `info`) |

Une modification de ce fichier est visible dans le launcher sans recompiler l'exe.

### Liens, Discord et mods optionnels

```json
"links": { "discord": "https://discord.gg/ton-invitation", "site": "https://ton-site.fr" },
"discord_app_id": "123456789012345678",
"optional": [
  { "modrinth": "xaeros-minimap", "name": "Minimap", "description": "Petite carte en haut de l'écran.", "default": false },
  { "modrinth": "iris", "name": "Iris", "requires": ["sodium"] },
  { "modrinth": "complementary-reimagined", "name": "Shaders", "dir": "shaderpacks", "loader": "iris", "requires": ["iris"] }
]
```

- `links` : affiche des boutons Discord et Site en haut du launcher (laisse vide pour les masquer).
- `discord_app_id` : active le statut « Joue sur TonServeur » sur Discord. Crée une application sur https://discord.com/developers/applications, copie son **Application ID**, puis dans **Rich Presence › Art Assets**, ajoute une image nommée `logo`. Le bouton « Rejoindre le serveur » de ce statut utilise le lien Discord ci-dessus.
- `optional` : les mods que chaque joueur peut activer dans l'onglet **Mods**. Ils sont téléchargés depuis Modrinth (`modrinth` = l'identifiant dans l'adresse de la page, par ex. modrinth.com/mod/**xaeros-minimap**), donc tu n'as pas à les héberger. `dir` : `mods` (par défaut), `shaderpacks` ou `resourcepacks`. `requires` : les autres mods optionnels nécessaires, activés automatiquement avec lui. Si un mod n'existe pas pour ta version de Minecraft, il apparaît comme « Pas disponible ».

### Onglet « Mods »

Il liste les mods de `modpack/mods/` avec leur vrai nom, leur version, leur description et leur icône : tout est lu automatiquement dans les `.jar` quand tu les déposes. Après chaque changement, les mods ajoutés portent le badge **NOUVEAU** et les mods modifiés **MIS À JOUR**.

### Onglet « Nouveautés »

L'historique complet affiché dans l'onglet Nouveautés vient du champ `changelog` de `pack.json`. Mets la plus récente **en premier** :

```json
"changelog": [
  {
    "version": "1.1",
    "date": "2026-12-02",
    "title": "La mise à jour des trains",
    "items": [
      { "type": "add", "text": "Nouveau mod : Steam 'n' Rails" },
      { "type": "update", "text": "Create mis à jour" },
      { "type": "remove", "text": "Ancienne minimap retirée" },
      { "type": "info", "text": "Redémarrage du serveur chaque nuit à 5 h" }
    ]
  }
]
```

La dernière version porte le badge « NOUVEAU », et un point orange apparaît sur l'onglet tant que le joueur ne l'a pas ouvert. Si `news` est vide, l'accueil affiche les 3 premières lignes de la dernière version.

## Connexion Microsoft : à faire une seule fois

Comme tous les launchers non officiels, celui-ci a besoin de sa propre « application » Microsoft, et Mojang doit l'autoriser.

1. Va sur **https://portal.azure.com** et connecte-toi avec un compte Microsoft (gratuit).
2. Cherche **Inscriptions d'applications** (*App registrations*), puis clique sur **Nouvelle inscription**.
   - Nom : le nom du launcher.
   - Types de comptes : **Comptes Microsoft personnels uniquement** (ou « tout annuaire + comptes personnels »).
   - Ne remplis pas l'URI de redirection, puis clique sur **S'inscrire**.
3. Dans **Authentification**, active **Autoriser les flux de clients publics** et enregistre.
4. Sur la page **Vue d'ensemble**, copie l'**ID d'application (client)** et l'**ID de l'annuaire (locataire)**.
5. Demande l'accès à Mojang avec ce formulaire : **https://aka.ms/mce-reviewappid**. Donne les deux ID et explique qu'il s'agit du launcher privé de ton serveur. La réponse arrive par e-mail, en général après quelques jours ou quelques semaines.
6. Sur GitHub, ouvre ce dépôt, puis **Settings › Secrets and variables › Actions › onglet Variables › New repository variable** :
   - Name : `AZURE_CLIENT_ID`
   - Value : l'ID d'application copié à l'étape 4.
7. Relance la compilation : onglet **Actions › Compiler le launcher (.exe) › Run workflow**.

Tant que Mojang n'a pas validé la demande, le launcher affiche « Mojang n'a pas encore autorisé ce launcher » au moment de la connexion. Tout le reste fonctionne déjà.

## Mise à jour automatique du launcher

Quand tu publies une nouvelle version, les joueurs n'ont plus besoin de retélécharger l'exe : au démarrage, le launcher la détecte, la télécharge et redémarre tout seul. On peut aussi désactiver cette option et vérifier à la main dans **Réglages › Mise à jour du launcher**.

**À faire une seule fois :** ajoute la clé de signature dans GitHub :
**Settings › Secrets and variables › Actions › onglet Secrets › New repository secret**
- Name : `TAURI_SIGNING_PRIVATE_KEY`
- Secret : le contenu du fichier de clé privée (une seule ligne de texte).

Garde ce fichier précieusement et ne le partage avec personne : sans lui, tu ne pourras plus publier de mises à jour automatiques.

**Pour publier une nouvelle version**, augmente le numéro `version` dans `app/src-tauri/tauri.conf.json` (par ex. `1.2.0` → `1.3.0`). GitHub compile la nouvelle version et les launchers déjà installés se mettent à jour au prochain démarrage.

> Les personnes qui ont une version antérieure à 1.2.0 doivent télécharger l'exe une dernière fois à la main.

## Changer le nom du launcher

Remplace « TonServeur » par le nom voulu à deux endroits :

- dans `app/src-tauri/tauri.conf.json` (`productName` et `title`) ;
- dans `modpack/pack.json` (`name`).

La compilation repart toute seule.

## Où sont les fichiers chez le joueur ?

Dans `%APPDATA%\N4ssD-Launcher` :

- `jeu` : dossier du jeu (mods, saves, captures d'écran) ;
- `minecraft` : version, bibliothèques, ressources ;
- `java` : le Java de Mojang ;
- `logs` : journaux (`jeu.log` en cas de crash).

## Mémoire (RAM)

En mode « Automatique » (par défaut), le launcher prend la RAM conseillée dans `pack.json` sans dépasser ce que le PC peut supporter : il laisse toujours au moins 30 % de la RAM (2,5 Go minimum) à Windows. Le joueur peut aussi régler la valeur à la main, jusqu'à la RAM totale de son PC ; au-delà de la zone sûre, la barre devient rouge avec un avertissement.

## Structure du dépôt

```
app/ui/            interface (HTML/CSS/JS)
app/src-tauri/     code Rust (connexion, installation, synchronisation, lancement)
modpack/           pack.json + mods/ + config/ (manifest.json est généré)
scripts/           génération du manifeste
.github/workflows/ compilation de l'exe + mise à jour du manifeste
```
