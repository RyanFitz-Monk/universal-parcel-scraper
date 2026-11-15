import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

/** One package operation: the label the tracker's timeline gives it, and its stage. */
interface VehoOperation {
  readonly wording: string;
  readonly stage?: Stage;
}

/** The label the tracker's timeline gives an operation it does not name. */
export const UPDATE_RECEIVED = 'Update received';

// The operations of the tracker's own script, with its timeline labels. Its error list marks
// the delay, the issues, the transit errors and the return to a Veho facility as problems.
const OPERATIONS: ReadonlyMap<string, VehoOperation> = new Map<string, VehoOperation>([
  ['created', { wording: 'Order info received', stage: 'registered' }],
  // The tracker names the sender in this label; `vehoEvent` does when the order gives one.
  ['pickedUpFromClient', { wording: "Departed the sender's facility", stage: 'accepted' }],
  ['PackageLoadedOntoFirstMileTransit', { wording: 'Package is in transit to a Veho Facility', stage: 'in_transit' }],
  ['droppedOffAtVeho', { wording: 'Arrived at Veho facility', stage: 'in_transit' }],
  ['PackageArrivedAtFacility', { wording: 'At Veho facility', stage: 'in_transit' }],
  ['PackageDepartedFromFacility', { wording: 'In transit', stage: 'in_transit' }],
  ['pickedUpFromVeho', { wording: 'Out for delivery', stage: 'out_for_delivery' }],
  ['delivered', { wording: 'Delivered', stage: 'delivered' }],
  // Without a reason the driver reached, the package waits for the next route.
  ['PackageHadDeliveryIssue', { wording: 'Delivery issue', stage: 'exception' }],
  ['PackageDelayed', { wording: 'Package delayed', stage: 'exception' }],
  ['misdelivered', { wording: 'Issue with order', stage: 'exception' }],
  ['discarded', { wording: 'Issue with order', stage: 'exception' }],
  ['notReceivedFromClient', { wording: 'Issue with order', stage: 'exception' }],
  ['cancelled', { wording: 'Issue with order', stage: 'exception' }],
  // "Your order is being returned to" its sender, after several attempts.
  ['returnedToClient', { wording: 'Issue with order', stage: 'returned' }],
  ['returned', { wording: UPDATE_RECEIVED, stage: 'returned' }],
  ['returnedToVeho', { wording: 'Returned to Veho facility', stage: 'exception' }],
  ['wrongFacilityByClient', { wording: 'Transit error', stage: 'exception' }],
  ['wrongFacilityByVeho', { wording: 'Transit error', stage: 'exception' }],
]);

// A collection from the recipient's address, which the guest tracker lists without a label of its own.
const PICKUPS = ['outForPickup', 'pickedUpFromConsumer', 'pickupSkipped', 'pickupFailed', 'pickupDroppedOffAtVeho',
  'pickupTransferredToExternalCarrier'] as const;

interface IssueReason {
  readonly reasons: readonly string[];
  readonly sentence: string;
  readonly stage: Stage;
}

// A delivery issue's reason, with the sentence the tracker shows for it. A reason the driver
// met at the address is a failed attempt; one of the route or the package is an exception.
const ISSUES: readonly IssueReason[] = [
  { reasons: ['WrongLocation', 'CantLocate - WrongLocation', 'CantLocate - MissingUnitNumber'],
    sentence: 'Driver could not locate delivery address.', stage: 'failed_attempt' },
  { reasons: ['AccessIssues - FrontGate', 'AccessIssues - BuildingDoorCode', 'AccessIssues - SchoolCampus',
    'NoAccessClosed - DoorCode', 'NoAccessClosed - LockedGate'],
  sentence: 'Driver could not access delivery address.', stage: 'failed_attempt' },
  { reasons: ['ClosedLocation - Mailroom', 'ClosedLocation - LeasingOffice', 'ClosedLocation - BusinessOffice',
    'ClosedLocation - BusinessStoreFront', 'NoAccessClosed - ClosedAfterHours'],
  sentence: 'Driver reported location closed when delivery was attempted', stage: 'failed_attempt' },
  { reasons: ['DamagedPackage'], sentence: 'Driver reported damage to the package', stage: 'exception' },
  { reasons: ['CustomerRefused'], sentence: 'Driver reported delivery was refused', stage: 'failed_attempt' },
  { reasons: ['MilitaryAddress', 'NoAccessClosed - MilitaryBase'], sentence: 'Unable to deliver to military base', stage: 'failed_attempt' },
  { reasons: ['UnsafeConditions - WeatherRelated', 'Weather'],
    sentence: 'Unforeseen weather is impacting the speed of your delivery', stage: 'exception' },
  { reasons: ['UnsafeConditions - DarkOrUnlitArea', 'UnsafeConditions - PetOnSite', 'Safety - AnimalPet', 'Safety - UnlitArea',
    'Safety - HostilePerson'], sentence: 'Driver reported issue during delivery', stage: 'failed_attempt' },
];
/** The sentence the tracker shows for any other reason, as a route that ran out of time. */
const OTHER_ISSUE = 'Unforeseen issue during delivery route';

const issueOf = new Map(ISSUES.flatMap(issue => issue.reasons.map(reason => [reason, issue] as const)));
const issueWording = (sentence: string): string => `Delivery issue: ${sentence}`;
const issueStages = new Map(ISSUES.map(issue => [normalizeStatusWording(issueWording(issue.sentence)), issue.stage]));

/** An operation's wording and stage, with the sender's name and an issue's reason where the reply gives them. */
export function vehoEvent(operation: string, message: string | null, sender: string): VehoOperation {
  const known = OPERATIONS.get(operation);
  if (operation === 'pickedUpFromClient' && sender) return { wording: `Departed ${sender} facility`, stage: known!.stage };
  if (operation === 'PackageHadDeliveryIssue' && message) {
    const issue = issueOf.get(message);
    return { wording: issueWording(issue?.sentence ?? OTHER_ISSUE), stage: issue?.stage ?? known!.stage };
  }
  return known ?? { wording: UPDATE_RECEIVED };
}

export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => (code === 'PackageHadDeliveryIssue' ? issueStages.get(wording) : undefined)
    ?? (code ? OPERATIONS.get(code)?.stage : undefined),
  gaps: PICKUPS.map(code => ({ code, note: 'A collection from the recipient, which the guest tracker lists as "Update received".' })),
};
