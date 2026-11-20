# Pradervand & Duay SA — site 3D

Site vitrine d'une page, direction « studio sombre ». Au scroll, une toiture en grandes
ardoises rectangulaires à crochets (rives et faîtage en métal gris) se démonte rang par
rang : les ardoises montent et s'écartent en gardant leur alignement, le lattage se
détache de la sous-couverture, puis tout se repose du bas du pan jusqu'au faîte. La
toiture neuve réapparaît au contact. Rendu en temps réel avec Three.js (inclus
localement), sans vidéo. Les textes sont ceux du site en ligne, mot pour mot.

## Ouvrir

- `version-monofichier.html` : s'ouvre d'un double-clic, sans serveur. Idéal pour un
  envoi par e-mail.
- `index.html` : version hébergeable. Elle a besoin d'un serveur (local ou en ligne), car
  le navigateur refuse de charger les modules JavaScript depuis le disque. En local :
  `python3 serve.py 5180`, puis <http://127.0.0.1:5180>.

## Modifier

| Quoi | Où |
|---|---|
| Textes, téléphone, e-mail, horaires | `index.html` |
| Couleurs, typographie, mise en page | `css/styles.css` (variables en tête de fichier) |
| Cadrage de la caméra par chapitre | `KEYS` dans `js/app.js` |
| Moments du démontage et de la repose | `TIMELINE` et `setLayers` dans `js/roof.js` |
| Dimensions du toit, ardoises, matériaux | `ROOF` et la section « matériaux » de `js/roof.js` |
| Photos | `assets/img/` (versions `-sm` pour le téléphone) |

Après toute modification, régénérez la version monofichier :

```sh
python3 build_monofichier.py
```

## Contrôle

Dans la console du navigateur, `__ped.snap(0.55)` place le scroll à 55 % de la partie
3D (vue éclatée) ; `__ped.state` donne le nombre d'ardoises déposées.

## Services tiers

La police Jost (Google Fonts) et le plan d'accès (Google Maps) sont chargés depuis
Internet ; tout le reste est servi par le site. Voir `mentions-legales.html`.
