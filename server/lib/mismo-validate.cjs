'use strict';
/**
 * server/lib/mismo-validate.cjs
 *
 * Guards against the class of bug that made Arive silently drop whole
 * sections of a Jammie-generated file: MISMO 3.4 declares its containers
 * as xs:sequence, so child elements must appear in a specific order
 * (almost always alphabetical). A file can be perfectly well-formed XML,
 * contain every value, and still be rejected element-by-element by a
 * strict validator purely because the order is wrong.
 *
 * That failure mode is invisible without a check like this — the XML
 * parses, the data is there, and nothing errors. It only shows up as
 * blank fields in the receiving system.
 *
 * The canonical orders below were derived from a real Arive/DU MISMO 3.4
 * export (DU_MISMO_16786249.xml), not from the spec, so they reflect what
 * the actual receiving system emits and therefore expects.
 *
 * Usage:
 *   const { validateMismoOrdering } = require('./mismo-validate.cjs');
 *   const issues = validateMismoOrdering(xmlString);
 *   if (issues.length) console.warn(issues);
 *
 * Deliberately advisory, never throws: a false positive must not be able
 * to block a user's export. Callers decide what to do with the issues.
 */

const { XMLParser } = require('fast-xml-parser');

// Canonical child ordering per container. Elements not listed are ignored
// (they sort after known ones). Order here is authoritative.
const CANONICAL_ORDER = {
  MESSAGE: ['ABOUT_VERSIONS', 'DEAL_SETS'],
  DEAL: ['ASSETS', 'COLLATERALS', 'LIABILITIES', 'LOANS', 'PARTIES', 'RELATIONSHIPS'],
  LOAN: [
    'AMORTIZATION', 'CLOSING_INFORMATION', 'DOCUMENT_SPECIFIC_DATA_SETS',
    'HOUSING_EXPENSES', 'LOAN_DETAIL', 'LOAN_IDENTIFIERS',
    'ORIGINATION_SYSTEMS', 'REFINANCE', 'TERMS_OF_LOAN', 'EXTENSION',
  ],
  SUBJECT_PROPERTY: ['ADDRESS', 'LOCATION_IDENTIFIER', 'PROPERTY_DETAIL', 'PROPERTY_VALUATIONS', 'SALES_CONTRACTS'],
  PARTY: ['INDIVIDUAL', 'ADDRESSES', 'LANGUAGES', 'ROLES', 'TAXPAYER_IDENTIFIERS'],
  INDIVIDUAL: ['CONTACT_POINTS', 'NAME'],
  ROLE: ['BORROWER', 'ROLE_DETAIL'],
  BORROWER: [
    'BORROWER_DETAIL', 'COUNSELING', 'CURRENT_INCOME', 'DECLARATION',
    'EMPLOYERS', 'GOVERNMENT_MONITORING', 'HOUSING_EXPENSES',
    'MILITARY_SERVICES', 'RESIDENCES',
  ],
  DECLARATION_DETAIL: [
    'BankruptcyIndicator', 'CitizenshipResidencyType',
    'FHASecondaryResidenceIndicator', 'HomeownerPastThreeYearsType',
    'IntentToOccupyType', 'OutstandingJudgmentsIndicator',
    'PartyToLawsuitIndicator', 'PresentlyDelinquentIndicator',
    'PriorPropertyDeedInLieuConveyedIndicator',
    'PriorPropertyForeclosureCompletedIndicator',
    'PriorPropertyShortSaleCompletedIndicator',
    'PropertyProposedCleanEnergyLienIndicator',
    'UndisclosedBorrowedFundsIndicator', 'UndisclosedComakerOfNoteIndicator',
    'UndisclosedCreditApplicationIndicator',
    'UndisclosedMortgageApplicationIndicator', 'EXTENSION',
  ],
  GOVERNMENT_MONITORING: [
    'GOVERNMENT_MONITORING_DETAIL', 'HMDA_ETHNICITIES',
    'HMDA_ETHNICITY_ORIGINS', 'HMDA_RACES',
  ],
  GOVERNMENT_MONITORING_DETAIL: [
    'HMDAEthnicityCollectedBasedOnVisualObservationOrSurnameIndicator',
    'HMDAEthnicityRefusalIndicator',
    'HMDAGenderCollectedBasedOnVisualObservationOrNameIndicator',
    'HMDAGenderRefusalIndicator',
    'HMDARaceCollectedBasedOnVisualObservationOrSurnameIndicator',
    'HMDARaceRefusalIndicator', 'EXTENSION',
  ],
  EMPLOYER: ['LEGAL_ENTITY', 'ADDRESS', 'EMPLOYMENT'],
  ADDRESS: ['AddressLineText', 'AddressType', 'AddressUnitIdentifier', 'CityName', 'CountryCode', 'CountyName', 'PostalCode', 'StateCode'],
  RESIDENCE: ['ADDRESS', 'RESIDENCE_DETAIL'],
  OWNED_PROPERTY: ['OWNED_PROPERTY_DETAIL', 'PROPERTY'],
};

// Parser preserving document order so we can inspect sequence.
const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  preserveOrder: true,
  parseTagValue: false,
});

/**
 * Walks the parsed tree and reports any container whose children appear
 * out of canonical order.
 * @returns {Array<{container:string, expected:string[], found:string[], message:string}>}
 */
function validateMismoOrdering(xmlString) {
  const issues = [];
  let tree;
  try {
    tree = parser.parse(xmlString);
  } catch (e) {
    return [{ container: '(document)', expected: [], found: [], message: `XML could not be parsed: ${e.message}` }];
  }

  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === ':@' || key === '#text') continue;
        const children = node[key];
        if (!Array.isArray(children)) continue;

        const canonical = CANONICAL_ORDER[key];
        if (canonical) {
          // Child element names, in document order
          const found = children
            .map(ch => Object.keys(ch).find(k => k !== ':@' && k !== '#text'))
            .filter(Boolean)
            .filter(name => canonical.includes(name));
          const expected = canonical.filter(name => found.includes(name));
          if (found.join('|') !== expected.join('|')) {
            issues.push({
              container: key,
              expected,
              found,
              message: `<${key}> children are out of MISMO sequence order. `
                     + `Expected: ${expected.join(', ')}. Found: ${found.join(', ')}. `
                     + `A strict validator may silently drop the out-of-order elements.`,
            });
          }
        }
        walk(children);
      }
    }
  };

  walk(tree);
  return issues;
}

module.exports = { validateMismoOrdering, CANONICAL_ORDER };
