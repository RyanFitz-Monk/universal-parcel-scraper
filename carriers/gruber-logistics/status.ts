import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap, IntentionalStatusGap } from '../../core/status/statusMap.js';

export type GruberLanguage = 'en' | 'it' | 'de';

// The names the tracking page gives each event code of the gateway's reply, in its three languages.
const NAMES: readonly (readonly [code: string, en: string, it: string, de: string])[] = [
  ['TST', 'Start activity', 'Inizio attività', 'Anfang Tätigkeit'],
  ['LOA', 'Arrival at loading place', 'Arrivato al posto di carico', 'Anmeldung an der Ladestelle'],
  ['LOS', 'Loading started', 'Carico iniziato', 'Beginn der Ladetätigkeiten'],
  ['LOC', 'Loading completed', 'Carico finito', 'Abschluss der Ladetätigkeiten'],
  ['TCO', 'Trailer connected', 'Trailer connesso', 'Auflieger angekuppelt'],
  ['UNA', 'Arrival at unloading place', 'Arrivato al posto di scarico', 'Anmeldung an der Entladestelle'],
  ['UNS', 'Unloading started', 'Scarico iniziato', 'Beginn der Entladetätigkeiten'],
  ['UNC', 'Unloading completed', 'Scarico completato', 'Abschluss der Entladetätigkeiten'],
  ['TSC', 'Trailer disconnected', 'Trailer disconnesso', 'Auflieger abgekuppelt'],
  ['VLE', 'TBD - VLE', 'TBD - VLE', 'TBD - VLE'],
  ['VIN', 'TBD - VIN', 'TBD - VIN', 'TBD - VIN'],
  ['TBD', 'Unmapped event', 'Evento non riconosciuto', 'nicht abgebildetes Ereignis'],
  ['VRA', 'Pickup arrived at warehouse', 'Ritiro arrivato a deposito', 'Abholung an Lager angekommen'],
  ['MCD', 'Goods delivered at warehouse', 'Merce consegnata deposito', 'Ware an Lager zugestellt'],
  ['VRP', 'Pickup trip started', 'Viaggio di ritiro partito', 'Abholungsreise gestartet'],
  ['COR', 'Shipment delivered', 'Spedizione consegnata', 'Sendung zugestellt'],
  ['VPD', 'Departed from warehouse', 'Partito da deposito', 'Abgefahren vom Lager'],
  ['VAD', 'Arrival at warehouse', 'Arrivato a deposito', 'Angekommen an Lager'],
  ['VPG', 'Departed from Gruber warehouse', 'Partito da deposito Gruber', 'Abgefahren vom Gruber-Lager'],
  ['VAG', 'Arrived at Gruber warehouse', 'Arrivato a deposito Gruber', 'Angekommen an Gruber-Lager'],
  ['RIE', 'Pickup completed', 'Ritiro eseguito', 'Abholung ausgeführt'],
  ['RIM', 'Pickup failed', 'Ritiro mancato', 'Abholung ausgefallen'],
  ['SNC', 'Shipment not in delivery', 'Spedizione non in consegna', 'Sendung nicht in Zustellung'],
  ['SPC', 'Out for delivery', 'In consegna', 'Zur Auslieferung bereit'],
  ['NOC', 'Delivery failed', 'Consegna mancata', 'Zustellung ausgefallen'],
  ['CMG', 'Delivery failed - back to stock', 'Consegna mancata - giacenza', 'Zustellung ausgefallen - Lagernd'],
  ['CMR', 'Delivery failed – new delivery', 'Consegna mancata - riconsegna', 'Zustellung ausgefallen – Neue Zustellung'],
  ['SRU', 'Shipment refused', 'Spedizione rifiutata', 'Sendung abgelehnt'],
  ['ANM', 'Incident', 'Anomalia', 'Störung'],
  ['DAN', 'Damage', 'Danno', 'Beschädigung'],
  ['RDD', 'Picked up by recipient', 'Ritirato da destinatario', 'Abgeholt vom Empfänger'],
  ['CRI', 'Shipment delivered with specific reservation', 'Consegnata con riserva specifica', 'Sendung mit besonderem Vorbehalt zugestellt'],
  ['CRR', 'Shipment delivered with delay', 'Spedizione consegnata in ritardo', 'Sendung zugestellt mit Verspätung'],
  ['VPC', 'Trip started from partner', 'Viaggio partito da corrispondente', 'Reise vom Korrespondenten angefangen'],
  ['VCC', 'Trip loaded at customer', 'Viaggio caricato da cliente', 'Reise beim Kunden beladen'],
  ['VSC', 'Trip delivered to customer', 'Viaggio consegnato a cliente', 'Reise an Kunden zugestellt'],
  ['L-ORC', 'Order received', 'Ordine ricevuto', 'Bestellung eingegangen'],
  ['L-OPL', 'Order planned', 'Ordine pianificato', 'Bestellung geplant'],
  ['L-PST', 'Picking started', 'Prelievo iniziato', 'Kommissionierung gestartet'],
  ['L-PCP', 'Picking completed', 'Prelievo completato', 'Kommissionierung abgeschlossen'],
  ['L-OLO', 'Loaded on truck', 'Caricato su camion', 'Auf LKW geladen'],
  ['Confirm', 'Confirm', 'Conferma', 'Bestätigen'],
  ['SIT', 'In transit at partner depot', 'Transito su deposito corrispondente', 'Unterwegs im Partnerdepot'],
  ['GIC', 'Shipment stock opened', 'Giacenza aperta', 'Offener Bestand'],
  ['313', 'Returned to warehouse', 'Rientrato a magazzino', 'Zurück zum Lager'],
  ['402', 'Shipment stock closed', 'Giacenza chiusa', 'Bestand geschlossen'],
  ['SPH', 'Arrived at partner hub', 'Arrivato presso HUB corrispondente', 'Im Partner-Hub angekommen'],
  ['SAR', 'Arrived at partner hub', 'Arrivato presso HUB corrispondente', 'Im Partner-Hub angekommen'],
  ['IDC', 'Arrived at Terminal', 'Arrivata al Terminal', 'Am Terminal angekommen'],
  ['44S', 'P44 tracking started', 'Tracking P44 avviato', 'P44-Tracking gestartet'],
  ['VPP', 'Departure from the international partner', 'Partito da partner internazionale', 'Abfahrt vom internationalen Partner'],
  ['VPM', 'Trip started from Customer', 'Viaggio partito dal Cliente', 'Die Fahrt begann beim Kunden'],
  ['131', 'Booked Delivery', 'Consegna Prenotata', 'Zustellung gebucht'],
  ['RIN', 'Pickup order received', 'Ordine di ritiro acquisito', 'Abholauftrag eingegangen'],
  ['SRA', 'Pickup arrived at Gruber Depot', 'Ritiro Arrivato in Filiale', 'Abholung am Gruber-Lager angekommen'],
  ['523', 'Pickup not completed', 'Ritiro non eseguito', 'Abholung nicht abgeschlossen'],
  ['SDC', 'Customs clearance in progress', 'Sdoganamento in corso', 'Zollabfertigung in Bearbeitung'],
  ['404', 'Shipment on hold - Instructions Received', 'Giacenza - Istruzioni Ricevute', 'Sendung angehalten - Anweisungen erhalten'],
  ['403', 'Shipment On Hold - Notified', 'Giacenza - Notificata', 'Sendung angehalten - Benachrichtigt'],
  ['139', 'Cancelled Shipment', 'Spedizione Annullata', 'Sendung storniert'],
  ['SPN', 'Not Delivered', 'Non Consegnata', 'Nicht zugestellt'],
];

