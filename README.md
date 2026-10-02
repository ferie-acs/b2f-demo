# B2F — Bourse de Fret · démonstration publique

Preuve de concept de la **Bourse de Fret** de l'Office Ivoirien des Chargeurs :
une plateforme de mise en relation entre chargeurs (affréteurs) et transporteurs.

**→ [Ouvrir la démonstration](https://ferie-acs.github.io/b2f-demo/)**

## Ce que c'est, et ce que ce n'est pas

- **Preuve de concept.** Toutes les données sont **fictives** et marquées
  « DÉMO ». Aucune entreprise, aucun véhicule, aucun montant n'est réel.
- **Aucun serveur.** L'application s'exécute entièrement dans le navigateur ;
  les données vivent dans le stockage local de l'onglet. Rien n'est transmis.
- **Aucune valeur administrative.** Les documents de transport produits ici
  portent le filigrane « SANS VALEUR » : ils ne sont ni attribués, ni transmis
  au système officiel DUT.

## Essayer

Depuis l'écran de connexion, le volet « Essayer un compte de démonstration »
ouvre cinq profils : affréteur, transporteur, auxiliaire, concessionnaire et
autorité de contrôle. Chaque profil voit un périmètre différent — c'est l'objet
de la démonstration.

Un parcours complet tient en quelques minutes : publier un fret, recevoir une
offre, valider la mise en relation, puis générer le Document Unique de Transport
au gabarit officiel (recto-verso, dix sections, export PDF).

## Technique

Aucune dépendance de construction, aucun paquet à installer : HTML, CSS et
modules JavaScript natifs. Une seule bibliothèque tierce, servie localement —
[jsPDF](https://github.com/parallax/jsPDF) 4.2.1, pour l'export du DUT.

Pour exécuter la démonstration hors ligne :

```sh
python3 -m http.server 8081
```

puis ouvrir <http://localhost:8081/>. Le protocole `file://` ne convient pas :
les modules JavaScript et Web Crypto exigent un contexte sécurisé.

---

Ce dépôt ne contient que l'application publiée. Le dépôt de travail, le cadrage,
les rapports de recette et la documentation d'architecture restent privés.
