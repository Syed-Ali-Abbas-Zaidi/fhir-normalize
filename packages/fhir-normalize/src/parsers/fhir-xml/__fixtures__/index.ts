export const patientXml = `<Patient xmlns="http://hl7.org/fhir">
  <id value="example-xml"/>
  <name>
    <use value="official"/>
    <family value="Ahmed"/>
    <given value="Sara"/>
  </name>
  <gender value="female"/>
  <birthDate value="1991-11-03"/>
  <active value="true"/>
</Patient>`;

/** Two `given` elements, so the XML itself proves the field repeats. */
export const patientWithTwoGivenNamesXml = `<Patient xmlns="http://hl7.org/fhir">
  <name>
    <family value="Ahmed"/>
    <given value="Sara"/>
    <given value="Jane"/>
  </name>
</Patient>`;

/** Postal codes must survive as strings — 02134 is not the number 2134. */
export const patientWithLeadingZeroXml = `<Patient xmlns="http://hl7.org/fhir">
  <address>
    <line value="1 Main St"/>
    <postalCode value="02134"/>
  </address>
</Patient>`;

export const observationXml = `<Observation xmlns="http://hl7.org/fhir">
  <id value="obs-weight"/>
  <status value="final"/>
  <code>
    <text value="Body Weight"/>
  </code>
  <subject>
    <reference value="Patient/example-1"/>
  </subject>
  <valueQuantity>
    <value value="74.5"/>
    <unit value="kg"/>
  </valueQuantity>
</Observation>`;

/** The structural quirk: XML nests the resource one level deeper than JSON. */
export const bundleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Bundle xmlns="http://hl7.org/fhir">
  <type value="collection"/>
  <total value="2"/>
  <entry>
    <resource>
      <Patient><id value="p1"/></Patient>
    </resource>
  </entry>
  <entry>
    <resource>
      <Observation><id value="o1"/><status value="final"/></Observation>
    </resource>
  </entry>
</Bundle>`;

/** A single entry, which XML cannot distinguish from a non-repeating field. */
export const singleEntryBundleXml = `<Bundle xmlns="http://hl7.org/fhir">
  <type value="searchset"/>
  <entry>
    <resource>
      <Patient><id value="only"/></Patient>
    </resource>
  </entry>
</Bundle>`;

export const narrativeXml = `<Patient xmlns="http://hl7.org/fhir">
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml"><p>Sara <b>Ahmed</b></p></div>
  </text>
</Patient>`;

export const extensionXml = `<Patient xmlns="http://hl7.org/fhir">
  <extension url="http://example.org/fhir/StructureDefinition/age">
    <valueInteger value="42"/>
  </extension>
</Patient>`;

export const containedXml = `<Observation xmlns="http://hl7.org/fhir">
  <contained>
    <Patient><id value="inline"/></Patient>
  </contained>
  <status value="final"/>
</Observation>`;

export const malformedXml = '<Patient><id value="x"/></Patien>';

export const emptyResourceContainerXml = `<Bundle xmlns="http://hl7.org/fhir">
  <type value="collection"/>
  <entry><resource></resource></entry>
</Bundle>`;
