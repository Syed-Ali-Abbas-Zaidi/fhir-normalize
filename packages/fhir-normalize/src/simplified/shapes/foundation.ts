import type { ResourceShape } from '../types';
import {
  annotation,
  concept,
  group,
  identifier,
  join,
  period,
  primitive,
  reference,
  statusDisplay,
  textOf,
} from './helpers';

/**
 * Foundation-section resources that clinical payloads carry often enough to
 * deserve a curated reading. Not an attempt at the whole section.
 */
export const FOUNDATION_SHAPE: Readonly<Record<string, ResourceShape>> = {
  DocumentReference: {
    fields: {
      identifier: identifier(),
      masterIdentifier: identifier(false),
      status: primitive(),
      docStatus: primitive(),
      type: concept(),
      category: concept(true),
      subject: reference(),
      date: primitive(),
      author: reference(true),
      authenticator: reference(),
      custodian: reference(),
      description: primitive(),
      securityLabel: concept(true),
      relatesTo: group({ code: primitive(), target: reference() }),
      content: group({ attachment: primitive(), format: concept() }),
      context: group(
        {
          encounter: reference(true),
          event: concept(true),
          period: period(),
          facilityType: concept(),
          practiceSetting: concept(),
          sourcePatientInfo: reference(),
        },
        false,
      ),
    },
    display: statusDisplay('type'),
  },

  Provenance: {
    fields: {
      target: reference(true),
      occurred: primitive(),
      recorded: primitive(),
      policy: primitive(true),
      location: reference(),
      reason: concept(true),
      activity: concept(),
      agent: group({ type: concept(), role: concept(true), who: reference() }),
      entity: group({ role: primitive(), what: reference() }),
    },
    display: (fields) => join(textOf(fields, 'activity'), textOf(fields, 'recorded')),
  },

  Binary: {
    fields: {
      contentType: primitive(),
      securityContext: reference(),
    },
    display: () => null,
  },

  Basic: {
    fields: {
      identifier: identifier(),
      code: concept(),
      subject: reference(),
      created: primitive(),
      author: reference(),
    },
    display: () => null,
  },

  Composition: {
    fields: {
      identifier: identifier(false),
      status: primitive(),
      type: concept(),
      category: concept(true),
      subject: reference(),
      encounter: reference(),
      date: primitive(),
      author: reference(true),
      title: primitive(),
      custodian: reference(),
      note: annotation(),
      section: group({
        title: primitive(),
        code: concept(),
        author: reference(true),
        focus: reference(),
        orderedBy: concept(),
        entry: reference(true),
        emptyReason: concept(),
      }),
    },
    display: statusDisplay('title'),
  },
};
