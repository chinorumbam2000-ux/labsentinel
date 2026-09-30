# LabSentinel capstone evaluation report

> **These evaluations use synthetic scenarios and demonstrate technical behavior only. They do not establish clinical or epidemiological validation.**

Experimental capstone evaluation using synthetic scenarios. Reproduce with `python -m app.evaluation.run --all --repetitions 100 --seed 20260930` (from `backend/`).

## Design

- Calendar: 28 reference days from 2024-03-01, then 42 monitored days (2024-03-29 to 2024-05-09); outbreak onset 2024-04-19 (monitored day 21), lasting to the end.
- 100 realizations per scenario, base seed 20260930.
- Parameters: Application defaults: composite severity bands (detection at High); EWMA lambda 0.25, k 3; CUSUM k 0.5, h 5.
- Realization level: One simulated run of one scenario. Outbreak scenario: TP if the method alerts on any outbreak day, else FN. No-outbreak scenario: FP if it alerts on any monitored day, else TN.
- Day level: One monitored surveillance day: outbreak day in alert = TP, not in alert = FN; normal day in alert = FP, not = TN.
- Intervals: Wilson score interval, 95 % (z = 1.959964), for every proportion.
- ROC/AUC: Not reported: the detectors run at fixed operational thresholds, and ROC/AUC would require varying them. Threshold effects are shown in the separate sensitivity analyses instead.

Detection events (fixed before results were seen):

- **Composite Outbreak Signal**: First monitored date whose severity is High or Critical.
- **EWMA**: First monitored date whose overall EWMA state is STATISTICAL ALERT.
- **CUSUM**: First monitored date on which either metric's CUSUM has reached h.

## Scenarios and results

| # | Scenario | Ground truth | Composite | EWMA | CUSUM | Data Confidence (normal / outbreak) |
|---|---|---|---|---|---|---|
| 1 | No outbreak (control) | no outbreak | 21/100 runs with a false alert; false-alert days/100 0.524 | 26/100 runs with a false alert; false-alert days/100 1.786 | 23/100 runs with a false alert; false-alert days/100 4.524 | 95.01 / — |
| 2 | Sudden sharp outbreak | outbreak from onset | 100/100 detected; median delay 0.0; false-alert days/100 0.524 | 100/100 detected; median delay 0.0; false-alert days/100 1.714 | 100/100 detected; median delay 0.0; false-alert days/100 2.429 | 95.02 / 95.0 |
| 3 | Slow gradual outbreak | outbreak from onset | 58/100 detected; median delay 11.0; false-alert days/100 0.524 | 100/100 detected; median delay 8.0; false-alert days/100 1.714 | 100/100 detected; median delay 8.0; false-alert days/100 2.429 | 95.02 / 95.0 |
| 4 | Positivity-only rise | outbreak from onset | 82/100 detected; median delay 7.5; false-alert days/100 0.524 | 100/100 detected; median delay 4.0; false-alert days/100 1.714 | 100/100 detected; median delay 4.0; false-alert days/100 2.429 | 95.02 / 95.01 |
| 5 | Volume-only surge (no disease increase) | no outbreak | 51/100 runs with a false alert; false-alert days/100 1.429 | 100/100 runs with a false alert; false-alert days/100 44.786 | 100/100 runs with a false alert; false-alert days/100 45.0 | 95.01 / — |
| 6 | Single-facility local cluster | outbreak from onset | 37/100 detected; median delay 7; false-alert days/100 0.524 | 100/100 detected; median delay 5.0; false-alert days/100 1.714 | 100/100 detected; median delay 6.0; false-alert days/100 2.429 | 95.02 / 95.01 |
| 7 | Multi-facility regional spread | outbreak from onset | 90/100 detected; median delay 8.0; false-alert days/100 0.524 | 100/100 detected; median delay 5.0; false-alert days/100 1.714 | 100/100 detected; median delay 5.0; false-alert days/100 2.429 | 95.02 / 95.0 |
| 8 | Transient one-day spike (no outbreak) | no outbreak | 100/100 runs with a false alert; false-alert days/100 2.81 | 95/100 runs with a false alert; false-alert days/100 8.167 | 95/100 runs with a false alert; false-alert days/100 23.81 | 95.01 / — |
| 9 | Reporting gap / missing facility | outbreak from onset | 73/100 detected; median delay 6; false-alert days/100 0.524 | 100/100 detected; median delay 5.0; false-alert days/100 1.714 | 100/100 detected; median delay 5.0; false-alert days/100 2.429 | 95.02 / 93.81 |
| 10 | Delayed data | outbreak from onset | 93/100 detected; median delay 8; false-alert days/100 0.524 | 100/100 detected; median delay 5.0; false-alert days/100 1.714 | 100/100 detected; median delay 5.0; false-alert days/100 2.429 | 86.68 / 70.0 |
| 11 | Terminology quality problem | outbreak from onset | 89/100 detected; median delay 6; false-alert days/100 0.238 | 100/100 detected; median delay 5.0; false-alert days/100 1.714 | 100/100 detected; median delay 5.0; false-alert days/100 1.762 | 91.51 / 84.44 |
| 12 | Small-count environment (no outbreak) | no outbreak | 0/100 runs with a false alert; false-alert days/100 0.0 | 38/100 runs with a false alert; false-alert days/100 2.405 | 35/100 runs with a false alert; false-alert days/100 5.738 | 95.82 / — |
| 13 | Moderate regional outbreak (clean reference) | outbreak from onset | 88/100 detected; median delay 5.0; false-alert days/100 0.524 | 100/100 detected; median delay 4.0; false-alert days/100 1.714 | 100/100 detected; median delay 4.0; false-alert days/100 2.429 | 95.02 / 95.0 |
| 101 | Coverage: 2 of 3 facilities reporting | outbreak from onset | 97/100 detected; median delay 4; false-alert days/100 0.238 | 100/100 detected; median delay 4.5; false-alert days/100 1.238 | 100/100 detected; median delay 4.0; false-alert days/100 1.524 | 93.35 / 95.0 |
| 102 | Coverage: 1 of 3 facilities reporting | outbreak from onset | 100/100 detected; median delay 3.0; false-alert days/100 0.238 | 100/100 detected; median delay 4.5; false-alert days/100 1.81 | 100/100 detected; median delay 4.0; false-alert days/100 2.714 | 91.7 / 95.01 |

