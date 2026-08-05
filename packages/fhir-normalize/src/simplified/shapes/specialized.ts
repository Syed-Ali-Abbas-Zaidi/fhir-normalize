import type { ResourceShape } from '../types';
import {
  annotation,
  authored,
  canonical,
  choice,
  concept,
  contact,
  group,
  identifier,
  join,
  nestedTextOf,
  period,
  primitive,
  quantity,
  range,
  reference,
  reviewed,
  statusDisplay,
  textOf,
} from './helpers';

/**
 * Every resource in the Specialized section of the FHIR resource list —
 * Public Health & Research, Definitional Artifacts, Evidence-Based Medicine,
 * Quality Reporting & Testing, and Medication Definition.
 *
 * `DeviceDefinition` and `ExampleScenario` are listed in this section by the
 * current build but already have shapes under Base and Foundation, so they are
 * not repeated here.
 *
 * The R4 `MedicinalProduct*` and `Substance*` families are deliberately absent.
 * R5 replaced them wholesale with the `*Definition` resources covered below,
 * and declaring both sets would double a large, rarely-used surface for a
 * modelling approach the spec has already abandoned. They still parse, and
 * still get their choice elements resolved — they just have no curated field
 * ordering.
 */
export const SPECIALIZED_SHAPE: Readonly<Record<string, ResourceShape>> = {
  // --------------------------------------------- Public Health & Research ----
  ResearchStudy: {
    fields: {
      identifier: identifier(),
      title: primitive(),
      protocol: reference(true),
      status: primitive(),
      primaryPurposeType: concept(),
      phase: concept(),
      category: concept(true),
      focus: concept(true),
      condition: concept(true),
      contact: contact(),
      keyword: concept(true),
      location: concept(true),
      description: primitive(),
      enrollment: reference(true),
      period: period(),
      sponsor: reference(),
      principalInvestigator: reference(),
      site: reference(true),
      reasonStopped: concept(),
      note: annotation(),
      arm: group({ name: primitive(), type: concept(), description: primitive() }),
      objective: group({ name: primitive(), type: concept() }),
    },
    display: statusDisplay('title'),
  },

  ResearchSubject: {
    fields: {
      identifier: identifier(),
      status: primitive(),
      period: period(),
      study: reference(),
      individual: reference(),
      subject: reference(),
      assignedArm: primitive(),
      actualArm: primitive(),
      consent: reference(),
    },
    display: (fields) => join(textOf(fields, 'status'), textOf(fields, 'actualArm')),
  },

  // ---------------------------------------------- Definitional Artifacts ----
  ActivityDefinition: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      subtitle: primitive(),
      subject: choice(),
      usage: primitive(),
      kind: primitive(),
      profile: primitive(),
      code: concept(),
      intent: primitive(),
      priority: primitive(),
      doNotPerform: primitive(),
      timing: choice(),
      location: reference(),
      product: choice(),
      quantity: quantity(),
      bodySite: concept(true),
      specimenRequirement: reference(true),
      observationRequirement: reference(true),
      transform: primitive(),
      library: primitive(true),
      participant: group({ type: primitive(), role: concept() }),
      dosage: group({ text: primitive(), route: concept(), site: concept() }),
    },
    display: statusDisplay('title'),
  },

  EventDefinition: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      subtitle: primitive(),
      subject: choice(),
      usage: primitive(),
      trigger: group({ type: primitive(), name: primitive() }),
    },
    display: statusDisplay('title'),
  },

  ObservationDefinition: {
    fields: {
      identifier: identifier(),
      category: concept(true),
      code: concept(),
      permittedDataType: primitive(true),
      multipleResultsAllowed: primitive(),
      method: concept(),
      preferredReportName: primitive(),
      validCodedValueSet: reference(),
      normalCodedValueSet: reference(),
      abnormalCodedValueSet: reference(),
      criticalCodedValueSet: reference(),
      quantitativeDetails: group(
        { customaryUnit: concept(), unit: concept(), decimalPrecision: primitive() },
        false,
      ),
      qualifiedInterval: group({
        category: primitive(),
        range: range(),
        context: concept(),
        gender: primitive(),
        age: range(),
      }),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'preferredReportName')),
  },

  PlanDefinition: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      subtitle: primitive(),
      type: concept(),
      subject: choice(),
      usage: primitive(),
      library: primitive(true),
      goal: group({
        category: concept(),
        description: concept(),
        priority: concept(),
        start: concept(),
      }),
      action: group({
        prefix: primitive(),
        title: primitive(),
        description: primitive(),
        code: concept(true),
        priority: primitive(),
        type: concept(),
      }),
    },
    display: statusDisplay('title'),
  },

  Questionnaire: {
    fields: {
      ...canonical,
      ...reviewed,
      derivedFrom: primitive(true),
      subjectType: primitive(true),
      code: concept(true),
      item: group({
        linkId: primitive(),
        definition: primitive(),
        code: concept(true),
        prefix: primitive(),
        text: primitive(),
        type: primitive(),
        required: primitive(),
        repeats: primitive(),
        readOnly: primitive(),
        maxLength: primitive(),
      }),
    },
    display: statusDisplay('title'),
  },

  SpecimenDefinition: {
    fields: {
      identifier: identifier(false),
      typeCollected: concept(),
      patientPreparation: concept(true),
      timeAspect: primitive(),
      collection: concept(true),
      typeTested: group({
        isDerived: primitive(),
        type: concept(),
        preference: primitive(),
        requirement: primitive(),
        retentionTime: quantity(),
        rejectionCriterion: concept(true),
      }),
    },
    display: (fields) => textOf(fields, 'typeCollected'),
  },

  /** R5 and later. */
  ActorDefinition: {
    fields: {
      ...canonical,
      type: primitive(),
      documentation: primitive(),
      reference: primitive(true),
      capabilities: primitive(),
      derivedFrom: primitive(true),
    },
    display: statusDisplay('title'),
  },

  /** R5 and later. */
  Requirements: {
    fields: {
      ...canonical,
      derivedFrom: primitive(true),
      reference: primitive(true),
      actor: primitive(true),
      statement: group({
        key: primitive(),
        label: primitive(),
        conformance: primitive(true),
        requirement: primitive(),
      }),
    },
    display: statusDisplay('title'),
  },

  // ------------------------------------------------ Evidence-Based Medicine ----
  /** R5 and later. */
  ArtifactAssessment: {
    fields: {
      identifier: identifier(),
      title: primitive(),
      citeAs: choice(),
      date: primitive(),
      copyright: primitive(),
      approvalDate: primitive(),
      lastReviewDate: primitive(),
      artifact: choice(),
      workflowStatus: primitive(),
      disposition: primitive(),
      content: group({
        informationType: primitive(),
        summary: primitive(),
        type: concept(),
        classifier: concept(true),
        freeToShare: primitive(),
      }),
    },
    display: (fields) => join(textOf(fields, 'title'), textOf(fields, 'workflowStatus')),
  },

  Evidence: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      citeAs: choice(),
      assertion: primitive(),
      note: annotation(),
      synthesisType: concept(),
      studyType: concept(),
      variableDefinition: group({
        description: primitive(),
        variableRole: concept(),
        observed: reference(),
        intended: reference(),
      }),
      statistic: group({
        description: primitive(),
        statisticType: concept(),
        quantity: quantity(),
        numberOfEvents: primitive(),
        sampleSize: primitive(),
      }),
      certainty: group({ description: primitive(), type: concept(), rating: concept() }),
    },
    display: statusDisplay('title'),
  },

  EvidenceVariable: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      shortTitle: primitive(),
      subtitle: primitive(),
      note: annotation(),
      actual: primitive(),
      handling: primitive(),
      category: group({ name: primitive(), value: choice() }),
      characteristic: group({
        description: primitive(),
        definition: choice(),
        exclude: primitive(),
        timeFromStart: primitive(),
        groupMeasure: primitive(),
      }),
    },
    display: statusDisplay('title'),
  },

  // ------------------------------------------ Quality Reporting & Testing ----
  Measure: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      subtitle: primitive(),
      subject: choice(),
      usage: primitive(),
      library: primitive(true),
      disclaimer: primitive(),
      scoring: concept(),
      compositeScoring: concept(),
      type: concept(true),
      riskAdjustment: primitive(),
      rateAggregation: primitive(),
      rationale: primitive(),
      clinicalRecommendationStatement: primitive(),
      improvementNotation: concept(),
      definition: primitive(true),
      guidance: primitive(),
      group: group({ code: concept(), description: primitive() }),
      supplementalData: group({ code: concept(), usage: concept(true), description: primitive() }),
    },
    display: statusDisplay('title'),
  },

  MeasureReport: {
    fields: {
      identifier: identifier(),
      status: primitive(),
      type: primitive(),
      measure: primitive(),
      subject: reference(),
      date: primitive(),
      reporter: reference(),
      period: period(),
      improvementNotation: concept(),
      evaluatedResource: reference(true),
      group: group({
        code: concept(),
        measureScore: quantity(),
        stratifier: group({ code: concept(true) }),
      }),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'status')),
  },

  // ------------------------------------------------- Medication Definition ----
  /** The R5 medication-definition family. R4's MedicinalProduct* is superseded. */
  MedicinalProductDefinition: {
    fields: {
      identifier: identifier(),
      type: concept(),
      domain: concept(),
      version: primitive(),
      status: concept(),
      statusDate: primitive(),
      description: primitive(),
      combinedPharmaceuticalDoseForm: concept(),
      route: concept(true),
      indication: primitive(),
      legalStatusOfSupply: concept(),
      additionalMonitoringIndicator: concept(),
      specialMeasures: concept(true),
      pediatricUseIndicator: concept(),
      classification: concept(true),
      packagedMedicinalProduct: concept(true),
      impurity: reference(true),
      attachedDocument: reference(true),
      masterFile: reference(true),
      clinicalTrial: reference(true),
      code: concept(true),
      name: group({ productName: primitive(), type: concept() }),
      contact: group({ type: concept(), contact: reference() }),
      operation: group({ type: concept(), effectiveDate: period() }),
      characteristic: group({ type: concept(), value: choice() }),
    },
    display: (fields) =>
      join(nestedTextOf(fields, 'name', 'productName'), textOf(fields, 'status')),
  },

  PackagedProductDefinition: {
    fields: {
      identifier: identifier(),
      name: primitive(),
      type: concept(),
      packageFor: reference(true),
      status: concept(),
      statusDate: primitive(),
      description: primitive(),
      legalStatusOfSupply: group({ code: concept(), jurisdiction: concept() }),
      copackagedIndicator: primitive(),
      manufacturer: reference(true),
      characteristic: group({ type: concept(), value: choice() }),
    },
    display: (fields) => join(textOf(fields, 'name'), textOf(fields, 'status')),
  },

  AdministrableProductDefinition: {
    fields: {
      identifier: identifier(),
      status: primitive(),
      formOf: reference(true),
      administrableDoseForm: concept(),
      unitOfPresentation: concept(),
      producedFrom: reference(true),
      ingredient: concept(true),
      device: reference(),
      property: group({ type: concept(), value: choice(), status: concept() }),
      routeOfAdministration: group({
        code: concept(),
        firstDose: quantity(),
        maxSingleDose: quantity(),
      }),
    },
    display: statusDisplay('administrableDoseForm'),
  },

  ManufacturedItemDefinition: {
    fields: {
      identifier: identifier(),
      status: primitive(),
      name: primitive(),
      manufacturedDoseForm: concept(),
      unitOfPresentation: concept(),
      manufacturer: reference(true),
      ingredient: concept(true),
      property: group({ type: concept(), value: choice() }),
    },
    display: statusDisplay('manufacturedDoseForm'),
  },

  Ingredient: {
    fields: {
      identifier: identifier(false),
      status: primitive(),
      for: reference(true),
      role: concept(),
      function: concept(true),
      group: concept(),
      allergenicIndicator: primitive(),
      manufacturer: group({ role: primitive(), manufacturer: reference() }),
      substance: group({ code: concept() }, false),
    },
    display: statusDisplay('role'),
  },

  ClinicalUseDefinition: {
    fields: {
      identifier: identifier(),
      type: primitive(),
      category: concept(true),
      subject: reference(true),
      status: concept(),
      population: reference(true),
      contraindication: group(
        { diseaseSymptomProcedure: concept(), comorbidity: concept(true) },
        false,
      ),
      indication: group({ diseaseSymptomProcedure: concept(), intendedEffect: concept() }, false),
      interaction: group({ type: concept(), effect: concept(), incidence: concept() }, false),
      undesirableEffect: group(
        {
          symptomConditionEffect: concept(),
          classification: concept(),
          frequencyOfOccurrence: concept(),
        },
        false,
      ),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'status')),
  },

  RegulatedAuthorization: {
    fields: {
      identifier: identifier(),
      subject: reference(true),
      type: concept(),
      description: primitive(),
      region: concept(true),
      status: concept(),
      statusDate: primitive(),
      validityPeriod: period(),
      indication: concept(),
      intendedUse: concept(),
      basis: concept(true),
      holder: reference(),
      regulator: reference(),
      case: group({ identifier: identifier(false), type: concept(), status: concept() }, false),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'status')),
  },

  SubstanceDefinition: {
    fields: {
      identifier: identifier(),
      version: primitive(),
      status: concept(),
      classification: concept(true),
      domain: concept(),
      grade: concept(true),
      description: primitive(),
      informationSource: reference(true),
      note: annotation(),
      manufacturer: reference(true),
      supplier: reference(true),
      moiety: group({ role: concept(), name: primitive(), amount: choice() }),
      property: group({ type: concept(), value: choice() }),
      name: group({ name: primitive(), type: concept(), preferred: primitive() }),
      relationship: group({ type: concept(), isDefining: primitive() }),
    },
    display: (fields) => join(nestedTextOf(fields, 'name', 'name'), textOf(fields, 'status')),
  },

  // -------------------------------------------- R4 members not in the build ----
  TestScript: {
    fields: {
      ...canonical,
      origin: group({ index: primitive(), profile: concept() }),
      destination: group({ index: primitive(), profile: concept() }),
      fixture: group({ autocreate: primitive(), autodelete: primitive(), resource: reference() }),
      profile: reference(true),
      variable: group({ name: primitive(), defaultValue: primitive(), path: primitive() }),
    },
    display: statusDisplay('title'),
  },

  TestReport: {
    fields: {
      identifier: identifier(false),
      name: primitive(),
      status: primitive(),
      testScript: reference(),
      result: primitive(),
      score: primitive(),
      tester: primitive(),
      issued: primitive(),
      participant: group({ type: primitive(), uri: primitive(), display: primitive() }),
    },
    display: (fields) => join(textOf(fields, 'name'), textOf(fields, 'result')),
  },

  ResearchDefinition: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      shortTitle: primitive(),
      subtitle: primitive(),
      subject: choice(),
      comment: primitive(true),
      usage: primitive(),
      library: primitive(true),
      population: reference(),
      exposure: reference(),
      exposureAlternative: reference(),
      outcome: reference(),
    },
    display: statusDisplay('title'),
  },

  ResearchElementDefinition: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      shortTitle: primitive(),
      subtitle: primitive(),
      subject: choice(),
      comment: primitive(true),
      usage: primitive(),
      library: primitive(true),
      type: primitive(),
      variableType: primitive(),
      characteristic: group({
        definition: choice(),
        exclude: primitive(),
        unitOfMeasure: concept(),
      }),
    },
    display: statusDisplay('title'),
  },

  EffectEvidenceSynthesis: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      note: annotation(),
      synthesisType: concept(),
      studyType: concept(),
      population: reference(),
      exposure: reference(),
      exposureAlternative: reference(),
      outcome: reference(),
      sampleSize: group(
        {
          description: primitive(),
          numberOfStudies: primitive(),
          numberOfParticipants: primitive(),
        },
        false,
      ),
      effectEstimate: group({ description: primitive(), type: concept(), value: primitive() }),
      certainty: group({ rating: concept(true) }),
    },
    display: statusDisplay('title'),
  },

  RiskEvidenceSynthesis: {
    fields: {
      ...canonical,
      ...reviewed,
      ...authored,
      note: annotation(),
      synthesisType: concept(),
      studyType: concept(),
      population: reference(),
      exposure: reference(),
      outcome: reference(),
      sampleSize: group(
        {
          description: primitive(),
          numberOfStudies: primitive(),
          numberOfParticipants: primitive(),
        },
        false,
      ),
      riskEstimate: group(
        { description: primitive(), type: concept(), value: primitive(), unitOfMeasure: concept() },
        false,
      ),
      certainty: group({ rating: concept(true) }),
    },
    display: statusDisplay('title'),
  },
};
