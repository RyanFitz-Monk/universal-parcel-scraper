import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** One name of the tracker: the wording its translations give it in English, German and French, and its stage. */
interface TimeMattersName {
  readonly en: string;
  readonly de: string;
  readonly fr: string;
  readonly stage: Stage;
}

// The order statuses of the tracker's script, worded as its progress bar and status box word
// them. An order is requested, then confirmed, before time:matters has the shipment.
const STATUSES: ReadonlyMap<string, TimeMattersName> = new Map<string, TimeMattersName>([
  ['REQUEST', { en: 'Requested', de: 'Angefragt', fr: 'Demandé', stage: 'registered' }],
  ['PREADVICE', { en: 'Confirmed', de: 'Bestätigt', fr: 'Confirmé', stage: 'registered' }],
  ['OPEN', { en: 'Open', de: 'Offen', fr: 'Ouvert', stage: 'registered' }],
  ['IN_TRANSPORT', { en: 'In transport', de: 'Im Transport', fr: 'Transport en cours', stage: 'in_transit' }],
  ['PACKAGE_CLAIM', { en: 'Available', de: 'Verfügbar', fr: 'Disponible', stage: 'ready_for_pickup' }],
  ['FINISHED', { en: 'Delivered', de: 'Zugestellt', fr: 'Livré', stage: 'delivered' }],
  ['REJECTED', { en: 'Rejected by time:matters', de: 'Abgelehnt von time:matters', fr: 'Décliné par time:matters', stage: 'exception' }],
  ['CANCELLED', { en: 'Canceled', de: 'Storniert', fr: 'Annulé', stage: 'exception' }],
]);

// The tracking point types of the tracker's script. A point is one step at one stop of the
// route, so where an arrival, an availability or a release leaves the shipment depends on the
// stop: each stays in transit here, and the order's own status says when it is delivered.
const POINTS: ReadonlyMap<string, TimeMattersName> = new Map<string, TimeMattersName>([
  ['PickupCourierInformed', { en: 'Pickup courier informed', de: 'Abholkurier Info', fr: 'Coursier pour le ramassage informé', stage: 'registered' }],
  ['Acceptance', { en: 'Acceptance', de: 'Annahme', fr: 'Réception', stage: 'accepted' }],
  ['SecurityAcceptance', { en: 'Security Acceptance', de: 'Security Annahme', fr: 'Acceptation à la sécurité', stage: 'accepted' }],
  ['ExportPartnerInformed', { en: 'Export partner informed', de: 'Exportpartner Info', fr: 'Partenaire pour la douane export informé', stage: 'in_transit' }],
  ['ExportCustomsEntry', { en: 'Export customs entry', de: 'Export Zollanmeldung', fr: 'Début de la douane export', stage: 'customs' }],
  ['ExportCustomsReleased', { en: 'Export customs released', de: 'Export Zollfreigabe', fr: 'Douane export finalisée', stage: 'in_transit' }],
  ['Departure', { en: 'Departure', de: 'Abgang', fr: 'Départ', stage: 'in_transit' }],
  ['Arrival', { en: 'Arrival', de: 'Ankunft', fr: 'Arrivée', stage: 'in_transit' }],
  ['ImportCustomsEntry', { en: 'Import customs entry', de: 'Import Zollanmeldung', fr: 'Début de la douane import', stage: 'customs' }],
  ['ImportCustomsReleased', { en: 'Import customs released', de: 'Import Zollfreigabe', fr: 'Douane import finalisée', stage: 'in_transit' }],
  ['DeliveryCourierInformed', { en: 'Delivery courier informed', de: 'Zustellkurier Info', fr: 'Coursier pour la livraison informé', stage: 'in_transit' }],
  ['Available', { en: 'Available', de: 'Verfügbarkeit', fr: 'Mise à disposition', stage: 'in_transit' }],
  ['Release', { en: 'Release', de: 'Übernahme', fr: 'Collecté', stage: 'in_transit' }],
]);

/** An order status's wordings and stage, or undefined for a name the tracker's script does not list. */
export function timeMattersStatus(name: string): TimeMattersName | undefined {
  return STATUSES.get(name);
}

/** A tracking point type's wordings and stage, or undefined for a type the tracker's script does not list. */
export function timeMattersPoint(type: string): TimeMattersName | undefined {
  return POINTS.get(type);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? (STATUSES.get(code) ?? POINTS.get(code))?.stage : undefined),
  gaps: [],
};
