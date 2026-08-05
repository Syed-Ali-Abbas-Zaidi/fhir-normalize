import type { ResourceShape } from '../types';
import {
  canonical,
  choice,
  concept,
  contact,
  group,
  identifier,
  join,
  period,
  primitive,
  reference,
  reviewed,
  statusDisplay,
  textOf,
  without,
} from './helpers';

/**
 * Every resource in the Foundation section of the FHIR resource list —
 * Conformance, Terminology, Security, Documents, and Other.
 *
 * R4 element names lead. Conformance and terminology resources are deep and
 * largely definitional, so the shapes declare the metadata that identifies an
 * artefact rather than the full grammar of what it defines: a
 * StructureDefinition's element tree and a ValueSet's expansion are data
 * structures in their own right, and flattening them would lose more than it
 * clarified. They are still read generically and reported in `unmapped`.
 */
export const FOUNDATION_SHAPE: Readonly<Record<string, ResourceShape>> = {
  // -------------------------------------------------------- Conformance ----
  CapabilityStatement: {
    fields: {
      ...without(canonical, 'identifier'),
      kind: primitive(),
      instantiates: primitive(true),
      imports: primitive(true),
      fhirVersion: primitive(),
      format: primitive(true),
      patchFormat: primitive(true),
      implementationGuide: primitive(true),
      software: group({ name: primitive(), version: primitive(), releaseDate: primitive() }, false),
      implementation: group(
        { description: primitive(), url: primitive(), custodian: reference() },
        false,
      ),
      rest: group({ mode: primitive(), documentation: primitive() }),
      messaging: group({
        endpoint: primitive(true),
        reliableCache: primitive(),
        documentation: primitive(),
        supportedMessage: primitive(true),
      }),
      document: group({ mode: primitive(), documentation: primitive(), profile: primitive() }),
    },
    display: statusDisplay('title'),
  },

  StructureDefinition: {
    fields: {
      ...canonical,
      keyword: concept(true),
      fhirVersion: primitive(),
      kind: primitive(),
      abstract: primitive(),
      contextInvariant: primitive(true),
      type: primitive(),
      baseDefinition: primitive(),
      derivation: primitive(),
      context: group({ type: primitive(), expression: primitive() }),
      mapping: group({ identity: primitive(), uri: primitive(), name: primitive() }),
      snapshot: group({ element: primitive(true) }, false),
      differential: group({ element: primitive(true) }, false),
    },
    display: statusDisplay('title'),
  },

  ImplementationGuide: {
    fields: {
      ...without(canonical, 'identifier', 'purpose'),
      packageId: primitive(),
      license: primitive(),
      fhirVersion: primitive(true),
      dependsOn: group({ uri: primitive(), packageId: primitive(), version: primitive() }),
      global: group({ type: primitive(), profile: primitive() }),
      definition: group(
        {
          grouping: primitive(true),
          resource: primitive(true),
          page: primitive(),
          parameter: primitive(true),
          template: primitive(true),
        },
        false,
      ),
      manifest: group(
        {
          rendering: primitive(),
          resource: primitive(true),
          page: primitive(true),
          image: primitive(true),
          other: primitive(true),
        },
        false,
      ),
    },
    display: statusDisplay('title'),
  },

  SearchParameter: {
    fields: {
      ...without(canonical, 'identifier', 'title', 'copyright'),
      derivedFrom: primitive(),
      code: primitive(),
      base: primitive(true),
      type: primitive(),
      expression: primitive(),
      xpath: primitive(),
      xpathUsage: primitive(),
      target: primitive(true),
      multipleOr: primitive(),
      multipleAnd: primitive(),
      comparator: primitive(true),
      modifier: primitive(true),
      chain: primitive(true),
      component: group({ definition: primitive(), expression: primitive() }),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'type')),
  },

  MessageDefinition: {
    fields: {
      ...canonical,
      replaces: primitive(true),
      base: primitive(),
      parent: primitive(true),
      event: choice(),
      category: primitive(),
      responseRequired: primitive(),
      focus: group({ code: primitive(), profile: primitive(), min: primitive(), max: primitive() }),
      allowedResponse: group({ message: primitive(), situation: primitive() }),
      graph: primitive(true),
    },
    display: statusDisplay('title'),
  },

  OperationDefinition: {
    fields: {
      ...without(canonical, 'identifier', 'copyright'),
      kind: primitive(),
      affectsState: primitive(),
      code: primitive(),
      comment: primitive(),
      base: primitive(),
      resource: primitive(true),
      system: primitive(),
      type: primitive(),
      instance: primitive(),
      inputProfile: primitive(),
      outputProfile: primitive(),
      parameter: group({
        name: primitive(),
        use: primitive(),
        min: primitive(),
        max: primitive(),
        documentation: primitive(),
        type: primitive(),
      }),
      overload: group({ parameterName: primitive(true), comment: primitive() }),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'status')),
  },

  CompartmentDefinition: {
    fields: {
      ...without(canonical, 'identifier', 'title', 'jurisdiction', 'copyright'),
      code: primitive(),
      search: primitive(),
      resource: group({ code: primitive(), param: primitive(true), documentation: primitive() }),
    },
    display: statusDisplay('code'),
  },

  // -------------------------------------------------------- Terminology ----
  CodeSystem: {
    fields: {
      ...canonical,
      caseSensitive: primitive(),
      valueSet: primitive(),
      hierarchyMeaning: primitive(),
      compositional: primitive(),
      versionNeeded: primitive(),
      content: primitive(),
      supplements: primitive(),
      count: primitive(),
      filter: group({ code: primitive(), operator: primitive(true), value: primitive() }),
      property: group({ code: primitive(), type: primitive(), description: primitive() }),
      concept: group({ code: primitive(), display: primitive(), definition: primitive() }),
    },
    display: (fields) =>
      join(textOf(fields, 'title') ?? textOf(fields, 'name'), textOf(fields, 'content')),
  },

  ValueSet: {
    fields: {
      ...canonical,
      immutable: primitive(),
      compose: group({ lockedDate: primitive(), inactive: primitive() }, false),
      expansion: group(
        { identifier: primitive(), timestamp: primitive(), total: primitive() },
        false,
      ),
    },
    display: statusDisplay('title'),
  },

  ConceptMap: {
    fields: {
      ...canonical,
      // R4 allows one identifier here, unlike most canonical resources.
      identifier: identifier(false),
      source: choice(),
      target: choice(),
      group: group({ source: primitive(), target: primitive() }),
    },
    display: statusDisplay('title'),
  },

  NamingSystem: {
    fields: {
      name: primitive(),
      status: primitive(),
      kind: primitive(),
      date: primitive(),
      publisher: primitive(),
      contact: contact(),
      responsible: primitive(),
      type: concept(),
      description: primitive(),
      jurisdiction: concept(true),
      usage: primitive(),
      useContext: group({ code: concept(), value: choice() }),
      uniqueId: group({
        type: primitive(),
        value: primitive(),
        preferred: primitive(),
        period: period(),
      }),
    },
    display: statusDisplay('name'),
  },

  TerminologyCapabilities: {
    fields: {
      ...without(canonical, 'identifier'),
      kind: primitive(),
      lockedDate: primitive(),
      codeSearch: primitive(),
      software: group({ name: primitive(), version: primitive() }, false),
      implementation: group({ description: primitive(), url: primitive() }, false),
      codeSystem: group({ uri: primitive(), subsumption: primitive() }),
      expansion: group(
        {
          hierarchical: primitive(),
          paging: primitive(),
          incomplete: primitive(),
          parameter: primitive(true),
          textFilter: primitive(),
        },
        false,
      ),
      validateCode: group({ translations: primitive() }, false),
      translation: group({ needsMap: primitive() }, false),
      closure: group({ translation: primitive() }, false),
    },
    display: statusDisplay('title'),
  },

  // ----------------------------------------------------------- Security ----
  Provenance: {
    fields: {
      target: reference(true),
      occurred: choice(),
      recorded: primitive(),
      policy: primitive(true),
      location: reference(),
      reason: concept(true),
      activity: concept(),
      agent: group({
        type: concept(),
        role: concept(true),
        who: reference(),
        onBehalfOf: reference(),
      }),
      entity: group({ role: primitive(), what: reference() }),
      signature: primitive(true),
    },
    display: (fields) => join(textOf(fields, 'activity'), textOf(fields, 'recorded')),
  },

  AuditEvent: {
    fields: {
      type: concept(),
      subtype: concept(true),
      action: primitive(),
      period: period(),
      recorded: primitive(),
      outcome: primitive(),
      outcomeDesc: primitive(),
      purposeOfEvent: concept(true),
      agent: group({
        type: concept(),
        role: concept(true),
        who: reference(),
        requestor: primitive(),
        altId: primitive(),
        name: primitive(),
      }),
      source: group({ site: primitive(), observer: reference(), type: concept(true) }, false),
      entity: group({ what: reference(), type: concept(), role: concept(), name: primitive() }),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'recorded')),
  },

  Consent: {
    fields: {
      identifier: identifier(),
      status: primitive(),
      scope: concept(),
      category: concept(true),
      patient: reference(),
      dateTime: primitive(),
      performer: reference(true),
      organization: reference(true),
      source: choice(),
      policyRule: concept(),
      policy: group({ authority: primitive(), uri: primitive() }),
      verification: group({
        verified: primitive(),
        verifiedWith: reference(),
        verificationDate: primitive(),
      }),
      provision: group({ type: primitive(), period: period(), action: concept(true) }, false),
    },
    display: statusDisplay('scope'),
  },

  // ---------------------------------------------------------- Documents ----
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
      confidentiality: primitive(),
      custodian: reference(),
      attester: group({ mode: primitive(), time: primitive(), party: reference() }),
      relatesTo: group({ code: primitive(), target: choice() }),
      event: group({ code: concept(true), period: period(), detail: reference(true) }),
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

  /**
   * R4 only — later releases fold this into `List`. Kept because R4 is the
   * canonical target, so an R4 bundle may well carry one.
   */
  DocumentManifest: {
    fields: {
      masterIdentifier: identifier(false),
      identifier: identifier(),
      status: primitive(),
      type: concept(),
      subject: reference(),
      created: primitive(),
      author: reference(true),
      recipient: reference(true),
      source: primitive(),
      description: primitive(),
      content: reference(true),
      related: group({ identifier: identifier(false), ref: reference() }),
    },
    display: statusDisplay('type'),
  },

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

  // -------------------------------------------------------------- Other ----
  Basic: {
    fields: {
      identifier: identifier(),
      code: concept(),
      subject: reference(),
      created: primitive(),
      author: reference(),
    },
    display: (fields) => textOf(fields, 'code'),
  },

  Binary: {
    fields: {
      contentType: primitive(),
      securityContext: reference(),
      data: primitive(),
    },
    display: (fields) => textOf(fields, 'contentType'),
  },

  Bundle: {
    fields: {
      identifier: identifier(false),
      type: primitive(),
      timestamp: primitive(),
      total: primitive(),
      link: group({ relation: primitive(), url: primitive() }),
      signature: group({ type: concept(true), when: primitive(), who: reference() }, false),
      entry: group({
        link: primitive(true),
        fullUrl: primitive(),
        resource: primitive(),
        search: primitive(),
        request: primitive(),
        response: primitive(),
      }),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'total')),
  },

  MessageHeader: {
    fields: {
      event: choice(),
      sender: reference(),
      enterer: reference(),
      author: reference(),
      responsible: reference(),
      reason: concept(),
      focus: reference(true),
      definition: primitive(),
      destination: group({ name: primitive(), target: reference(), endpoint: primitive() }),
      source: group({ name: primitive(), software: primitive(), endpoint: primitive() }, false),
      response: group({ identifier: primitive(), code: primitive(), details: reference() }, false),
    },
    display: (fields) => textOf(fields, 'event'),
  },

  OperationOutcome: {
    fields: {
      issue: group({
        severity: primitive(),
        code: primitive(),
        details: concept(),
        diagnostics: primitive(),
        location: primitive(true),
        expression: primitive(true),
      }),
    },
    display: () => null,
  },

  Parameters: {
    fields: {
      parameter: group({ name: primitive(), value: choice(), resource: reference() }),
    },
    display: () => null,
  },

  Subscription: {
    fields: {
      status: primitive(),
      contact: contact(),
      end: primitive(),
      reason: primitive(),
      criteria: primitive(),
      error: primitive(),
      channel: group(
        { type: primitive(), endpoint: primitive(), payload: primitive(), header: primitive(true) },
        false,
      ),
    },
    display: statusDisplay('reason'),
  },

  /** R5 and later. */
  SubscriptionStatus: {
    fields: {
      status: primitive(),
      type: primitive(),
      eventsSinceSubscriptionStart: primitive(),
      subscription: reference(),
      topic: primitive(),
      error: concept(true),
      notificationEvent: group({
        eventNumber: primitive(),
        timestamp: primitive(),
        focus: reference(),
      }),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'status')),
  },

  /** R5 and later. */
  SubscriptionTopic: {
    fields: {
      ...canonical,
      ...reviewed,
      derivedFrom: primitive(true),
      resourceTrigger: group({ description: primitive(), resource: primitive() }),
      eventTrigger: group({ description: primitive(), event: concept() }),
      canFilterBy: group({
        description: primitive(),
        resource: primitive(),
        filterParameter: primitive(),
      }),
    },
    display: statusDisplay('title'),
  },

  // -------------------------------------------- R4 members not in the build ----
  StructureMap: {
    fields: {
      ...canonical,
      structure: group({ url: primitive(), mode: primitive(), alias: primitive() }),
      import: primitive(true),
      group: group({ name: primitive(), typeMode: primitive(), documentation: primitive() }),
    },
    display: statusDisplay('title'),
  },

  GraphDefinition: {
    fields: {
      ...without(canonical, 'identifier', 'title', 'copyright'),
      start: primitive(),
      profile: primitive(),
      link: group({
        path: primitive(),
        description: primitive(),
        min: primitive(),
        max: primitive(),
      }),
    },
    display: statusDisplay('name'),
  },

  ExampleScenario: {
    fields: {
      ...without(canonical, 'title', 'description'),
      actor: group({ actorId: primitive(), type: primitive(), name: primitive() }),
      process: group({ title: primitive(), description: primitive() }),
      instance: group({
        resourceId: primitive(),
        resourceType: primitive(),
        name: primitive(),
        description: primitive(),
        version: primitive(true),
        containedInstance: primitive(true),
      }),
      workflow: primitive(true),
    },
    display: statusDisplay('name'),
  },

  Linkage: {
    fields: {
      active: primitive(),
      author: reference(),
      item: group({ type: primitive(), resource: reference() }),
    },
    display: () => null,
  },
};
