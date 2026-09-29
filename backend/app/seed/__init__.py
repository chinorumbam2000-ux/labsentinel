"""
Development seed of LabSentinel's synthetic capstone demonstration dataset.

    python -m app.seed           seed (idempotent)
    python -m app.seed.verify    compare the database with the frontend dataset

The data are synthetic capstone demonstration data exported from the React
prototype. FHIR ingestion is not yet implemented; this seed is the only way
data enters the database in Phase 2.
"""

from app.seed.dataset import DATASET_PATH, DemoDataset, load_dataset
from app.seed.seeder import SeedReport, seed_demo_dataset

__all__ = ["DATASET_PATH", "DemoDataset", "SeedReport", "load_dataset", "seed_demo_dataset"]
