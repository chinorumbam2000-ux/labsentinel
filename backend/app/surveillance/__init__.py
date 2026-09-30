"""
Dynamic surveillance engine (capstone prototype).

    persisted LabObservation rows
      -> aggregator   daily counts per facility (eligibility rules)
      -> baseline     rolling historical mean of prior days
      -> engine       facility rule, geography, persistence, components
      -> scorer       Composite Outbreak Signal Score and Data Confidence
      -> persistence  idempotent dynamic SurveillanceSignal + audit events

Dynamic signals are stored with mode='dynamic' and never mixed with the
frozen five-day classroom demonstration (mode='demo').

The Dynamic Surveillance Engine is a capstone prototype model and is not
epidemiologically validated for production public-health decision-making.
"""

DISCLAIMER = (
    "The Dynamic Surveillance Engine is a capstone prototype model and is not "
    "epidemiologically validated for production public-health decision-making."
)
