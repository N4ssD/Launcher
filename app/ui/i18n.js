/* Traduction de l'interface (français → anglais).
   Tout texte affiché est traduit automatiquement s'il figure dans EN ou correspond à une règle de RULES. */
const i18n = (() => {
  const EN = {
    // Navigation / barre du haut
    "Accueil": "Home", "Nouveautés": "News", "Mods": "Mods", "Captures": "Screenshots", "Réglages": "Settings",
    "Se connecter": "Sign in", "Navigation": "Navigation", "Réduire": "Minimize", "Agrandir": "Maximize", "Fermer": "Close",
    "Discord du serveur": "Server Discord", "Site du serveur": "Server website", "COMPTES": "ACCOUNTS",
    "Ajouter un compte": "Add an account", "Se déconnecter": "Sign out", "Chargement…": "Loading…", "chargement…": "loading…",
    // Accueil
    "Recherche du serveur…": "Looking for the server…", "Serveur hors ligne": "Server offline", "Adresse du serveur non définie": "Server address not set",
    "Le modpack officiel du serveur, synchronisé automatiquement à chaque mise à jour.": "The server's official modpack, synced automatically with every update.",
    "EN LIGNE": "ONLINE", "ÉVÉNEMENT": "EVENT", "EN COURS": "LIVE NOW", "Statistiques cinétiques": "Kinetic stats", "Vitesse :": "Speed:", "tr/min": "RPM",
    "(Lente)": "(Slow)", "(Moyenne)": "(Medium)", "(Rapide)": "(Fast)", "Vérification…": "Checking…", "NOUVEAUTÉS": "NEWS", "Tout voir →": "See all →",
    "Rien de nouveau pour l'instant": "Nothing new yet", "Hors ligne": "Offline", "Impossible de récupérer le modpack": "Couldn't fetch the modpack",
    "Mise à jour disponible": "Update available", "Tout est prêt": "All set", "Modpack à jour · connexion directe au serveur": "Modpack up to date · direct connection to the server",
    "Jouer": "Play", "Connexion": "Sign in", "compte Microsoft": "Microsoft account", "Patiente": "Please wait", "préparation du jeu…": "getting the game ready…",
    "En jeu": "In game", "bon jeu !": "have fun!", "mise à jour incluse": "update included", "connexion directe": "direct connection",
    "Préparation…": "Getting ready…", "Minecraft est lancé": "Minecraft is running", "Connexion automatique au serveur": "Joining the server automatically",
    // Étapes
    "Vérification du compte": "Checking your account", "Récupération du modpack": "Fetching the modpack", "Téléchargement de Minecraft": "Downloading Minecraft",
    "Installation de Java": "Installing Java", "Installation de NeoForge": "Installing NeoForge", "Bibliothèques NeoForge": "NeoForge libraries",
    "Mise à jour des mods": "Updating mods", "Lancement de Minecraft": "Launching Minecraft",
    "Connexion au compte Microsoft": "Signing in to your Microsoft account", "Lecture du modpack sur GitHub": "Reading the modpack from GitHub",
    "Fichiers du jeu (seulement la première fois)": "Game files (first time only)", "Java pour Minecraft (seulement la première fois)": "Java for Minecraft (first time only)",
    "Chargeur de mods NeoForge": "NeoForge mod loader", "Synchronisation avec les mods du serveur": "Syncing with the server's mods",
    "Ouverture de la fenêtre du jeu…": "Opening the game window…",
    // Nouveautés
    "Toutes les mises à jour du modpack et du serveur.": "Every update to the modpack and the server.", "NOUVEAU": "NEW", "Mise à jour": "Update",
    "Dernière mise à jour": "Latest update", "Aucune nouveauté pour l'instant.": "No news yet.",
    // Mods
    "Tous": "All", "Nouveaux": "New", "Mis à jour": "Updated", "MIS À JOUR": "UPDATED", "Rechercher un mod…": "Search mods…", "Rechercher un mod": "Search mods",
    "Mods optionnels": "Optional mods", "À toi de choisir : ils s'installent au prochain lancement.": "Your choice: they're installed the next time you play.",
    "Aucun mod ne correspond.": "No mods match.", "Aucun mod optionnel proposé pour l'instant.": "No optional mods offered yet.",
    "Aucun mod pour l'instant : dépose tes .jar dans modpack/mods sur GitHub.": "No mods yet: drop your .jar files into modpack/mods on GitHub.",
    "Indisponible": "Unavailable", "Impossible de charger la liste des mods.": "Couldn't load the mod list.",
    "C'est noté : le changement sera appliqué au prochain lancement du jeu.": "Got it: the change will apply the next time you play.",
    // Captures
    "Captures d'écran": "Screenshots", "Capture d'écran": "Screenshot", "Appuie sur F2 en jeu pour prendre une capture.": "Press F2 in game to take a screenshot.",
    "Ouvrir le dossier": "Open folder", "Aucune capture pour l'instant.": "No screenshots yet.", "Ouvrir": "Open",
    // Réglages
    "Mémoire allouée": "Allocated memory", "Automatique": "Automatic", "Réduire le launcher pendant le jeu": "Minimize the launcher while playing",
    "Il réapparaît quand tu quittes Minecraft.": "It comes back when you quit Minecraft.", "Affichage du jeu": "Game display",
    "Taille de la fenêtre de Minecraft au lancement.": "Size of the Minecraft window at launch.", "Fenêtré": "Windowed", "Plein écran": "Fullscreen",
    "Taille par défaut": "Default size", "Mode d'affichage": "Display mode", "Taille de la fenêtre": "Window size",
    "Sons": "Sounds", "Petits bruits mécaniques façon Create quand tu cliques ou lances le jeu.": "Little Create-style mechanical sounds when you click or launch the game.",
    "Volume des sons": "Sound volume", "Java optimisé": "Optimized Java",
    "Réglages de mémoire éprouvés pour moins de saccades avec beaucoup de mods.": "Proven memory settings for less stutter with lots of mods.",
    "Statut Discord": "Discord status", "Affiche « Joue sur … » sur ton profil Discord pendant que tu joues.": "Shows “Playing on …” on your Discord profile while you play.",
    "Langue": "Language", "Langue du launcher.": "Launcher language.", "Réparer l'installation": "Repair installation",
    "Le jeu ne se lance pas ? Vérifie et retélécharge les fichiers abîmés (Java, Minecraft, NeoForge, mods).": "Game won't start? Checks and re-downloads damaged files (Java, Minecraft, NeoForge, mods).",
    "Réparer": "Repair", "Dossiers": "Folders", "Captures d'écran, mods, journaux…": "Screenshots, mods, logs…", "Dossier du jeu": "Game folder", "Journaux": "Logs",
    "Mise à jour du launcher": "Launcher updates", "Rechercher": "Check", "Installer": "Install", "Compte": "Account", "Non connecté": "Not signed in",
    "Réglages enregistrés": "Settings saved",
    "Effets sonores": "Sound effects", "Petits sons de bois et de harpe quand tu cliques ou lances le jeu.": "Little wood and harp sounds when you click or launch the game.",
    "Musique d'ambiance": "Ambient music", "Musique douce et médiévale dans le launcher, coupée pendant que tu joues.": "Soft medieval music in the launcher, muted while you play.",
    "Volume de la musique": "Music volume",
    // Connexion
    "Connexion Microsoft": "Microsoft sign-in", "Ouvrir la page Microsoft": "Open the Microsoft page", "Copier le code": "Copy code", "Copié !": "Copied!",
    "En attente de validation…": "Waiting for confirmation…", "Annuler": "Cancel",
    "Entre ce code sur la page Microsoft, puis connecte-toi avec le compte qui possède Minecraft. Cette fenêtre se fermera toute seule.": "Enter this code on the Microsoft page, then sign in with the account that owns Minecraft. This window will close by itself.",
    // Mise à jour / crash / notifications
    "Téléchargement de la nouvelle version…": "Downloading the new version…", "Installation… le launcher va redémarrer": "Installing… the launcher will restart",
    "Le jeu a planté": "The game crashed", "Partage le rapport avec un admin sur Discord pour qu'il puisse t'aider.": "Share the report with an admin on Discord so they can help you.",
    "Partager le rapport": "Share report", "Copier": "Copy", "Envoi…": "Sending…", "Envoyé !": "Sent!",
    "Un problème est survenu": "Something went wrong", "Connecté": "Signed in", "Patiente un instant": "Hold on",
    "Attends la fin de la préparation du jeu avant de mettre à jour.": "Wait until the game is ready before updating.",
    "Le launcher est déjà à jour.": "The launcher is already up to date.", "Connexion pas encore configurée": "Sign-in not set up yet",
    "La connexion Microsoft n'est pas encore configurée (identifiant Azure manquant). Voir le README du dépôt.": "Microsoft sign-in isn't set up yet (missing Azure ID). See the repository README.",
    "Installation réparée": "Installation repaired", "Tout a été vérifié : tu peux jouer.": "Everything was checked: you can play.",
    "Compte changé": "Account switched",
    "La mise à jour se télécharge déjà, elle s'installera toute seule.": "The update is already downloading, it will install by itself.",
    // Messages du launcher (Rust)
    "Connecte-toi d'abord avec ton compte Microsoft.": "Sign in with your Microsoft account first.", "Une préparation est déjà en cours.": "The game is already being prepared.",
    "Ta session a expiré, reconnecte-toi.": "Your session expired, please sign in again.", "Le code a expiré. Recommence la connexion.": "The code expired. Please sign in again.",
    "Connexion refusée.": "Sign-in declined.", "Ce compte ne possède pas Minecraft Java Edition.": "This account doesn't own Minecraft Java Edition.",
    "Mojang n'a pas encore autorisé ce launcher (application Azure en attente de validation).": "Mojang hasn't approved this launcher yet (Azure app pending review).",
    "Le launcher est déjà à jour.": "The launcher is already up to date.", "Attends la fin de la préparation du jeu.": "Wait until the game is ready.",
  };
  const RULES = [
    [/^Serveur en ligne · (\d+) \/ (\d+) joueurs$/, "Server online · $1 / $2 players"],
    [/^Connecté : (.+)$/, "Signed in: $1"],
    [/^Bienvenue (.+) !$/, "Welcome $1!"],
    [/^(\d+) fichier\(s\) · (.+) · faite automatiquement au lancement$/, "$1 file(s) · $2 · done automatically at launch"],
    [/^Ton PC : (.+) · Conseillé pour le modpack : (.+)$/, "Your PC: $1 · Recommended for the modpack: $2"],
    [/^Attention : laisse au moins (.+) à Windows, sinon ton PC risque de ramer ou le jeu de planter\.$/, "Warning: leave at least $1 for Windows, or your PC may lag or the game may crash."],
    [/^(\d+) mods? sur le serveur(.*)$/, (m, n, rest) => `${n} mod${n > 1 ? "s" : ""} on the server` + rest.replace(/(\d+) nouveaux?/, "$1 new").replace(/(\d+) mis à jour/, "$1 updated")],
    [/^(\d+) mises? à jour$/, (m, n) => `${n} update${n > 1 ? "s" : ""}`],
    [/^(\d+) captures? · appuie sur F2 en jeu pour en prendre$/, (m, n) => `${n} screenshot${n > 1 ? "s" : ""} · press F2 in game to take more`],
    [/^Version actuelle : (v[^ ]+) · (.+)$/, (m, v, rest) => `Current version: ${v} · ` + ({ "recherche…": "checking…", "à jour": "up to date", "vérification impossible": "couldn't check" }[rest] || rest.replace(/nouvelle version (v[^ ]+) disponible/, "new version $1 available").replace(/téléchargement de (v[^ ]+)…/, "downloading $1…").replace(/téléchargement… /, "downloading… ").replace(/(v[^ ]+) prête à installer/, "$1 ready to install"))],
    [/^Version actuelle : —$/, "Current version: —"],
    [/^NOUVEAUTÉS v(.+)$/, "NEWS v$1"],
    [/^La version (v[^ ]+) est prête : le launcher redémarre…$/, "Version $1 is ready: the launcher is restarting…"],
    [/^La version (v[^ ]+) est disponible\. Clique sur « Installer »\.$/, "Version $1 is available. Click “Install”."],
    [/^Une nouvelle version du launcher \((v[^)]+)\) est disponible\. Va dans Réglages pour l'installer\.$/, "A new launcher version ($1) is available. Go to Settings to install it."],
    [/^(v[\d.]+) → (v[\d.]+)$/, "$1 → $2"],
    [/^Lien copié : (\S+) \(colle-le sur le Discord du serveur\)$/, "Link copied: $1 (paste it on the server Discord)"],
    [/^Minecraft s'est fermé avec le code (-?\d+)\.$/, "Minecraft closed with code $1."],
    [/^Launcher (v[\d.]+) · N4ssD$/, "Launcher $1 · N4ssD"],
    [/^Nécessite (.+?) · (.*)$/, "Requires $1 · $2"],
    [/^Pas disponible pour Minecraft (.+)$/, "Not available for Minecraft $1"],
    [/^dans (.+)$/, (m, d) => "in " + d.replace(/ j\b/g, " d").replace(/ min\b/g, " min")],
    [/^Impossible de vérifier les mises à jour : (.+)$/, "Couldn't check for updates: $1"],
    [/^La mise à jour a échoué : (.+)$/, "Update failed: $1"],
    [/^Impossible de joindre (.+)$/, "Couldn't reach $1"],
    [/^(.+) a répondu (.+)$/, "$1 replied $2"],
  ];
  let lang = "fr";
  const ATTRS = ["placeholder", "aria-label", "title"];
  function tr(s) {
    if (lang !== "en" || !s) return s;
    const trimmed = s.trim();
    if (!trimmed) return s;
    let out = EN[trimmed];
    if (out === undefined) {
      for (const [re, rep] of RULES) if (re.test(trimmed)) { out = trimmed.replace(re, rep); break; }
    }
    return out === undefined ? s : s.replace(trimmed, out);
  }
  function node(n) {
    if (n.nodeType === 3) {
      const t = tr(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    } else if (n.nodeType === 1 && n.tagName !== "SCRIPT" && n.tagName !== "STYLE" && n.tagName !== "PRE") {
      for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
      n.childNodes.forEach(node);
    }
  }
  return {
    t: tr,
    get lang() { return lang; },
    start(l) {
      lang = l === "en" ? "en" : "fr";
      document.documentElement.lang = lang;
      if (lang !== "en") return;
      node(document.body);
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === "characterData") node(m.target);
          else if (m.type === "attributes") node(m.target);
          else m.addedNodes.forEach(node);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    },
  };
})();