## Aggregate metrics

Pooled over the 13 primary scenarios (1300 realizations).

| Metric | Composite | EWMA | CUSUM |
|---|---|---|---|
| Sensitivity (realizations) | 710/900 = 78.9% (95% CI 76.1-81.4) | 900/900 = 100.0% (95% CI 99.6-100.0) | 900/900 = 100.0% (95% CI 99.6-100.0) |
| Specificity (realizations) | 228/400 = 57.0% (95% CI 52.1-61.8) | 141/400 = 35.2% (95% CI 30.7-40.1) | 147/400 = 36.8% (95% CI 32.2-41.6) |
| Precision (realizations) | 710/882 = 80.5% (95% CI 77.8-83.0) | 900/1159 = 77.6% (95% CI 75.2-80.0) | 900/1153 = 78.1% (95% CI 75.6-80.3) |
| False-positive rate (realizations) | 172/400 = 43.0% (95% CI 38.2-47.9) | 259/400 = 64.8% (95% CI 60.0-69.3) | 253/400 = 63.2% (95% CI 58.4-67.8) |
| Sensitivity (days) | 1595/18900 = 8.4% (95% CI 8.1-8.8) | 14734/18900 = 78.0% (95% CI 77.4-78.5) | 14958/18900 = 79.1% (95% CI 78.6-79.7) |
| Specificity (days) | 35407/35700 = 99.2% (95% CI 99.1-99.3) | 32976/35700 = 92.4% (95% CI 92.1-92.6) | 31934/35700 = 89.5% (95% CI 89.1-89.8) |
| Detection delay (days) | median 6.0, mean 6.369, IQR 3.0-9.0, range 0-20 (n=710) | median 5.0, mean 4.456, IQR 3.0-6.0, range 0-15 (n=900) | median 5.0, mean 4.391, IQR 3.0-6.0, range 0-15 (n=900) |
| False-alert days per 100 normal days | 0.821 | 7.63 | 10.549 |
| False-alert episodes | 289 | 579 | 512 |
| Normal-day state transitions | 558 | 1020 | 833 |

### Confusion matrices

**Realization level**

| Detector | TP | FP | TN | FN |
|---|---|---|---|---|
| Composite Outbreak Signal | 710 | 172 | 228 | 190 |
| EWMA | 900 | 259 | 141 | 0 |
| CUSUM | 900 | 253 | 147 | 0 |

**Day level**

| Detector | TP | FP | TN | FN |
|---|---|---|---|---|
| Composite Outbreak Signal | 1595 | 293 | 35407 | 17305 |
| EWMA | 14734 | 2724 | 32976 | 4166 |
| CUSUM | 14958 | 3766 | 31934 | 3942 |

## Lead / lag (days, positive = first method earlier)

