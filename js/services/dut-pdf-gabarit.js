/**
 * Gabarit PDF du Document Unique de Transport — **port du POC DUT**.
 *
 * Origine : `POC_OIC/DUT/js/services/dut-pdf-layout.js` (+ `dut-print.service.js`
 * pour `COPIES` et l'état d'impression). Les coordonnées millimétriques, l'ordre
 * des dix sections, le recto-verso et les annexes de débordement sont reproduits
 * à l'identique : c'est le gabarit qui a été présenté à l'OIC, et un gabarit
 * redessiné ne serait plus le même document.
 *
 * ## Ce module est pur
 *
 * Il ne lit ni le stockage, ni le DOM, ni le réseau : il reçoit un `payload`
 * déjà constitué et rend un document jsPDF. C'est ce qui permet de le rendre
 * sous Node dans `tests/dut-pdf.test.mjs` sans navigateur.
 *
 * ## Écarts délibérés par rapport au POC DUT
 *
 * 1. **jsPDF 4.2.1**, pas 2.5.1. La version vendorisée côté POC DUT cumule 15
 *    avis de sécurité, dont trois critiques (CVE-2026-31938 injection HTML,
 *    CVE-2025-68428 traversée de chemin, CVE-2026-25940 AcroForm). Aucun de ces
 *    vecteurs n'est atteignable ici — pas de `html()`, pas d'`addJS`, pas
 *    d'AcroForm, images servies depuis le dépôt — mais importer une dépendance
 *    de 2022 dans cet état serait indéfendable en revue.
 * 2. **Donnée absente = case vide, jamais zéro.** B2F ne porte pas les colis, le
 *    volume, la valeur, la facturation ni la mention « marchandise dangereuse ».
 *    Le gabarit d'origine formate `null` en `0` et une marchandise non déclarée
 *    en `NON` : ici, `nombre()` et `triEtat()` rendent `-`. Un document officiel
 *    qui annonce « 0 FCFA à percevoir » ou « Dangereuse : NON » sur une donnée
 *    jamais saisie affirme davantage que ce qui est connu.
 * 3. **Deux états au lieu de six.** B2F n'a pas le cycle
 *    VALIDE/SUSPENDU/RETIRÉ : une fiche est un aperçu ou une fiche générée. Les
 *    deux portent le filigrane `SANS VALEUR`, comme les épreuves du POC DUT.
 * 4. **L'exemplaire reste lisible en en-tête.** Le gabarit d'origine remplace le
 *    nom de l'exemplaire par `NON OFFICIEL` sur toute épreuve ; comme tout est
 *    épreuve ici, l'information disparaîtrait. On imprime les deux.
 * 5. **La référence locale s'affiche.** Le gabarit n'imprime le numéro que pour
 *    un DUT attribué, donc jamais pour B2F. La référence `DUT-…` du POC est
 *    imprimée telle quelle, sous un filigrane qui dit ce qu'elle vaut.
 * 6. **Aucun QR.** B2F n'attribue pas de jeton de vérification : l'encart
 *    « AUCUN QR » prévu par le gabarit est conservé, aucun QR n'est fabriqué.
 * 7. **Mentions finales.** La phrase du POC DUT sur l'horodatage des contrôles
 *    par QR est retirée : B2F n'a pas ce registre, l'écrire serait faux.
 *
 * @module services/dut-pdf-gabarit
 */

/** Exemplaires prévus par le formulaire officiel. */
export const COPIES = Object.freeze({
  TRANSPORTEUR: 'Exemplaire transporteur',
  EXPEDITEUR: 'Exemplaire expéditeur',
  DESTINATAIRE: 'Exemplaire destinataire',
  OIC: 'Souche OIC',
});

/** États portés par une fiche B2F. Écart n° 3. */
export const ETAT_FICHE = Object.freeze({ APERCU: 'apercu', GENERE: 'genere' });

/**
 * Habillage d'un état : libellé, couleur, filigrane, avertissement.
 * @param {{etat?: string}} fiche
 */