const NAMED: ReadonlyMap<string, Readonly<Record<GruberLanguage, string>>> = new Map(
  NAMES.map(([code, en, it, de]) => [code, { en, it, de }] as const));

/** The page's name for an event code in the reader's language, or undefined for a code the page does not name. */
export function gruberEventName(code: string, language: GruberLanguage): string | undefined {
  return NAMED.get(code)?.[language];
}

// Each code is staged by what its name says. The unloading at the unloading place ends a direct load
// at the order's delivery stop, as a trip delivered to the customer does; a groupage shipment reaches a
// depot under the warehouse codes instead.
const GROUPS: readonly (readonly [Stage, readonly string[]])[] = [
  ['registered', ['L-ORC', 'L-OPL', 'RIN']],
  ['accepted', ['RIE', 'MCD', 'VCC', 'LOC', 'L-OLO']],
  ['in_transit', ['VRA', 'SRA', 'VPM', 'VPG', 'VAG', 'VPD', 'VAD', 'VPC', 'VPP', 'SIT', 'SPH', 'SAR', 'IDC', 'UNA', 'UNS']],
  ['customs', ['SDC']],
  ['out_for_delivery', ['SPC']],
  ['delivered', ['COR', 'RDD', 'CRI', 'CRR', 'UNC', 'VSC']],
  ['failed_attempt', ['NOC', 'CMG', 'CMR', 'SPN', 'SRU']],
  // An incident, damage, a shipment held in stock and notified, or cancelled.
  ['exception', ['ANM', 'DAN', 'GIC', '403', '139']],
];

const STAGES: ReadonlyMap<string, Stage> = new Map(GROUPS.flatMap(([stage, codes]) => codes.map(code => [code, stage] as const)));

/** The stage of an event code, or undefined for one that moves nothing or the page does not name. */
export function gruberStage(code: string | null): Stage | undefined {
  return code ? STAGES.get(code) : undefined;
}

const GAP_NOTES: readonly (readonly [note: string, codes: readonly string[]])[] = [
  ['A driver or trailer step of a load, around a loading or an unloading the other codes stage.', ['TST', 'LOA', 'LOS', 'TCO', 'TSC']],
  ['A placeholder name on the tracking page for an event it does not map.', ['VLE', 'VIN', 'TBD', 'Confirm']],
  ['A pickup trip started, failed or not done: the goods are still with the sender.', ['VRP', 'RIM', '523']],
  ['A warehouse step of a logistics order before its loading.', ['L-PST', 'L-PCP']],
  ['A delivery booked, not in delivery, back at the warehouse, or a held shipment with its instructions or closed: the stage before it stands.', ['131', 'SNC', '313', '404', '402']],
  ['The start of a third party\'s real-time tracking of the truck.', ['44S']],
];

const gaps: readonly IntentionalStatusGap[] = GAP_NOTES.flatMap(([note, codes]) => codes.map(code => ({ code, note })));

export const statusMap: CarrierStatusMap = {
  stage: code => gruberStage(code),
  gaps,
};
