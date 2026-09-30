"""
Secondary statistical surveillance (capstone prototype): EWMA today.

    persisted observations -> dynamic aggregation (app/surveillance) -> daily
    regional test volume and positivity -> EWMA per metric (ewma.py) ->
    statistical_signal rows (persistence.py) -> /api/statistics/ewma

EXPERIMENTAL STATISTICAL SURVEILLANCE. EWMA runs alongside the Composite
Outbreak Signal Score and never modifies it: the two are compared, never
combined. EWMA is an experimental statistical surveillance method in this
capstone and has not been validated for production epidemiological
decision-making.
"""