export function etatImpression(fiche) {
  if (fiche.etat === ETAT_FICHE.GENERE) {
    return {
      label: 'DÉMONSTRATION',
      color: [97, 105, 121],
      watermark: 'SANS VALEUR',
      qr: 'Aucun QR',
      warning:
        "Fiche de démonstration du POC Bourse de fret. Aucune valeur administrative : " +
        "elle n'est ni attribuée, ni transmise au système officiel DUT.",
    };
  }
  return {
    label: 'APERÇU',
    color: [97, 105, 121],
    watermark: 'SANS VALEUR',
    qr: 'Aucun QR',
    warning:
      "Aperçu avant génération. Les informations ne sont pas encore enregistrées " +
      'et ce tirage ne constitue aucun document.',
  };
}

/* ------------------------------------------------------------------ *
 * Totaux — l'absence de donnée se propage, elle ne devient pas zéro
 * ------------------------------------------------------------------ */

/**
 * Somme une colonne de marchandises. Rend `null` si **aucune** ligne ne porte la
 * donnée : additionner des cases vides donnerait un total inventé (écart n° 2).
 * @param {Array<Record<string, unknown>>} lignes
 * @param {string} champ
 * @returns {number|null}
 */
function somme(lignes, champ) {
  const valeurs = (lignes || [])
    .map((l) => l[champ])
    .filter((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  return valeurs.length === 0 ? null : valeurs.reduce((t, v) => t + Number(v), 0);
}

/**
 * Totaux de la section 4.
 * @param {Array<Record<string, unknown>>} marchandises
 */
export function totauxMarchandises(marchandises) {
  return {
    quantite: somme(marchandises, 'quantite'),
    poidsTonnes: somme(marchandises, 'poidsTonnes'),
    volumeM3: somme(marchandises, 'volumeM3'),
  };
}

/**
 * Totaux des sections 5 et 6. Chaque partie porte ses postes, sa TVA et son
 * timbre ; un poste absent ne vaut pas zéro.
 * @param {{expediteur?: Record<string, unknown>, destinataire?: Record<string, unknown>}} [facturation]
 */
export function totauxFacturation(facturation = {}) {
  const POSTES = ['prixTransport', 'accessoires', 'complementaires', 'autres'];
  const partie = (source = {}) => {
    const postes = POSTES.map((p) => source[p]).filter(
      (v) => v != null && v !== '' && Number.isFinite(Number(v)),
    );
    const ht = postes.length === 0 ? null : postes.reduce((t, v) => t + Number(v), 0);
    const tauxTva = source.tvaRate == null ? null : Number(source.tvaRate);
    const tvaMontant = ht == null || tauxTva == null ? null : Math.round((ht * tauxTva) / 100);
    const timbre = source.timbre == null ? null : Number(source.timbre);
    const total =
      ht == null && tvaMontant == null && timbre == null
        ? null
        : (ht ?? 0) + (tvaMontant ?? 0) + (timbre ?? 0);
    return { ht, tauxTva, tvaMontant, timbre, total };
  };
  const expediteur = partie(facturation.expediteur);
  const destinataire = partie(facturation.destinataire);
  const cumul = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  return {
    expediteur,
    destinataire,
    totalExpediteur: expediteur.ht,
    totalDestinataire: destinataire.ht,
    tva: cumul(expediteur.tvaMontant, destinataire.tvaMontant),
    timbreTotal: cumul(expediteur.timbre, destinataire.timbre),
    totalAPercevoir: cumul(expediteur.total, destinataire.total),
  };
}

/* ------------------------------------------------------------------ *
 * Rendu — coordonnées millimétriques du formulaire officiel
 * ------------------------------------------------------------------ */

/** Encre, gris de libellé, filets, fonds. Valeurs du POC DUT. */
const N = [12, 45, 74];
const G = [90, 99, 115];
const BORDER = [191, 202, 214];
const LIGHT = [241, 245, 249];

/** Helvetica intégré à jsPDF n'a pas les espaces fines ni les tirets longs. */
const texte = (valeur) =>
  String(valeur ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[’]/g, "'")
    .replace(/→/g, '>');

/** Écart n° 2 : une donnée absente s'imprime `-`, jamais `0`. */
const nombre = (valeur) =>
  valeur == null || valeur === '' || !Number.isFinite(Number(valeur))
    ? '-'
    : texte(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(valeur)));

/** Écart n° 2 : un booléen non renseigné n'est pas `NON`. */
const triEtat = (valeur) => (valeur == null ? '-' : valeur ? 'OUI' : 'NON');

const date = (valeur) => (valeur ? new Date(valeur).toLocaleDateString('fr-FR') : '-');

const heure = (valeur) =>
  valeur
    ? new Date(valeur).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

/**
 * Rend le DUT recto-verso.
 *
 * @param {Function} jsPDF Constructeur jsPDF (global UMD en navigateur, `require` en test).
 * @param {Object} payload Charge canonique produite par `dut-pdf.service.js`.
 * @param {string} empreinte SHA-256 hexadécimal du payload — imprimé en pied de page.
 * @param {{logo?: string, emblem?: string, qr?: string|null}} [images] Data-URL.
 * @returns {Object} Document jsPDF, à `save()` ou à sérialiser.
 */
export function construireDutPdf(jsPDF, payload, empreinte, { logo, emblem, qr } = {}) {
  const d = payload.document;
  const g = d.general;
  const a = d.annexes || {};
  const state = etatImpression(d);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  /** Valeurs trop longues pour leur case : reportées en annexe, jamais tronquées en silence. */
  const extras = [];

  const put = (valeur, x, y, size = 9, bold = false, color = N, options = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(Array.isArray(valeur) ? valeur.map(texte) : texte(valeur), x, y, options);
  };
  const rect = (x, y, w, h, fill = LIGHT) => {
    doc.setFillColor(...fill);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h, 'FD');
  };
  const lignes = (valeur, largeur, size = 8) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(texte(valeur || '-'), largeur);
  };
  function bloc(label, valeur, x, y, w, max = 2, size = 8) {
    put(label.toUpperCase(), x, y, 6.5, true, G);
    const enroule = lignes(valeur, w, size);
    if (enroule.length > max) extras.push({ label, valeur: texte(valeur) });
    put(
      enroule.length > max
        ? [...enroule.slice(0, max - 1), `${enroule[max - 1]} [...]`]
        : enroule,
      x,
      y + 4,
      size,
      false,
      N,
      { lineHeightFactor: 1.2 },
    );
  }
  function section(titre, y) {
    doc.setFillColor(...N);
    doc.rect(11, y - 2, 1.6, 1.6, 'F');
    put(titre, 15, y, 8, true);
    doc.setDrawColor(...BORDER);
    doc.line(11, y + 2, 199, y + 2);
  }
  function entete(large = false) {
    if (emblem) doc.addImage(emblem, 'PNG', 11, 7, 16, 15);
    put("RÉPUBLIQUE DE CÔTE D'IVOIRE", 31, 13, 9, true);
    put('Union - Discipline - Travail', 31, 18, 7, false, G);
    if (logo) doc.addImage(logo, 'JPEG', 174, 4, 26, 22);
    rect(0, 26, 210, large ? 18 : 13, N);
    put('Office Ivoirien des Chargeurs', 11, 33, large ? 12 : 10, true, [255, 255, 255]);
    if (large) put('DOCUMENT UNIQUE DE TRANSPORT', 11, 39, 9, true, [255, 255, 255]);
    // Écart n° 4 : le POC DUT masque l'exemplaire sur une épreuve ; tout est
    // épreuve ici, donc les deux mentions cohabitent.
    put(
      `NON OFFICIEL · ${COPIES[payload.copy]}`,
      198,
      32,
      7,
      true,
      [255, 255, 255],
      { align: 'right' },
    );
    put(
      large ? 'Décret n° 2015-270 du 22 avril 2015' : 'MODÈLE RÉVISÉ - POC LOCAL',
      198,
      large ? 39 : 37,
      6,
      false,
      [210, 226, 244],
      { align: 'right' },
    );
    const yy = large ? 44 : 39;
    doc.setDrawColor(...state.color);
    doc.setLineWidth(0.25);
    for (let x = 0; x < 210; x += 2) doc.line(x, yy, x + 1.2, yy + 1.3);
    // Bande ondulée : décor repris du gabarit, aucune garantie d'authenticité.
    doc.setDrawColor(80, 133, 181);
    doc.setLineWidth(0.1);
    for (let x = 0; x < 209; x += 0.8) {
      doc.line(x, yy + 0.7 + Math.sin(x) * 0.35, x + 0.8, yy + 0.7 + Math.sin(x + 0.8) * 0.35);
    }
  }
  function statut(y, compact = false) {
    if (state.watermark) {
      put(state.watermark, 112, y + (compact ? 11 : 16), compact ? 18 : 23, true, [229, 229, 232], {
        align: 'center',
        angle: 12,
      });
    }
    // Écart n° 5 : la référence locale s'imprime, sous le filigrane qui la qualifie.
    put(d.dutNumber || 'NON ATTRIBUÉE', 11, y, compact ? 12 : 19, true);
    rect(11, y + 3, 28, 6, state.color);
    put(state.label, 25, y + 7.2, 7, true, [255, 255, 255], { align: 'center' });
    put(
      `Impression n° ${payload.rank}  |  Émis le ${date(g.dateEmission)}`,
      42,
      y + 7,
      7,
      false,
      G,
    );
    const etatTexte = `${state.label} : ${date(g.dateEmission)}${heure(g.dateEmission) ? ` ${heure(g.dateEmission)}` : ''}`;
    put(lignes(etatTexte, 150, 7).slice(0, 2), 11, y + 15, 7, false, G);
    if (!compact) {
      bloc('Antenne émettrice', d.antennaName, 11, y + 23, 47, 1);
      bloc('Partenaire agréé', d.partnerName, 64, y + 23, 53, 1);
      bloc("Plage d'attribution", payload.operation, 123, y + 23, 37, 1);
      // Écart n° 6 : aucun QR n'est fabriqué ; l'encart du gabarit reste visible.
      if (qr) {
        rect(166, y - 9, 33, 33, [255, 255, 255]);
        doc.addImage(qr, 'PNG', 168, y - 7, 29, 29);
        put(state.qr, 182.5, y + 28, 6.5, true, state.color, { align: 'center' });
      } else {
        rect(166, y - 9, 33, 33);
        put('AUCUN QR', 182.5, y + 9, 8, true, G, { align: 'center' });
      }
    }
    const avertissement = lignes(state.warning, 188, 6.5);
    if (avertissement.length > 2) extras.push({ label: 'État', valeur: state.warning });
    put(avertissement.slice(0, 2), 11, y + (compact ? 22 : 37), 6.5, true, state.color, {
      lineHeightFactor: 1.1,
    });
  }

  entete(true);
  statut(57);

  section('1 - TRANSPORTEUR, VÉHICULE ET CONDUCTEUR', 106);
  bloc('Transporteur', g.transporterName, 11, 112, 61, 2, 9);
  bloc('Immatriculation', g.immatriculation, 77, 112, 56, 1, 9);
  bloc('Conducteur', `${g.driverNom || ''} ${g.driverPrenoms || ''}`.trim(), 141, 112, 58, 2, 9);
  bloc('Registre de commerce', payload.transporter.registre, 11, 128, 60, 1);
  bloc(
    'Type / capacité',
    `${payload.vehicle.type || '-'} / ${payload.vehicle.capaciteTonnes ?? '-'} t`,
    77,
    128,
    58,
    1,
  );
  bloc(
    "Permis / pièce d'identité",
    `${g.driverPermis || '-'} / ${g.driverPiece || '-'}`,
    141,
    128,
    58,
    2,
    7,
  );

  section('2 - EXPÉDITEUR ET DESTINATAIRE', 144);
  for (const [partie, x, label] of [
    [d.expediteur, 11, 'Expéditeur'],
    [d.destinataire, 109, 'Destinataire'],
  ]) {
    bloc(
      label,
      `${partie.raisonSociale || '-'}\n${partie.adresse || '-'} / ${partie.contact || '-'}\nRC ${partie.registre || '-'} / Réf. ${partie.reference || '-'}`,
      x,
      150,
      89,
      4,
      8,
    );
  }

  section('3 - TRAJET', 175);
  rect(11, 179, 188, 24);
  const t = d.trajet;
  bloc(
    'Chargement',
    `${t.chargement.ville || '-'} / ${t.chargement.lieu || '-'}\n${t.chargement.adresse || ''}\n${date(t.dateDepart)} / ${t.heureDepart || '-'}`,
    15,
    184,
    65,
    3,
    7.5,
  );
  bloc(
    'Déchargement',
    `${t.dechargement.ville || '-'} / ${t.dechargement.lieu || '-'}\n${t.dechargement.adresse || ''}\n${date(t.dateArrivee)} / ${t.heureArrivee || '-'}`,
    132,
    184,
    63,
    3,
    7.5,
  );
  put(texte(g.transportType || '-').replaceAll('_', ' '), 105, 188, 6.5, true, N, {
    align: 'center',
  });
  put(texte(g.compte || '-').replaceAll('_', ' '), 105, 194, 6.5, true, N, { align: 'center' });

  section('4 - MARCHANDISES TRANSPORTÉES', 210);
  const colonnes = [11, 73, 112, 132, 152, 174];
  const largeurs = [60, 37, 18, 18, 20, 25];
  const enteteMarchandises = (y) => {
    rect(11, y, 188, 7, N);
    ['DÉSIGNATION / NATURE', 'EMBALLAGE', 'COLIS', 'POIDS (T)', 'VOL. (M³)', 'VALEUR'].forEach(
      (v, i) => put(v, colonnes[i] + 2, y + 4.5, 6, true, [255, 255, 255]),
    );
  };
  const valeurMarchandise = (m) =>
    m.valeur == null || m.valeur === '' ? '-' : `${nombre(m.valeur)} ${m.devise || 'FCFA'}`;
  const hauteurLigne = (m) =>
    Math.max(
      lignes(m.designation ? `${m.designation} / ${m.nature}` : m.nature, 56, 7).length,
      lignes(m.emballage, 33, 7).length,
      lignes(valeurMarchandise(m), 21, 7).length,
    ) * 3 + 3;
  function ligneMarchandise(m, y) {
    const valeurs = [
      m.designation ? `${m.designation} / ${m.nature}` : m.nature,
      m.emballage,
      nombre(m.quantite),
      nombre(m.poidsTonnes),
      nombre(m.volumeM3),
      valeurMarchandise(m),
    ];
    const rangees = valeurs.map((v, i) => lignes(v, largeurs[i] - 4, 7));
    const h = Math.max(...rangees.map((r) => r.length)) * 3 + 3;
    rangees.forEach((r, i) =>
      put(r, colonnes[i] + 2, y + 4, 7, false, N, { lineHeightFactor: 1.15 }),
    );
    doc.setDrawColor(...BORDER);
    doc.line(11, y + h, 199, y + h);
    return h;
  }
  enteteMarchandises(214);
  let cy = 221;
  const debordement = [];
  for (const m of d.marchandises || []) {
    if (cy + hauteurLigne(m) > 242 || debordement.length) debordement.push(m);
    else cy += ligneMarchandise(m, cy);
  }
  if (debordement.length) {
    put(
      `${debordement.length} ligne(s) supplémentaire(s) : voir annexe marchandises.`,
      13,
      cy + 4,
      6.5,
      true,
      G,
    );
  }
  const totaux = totauxMarchandises(d.marchandises);
  const parDevise = {};
  for (const m of d.marchandises || []) {
    if (m.valeur == null || m.valeur === '') continue;
    const devise = m.devise || 'FCFA';
    parDevise[devise] = (parDevise[devise] || 0) + Number(m.valeur);
  }
  const deviseTexte =
    Object.keys(parDevise).length === 0
      ? '-'
      : Object.entries(parDevise)
          .map(([devise, valeur]) => `${nombre(valeur)} ${devise}`)
          .join(' / ');
  put(
    `TOTAL : ${nombre(totaux.quantite)} colis | ${nombre(totaux.poidsTonnes)} t | ${nombre(totaux.volumeM3)} m³`,
    11,
    247,
    7,
    true,
  );
  const ligneValeur = lignes(`Valeur : ${deviseTexte}`, 188, 6.5);
  if (ligneValeur.length > 1) extras.push({ label: 'Valeur totale par devise', valeur: deviseTexte });
  put(ligneValeur[0], 11, 251, 6.5);
  put(
    `Dangereuse : ${triEtat(d.dangereuse)}  /  Température dirigée : ${triEtat(d.temperatureControlee)}`,
    11,
    254,
    6.5,
    true,
    G,
  );

  section('5 - CONDITIONS FINANCIÈRES', 260);
  const f = totauxFacturation(d.facturation);
  put(`Expéditeur HT : ${nombre(f.totalExpediteur)} FCFA`, 11, 266, 7);
  put(`Destinataire HT : ${nombre(f.totalDestinataire)} FCFA`, 11, 271, 7);
  put(`TVA : ${nombre(f.tva)} / Timbres : ${nombre(f.timbreTotal)} FCFA`, 11, 276, 7);
  rect(117, 264, 82, 12, N);
  put('TOTAL À PERCEVOIR', 121, 268, 6.5, true, [255, 255, 255]);
  put(`${nombre(f.totalAPercevoir)} FCFA`, 195, 273, 10, true, [255, 255, 255], { align: 'right' });

  /* ----------------------------- verso ----------------------------- */

  doc.addPage();
  entete();
  statut(50, true);

  section('6 - DÉTAIL DES POSTES FACTURÉS', 79);
  rect(11, 83, 188, 7);
  put('POSTE', 14, 87.5, 7, true);
  put('EXPÉDITEUR (FCFA)', 139, 87.5, 7, true, N, { align: 'right' });
  put('DESTINATAIRE (FCFA)', 196, 87.5, 7, true, N, { align: 'right' });
  let fy = 95;
  for (const [label, cle] of [
    ['Prix du transport', 'prixTransport'],
    ['Frais accessoires', 'accessoires'],
    ['Frais complémentaires', 'complementaires'],
    ['Autres frais', 'autres'],
  ]) {
    put(label, 14, fy, 8);
    put(nombre(d.facturation?.expediteur?.[cle]), 139, fy, 8, false, N, { align: 'right' });
    put(nombre(d.facturation?.destinataire?.[cle]), 196, fy, 8, false, N, { align: 'right' });
    doc.setDrawColor(...BORDER);
    doc.line(11, fy + 2, 199, fy + 2);
    fy += 7;
  }
  const taux = (v) => (v == null ? '-' : `${v}%`);
  for (const [label, x1, x2] of [
    ['Sous-total HT', f.expediteur.ht, f.destinataire.ht],
    [
      `TVA (${taux(f.expediteur.tauxTva)} / ${taux(f.destinataire.tauxTva)})`,
      f.expediteur.tvaMontant,
      f.destinataire.tvaMontant,
    ],
    ['Timbre fiscal', f.expediteur.timbre, f.destinataire.timbre],
    ['Total', f.expediteur.total, f.destinataire.total],
  ]) {
    put(label, 14, fy, 7, true);
    put(nombre(x1), 139, fy, 7, true, N, { align: 'right' });
    put(nombre(x2), 196, fy, 7, true, N, { align: 'right' });
    fy += 6;
  }

  section('7 - ANNEXES ET INSTRUCTIONS', 150);
  bloc('Emballages / supports', a.emballages, 11, 156, 88, 2);
  bloc(
    'Pièces jointes',
    [...(a.pieces || []).map((p) => p.name), ...payload.files.map((p) => p.name)].join(', '),
    109,
    156,
    89,
    2,
  );
  bloc(
    'Instructions / prestations',
    [a.instructions, a.accessoires, a.complementaires].filter(Boolean).join('\n'),
    11,
    169,
    188,
    3,
    7.5,
  );

  section('8 - RÉSERVES', 188);
  rect(11, 192, 91, 18, [255, 255, 255]);
  rect(108, 192, 91, 18, [255, 255, 255]);
  bloc('À la prise en charge', a.reservePriseEnCharge, 14, 197, 85, 2, 7);
  bloc('À la livraison', a.reserveLivraison, 111, 197, 85, 2, 7);

  section('9 - VISAS DE CONTRÔLE ROUTIER', 216);
  for (let i = 0; i < 4; i += 1) {
    const x = 11 + i * 48;
    rect(x, 220, 44, 21, [255, 255, 255]);
    put(`CONTRÔLE ${i + 1}`, x + 2, 224, 6.5, true);
    put('Date / lieu', x + 2, 229, 6, false, G);
    put('Agent / matricule', x + 2, 233, 6, false, G);
    put('Cachet et visa', x + 2, 239, 6, false, G);
  }
  // Écart n° 7 : B2F n'a pas de registre de contrôle, la phrase du POC DUT sur
  // l'horodatage par QR n'est pas reprise.
  put('Cases à viser à la main : cette démonstration ne tient aucun registre de contrôle.', 11, 245, 6.5, false, G);

  section('10 - SIGNATURES', 249);
  ['EXPÉDITEUR', 'TRANSPORTEUR / CONDUCTEUR', 'DESTINATAIRE'].forEach((v, i) => {
    const x = 11 + i * 64;
    rect(x, 253, 60, 15, [255, 255, 255]);
    put(v, x + 2, 257, 6.2, true);
    put('Nom, qualité, date et signature', x + 2, 262, 6, false, G);
  });
  put(
    lignes(
      'MENTIONS : Ce document accompagne la marchandise du voyage désigné et doit être présenté au contrôle. ' +
        "Toute altération doit être signalée. Cette fiche est produite par une démonstration locale : elle n'est " +
        'pas attribuée par l’Office Ivoirien des Chargeurs et ne peut pas être présentée comme un DUT valide.',
      188,
      6,
    ),
    11,
    272,
    6,
    false,
    G,
    { lineHeightFactor: 1.1 },
  );

  /* --------------------------- annexes ----------------------------- */

  // Les données B2F sans case au formulaire officiel (carte de transport, carte
  // grise, contacts, référence de la mise en relation) sont reportées en annexe
  // plutôt que tues : l'empreinte les couvre, le lecteur doit pouvoir les voir.
  const LIBELLES_COMPLEMENTS = {
    appariementReference: 'Référence de la mise en relation',
    carteTransportNumero: 'Carte de transport du véhicule',
    carteGrise: 'Carte grise du véhicule',
    chauffeurTelephone: 'Téléphone du chauffeur',
    transporteurTelephone: 'Téléphone du transporteur',
    transporteurEmail: 'E-mail du transporteur',
  };
  for (const [cle, valeur] of Object.entries(d.complements || {})) {
    if (valeur) extras.push({ label: LIBELLES_COMPLEMENTS[cle] || cle, valeur });
  }

  if (debordement.length) {
    doc.addPage();
    entete();
    section('ANNEXE - MARCHANDISES (SUITE DU RECTO)', 49);
    enteteMarchandises(54);
    let y = 61;
    for (const m of debordement) {
      const h = hauteurLigne(m);
      if (h > 205) {
        extras.push({ label: 'Marchandise (détail intégral)', valeur: JSON.stringify(m) });
        continue;
      }
      if (y + h > 273) {
        doc.addPage();
        entete();
        enteteMarchandises(47);
        y = 54;
      }
      y += ligneMarchandise(m, y);
    }
  }
  if (extras.length) {
    doc.addPage();
    entete();
    section('ANNEXE - MENTIONS COMPLÉMENTAIRES', 49);
    let y = 58;
    for (const item of extras) {
      if (y > 260) {
        doc.addPage();
        entete();
        y = 49;
      }
      put(item.label, 11, y, 8, true);
      y += 5;
      for (const ligne of lignes(item.valeur, 186, 8)) {
        if (y > 272) {
          doc.addPage();
          entete();
          y = 49;
        }
        put(ligne, 11, y, 8);
        y += 4;
      }
      y += 5;
    }
  }

  /* -------------------------- pieds de page ------------------------ */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    if (p > 2) put(`${d.dutNumber || 'APERÇU'} | ${state.label}`, 11, 44, 7, true, state.color);
    doc.setDrawColor(...N);
    doc.line(11, 280, 199, 280);
    put(`SHA-256 : ${empreinte.slice(0, 32)}`, 11, 284, 6);
    put(empreinte.slice(32), 11, 287.5, 6);
    put(`Impression ${payload.rank} - ${COPIES[payload.copy]}`, 199, 284, 6, true, N, {
      align: 'right',
    });
    put(
      `Page ${p} / ${pages} - ${date(payload.generatedAt)} ${heure(payload.generatedAt)}`,
      199,
      287.5,
      6,
      false,
      G,
      { align: 'right' },
    );
    put(
      'POC LOCAL - Les marques visuelles et cette empreinte ne valent pas signature officielle.',
      11,
      291,
      6,
      false,
      G,
    );
    put(`${(`${d.dutNumber || 'APERÇU'} / OFFICEIVOIRIENDESCHARGEURS / `).repeat(5)}`, 11, 295, 3, false, G);
    if (p > 2 && state.watermark) {
      put(state.watermark, 105, 150, 30, true, [225, 226, 230], { align: 'center', angle: 30 });
    }
  }
  doc.setProperties({
    title: `DUT ${d.dutNumber || 'Aperçu'} - ${COPIES[payload.copy]}`,
    subject: `POC Bourse de fret - ${state.label} - SHA-256 ${empreinte}`,
    author: 'Bourse de fret (B2F) - POC OIC',
    creator: 'Gabarit DUT recto-verso porté du POC DUT',
  });
  return doc;
}
