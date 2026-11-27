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
| `version` / `news` | Numéro et nouveautés affichés sur l'accueil (`add`, `update`, `remove` ou `info`) |

Une modification de ce fichier est visible dans le launcher sans recompiler l'exe.

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

## Structure du dépôt

```
app/ui/            interface (HTML/CSS/JS)
app/src-tauri/     code Rust (connexion, installation, synchronisation, lancement)
modpack/           pack.json + mods/ + config/ (manifest.json est généré)
scripts/           génération du manifeste
.github/workflows/ compilation de l'exe + mise à jour du manifeste
```