| Scenario | Composite vs EWMA | Composite vs CUSUM | EWMA vs CUSUM |
|---|---|---|---|
| Sudden sharp outbreak | median 0.0 (composite first 19, ewma first 0, same day 81, n=100) | median 0.0 (composite first 21, cusum first 0, same day 79, n=100) | median 0.0 (ewma first 5, cusum first 3, same day 92, n=100) |
| Slow gradual outbreak | median -2.0 (composite first 14, ewma first 35, same day 9, n=58) | median -2.0 (composite first 16, cusum first 33, same day 9, n=58) | median 0.0 (ewma first 19, cusum first 20, same day 61, n=100) |
| Positivity-only rise | median -3.0 (composite first 8, ewma first 58, same day 16, n=82) | median -3.0 (composite first 10, cusum first 59, same day 13, n=82) | median 0.0 (ewma first 14, cusum first 11, same day 75, n=100) |
| Single-facility local cluster | median -1 (composite first 8, ewma first 21, same day 8, n=37) | median -1 (composite first 12, cusum first 23, same day 2, n=37) | median 0.0 (ewma first 28, cusum first 17, same day 55, n=100) |
| Multi-facility regional spread | median -3.0 (composite first 12, ewma first 59, same day 19, n=90) | median -2.0 (composite first 13, cusum first 60, same day 17, n=90) | median 0.0 (ewma first 20, cusum first 10, same day 70, n=100) |
| Reporting gap / missing facility | median -2 (composite first 6, ewma first 44, same day 23, n=73) | median -2 (composite first 9, cusum first 45, same day 19, n=73) | median 0.0 (ewma first 20, cusum first 14, same day 66, n=100) |
| Delayed data | median -3 (composite first 8, ewma first 76, same day 9, n=93) | median -2 (composite first 10, cusum first 77, same day 6, n=93) | median 0.0 (ewma first 19, cusum first 11, same day 70, n=100) |
| Terminology quality problem | median -1 (composite first 23, ewma first 48, same day 18, n=89) | median -1 (composite first 27, cusum first 49, same day 13, n=89) | median 0.0 (ewma first 16, cusum first 13, same day 71, n=100) |
| Moderate regional outbreak (clean reference) | median -1.0 (composite first 19, ewma first 48, same day 21, n=88) | median -1.0 (composite first 18, cusum first 49, same day 21, n=88) | median 0.0 (ewma first 18, cusum first 13, same day 69, n=100) |
| Coverage: 2 of 3 facilities reporting | median 0 (composite first 38, ewma first 26, same day 33, n=97) | median 0 (composite first 46, cusum first 24, same day 27, n=97) | median 0.0 (ewma first 20, cusum first 11, same day 69, n=100) |
| Coverage: 1 of 3 facilities reporting | median 0.0 (composite first 43, ewma first 18, same day 39, n=100) | median 0.0 (composite first 45, cusum first 20, same day 35, n=100) | median 0.0 (ewma first 9, cusum first 19, same day 72, n=100) |

## Robustness to data-quality problems

| Scenario | Conditions | Composite | EWMA | CUSUM | Data Confidence normal / outbreak (min) | Mean outbreak composite score |
|---|---|---|---|---|---|---|
| S13-moderate | clean | 88/100, median delay 5.0 | 100/100, median delay 4.0 | 100/100, median delay 4.0 | 95.02 / 95.0 (95.0) | 36.29 |
| S09-reporting-gap | missing facility | 73/100, median delay 6 | 100/100, median delay 5.0 | 100/100, median delay 5.0 | 95.02 / 93.81 (90.0) | 32.8 |
| S10-delayed-data | delayed results | 93/100, median delay 8 | 100/100, median delay 5.0 | 100/100, median delay 5.0 | 86.68 / 70.0 (70.0) | 36.29 |
| S11-terminology | unmapped terminology, incomplete observations | 89/100, median delay 6 | 100/100, median delay 5.0 | 100/100, median delay 5.0 | 91.51 / 84.44 (79.0) | 36.41 |

## Facility coverage

| Scenario | Conditions | Composite | EWMA | CUSUM | Data Confidence normal / outbreak (min) | Mean outbreak composite score |
|---|---|---|---|---|---|---|
| S13-moderate | clean | 88/100, median delay 5.0 | 100/100, median delay 4.0 | 100/100, median delay 4.0 | 95.02 / 95.0 (95.0) | 36.29 |
| C2-coverage-2of3 | 2 of 3 facilities | 97/100, median delay 4 | 100/100, median delay 4.5 | 100/100, median delay 4.0 | 93.35 / 95.0 (95.0) | 34.86 |
| C1-coverage-1of3 | 1 of 3 facilities | 100/100, median delay 3.0 | 100/100, median delay 4.5 | 100/100, median delay 4.0 | 91.7 / 95.01 (95.0) | 33.27 |

## Secondary: parameter sensitivity (pooled, not persisted)

Secondary, explanatory only. Recomputed from each realization's daily series; not persisted; the defaults are unchanged.

