"""
FHIR R4 laboratory ingestion (development foundation).

    parser      JSON / Bundle -> individually validated FHIR resources
    validator   LabSentinel rules: status, laboratory category, LOINC, effective time
    terminology LOINC -> test -> syndrome; qualitative result codes
    resolver    facility, geography, specimen and DiagnosticReport context
    normalizer  result values, source identity, patient pseudonym

Persistence lives in app.services.fhir_ingestion; the HTTP route in app.api.fhir.
"""