| EWMA lambda | Detected | Median delay | Runs with false alert | False-alert days/100 |
|---|---|---|---|---|
| 0.15 | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 237/400 = 59.2% (95% CI 54.4-64.0) | 7.843 |
| 0.2 | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 249/400 = 62.3% (95% CI 57.4-66.9) | 7.65 |
| 0.25 (default) | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 259/400 = 64.8% (95% CI 60.0-69.3) | 7.63 |
| 0.3 | 900/900 = 100.0% (95% CI 99.6-100.0) | 4.0 | 261/400 = 65.2% (95% CI 60.5-69.8) | 7.541 |

| CUSUM k | h | Detected | Median delay | Runs with false alert | False-alert days/100 |
|---|---|---|---|---|---|
| 0.25 | 4.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 2.0 | 352/400 = 88.0% (95% CI 84.5-90.8) | 25.913 |
| 0.25 | 5.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 3.0 | 318/400 = 79.5% (95% CI 75.3-83.2) | 19.933 |
| 0.25 | 6.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 4.0 | 287/400 = 71.8% (95% CI 67.2-75.9) | 15.933 |
| 0.5 | 4.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 4.0 | 295/400 = 73.8% (95% CI 69.2-77.8) | 13.451 |
| 0.5 | 5.0 (default) | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 253/400 = 63.2% (95% CI 58.4-67.8) | 10.549 |
| 0.5 | 6.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 221/400 = 55.2% (95% CI 50.3-60.1) | 8.496 |
| 0.75 | 4.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 255/400 = 63.7% (95% CI 58.9-68.3) | 8.765 |
| 0.75 | 5.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 5.0 | 215/400 = 53.8% (95% CI 48.9-58.6) | 7.132 |
| 0.75 | 6.0 | 900/900 = 100.0% (95% CI 99.6-100.0) | 6.0 | 187/400 = 46.8% (95% CI 41.9-51.6) | 6.179 |

Composite cutoffs: Exploratory: which severity would count as detection. The application's severity bands are unchanged.

| Detect at | Detected | Median delay | Runs with false alert | False-alert days/100 |
|---|---|---|---|---|
| Watch | 900/900 = 100.0% (95% CI 99.6-100.0) | 0.0 | 400/400 = 100.0% (95% CI 99.1-100.0) | 53.471 |
| Moderate | 900/900 = 100.0% (95% CI 99.6-100.0) | 1.0 | 354/400 = 88.5% (95% CI 85.0-91.3) | 13.709 |
| High (application default) | 705/900 = 78.3% (95% CI 75.5-80.9) | 6 | 172/400 = 43.0% (95% CI 38.2-47.9) | 0.821 |
| Critical | 109/900 = 12.1% (95% CI 10.1-14.4) | 0 | 88/400 = 22.0% (95% CI 18.2-26.3) | 0.246 |

## CDC / WHO surveillance-evaluation attributes

| Attribute | Status here | How |
|---|---|---|
| Sensitivity | evaluated technically | Share of synthetic outbreak realizations (and outbreak days) each method detects. |
| Positive predictive value | evaluated technically, design-dependent | Precision over the designed mix of outbreak and no-outbreak scenarios; real-world PPV depends on real outbreak frequency and cannot be inferred. |
| Timeliness | evaluated technically | Detection delay from the known synthetic onset, including real-time replay with delayed results. |
| Data quality | evaluated technically | Missing facility, delayed results, unmapped terminology and incomplete records, with Data Confidence alongside. |
| Stability | evaluated technically | Alert-state transitions, false-alert episodes and share of normal days in alert. |
| Flexibility | partly (design only) | Configurable parameters and syndrome-agnostic engine; not exercised on other syndromes. |
| Simplicity | described, not measured | Each method's explanation is shown in plain language; no user study. |
| Representativeness | cannot be established | Synthetic facilities and populations; no real population denominator. |
| Acceptability | cannot be established | No real users, workflow or public-health partners. |
| Usefulness | cannot be established | No real public-health action was informed by these signals. |

## Threats to validity

- Synthetic scenarios may not reflect real outbreaks: shapes, speeds and sizes were designed, not observed.
- Detector parameters (composite bands, EWMA lambda/k, CUSUM k/h) are illustrative and were not clinically validated.
- Only one respiratory syndrome is evaluated.
- Facility and geographic structure is simplified: three fictional facilities, three areas.
- Test-seeking behavior is synthetic (Poisson volumes, Binomial positivity); real testing has weekday, holiday and policy effects.
- There is no real population denominator.
- There is no seasonal structure: every scenario starts from a flat baseline.
- No real workflow or acceptability evaluation was done.
- There is no external epidemiological gold standard: ground truth is the scenario design itself.
- Realization-level precision depends on the designed mix of outbreak and no-outbreak scenarios.
- Outbreaks last to the end of each series; recovery behavior after an outbreak is not evaluated.

> **These evaluations use synthetic scenarios and demonstrate technical behavior only. They do not establish clinical or epidemiological validation.** No method is declared best: the tables show tradeoffs.
